// Generated synthetic snapshots, prices and account keys only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { accountingFixture, indexedRow } from './test-fixtures/accounting.mjs';
import { extendClosedAccounting } from './ongoing-cost.mjs';
import { recoverHistoricalPoints } from './historical-accounting.mjs';
import { projectEarnings } from './earnings.mjs';
const digest = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');

export async function historicalFixture() {
  const f = await accountingFixture();
  f.interval.closing.observedAt = '2026-01-04T10:00:00.000Z';
  f.interval.transactions[0].blockTime = Date.parse('2026-01-03T12:00:00.000Z') / 1000;
  f.candles[0][0] = f.interval.transactions[0].blockTime;
  for (const page of Object.values(f.interval.pages)) page.rows = [indexedRow(f.interval.transactions[0])];
  const closing = extendClosedAccounting({previous:f.anchor, interval:f.interval, candles:f.candles});
  const before = structuredClone(f.anchor.closing), after = structuredClone(f.interval.closing);
  Object.assign(before, {observedAt:'2026-01-03T08:00:00.000Z',context:{slot:'22'}});
  Object.assign(after, {observedAt:'2026-01-03T18:00:00.000Z',context:{slot:'28'}});
  return { opening:f.anchor, closing, observations:[before,after], record:{
    priorReceiptSha256:digest(f.anchor.receipt), receipt:closing.receipt, interval:f.interval,
    priceEvidence:{candles:f.candles} } };
}

test('saved intermediate boundaries recover exact historical costs without rewriting the committed interval', async () => {
  const f = await historicalFixture(), before = JSON.stringify(f);
  const points = recoverHistoricalPoints(f);
  assert.deepEqual(points.map(x => x.closing.context.slot), ['22','28']);
  assert.deepEqual(points.map(x => x.netUsdLamportMicro), ['10000500000000000','13001000000000000']);
  assert.ok(points.every(x => x.recovered && !x.funded));
  assert.equal(JSON.stringify(f),before);
});

function projection(f, extra = {}) {
  const nowMs = Date.parse('2026-01-04T10:01:00.000Z');
  return projectEarnings({snapshot:f.closing.closing, checkpoint:f.closing, checkpoints:[f.opening,f.closing],
    historicalIntervals:[f], timeZone:'UTC', nowMs, market:{source:'DEX Screener', observedAt:'2026-01-04T10:00:00.000Z',
      goldReference:{source:'CoinGecko',assetId:'tether-gold',priceUsd:'10',observedAt:'2026-01-04T10:00:00.000Z'},
      expiresAt:'2026-01-04T10:02:00.000Z', quotes:[
        {asset:'GODL',mint:'GodL6KZ9uuUoQwELggtVzQkKmU1LfqmDokPibPeDKkhF',priceUsd:'2',pairAddress:'synthetic',dexId:'synthetic'},
        {asset:'XAUt0',mint:'AymATz4TCL9sWNEEV9Kvyz45CHVhDZ6kUgjTJPzLpU9P',priceUsd:'10',pairAddress:'synthetic-gold',dexId:'synthetic'}]}, ...extra});
}

test('recovered partial-day net enters daily rows only; quotes, total and unknown days keep their meanings', async () => {
  const f = await historicalFixture(), baseline = projection(f,{historicalIntervals:[]}), result = projection(f);
  assert.equal(baseline.days.find(d => d.day === '2026-01-03').coverage,'unavailable');
  const day = result.days.find(d => d.day === '2026-01-03');
  assert.equal(day.coverage,'partial'); assert.equal(day.netSpendUsd,'3.000500');
  assert.equal(day.netRewardUsd,'2.999500'); assert.equal(day.fromAt,'2026-01-03T08:00:00.000Z');
  assert.equal(day.throughAt,'2026-01-03T18:00:00.000Z'); assert.match(day.reason,/recovered/);
  assert.deepEqual(result.total,baseline.total); assert.deepEqual(result.holdings,baseline.holdings);
  assert.equal(result.days.find(d => d.day === '2026-01-01').coverage,'unavailable');
  const expired = projection(f,{market:{...result.market,expiresAt:'2026-01-04T10:00:30.000Z'}});
  const staleDay = expired.days.find(d => d.day === '2026-01-03');
  assert.equal(staleDay.netSpendUsd,'3.000500'); assert.equal(staleDay.netRewardUsd,undefined);
  assert.equal(staleDay.unrefinedGodl.baseUnits,'200000000000');
});

test('missing or contradictory replay evidence cannot fill a gap or suppress committed history', async () => {
  const f = await historicalFixture(), baseline = projection(f,{historicalIntervals:[]});
  for (const mutate of [
    x => { x.record.interval.transactions=[]; }, x => { x.record.priceEvidence.candles=[]; },
    x => { x.record.interval.pages.miner.rows=[];x.record.interval.pages.miner.exhausted=false; },
    x => { x.record.receipt=structuredClone(x.record.receipt); x.record.receipt.acquisitionPeriod.netSpendUsd='0'; },
    x => { x.record.priorReceiptSha256='0'.repeat(64); },
    x => { x.record.priceEvidence.candles[0][4]=200; },
  ]) {
    const bad = structuredClone(f); mutate(bad);
    assert.throws(() => recoverHistoricalPoints(bad));
    assert.deepEqual(projection(f,{historicalIntervals:[bad]}),baseline);
  }
  const orphan = structuredClone(f); orphan.opening.receipt.evidence.extra='uncommitted';
  assert.deepEqual(projection(f,{historicalIntervals:[orphan]}),baseline);
});

