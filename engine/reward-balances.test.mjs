import test from 'node:test';
import assert from 'node:assert/strict';
import { projectRewardBalances } from './reward-balances.mjs';
const Q = 1n << 48n;
const factor = n => ({rawBits:String(n), fractionalBits:48});
function snapshot(unrefined='1000000') {
 return {wallet:'owner',accounts:{
  miner:{status:'present',value:{authority:'owner',rewardsGodl:unrefined,refinedGodl:'7',rewardsFactor:factor(Q),lastClaimGodlAt:'0'}},
  treasury:{status:'present',value:{minerRewardsFactor:factor(Q+Q/2n)}},
  minerExtended:{status:'present',value:{authority:'owner',xautRewards:'2',lifetimeXaut:'5',xautRewardsFactor:factor(Q)}},
  goldVault:{status:'present',value:{xautRewardsFactor:factor(Q*2n),pendingXaut:'999999999'}}
 }};
}
test('projects exact refined and gold lazy settlement without assigning vault pending gold to owner',()=>{
 const x=projectRewardBalances(snapshot());
 assert.equal(x.pendingRefinedGodl.baseUnits,'500000');
 assert.equal(x.refinedGodl.baseUnits,'500007');
 assert.equal(x.pendingGold.baseUnits,'1');
 assert.equal(x.claimableGold.display,'0.000003');
 assert.equal(x.rewardObservation.cumulativeGoldBaseUnits,'6');
});
test('floors gold sub-unit dust and preserves integers above Number precision',()=>{
 assert.equal(projectRewardBalances(snapshot('500000')).pendingGold.baseUnits,'0');
 const s=snapshot('9007199254740993');
 assert.equal(projectRewardBalances(s).pendingRefinedGodl.baseUnits,'4503599627370496');
});
test('gold earning total is stable across settlement and claim',()=>{
 const s=snapshot(),before=projectRewardBalances(s);
 s.accounts.minerExtended.value={...s.accounts.minerExtended.value,xautRewards:'3',lifetimeXaut:'6',xautRewardsFactor:factor(2n*Q)};
 const settled=projectRewardBalances(s);assert.equal(settled.claimableGold.baseUnits,before.claimableGold.baseUnits);
 assert.equal(settled.rewardObservation.cumulativeGoldBaseUnits,before.rewardObservation.cumulativeGoldBaseUnits);
 s.accounts.minerExtended.value.xautRewards='0';
 assert.equal(projectRewardBalances(s).claimableGold.baseUnits,'0');
 assert.equal(projectRewardBalances(s).rewardObservation.cumulativeGoldBaseUnits,'6');
});
test('missing gold account/factor remains unavailable, including old observations',()=>{
 const s=snapshot();delete s.accounts.goldVault;
 assert.equal(projectRewardBalances(s).claimableGold.status,'unavailable');
 s.accounts.minerExtended={status:'missing'};
 assert.equal(projectRewardBalances(s).storedGold.status,'unavailable');
 s.accounts.miner={status:'missing'};
 assert.equal(projectRewardBalances(s).refinedGodl.status,'unavailable');
});
test('invalid authority, negative/regressed factors and overflow fail closed',()=>{
 let s=snapshot();s.accounts.minerExtended.value.authority='other';assert.throws(()=>projectRewardBalances(s),/authority/);
 s=snapshot();s.accounts.goldVault.value.xautRewardsFactor=factor(0n);assert.throws(()=>projectRewardBalances(s),/regressed/);
 s=snapshot();s.accounts.goldVault.value.xautRewardsFactor=factor(-1n);assert.throws(()=>projectRewardBalances(s));
 s=snapshot();s.accounts.miner.value.refinedGodl=String((1n<<64n)-1n);assert.throws(()=>projectRewardBalances(s),/u64/);
});
