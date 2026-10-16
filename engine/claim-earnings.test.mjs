// Generated synthetic observations and transaction proofs only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claimAccountingFixture } from './test-fixtures/claim-accounting.mjs';
import { accountingFixture, indexedRow } from './test-fixtures/accounting.mjs';
import { extendFundedAccounting, fundedCheckpointHash } from './funded-accounting.mjs';
import { loadFundedCheckpoints, projectEarnings } from './earnings.mjs';
import { recoverHistoricalPoints } from './historical-accounting.mjs';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const quotes = [
  {asset:'GODL', mint:'GodL6KZ9uuUoQwELggtVzQkKmU1LfqmDokPibPeDKkhF', priceUsd:'2', pairAddress:'synthetic', dexId:'synthetic'},
  {asset:'XAUt0', mint:'AymATz4TCL9sWNEEV9Kvyz45CHVhDZ6kUgjTJPzLpU9P', priceUsd:'10', pairAddress:'synthetic-gold', dexId:'synthetic'},
];
async function fixture(options) {
  const f = await claimAccountingFixture(options);
  // Both endpoints use the same pinned refining regime.
  f.interval.closing.accounts.treasury.value.totalUnclaimed = f.interval.closing.accounts.miner.value.rewardsGodl;
  f.closing = extendFundedAccounting({previous:f.anchor, interval:f.interval, candles:f.candles});
  return f;
}
function projection(f, extra = {}) {
  const nowMs = Date.parse(f.closing.closing.observedAt) + 60_000;
  return projectEarnings({snapshot:f.closing.closing, checkpoint:f.anchor, checkpoints:[f.anchor],
    fundedCheckpoint:f.closing, fundedCheckpoints:[f.closing], timeZone:'UTC', nowMs,
    market:{source:'DEX Screener', observedAt:f.closing.closing.observedAt,
      goldReference:{source:'CoinGecko',assetId:'tether-gold',priceUsd:'10',observedAt:f.closing.closing.observedAt},
      expiresAt:new Date(nowMs + 60_000).toISOString(), quotes}, ...extra});
}
const row = result => result.days.find(day => day.coverage === 'partial');

test('same-day receipts cancel carry-in, preserve exact claim fees and withhold the principal split and cumulative profit', async () => {
  const f = await fixture(), before = JSON.stringify(f), result = projection(f), day = row(result);
  assert.equal(result.schemaVersion,3); assert.equal(result.position.netReady,true);
  assert.equal(day.claimCount,1); assert.equal(day.claimAdjustedGodl,'4.00000000000');
  assert.equal(day.gold.baseUnits,'0'); assert.equal(day.netSpendUsd,'0.000500');
  assert.equal(day.rewardValueUsd,'8.000000'); assert.equal(day.netRewardUsd,'7.999500');
  for (const field of ['unrefinedGodl','refinedGodl','unrefinedUsd','refinedUsd']) assert.equal(day[field],undefined);
  for (const field of ['claimableGodl','rewardValueUsd','netPnlUsd','netSpendUsd']) assert.equal(result.total[field],undefined);
  assert.match(result.total.reason,/principal attribution/); assert.equal(JSON.stringify(f),before);
});

test('negative claim-adjusted change remains signed and exact', async () => {
  const f = await fixture({closingUnrefined:'0', closingRefined:'0'});
  for (const snapshot of [f.anchor.closing,f.interval.opening,f.interval.closing])
    snapshot.accounts.treasury.value.minerRewardsFactor={rawBits:String(1n<<48n),fractionalBits:48};
  f.closing=extendFundedAccounting({previous:f.anchor,interval:f.interval,candles:f.candles});
  const day = row(projection(f));
  assert.equal(day.claimAdjustedGodl,'-10.00000000000'); assert.equal(day.rewardValueUsd,'-20.000000');
  assert.equal(day.netRewardUsd,'-20.000500');
});

test('multiple same-second claims and zero receipts count independently', async () => {
  const many = row(projection(await fixture({count:2,sameSecond:true})));
  assert.equal(many.claimCount,2); assert.equal(many.claimAdjustedGodl,'16.00000000000');
  assert.equal(many.netSpendUsd,'0.001000');
  const zero = row(projection(await fixture({amount:'0',closingUnrefined:'1000000000000',closingRefined:'200000000000'})));
  assert.equal(zero.claimCount,1); assert.equal(zero.claimAdjustedGodl,'0.00000000000');
  assert.equal(zero.netRewardUsd,'-0.000500');
});

