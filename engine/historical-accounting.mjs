// Optional, read-only historical projection. Never creates committed ledger children.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseUnits, uint } from './economics.mjs';
import { requireClosedState, requireFundedState, requireOpenState, openMiningState,
  reconcileCostInterval, validateAccountingCheckpoint } from './ongoing-cost.mjs';
import { validateClaimProgression } from './claim-accounting.mjs';
import { fundedCheckpointHash, validateFundedCheckpoint } from './funded-accounting.mjs';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const funded = value => value?.kind === 'godl-funded-accounting-checkpoint';
const hash = value => funded(value) ? fundedCheckpointHash(value) : digest(value.receipt);
const validate = value => funded(value) ? validateFundedCheckpoint(value) : validateAccountingCheckpoint(value);
const fail = message => { throw new Error(message); };
const ZERO_CLAIMS = Object.freeze({count:0, ownerReceiptBaseUnits:'0', treasuryDebitBaseUnits:'0', networkFeeLamports:'0'});
const claimFields = ['ownerReceiptBaseUnits','treasuryDebitBaseUnits','networkFeeLamports'];
const claims = checkpoint => funded(checkpoint) && checkpoint.schemaVersion === 3 ? checkpoint.ledger.claims : ZERO_CLAIMS;
function claimDifference(left, right) {
  const count = right.count - left.count;
  if (!Number.isSafeInteger(count) || count < 0) fail('Historical claim count regressed');
  const result = {count};
  for (const field of claimFields) {
    const delta = BigInt(right[field]) - BigInt(left[field]);
    if (delta < 0n) fail('Historical cumulative claim amount regressed');
    result[field] = String(delta);
  }
  return result;
}
function addClaims(left, right) {
  const count = left.count + right.count;
  if (!Number.isSafeInteger(count)) fail('Historical claim count overflow');
  return {count, ...Object.fromEntries(claimFields.map(field => [field, String(BigInt(left[field]) + BigInt(right[field]))]))};
}
function sameClaims(left, right) {
  return left?.count === right?.count && claimFields.every(field => left?.[field] === right?.[field]);
}
const fields = ['out', 'returned', 'fees', 'newRent', 'weighted'];
function amounts(checkpoint) {
  if (funded(checkpoint)) {
    const l = checkpoint.ledger;
    return { out:BigInt(l.grossOutLamports), returned:BigInt(l.returnedLamports),
      fees:BigInt(l.ownerNetworkFeesLamports), newRent:BigInt(l.newRentLamports), weighted:BigInt(l.netUsdLamportMicro) };
  }
  const p = checkpoint.receipt.acquisitionPeriod;
  return { out:parseUnits(p.grossOutSol,9), returned:parseUnits(p.returnedSol,9),
    fees:parseUnits(p.ownerNetworkFeesSol,9), newRent:parseUnits(p.newRentSol,9),
    weighted:BigInt(checkpoint.receipt.evidence.netUsdLamportMicro) };
}
function progression(left, right, summary = null) {
  if (left.wallet !== right.wallet || left.genesisHash !== right.genesisHash
      || left.programAddress !== right.programAddress || left.sourceCommit !== right.sourceCommit
      || Date.parse(left.observedAt) > Date.parse(right.observedAt)
      || uint(left.context.slot) >= uint(right.context.slot)) fail('Historical observation identity or chronology mismatch');
  const l = left.accounts.miner.value, r = right.accounts.miner.value;
  if (summary) validateClaimProgression(left, right, summary);
  else if (String(l.lastClaimGodlAt) !== String(r.lastClaimGodlAt) || l.referrer !== r.referrer) fail('Historical claim state changed');
  for (const name of ['rewardsGodl','checkpointId','roundId','lifetimeDeployed','lifetimeRewardsSol','lifetimeRewardsGodl']) {
    if (summary && ['rewardsGodl','lifetimeRewardsGodl'].includes(name)) continue;
    if (l[name] != null && r[name] != null && uint(r[name]) < uint(l[name])) fail('Historical reward counter regressed');
  }
  const lx = left.accounts.minerExtended?.value?.lifetimeXaut, rx = right.accounts.minerExtended?.value?.lifetimeXaut;
  if (lx != null && rx != null && uint(rx) < uint(lx)) fail('Historical gold counter regressed');
}

