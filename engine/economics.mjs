// Read-only economics. This module has no network, wallet, or transaction APIs.
export const LAMPORTS = 1_000_000_000n;
export const GRAMS = 100_000_000_000n;
const U64_MAX = (1n << 64n) - 1n;

export function uint(value, name = 'amount') {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new Error(`${name}: unsafe integer`);
  if (!['string', 'bigint', 'number'].includes(typeof value) || !/^\d+$/.test(String(value))) throw new Error(`${name}: nonnegative integer required`);
  const n = BigInt(value);
  if (n > U64_MAX) throw new Error(`${name}: exceeds u64`);
  return n;
}

function gcd(a, b) {
  a = a < 0n ? -a : a; b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a;
}

export class Ratio {
  constructor(n, d = 1n) {
    n = BigInt(n); d = BigInt(d);
    if (!d) throw new Error('division by zero');
    if (d < 0n) { n = -n; d = -d; }
    const g = gcd(n, d); this.n = n / g; this.d = d / g;
  }
  static of(x) { return x instanceof Ratio ? x : new Ratio(x); }
  add(x) { x = Ratio.of(x); return new Ratio(this.n * x.d + x.n * this.d, this.d * x.d); }
  sub(x) { x = Ratio.of(x); return this.add(new Ratio(-x.n, x.d)); }
  mul(x) { x = Ratio.of(x); return new Ratio(this.n * x.n, this.d * x.d); }
  div(x) { x = Ratio.of(x); return new Ratio(this.n * x.d, this.d * x.n); }
  compare(x) { x = Ratio.of(x); const n = this.n * x.d - x.n * this.d; return n < 0n ? -1 : n > 0n ? 1 : 0; }
  decimal(places = 8) {
    if (!Number.isInteger(places) || places < 0 || places > 30) throw new Error('invalid precision');
    const scale = 10n ** BigInt(places), n = this.n < 0n ? -this.n : this.n;
    const scaled = (n * scale * 2n + this.d) / (2n * this.d);
    const sign = this.n < 0n ? '-' : '';
    return places ? `${sign}${scaled / scale}.${String(scaled % scale).padStart(places, '0')}` : `${sign}${scaled}`;
  }
  toJSON() { return { numerator: String(this.n), denominator: String(this.d), decimal: this.decimal() }; }
}

export function parseUnits(value, decimals) {
  if (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value)) throw new Error('decimal string required');
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > decimals) throw new Error('too many decimal places');
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0');
}

export function goalMath({ currentGodl, targetGodl, remainingBudgetUsd } = {}) {
  const current = parseUnits(currentGodl, 11), target = parseUnits(targetGodl, 11);
  const budget = parseUnits(remainingBudgetUsd, 6);
  const remaining = target > current ? target - current : 0n;
  return { currentGodl, targetGodl, remainingGodl: new Ratio(remaining, GRAMS).decimal(11), remainingBudgetUsd,
    maxNetUsdPerAdditionalGodl: remaining ? new Ratio(budget * GRAMS, 1_000_000n * remaining) : null,
    note: 'Remaining budget must exclude prior costs if they count toward the owner’s total cap. This is a target, not spending authorization.' };
}

function grid(values, name) {
  if (!Array.isArray(values) || values.length !== 25) throw new Error(`${name}: exactly 25 values required`);
  return values.map((x, i) => uint(x, `${name}[${i}]`));
}

function basisPoints(value, name) {
  value = uint(value, name);
  if (value > 10_000n) throw new Error(`${name}: out of range`);
  return value;
}

// Source model: 4b7bb4c… reset/checkpoint. P excludes the returned winning stake.
export function winningSolReturn({ totalDeployed, winningDeployed, ownDeployed, referralBps = 0 }) {
  const total = uint(totalDeployed), winning = uint(winningDeployed), own = uint(ownDeployed);
  const referral = basisPoints(referralBps, 'referralBps');
  if (winning > total || own > winning) throw new Error('inconsistent winning deposits');
  if (!own) return { gross: 0n, afterReferral: 0n, losingPotPayout: 0n };
  const losing = total - winning;
  const afterProtocolFee = losing - losing * 150n / 10_000n;
  const losingPotPayout = afterProtocolFee - afterProtocolFee / 10n;
  const ownFee = own * 150n / 10_000n;
  const returnedStake = own - (ownFee > 0n ? ownFee : 1n);
  const gross = returnedStake + losingPotPayout * own / winning;
  // The actual referral fee is rounded at claim across accrued rewards, not each round.
  return { gross, afterReferral: gross - gross * referral / 10_000n, losingPotPayout };
}

