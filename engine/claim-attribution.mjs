// Optional, pure attribution of one completely replayed, isolated GODL claim.
// Saved RPC evidence remains conditional provider evidence, not chain authentication.
import { isDeepStrictEqual } from 'node:util';
import { reconcileCostInterval } from './ongoing-cost.mjs';

const Q = 1n << 48n, U64 = (1n << 64n) - 1n, I80F48 = (1n << 127n) - 1n;
const CHANGED = new Set(['rewardsGodl', 'refinedGodl', 'lifetimeRewardsGodl', 'rewardsFactor', 'lastClaimGodlAt']);
const unavailable = reason => ({ status: 'unavailable', reason });
const reject = reason => { throw new Error(reason); };
const integer = value => {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,38})$/.test(value)) reject('claim-attribution-mismatch');
  return BigInt(value);
};
const u64 = value => {
  if (value < 0n || value > U64) reject('claim-attribution-range');
  return value;
};
const factor = value => {
  if (value?.fractionalBits !== 48 || typeof value.rawBits !== 'string'
      || !/^(0|[1-9]\d{0,38})$/.test(value.rawBits)) reject('claim-factor-unavailable');
  const bits = BigInt(value.rawBits);
  if (bits > I80F48) reject('claim-attribution-range');
  return bits;
};
const unchanged = value => Object.fromEntries(Object.entries(value).filter(([key]) => !CHANGED.has(key)));
const token = n => ({ baseUnits: String(n), decimals: 11,
  display: `${n / 100000000000n}.${String(n % 100000000000n).padStart(11, '0')}` });

export function projectIsolatedClaimAttribution(input = {}) {
  let opening, interval, replay;
  try {
    ({ opening, interval } = input);
    replay = reconcileCostInterval({ opening, interval, candles: input.candles ?? [],
      funded: true, allowOpen: true, claimAware: true });
  } catch {
    return unavailable('claim-evidence-unavailable');
  }
  try {
    if (replay.claims.count !== 1 || interval.godlClaims.length !== 1) return unavailable('claim-state-not-isolated');
    const claim = interval.godlClaims[0].claim;
    if (interval.transactions.some(tx => tx.outcome === 'succeeded' && tx.signature !== claim.signature
        && tx.deltas?.miner?.status === 'observed')) return unavailable('claim-state-not-isolated');
    const before = opening.accounts.miner.value, after = interval.closing.accounts.miner.value;
    if (after.rewardsGodl !== '0' || after.refinedGodl !== '0'
        || !isDeepStrictEqual(unchanged(before), unchanged(after))) return unavailable('claim-state-not-isolated');
    const f0 = factor(before.rewardsFactor), f1 = factor(after.rewardsFactor);
    if (f1 < f0) return unavailable('claim-factor-unavailable');
    const principal = u64(integer(before.rewardsGodl)), stored = u64(integer(before.refinedGodl));
    const lifetime = u64(integer(before.lifetimeRewardsGodl));
    const product = (f1 - f0) * principal;
    if (product > I80F48) return unavailable('claim-attribution-range');
    const earned = u64(product / Q), refined = u64(stored + earned);
    const gross = u64(principal + refined), increasedLifetime = u64(lifetime + earned);
    const debit = u64(integer(claim.treasuryDebit.amountBaseUnits));
    const fee = gross - debit;
    if (fee < 0n || (fee !== 0n && fee !== principal / 10n)) return unavailable('claim-attribution-mismatch');
    if (increasedLifetime < fee) return unavailable('claim-attribution-range');
    if (integer(after.lifetimeRewardsGodl) !== increasedLifetime - fee) return unavailable('claim-attribution-mismatch');
    const referral = claim.referralReceipt.status === 'observed'
      ? u64(integer(claim.referralReceipt.amountBaseUnits)) : 0n;
    return { status: 'observed', reason: 'isolated-claim-factor-proof', signature: claim.signature, slot: claim.slot,
      principalGodl: token(principal), refinedGodl: token(refined), refiningFeeGodl: token(fee),
      referralFeeGodl: token(referral), ownerReceiptGodl: token(u64(integer(claim.ownerReceipt.amountBaseUnits))) };
  } catch (error) {
    return unavailable(['claim-factor-unavailable', 'claim-attribution-mismatch', 'claim-attribution-range'].includes(error?.message)
      ? error.message : 'claim-evidence-unavailable');
  }
}
