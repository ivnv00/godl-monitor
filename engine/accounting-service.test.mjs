import assert from 'node:assert/strict';
import test from 'node:test';
import { getAddressDecoder } from '@solana/addresses';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { readProgramDeployment, refreshAccounting, projectAccountingCheckpoint, projectFundedAccountingCheckpoint, writeAtomicJson } from './accounting-service.mjs';
import { extendFundedAccounting } from './funded-accounting.mjs';
import { accountingFixture, indexedRow } from './test-fixtures/accounting.mjs';
import { accountingRpc } from './test-fixtures/accounting-rpc.mjs';
import { loadEarningsCheckpoints, loadFundedCheckpoints, projectEarnings } from './earnings.mjs';
import { readEvidenceFile, expandEvidenceFile } from './evidence-storage.mjs';

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
    .map(async name => JSON.parse((await readEvidenceFile(join(first.evidenceDirectory, name))).toString('utf8'))));
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

test('an upgraded program and absent historical prices retain the last trusted amounts', async t => {
  for (const [name, mutate, expected] of [
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

test('unsupported deployment is checked afresh before every wallet snapshot and recovery remains possible', async t => {
  const s = await scenario(t);
  s.rpc.deploymentSlot = 11;
  for (let attempt = 0; attempt < 2; attempt++) {
    const before = s.rpc.requests.length;
    const status = await refreshAccounting({ ...s.options, readSnapshot: async () => {
      assert.fail('An unsupported deployment must not load wallet accounts');
    } });
    assert.equal(status.state, 'blocked');
    assert.equal(status.verifiedThroughSlot, s.fixture.anchor.closing.context.slot);
    assert.deepEqual(s.rpc.requests.slice(before).map(request => request.method), ['getAccountInfo', 'getAccountInfo']);
    assert.deepEqual((await readJson(s.checkpointPath)).receipt, s.fixture.anchor.receipt);
  }
  s.rpc.deploymentSlot = 1;
  assert.equal((await refreshAccounting(s.options)).state, 'current');
});

test('compressed and legacy finalized caches reuse exact saved detail evidence without detail RPC', async t => {
  const s = await scenario(t);
  assert.equal((await refreshAccounting(s.options)).state, 'current');
  const expected = (await readJson(s.checkpointPath)).receipt.acquisitionPeriod;
  const cacheRoot = join(s.evidenceRoot, 'finalized-cache');
  const names = await readdir(cacheRoot);
  assert.ok(names.length > 0); assert.ok(names.every(name => name.endsWith('.json.gz')));
  for (const legacy of [false, true]) {
    if (legacy) for (const name of names) await expandEvidenceFile(join(cacheRoot, name));
    await rm(s.checkpointPath);
    const before = s.rpc.requests.length;
    assert.equal((await refreshAccounting(s.options)).state, 'current');
    assert.deepEqual((await readJson(s.checkpointPath)).receipt.acquisitionPeriod, expected);
    assert.ok(s.rpc.requests.slice(before).every(request => !['getBlock', 'getTransaction'].includes(request.method)));
  }
  const path = join(cacheRoot, names[0].slice(0, -3));
  await writeFile(path, '{corrupt');
  await rm(s.checkpointPath);
  const before = s.rpc.requests.length;
  assert.equal((await refreshAccounting(s.options)).state, 'blocked');
  assert.equal(await readFile(path, 'utf8'), '{corrupt');
  assert.ok(s.rpc.requests.slice(before).every(request => !['getBlock', 'getTransaction'].includes(request.method)));
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


test('funded sidecar freezes the reviewed prefix and resumes separately with guarded failure recovery', async t => {
  const s = await scenario(t), f = s.fixture;
  const tx = f.interval.transactions[0];
  tx.godlInstructions[0].dataBase58 = '24';
  Object.assign(tx.deltas.automationV2, { beforeLamports: '0', afterLamports: '30000000', changeLamports: '30000000' });
  f.interval.closing.accounts.automationV2 = { address: f.trackedAccounts.automationV2,
    status: 'present', lamports: '30000000', value: { authority: f.wallet, balance: '28000000' } };
  f.interval.closing.accounts.miner.value.rewardsGodl = f.anchor.closing.accounts.miner.value.rewardsGodl;
  let failProvider = false;
  const options = { ...s.options, readSnapshot: async () => {
    if (failProvider) throw new Error('RPC unavailable');
    return f.interval.closing;
  }, collectInterval: async ({ opening }) => {
    assert.equal(opening.context.slot, f.interval.fromExclusiveSlot);
    return f.interval;
  }, collectPrices: async ({ minutes }) => {
    assert.deepEqual(minutes, f.candles.map(row => row[0]));
    return { candles: f.candles };
  } };
  assert.equal((await refreshAccounting(options)).state, 'current');
  const path = `${s.checkpointPath}.funded.json`, first = await readJson(path);
  assert.equal(first.ledger.netCostLamports, '100010000');
  assert.equal(projectFundedAccountingCheckpoint(first.closing, first, f.anchor).accounting.state, 'current');
  const frozen = await readFile(s.checkpointPath, 'utf8');
  assert.deepEqual(JSON.parse(frozen), f.anchor);
  assert.deepEqual((await readJson(join(first.evidenceDirectory, 'funded-reconciliation.json'))).checkpoint.ledger, first.ledger);
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  failProvider = true;
  assert.equal((await refreshAccounting(options)).state, 'retrying');
  assert.deepEqual((await readJson(path)).ledger, first.ledger);
  assert.equal(await readFile(s.checkpointPath, 'utf8'), frozen);
  failProvider = false;
  f.interval.fromExclusiveSlot = '30'; f.interval.toInclusiveSlot = '40'; f.interval.closing.context.slot = '40';
  s.rpc.closing.context.slot = '40';
  tx.slot = '35'; tx.signature = 's'.repeat(88); tx.blockTime += 600;
  tx.feePayer = f.trackedAccounts.miner; tx.ownerPaidNetworkFeeLamports = '0';
  tx.deltas.wallet = { address: f.wallet, status: 'not-in-transaction' };
  Object.assign(tx.deltas.automationV2, { beforeLamports: '30000000', afterLamports: '20000000', changeLamports: '-10000000' });
  Object.assign(f.interval.closing.accounts.automationV2, { lamports: '20000000', value: { authority: f.wallet, balance: '18000000' } });
  f.candles = [[tx.blockTime, 200, 200, 200, 200, 1]];
  for (const [role, page] of Object.entries(f.interval.pages)) page.rows = role === 'wallet' ? [] : [indexedRow(tx)];
  // Simulate death after evidence sync and before sidecar replacement.
  const unpublished = extendFundedAccounting({ previous: first, interval: f.interval, candles: f.candles });
  await writeAtomicJson(join(s.evidenceRoot, 'interrupted', 'funded-reconciliation.json'),
    { checkpoint: unpublished, interval: f.interval });
  f.interval.toInclusiveSlot = '50'; f.interval.closing.context.slot = '50'; s.rpc.closing.context.slot = '50';
  await rm(s.anchorPath);
  assert.equal((await refreshAccounting(options)).state, 'current');
  const resumed = await readJson(path);
  assert.equal(resumed.ledger.netCostLamports, '110010000');
  assert.equal(resumed.ledger.netUsdLamportMicro, '12001000000000000');
  assert.deepEqual((await loadFundedCheckpoints({ checkpoint: resumed, evidenceRoot: s.evidenceRoot }))
    .map(item => item.closing.context.slot), ['30', '50']);
  assert.equal(await readFile(s.checkpointPath, 'utf8'), frozen);
  await writeFile(path, '{unreadable');
  await assert.rejects(refreshAccounting(options), SyntaxError);
  assert.equal(await readFile(path, 'utf8'), '{unreadable');
  assert.equal(await readFile(s.checkpointPath, 'utf8'), frozen);
});

test('sidecar path cannot collide with reviewed anchor or evidence', async t => {
  const s = await scenario(t);
  await assert.rejects(refreshAccounting({ ...s.options, anchorPath: `${s.checkpointPath}.funded.json` }), /paths must differ/);
});

test('pending RPC boundary creates v2 beside frozen history, survives restart and preserves newer sidecars', async t => {
  const s = await scenario(t);
  s.rpc.closing.accounts.miner.value.deployed[0] = '30000000';
  s.rpc.closing.accounts.miner.value.roundId = '1';
  assert.equal((await refreshAccounting(s.options)).state, 'current');
  const path = `${s.checkpointPath}.funded.json`, first = await readJson(path);
  const frozen = await readFile(s.checkpointPath, 'utf8');
  assert.equal(first.schemaVersion, 2);
  assert.equal(first.ledger.netCostLamports, '130010000');
  assert.deepEqual(JSON.parse(frozen), s.fixture.anchor);
  s.rpc.closing.context.slot = '40';
  await rm(s.anchorPath);
  assert.equal((await refreshAccounting(s.options)).state, 'current');
  const resumed = await readJson(path);
  assert.equal(resumed.ledger.netCostLamports, first.ledger.netCostLamports);
  const chain = await loadFundedCheckpoints({ checkpoint:resumed, evidenceRoot:s.evidenceRoot });
  assert.deepEqual(chain.map(c => c.closing.context.slot), ['30','40']);
  const projected = projectEarnings({ snapshot:resumed.closing, checkpoint:s.fixture.anchor,
    checkpoints:[s.fixture.anchor], fundedCheckpoint:resumed, fundedCheckpoints:chain,
    timeZone:'UTC', nowMs:Date.parse(resumed.closing.observedAt) });
  assert.equal(projected.position.pendingRound.deployedSol.lamports, '30000000');
  assert.equal(projected.position.netReady, false);
  assert.equal(projected.total.throughSlot, '20');
  s.rpc.failureMethod = 'getMultipleAccounts';
  assert.equal((await refreshAccounting(s.options)).state, 'retrying');
  assert.deepEqual((await readJson(path)).ledger, resumed.ledger);
  assert.equal(await readFile(s.checkpointPath, 'utf8'), frozen);
  const newer = { ...resumed, schemaVersion:3 };
  await writeAtomicJson(path, newer);
  const before = await readFile(path, 'utf8'), requestCount = s.rpc.requests.length;
  await assert.rejects(refreshAccounting(s.options), /Invalid funded/);
  assert.equal(s.rpc.requests.length, requestCount);
  assert.equal(await readFile(path, 'utf8'), before);
  assert.equal(await readFile(s.checkpointPath, 'utf8'), frozen);
});
