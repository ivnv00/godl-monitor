import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { accountingFixture } from './test-fixtures/accounting.mjs';
import { accountingRpc } from './test-fixtures/accounting-rpc.mjs';
import { writeAtomicJson } from './accounting-service.mjs';

const run = promisify(execFile);
const cli = fileURLToPath(new URL('./accounting-cli.mjs', import.meta.url));
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));

async function scenario(t, { anchor = true } = {}) {
  const fixture = await accountingFixture(), rpc = accountingRpc(fixture, { empty: true });
  const root = await mkdtemp(join(tmpdir(), 'godl-accounting-cli-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const anchorPath = join(root, 'anchor.json'), checkpointPath = join(root, 'checkpoint.json');
  if (anchor) await writeAtomicJson(anchorPath, fixture.anchor);
  const server = createServer(async (request, response) => {
    try {
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      const result = await rpc.fetch(`http://127.0.0.1${request.url}`, { body: Buffer.concat(chunks).toString() });
      response.writeHead(result.status, { 'content-type': 'application/json' });
      response.end(await result.text());
    } catch { response.writeHead(500); response.end('{}'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const configPath = join(root, 'rpc.json');
  await writeAtomicJson(configPath, { rpcUrl: `http://127.0.0.1:${server.address().port}/?api-key=SYNTHETIC_LOCAL_KEY` });
  const args = [cli, '--wallet', fixture.wallet, '--anchor', anchorPath, '--checkpoint', checkpointPath,
    '--evidence', join(root, 'evidence'), '--rpc-config', configPath];
  return { fixture, rpc, args, anchorPath, checkpointPath };
}

test('rejects an incomplete invocation before reading accounting state', async () => {
  await assert.rejects(
    run(process.execPath, [cli]),
    error => {
      assert.equal(error.code, 1);
      assert.equal(JSON.parse(error.stderr).code, 'invocation');
      return true;
    },
  );
});

test('CLI reconciles, survives restart and provider failure, and never counts a repeated slot twice', async t => {
  const s = await scenario(t);
  const first = JSON.parse((await run(process.execPath, s.args)).stdout);
  assert.equal(first.state, 'current');
  assert.equal(first.executionAllowed, false);
  assert.equal(first.verifiedThroughSlot, '30');
  const trusted = await readJson(s.checkpointPath);
  assert.equal(trusted.receipt.acquisitionPeriod.netSpendUsd, '10.000500');
  await rm(s.anchorPath);

  await assert.rejects(run(process.execPath, s.args), error => {
    assert.equal(error.code, 2);
    const status = JSON.parse(error.stdout);
    assert.equal(status.state, 'waiting');
    assert.match(status.reason, /newer finalized slot/);
    assert.equal(status.executionAllowed, false);
    return true;
  });
  assert.deepEqual((await readJson(s.checkpointPath)).receipt, trusted.receipt);

  s.rpc.closing.context.slot = '40';
  s.rpc.failureMethod = 'getMultipleAccounts';
  await assert.rejects(run(process.execPath, s.args), error => {
    assert.equal(error.code, 2);
    const status = JSON.parse(error.stdout);
    assert.equal(status.state, 'retrying');
    assert.equal(status.verifiedThroughSlot, '30');
    assert.doesNotMatch(error.stdout + error.stderr, /SYNTHETIC_LOCAL_KEY/);
    return true;
  });
  assert.deepEqual((await readJson(s.checkpointPath)).receipt, trusted.receipt);
  s.rpc.failureMethod = null;
  assert.equal(JSON.parse((await run(process.execPath, s.args)).stdout).verifiedThroughSlot, '40');
  assert.deepEqual((await readJson(s.checkpointPath)).receipt.acquisitionPeriod, trusted.receipt.acquisitionPeriod);
  assert.ok(s.rpc.requests.every(request => request.method.startsWith('get')));
});

test('CLI cannot invent an anchor for a new wallet and makes no RPC request without it', async t => {
  const s = await scenario(t, { anchor: false });
  await assert.rejects(run(process.execPath, s.args), error => {
    assert.equal(error.code, 1); return true;
  });
  await assert.rejects(access(s.checkpointPath));
  assert.equal(s.rpc.requests.length, 0);
});
