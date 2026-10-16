import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEarningsCheckpoints, projectEarnings } from './earnings.mjs';
import { extendClosedAccounting } from './ongoing-cost.mjs';
import { accountingFixture } from './test-fixtures/accounting.mjs';

const NOW = Date.parse('2026-09-28T12:00:00.000Z');
const Q = 1n << 48n;
const GODL_MINT = 'GodL6KZ9uuUoQwELggtVzQkKmU1LfqmDokPibPeDKkhF';
const XAUT0_MINT = 'AymATz4TCL9sWNEEV9Kvyz45CHVhDZ6kUgjTJPzLpU9P';
const factor = value => ({ rawBits: String(value), fractionalBits: 48 });
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function snapshot() {
  return { wallet: 'fixture-wallet', observedAt: new Date(NOW).toISOString(), context: { slot: '100' },
    accounts: {
      miner: { status: 'present', value: { authority: 'fixture-wallet', rewardsGodl: '100000000000',
        refinedGodl: '200000000000', rewardsFactor: factor(Q), lastClaimGodlAt: '0', referrer: '11111111111111111111111111111111' } },
      treasury: { status: 'present', value: { minerRewardsFactor: factor(Q), totalUnclaimed: '100000000000' } },
      minerExtended: { status: 'present', value: { authority: 'fixture-wallet', xautRewards: '3000000',
        lifetimeXaut: '3000000', xautRewardsFactor: factor(Q) } },
      goldVault: { status: 'present', value: { xautRewardsFactor: factor(Q) } },
    } };
}

function quote(asset, mint, priceUsd) {
  return { asset, mint, priceUsd, pairAddress: `pair-${asset}`, dexId: 'fixture-dex' };
}

function market(quotes, expiresAt = NOW + 60_000) {
  return { observedAt: new Date(NOW - 60_000).toISOString(), expiresAt: new Date(expiresAt).toISOString(),
    source: 'DEX Screener', quotes, reason: null,
    ...(quotes.some(quote => quote.asset === 'XAUt0') ? { goldReference: { source: 'CoinGecko', assetId: 'tether-gold',
      priceUsd: '10', observedAt: new Date(expiresAt - 120_000).toISOString() } } : {}) };
}

async function closedChain() {
  const fixture = await accountingFixture();
  const anchor = fixture.anchor;
  const emptyInterval = structuredClone(fixture.interval);
  emptyInterval.toInclusiveSlot = '22';
  emptyInterval.closing = structuredClone(anchor.closing);
  emptyInterval.closing.context.slot = '22';
  emptyInterval.transactions = [];
  const first = extendClosedAccounting({ previous: anchor, interval: emptyInterval, candles: [] });
  const paidInterval = structuredClone(fixture.interval);
  paidInterval.fromExclusiveSlot = '22';
  paidInterval.opening = structuredClone(first.closing);
  const next = extendClosedAccounting({ previous: first, interval: paidInterval,
    candles: fixture.candles });
  return { ...fixture, anchor, first, next };
}

function evidenceRecord(checkpoint) {
  return { priorReceiptSha256: checkpoint.receipt.evidence.previousReceiptSha256,
    receipt: checkpoint.receipt,
    interval: { fromExclusiveSlot: checkpoint.receipt.evidence.lastInterval.fromExclusiveSlot,
      toInclusiveSlot: checkpoint.closing.context.slot, closing: checkpoint.closing } };
}

async function writeEvidence(root, name, checkpoint) {
  const directory = join(root, name);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'reconciliation.json'), JSON.stringify(evidenceRecord(checkpoint)));
}

test('without an accounting anchor, current holdings use fresh exact-mint quotes while history remains unavailable', () => {
  const result = projectEarnings({ snapshot: snapshot(), checkpoint: undefined, checkpoints: [], nowMs: NOW,
    timeZone: 'UTC', market: market([quote('GODL', GODL_MINT, '2'), quote('XAUt0', XAUT0_MINT, '10')]) });

  assert.deepEqual(result.holdings, { unrefinedUsd: '2.000000', refinedUsd: '4.000000', goldUsd: '30.000000' });
  assert.deepEqual(result.market.quotes.map(item => item.asset), ['GODL', 'XAUt0']);
  assert.equal(result.days.length, 7);
  assert.ok(result.days.every(day => day.coverage === 'unavailable'
    && /verified accounting history is required/i.test(day.reason)));
  assert.equal(result.total.scope, 'unrefined-only');
  for (const fabricated of ['fromAt', 'throughAt', 'fromSlot', 'throughSlot', 'netSpendUsd', 'rewardValueUsd', 'netPnlUsd']) {
    assert.equal(Object.hasOwn(result.total, fabricated), false, fabricated);
  }
});

