import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { projectIsolatedClaimAttribution } from './claim-attribution.mjs';
import { isolatedClaimFixture } from './test-fixtures/claim-attribution.mjs';
import { indexedRow } from './test-fixtures/accounting.mjs';
import { claimAccountingFixture } from './test-fixtures/claim-accounting.mjs';
import { reconcileCostInterval } from './ongoing-cost.mjs';

const project = f => projectIsolatedClaimAttribution({
  opening: f.anchor.closing, interval: f.interval, candles: f.candles,
});
const token = (baseUnits, display) => ({ baseUnits, decimals: 11, display });
const Q = 1n << 48n, U64 = (1n << 64n) - 1n;
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const bind = f => {
  for (const entry of f.interval.godlClaims) entry.transactionSha256 = digest(
    f.interval.transactions.find(tx => tx.signature === entry.claim.signature));
};
const unavailable = reason => ({ status: 'unavailable', reason });
const addAttempt = (f, succeeded = false, minerObserved = true) => {
  const tx = structuredClone(f.interval.transactions[0]);
  Object.assign(tx, { signature: '4'.repeat(88), slot: '26', transactionIndex: 1,
    blockTime: tx.blockTime + 60, outcome: succeeded ? 'succeeded' : 'failed',
    error: succeeded ? null : { InstructionError: [0, 'Custom'] }, instructionsAreAttempts: !succeeded });
  tx.godlInstructions[0].dataBase58 = '2B'; // Supported mining opcode 68.
  tx.deltas.wallet.beforeLamports = '999995000';
  tx.deltas.wallet.afterLamports = '999990000';
  if (!minerObserved) {
    tx.deltas.miner = { address: f.trackedAccounts.miner, status: 'not-in-transaction' };
    tx.godlInstructions = [];
  }
  f.interval.transactions.push(tx);
  for (const [role, page] of Object.entries(f.interval.pages)) page.rows = f.interval.transactions
    .filter(value => value.deltas[role].status === 'observed').map(indexedRow).reverse();
  f.candles.push([Math.floor(tx.blockTime / 60) * 60, 100, 100, 100, 100, 1]);
  return tx;
};

test('isolated charged claim separates opening principal, settled refining, and receipt', async () => {
  const f = await isolatedClaimFixture({ referral: true });
  assert.deepEqual(project(f), {
    status: 'observed', reason: 'isolated-claim-factor-proof', signature: '3'.repeat(88), slot: '25',
    principalGodl: token('1000000000000', '10.00000000000'),
    refinedGodl: token('325000000000', '3.25000000000'),
    refiningFeeGodl: token('100000000000', '1.00000000000'),
    referralFeeGodl: token('6125000000', '0.06125000000'),
    ownerReceiptGodl: token('1218875000000', '12.18875000000'),
  });
});

test('literal independent base-unit vectors cover fee exemption, rounding, and integers beyond Number precision', async t => {
  const cases = [
    ['charged with referral', { principal: '1000', storedRefined: '200', referral: true },
      ['1000', '325', '100', '6', '1219']],
    ['fee exemption', { principal: '1000', storedRefined: '200', refiningFeeApplies: false },
      ['1000', '325', '0', '0', '1325']],
    ['zero claim', { principal: '0', storedRefined: '0' }, ['0', '0', '0', '0', '0']],
    ['stored refined only', { principal: '0', storedRefined: '200', referral: true }, ['0', '200', '0', '1', '199']],
    ['below truncation', { principal: '3', storedRefined: '0', factorDelta: Q / 3n }, ['3', '0', '0', '0', '3']],
    ['above truncation', { principal: '3', storedRefined: '0', factorDelta: Q / 3n + 1n }, ['3', '1', '0', '0', '4']],
    ['below fee step', { principal: '9', storedRefined: '0', factorDelta: '0' }, ['9', '0', '0', '0', '9']],
    ['first fee step', { principal: '10', storedRefined: '0', factorDelta: '0' }, ['10', '0', '1', '0', '9']],
    ['large exact integer', { principal: '9007199254740993', storedRefined: '0', factorDelta: '1' },
      ['9007199254740993', '32', '900719925474099', '0', '8106479329266926']],
  ];
  for (const [name, options, expected] of cases) await t.test(name, async () => {
    const value = project(await isolatedClaimFixture(options));
    assert.equal(value.status, 'observed');
    assert.deepEqual(['principalGodl', 'refinedGodl', 'refiningFeeGodl', 'referralFeeGodl', 'ownerReceiptGodl']
      .map(key => value[key].baseUnits), expected);
    for (const key of ['principalGodl', 'refinedGodl', 'refiningFeeGodl', 'referralFeeGodl', 'ownerReceiptGodl']) {
      assert.equal(value[key].decimals, 11);
      assert.match(value[key].display, /^(0|[1-9]\d*)\.\d{11}$/);
    }
    if (name === 'large exact integer') assert.equal(value.principalGodl.display, '90071.99254740993');
  });
});

