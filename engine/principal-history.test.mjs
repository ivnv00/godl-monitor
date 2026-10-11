// Generated synthetic accounting evidence only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claimAccountingFixture } from './test-fixtures/claim-accounting.mjs';
import { isolatedClaimFixture } from './test-fixtures/claim-attribution.mjs';
import { accountingFixture, indexedRow } from './test-fixtures/accounting.mjs';
import { extendFundedAccounting, fundedCheckpointHash } from './funded-accounting.mjs';
import { projectEarnings } from './earnings.mjs';
import { loadHistoricalIntervals, recoverHistoricalClaimAttribution } from './historical-accounting.mjs';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function project(f, historicalIntervals = [], extra = {}) {
  return projectEarnings({ snapshot:f.closing.closing, checkpoint:f.anchor, checkpoints:[f.anchor],
    fundedCheckpoint:f.closing, fundedCheckpoints:[f.closing], historicalIntervals,
    timeZone:'UTC', nowMs:Date.parse(f.closing.closing.observedAt) + 60_000, ...extra });
}
const claimDay = result => result.days.find(day => day.claimCount > 0);
const priorFields = value => {
  const copy = structuredClone(value);
  for (const day of copy.days) delete day.claimAttribution;
  return copy;
};
function source(f, opening = f.anchor, observations = []) {
  return {opening, closing:f.closing, observations,
    record:{checkpoint:f.closing, interval:f.interval, priceEvidence:{candles:f.candles}}};
}
async function isolated(options) {
  const f = await isolatedClaimFixture(options);
  f.closing = extendFundedAccounting({previous:f.anchor, interval:f.interval, candles:f.candles});
  return f;
}

test('claim-bearing partial days default to unknown attribution without changing prior fields', async () => {
  const f = await claimAccountingFixture();
  f.closing = extendFundedAccounting({previous:f.anchor, interval:f.interval, candles:f.candles});
  const before = JSON.stringify(f), day = claimDay(project(f));
  assert.deepEqual(day.claimAttribution, {method:'isolated-claim-factor-v1', status:'unavailable', reason:'claim-evidence-unavailable'});
  assert.equal(day.claimCount,1);
  assert.equal(day.netSpendUsd,'0.000500');
  assert.equal(day.unrefinedGodl,undefined); assert.equal(day.refinedGodl,undefined);
  assert.equal(JSON.stringify(f),before);
});

