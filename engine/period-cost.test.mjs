import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileClosedPeriod, projectPeriodReceipt, instructionCode } from './period-cost.mjs';
import { MAINNET_GENESIS } from './monitor.mjs';
import { GODL_PROGRAM_ADDRESS, GODL_SOURCE_COMMIT } from './chain.mjs';
const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const code=n=>n<58?alphabet[n]:alphabet[Math.floor(n/58)]+alphabet[n%58];
const trackedAccounts={wallet:'owner',miner:'miner',minerExtended:'extended',automation:'legacy',automationV2:'auto'};
const observed=(address,before,after)=>({address,status:'observed',beforeLamports:String(before),afterLamports:String(after),changeLamports:String(BigInt(after)-BigInt(before))});
function fixture(){
  const old={signature:'old',slot:'1',confirmationStatus:'finalized',blockTime:60,transactionIndex:0,err:null};
  const tx=(signature,slot,op,change,{failed=false,bot=false}={})=>({signature,slot:String(slot),blockTime:slot*60,status:'observed',outcome:failed?'failed':'succeeded',error:failed?{failed:true}:null,
    feePayer:bot?'bot':'owner',transactionFeeLamports:'5000',ownerPaidNetworkFeeLamports:bot?'0':'5000',
    deltas:{wallet:observed('owner',1000000000n,1000000000n+BigInt(change)),miner:observed('miner',10,10),minerExtended:observed('extended',0,0),
      automation:observed('legacy',0,0),automationV2:observed('auto',0,0)},
    godlInstructions:op===null?[]:[{dataBase58:code(op),accounts:[op===42?'stake':'miner']}]});
  const transactions=[tx('start',10,68,-100005000),tx('bot',11,66,0,{bot:true}),tx('fund',12,null,900000000),tx('stake',13,42,-5000),tx('failed',14,68,-5000,{failed:true}),tx('return',15,3,50000000,{bot:true})];
  const rows=transactions.map(t=>({signature:t.signature,slot:t.slot,blockTime:t.blockTime,transactionIndex:0,err:t.error,confirmationStatus:'finalized'})).reverse();
  const closing={wallet:'owner',genesisHash:MAINNET_GENESIS,commitment:'finalized',programAddress:GODL_PROGRAM_ADDRESS,sourceCommit:GODL_SOURCE_COMMIT,
    observedAt:'2026-09-24T12:00:00.000Z',context:{slot:'20'},accounts:{
      miner:{address:'miner',status:'present',lamports:'10',value:{authority:'owner',rewardsSol:'0',rewardsGodl:'1000000000000',lastClaimGodlAt:'60',deployed:Array(25).fill('0')}},
      minerExtended:{address:'extended',status:'present',lamports:'0'},automation:{address:'legacy',status:'missing'},automationV2:{address:'auto',status:'missing'}}};
  return {wallet:'owner',trackedAccounts,pages:Object.fromEntries(['wallet','miner','automation','automationV2'].map(r=>[r,[...structuredClone(rows),{...old}]])),transactions,
    baselineClaim:{signature:'old',slot:'1',blockTime:60,status:'observed',outcome:'succeeded',godlInstructions:[{dataBase58:code(4),accounts:['miner']}]},closing,
    candles:transactions.map(t=>[t.blockTime,100,100,100,100,1]),startSlot:'10',ownerConfirmedZeroOpening:true};
}
test('exact period cash excludes funding and staking, subtracts returns, and counts only owner fees',()=>{
  const result=reconcileClosedPeriod(fixture()),p=result.acquisitionPeriod;
  assert.equal(p.netSpendSol,'0.050010000'); assert.equal(p.earnedGodl,'10.00000000000');
  assert.equal(p.netCostPerGodlSol,'0.005001000000');assert.equal(p.netSpendUsd,'5.001000');assert.equal(p.netCostPerGodlUsd,'0.50010000');
  assert.equal(p.ownerNetworkFeesSol,'0.000010000'); assert.deepEqual(result.evidence.excludedUnrelatedSignatures,['fund','stake']);
  assert.match(p.baselineBasis,/You confirmed/);
  assert.deepEqual(projectPeriodReceipt(fixture().closing,result),p);
});
test('historical prices value each cash flow; negative net cost remains signed',()=>{
  const x=fixture();x.candles.find(c=>c[0]===900)[4]=200;
  assert.equal(reconcileClosedPeriod(x).acquisitionPeriod.netSpendUsd,'0.001000');
  x.transactions.at(-1).deltas.wallet=observed('owner',1000000000n,1200000000n);
  const r=reconcileClosedPeriod(x);assert.equal(r.acquisitionPeriod.netSpendSol,'-0.099990000');
  assert.equal(projectPeriodReceipt(x.closing,r).netCostPerGodlUsd,'-2.99990000');
});
test('coverage gaps, duplicates and conflicting outcomes are rejected',()=>{
  for(const mutate of [x=>x.transactions.splice(1,1),x=>x.transactions.push(x.transactions[0]),x=>x.pages.miner[0].blockTime++,x=>x.transactions[0].outcome='failed',x=>x.pages.wallet.pop()]){
    const x=fixture();mutate(x);assert.throws(()=>reconcileClosedPeriod(x));
  }
});
test('baseline, closed-state, price and unsupported-reward guards reject unknown accounting',()=>{
  for(const mutate of [x=>x.baselineClaim.signature='other',x=>x.closing.accounts.miner.value.lastClaimGodlAt='61',x=>x.closing.accounts.automationV2.status='present',
    x=>x.closing.accounts.miner.value.deployed[0]='1',x=>x.closing.accounts.miner.value.rewardsSol='1',x=>x.candles=[],x=>x.candles.push(x.candles[0]),
    ...[4,41,49,99].map(op=>x=>x.transactions[1].godlInstructions[0].dataBase58=code(op))]){
    const x=fixture();mutate(x);assert.throws(()=>reconcileClosedPeriod(x));
  }
});
test('owned account continuity, fee payer and closure balances must reconcile',()=>{
  for(const mutate of [x=>x.transactions[1].deltas.miner=observed('miner',11,11),x=>x.transactions[0].ownerPaidNetworkFeeLamports='0',
    x=>x.closing.accounts.miner.lamports='11',x=>x.transactions[4].deltas.wallet=observed('owner',10000,10000)]){
    const x=fixture();mutate(x);assert.throws(()=>reconcileClosedPeriod(x));
  }
});
test('receipt rejects wrong identity, future dates and inconsistent totals or prices',()=>{
  for(const mutate of [r=>r.wallet='other',r=>r.sourceCommit='other',r=>r.acquisitionPeriod.throughAt='2099-01-01T00:00:00.000Z',
    r=>r.acquisitionPeriod.netSpendSol='0.1',r=>r.acquisitionPeriod.netCostPerGodlUsd='0.01',r=>r.acquisitionPeriod.netSpendUsd='5.1',
    r=>r.acquisitionPeriod.earnedGodl='0',r=>r.acquisitionPeriod.priceBasis='',r=>r.evidence.closingSlot='21']){
    const x=fixture(),r=reconcileClosedPeriod(x);mutate(r);assert.throws(()=>projectPeriodReceipt(x.closing,r));
  }
});
test('instruction codes decode multi-byte data and leading zero correctly',()=>{
  assert.equal(instructionCode('1'),0);assert.equal(instructionCode('24'),61);assert.equal(instructionCode('LQUxN'),13);
  assert.throws(()=>instructionCode('0'));assert.throws(()=>instructionCode(''));
});


test('reviewed period accepts terminal retained grid without changing cash or receipt hashes', () => {
  const original = reconcileClosedPeriod(fixture());
  const settled = fixture();
  Object.assign(settled.closing.accounts.miner.value, { roundId: '7', checkpointId: '7' });
  settled.closing.accounts.miner.value.deployed[0] = '500000';
  assert.deepEqual(reconcileClosedPeriod(settled), original);
  settled.closing.accounts.miner.value.deployed[24] = 'invalid';
  assert.throws(() => reconcileClosedPeriod(settled));
  settled.closing.accounts.miner.value.deployed[24] = '0';
  settled.closing.accounts.miner.value.checkpointId = '6';
  assert.throws(() => reconcileClosedPeriod(settled), /Period still has/);
});
