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