test('unanchored holdings reject expired prices and value each available asset independently', () => {
  const expired = projectEarnings({ snapshot: snapshot(), checkpoint: null, nowMs: NOW, timeZone: 'UTC',
    market: market([quote('GODL', GODL_MINT, '2'), quote('XAUt0', XAUT0_MINT, '10')], NOW) });
  assert.deepEqual(expired.holdings, {});
  assert.match(expired.market.reason, /expired/i);

  const goldOnly = projectEarnings({ snapshot: snapshot(), checkpoint: undefined, nowMs: NOW, timeZone: 'UTC',
    market: market([quote('XAUt0', XAUT0_MINT, '10')]) });
  assert.deepEqual(goldOnly.holdings, { goldUsd: '30.000000' });
});

test('an explicitly provided invalid checkpoint still fails closed', () => {
  for (const checkpoint of [{}, false]) {
    assert.throws(() => projectEarnings({ snapshot: snapshot(), checkpoint, checkpoints: [], nowMs: NOW,
      timeZone: 'UTC', market: market([]) }), /checkpoint/i);
  }
});

test('projects verified same-day deltas and scoped cumulative unrefined earnings', async () => {
  const { anchor, first, next } = await closedChain();
  const nowMs = Date.parse('2026-01-02T10:11:00.000Z');
  const prices = market([quote('GODL', GODL_MINT, '2'), quote('XAUt0', XAUT0_MINT, '10')], nowMs + 60_000);
  prices.observedAt = '2026-01-02T10:10:00.000Z';
  const result = projectEarnings({ snapshot: next.closing, checkpoint: next,
    checkpoints: [anchor, first, next], nowMs, timeZone: 'UTC', market: prices });

  const day = result.days.find(item => item.day === '2026-01-02');
  assert.deepEqual(day, {
    day: '2026-01-02', fromAt: '2026-01-02T10:00:00.000Z',
    throughAt: '2026-01-02T10:10:00.000Z', fromSlot: '20', throughSlot: '30',
    coverage: 'partial',
    reason: 'First-to-last verified closed observations within the named local calendar day; midnight coverage is not implied.',
    unrefinedGodl: { baseUnits: '200000000000', decimals: 11, display: '2.00000000000' },
    unrefinedUsd: '4.000000',
    refinedGodl: { baseUnits: '50000000000', decimals: 11, display: '0.50000000000' },
    refinedUsd: '1.000000',
    gold: { baseUnits: '100000', decimals: 6, display: '0.100000' },
    goldUsd: '1.000000', netSpendUsd: '3.000500', rewardValueUsd: '6.000000',
    netRewardUsd: '2.999500',
  });
  assert.deepEqual(result.total, {
    scope: 'unrefined-only', fromAt: '2026-01-02T09:00:00.000Z',
    throughAt: '2026-01-02T10:10:00.000Z', throughSlot: '30',
    reason: 'Checkpoint-attributed unrefined GODL only. Excludes refined GODL, gold, unknown opening holdings, off-chain costs, slippage, claim transaction fees and sale costs.',
    claimableGodl: { baseUnits: '1200000000000', decimals: 11, display: '12.00000000000' },
    refiningFee: { baseUnits: '0', decimals: 11, display: '0.00000000000' },
    referralFee: { baseUnits: '0', decimals: 11, display: '0.00000000000' },
    netSpendUsd: '13.001000', rewardValueUsd: '24.000000', netPnlUsd: '10.999000',
  });
});

test('partial coverage and missing exact-mint prices do not fabricate reward net values', async () => {
  const { anchor, first, next } = await closedChain();
  const nowMs = Date.parse('2026-01-02T10:11:00.000Z');
  const godlOnly = market([quote('GODL', GODL_MINT, '2')], nowMs + 60_000);
  godlOnly.observedAt = '2026-01-02T10:10:00.000Z';
  const one = projectEarnings({ snapshot: next.closing, checkpoint: next,
    checkpoints: [next], nowMs, timeZone: 'UTC', market: godlOnly });
  const unavailable = one.days.find(item => item.day === '2026-01-02');
  assert.equal(unavailable.coverage, 'unavailable');
  assert.match(unavailable.reason, /Only one verified closed observation/);
  for (const field of ['netSpendUsd', 'rewardValueUsd', 'netRewardUsd'])
    assert.equal(Object.hasOwn(unavailable, field), false, field);

  const missingGold = projectEarnings({ snapshot: next.closing, checkpoint: next,
    checkpoints: [anchor, first, next], nowMs, timeZone: 'UTC', market: godlOnly });
  const partial = missingGold.days.find(item => item.day === '2026-01-02');
  assert.equal(partial.netSpendUsd, '3.000500');
  assert.match(partial.reason, /Fresh exact-mint market quotes/);
  assert.equal(Object.hasOwn(partial, 'rewardValueUsd'), false);
  assert.equal(Object.hasOwn(partial, 'netRewardUsd'), false);
});