test('receipt and signed reward math stays exact above the JS safe integer', async () => {
  const f = await fixture({amount:'9007199254740993'}), day = row(projection(f));
  assert.equal(day.claimAdjustedGodl,'90063.99254740993');
  assert.equal(day.rewardValueUsd,'180127.985095');
});

test('referral rounding to zero at the closing endpoint does not change the referral identity', async () => {
  const f = await fixture({referral:true,closingUnrefined:'0',closingRefined:'0'});
  const day = row(projection(f));
  assert.equal(day.claimAdjustedGodl,'0.00000000000'); assert.equal(day.netRewardUsd,'-0.000500');
});

test('missing factors, quotes and a changed refining regime leave the corresponding values unknown', async () => {
  const f = await fixture();
  const unpriced = row(projection(f,{market:undefined}));
  assert.equal(unpriced.claimAdjustedGodl,'4.00000000000'); assert.equal(unpriced.netSpendUsd,'0.000500');
  assert.equal(unpriced.netRewardUsd,undefined);
  for (const mutate of [
    x => {delete x.interval.closing.accounts.treasury.value.minerRewardsFactor;},
    x => {x.interval.closing.accounts.treasury.value.totalUnclaimed='900000000000';},
  ]) {
    const unknown = structuredClone(f); mutate(unknown);
    unknown.closing = extendFundedAccounting({previous:unknown.anchor,interval:unknown.interval,candles:unknown.candles});
    const day = row(projection(unknown));
    assert.equal(day.claimCount,1); assert.equal(day.claimAdjustedGodl,undefined); assert.equal(day.netRewardUsd,undefined);
    assert.equal(day.netSpendUsd,'0.000500'); assert.equal(day.gold.baseUnits,'0');
  }
});

function historical(f) {
  f.interval.closing.observedAt='2026-01-04T10:00:00.000Z';
  for (const [index,tx] of f.interval.transactions.entries()) {
    tx.blockTime=Date.parse('2026-01-03T12:00:00.000Z')/1000 + index*60;
    f.interval.godlClaims[index].transactionSha256=digest(tx);
  }
  f.interval.closing.accounts.miner.value.lastClaimGodlAt=String(f.interval.transactions.at(-1).blockTime);
  for (const [role,page] of Object.entries(f.interval.pages)) page.rows=f.interval.transactions
    .filter(tx=>tx.deltas[role].status==='observed').map(indexedRow).reverse();
  f.candles=f.interval.transactions.map(tx=>[tx.blockTime,100,100,100,100,1]);
  f.closing=extendFundedAccounting({previous:f.anchor,interval:f.interval,candles:f.candles});
  const before=structuredClone(f.anchor.closing), after=structuredClone(f.interval.closing);
  Object.assign(before,{context:{slot:'22'},observedAt:'2026-01-03T08:00:00.000Z'});
  Object.assign(after,{context:{slot:'28'},observedAt:'2026-01-03T18:00:00.000Z'});
  return {opening:f.anchor,closing:f.closing,observations:[before,after], record:{checkpoint:f.closing,
    interval:f.interval,priceEvidence:{candles:f.candles}}};
}

test('overnight historical replay partitions receipts and fees without duplicates; selected and live weeks agree', async () => {
  const f = await fixture({count:2}), source = historical(f), before=JSON.stringify(source);
  const points=recoverHistoricalPoints(source);
  assert.deepEqual(points.map(point=>point.claims.count),[0,2]);
  assert.equal(points[1].claims.ownerReceiptBaseUnits,'2400000000000');
  assert.equal(BigInt(points[1].netUsdLamportMicro)-BigInt(points[0].netUsdLamportMicro),1000000000000n);
  const result=projection(f,{historicalIntervals:[source,source]});
  const day=result.days.find(day=>day.day==='2026-01-03');
  assert.equal(day.fromSlot,'22'); assert.equal(day.throughSlot,'28');
  assert.equal(day.claimCount,2); assert.equal(day.claimAdjustedGodl,'16.00000000000');
  assert.equal(day.netSpendUsd,'0.001000'); assert.equal(day.netRewardUsd,'31.999000');
  const selected=projection(f,{historicalIntervals:[source],endDay:'2026-01-03'});
  assert.deepEqual(selected.days[0],day); assert.equal(JSON.stringify(source),before);
});