/** Prove each derived point against both sides of an already committed interval. */
export function recoverHistoricalPoints({ opening, closing, record, observations }) {
  validate(opening); validate(closing);
  const isFunded = funded(closing), claimAware = isFunded && closing.schemaVersion === 3, allowOpen = isFunded && closing.schemaVersion >= 2;
  const evidence = isFunded ? closing.ledger : closing.receipt.evidence;
  const previousHash = isFunded ? evidence.previousCheckpointSha256 : evidence.previousReceiptSha256;
  if (previousHash !== hash(opening) || !Array.isArray(observations)
      || digest(record?.interval?.closing) !== digest(closing.closing)
      || (isFunded ? hash(validateFundedCheckpoint(record?.checkpoint)) !== hash(closing)
        : digest(record?.receipt) !== hash(closing) || record?.priorReceiptSha256 !== previousHash)) fail('Historical source does not match committed chain');
  if (isFunded && closing.ledger.anchorReceiptSha256 !== (funded(opening) ? opening.ledger.anchorReceiptSha256 : hash(opening))) fail('Historical funded anchor mismatch');
  const mode = { funded:isFunded, allowOpen, claimAware }, interval = record.interval;
  const candles = record.priceEvidence?.candles;
  if (!Array.isArray(candles)) fail('Historical price evidence unavailable');
  const full = reconcileCostInterval({opening:opening.closing, interval, candles, ...mode});
  progression(opening.closing, closing.closing, claimAware ? full.claims : null);
  if (claimAware && (!sameClaims(claimDifference(claims(opening), claims(closing)), full.claims)
      || !sameClaims(evidence.lastInterval.claims, full.claims))) fail('Historical replay does not reproduce committed claims');
  const start = amounts(opening), end = amounts(closing);
  if (fields.some(key => start[key] + full[key] !== end[key])) fail('Historical replay does not reproduce committed amounts');
  const last = evidence.lastInterval;
  if (JSON.stringify(last.includedSignatures) !== JSON.stringify(full.included.map(tx => tx.signature))
      || JSON.stringify(last.excludedUnrelatedSignatures) !== JSON.stringify(full.excluded)
      || last.excludedFailedNonOwnerTransactions !== full.excludedFailedNonOwnerTransactions) fail('Historical replay does not reproduce committed transactions');
  function replay(left, right) {
    const from = uint(left.context.slot), through = uint(right.context.slot);
    const part = { ...interval, fromExclusiveSlot:String(from), toInclusiveSlot:String(through), closing:right,
      transactions:interval.transactions.filter(tx => uint(tx.slot) > from && uint(tx.slot) <= through) };
    if (claimAware) part.godlClaims = (interval.godlClaims ?? []).filter(binding => uint(binding.claim.slot) > from && uint(binding.claim.slot) <= through);
    return reconcileCostInterval({opening:left, interval:part, candles, ...mode});
  }
  const points = [], seen = new Set();
  for (const candidate of observations) {
    try {
      requireOpenState(candidate);
      if (!openMiningState(candidate.accounts.miner.value).netReady) continue;
      if (isFunded) requireFundedState(candidate); else requireClosedState(candidate);
      if (seen.has(candidate.context.slot)) fail('Repeated historical candidate');
      const prefix = replay(opening.closing, candidate), suffix = replay(candidate, closing.closing);
      progression(opening.closing, candidate, claimAware ? prefix.claims : null);
      progression(candidate, closing.closing, claimAware ? suffix.claims : null);
      if (claimAware && !sameClaims(addClaims(prefix.claims, suffix.claims), full.claims)) fail('Historical claim partition does not reproduce full interval');
      if (fields.some(key => prefix[key] + suffix[key] !== full[key])) fail('Historical partition does not reproduce full interval');
      seen.add(candidate.context.slot);
      points.push({ closing:structuredClone(candidate), netUsdLamportMicro:String(start.weighted + prefix.weighted),
        funded:isFunded, claimAware, claims:claimAware ? addClaims(claims(opening), prefix.claims) : {...ZERO_CLAIMS},
        netReady:true, recovered:true, sourceParentHash:hash(opening), sourceChildHash:hash(closing) });
    } catch { /* Invalid or unresolved saved observations cannot become accounting boundaries. */ }
  }
  const ordered = points.sort((a,b) => uint(a.closing.context.slot) < uint(b.closing.context.slot) ? -1 : 1);
  for (let index=1; index<ordered.length; index++) progression(ordered[index-1].closing, ordered[index].closing, claimAware ? claimDifference(ordered[index-1].claims, ordered[index].claims) : null);
  return ordered;
}

/** Only records on the verified chain can propose optional recovery; no writes or RPC. */
export async function loadHistoricalIntervals({ checkpoints, fundedCheckpoints = [], readObservations, days, timeZone }) {
  if (typeof readObservations !== 'function') return [];
  const chain = [...checkpoints, ...fundedCheckpoints], intervals = [];
  const formatter = new Intl.DateTimeFormat('en-CA', {timeZone, year:'numeric', month:'2-digit', day:'2-digit'});
  for (let index=1; index<chain.length; index++) {
    const opening = chain[index-1], closing = chain[index];
    // Same-day endpoint pairs already cover their interval in the daily table.
    if (formatter.format(new Date(opening.closing.observedAt)) === formatter.format(new Date(closing.closing.observedAt))
        || typeof closing.evidenceDirectory !== 'string') continue;
    try {
      const record = JSON.parse(await readFile(join(closing.evidenceDirectory,
        funded(closing) ? 'funded-reconciliation.json' : 'reconciliation.json'), 'utf8'));
      const observations = await readObservations({ wallet:opening.closing.wallet, genesisHash:opening.closing.genesisHash,
        sourceCommit:opening.closing.sourceCommit, programAddress:opening.closing.programAddress,
        fromSlot:String(opening.closing.context.slot), toSlot:String(closing.closing.context.slot),
        funded:funded(closing), days, timeZone });
      if (observations.length) intervals.push({opening, closing, record, observations});
    } catch { /* Optional recovery never suppresses the existing verified ledger. */ }
  }
  return intervals;
}
