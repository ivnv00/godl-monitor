// Generated synthetic accounts, balances, committed records and dates only.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { accountingFixture, indexedRow } from './test-fixtures/accounting.mjs';
import { extendClosedAccounting } from './ongoing-cost.mjs';
import { projectAccountingCheckpoint } from './accounting-service.mjs';
import { projectMonitor } from './monitor.mjs';
import { ObservationStore } from './observation-store.mjs';
import { publishEarningsViews, startMarketQuotes } from './observation-publication.mjs';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fixedNow = Date.parse('2026-01-04T10:01:00.000Z');
const run = promisify(execFile);
const cli = fileURLToPath(new URL('./monitor-cli.mjs', import.meta.url));
const dayAt = (now, offset) => new Date(now + offset * 86400000).toISOString().slice(0, 10);
const dayRow = (view, day) => view.earnings.days.find(row => row.day === day);

function market(now) {
  const observed = now - 1000;
  return { schemaVersion: 1, observedAt: new Date(observed).toISOString(),
    expiresAt: new Date(observed + 600000).toISOString(), source: 'DEX Screener', reason: null,
    quotes: [
      { asset: 'GODL', mint: 'GodL6KZ9uuUoQwELggtVzQkKmU1LfqmDokPibPeDKkhF', priceUsd: '2',
        pairAddress: 'synthetic-godl-pair', dexId: 'synthetic-dex', liquidityUsd: '10000', volume24hUsd: '100' },
      { asset: 'XAUt0', mint: 'AymATz4TCL9sWNEEV9Kvyz45CHVhDZ6kUgjTJPzLpU9P', priceUsd: '10',
        pairAddress: 'synthetic-gold-pair', dexId: 'synthetic-dex', liquidityUsd: '10000', volume24hUsd: '100' },
    ] };
}

