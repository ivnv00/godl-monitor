import test from 'node:test';
import assert from 'node:assert/strict';
import { Ratio, GRAMS, goalMath, uint, quoteAction, winningSolReturn, compareCandidates, executionBlockers } from './economics.mjs';

const base = {
  deployed: Array(25).fill('1000000'), squares: Array.from({ length: 25 }, (_, i) => i),
  amountPerSquare: '1000000', baseRewardGrams: String(8n * GRAMS), motherlodeGrams: '0',
  solPriceMicroUsd: '100000000', fixedCostLamports: '5000'
};

test('goal arithmetic preserves the distinction between total goal and remaining purchases', () => {
  const objective = { currentGodl: '81.56', targetGodl: '10000', remainingBudgetUsd: '5000' };
  const g = goalMath(objective);
  assert.equal(g.remainingGodl, '9918.44000000000');
  assert.equal(g.maxNetUsdPerAdditionalGodl.decimal(6), '0.504112');
  assert.equal(goalMath({ ...objective, currentGodl: '10001' }).maxNetUsdPerAdditionalGodl, null);
  assert.throws(() => goalMath(), /decimal string required/);
});

test('SOL payoff includes returned winning capital and excludes losing-pot fee twice counting', () => {
  const r = winningSolReturn({ totalDeployed: '1000000', winningDeployed: '100000', ownDeployed: '10000' });
  assert.equal(r.losingPotPayout, 797850n);
  assert.equal(r.gross, 89635n);
  assert.equal(winningSolReturn({ totalDeployed: 1, winningDeployed: 1, ownDeployed: 1 }).gross, 0n);
});

test('symmetric full board matches independently calculated expected cash cost', () => {
  const q = quoteAction(base);
  assert.equal(q.expectedReturnedSol.decimal(9), '0.022261000');
  assert.equal(q.expectedNetCostSol.decimal(9), '0.002744000');
  assert.equal(q.expectedUnrefinedGodl.decimal(3), '4.000');
  assert.equal(q.netUsdPerExpectedGodl.decimal(4), '0.0686');
  assert.equal(q.probabilityOfSelectedSquare.decimal(2), '1.00');
});

test('a single sole-occupied square has 1/25 exposure; no reward from empty squares', () => {
  const q = quoteAction({ ...base, deployed: Array(25).fill('0'), squares: [12] });
  assert.equal(q.expectedUnrefinedGodl.decimal(3), '0.320');
  assert.equal(q.probabilityOfSelectedSquare.decimal(2), '0.04');
  assert.equal(q.worstRoundCashLossSol.decimal(9), '0.001005000');
});

test('motherlode expectation uses 90% payout; current addition is not paid early', () => {
  const q = quoteAction({ ...base, motherlodeGrams: String(625n * GRAMS) });
  assert.equal(q.expectedUnrefinedGodl.decimal(3), '4.450');
});

test('later competition decreases reward share and square permutations do not create predictive signal', () => {
  const q = quoteAction(base);
  const stressed = quoteAction({ ...base, laterDeposits: Array(25).fill('1000000') });
  assert.ok(stressed.expectedUnrefinedGodl.compare(q.expectedUnrefinedGodl) < 0);
  const reversed = quoteAction({ ...base, squares: [...base.squares].reverse() });
  assert.equal(reversed.expectedUnrefinedGodl.compare(q.expectedUnrefinedGodl), 0);
  assert.equal(reversed.expectedNetCostSol.compare(q.expectedNetCostSol), 0);
});

test('invalid masks, impossible totals and lossy integers fail closed', () => {
  for (const squares of [[25], [-1], [1, 1], [], [1.5]]) assert.throws(() => quoteAction({ ...base, squares }));
  assert.throws(() => uint(9007199254740992));
  assert.throws(() => quoteAction({ ...base, deployed: [1] }));
  assert.throws(() => winningSolReturn({ totalDeployed: 1, winningDeployed: 2, ownDeployed: 1 }));
  assert.throws(() => quoteAction({ ...base, referralBps: '10001' }));
});

test('zero emissions cannot be presented as meeting an acquisition target', () => {
  const q = quoteAction({ ...base, baseRewardGrams: '0' });
  assert.equal(q.netUsdPerExpectedGodl, null);
  const result = compareCandidates({ ...base, baseRewardGrams: '0', amountsPerSquare: ['1000000'], maxGrossLamports: '1000000', targetUsdPerGodl: '0.5' });
  assert.equal(result.decision, 'SKIP_AT_THIS_TARGET');
});

test('candidate comparisons are bounded and never authorize execution', () => {
  const result = compareCandidates({ ...base, amountsPerSquare: ['1000000'], maxGrossLamports: '2000000', targetUsdPerGodl: '0.5' });
  assert.equal(result.candidates.length, 2);
  assert.equal(result.executionAllowed, false);
  assert.ok(result.candidates.every(q => BigInt(q.grossDeployedLamports) <= 2000000n));
});

test('unknown wallet state, active autominer, stale data and absent owner limits block execution', () => {
  const reasons = executionBlockers({ snapshotAgeMs: 2000, roundMatches: true, automationActive: true });
  for (const reason of ['STALE_OR_UNKNOWN_STATE', 'ACTIVE_OR_UNKNOWN_AUTOMINER', 'EXISTING_OR_UNKNOWN_DEPLOYMENT', 'OWNER_RISK_LIMITS_UNSET', 'READ_ONLY_BUILD']) assert.ok(reasons.includes(reason));
});

test('rational comparison stays exact beyond JavaScript number precision', () => {
  assert.equal(new Ratio(9007199254740993n).sub(9007199254740992n).decimal(0), '1');
  assert.equal(new Ratio(-1n, 3n).decimal(4), '-0.3333');
});
