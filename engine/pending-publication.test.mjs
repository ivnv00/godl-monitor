// Generated synthetic accounts and balances only; no network or user runtime state.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extendFundedAccounting, fundedCheckpointHash, projectFundedPosition } from './funded-accounting.mjs';
import { extendClosedAccounting } from './ongoing-cost.mjs';
import { publishEarningsViews } from './observation-publication.mjs';
import { projectMonitor } from './monitor.mjs';
import { accountingFixture, indexedRow } from './test-fixtures/accounting.mjs';

const nowMs = Date.parse('2026-01-02T10:31:00.000Z');
const market = { observedAt: '2026-01-02T10:30:00.000Z', expiresAt: '2026-01-02T10:32:00.000Z',
  source: 'DEX Screener', reason: null, goldReference: { source: 'CoinGecko', assetId: 'tether-gold',
    priceUsd: '10', observedAt: '2026-01-02T10:30:00.000Z' }, quotes: [
    { asset: 'GODL', mint: 'GodL6KZ9uuUoQwELggtVzQkKmU1LfqmDokPibPeDKkhF',
      priceUsd: '2', pairAddress: 'synthetic-godl-pair', dexId: 'synthetic-dex' },
    { asset: 'XAUt0', mint: 'AymATz4TCL9sWNEEV9Kvyz45CHVhDZ6kUgjTJPzLpU9P',
      priceUsd: '10', pairAddress: 'synthetic-gold-pair', dexId: 'synthetic-dex' },
  ] };

async function openHistory() {
  const fixture = await accountingFixture();
  const closed = extendClosedAccounting({ previous: fixture.anchor, interval: fixture.interval, candles: fixture.candles });
  const interval = structuredClone(fixture.interval);
  interval.opening = structuredClone(closed.closing);
  interval.fromExclusiveSlot = '30'; interval.toInclusiveSlot = '40';
  interval.closing = structuredClone(closed.closing);
  interval.closing.context.slot = '40'; interval.closing.observedAt = '2026-01-02T10:20:00.000Z';
  Object.assign(interval.closing.accounts.miner.value, { roundId: '2', lifetimeDeployed: '20000000',
    deployed: ['20000000', ...Array(24).fill('0')] });
  const tx = interval.transactions[0];
  Object.assign(tx, { signature: '4'.repeat(88), slot: '35', blockTime: Date.parse('2026-01-02T10:15:00.000Z') / 1000 });
  Object.assign(tx.deltas.wallet, { beforeLamports: '1000000000', afterLamports: '979995000', changeLamports: '-20005000' });
  for (const page of Object.values(interval.pages)) page.rows = [indexedRow(tx)];
  const pending = extendFundedAccounting({ previous: closed, interval,
    candles: [[tx.blockTime, 200, 200, 200, 200, 1]] });
  const nextInterval = { wallet: fixture.wallet, trackedAccounts: fixture.trackedAccounts,
    opening: structuredClone(pending.closing), closing: structuredClone(pending.closing),
    fromExclusiveSlot: '40', toInclusiveSlot: '50', transactions: [],
    pages: Object.fromEntries(Object.entries(fixture.trackedAccounts).map(([role, address]) =>
      [role, { address, rows: [], exhausted: true }])) };
  nextInterval.closing.context.slot = '50'; nextInterval.closing.observedAt = '2026-01-02T10:30:00.000Z';
  const latest = extendFundedAccounting({ previous: pending, interval: nextInterval });
  closed.status = { state: 'waiting', checkedAt: latest.closing.observedAt,
    verifiedAt: closed.closing.observedAt, verifiedThroughSlot: '30', reason: 'Synthetic dated closed accounting' };
  return { closed, pending, latest, interval, nextInterval };
}

