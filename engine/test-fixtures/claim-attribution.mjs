// Generated synthetic evidence only. The stored state and token transfers follow
// the isolated claim transition; no saved account or transaction data is used.
import { claimAccountingFixture } from './claim-accounting.mjs';

const Q = 1n << 48n, U64 = (1n << 64n) - 1n;

export async function isolatedClaimFixture({ principal = '1000000000000',
  storedRefined = '200000000000', openingLifetime, factorDelta = Q / 8n,
  refiningFeeApplies = true, referral = false } = {}) {
  const unrefined = BigInt(principal), stored = BigInt(storedRefined);
  const lifetime = BigInt(openingLifetime ?? unrefined + stored);
  const delta = BigInt(factorDelta), earned = delta * unrefined / Q;
  // No remaining miners is the handler's refining-fee exemption. Otherwise
  // leave synthetic others in the pool without overflowing totalUnclaimed.
  const remaining = refiningFeeApplies
    ? (U64 - unrefined < 10000000000000n ? U64 - unrefined : 10000000000000n) : 0n;
  const fee = remaining > 0n ? unrefined / 10n : 0n;
  const debit = unrefined + stored + earned - fee;
  const f = await claimAccountingFixture({ amount: String(debit), referral,
    closingUnrefined: '0', closingRefined: '0' });
  for (const opening of [f.anchor.closing, f.interval.opening]) {
    Object.assign(opening.accounts.miner.value, {
      rewardsGodl: String(unrefined), refinedGodl: String(stored),
      lifetimeRewardsGodl: String(lifetime),
      rewardsFactor: { rawBits: '0', fractionalBits: 48 },
    });
    // The opening treasury factor already contains this pending carry-in. The
    // miner consumes it before this claim's own fee changes the treasury factor.
    opening.accounts.treasury.value.minerRewardsFactor = { rawBits: String(delta), fractionalBits: 48 };
    opening.accounts.treasury.value.totalUnclaimed = String(unrefined + remaining);
  }
  Object.assign(f.interval.closing.accounts.miner.value, {
    rewardsGodl: '0', refinedGodl: '0', lifetimeRewardsGodl: String(lifetime + earned - fee),
    rewardsFactor: { rawBits: String(delta), fractionalBits: 48 },
  });
  f.interval.closing.accounts.treasury.value.totalUnclaimed = String(remaining);
  f.interval.closing.accounts.treasury.value.minerRewardsFactor = {
    rawBits: String(delta + (remaining ? fee * Q / remaining : 0n)), fractionalBits: 48,
  };
  return f;
}
