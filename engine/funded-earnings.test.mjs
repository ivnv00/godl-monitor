// Generated synthetic balances and account keys only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadFundedCheckpoints, projectEarnings } from './earnings.mjs';
import { extendFundedAccounting, fundedCheckpointHash } from './funded-accounting.mjs';
import { extendClosedAccounting } from './ongoing-cost.mjs';
import { accountingFixture, indexedRow } from './test-fixtures/accounting.mjs';
import { publishEarningsViews, startMarketQuotes } from './observation-publication.mjs';
import { projectMonitor } from './monitor.mjs';
import { ObservationStore } from './observation-store.mjs';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const nowMs = Date.parse('2026-01-02T10:31:00.000Z');
const market = { observedAt: '2026-01-02T10:30:00.000Z', expiresAt: '2026-01-02T10:32:00.000Z',
  source: 'DEX Screener', reason: null, goldReference: { source: 'CoinGecko', assetId: 'tether-gold',
    priceUsd: '10', observedAt: '2026-01-02T10:30:00.000Z' }, quotes: [
    { asset: 'GODL', mint: 'GodL6KZ9uuUoQwELggtVzQkKmU1LfqmDokPibPeDKkhF',
      priceUsd: '2', pairAddress: 'synthetic-godl-pair', dexId: 'synthetic-dex' },
    { asset: 'XAUt0', mint: 'AymATz4TCL9sWNEEV9Kvyz45CHVhDZ6kUgjTJPzLpU9P',
      priceUsd: '10', pairAddress: 'synthetic-gold-pair', dexId: 'synthetic-dex' },
  ] };

async function fundedChain() {
  const fixture = await accountingFixture();
  const closed = extendClosedAccounting({ previous: fixture.anchor, interval: fixture.interval, candles: fixture.candles });
  function interval(previous, slot, observedAt, principal, gold, walletBefore, walletAfter, reserveBefore, reserveAfter, ownerFee) {
    const closing = structuredClone(previous.closing);
    closing.context.slot = String(slot); closing.observedAt = observedAt;
    Object.assign(closing.accounts.miner.value, { rewardsGodl: principal, lifetimeRewardsGodl: principal });
    closing.accounts.treasury.value.totalUnclaimed = principal;
    Object.assign(closing.accounts.minerExtended.value, { xautRewards: gold, lifetimeXaut: gold });
    Object.assign(closing.accounts.automation, { status: 'present', lamports: String(reserveAfter),
      value: { authority: fixture.wallet, balance: String(reserveAfter), amount: '1000000', fee: '5000' } });
    const tx = structuredClone(fixture.interval.transactions[0]);
    Object.assign(tx, { signature: String(slot).repeat(44), slot: String(slot - 5),
      blockTime: Date.parse(observedAt) / 1000 - 300,
      ownerPaidNetworkFeeLamports: String(ownerFee), feePayer: ownerFee ? fixture.wallet : 'synthetic-keeper' });
    const delta = (before, after) => ({ status: 'observed', beforeLamports: String(before),
      afterLamports: String(after), changeLamports: String(BigInt(after) - BigInt(before)) });
    Object.assign(tx.deltas.wallet, delta(walletBefore, walletAfter));
    Object.assign(tx.deltas.automation, delta(reserveBefore, reserveAfter));
    return { wallet: fixture.wallet, trackedAccounts: fixture.trackedAccounts,
      fromExclusiveSlot: previous.closing.context.slot, toInclusiveSlot: String(slot),
      opening: structuredClone(previous.closing), closing,
      pages: Object.fromEntries(Object.entries(fixture.trackedAccounts).map(([role, address]) => [role,
        { address, rows: [indexedRow(tx)], exhausted: true }])), transactions: [tx] };
  }
  const funding = interval(closed, 40, '2026-01-02T10:20:00.000Z', '1300000000000', '400000',
    1_000_000_000, 499_995_000, 0, 500_000_000, 5000);
  const first = extendFundedAccounting({ previous: closed, interval: funding,
    candles: [[funding.transactions[0].blockTime, 100, 100, 100, 100, 1]] });
  const spending = interval(first, 50, '2026-01-02T10:30:00.000Z', '1400000000000', '500000',
    499_995_000, 499_995_000, 500_000_000, 480_000_000, 0);
  const next = extendFundedAccounting({ previous: first, interval: spending,
    candles: [[spending.transactions[0].blockTime, 200, 200, 200, 200, 1]] });
  return { anchor: fixture.anchor, closed, first, next, funding, spending };
}

function options({ anchor, closed, first, next }) {
  return { snapshot: next.closing, checkpoint: closed, checkpoints: [anchor, closed],
    fundedCheckpoint: next, fundedCheckpoints: [first, next], market, timeZone: 'UTC', nowMs };
}