test('synthetic fee exemption removes the full pool; charged high amounts keep totalUnclaimed within u64', async () => {
  const exempt = await isolatedClaimFixture({ principal: '1000', storedRefined: '200', refiningFeeApplies: false });
  assert.equal(exempt.anchor.closing.accounts.treasury.value.totalUnclaimed, '1000');
  assert.equal(exempt.interval.closing.accounts.treasury.value.totalUnclaimed, '0');
  assert.equal(project(exempt).refiningFeeGodl.baseUnits, '0');
  const charged = await isolatedClaimFixture({ principal: String(U64 - 1n), storedRefined: '0',
    factorDelta: '0', openingLifetime: String(U64 - 1n) });
  assert.equal(charged.anchor.closing.accounts.treasury.value.totalUnclaimed, String(U64));
  assert.equal(charged.interval.closing.accounts.treasury.value.totalUnclaimed, '1');
  assert.equal(project(charged).status, 'observed');
});

test('only consumed miner factors determine refining; attribution preserves every source byte and replay result', async () => {
  const f = await isolatedClaimFixture({ referral: true });
  f.interval.closing.accounts.treasury.value.minerRewardsFactor.rawBits = '999999999999999';
  const before = JSON.stringify(f), sourceHash = digest(f);
  const replayBefore = reconcileCostInterval({ opening: f.anchor.closing, interval: f.interval,
    candles: f.candles, funded: true, allowOpen: true, claimAware: true });
  assert.equal(project(f).refinedGodl.baseUnits, '325000000000');
  assert.equal(JSON.stringify(f), before);
  assert.equal(digest(f), sourceHash);
  assert.deepEqual(reconcileCostInterval({ opening: f.anchor.closing, interval: f.interval,
    candles: f.candles, funded: true, allowOpen: true, claimAware: true }), replayBefore);
  assert.deepEqual(f.interval.godlClaims[0].claim.principal,
    unavailable('receipt-does-not-prove-mined-principal'));
  assert.deepEqual(f.interval.godlClaims[0].claim.refiningDeduction,
    unavailable('receipt-does-not-prove-refining-deduction'));
  f.anchor.closing.accounts.miner.value.rewardsFactor.rawBits = String(7n * Q);
  f.interval.closing.accounts.miner.value.rewardsFactor.rawBits = String(7n * Q + Q / 8n);
  assert.equal(project(f).refinedGodl.baseUnits, '325000000000');
});

test('missing, malformed, regressing, and negative miner factors remain unavailable', async t => {
  const cases = [
    ['missing opening', f => { delete f.anchor.closing.accounts.miner.value.rewardsFactor; }],
    ['missing closing', f => { delete f.interval.closing.accounts.miner.value.rewardsFactor; }],
    ['missing bits', f => { delete f.interval.closing.accounts.miner.value.rewardsFactor.rawBits; }],
    ['fraction width', f => { f.interval.closing.accounts.miner.value.rewardsFactor.fractionalBits = 47; }],
    ['numeric bits', f => { f.interval.closing.accounts.miner.value.rewardsFactor.rawBits = 1; }],
    ['leading zero', f => { f.interval.closing.accounts.miner.value.rewardsFactor.rawBits = '01'; }],
    ['negative zero', f => { f.interval.closing.accounts.miner.value.rewardsFactor.rawBits = '-0'; }],
    ['negative bits', f => { f.interval.closing.accounts.miner.value.rewardsFactor.rawBits = '-1'; }],
    ['regression', f => { f.anchor.closing.accounts.miner.value.rewardsFactor.rawBits = String(Q); }],
  ];
  for (const [name, mutate] of cases) await t.test(name, async () => {
    const f = await isolatedClaimFixture(); mutate(f);
    assert.deepEqual(project(f), unavailable('claim-factor-unavailable'));
  });
});

