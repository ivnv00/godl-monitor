import test from 'node:test';
import assert from 'node:assert/strict';
import { startMarketQuotes, publishEarningsViews } from './observation-publication.mjs';
import { projectMonitor } from './monitor.mjs';
import { accountingFixture } from './test-fixtures/accounting.mjs';
import { GODL_MINT } from './market-quotes.mjs';

const now = Date.parse('2026-01-02T10:01:00.000Z');
const market = priceUsd => ({ observedAt: new Date(now - 60_000).toISOString(),
  expiresAt: new Date(now + 60_000).toISOString(), source: 'DEX Screener', reason: null,
  quotes: [{ asset: 'GODL', mint: GODL_MINT, priceUsd, pairAddress: 'synthetic-pair', dexId: 'synthetic-dex' }] });
const monitorView = snapshot => projectMonitor({ ...snapshot,
  accounts: { ...snapshot.accounts, board: { status: 'missing' } } }, { nowMs: now, history: [snapshot] });

test('deferred quote refresh publishes cached current holdings then enriches the same snapshot, scanning history once', async () => {
  const { anchor } = await accountingFixture();
  const snapshot = anchor.closing, view = monitorView(snapshot);
  const refresh = Promise.withResolvers(), first = Promise.withResolvers();
  let scans = 0;
  const calls = [], published = [];
  const quotes = startMarketQuotes({ cachePath: 'synthetic-cache', allowFetch: true,
    loadQuotes: async ({ allowFetch }) => { calls.push(allowFetch); return allowFetch ? refresh.promise : market('2'); } });
  const pending = publishEarningsViews({ view, snapshot, checkpoint: anchor, evidenceRoot: 'synthetic-evidence',
    marketQuotes: quotes, nowMs: () => now, timeZone: 'UTC',
    loadCheckpoints: async () => { scans++; return [anchor]; },
    publish: async value => { published.push(structuredClone(value)); first.resolve(); } });
  await first.promise;
  assert.deepEqual(calls, [false, true]);
  assert.equal(published.length, 1);
  assert.equal(published[0].earnings.holdings.unrefinedUsd, '20.000000');
  refresh.resolve(market('3'));
  await pending;
  assert.equal(scans, 1);
  assert.equal(published.length, 2);
  assert.equal(published[1].earnings.holdings.unrefinedUsd, '30.000000');
  assert.deepEqual(published[1].provenance, published[0].provenance);
  assert.deepEqual(published[1].balances, published[0].balances);
  assert.deepEqual(published[1].history, published[0].history);
});

test('already completed or unchanged market refresh publishes only once', async () => {
  const { anchor } = await accountingFixture();
  const quotes = startMarketQuotes({ cachePath: 'synthetic-cache', allowFetch: true,
    loadQuotes: async ({ allowFetch }) => market(allowFetch ? '3' : '2') });
  await quotes.refreshed;
  const published = [];
  await publishEarningsViews({ view: monitorView(anchor.closing), snapshot: anchor.closing,
    marketQuotes: quotes, nowMs: () => now, timeZone: 'UTC', publish: async value => published.push(value) });
  assert.equal(published.length, 1);
  assert.equal(published[0].earnings.holdings.unrefinedUsd, '30.000000');

  const refresh = Promise.withResolvers();
  let publications = 0;
  const same = startMarketQuotes({ cachePath: 'synthetic-cache', allowFetch: true,
    loadQuotes: async ({ allowFetch }) => allowFetch ? refresh.promise : market('2') });
  const pending = publishEarningsViews({ view: monitorView(anchor.closing), snapshot: anchor.closing,
    marketQuotes: same, nowMs: () => now, timeZone: 'UTC', publish: async () => { publications++; refresh.resolve(market('2')); } });
  await pending;
  assert.equal(publications, 1);
});

test('failed market refresh and invalid history keep current balances and independent holdings without net history', async () => {
  const { anchor } = await accountingFixture();
  for (const broken of ['load', 'projection']) {
    const snapshot = structuredClone(anchor.closing);
    snapshot.accounts.miner.value.rewardsGodl = '1100000000000';
    snapshot.accounts.treasury.value.totalUnclaimed = '1100000000000';
    const view = monitorView(snapshot), published = [], warnings = [];
    const quotes = startMarketQuotes({ cachePath: 'synthetic-cache', allowFetch: true,
      loadQuotes: async ({ allowFetch }) => { if (allowFetch) throw new Error('synthetic provider failure'); return market('2'); } });
    await publishEarningsViews({ view, snapshot, checkpoint: anchor, evidenceRoot: 'synthetic-evidence',
      marketQuotes: quotes, nowMs: () => now, timeZone: 'UTC', warn: message => warnings.push(message),
      loadCheckpoints: async () => { if (broken === 'load') throw new Error('synthetic unreadable history'); return [{}]; },
      publish: async value => published.push(value) });
    assert.equal(published.length, 1);
    assert.deepEqual(published[0].balances, view.balances);
    assert.equal(published[0].earnings.holdings.unrefinedUsd, '22.000000');
    assert.ok(published[0].earnings.days.every(day => day.coverage === 'unavailable'));
    assert.equal(published[0].earnings.total.netPnlUsd, undefined);
    assert.ok(warnings.length > 0);
  }
});
