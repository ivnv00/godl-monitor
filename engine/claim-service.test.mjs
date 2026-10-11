import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { claimAccountingFixture } from './test-fixtures/claim-accounting.mjs';
import { refreshAccounting, writeAtomicJson } from './accounting-service.mjs';
import { loadEarningsCheckpoints, loadFundedCheckpoints, projectEarnings } from './earnings.mjs';
import { loadHistoricalIntervals } from './historical-accounting.mjs';
import { ObservationStore } from './observation-store.mjs';

async function scenario(t) {
  const fixture = await claimAccountingFixture({ referral: true });
  fixture.interval.closing.accounts.treasury.value.totalUnclaimed = fixture.interval.closing.accounts.miner.value.rewardsGodl;
  const root = await mkdtemp(join(tmpdir(), 'godl-claim-service-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const paths = { anchorPath: join(root, 'anchor.json'), checkpointPath: join(root, 'checkpoint.json'), evidenceRoot: join(root, 'evidence') };
  await writeAtomicJson(paths.anchorPath, fixture.anchor);
  const state = { closing: structuredClone(fixture.interval.closing), transactions: structuredClone(fixture.rawTransactions), requests: [] };
  const fetchImpl = async (url, init) => {
    if (new URL(url).origin === 'https://api.exchange.coinbase.com') return Response.json(fixture.candles);
    assert.equal(new URL(url).hostname, 'rpc.invalid');
    const request = JSON.parse(init.body); state.requests.push(request);
    let result;
    if (request.method === 'getSignaturesForAddress') {
      result = request.params[1].before ? [] : state.transactions.filter(tx => tx.transaction.message.accountKeys.includes(request.params[0]))
        .map(tx => ({ signature: tx.transaction.signatures[0], slot: Number(tx.slot), blockTime: tx.blockTime,
          err: tx.meta.err, confirmationStatus: 'finalized' })).reverse();
    } else if (request.method === 'getBlock') {
      const matches = state.transactions.filter(tx => Number(tx.slot) === request.params[0]);
      result = { blockTime: matches[0].blockTime, signatures: matches.map(tx => tx.transaction.signatures[0]) };
    } else if (request.method === 'getTransaction') result = state.transactions.find(tx => tx.transaction.signatures[0] === request.params[0]);
    else throw Error('Unexpected synthetic RPC method');
    return Response.json({ jsonrpc: '2.0', id: request.id, result });
  };
  const options = { ...paths, wallet: fixture.wallet, rpcUrl: 'https://rpc.invalid', fetchImpl,
    rpcTransportOptions: { minIntervalMs: 0 }, readSnapshot: async () => structuredClone(state.closing),
    readDeployment: async () => ({ programDataAddress: 'synthetic-deployment', deployedAtSlot: '1' }),
    now: () => new Date('2026-01-02T10:20:00.000Z') };
  return { ...paths, fixture, state, root, options, fundedPath: `${paths.checkpointPath}.funded.json` };
}
const json = async path => JSON.parse(await readFile(path, 'utf8'));

test('collector/service publishes v3 once, restarts without double counting and preserves the reviewed anchor', async t => {
  const s = await scenario(t), anchorBytes = await readFile(s.anchorPath, 'utf8');
  assert.equal((await refreshAccounting(s.options)).state, 'current');
  const first = await json(s.fundedPath);
  assert.equal(first.schemaVersion, 3);
  assert.equal(first.ledger.claims.count, 1);
  assert.equal(first.ledger.claims.ownerReceiptBaseUnits, '1194000000000');
  assert.equal(first.ledger.claims.networkFeeLamports, '5000');
  assert.deepEqual((await json(s.checkpointPath)), s.fixture.anchor);
  const firstRecord = await json(join(first.evidenceDirectory, 'funded-reconciliation.json'));
  assert.equal(firstRecord.interval.godlClaims.length, 1);
  assert.equal((await refreshAccounting(s.options)).state, 'waiting');
  assert.deepEqual((await json(s.fundedPath)).ledger, first.ledger);
  s.state.closing.context.slot = '40'; s.state.closing.observedAt = '2026-01-02T10:15:00.000Z';
  assert.equal((await refreshAccounting(s.options)).state, 'current');
  const second = await json(s.fundedPath);
  assert.equal(second.schemaVersion, 3);
  assert.deepEqual(second.ledger.claims, first.ledger.claims);
  assert.equal(second.ledger.lastInterval.claims.count, 0);
  assert.equal(second.ledger.netUsdLamportMicro, first.ledger.netUsdLamportMicro);
  const chain = await loadFundedCheckpoints({ checkpoint: second, evidenceRoot: s.evidenceRoot });
  assert.equal(chain.length, 2);
  assert.equal(await readFile(s.anchorPath, 'utf8'), anchorBytes);
  assert.deepEqual((await json(s.checkpointPath)), s.fixture.anchor);
});

test('unsupported saved claim stays blocked even if the provider later changes finalized bytes', async t => {
  const s = await scenario(t);
  s.state.transactions[0].meta.innerInstructions = [];
  assert.notEqual((await refreshAccounting(s.options)).state, 'current');
  const kept = await json(s.checkpointPath);
  assert.deepEqual(kept.receipt, s.fixture.anchor.receipt);
  assert.deepEqual(kept.closing, s.fixture.anchor.closing);
  await assert.rejects(readFile(s.fundedPath), { code: 'ENOENT' });
  s.state.transactions = structuredClone(s.fixture.rawTransactions);
  assert.notEqual((await refreshAccounting(s.options)).state, 'current');
  await assert.rejects(readFile(s.fundedPath), { code: 'ENOENT' });
  assert.deepEqual((await json(s.checkpointPath)).receipt, s.fixture.anchor.receipt);
});

test('missing historical prices preserve the prior boundary and recovery credits the claim once', async t => {
  const s = await scenario(t);
  assert.equal((await refreshAccounting({ ...s.options, collectPrices: async () => { throw Error('Historical price unavailable'); } })).state, 'retrying');
  assert.deepEqual((await json(s.checkpointPath)).receipt, s.fixture.anchor.receipt);
  assert.equal((await refreshAccounting(s.options)).state, 'current');
  assert.equal((await json(s.fundedPath)).ledger.claims.count, 1);
});

test('unsupported newer claim ledger is preserved before RPC or replacement', async t => {
  const s = await scenario(t);
  assert.equal((await refreshAccounting(s.options)).state, 'current');
  const future = await json(s.fundedPath); future.schemaVersion = future.ledger.schemaVersion = 4;
  const bytes = JSON.stringify(future); await writeFile(s.fundedPath, bytes);
  const count = s.state.requests.length;
  await assert.rejects(refreshAccounting(s.options));
  assert.equal(s.state.requests.length, count);
  assert.equal(await readFile(s.fundedPath, 'utf8'), bytes);
});

test('bundled selected-week path reproduces v3 covered net and leaves saved profile bytes untouched', async t => {
  const s = await scenario(t);
  assert.equal((await refreshAccounting(s.options)).state, 'current');
  const checkpoint = await json(s.checkpointPath), fundedCheckpoint = await json(s.fundedPath);
  const checkpoints = await loadEarningsCheckpoints({ checkpoint, evidenceRoot: s.evidenceRoot });
  const fundedCheckpoints = await loadFundedCheckpoints({ checkpoint: fundedCheckpoint, evidenceRoot: s.evidenceRoot });
  const now = Date.now(), snapshot = structuredClone(fundedCheckpoint.closing);
  snapshot.context.slot = '100'; snapshot.observedAt = new Date(now - 1000).toISOString();
  const db = join(s.root, 'observations.sqlite'), store = new ObservationStore(db);
  store.append(snapshot); store.close();
  const market = { schemaVersion: 1, source: 'DEX Screener', observedAt: new Date(now - 1000).toISOString(), expiresAt: new Date(now + 599000).toISOString(), quotes: [
    { asset: 'GODL', mint: 'GodL6KZ9uuUoQwELggtVzQkKmU1LfqmDokPibPeDKkhF', priceUsd: '2', pairAddress: 'synthetic', dexId: 'synthetic', liquidityUsd: '10000', volume24hUsd: '100' },
    { asset: 'XAUt0', mint: 'AymATz4TCL9sWNEEV9Kvyz45CHVhDZ6kUgjTJPzLpU9P', priceUsd: '10', pairAddress: 'synthetic-gold', dexId: 'synthetic', liquidityUsd: '10000', volume24hUsd: '100' }] };
  const prices = join(s.root, 'prices.json'); await writeAtomicJson(prices, market);
  const files = [db, s.anchorPath, s.checkpointPath, s.fundedPath, prices,
    join(fundedCheckpoint.evidenceDirectory, 'funded-reconciliation.json')];
  const before = await Promise.all(files.map(path => readFile(path)));
  const input = { snapshot, checkpoint, checkpoints, fundedCheckpoint, fundedCheckpoints, market,
    timeZone: 'UTC', nowMs: now, endDay: '2026-01-02' };
  const baseline = projectEarnings(input);
  const reader = new ObservationStore(db, {readOnly:true});
  let historicalIntervals;
  try {
    historicalIntervals = await loadHistoricalIntervals({checkpoints, fundedCheckpoints,
      days:baseline.days.map(day => day.day), timeZone:'UTC',
      readObservations:options => reader.accountingBoundaries(options)});
  } finally { reader.close(); }
  const expected = JSON.parse(JSON.stringify(projectEarnings({...input, historicalIntervals})));
  const result = spawnSync(process.execPath, ['engine/earnings-history-cli.mjs', '--wallet', s.fixture.wallet, '--db', db,
    '--accounting', s.checkpointPath, '--prices', prices, '--evidence', s.evidenceRoot, '--time-zone', 'UTC', '--end-day', '2026-01-02'], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const actual = JSON.parse(result.stdout).earnings;
  assert.deepEqual(actual, expected);
  assert.deepEqual(actual.days[0].claimAttribution, {method:'isolated-claim-factor-v1',
    status:'unavailable', reason:'claim-state-not-isolated'});
  assert.equal(baseline.days[0].claimAttribution.reason,'claim-evidence-unavailable');
  const priorDays = days => days.map(({claimAttribution, ...day}) => day);
  assert.deepEqual({...actual,days:priorDays(actual.days)},
    JSON.parse(JSON.stringify({...baseline,days:priorDays(baseline.days)})));
  assert.equal(actual.schemaVersion, 3);
  assert.equal(actual.days[0].claimCount, 1);
  assert.ok(actual.days[0].netRewardUsd);
  assert.equal(actual.days[0].unrefinedGodl, undefined);
  assert.equal(actual.total.netPnlUsd, undefined);
  assert.deepEqual(await Promise.all(files.map(path => readFile(path))), before);
});