test('same-day committed claim record loads without intermediate observations and preserves every prior projected field', async t => {
  const f = await isolated({referral:true}), baseline = project(f), proof = source(f);
  const before = JSON.stringify(f), hash = fundedCheckpointHash(f.closing);
  const directory = await mkdtemp(join(tmpdir(),'godl-principal-history-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const recordPath = join(directory,'funded-reconciliation.json'), recordBytes = JSON.stringify(proof.record);
  await writeFile(recordPath,recordBytes);
  let reads = 0;
  const sources = await loadHistoricalIntervals({checkpoints:[f.anchor],
    fundedCheckpoints:[{...f.closing,evidenceDirectory:directory}], days:['2026-01-02'], timeZone:'UTC',
    readObservations:async()=>{reads++;return [];} });
  assert.equal(reads,1); assert.equal(sources.length,1); assert.deepEqual(sources[0].observations,[]);
  const unrelated=await loadHistoricalIntervals({checkpoints:[f.anchor],
    fundedCheckpoints:[{...f.closing,evidenceDirectory:directory}], days:['2026-01-01'], timeZone:'UTC',
    readObservations:async()=>{reads++;return [];} });
  assert.deepEqual(unrelated,[]); assert.equal(reads,1);
  const result = project(f,sources), day = claimDay(result);
  assert.equal(day.claimAttribution.status,'observed');
  assert.equal(day.claimAttribution.principalGodl.baseUnits,'1000000000000');
  assert.equal(day.claimAttribution.refinedGodl.baseUnits,'325000000000');
  assert.equal(day.claimAttribution.refiningFeeGodl.baseUnits,'100000000000');
  assert.equal(day.claimAttribution.referralFeeGodl.baseUnits,'6125000000');
  assert.equal(day.claimAttribution.ownerReceiptGodl.baseUnits,'1218875000000');
  assert.deepEqual(priorFields(result),priorFields(baseline));
  assert.deepEqual(claimDay(project(f,[...sources,...sources])),day);
  assert.deepEqual(project(f,sources,{endDay:day.day}).days[0],day);
  assert.equal(JSON.stringify(f),before); assert.equal(fundedCheckpointHash(f.closing),hash);
  const {readFile} = await import('node:fs/promises');
  assert.equal(await readFile(recordPath,'utf8'),recordBytes);
});

test('same-day saved observations cannot replace committed daily boundaries or reveal previously unknown net values', async () => {
  for (const missingClosingFactor of [true,false]) {
    const f=await isolated(), mid=structuredClone(f.closing.closing);
    Object.assign(mid,{context:{slot:'28'},observedAt:'2026-01-02T10:08:00.000Z'});
    if (missingClosingFactor) {
      delete f.interval.closing.accounts.miner.value.rewardsFactor;
      f.closing=extendFundedAccounting({previous:f.anchor,interval:f.interval,candles:f.candles});
    }
    const proof=source(f,f.anchor,[mid]), before=JSON.stringify(proof);
    const baseline=project(f), enriched=project(f,[proof]), day=claimDay(enriched);
    assert.deepEqual(priorFields(enriched),priorFields(baseline));
    assert.equal(day.fromSlot,'20'); assert.equal(day.throughSlot,'31');
    assert.equal(day.claimAttribution.status,missingClosingFactor ? 'unavailable' : 'observed');
    if (missingClosingFactor) {
      assert.equal(day.claimAdjustedGodl,undefined);
      assert.equal(day.claimAttribution.reason,'claim-factor-unavailable');
      assert.equal(day.claimAttribution.principalGodl,undefined);
    }
    assert.equal(JSON.stringify(proof),before);
  }
});

test('missing, corrupt and uncommitted attribution proofs preserve the committed baseline', async () => {
  const f = await isolated(), valid = source(f), baseline = project(f);
  assert.equal(recoverHistoricalClaimAttribution(valid).status,'observed');
  for (const mutate of [
    x=>{x.record.interval.godlClaims=[];},
    x=>{x.record.interval.godlClaims[0].transactionSha256='0'.repeat(64);},
    x=>{x.record.interval.godlClaims[0].claim.ownerReceipt.amountBaseUnits='1';},
    x=>{x.record.priceEvidence.candles=[];},
    x=>{x.record.checkpoint.ledger.netUsdLamportMicro='0';},
    x=>{x.opening.closing.observedAt='2026-01-02T09:59:00.000Z';},
  ]) {
    const bad=structuredClone(valid);mutate(bad);
    assert.deepEqual(project(f,[bad]),baseline);
  }
  const foreign = await isolated({refiningFeeApplies:false});
  assert.deepEqual(project(f,[source(foreign)]),baseline);
});

test('valid committed but nonisolated or missing-factor evidence remains optional and unknown', async () => {
  const many = await claimAccountingFixture({count:2});
  many.closing=extendFundedAccounting({previous:many.anchor,interval:many.interval,candles:many.candles});
  const result=project(many,[source(many)]);
  assert.equal(claimDay(result).claimAttribution.reason,'claim-state-not-isolated');
  assert.deepEqual(priorFields(result),priorFields(project(many)));
  const f=await isolated();
  delete f.interval.closing.accounts.miner.value.rewardsFactor;
  f.closing=extendFundedAccounting({previous:f.anchor,interval:f.interval,candles:f.candles});
  assert.equal(claimDay(project(f,[source(f)])).claimAttribution.reason,'claim-factor-unavailable');
});

test('older-day boundaries receive only their covered claim and selected/live projections agree', async () => {
  const f=await isolated(), tx=f.interval.transactions[0];
  tx.blockTime=Date.parse('2026-01-03T12:00:00.000Z')/1000;
  f.interval.godlClaims[0].transactionSha256=digest(tx);
  f.interval.closing.observedAt='2026-01-04T10:00:00.000Z';
  f.interval.closing.accounts.miner.value.lastClaimGodlAt=String(tx.blockTime);
  for (const [role,page] of Object.entries(f.interval.pages))
    page.rows=tx.deltas[role].status==='observed' ? [indexedRow(tx)] : [];
  f.candles=[[tx.blockTime,100,100,100,100,1]];
  f.closing=extendFundedAccounting({previous:f.anchor,interval:f.interval,candles:f.candles});
  const before=structuredClone(f.anchor.closing), after=structuredClone(f.closing.closing);
  Object.assign(before,{context:{slot:'22'},observedAt:'2026-01-03T08:00:00.000Z'});
  Object.assign(after,{context:{slot:'28'},observedAt:'2026-01-03T18:00:00.000Z'});
  const proof=source(f,f.anchor,[before,after]), bytes=JSON.stringify(proof);
  const live=project(f,[proof],{nowMs:Date.parse('2026-01-09T10:00:00.000Z')});
  const day=live.days.find(day=>day.day==='2026-01-03');
  assert.equal(day.fromSlot,'22'); assert.equal(day.throughSlot,'28');
  assert.equal(day.claimAttribution.status,'observed');
  assert.deepEqual(project(f,[proof],{nowMs:Date.parse('2026-01-09T10:00:00.000Z'),endDay:'2026-01-03'}).days[0],day);
  const atClaim=structuredClone(after);
  Object.assign(atClaim,{context:{slot:tx.slot},observedAt:new Date(tx.blockTime*1000).toISOString()});
  const included=project(f,[source(f,f.anchor,[before,atClaim])]).days.find(day=>day.day==='2026-01-03');
  assert.equal(included.throughSlot,tx.slot); assert.equal(included.claimAttribution.status,'observed');
  const excluded=project(f,[source(f,f.anchor,[atClaim,after])]).days.find(day=>day.day==='2026-01-03');
  assert.equal(excluded.fromSlot,tx.slot); assert.equal(excluded.claimCount,undefined);
  assert.equal(excluded.claimAttribution,undefined); assert.equal(JSON.stringify(proof),bytes);
});

async function separateClaims(options = {}) {
  const first=await isolated(options), second=await isolatedClaimFixture(options);
  const opening=second.interval.opening;
  Object.assign(opening,{context:{slot:'40'},observedAt:'2026-01-02T10:20:00.000Z'});
  opening.accounts.miner.value.lastClaimGodlAt=first.closing.closing.accounts.miner.value.lastClaimGodlAt;
  // Rewards accrued between the two independently isolated claim intervals.
  opening.accounts.miner.value.lifetimeRewardsGodl=String(BigInt(first.closing.closing.accounts.miner.value.lifetimeRewardsGodl)
    + BigInt(opening.accounts.miner.value.rewardsGodl) + BigInt(opening.accounts.miner.value.refinedGodl));
  const bridge=structuredClone(first.interval);
  const mining=(await accountingFixture()).interval.transactions[0];
  Object.assign(mining,{signature:'5'.repeat(88),slot:'35',blockTime:Date.parse('2026-01-02T10:15:00.000Z')/1000});
  Object.assign(bridge,{opening:structuredClone(first.closing.closing),closing:structuredClone(opening),
    fromExclusiveSlot:first.closing.closing.context.slot,toInclusiveSlot:'40',transactions:[mining],godlClaims:[]});
  for (const [role,page] of Object.entries(bridge.pages))
    page.rows=mining.deltas[role].status==='observed' ? [indexedRow(mining)] : [];
  const middle=extendFundedAccounting({previous:first.closing,interval:bridge,
    candles:[[mining.blockTime,100,100,100,100,1]]});
  const tx=second.interval.transactions[0], claim=second.interval.godlClaims[0].claim;
  Object.assign(tx,{signature:'4'.repeat(88),slot:'45',blockTime:Date.parse('2026-01-02T10:25:00.000Z')/1000});
  Object.assign(claim,{signature:tx.signature,slot:tx.slot});
  second.interval.godlClaims[0].transactionSha256=digest(tx);
  for (const [role,page] of Object.entries(second.interval.pages))
    page.rows=tx.deltas[role].status==='observed' ? [indexedRow(tx)] : [];
  Object.assign(second.interval.closing,{context:{slot:'50'},observedAt:'2026-01-02T10:30:00.000Z'});
  second.interval.closing.accounts.miner.value.lastClaimGodlAt=String(tx.blockTime);
  second.interval.closing.accounts.miner.value.lifetimeRewardsGodl=String(BigInt(opening.accounts.miner.value.lifetimeRewardsGodl)
    + BigInt(second.interval.closing.accounts.miner.value.lifetimeRewardsGodl) - BigInt(second.anchor.closing.accounts.miner.value.lifetimeRewardsGodl));
  second.interval.fromExclusiveSlot='40';second.interval.toInclusiveSlot='50';
  second.candles=[[tx.blockTime,100,100,100,100,1]];
  second.closing=extendFundedAccounting({previous:middle,interval:second.interval,candles:second.candles});
  return {first,second,middle,proofs:[source(first),source(second,middle)],
    chain:[first.closing,middle,second.closing]};
}

test('all separately isolated claims sum exactly; a missing interval withholds every total', async () => {
  const {first,second,chain,proofs}=await separateClaims();
  const f={...first,closing:second.closing}, extra={fundedCheckpoints:chain};
  const baseline=project(f,[],extra), result=project(f,[...proofs,...proofs],extra), day=claimDay(result);
  assert.equal(day.claimCount,2); assert.equal(day.claimAttribution.status,'observed');
  assert.equal(day.claimAttribution.principalGodl.baseUnits,'2000000000000');
  assert.equal(day.claimAttribution.refinedGodl.baseUnits,'650000000000');
  assert.equal(day.claimAttribution.refiningFeeGodl.baseUnits,'200000000000');
  assert.equal(day.claimAttribution.ownerReceiptGodl.baseUnits,'2450000000000');
  assert.deepEqual(priorFields(result),priorFields(baseline));
  const missing=claimDay(project(f,proofs.slice(0,1),extra)).claimAttribution;
  assert.deepEqual(missing,{method:'isolated-claim-factor-v1',status:'unavailable',reason:'claim-evidence-unavailable'});
});

test('mixed proven and unavailable intervals withhold totals; same-day intervals without claims keep the old loader behavior', async () => {
  const {first,second,middle,chain,proofs}=await separateClaims();
  delete second.interval.closing.accounts.miner.value.rewardsFactor;
  second.closing=extendFundedAccounting({previous:middle,interval:second.interval,candles:second.candles});
  const result=project({...first,closing:second.closing},[proofs[0],source(second,middle)],
    {fundedCheckpoints:[chain[0],middle,second.closing],nowMs:Date.parse('2026-01-03T10:00:00.000Z')});
  const attribution=claimDay(result).claimAttribution;
  assert.equal(attribution.status,'unavailable'); assert.equal(attribution.reason,'claim-factor-unavailable');
  assert.equal(attribution.principalGodl,undefined);
  let reads=0;
  const sources=await loadHistoricalIntervals({checkpoints:[first.anchor],
    fundedCheckpoints:[{...middle,evidenceDirectory:tmpdir()}],timeZone:'UTC',days:['2026-01-02'],
    readObservations:async()=>{reads++;return [];} });
  assert.deepEqual(sources,[]); assert.equal(reads,0);
});

test('an out-of-range daily gross aggregate remains unknown even when individual claims are valid', async () => {
  const {first,second,chain,proofs}=await separateClaims({storedRefined:'9223371061854775808',
    openingLifetime:'100000000000',factorDelta:0n});
  assert.ok(proofs.every(proof=>recoverHistoricalClaimAttribution(proof).status==='observed'));
  const f={...first,closing:second.closing}, extra={fundedCheckpoints:chain};
  const result=project(f,proofs,extra);
  assert.equal(claimDay(result).claimAttribution.reason,'claim-attribution-range');
  assert.equal(claimDay(result).claimAttribution.principalGodl,undefined);
  assert.deepEqual(priorFields(result),priorFields(project(f,[],extra)));
});