async function writeFundedEvidence(root, name, checkpoint, interval) {
  const directory = join(root, name);
  await mkdir(directory, { recursive: true });
  const path = join(directory, 'funded-reconciliation.json');
  const bytes = JSON.stringify({ checkpoint, interval });
  await writeFile(path, bytes);
  const checkpointSha256 = fundedCheckpointHash(checkpoint);
  await mkdir(join(root, 'funded-commits'), { recursive: true });
  await writeFile(join(root, 'funded-commits', `${checkpointSha256}.json`), JSON.stringify({ schemaVersion: 1, checkpointSha256 }));
  return { path, bytes };
}

test('publication emits the open v2 position and preserves dated closed net and holdings when funded evidence is missing or corrupt', async t => {
  const chain = await openHistory();
  const root = await mkdtemp(join(tmpdir(), 'godl-pending-publication-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const prior = await writeFundedEvidence(root, 'pending', chain.pending, chain.interval);
  await writeFundedEvidence(root, 'latest', chain.latest, chain.nextInterval);
  const checkpointBytes = JSON.stringify(chain.closed);
  const snapshot = { ...chain.latest.closing, accounts: { ...chain.latest.closing.accounts, board: { status: 'missing' } } };
  const view = { ...projectMonitor(snapshot, { nowMs, history: [snapshot] }),
    accounting: { state: 'current', verifiedAt: snapshot.observedAt, verifiedThroughSlot: '50' } };
  for (const mode of ['valid', 'missing', 'corrupt']) {
    if (mode === 'missing') await rm(prior.path);
    if (mode === 'corrupt') await writeFile(prior.path, '{synthetic interrupted evidence');
    const published = [], warnings = [];
    const result = await publishEarningsViews({ view, snapshot, checkpoint: chain.closed, fundedCheckpoint: chain.latest,
      evidenceRoot: root, marketQuotes: { cached: Promise.resolve(market), refreshed: Promise.resolve(market),
        settled: true, market }, timeZone: 'UTC', nowMs: () => nowMs,
      publish: async value => published.push(structuredClone(value)), warn: value => warnings.push(value) });
    assert.equal(published.length, 2);
    assert.equal(published[0].earningsHistoryPending, true);
    assert.equal(result.earningsHistoryPending, undefined);
    assert.deepEqual(published[1], result);
    assert.equal(result.earnings.total.throughSlot, '30');
    assert.equal(result.earnings.total.throughAt, chain.closed.closing.observedAt);
    assert.equal(result.earnings.total.netSpendUsd, '13.001000');
    assert.equal(result.earnings.total.netPnlUsd, '10.999000');
    assert.equal(result.earnings.holdings.unrefinedUsd, '24.000000');
    assert.equal(result.earnings.holdings.refinedUsd, '5.000000');
    assert.equal(result.earnings.holdings.goldUsd, '4.000000');
    assert.deepEqual(result.balances, view.balances);
    if (mode === 'valid') {
      assert.equal(result.earnings.schemaVersion, 2);
      assert.deepEqual(result.earnings.position, projectFundedPosition(chain.latest));
      assert.equal(result.earnings.position.netReady, false);
      assert.equal(result.earnings.position.netSpendUsd, '17.002000');
      assert.equal(result.earnings.position.pendingRound.deployedSol.lamports, '20000000');
      assert.equal(result.accounting.verifiedThroughSlot, '50');
      assert.deepEqual(warnings, []);
      assert.equal(await readFile(prior.path, 'utf8'), prior.bytes);
    } else {
      assert.equal(result.earnings.schemaVersion, 1);
      assert.equal(result.earnings.position, undefined);
      assert.deepEqual(result.accounting, chain.closed.status);
      assert.equal(warnings.length, 1);
      assert.match(warnings[0], /Funded earnings history unavailable/);
      if (mode === 'corrupt') assert.equal(await readFile(prior.path, 'utf8'), '{synthetic interrupted evidence');
    }
    assert.equal(JSON.stringify(chain.closed), checkpointBytes);
  }
});