test('missing, mismatched and unsupported recovery proofs cannot erase holdings or committed rows', async () => {
  const f = await fixture(), source=historical(f), baseline=projection(f);
  for (const mutate of [
    x=>{x.record.interval.godlClaims=[];},
    x=>{x.record.interval.godlClaims[0].transactionSha256='0'.repeat(64);},
    x=>{x.record.interval.godlClaims[0].claim.status='unavailable';},
    x=>{x.record.interval.godlClaims[0].claim.ownerReceipt.amountBaseUnits='1';},
    x=>{x.record.priceEvidence.candles=[];},
  ]) {
    const bad=structuredClone(source);mutate(bad);
    assert.throws(()=>recoverHistoricalPoints(bad));
    assert.deepEqual(projection(f,{historicalIntervals:[bad]}),baseline);
  }
  for (const mutate of [
    s=>{s.accounts.miner.value.rewardsSol='1';},
    s=>{s.accounts.miner.value.roundId='1';s.accounts.miner.value.deployed[0]='1';},
    s=>{s.accounts.miner.value.referrer='unsupported';},
  ]) {
    const bad=structuredClone(source);mutate(bad.observations[0]);
    assert.deepEqual(recoverHistoricalPoints(bad).map(point=>point.closing.context.slot),['28']);
  }
});

test('v3 history loader verifies interval summary subtraction as well as hashes', async t => {
  const f=await fixture(), root=await mkdtemp(join(tmpdir(),'godl-claim-history-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const loaded=await loadFundedCheckpoints({checkpoint:f.closing,evidenceRoot:root});
  assert.equal(fundedCheckpointHash(loaded[0]),fundedCheckpointHash(f.closing));
  const bad=structuredClone(f.closing);bad.ledger.lastInterval.claims.ownerReceiptBaseUnits='1';
  await assert.rejects(loadFundedCheckpoints({checkpoint:bad,evidenceRoot:root}),/claim/i);
});

test('v1/v2 funded hashes and rows retain their legacy meaning', async () => {
  const f=await accountingFixture(), legacy=extendFundedAccounting({previous:f.anchor,interval:f.interval,candles:f.candles});
  for (const version of [1,2]) {
    legacy.schemaVersion=version;legacy.ledger.schemaVersion=version;
    const hash=fundedCheckpointHash(legacy), before=JSON.stringify(legacy);
    const result=projection({...f,closing:legacy});
    const day=row(result);
    assert.equal(day.claimAdjustedGodl,undefined); assert.equal(day.claimCount,undefined);
    assert.equal(day.unrefinedGodl.baseUnits,'200000000000'); assert.equal(day.refinedGodl.baseUnits,'50000000000');
    assert.equal(day.netRewardUsd,'2.999500'); assert.equal(JSON.stringify(legacy),before);
    assert.equal(fundedCheckpointHash(legacy),hash); assert.equal(result.schemaVersion,version);
  }
});

test('later v3 days without claims preserve ordinary daily rows and earlier claim rows', async () => {
  const f=await fixture(), suffix=[f.closing];
  for (const [slot,at,unrefined,refined] of [
    ['40','2026-01-03T08:00:00.000Z','300000000000','200000000000'],
    ['50','2026-01-03T09:00:00.000Z','300000000000','300000000000'],
  ]) {
    const previous=suffix.at(-1), interval=structuredClone(f.interval), before=previous.closing.accounts.miner.value;
    interval.opening=structuredClone(previous.closing);interval.closing=structuredClone(previous.closing);
    interval.fromExclusiveSlot=previous.closing.context.slot;interval.toInclusiveSlot=slot;
    Object.assign(interval.closing,{context:{slot},observedAt:at});
    Object.assign(interval.closing.accounts.miner.value,{rewardsGodl:unrefined,refinedGodl:refined,
      lifetimeRewardsGodl:String(BigInt(before.lifetimeRewardsGodl)+BigInt(unrefined)-BigInt(before.rewardsGodl)
        +BigInt(refined)-BigInt(before.refinedGodl))});
    interval.closing.accounts.treasury.value.totalUnclaimed=unrefined;
    interval.transactions=[];interval.godlClaims=[];
    for(const page of Object.values(interval.pages))page.rows=[];
    suffix.push(extendFundedAccounting({previous,interval}));
  }
  const original=row(projection(f));
  const latest={...f,closing:suffix.at(-1)}, result=projection(latest,{fundedCheckpoints:suffix});
  assert.equal(result.schemaVersion,3);
  assert.deepEqual(result.days.find(day=>day.day==='2026-01-02'),original);
  const day=result.days.find(day=>day.day==='2026-01-03');
  assert.equal(day.claimCount,undefined);assert.equal(day.claimAdjustedGodl,undefined);
  assert.equal(day.unrefinedGodl.baseUnits,'0');
  assert.equal(day.refinedGodl.baseUnits,'100000000000');assert.equal(day.netRewardUsd,'2.000000');
  assert.equal(result.total.netPnlUsd,undefined);
});