test('pending, unclaimed, malformed and changed-identity observations remain unknown', async () => {
  for (const mutate of [
    s => {s.accounts.miner.value.roundId='1';s.accounts.miner.value.deployed[0]='1';},
    s => {s.accounts.miner.value.rewardsSol='1';}, s => {s.sourceCommit='unsupported';},
    s => {s.accounts.miner.value.lastClaimGodlAt='1';}, s => {s.accounts.miner.lamports='11';},
    s => {s.accounts.miner.value.lifetimeRewardsGodl='0';}, s => {s.observedAt='2026-01-01T00:00:00.000Z';},
  ]) {
    const f=await historicalFixture(); f.observations=f.observations.slice(0,1); mutate(f.observations[0]);
    assert.deepEqual(recoverHistoricalPoints(f),[]);
  }
});

test('funded v1 and v2 recovery preserves custody accounting rather than recharging automation deposits', async () => {
  const {extendFundedAccounting} = await import('./funded-accounting.mjs');
  for (const version of [1,2]) {
    const f = await historicalFixture(), i=f.record.interval, tx=i.transactions[0];
    tx.godlInstructions[0].dataBase58='24'; // funded automationV2
    Object.assign(tx.deltas.automationV2,{beforeLamports:'0',afterLamports:'30000000',changeLamports:'30000000'});
    i.closing.accounts.automationV2={address:i.trackedAccounts.automationV2,status:'present',lamports:'30000000',
      value:{authority:i.closing.wallet,balance:'28000000'}};
    f.observations[1].accounts.automationV2=structuredClone(i.closing.accounts.automationV2);
    const closing=extendFundedAccounting({previous:f.opening,interval:i,candles:f.record.priceEvidence.candles});
    closing.schemaVersion=version;closing.ledger.schemaVersion=version;
    f.closing=closing;f.record.checkpoint=closing;
    const points=recoverHistoricalPoints(f);
    assert.equal(points.length,2);
    assert.equal(BigInt(points[1].netUsdLamportMicro)-BigInt(points[0].netUsdLamportMicro),500000000000n);
    const options={snapshot:closing.closing,checkpoint:f.opening,checkpoints:[f.opening],fundedCheckpoint:closing,
      fundedCheckpoints:[closing]};
    const baseline=projection(f,{...options,historicalIntervals:[]});
    const result=projection(f,options);
    assert.equal(result.days.find(d=>d.day==='2026-01-03').netSpendUsd,'0.000500');
    assert.deepEqual(result.total,baseline.total);
    assert.deepEqual(result.position,baseline.position);
  }
});

test('duplicate source requests cannot manufacture two boundaries and corrupt reward factors stay local', async () => {
  const f=await historicalFixture();f.observations=f.observations.slice(0,1);
  const one=projection(f,{historicalIntervals:[f,f]}).days.find(d=>d.day==='2026-01-03');
  assert.equal(one.coverage,'unavailable');assert.equal(one.netRewardUsd,undefined);
  const invalid=await historicalFixture();
  invalid.observations[0].accounts.miner.value.refinedGodl='99999999999999';
  const baseline=projection(invalid,{historicalIntervals:[]}),result=projection(invalid);
  assert.deepEqual(result.total,baseline.total);assert.deepEqual(result.days,baseline.days);
});

test('funded multiday recovery survives becoming a committed ancestor with no stored directory field', async t => {
  const {mkdir,mkdtemp,writeFile,rm}=await import('node:fs/promises');
  const {tmpdir}=await import('node:os');const {join}=await import('node:path');
  const {extendFundedAccounting,fundedCheckpointHash}=await import('./funded-accounting.mjs');
  const {loadFundedCheckpoints}=await import('./earnings.mjs');
  const {loadHistoricalIntervals}=await import('./historical-accounting.mjs');
  const f=await historicalFixture();
  const first=extendFundedAccounting({previous:f.opening,interval:f.record.interval,candles:f.record.priceEvidence.candles});
  const interval=structuredClone(f.record.interval);interval.fromExclusiveSlot='30';interval.toInclusiveSlot='40';
  interval.closing.context.slot='40';interval.closing.observedAt='2026-01-04T10:01:00.000Z';interval.transactions=[];
  for(const page of Object.values(interval.pages))page.rows=[];
  const next=extendFundedAccounting({previous:first,interval});
  const root=await mkdtemp(join(tmpdir(),'godl-historical-funded-'));t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'first'));await mkdir(join(root,'funded-commits'));
  await writeFile(join(root,'first','funded-reconciliation.json'),JSON.stringify({...f.record,checkpoint:first}));
  const h=fundedCheckpointHash(first);
  await writeFile(join(root,'funded-commits',h+'.json'),JSON.stringify({schemaVersion:1,checkpointSha256:h}));
  const loaded=await loadFundedCheckpoints({checkpoint:next,evidenceRoot:root});
  const sources=await loadHistoricalIntervals({checkpoints:[f.opening],fundedCheckpoints:loaded,
    readObservations:()=>f.observations,days:['2026-01-03'],timeZone:'UTC'});
  assert.equal(sources.length,1);assert.equal(recoverHistoricalPoints(sources[0]).length,2);
  assert.equal(sources[0].closing.evidenceDirectory,join(root,'first'));
  assert.equal(fundedCheckpointHash(sources[0].closing),h);
});

test('reversed historical timestamps cannot emit invalid native daily coverage', async () => {
  const f=await historicalFixture();
  f.observations[0].observedAt='2026-01-03T18:00:00.000Z';
  f.observations[1].observedAt='2026-01-03T08:00:00.000Z';
  assert.throws(()=>recoverHistoricalPoints(f),/chronology/);
  assert.deepEqual(projection(f),projection(f,{historicalIntervals:[]}));
});