async function fixture(t, now = fixedNow) {
  const root = await mkdtemp(join(tmpdir(), 'godl-historical-publication-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const f = await accountingFixture(), historicalDay = dayAt(now, -1), anchorDay = dayAt(now, -2);
  f.anchor.closing.observedAt = `${anchorDay}T10:00:00.000Z`;
  f.anchor.closing.accounts.miner.value.lastClaimGodlAt = String(Date.parse(`${anchorDay}T08:00:00.000Z`) / 1000);
  Object.assign(f.anchor.receipt.acquisitionPeriod, { startedAt: `${anchorDay}T09:00:00.000Z`, throughAt: `${anchorDay}T09:00:00.000Z` });
  // A synthetic saved ancestor makes the actual loader return both endpoints.
  Object.assign(f.anchor.receipt.evidence, { previousReceiptSha256: '0'.repeat(64), lastInterval: { fromExclusiveSlot: '0' } });
  f.interval.opening = structuredClone(f.anchor.closing);
  f.interval.closing.observedAt = new Date(now - 60000).toISOString();
  f.interval.closing.accounts.miner.value.lastClaimGodlAt = f.anchor.closing.accounts.miner.value.lastClaimGodlAt;
  f.interval.transactions[0].blockTime = Date.parse(`${historicalDay}T12:00:00.000Z`) / 1000;
  f.candles[0][0] = f.interval.transactions[0].blockTime;
  for (const page of Object.values(f.interval.pages)) page.rows = [indexedRow(f.interval.transactions[0])];
  const checkpoint = extendClosedAccounting({ previous: f.anchor, interval: f.interval, candles: f.candles });
  checkpoint.status = { state: 'current', checkedAt: checkpoint.closing.observedAt,
    verifiedAt: checkpoint.closing.observedAt, verifiedThroughSlot: '30', reason: 'Synthetic committed accounting' };
  const before = structuredClone(f.anchor.closing), after = structuredClone(f.interval.closing);
  Object.assign(before, { observedAt: `${historicalDay}T08:00:00.000Z`, context: { slot: '22' } });
  Object.assign(after, { observedAt: `${historicalDay}T18:00:00.000Z`, context: { slot: '28' } });
  const evidenceRoot = join(root, 'evidence'), anchorDirectory = join(evidenceRoot, 'anchor');
  checkpoint.evidenceDirectory = join(evidenceRoot, 'closing');
  await mkdir(anchorDirectory, { recursive: true });
  await mkdir(checkpoint.evidenceDirectory);
  await writeFile(join(anchorDirectory, 'reconciliation.json'), JSON.stringify({
    priorReceiptSha256: f.anchor.receipt.evidence.previousReceiptSha256, receipt: f.anchor.receipt,
    interval: { fromExclusiveSlot: '0', toInclusiveSlot: '20', closing: f.anchor.closing },
  }));
  const record = { priorReceiptSha256: digest(f.anchor.receipt), receipt: checkpoint.receipt,
    interval: f.interval, priceEvidence: { candles: f.candles } };
  const source = join(checkpoint.evidenceDirectory, 'reconciliation.json');
  await writeFile(source, JSON.stringify(record));
  const accountingPath = join(root, 'accounting.json'), db = join(root, 'observations.sqlite');
  const prices = join(root, 'quotes.json');
  await writeFile(accountingPath, JSON.stringify(checkpoint));
  await writeFile(prices, JSON.stringify(market(now)), { mode: 0o600 });
  const snapshot = { ...checkpoint.closing, accounts: { ...checkpoint.closing.accounts, board: { status: 'missing' } } };
  const store = new ObservationStore(db);
  for (const value of [f.anchor.closing, before, after, snapshot]) store.append(value);
  t.after(() => store.close());
  const view = { ...projectMonitor(snapshot, { nowMs: now, history: store.list(snapshot) }),
    ...projectAccountingCheckpoint(snapshot, checkpoint) };
  return { root, checkpoint, snapshot, view, store, historicalDay, now, record, source, evidenceRoot,
    accountingPath, prices, db, out: join(root, 'view.json') };
}

// Include directory contents and bytes so recovery cannot hide a new evidence/cache file.
async function immutableEvidence(f) {
  async function tree(directory) {
    const result = [];
    for (const name of (await readdir(directory)).sort()) {
      const path = join(directory, name);
      try { result.push([name, await tree(path)]); }
      catch (error) { if (error.code !== 'ENOTDIR') throw error; result.push([name, await readFile(path, 'utf8')]); }
    }
    return result;
  }
  return { evidence: await tree(f.evidenceRoot), accounting: await readFile(f.accountingPath, 'utf8'),
    prices: await readFile(f.prices, 'utf8'),
    rows: f.store.database.prepare('SELECT * FROM observations ORDER BY slot_key').all(),
    changes: f.store.database.prepare('SELECT total_changes() AS value').get().value };
}

function publish(f, extra = {}) {
  return publishEarningsViews({ view: f.view, snapshot: f.snapshot, checkpoint: f.checkpoint,
    evidenceRoot: f.evidenceRoot, timeZone: 'UTC', nowMs: () => f.now,
    marketQuotes: startMarketQuotes({ cachePath: f.prices, allowFetch: false, loadQuotes: async () => market(f.now) }),
    readObservations: options => f.store.accountingBoundaries(options), warn: () => {}, ...extra });
}

test('publishes holdings before historical lookup and later adds exact partial-day net from saved evidence', async t => {
  const f = await fixture(t), unchanged = await immutableEvidence(f);
  const serializedInput = JSON.stringify({ checkpoint: f.checkpoint, snapshot: f.snapshot, view: f.view });
  const entered = Promise.withResolvers(), release = Promise.withResolvers(), published = [];
  const pending = publish(f, { publish: async view => published.push(view), readObservations: async options => {
    assert.equal(published.length, 1, 'the complete initial view must precede optional lookup');
    assert.equal(published[0].earnings.holdings.unrefinedUsd, '24.000000');
    assert.equal(dayRow(published[0], f.historicalDay).coverage, 'unavailable');
    assert.equal(options.fromSlot, '20'); assert.equal(options.toSlot, '30'); assert.equal(options.funded, false);
    entered.resolve(); await release.promise;
    return f.store.accountingBoundaries(options);
  } });
  try {
    await Promise.race([entered.promise, pending.then(() => { throw Error('Historical lookup was never entered'); })]);
    assert.equal(published.length, 1);
  } finally { release.resolve(); }
  const final = await pending;
  assert.equal(published.length, 2);
  const day = dayRow(final, f.historicalDay);
  assert.equal(day.coverage, 'partial'); assert.equal(day.netSpendUsd, '3.000500');
  assert.equal(day.netRewardUsd, '2.999500'); assert.equal(day.fromSlot, '22'); assert.equal(day.throughSlot, '28');
  assert.equal(day.fromAt, `${f.historicalDay}T08:00:00.000Z`); assert.equal(day.throughAt, `${f.historicalDay}T18:00:00.000Z`);
  assert.match(day.reason, /recovered/); assert.match(day.reason, /midnight coverage is not implied/);
  assert.deepEqual(final.earnings.total, published[0].earnings.total);
  assert.deepEqual(final.earnings.holdings, published[0].earnings.holdings);
  assert.deepEqual(final.accounting, published[0].accounting);
  assert.deepEqual(final.acquisitionPeriod, published[0].acquisitionPeriod);
  assert.equal(JSON.stringify({ checkpoint: f.checkpoint, snapshot: f.snapshot, view: f.view }), serializedInput);
  assert.deepEqual(await immutableEvidence(f), unchanged);
});

test('missing or corrupt optional source/snapshots preserve the verified cumulative view and current holdings', async t => {
  const cases = ['missing-source', 'malformed-source', 'bad-prices', 'wrong-source', 'missing-snapshots', 'malformed-snapshots', 'lookup-error'];
  for (const failure of cases) await t.test(failure, async t => {
    const f = await fixture(t);
    if (failure === 'missing-source') await rm(f.source);
    if (failure === 'malformed-source') await writeFile(f.source, '{synthetic-broken-record');
    if (failure === 'bad-prices') await writeFile(f.source, JSON.stringify({ ...f.record, priceEvidence: { candles: [] } }));
    if (failure === 'wrong-source') {
      for (const slot of ['22', '28']) {
        const value = f.store.list(f.snapshot).find(item => item.context.slot === slot);
        value.sourceCommit = 'synthetic-unsupported-source';
        f.store.database.prepare('UPDATE observations SET snapshot_json = ? WHERE slot_key = ?')
          .run(JSON.stringify(value), slot.padStart(20, '0'));
      }
    }
    if (failure === 'missing-snapshots') f.store.database.prepare("DELETE FROM observations WHERE slot_key IN (?, ?)")
      .run('22'.padStart(20, '0'), '28'.padStart(20, '0'));
    if (failure === 'malformed-snapshots') f.store.database.prepare("UPDATE observations SET snapshot_json = ? WHERE slot_key IN (?, ?)")
      .run('{synthetic-broken-snapshot', '22'.padStart(20, '0'), '28'.padStart(20, '0'));
    const unchanged = await immutableEvidence(f), published = [];
    const final = await publish(f, { publish: async view => published.push(view),
      ...(failure === 'lookup-error' ? { readObservations: async () => { throw Error('Synthetic unavailable database'); } } : {}) });
    assert.equal(published.length, 1);
    assert.equal(dayRow(final, f.historicalDay).coverage, 'unavailable');
    assert.equal(dayRow(final, f.historicalDay).netSpendUsd, undefined);
    assert.equal(final.accounting.verifiedThroughSlot, '30');
    assert.equal(final.earnings.total.throughSlot, '30');
    assert.equal(final.earnings.total.netSpendUsd, '13.001000');
    assert.equal(final.earnings.holdings.unrefinedUsd, '24.000000');
    assert.deepEqual(final, published[0]);
    assert.deepEqual(await immutableEvidence(f), unchanged);
  });
});

test('monitor CLI view uses saved observation boundaries without changing history or evidence', async t => {
  const f = await fixture(t, Date.now()), unchanged = await immutableEvidence(f);
  const reply = await run(process.execPath, [cli, 'view', '--wallet', f.snapshot.wallet, '--db', f.db,
    '--out', f.out, '--accounting', f.accountingPath, '--evidence', f.evidenceRoot,
    '--prices', f.prices, '--time-zone', 'UTC', '--notify']);
  const final = JSON.parse(await readFile(f.out, 'utf8'));
  assert.equal(reply.stdout, 'view-ready\nview-ready\n');
  assert.equal(dayRow(final, f.historicalDay).netSpendUsd, '3.000500');
  assert.equal(dayRow(final, f.historicalDay).netRewardUsd, '2.999500');
  assert.equal(final.earnings.total.netSpendUsd, '13.001000');
  assert.equal(final.accounting.verifiedThroughSlot, '30');
  assert.equal(final.earnings.holdings.unrefinedUsd, '24.000000');
  assert.deepEqual(await immutableEvidence(f), unchanged);
});
