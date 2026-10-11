import assert from 'node:assert/strict';
import test from 'node:test';
import { getAddressDecoder } from '@solana/addresses';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { readProgramDeployment, refreshAccounting, projectAccountingCheckpoint, writeAtomicJson } from './accounting-service.mjs';
import { accountingFixture } from './test-fixtures/accounting.mjs';
import { accountingRpc } from './test-fixtures/accounting-rpc.mjs';
import { loadEarningsCheckpoints, projectEarnings } from './earnings.mjs';

const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const sha = value => createHash('sha256').update(value).digest('hex');

async function scenario(t) {
  const fixture = await accountingFixture();
  const root = await mkdtemp(join(tmpdir(), 'godl-accounting-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const paths = { anchorPath: join(root, 'anchor.json'), checkpointPath: join(root, 'checkpoint.json'),
    evidenceRoot: join(root, 'evidence') };
  await writeAtomicJson(paths.anchorPath, fixture.anchor);
  const rpc = accountingRpc(fixture);
  const options = { ...paths, wallet: fixture.wallet, rpcUrl: 'https://rpc.invalid/?api-key=SYNTHETIC_KEY',
    fetchImpl: rpc.fetch, rpcTransportOptions: { minIntervalMs: 0 } };
  return { fixture, rpc, options, ...paths };
}

test('real synthetic RPC refresh persists exact costs, raw evidence and a restart without double counting', async t => {
  const s = await scenario(t);
  const status = await refreshAccounting(s.options);
  assert.equal(status.state, 'current');
  const first = await readJson(s.checkpointPath);
  assert.equal(first.receipt.acquisitionPeriod.netSpendSol, '0.130010000');
  assert.equal(first.receipt.acquisitionPeriod.netSpendUsd, '13.001000');
  assert.equal(first.receipt.acquisitionPeriod.earnedGodl, '12.00000000000');
  assert.deepEqual(first.receipt.evidence.lastInterval.includedSignatures, [s.fixture.interval.transactions[0].signature]);
  assert.deepEqual(projectAccountingCheckpoint(first.closing, first).acquisitionPeriod, first.receipt.acquisitionPeriod);
  const names = await readdir(first.evidenceDirectory);
  const responses = await Promise.all(names.filter(name => name.startsWith('response-'))
    .map(name => readJson(join(first.evidenceDirectory, name))));
  assert.ok(responses.some(item => item.method === 'getTransaction'));
  assert.ok(responses.length > 10);
  for (const response of responses) {
    assert.equal(response.sha256, sha(response.raw));
    assert.doesNotMatch(JSON.stringify(response.source), /SYNTHETIC_KEY/);
  }
  assert.deepEqual((await readJson(join(first.evidenceDirectory, 'reconciliation.json'))).receipt, first.receipt);
  for (const path of [s.anchorPath, s.checkpointPath, join(first.evidenceDirectory, 'reconciliation.json')]) {
    assert.equal((await stat(path)).mode & 0o777, 0o600);
  }
  // Only the persisted checkpoint can resume: the original anchor is no longer available.
  await rm(s.anchorPath);
  const requestCount = s.rpc.requests.length;
  assert.equal((await refreshAccounting(s.options)).state, 'waiting');
  assert.deepEqual((await readJson(s.checkpointPath)).receipt, first.receipt);
  s.rpc.closing.context.slot = '40';
  assert.equal((await refreshAccounting(s.options)).state, 'current');
  const resumed = await readJson(s.checkpointPath);
  assert.deepEqual(resumed.receipt.acquisitionPeriod, first.receipt.acquisitionPeriod);
  assert.deepEqual(resumed.receipt.evidence.lastInterval.includedSignatures, []);
  assert.equal(resumed.receipt.evidence.previousReceiptSha256, sha(JSON.stringify(first.receipt)));
  assert.ok(s.rpc.requests.slice(requestCount).every(request => !['getTransaction', 'getBlock'].includes(request.method)));
  const chain = await loadEarningsCheckpoints({ checkpoint: resumed, evidenceRoot: s.evidenceRoot });
  assert.deepEqual(chain.map(item => item.closing.context.slot), ['30', '40']);
  const projection = projectEarnings({ snapshot: resumed.closing, checkpoint: resumed,
    checkpoints: chain, timeZone: 'UTC', nowMs: Date.parse(resumed.closing.observedAt) });
  assert.equal(projection.days[0].coverage, 'partial');
  assert.equal(projection.days[0].netSpendUsd, '0.000000');
  assert.equal(projection.total.netSpendUsd, resumed.receipt.acquisitionPeriod.netSpendUsd);
});

test('provider failure preserves a verified receipt and recovery resumes the same boundary', async t => {
  const s = await scenario(t);
  s.rpc.failureMethod = 'getTransaction';
  const failed = await refreshAccounting(s.options);
  assert.equal(failed.state, 'retrying');
  assert.equal(failed.verifiedThroughSlot, '20');
  assert.deepEqual((await readJson(s.checkpointPath)).receipt, s.fixture.anchor.receipt);
  s.rpc.failureMethod = null;
  assert.equal((await refreshAccounting(s.options)).state, 'current');
  const recovered = await readJson(s.checkpointPath);
  assert.equal(recovered.receipt.acquisitionPeriod.netSpendUsd, '13.001000');
  assert.equal(recovered.receipt.evidence.extensionCount, 1);
});

test('active funds, an upgraded program and absent historical prices retain the last trusted amounts', async t => {
  for (const [name, mutate, expected] of [
    ['active funds', s => { s.rpc.closing.accounts.miner.value.deployed[0] = '1'; s.rpc.closing.accounts.miner.value.roundId = '1'; }, 'waiting'],
    ['program upgrade', s => { s.rpc.deploymentSlot = 11; }, 'blocked'],
    ['missing price', s => { s.fixture.candles.length = 0; }, 'retrying'],
  ]) await t.test(name, async t => {
    const s = await scenario(t); mutate(s);
    assert.equal((await refreshAccounting(s.options)).state, expected);
    const kept = await readJson(s.checkpointPath);
    assert.deepEqual(kept.receipt, s.fixture.anchor.receipt);
    assert.deepEqual(kept.closing, s.fixture.anchor.closing);
  });
});

test('corrupt checkpoint and foreign wallet fail before RPC and never fall back over existing state', async t => {
  const s = await scenario(t);
  const broken = '{broken';
  await writeFile(s.checkpointPath, broken);
  await assert.rejects(refreshAccounting(s.options), SyntaxError);
  assert.equal(await readFile(s.checkpointPath, 'utf8'), broken);
  assert.equal(s.rpc.requests.length, 0);
  await rm(s.checkpointPath);
  const foreign = getAddressDecoder().decode(Buffer.alloc(32, 8));
  await assert.rejects(refreshAccounting({ ...s.options, wallet: foreign }), /wallet mismatch/);
  assert.equal(s.rpc.requests.length, 0);
  // Validation failures also release the writer lock.
  assert.equal((await refreshAccounting(s.options)).state, 'current');
});

test('concurrent reconciliation refuses a second writer and releases the lock after completion', async t => {
  const s = await scenario(t);
  const entered = Promise.withResolvers(), release = Promise.withResolvers();
  const first = refreshAccounting({ ...s.options, readSnapshot: async () => {
    entered.resolve(); await release.promise; return s.fixture.interval.closing;
  } });
  await entered.promise;
  try { await assert.rejects(refreshAccounting(s.options), /already running/); }
  finally { release.resolve(); }
  assert.equal((await first).state, 'current');
  s.rpc.closing.context.slot = '40';
  assert.equal((await refreshAccounting(s.options)).state, 'current');
});

test('validates upgradeable-loader metadata and preserves the deployment slot exactly', async () => {
  const publicKey = Buffer.alloc(32, 7);
  const program = Buffer.alloc(36);
  program.writeUInt32LE(2);
  publicKey.copy(program, 4);
  const programData = Buffer.alloc(45);
  programData.writeUInt32LE(3);
  programData.writeBigUInt64LE(9_007_199_254_740_993n, 4);
  let calls = 0;
  const fetchImpl = async (_url, options) => {
    const request = JSON.parse(options.body);
    calls += 1;
    const data = calls === 1 ? program : programData;
    return new Response(JSON.stringify({
      jsonrpc: '2.0',
      id: request.id,
      result: {
        context: { slot: 200 },
        value: {
          owner: 'BPFLoaderUpgradeab1e11111111111111111111111',
          executable: calls === 1,
          data: [data.toString('base64'), 'base64'],
        },
      },
    }), { status: 200 });
  };

  const deployment = await readProgramDeployment({
    rpcUrl: 'https://rpc.invalid',
    minContextSlot: '100',
    fetchImpl,
  });
  assert.equal(deployment.deployedAtSlot, '9007199254740993');
  assert.equal(calls, 2);
});

test('provider detail cannot enter displayable accounting status and trusted receipts survive', async t => {
  const s = await scenario(t);
  const secret = 'SYNTHETIC_PATH_CREDENTIAL';
  for (const failure of [new Error('RPC rejected token ' + secret),
    new Error('local file /private/' + secret)]) {
    const status = await refreshAccounting({ ...s.options,
      readSnapshot: async () => { throw failure; } });
    assert.doesNotMatch(JSON.stringify(status), /SYNTHETIC_PATH_CREDENTIAL|private\//);
    const checkpoint = await readJson(s.checkpointPath);
    assert.deepEqual(checkpoint.receipt, s.fixture.anchor.receipt);
    assert.deepEqual(checkpoint.closing, s.fixture.anchor.closing);
    assert.equal(checkpoint.status.failureCode, 'unexpected');
  }
  assert.equal((await refreshAccounting(s.options)).state, 'current');
});


test('retained settled deployment reconciles, survives restart and feeds earnings history', async t => {
  const s = await scenario(t);
  const miner = s.rpc.closing.accounts.miner.value;
  Object.assign(miner, { roundId: '7', checkpointId: '7' });
  miner.deployed[0] = '30000000';
  assert.equal((await refreshAccounting(s.options)).state, 'current');
  const first = await readJson(s.checkpointPath);
  assert.equal(first.receipt.acquisitionPeriod.netSpendSol, '0.130010000');
  assert.equal(first.receipt.acquisitionPeriod.earnedGodl, '12.00000000000');
  assert.equal(first.closing.accounts.miner.value.deployed[0], '30000000');
  assert.equal(projectAccountingCheckpoint(first.closing, first).accounting.state, 'current');
  await rm(s.anchorPath);
  assert.equal((await refreshAccounting(s.options)).state, 'waiting');
  s.rpc.closing.context.slot = '40';
  assert.equal((await refreshAccounting(s.options)).state, 'current');
  const resumed = await readJson(s.checkpointPath);
  assert.deepEqual(resumed.receipt.acquisitionPeriod, first.receipt.acquisitionPeriod);
  const chain = await loadEarningsCheckpoints({ checkpoint: resumed, evidenceRoot: s.evidenceRoot });
  assert.deepEqual(chain.map(item => item.closing.context.slot), ['30', '40']);
  const projection = projectEarnings({ snapshot: resumed.closing, checkpoint: resumed,
    checkpoints: chain, timeZone: 'UTC', nowMs: Date.parse(resumed.closing.observedAt) });
  assert.equal(projection.days[0].coverage, 'partial');
  assert.equal(projection.days[0].netSpendUsd, '0.000000');
  assert.equal(projection.total.netSpendUsd, resumed.receipt.acquisitionPeriod.netSpendUsd);
});
