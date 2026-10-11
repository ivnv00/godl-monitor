// Generated synthetic accounting evidence only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { projectEarnings } from './earnings.mjs';
import { extendClosedAccounting } from './ongoing-cost.mjs';
import { accountingFixture } from './test-fixtures/accounting.mjs';

test('selecting an older week changes only dated rows and exposes the earliest verified closing date', async () => {
  const f = await accountingFixture();
  const checkpoint = extendClosedAccounting({ previous: f.anchor, interval: f.interval, candles: f.candles });
  const input = { snapshot: checkpoint.closing, checkpoint, checkpoints: [f.anchor, checkpoint],
    timeZone: 'UTC', nowMs: Date.parse('2026-01-20T12:00:00.000Z') };
  const current = projectEarnings(input);
  const older = projectEarnings({ ...input, endDay: '2026-01-02' });
  assert.deepEqual(older.days.map(row => row.day), ['2026-01-02', '2026-01-01', '2025-12-31',
    '2025-12-30', '2025-12-29', '2025-12-28', '2025-12-27']);
  assert.equal(older.days[0].netSpendUsd, '3.000500');
  assert.equal(older.historyStartDay, '2026-01-02');
  assert.deepEqual(older.total, current.total);
  assert.deepEqual(older.holdings, current.holdings);
});

test('selected calendar weeks cross leap day and DST without changing actual quote freshness', () => {
  const snapshot = { accounts: {} };
  const nowMs = Date.parse('2024-04-01T01:00:00.000Z');
  const input = { snapshot, timeZone: 'Europe/Sofia', nowMs };
  assert.deepEqual(projectEarnings({ ...input, endDay: '2024-03-02' }).days.map(row => row.day),
    ['2024-03-02', '2024-03-01', '2024-02-29', '2024-02-28', '2024-02-27', '2024-02-26', '2024-02-25']);
  const dst = projectEarnings({ ...input, endDay: '2024-03-31', market: { source: 'DEX Screener', quotes: [],
    observedAt: '2024-03-31T00:00:00.000Z', expiresAt: '2024-03-31T00:10:00.000Z' } });
  assert.deepEqual(dst.days.map(row => row.day), ['2024-03-31', '2024-03-30', '2024-03-29',
    '2024-03-28', '2024-03-27', '2024-03-26', '2024-03-25']);
  assert.match(dst.market.reason, /expired/);
  assert.equal(Object.hasOwn(dst, 'historyStartDay'), false);
  for (const endDay of ['2024-02-30', '2024-2-29', '2024-04-02', '', null, '0000-01-01'])
    assert.throws(() => projectEarnings({ ...input, endDay }), /end day/i);
});

test('the older week end does not receive the actual-today complete-reward endpoint preference', async () => {
  const f = await accountingFixture();
  f.anchor.closing.accounts.goldVault.status = 'missing';
  const interval = structuredClone(f.interval);
  interval.closing = structuredClone(f.anchor.closing);
  interval.closing.accounts.goldVault = structuredClone(f.interval.closing.accounts.goldVault);
  interval.toInclusiveSlot = '22'; interval.closing.context.slot = '22';
  interval.closing.observedAt = '2026-01-02T10:02:00.000Z';
  interval.transactions = []; for (const page of Object.values(interval.pages)) page.rows = [];
  const middle = extendClosedAccounting({ previous: f.anchor, interval, candles: [] });
  f.interval.fromExclusiveSlot = '22';
  const latest = extendClosedAccounting({ previous: middle, interval: f.interval, candles: f.candles });
  const input = { snapshot: latest.closing, checkpoint: latest, checkpoints: [f.anchor, middle, latest],
    timeZone: 'UTC', endDay: '2026-01-02' };
  assert.equal(projectEarnings({ ...input, nowMs: Date.parse('2026-01-02T12:00:00Z') }).days[0].fromSlot, '22');
  assert.equal(projectEarnings({ ...input, nowMs: Date.parse('2026-01-20T12:00:00Z') }).days[0].fromSlot, '20');
});