test('I80F48 product and intermediate u64 bounds fail closed before deductions', async t => {
  for (const [name, prepare, mutate] of [
    ['factor out of signed range', {}, f => { f.interval.closing.accounts.miner.value.rewardsFactor.rawBits = String(1n << 127n); }],
    ['multiplication overflow', {}, f => { f.interval.closing.accounts.miner.value.rewardsFactor.rawBits = String((1n << 127n) - 1n); }],
    ['earned overflow', { principal: '1', storedRefined: '0' }, f => { f.interval.closing.accounts.miner.value.rewardsFactor.rawBits = String(1n << 120n); }],
    ['stored plus earned overflow', { principal: '1', storedRefined: String(U64 - 1n), factorDelta: '0' },
      f => { f.interval.closing.accounts.miner.value.rewardsFactor.rawBits = String(2n * Q); }],
    ['gross before fee overflow', { principal: String(U64 - 1n), storedRefined: '2', openingLifetime: String(U64), factorDelta: '0' }, () => {}],
    ['lifetime before fee overflow', { principal: '10', storedRefined: '0', openingLifetime: String(U64), factorDelta: Q / 10n + 1n }, () => {}],
  ]) await t.test(name, async () => {
    const f = await isolatedClaimFixture(prepare); mutate(f);
    assert.deepEqual(project(f), unavailable('claim-attribution-range'));
  });
});

test('other successful miner involvement is rejected, while replay-valid failed attempts are allowed', async () => {
  const mixed = await isolatedClaimFixture();
  addAttempt(mixed, true);
  assert.equal(reconcileCostInterval({ opening: mixed.anchor.closing, interval: mixed.interval,
    candles: mixed.candles, funded: true, allowOpen: true, claimAware: true }).included.length, 2);
  assert.deepEqual(project(mixed), unavailable('claim-state-not-isolated'));

  // Even an excluded read of the miner makes the interval non-isolated.
  const read = await isolatedClaimFixture();
  const tx = addAttempt(read, true);
  tx.godlInstructions = [];
  assert.deepEqual(project(read), unavailable('claim-state-not-isolated'));

  const failed = await isolatedClaimFixture();
  addAttempt(failed);
  assert.equal(project(failed).status, 'observed');
  const unrelated = await isolatedClaimFixture();
  addAttempt(unrelated, true, false);
  assert.equal(project(unrelated).status, 'observed');
});

test('zero and multiple successful claims do not prove an isolated claim', async () => {
  const multiple = await claimAccountingFixture({ count: 2, closingUnrefined: '0', closingRefined: '0' });
  assert.deepEqual(project(multiple), unavailable('claim-state-not-isolated'));
  const failed = await isolatedClaimFixture();
  const tx = failed.interval.transactions[0];
  tx.outcome = 'failed'; tx.error = { InstructionError: [0, 'Custom'] }; tx.instructionsAreAttempts = true;
  failed.interval.closing.accounts.miner.value = structuredClone(failed.anchor.closing.accounts.miner.value);
  failed.interval.godlClaims = [];
  for (const page of Object.values(failed.interval.pages)) page.rows = page.rows.length ? [indexedRow(tx)] : [];
  assert.deepEqual(project(failed), unavailable('claim-state-not-isolated'));
});

test('unrelated miner fields and closing balances must remain isolated', async t => {
  for (const [name, mutate] of [
    ['deployment grid', f => { f.interval.closing.accounts.miner.value.deployed[0] = '1'; }],
    ['cumulative grid', f => { f.interval.closing.accounts.miner.value.cumulative[0] = '1'; }],
    ['round', f => { f.interval.closing.accounts.miner.value.roundId = '1'; }],
    ['checkpoint', f => { f.interval.closing.accounts.miner.value.roundId = '1'; f.interval.closing.accounts.miner.value.checkpointId = '1'; }],
    ['SOL claim marker', f => { f.interval.closing.accounts.miner.value.lastClaimSolAt = '1'; }],
    ['lifetime deployment', f => { f.interval.closing.accounts.miner.value.lifetimeDeployed = '1'; }],
    ['lifetime SOL', f => { f.interval.closing.accounts.miner.value.lifetimeRewardsSol = '1'; }],
    ['extra miner field', f => { f.interval.closing.accounts.miner.value.futureField = '1'; }],
    ['remaining principal', f => { f.interval.closing.accounts.miner.value.rewardsGodl = '1';
      f.interval.closing.accounts.miner.value.lifetimeRewardsGodl = '1225000000001'; }],
    ['remaining refined', f => { f.interval.closing.accounts.miner.value.refinedGodl = '1';
      f.interval.closing.accounts.miner.value.lifetimeRewardsGodl = '1225000000001'; }],
  ]) await t.test(name, async () => {
    const f = await isolatedClaimFixture(); mutate(f);
    assert.deepEqual(project(f), unavailable('claim-state-not-isolated'));
  });
});

