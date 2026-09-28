import { Ratio, uint } from './economics.mjs';

const Q = 1n << 48n, MAX_FIXED = (1n << 127n) - 1n, MAX_U64 = (1n << 64n) - 1n;
export const XAUT_MINT = 'AymATz4TCL9sWNEEV9Kvyz45CHVhDZ6kUgjTJPzLpU9P';
const unavailable = reason => ({ status: 'unavailable', reason });
function u64(value) {
  const n = uint(value);
  if (n > MAX_U64) throw new Error('Reward amount exceeds u64');
  return n;
}
function fixed(value) {
  if (value?.fractionalBits !== 48) throw new Error('Unsupported reward factor');
  const n = uint(value.rawBits);
  if (n > MAX_FIXED) throw new Error('Reward factor exceeds I80F48');
  return n;
}
function product(left, right) {
  const result = left * right / Q;
  if (result > MAX_FIXED) throw new Error('Reward fixed-point overflow');
  return result;
}
const amount = (n, decimals) => ({ baseUnits: String(u64(n)), decimals,
  display: new Ratio(n, 10n ** BigInt(decimals)).decimal(decimals) });
function present(snapshot, name) {
  const account = snapshot.accounts?.[name];
  if (account?.status !== 'present') return null;
  if (['miner', 'minerExtended'].includes(name) && account.value?.authority !== snapshot.wallet)
    throw new Error('Reward account authority mismatch');
  return account.value;
}

/** Mirrors Steel I80F48 settlement at the single finalized account-read slot. */
export function projectRewardBalances(snapshot) {
  const miner = present(snapshot, 'miner'), treasury = present(snapshot, 'treasury');
  const extended = present(snapshot, 'minerExtended'), vault = present(snapshot, 'goldVault');
  const result = {
    refinedGodl: unavailable('refined-factor-not-observed'),
    pendingRefinedGodl: unavailable('refined-factor-not-observed'),
    claimableGold: unavailable('gold-account-or-factor-not-observed'),
    storedGold: extended ? amount(u64(extended.xautRewards), 6) : unavailable('gold-account-not-found'),
    pendingGold: unavailable('gold-account-or-factor-not-observed'),
    rewardObservation: { lastClaimGodlAt: miner?.lastClaimGodlAt ?? null, cumulativeGoldBaseUnits: null },
  };
  if (!miner) return result;
  const unrefined = u64(miner.rewardsGodl);
  if (treasury && miner.rewardsFactor) {
    const delta = fixed(treasury.minerRewardsFactor) - fixed(miner.rewardsFactor);
    if (delta < 0n) throw new Error('Refined reward factor regressed');
    const pending = product(delta, unrefined * Q) / Q;
    result.pendingRefinedGodl = amount(pending, 11);
    result.refinedGodl = amount(u64(miner.refinedGodl) + pending, 11);
  }
  if (extended && vault) {
    const delta = fixed(vault.xautRewardsFactor) - fixed(extended.xautRewardsFactor);
    if (delta < 0n) throw new Error('Gold reward factor regressed');
    // Preserve from_fraction's rounding before Numeric multiplication.
    const weight = unrefined * Q / 1_000_000n;
    const pending = product(delta, weight) / Q;
    result.pendingGold = amount(pending, 6);
    result.claimableGold = amount(u64(extended.xautRewards) + pending, 6);
    result.rewardObservation.cumulativeGoldBaseUnits = String(u64(u64(extended.lifetimeXaut) + pending));
  }
  return result;
}
