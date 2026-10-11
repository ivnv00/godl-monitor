import test from 'node:test';
import assert from 'node:assert/strict';
import { startMarketQuotes, publishEarningsViews } from './observation-publication.mjs';
import { projectMonitor } from './monitor.mjs';
import { accountingFixture } from './test-fixtures/accounting.mjs';
import { GODL_MINT } from './market-quotes.mjs';
import { extendFundedAccounting } from './funded-accounting.mjs';

const now = Date.parse('2026-01-02T10:11:00.000Z');
const market = priceUsd => ({ observedAt: new Date(now - 60_000).toISOString(),
  expiresAt: new Date(now + 60_000).toISOString(), source: 'DEX Screener', reason: null,
  quotes: [{ asset: 'GODL', mint: GODL_MINT, priceUsd, pairAddress: 'synthetic-pair', dexId: 'synthetic-dex' }] });
const monitorView = snapshot => projectMonitor({ ...snapshot,
  accounts: { ...snapshot.accounts, board: { status: 'missing' } } }, { nowMs: now, history: [snapshot] });

test('validated balances publish while the closed accounting history loader is held', async () => {
  const { anchor } = await accountingFixture();
  const snapshot = anchor.closing, view = monitorView(snapshot), published = [];
  const entered = Promise.withResolvers(), release = Promise.withResolvers();
  const before = JSON.stringify({ snapshot, view, anchor });
  const quotes = startMarketQuotes({ cachePath: 'synthetic-cache', allowFetch: false,
    loadQuotes: async () => market('2') });
  const pending = publishEarningsViews({ view, snapshot, checkpoint: anchor, evidenceRoot: 'synthetic-evidence',
    marketQuotes: quotes, nowMs: () => now, timeZone: 'UTC',
    loadCheckpoints: async () => { entered.resolve(); await release.promise; return [anchor]; },
    publish: async value => published.push(structuredClone(value)) });
  try {
    await entered.promise;
    assert.equal(published.length, 1, 'balances must be published before optional chain reads complete');
    assert.deepEqual(published[0].balances, view.balances);
    assert.deepEqual(published[0].provenance, view.provenance);
    assert.equal(published[0].earnings.holdings.unrefinedUsd, '20.000000');
    assert.equal(published[0].earningsHistoryPending, true);
    assert.ok(published[0].earnings.days.every(day => day.coverage === 'unavailable'));
    assert.equal(published[0].earnings.total.netPnlUsd, undefined);
  } finally { release.resolve(); await pending; }
  assert.equal(published.length, 2);
  assert.equal(published[1].earningsHistoryPending, undefined);
  assert.equal(published[1].earnings.total.netPnlUsd, '9.999500');
  assert.equal(JSON.stringify({ snapshot, view, anchor }), before);
});

test('held funded history cannot delay balances and its failure clears the interim marker with closed fallback', async () => {
  const f = await accountingFixture();
  const funded = extendFundedAccounting({ previous: f.anchor, interval: f.interval, candles: f.candles });
  const snapshot = funded.closing, view = { ...monitorView(snapshot), accounting: funded.status };
  for (const fails of [false, true]) {
    const entered = Promise.withResolvers(), release = Promise.withResolvers(), published = [], warnings = [];
    const quotes = startMarketQuotes({ cachePath: 'synthetic-cache', allowFetch: false,
      loadQuotes: async () => market('2') });
    const pending = publishEarningsViews({ view, snapshot, checkpoint: f.anchor, fundedCheckpoint: funded,
      evidenceRoot: 'synthetic-evidence', marketQuotes: quotes, nowMs: () => now, timeZone: 'UTC',
      loadCheckpoints: async () => [f.anchor],
      loadFunded: async () => { entered.resolve(); await release.promise;
        if (fails) throw Error('synthetic unavailable funded history'); return [funded]; },
      warn: value => warnings.push(value), publish: async value => published.push(structuredClone(value)) });
    try {
      await entered.promise;
      assert.equal(published.length, 1);
      assert.equal(published[0].earningsHistoryPending, true);
      assert.equal(published[0].earnings.holdings.unrefinedUsd, '24.000000');
      assert.equal(published[0].earnings.total.netPnlUsd, undefined);
      assert.deepEqual(published[0].balances, view.balances);
    } finally { release.resolve(); await pending; }
    assert.equal(published.length, 2);
    assert.equal(published[1].earningsHistoryPending, undefined);
    assert.equal(published[1].earnings.total.throughSlot, fails ? '20' : '30');
    assert.deepEqual(published[1].balances, published[0].balances);
    assert.deepEqual(published[1].provenance, published[0].provenance);
    assert.equal(warnings.length, fails ? 1 : 0);
    if (fails) assert.deepEqual(published[1].accounting, f.anchor.status);
  }
});

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
  assert.equal(published.length, 3);
  assert.equal(published[1].earningsHistoryPending, undefined);
  assert.equal(published[2].earnings.holdings.unrefinedUsd, '30.000000');
  for (const value of published.slice(1)) {
    assert.deepEqual(value.provenance, published[0].provenance);
    assert.deepEqual(value.balances, published[0].balances);
    assert.deepEqual(value.history, published[0].history);
  }
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

test('unavailable quotes leave early amounts exact and unknown USD absent; failed publication stops enrichment', async () => {
  const { anchor } = await accountingFixture();
  const view = monitorView(anchor.closing), published = [];
  const quotes = startMarketQuotes({ cachePath: 'synthetic-cache', allowFetch: true,
    loadQuotes: async () => { throw Error('synthetic unavailable quotes'); } });
  await publishEarningsViews({ view, snapshot: anchor.closing, checkpoint: anchor, evidenceRoot: 'synthetic-evidence',
    marketQuotes: quotes, nowMs: () => now, timeZone: 'UTC',
    loadCheckpoints: async () => {
      assert.equal(published.length, 1);
      assert.deepEqual(published[0].balances, view.balances);
      assert.deepEqual(published[0].earnings.holdings, {});
      assert.equal(published[0].earnings.total.netPnlUsd, undefined);
      return [anchor];
    }, publish: async value => published.push(structuredClone(value)) });
  assert.equal(published.length, 2);
  assert.equal(published[1].earnings.total.netPnlUsd, undefined);
  assert.equal(published[1].earnings.total.netSpendUsd, '10.000500');
  let reads = 0;
  await assert.rejects(publishEarningsViews({ view, snapshot: anchor.closing, checkpoint: anchor,
    evidenceRoot: 'synthetic-evidence', marketQuotes: quotes, nowMs: () => now, timeZone: 'UTC',
    loadCheckpoints: async () => { reads++; return [anchor]; },
    publish: async () => { throw Error('synthetic unwritable view'); } }), /unwritable view/);
  assert.equal(reads, 0);
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
    assert.equal(published.length, 2);
    assert.equal(published[0].earningsHistoryPending, true);
    assert.equal(published[1].earningsHistoryPending, undefined);
    assert.deepEqual(published[0].balances, view.balances);
    assert.equal(published[0].earnings.holdings.unrefinedUsd, '22.000000');
    assert.ok(published[0].earnings.days.every(day => day.coverage === 'unavailable'));
    assert.equal(published[0].earnings.total.netPnlUsd, undefined);
    assert.ok(warnings.length > 0);
  }
});
