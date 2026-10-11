// Generated synthetic snapshots and monetary evidence; no RPC or real wallet data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ObservationStore } from './observation-store.mjs';
import { accountingFixture, indexedRow } from './test-fixtures/accounting.mjs';
import { extendClosedAccounting } from './ongoing-cost.mjs';
import { extendFundedAccounting } from './funded-accounting.mjs';

const run = promisify(execFile);
const cli = fileURLToPath(new URL('./earnings-history-cli.mjs', import.meta.url));
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const genericError = 'Selected earnings history unavailable; local evidence could not be verified.\n';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'godl-selected-week-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const f = await accountingFixture();
  Object.assign(f.anchor.receipt.evidence, { previousReceiptSha256: '0'.repeat(64), lastInterval: { fromExclusiveSlot: '0' } });
  f.interval.closing.observedAt = '2026-01-20T10:10:00.000Z';
  f.interval.transactions[0].blockTime = Date.parse('2026-01-03T12:00:00.000Z') / 1000;
  f.candles[0][0] = f.interval.transactions[0].blockTime;
  for (const page of Object.values(f.interval.pages)) page.rows = [indexedRow(f.interval.transactions[0])];
  const checkpoint = extendClosedAccounting({ previous: f.anchor, interval: f.interval, candles: f.candles });
  const evidence = join(root, 'evidence');
  const anchorDirectory = join(evidence, 'anchor'), closingDirectory = join(evidence, 'closing');
  checkpoint.evidenceDirectory = closingDirectory;
  await mkdir(anchorDirectory, { recursive: true }); await mkdir(closingDirectory);
  await writeFile(join(anchorDirectory, 'reconciliation.json'), JSON.stringify({ priorReceiptSha256: '0'.repeat(64),
    receipt: f.anchor.receipt, interval: { fromExclusiveSlot: '0', toInclusiveSlot: '20', closing: f.anchor.closing } }));
  const source = join(closingDirectory, 'reconciliation.json');
  await writeFile(source, JSON.stringify({ priorReceiptSha256: digest(f.anchor.receipt), receipt: checkpoint.receipt,
    interval: f.interval, priceEvidence: { candles: f.candles } }));
  const accounting = join(root, 'accounting.json'), prices = join(root, 'quotes.json'), db = join(root, 'observations.sqlite');
  await writeFile(accounting, JSON.stringify(checkpoint));
  const now = Date.now();
  await writeFile(prices, JSON.stringify({ schemaVersion: 1, source: 'DEX Screener', reason: null,
    observedAt: new Date(now - 1000).toISOString(), expiresAt: new Date(now + 599000).toISOString(),
    quotes: [ { asset: 'GODL', mint: 'GodL6KZ9uuUoQwELggtVzQkKmU1LfqmDokPibPeDKkhF', priceUsd: '2', pairAddress: 'synthetic-pair', dexId: 'synthetic' },
      { asset: 'XAUt0', mint: 'AymATz4TCL9sWNEEV9Kvyz45CHVhDZ6kUgjTJPzLpU9P', priceUsd: '10', pairAddress: 'synthetic-gold', dexId: 'synthetic' } ] }), { mode: 0o644 });
  const before = structuredClone(f.anchor.closing), after = structuredClone(checkpoint.closing);
  Object.assign(before, { observedAt: '2026-01-03T08:00:00.000Z', context: { slot: '22' } });
  Object.assign(after, { observedAt: '2026-01-03T18:00:00.000Z', context: { slot: '28' } });
  const store = new ObservationStore(db);
  for (const snapshot of [f.anchor.closing, before, after, checkpoint.closing]) store.append(snapshot);
  store.close();
  const args = [cli, '--wallet', f.wallet, '--db', db, '--accounting', accounting,
    '--prices', prices, '--evidence', evidence, '--time-zone', 'UTC', '--end-day', '2026-01-03'];
  return { root, f, checkpoint, db, prices, accounting, source, args };
}

async function savedFiles(root) {
  const result = [];
  for (const name of (await readdir(root)).sort()) {
    // SQLite read-only connections may create shared-memory coordination files.
    if (name.endsWith('-wal') || name.endsWith('-shm')) continue;
    const path = join(root, name), info = await stat(path);
    result.push([name, info.mode, info.isDirectory() ? await savedFiles(path) : (await readFile(path)).toString('base64')]);
  }
  return result;
}

test('CLI replays an older selected week from saved evidence and leaves database, prices and source bytes unchanged', async t => {
  const f = await fixture(t), before = await savedFiles(f.root);
  const { stdout, stderr } = await run(process.execPath, f.args);
  assert.equal(stderr, '');
  const response = JSON.parse(stdout);
  assert.equal(response.schemaVersion, 1); assert.equal(response.commitment, 'finalized');
  for (const name of ['wallet', 'genesisHash', 'programAddress', 'sourceCommit', 'observedAt'])
    assert.equal(response[name], f.checkpoint.closing[name]);
  assert.equal(response.slot, '30'); assert.equal(response.endDay, '2026-01-03');
  assert.deepEqual(response.earnings.days.map(row => row.day), ['2026-01-03', '2026-01-02', '2026-01-01',
    '2025-12-31', '2025-12-30', '2025-12-29', '2025-12-28']);
  const row = response.earnings.days[0];
  assert.equal(row.coverage, 'partial'); assert.equal(row.fromSlot, '22'); assert.equal(row.throughSlot, '28');
  assert.equal(row.netSpendUsd, '3.000500'); assert.equal(row.netRewardUsd, '2.999500');
  assert.equal(response.earnings.historyStartDay, '2026-01-02');
  assert.equal(response.earnings.total.throughAt, '2026-01-20T10:10:00.000Z');
  assert.equal(response.earnings.total.netSpendUsd, '13.001000');
  assert.equal(response.earnings.holdings.unrefinedUsd, '24.000000');
  assert.deepEqual(await savedFiles(f.root), before);
});