async function writeEvidence(root, name, checkpoint, interval, committed = true) {
  const directory = join(root, name);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'funded-reconciliation.json'), JSON.stringify({ checkpoint, interval }));
  if (committed) {
    const checkpointSha256 = fundedCheckpointHash(checkpoint);
    await mkdir(join(root, 'funded-commits'), { recursive: true });
    await writeFile(join(root, 'funded-commits', `${checkpointSha256}.json`), JSON.stringify({ schemaVersion: 1, checkpointSha256 }));
  }
}

test('mixed closed and funded earnings exclude reserve funding and price consumed reserves at each event', async () => {
  const chain = await fundedChain();
  assert.equal(BigInt(chain.first.ledger.netUsdLamportMicro) - BigInt(chain.closed.receipt.evidence.netUsdLamportMicro), 5000n * 100_000_000n);
  assert.equal(BigInt(chain.next.ledger.netUsdLamportMicro) - BigInt(chain.first.ledger.netUsdLamportMicro), 20_000_000n * 200_000_000n);
  const result = projectEarnings(options(chain));
  assert.equal(result.schemaVersion, 2);
  assert.equal(result.total.fromAt, chain.closed.receipt.acquisitionPeriod.startedAt);
  assert.equal(result.total.throughAt, chain.next.closing.observedAt);
  assert.equal(result.total.throughSlot, '50');
  assert.equal(result.total.netSpendUsd, '17.001500');
  assert.equal(result.total.rewardValueUsd, '28.000000');
  assert.equal(result.total.netPnlUsd, '10.998500');
  assert.match(result.total.reason, /Refundable automation capital is excluded.*historical SOL prices/);
  const day = result.days[0];
  assert.equal(day.fromSlot, '20'); assert.equal(day.throughSlot, '50');
  assert.equal(day.coverage, 'partial');
  assert.equal(day.netSpendUsd, '7.001000');
  assert.equal(day.rewardValueUsd, '11.000000');
  assert.equal(day.netRewardUsd, '3.999000');
  assert.match(day.reason, /midnight coverage is not implied.*Refundable automation/);
  assert.equal(result.holdings.unrefinedUsd, '28.000000');
});

test('funded valuation uses current quotes, preserves exact costs when they expire and checks current claim state', async () => {
  const chain = await fundedChain(), input = options(chain);
  const fresh = projectEarnings({ ...input, market: { ...market, quotes: [{ ...market.quotes[0], priceUsd: '3' }, market.quotes[1]] } });
  assert.equal(fresh.total.netPnlUsd, '24.998500');
  const expired = projectEarnings({ ...input, market: { ...market, expiresAt: new Date(nowMs).toISOString() } });
  assert.equal(expired.total.netSpendUsd, '17.001500');
  assert.equal(expired.total.netPnlUsd, undefined);
  assert.equal(expired.days[0].netRewardUsd, undefined);
  assert.deepEqual(expired.holdings, {});
  const changed = structuredClone(chain.next.closing);
  changed.accounts.miner.value.referrer = 'synthetic-changed-referrer';
  const mismatch = projectEarnings({ ...input, snapshot: changed });
  assert.equal(mismatch.total.netPnlUsd, undefined);
  assert.match(mismatch.total.reason, /claim state no longer matches/);
  const old = structuredClone(chain.next.closing); old.context.slot = '49';
  assert.throws(() => projectEarnings({ ...input, snapshot: old }), /does not cover/);
});

test('funded projections reject corruption, changed identity, links, claim markers and reward counters', async () => {
  const chain = await fundedChain(), input = options(chain);
  const mutate = change => {
    const next = structuredClone(chain.next); change(next);
    next.ledger.closingSha256 = digest(next.closing);
    return { ...input, fundedCheckpoint: next, fundedCheckpoints: [chain.first, next] };
  };
  assert.throws(() => projectEarnings({ ...input, fundedCheckpoints: [chain.next] }), /Broken earnings/);
  assert.throws(() => projectEarnings({ ...input, fundedCheckpoint: {} }), /funded accounting checkpoint/);
  for (const change of [
    next => { next.closing.wallet = 'synthetic-other-wallet'; },
    next => { next.ledger.previousCheckpointSha256 = 'f'.repeat(64); },
    next => { next.ledger.lastInterval.fromExclusiveSlot = '39'; },
    next => { next.closing.accounts.miner.value.lastClaimGodlAt = '0'; },
    next => { next.closing.accounts.miner.value.referrer = 'synthetic-other-referrer'; },
    next => { next.closing.accounts.miner.value.lifetimeRewardsGodl = '0'; },
    next => { next.closing.accounts.miner.value.rewardsGodl = '1200000000000'; },
  ]) assert.throws(() => projectEarnings(mutate(change)));
  const corrupt = structuredClone(chain.next); corrupt.closing.observedAt = '2026-01-02T10:29:00.000Z';
  assert.throws(() => projectEarnings({ ...input, fundedCheckpoint: corrupt }), /provenance/);
});