test('a counter-conserving receipt must still match the isolated fee and factor equations', async t => {
  const f = await isolatedClaimFixture();
  f.interval.closing.accounts.miner.value.rewardsFactor.rawBits = '0';
  assert.deepEqual(project(f), unavailable('claim-attribution-mismatch'));
  await t.test('a positive deduction other than floor(principal/10) is unavailable', async () => {
    const altered = await isolatedClaimFixture({ principal: '1000', storedRefined: '200' });
    // The receipt and lifetime conserve 1224 units, so the complete existing
    // replay admits them. The isolated factor proves a gross 1325: fee 101 is
    // neither the charged 100 nor the exempt zero.
    altered.interval.godlClaims[0].claim.treasuryDebit.amountBaseUnits = '1224';
    altered.interval.godlClaims[0].claim.ownerReceipt.amountBaseUnits = '1224';
    altered.interval.closing.accounts.miner.value.lifetimeRewardsGodl = '1224';
    bind(altered);
    assert.equal(reconcileCostInterval({ opening: altered.anchor.closing, interval: altered.interval,
      candles: altered.candles, funded: true, allowOpen: true, claimAware: true }).claims.treasuryDebitBaseUnits, '1224');
    assert.deepEqual(project(altered), unavailable('claim-attribution-mismatch'));
  });
});

test('missing, malformed, hash-tampered, and inconsistent evidence never throws or escapes optional failure', async t => {
  for (const value of [undefined, null, {}, [], 'bad', 1]) {
    assert.deepEqual(projectIsolatedClaimAttribution(value), unavailable('claim-evidence-unavailable'));
  }
  for (const [name, mutate] of [
    ['missing proof', f => { f.interval.godlClaims = []; }],
    ['missing collection', f => { delete f.interval.godlClaims; }],
    ['malformed collection', f => { f.interval.godlClaims = {}; }],
    ['duplicate proof', f => { f.interval.godlClaims.push(structuredClone(f.interval.godlClaims[0])); }],
    ['transaction hash', f => { f.interval.godlClaims[0].transactionSha256 = 'a'.repeat(64); }],
    ['mutated envelope', f => { f.interval.transactions[0].transactionIndex = 1; }],
    ['receipt mismatch', f => { f.interval.godlClaims[0].claim.ownerReceipt.amountBaseUnits = '1'; }],
    ['referral mismatch', f => { f.interval.godlClaims[0].claim.referralReceipt.amountBaseUnits = '1'; }],
    ['missing price', f => { f.candles = []; }],
    ['coverage gap', f => { f.interval.pages.miner.rows = []; f.interval.pages.miner.exhausted = false; }],
    ['missing transaction', f => { f.interval.transactions = []; }],
    ['duplicate transaction', f => { f.interval.transactions.push(structuredClone(f.interval.transactions[0])); }],
    ['closing lifetime mismatch', f => { f.interval.closing.accounts.miner.value.lifetimeRewardsGodl = '1225000000001'; }],
    ['negative lifetime', f => { f.interval.closing.accounts.miner.value.lifetimeRewardsGodl = '-1'; }],
    ['noncanonical principal', f => { f.anchor.closing.accounts.miner.value.rewardsGodl = '01000000000000'; }],
    ['overflowing principal', f => { f.anchor.closing.accounts.miner.value.rewardsGodl = String(U64 + 1n); }],
    ['account identity', f => { f.interval.closing.accounts.miner.address = f.trackedAccounts.minerExtended; }],
    ['referrer continuity', f => { f.interval.closing.accounts.miner.value.referrer = f.wallet; }],
    ['source continuity', f => { f.interval.closing.sourceCommit = 'a'.repeat(40); }],
    ['failed attempt moving miner funds', f => {
      const tx = addAttempt(f); tx.deltas.miner.afterLamports = '11'; tx.deltas.miner.changeLamports = '1';
    }],
    ['successful failed-attempt proof', f => {
      const tx = f.interval.transactions[0]; tx.outcome = 'failed'; tx.error = { InstructionError: [0, 'Custom'] };
      tx.instructionsAreAttempts = true; bind(f);
    }],
  ]) await t.test(name, async () => {
    const f = await isolatedClaimFixture({ referral: true }); mutate(f);
    assert.deepEqual(project(f), unavailable('claim-evidence-unavailable'));
  });
});