test('CLI safely rejects invalid arguments, absent accounts, unsupported sources and corrupt checkpoint chains', async t => {
  const f = await fixture(t);
  const invalid = [ [...f.args, '--end-day', '2026-01-03'], [...f.args, '--rpc', 'https://synthetic.invalid/private'],
    f.args.map(value => value === '2026-01-03' ? '2026-02-30' : value),
    f.args.map(value => value === f.f.wallet ? '11111111111111111111111111111111' : value),
    f.args.map(value => value === f.db ? join(f.root, 'absent', 'db') : value) ];
  for (const args of invalid) await assert.rejects(run(process.execPath, args), error =>
    error.code === 1 && error.stdout === '' && error.stderr === genericError);
  const original = await readFile(f.accounting, 'utf8');
  for (const value of ['{broken', JSON.stringify({ ...f.checkpoint, closing: { ...f.checkpoint.closing, sourceCommit: 'unsupported-private-source' } }),
    JSON.stringify({ ...f.checkpoint, receipt: { ...f.checkpoint.receipt, evidence: { ...f.checkpoint.receipt.evidence,
      lastInterval: { ...f.checkpoint.receipt.evidence.lastInterval, fromExclusiveSlot: '21' } } } })]) {
    await writeFile(f.accounting, value);
    await assert.rejects(run(process.execPath, f.args), error => error.code === 1 && error.stdout === '' && error.stderr === genericError);
  }
  await writeFile(f.accounting, original);
});

test('missing optional recovery or quotes keeps verified totals and unknown older-day values', async t => {
  const f = await fixture(t);
  await rm(f.prices);
  const withoutPrices = JSON.parse((await run(process.execPath, f.args)).stdout).earnings;
  assert.equal(withoutPrices.days[0].netSpendUsd, '3.000500');
  assert.equal(withoutPrices.days[0].netRewardUsd, undefined); assert.deepEqual(withoutPrices.holdings, {});
  await rm(f.source);
  const noRecovery = JSON.parse((await run(process.execPath, f.args)).stdout).earnings;
  assert.equal(noRecovery.days[0].coverage, 'unavailable');
  assert.equal(noRecovery.total.netSpendUsd, '13.001000');
  assert.equal(noRecovery.historyStartDay, '2026-01-02');
});

test('funded schema-two sidecars preserve selected closed history and corrupt supplied sidecars fail safely', async t => {
  const f = await fixture(t), interval = structuredClone(f.f.interval);
  interval.fromExclusiveSlot = '30'; interval.toInclusiveSlot = '40';
  interval.opening = structuredClone(f.checkpoint.closing); interval.closing = structuredClone(f.checkpoint.closing);
  interval.closing.context.slot = '40'; interval.closing.observedAt = '2026-01-21T10:10:00.000Z';
  interval.closing.accounts.automationV2 = { address: f.f.trackedAccounts.automationV2, status: 'present',
    lamports: '30000000', value: { authority: f.f.wallet, balance: '28000000' } };
  const tx = interval.transactions[0];
  tx.slot = '35'; tx.signature = '4'.repeat(88); tx.blockTime = Date.parse('2026-01-21T10:05:00.000Z') / 1000;
  tx.godlInstructions[0].dataBase58 = '24';
  tx.deltas.automationV2 = { address: f.f.trackedAccounts.automationV2, status: 'observed',
    beforeLamports: '0', afterLamports: '30000000', changeLamports: '30000000' };
  for (const page of Object.values(interval.pages)) page.rows = [indexedRow(tx)];
  const funded = extendFundedAccounting({ previous: f.checkpoint, interval,
    candles: [[tx.blockTime, 100, 100, 100, 100, 1]] });
  const sidecar = `${f.accounting}.funded.json`;
  await writeFile(sidecar, JSON.stringify(funded));
  const writer = new ObservationStore(f.db); writer.append(funded.closing); writer.close();
  const response = JSON.parse((await run(process.execPath, f.args)).stdout);
  assert.equal(response.slot, '40'); assert.equal(response.earnings.schemaVersion, 2);
  assert.equal(response.earnings.days[0].netRewardUsd, '2.999500');
  assert.equal(response.earnings.total.throughSlot, '40');
  assert.equal(response.earnings.total.netSpendUsd, '13.001500');
  for (const corrupt of ['null', 'false', '{broken']) {
    await writeFile(sidecar, corrupt);
    await assert.rejects(run(process.execPath, f.args), error => error.code === 1 && error.stderr === genericError && error.stdout === '');
    assert.equal(await readFile(sidecar, 'utf8'), corrupt);
  }
});