test('funded loader restores a complete suffix, rejects linked gaps and forks, and ignores unrelated partial runs', async t => {
  const chain = await fundedChain();
  const root = await mkdtemp(join(tmpdir(), 'godl-funded-earnings-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeEvidence(root, 'first', chain.first, chain.funding);
  await writeEvidence(root, 'next', chain.next, chain.spending);
  await mkdir(join(root, 'partial')); await writeFile(join(root, 'partial', 'funded-reconciliation.json'), '{broken');
  const loaded = await loadFundedCheckpoints({ checkpoint: chain.next, evidenceRoot: root });
  assert.deepEqual(loaded.map(item => item.closing.context.slot), ['40', '50']);
  assert.deepEqual(loaded.map(fundedCheckpointHash), [chain.first, chain.next].map(fundedCheckpointHash));
  const gap = structuredClone(chain.next); gap.ledger.lastInterval.fromExclusiveSlot = '39';
  await assert.rejects(loadFundedCheckpoints({ checkpoint: gap, evidenceRoot: root }), /Forked|slot link/);
  const fork = structuredClone(chain.next); fork.ledger.netUsdLamportMicro = String(BigInt(fork.ledger.netUsdLamportMicro) + 1n);
  await writeEvidence(root, 'fork', fork, chain.spending);
  await assert.rejects(loadFundedCheckpoints({ checkpoint: chain.next, evidenceRoot: root }), /Forked/);
  await rm(join(root, 'fork'), { recursive: true });
  await writeFile(join(root, 'first', 'funded-reconciliation.json'), '{broken');
  await assert.rejects(loadFundedCheckpoints({ checkpoint: chain.next, evidenceRoot: root }), /Incomplete/);
  const onlyFirst = await loadFundedCheckpoints({ checkpoint: chain.first, evidenceRoot: join(root, 'absent') });
  assert.deepEqual(onlyFirst.map(item => item.closing.context.slot), ['40']);
});

test('publication loads both chains once and funded errors retain dated closed net, closed status and independent holdings', async () => {
  const chain = await fundedChain();
  const closedStatus = { state: 'waiting', checkedAt: chain.next.closing.observedAt,
    verifiedAt: chain.closed.closing.observedAt, verifiedThroughSlot: '30', reason: 'Synthetic closed fallback' };
  chain.closed.status = closedStatus;
  const snapshot = { ...chain.next.closing, accounts: { ...chain.next.closing.accounts, board: { status: 'missing' } } };
  const view = { ...projectMonitor(snapshot, { nowMs, history: [snapshot] }),
    accounting: { state: 'current', verifiedThroughSlot: '50' } };
  for (const failure of [false, 'load', 'projection']) {
    let closedScans = 0, fundedScans = 0;
    const published = [], warnings = [], refresh = Promise.withResolvers();
    const quotes = startMarketQuotes({ cachePath: 'synthetic-cache', allowFetch: true,
      loadQuotes: async ({ allowFetch }) => allowFetch ? refresh.promise : market });
    const pending = publishEarningsViews({ view, snapshot, checkpoint: chain.closed, fundedCheckpoint: chain.next,
      evidenceRoot: 'synthetic-evidence', marketQuotes: quotes, timeZone: 'UTC', nowMs: () => nowMs,
      loadCheckpoints: async () => { closedScans++; return [chain.anchor, chain.closed]; },
      loadFunded: async () => { fundedScans++; if (failure === 'load') throw Error('synthetic missing evidence');
        return failure === 'projection' ? [chain.next] : [chain.first, chain.next]; },
      warn: warning => warnings.push(warning), publish: async value => {
        published.push(value);
        refresh.resolve({ ...market, quotes: [{ ...market.quotes[0], priceUsd: '3' }, market.quotes[1]] });
      } });
    await pending;
    assert.equal(closedScans, 1); assert.equal(fundedScans, 1); assert.equal(published.length, 3);
    assert.equal(published[0].earningsHistoryPending, true);
    assert.equal(published[0].earnings.total.throughSlot, undefined);
    assert.equal(published[1].earningsHistoryPending, undefined);
    assert.equal(published[0].earnings.holdings.unrefinedUsd, '28.000000');
    assert.equal(published[2].earnings.holdings.unrefinedUsd, '42.000000');
    assert.deepEqual(published[0].balances, view.balances);
    assert.equal(published[1].earnings.total.throughSlot, failure ? '30' : '50');
    assert.equal(published[1].accounting.verifiedThroughSlot, failure ? '30' : '50');
    assert.equal(warnings.length > 0, Boolean(failure));
  }
});

test('monitor CLI reads the funded sibling and preserves closed receipt, holdings and malformed sidecar bytes', async t => {
  const chain = await fundedChain();
  const root = await mkdtemp(join(tmpdir(), 'godl-funded-monitor-cli-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const accountingPath = join(root, 'accounting.json'), fundedPath = `${accountingPath}.funded.json`;
  const db = join(root, 'observations.sqlite'), out = join(root, 'view.json');
  const evidenceRoot = join(root, 'evidence'), prices = join(root, 'quotes.json');
  const status = checkpoint => ({ state: 'current', checkedAt: checkpoint.closing.observedAt,
    verifiedAt: checkpoint.closing.observedAt, verifiedThroughSlot: checkpoint.closing.context.slot,
    reason: 'Synthetic verified accounting' });
  chain.closed.status = status(chain.closed); chain.next.status = status(chain.next);
  await writeFile(accountingPath, JSON.stringify(chain.closed));
  await writeFile(fundedPath, JSON.stringify(chain.next));
  await writeEvidence(evidenceRoot, 'funding', chain.first, chain.funding);
  await writeEvidence(evidenceRoot, 'spending', chain.next, chain.spending);
  const quoteTime = Date.now();
  await writeFile(prices, JSON.stringify({ ...market, schemaVersion: 1,
    observedAt: new Date(quoteTime - 1000).toISOString(), expiresAt: new Date(quoteTime - 1000 + 600_000).toISOString(),
    quotes: market.quotes.map(quote => ({ ...quote, liquidityUsd: '10000', volume24hUsd: '100' })) }));
  const snapshot = { ...chain.next.closing, accounts: { ...chain.next.closing.accounts, board: { status: 'missing' } } };
  const store = new ObservationStore(db);
  try { store.append(snapshot); } finally { store.close(); }
  const args = [fileURLToPath(new URL('./monitor-cli.mjs', import.meta.url)), 'view', '--wallet', snapshot.wallet,
    '--db', db, '--out', out, '--accounting', accountingPath, '--evidence', evidenceRoot, '--prices', prices, '--time-zone', 'UTC'];
  const run = promisify(execFile);
  await run(process.execPath, args);
  let view = JSON.parse(await readFile(out, 'utf8'));
  assert.equal(view.accounting.verifiedThroughSlot, '50');
  assert.equal(view.earnings.total.throughSlot, '50');
  assert.equal(view.earnings.total.netSpendUsd, '17.001500');
  assert.equal(view.acquisitionPeriod.netSpendUsd, chain.closed.receipt.acquisitionPeriod.netSpendUsd);
  assert.equal(view.earnings.holdings.unrefinedUsd, '28.000000');
  const malformed = '{synthetic broken sidecar';
  await writeFile(fundedPath, malformed);
  const fallback = await run(process.execPath, args);
  assert.match(fallback.stderr, /Funded accounting unavailable/);
  view = JSON.parse(await readFile(out, 'utf8'));
  assert.equal(view.accounting.verifiedThroughSlot, '30');
  assert.equal(view.earnings.total.throughSlot, '30');
  assert.equal(view.earnings.holdings.unrefinedUsd, '28.000000');
  assert.equal(await readFile(fundedPath, 'utf8'), malformed);
  assert.equal(await readFile(accountingPath, 'utf8'), JSON.stringify(chain.closed));
});


test('interrupted funded publication ignores an uncommitted child while preserving committed fork detection', async t => {
  const chain = await fundedChain();
  const root = await mkdtemp(join(tmpdir(), 'godl-funded-interrupted-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeEvidence(root, 'first', chain.first, chain.funding);
  // Evidence was synced, but the process died before replacing the sidecar.
  const interrupted = structuredClone(chain.next);
  interrupted.ledger.netUsdLamportMicro = String(BigInt(interrupted.ledger.netUsdLamportMicro) + 1n);
  await writeEvidence(root, 'interrupted', interrupted, chain.spending, false);
  await writeEvidence(root, 'published', chain.next, chain.spending, false);
  assert.deepEqual((await loadFundedCheckpoints({ checkpoint: chain.next, evidenceRoot: root }))
    .map(fundedCheckpointHash), [chain.first, chain.next].map(fundedCheckpointHash));
  await writeEvidence(root, 'interrupted', interrupted, chain.spending, true);
  await assert.rejects(loadFundedCheckpoints({ checkpoint: chain.next, evidenceRoot: root }), /Forked/);
});