export function quoteAction({ deployed, squares, amountPerSquare, baseRewardGrams, motherlodeGrams,
  solPriceMicroUsd, fixedCostLamports, referralBps = 0, laterDeposits = Array(25).fill('0') }) {
  const initial = grid(deployed, 'deployed'), late = grid(laterDeposits, 'laterDeposits');
  if (!Array.isArray(squares) || squares.length < 1 || squares.length > 25 || new Set(squares).size !== squares.length || squares.some(i => !Number.isInteger(i) || i < 0 || i > 24)) throw new Error('distinct squares in 0..24 required');
  const a = uint(amountPerSquare), base = uint(baseRewardGrams), ml = uint(motherlodeGrams);
  const price = uint(solPriceMicroUsd), fixed = uint(fixedCostLamports);
  if (!a || !price) throw new Error('positive amount and SOL price required');
  const referral = basisPoints(referralBps, 'referralBps');
  const competitors = initial.map((v, i) => uint(v + late[i]));
  const grossDeployed = uint(a * BigInt(squares.length));
  const total = uint(competitors.reduce((s, x) => s + x, grossDeployed));
  let expectedSol = new Ratio(0n), expectedGodl = new Ratio(0n);
  const returns = Array(25).fill(0n), jackpotPayout = ml - ml / 10n;
  for (const i of squares) {
    const winning = competitors[i] + a;
    const r = winningSolReturn({ totalDeployed: total, winningDeployed: winning, ownDeployed: a });
    returns[i] = r.gross;
    expectedSol = expectedSol.add(new Ratio(r.gross, 25n));
    const share = new Ratio(a, winning);
    expectedGodl = expectedGodl.add(share.mul(new Ratio(base).add(new Ratio(jackpotPayout, 625n))).div(25n));
  }
  // Conservative fractional allocation of the claim-time referral fee.
  expectedSol = expectedSol.mul(new Ratio(10_000n - referral, 10_000n));
  const expectedNetCost = new Ratio(grossDeployed + fixed).sub(expectedSol);
  const usdCost = expectedNetCost.mul(price).div(LAMPORTS * 1_000_000n);
  const expectedGodlTokens = expectedGodl.div(GRAMS);
  return {
    squares: [...squares], amountPerSquare: String(a), grossDeployedLamports: String(grossDeployed),
    fixedCostLamports: String(fixed), boardTotalWithHypotheticalAction: String(total),
    expectedReturnedSol: expectedSol.div(LAMPORTS), expectedNetCostSol: expectedNetCost.div(LAMPORTS),
    expectedUnrefinedGodl: expectedGodlTokens, expectedNetCostUsd: usdCost,
    netUsdPerExpectedGodl: expectedGodlTokens.n ? usdCost.div(expectedGodlTokens) : null,
    probabilityOfSelectedSquare: new Ratio(BigInt(squares.length), 25n),
    worstRoundCashLossSol: new Ratio(grossDeployed + fixed - returns.map(v => v - (v * referral + 9999n) / 10000n).reduce((m, v) => v < m ? v : m), LAMPORTS),
    solReturnsByWinningSquareLamports: returns.map(String),
    model: 'Uniform-entropy first moment; fixed competing board plus explicit later-deposit scenario. GODL lottery correlations, fixed-point rounding and pool variance are not modeled. No future yield credited.'
  };
}

// Deliberately restricted candidate family, not a universal optimizer.
// Fixed amount, homogeneous future-deposit stress: increasing coverage of the least crowded squares.
export function compareCandidates({ amountsPerSquare, maxGrossLamports, targetUsdPerGodl, ...state }) {
  const values = grid(state.deployed, 'deployed');
  const budget = uint(maxGrossLamports);
  if (!Array.isArray(amountsPerSquare) || !amountsPerSquare.length) throw new Error('amount grid required');
  const order = values.map((value, i) => ({ value, i })).sort((a, b) => a.value < b.value ? -1 : a.value > b.value ? 1 : a.i - b.i).map(x => x.i);
  const target = targetUsdPerGodl instanceof Ratio ? targetUsdPerGodl : new Ratio(parseUnits(targetUsdPerGodl, 6), 1_000_000n);
  const candidates = [];
  for (const amount of amountsPerSquare) {
    const a = uint(amount); if (!a) throw new Error('amount grid must be positive');
    for (let k = 1; k <= 25 && a * BigInt(k) <= budget; k++) {
      const quote = quoteAction({ ...state, squares: order.slice(0, k), amountPerSquare: a });
      candidates.push({ ...quote, meetsCostTarget: !!quote.netUsdPerExpectedGodl && quote.netUsdPerExpectedGodl.compare(target) <= 0 });
    }
  }
  candidates.sort((a, b) => (b.meetsCostTarget - a.meetsCostTarget) || b.expectedUnrefinedGodl.compare(a.expectedUnrefinedGodl) || a.expectedNetCostUsd.compare(b.expectedNetCostUsd));
  return { executionAllowed: false, reason: 'Analysis only. No signer or execution path exists.', targetUsdPerGodl: target,
    candidateFamily: 'Least-crowded prefixes for explicitly provided per-square sizes; no universal optimality claim.',
    decision: candidates.some(c => c.meetsCostTarget) ? 'CANDIDATES_MEET_IDEALIZED_TARGET' : 'SKIP_AT_THIS_TARGET',
    candidates };
}

export function executionBlockers({ snapshotAgeMs, roundMatches, alreadyDeployed, automationActive,
  verifiedAdapter, ownerLossLimitLamports, ownerRoundLimitLamports, slotsRemaining, minimumLandingSlots }) {
  const reasons = [];
  if (!Number.isFinite(snapshotAgeMs) || snapshotAgeMs < 0 || snapshotAgeMs > 1500) reasons.push('STALE_OR_UNKNOWN_STATE');
  if (roundMatches !== true) reasons.push('ROUND_MISMATCH');
  if (alreadyDeployed !== false) reasons.push('EXISTING_OR_UNKNOWN_DEPLOYMENT');
  if (automationActive !== false) reasons.push('ACTIVE_OR_UNKNOWN_AUTOMINER');
  if (verifiedAdapter !== true) reasons.push('UNVERIFIED_TRANSACTION_ADAPTER');
  if (ownerLossLimitLamports == null || uint(ownerLossLimitLamports) === 0n || ownerRoundLimitLamports == null || uint(ownerRoundLimitLamports) === 0n) reasons.push('OWNER_RISK_LIMITS_UNSET');
  if (slotsRemaining == null || minimumLandingSlots == null || uint(slotsRemaining) <= uint(minimumLandingSlots)) reasons.push('LANDING_WINDOW_UNSAFE');
  // These checks alone are not the finished risk governor or permission to spend.
  reasons.push('READ_ONLY_BUILD');
  return reasons;
}
