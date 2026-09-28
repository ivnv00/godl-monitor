import test from 'node:test';
import assert from 'node:assert/strict';
import { projectEarnings } from './earnings.mjs';

const NOW = Date.parse('2026-09-28T12:00:00.000Z');
const Q = 1n << 48n;
const GODL_MINT = 'GodL6KZ9uuUoQwELggtVzQkKmU1LfqmDokPibPeDKkhF';
const XAUT0_MINT = 'AymATz4TCL9sWNEEV9Kvyz45CHVhDZ6kUgjTJPzLpU9P';
const factor = value => ({ rawBits: String(value), fractionalBits: 48 });

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
    source: 'DEX Screener', quotes, reason: null };
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