test('loads a contiguous evidence chain across restarts and ignores a corrupt prior record', async t => {
  const { first: prior, next } = await closedChain();
  const root = await mkdtemp(join(tmpdir(), 'godl-earnings-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeEvidence(root, 'first', prior);
  await writeEvidence(root, 'next', next);
  const loaded = await loadEarningsCheckpoints({ checkpoint: next, evidenceRoot: root });
  const restarted = await loadEarningsCheckpoints({ checkpoint: next, evidenceRoot: root });
  assert.deepEqual(loaded.map(item => item.closing.context.slot), ['22', '30']);
  assert.deepEqual(restarted.map(item => digest(item.receipt)), loaded.map(item => digest(item.receipt)));

  await writeFile(join(root, 'first', 'reconciliation.json'), '{broken');
  const closed = await loadEarningsCheckpoints({ checkpoint: next, evidenceRoot: root });
  assert.deepEqual(closed.map(item => item.closing.context.slot), ['30']);
});

test('rejects forked evidence and interval slot gaps', async t => {
  const { first, next } = await closedChain();
  const forkRoot = await mkdtemp(join(tmpdir(), 'godl-earnings-fork-'));
  const gapRoot = await mkdtemp(join(tmpdir(), 'godl-earnings-gap-'));
  t.after(() => Promise.all([rm(forkRoot, { recursive: true, force: true }),
    rm(gapRoot, { recursive: true, force: true })]));
  await writeEvidence(forkRoot, 'first', first);
  await writeEvidence(forkRoot, 'next', next);
  const fork = structuredClone(next);
  fork.receipt.acquisitionPeriod.caveats[0] += ' Fork.';
  await writeEvidence(forkRoot, 'fork', fork);
  await assert.rejects(loadEarningsCheckpoints({ checkpoint: next, evidenceRoot: forkRoot }), /Forked/);

  const gap = structuredClone(next);
  gap.receipt.evidence.lastInterval.fromExclusiveSlot = '21';
  await writeEvidence(gapRoot, 'first', first);
  await writeEvidence(gapRoot, 'gap', gap);
  await assert.rejects(loadEarningsCheckpoints({ checkpoint: gap, evidenceRoot: gapRoot }), /slot link mismatch/);
});

test('unverified absurd gold never reaches holdings but preserves GODL and native gold', () => {
  const valid = market([quote('GODL', GODL_MINT, '2'), quote('XAUt0', XAUT0_MINT, '20843210')]);
  valid.goldReference.priceUsd = '4163.29';
  for (const goldReference of [undefined, valid.goldReference,
    { ...valid.goldReference, observedAt: new Date(NOW - 600_001).toISOString() },
    { ...valid.goldReference, observedAt: new Date(NOW + 1).toISOString() }]) {
    const input = { ...valid, goldReference };
    const result = projectEarnings({ snapshot: snapshot(), nowMs: NOW, timeZone: 'UTC', market: input });
    assert.deepEqual(result.holdings, { unrefinedUsd: '2.000000', refinedUsd: '4.000000' });
    assert.deepEqual(result.market.quotes.map(quote => quote.asset), ['GODL']);
    assert.equal(result.market.goldReference, undefined);
  }
});

test('invalid gold proof suppresses daily aggregate valuation while preserving native deltas and GODL-only result', async () => {
  const { anchor, first, next } = await closedChain();
  const nowMs = Date.parse('2026-01-02T10:11:00.000Z');
  const prices = market([quote('GODL', GODL_MINT, '2'), quote('XAUt0', XAUT0_MINT, '20843210')], nowMs + 60_000);
  prices.observedAt = '2026-01-02T10:10:00.000Z';
  delete prices.goldReference;
  const result = projectEarnings({ snapshot: next.closing, checkpoint: next,
    checkpoints: [anchor, first, next], nowMs, timeZone: 'UTC', market: prices });
  const day = result.days.find(row => row.day === '2026-01-02');
  assert.equal(day.gold.baseUnits, '100000');
  assert.equal(day.goldUsd, undefined);
  assert.equal(day.rewardValueUsd, undefined);
  assert.equal(day.netRewardUsd, undefined);
  assert.equal(day.unrefinedUsd, '4.000000');
  assert.equal(result.total.netPnlUsd, '10.999000');
});
