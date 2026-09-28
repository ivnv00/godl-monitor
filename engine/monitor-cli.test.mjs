import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAddressDecoder } from '@solana/addresses';
import { MAINNET_GENESIS } from './monitor.mjs';
import { ObservationStore } from './observation-store.mjs';
import { GODL_PROGRAM_ADDRESS, GODL_SOURCE_COMMIT } from './chain.mjs';
const run = promisify(execFile);
const cli = fileURLToPath(new URL('./monitor-cli.mjs', import.meta.url));
const wallet = getAddressDecoder().decode(Buffer.alloc(32, 7));
async function paths(t) {
  const root = await mkdtemp(join(tmpdir(), 'godl-cli-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return { db: join(root, 'observations.sqlite'), out: join(root, 'monitor.json') };
}
async function rpc(t, genesis = MAINNET_GENESIS) {
  const requests = [];
  const state = { fault: null };
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const part of req) chunks.push(part);
    const message = JSON.parse(Buffer.concat(chunks)); requests.push(message);
    if (state.fault) {
      res.writeHead(state.fault.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(state.fault.body)); return;
    }
    const result = message.method === 'getGenesisHash' ? genesis : { context: { slot: 12345 }, value: Array(8).fill(null) };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return { url: `http://127.0.0.1:${server.address().port}`, requests, state };
}
test('external snapshot import is rejected before creating trusted state', async t => {
  const p = await paths(t);
  await assert.rejects(run(process.execPath, [cli, 'import', '--db', p.db, '--out', p.out]), /Usage:/);
  await assert.rejects(access(p.db)); await assert.rejects(access(p.out));
});
test('RPC observe persists one finalized context; view reopens it without new network requests', async t => {
  const p = await paths(t), server = await rpc(t);
  await run(process.execPath, [cli, 'observe', '--wallet', wallet, '--rpc', server.url, '--db', p.db, '--out', p.out]);
  const observed = JSON.parse(await readFile(p.out, 'utf8'));
  assert.equal(observed.provenance.slot, '12345');
  assert.equal(observed.provenance.genesisHash, MAINNET_GENESIS);
  assert.equal(observed.balances.unrefinedGodl.status, 'unavailable');
  assert.equal(observed.capabilities.canExecute, false);
  assert.equal(server.requests[0].params[1].commitment, 'finalized');
  await run(process.execPath, [cli, 'view', '--wallet', wallet, '--db', p.db, '--out', p.out]);
  const cached = JSON.parse(await readFile(p.out, 'utf8'));
  assert.equal(cached.provenance.observedAt, observed.provenance.observedAt);
  assert.equal(cached.history.count, 1); assert.equal(server.requests.length, 2);
});
test('a non-mainnet RPC response cannot enter the monitor database', async t => {
  const p = await paths(t), server = await rpc(t, 'different-genesis');
  await assert.rejects(run(process.execPath, [cli, 'observe', '--wallet', wallet, '--rpc', server.url, '--db', p.db, '--out', p.out]), /mainnet/);
  const store = new ObservationStore(p.db);
  try { assert.equal(store.latest({ wallet, genesisHash: 'different-genesis' }), null); }
  finally { store.close(); }
  await assert.rejects(access(p.out));
});
test('optional period receipt is projected, while missing or invalid receipts preserve live observations', async t => {
  const p=await paths(t),server=await rpc(t),period=join(p.out,'..','period.json');
  const args=[cli,'observe','--wallet',wallet,'--rpc',server.url,'--db',p.db,'--out',p.out,'--period',period];
  await run(process.execPath,args);
  assert.equal(JSON.parse(await readFile(p.out,'utf8')).acquisitionPeriod,undefined);
  const receipt={schemaVersion:1,kind:'godl-period-cost',wallet,genesisHash:MAINNET_GENESIS,programAddress:GODL_PROGRAM_ADDRESS,sourceCommit:GODL_SOURCE_COMMIT,
    startSlot:'1',endSlot:'2',evidence:{closingSlot:'100',netUsdLamportMicro:'5000000000000000'},
    acquisitionPeriod:{status:'estimated',startedAt:'2000-01-01T00:00:00.000Z',throughAt:'2000-01-01T01:00:00.000Z',openingGodl:'0',earnedGodl:'10',
      netSpendSol:'0.050000000',netCostPerGodlSol:'0.005000000000',netSpendUsd:'5.000000',netCostPerGodlUsd:'0.50000000',
      grossOutSol:'0.1',returnedSol:'0.05',ownerNetworkFeesSol:'0.000005',newRentSol:'0',priceBasis:'Historical price estimate',baselineBasis:'Opening zero',caveats:['Dated estimate']}};
  await writeFile(period,JSON.stringify(receipt));
  args[1]='view';await run(process.execPath,args);
  assert.deepEqual(JSON.parse(await readFile(p.out,'utf8')).acquisitionPeriod,receipt.acquisitionPeriod);
  await writeFile(period,'{"broken":true}');
  const result=await run(process.execPath,args),view=JSON.parse(await readFile(p.out,'utf8'));
  assert.match(result.stderr,/Period cost unavailable/);assert.equal(view.acquisitionPeriod,undefined);
  assert.equal(view.provenance.slot,'12345');assert.equal(view.capabilities.canExecute,false);
});

test('runtime failures emit safe codes, preserve the prior view, then recover', async t => {
  const p = await paths(t), server = await rpc(t);
  const secret = 'SYNTHETIC_PATH_CREDENTIAL';
  const args = [cli, 'observe', '--wallet', wallet, '--rpc', server.url + '/' + secret,
    '--db', p.db, '--out', p.out];
  await run(process.execPath, args);
  const before = await readFile(p.out, 'utf8');
  for (const [status, code] of [[401, 'accessDenied'], [403, 'accessDenied'],
    [429, 'rateLimited'], [503, 'providerUnavailable'], [200, 'providerUnavailable']]) {
    server.state.fault = { status, body: { error: { code: -32000, message: secret } } };
    await assert.rejects(run(process.execPath, args), error => {
      assert.equal(error.code, 1);
      assert.doesNotMatch(error.stderr + error.stdout, /SYNTHETIC_PATH_CREDENTIAL|127\.0\.0\.1/);
      const reply = JSON.parse(error.stderr.trim().split('\n').at(-1));
      assert.equal(reply.code, code);
      assert.equal(reply.kind, 'godl-runtime-failure');
      return true;
    });
    assert.equal(await readFile(p.out, 'utf8'), before);
  }
  server.state.fault = null;
  await run(process.execPath, args);
  assert.equal(JSON.parse(await readFile(p.out, 'utf8')).provenance.slot, '12345');
});
