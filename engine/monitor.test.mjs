import test from 'node:test';
import assert from 'node:assert/strict';
import { projectMonitor, MAINNET_GENESIS } from './monitor.mjs';
const now = Date.parse('2026-09-24T03:00:00Z');
function fixture() {
  return { wallet: 'fixture-wallet', genesisHash: MAINNET_GENESIS, commitment: 'finalized', observedAt: new Date(now).toISOString(),
    context: { slot: '9007199254740993' }, programAddress: 'program', sourceCommit: 'commit',
    accounts: { board: { status: 'present', value: { roundId: '52' } },
      miner: { status: 'present', value: { authority: 'fixture-wallet', rewardsGodl: '8156000000000', refinedGodl: '100000000000', rewardsSol: '12345678',
        lifetimeRewardsGodl: '99000000000000', lifetimeDeployed: '5000000000', lifetimeRewardsSol: '4900000000',
        roundId: '51', checkpointId: '50', deployed: Array(25).fill('1000000') } }, automationV2: { status: 'missing' } } };
}
test('monitor shows observed principal and exact goal without inventing acquisition cost from lifetime counters', () => {
  const view = projectMonitor(fixture(), { nowMs: now });
  assert.equal(view.balances.unrefinedGodl.display, '81.56000000000');
  assert.equal(view.goal.progressPercent, '0.8156');
  assert.equal(view.goal.remainingGodl, '9918.44000000000');
  assert.equal(view.balances.storedRefinedGodl.display, '1.00000000000');
  assert.equal(view.performance.netCostPerGodlUsd.status, 'unavailable');
  assert.equal(view.deployment.precedingRoundNeedsCheckpoint, true);
  assert.equal(view.capabilities.canExecute, false);
  assert.equal(view.capabilities.canPause, false);
  assert.deepEqual(view.automations.map(x => x.state), ['not-observed','account-missing']);
});
test('old observations become stale without implying remote execution is paused', () => {
  const view=projectMonitor(fixture(), { nowMs: now+61000 });
  assert.equal(view.observation.status,'stale');
  assert.equal(view.capabilities.canPause,false);
  assert.throws(()=>projectMonitor(fixture(),{nowMs:now-6000}), /future/);
});
test('missing miner is unknown balance and cannot be displayed as zero holdings', () => {
  const x=fixture(); x.accounts.miner={status:'missing'};
  const view=projectMonitor(x,{nowMs:now});
  assert.equal(view.balances.unrefinedGodl.status,'unavailable');
  assert.equal(view.goal.status,'unavailable');
});
test('history is identity scoped and a principal decrease is preserved instead of called negative mining yield', () => {
  const prior=fixture(), current=fixture(); prior.context.slot='9007199254740992';
  prior.accounts.miner.value.rewardsGodl='10000000000000';
  const view=projectMonitor(current,{nowMs:now,history:[prior,current]});
  assert.equal(view.history.series[0].unrefinedGodl.display,'100.00000000000');
  assert.equal(view.performance.earnedTodayGodl.status,'unavailable');
  const wrong=fixture();wrong.wallet='someone-else';
  assert.throws(()=>projectMonitor(current,{nowMs:now,history:[wrong]}),/identity/);
});
test('wrong network, non-finalized state, wrong authority and invalid goal fail closed', () => {
  const x=fixture();x.genesisHash='devnet';assert.throws(()=>projectMonitor(x),/mainnet/);
  x.genesisHash=MAINNET_GENESIS;x.commitment='processed';assert.throws(()=>projectMonitor(x),/finalized/);
  x.commitment='finalized';x.accounts.miner.value.authority='someone-else';assert.throws(()=>projectMonitor(x,{nowMs:now}),/authority/);
  assert.throws(()=>projectMonitor(fixture(),{nowMs:now,targetGodl:'0'}),/positive/);
});

test('single-pass history produces the same DTO with exact large slots, amounts and missing miners', () => {
  const current = fixture(); current.context.slot = '18446744073709551615';
  current.accounts.miner.value.rewardsGodl = '18446744073709551615';
  const prior = fixture(); prior.accounts.miner = { status: 'missing' };
  const rows = [current, prior];
  let iterations = 0, closed = false;
  const history = { *[Symbol.iterator]() {
    assert.equal(++iterations, 1, 'history must only be consumed once');
    try { yield* rows; } finally { closed = true; }
  } };
  const actual = projectMonitor(current, { nowMs: now, history });
  assert.deepEqual(actual, projectMonitor(current, { nowMs: now, history: rows }));
  assert.equal(actual.history.series[0].unrefinedGodl, null);
  assert.equal(actual.history.series[1].slot, '18446744073709551615');
  assert.equal(actual.history.series[1].unrefinedGodl.baseUnits, '18446744073709551615');
  assert.equal(iterations, 1); assert.equal(closed, true);
});

test('every iterable history point is validated and projection errors close its iterator', () => {
  const cases = [
    [x => { x.wallet = 'synthetic-other-wallet'; }, /identity/],
    [x => { x.genesisHash = 'synthetic-other-network'; }, /identity/],
    [x => { x.commitment = 'processed'; }, /commitment/],
    [x => { x.accounts.miner.value.authority = 'synthetic-other-authority'; }, /authority/],
    [x => { x.context.slot = '9007199254740994'; }, /later slot/],
    [x => { x.context.slot = 'invalid'; }, /slot/],
    [x => { x.observedAt = 'invalid'; }, /observedAt/],
    [x => { x.accounts.miner.value.rewardsGodl = '-1'; }, /unsigned|integer|amount/]
  ];
  for (const [mutate, message] of cases) {
    const invalid = fixture(); mutate(invalid);
    let closed = false, reachedAfterInvalid = false;
    function* history() {
      try { yield fixture(); yield invalid; reachedAfterInvalid = true; yield fixture(); }
      finally { closed = true; }
    }
    assert.throws(() => projectMonitor(fixture(), { nowMs: now, history: history() }), message);
    assert.equal(closed, true, 'projection failure must close history');
    assert.equal(reachedAfterInvalid, false, 'projection must stop at invalid evidence');
  }
});

test('history rejects non-iterable inputs while undefined retains the empty default', () => {
  for (const history of [{}, { length: 0 }, 42, true, null]) {
    assert.throws(() => projectMonitor(fixture(), { nowMs: now, history }), TypeError);
  }
  assert.equal(projectMonitor(fixture(), { nowMs: now, history: undefined }).history.count, 0);
});
