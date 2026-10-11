// Versioned mining cash accounting; pending outcomes and stored SOL remain separate.
// Pure: no network, storage, wallet control or transaction execution.
import { createHash } from 'node:crypto';
import { parseUnits, uint, Ratio, LAMPORTS } from './economics.mjs';
import { requireFundedState, requireOpenState, openMiningState, reconcileCostInterval, validateAccountingCheckpoint } from './ongoing-cost.mjs';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const HASH = /^[a-f0-9]{64}$/;
const fail = message => { throw new Error(message); };
const integer = (value, signed = false) => {
  if (typeof value !== 'string' || value.length > 80 || value === '-0'
      || !(signed ? /^-?(0|[1-9]\d*)$/ : /^(0|[1-9]\d*)$/).test(value)) fail('Invalid funded accounting amount');
  return BigInt(value);
};
export const fundedCheckpointHash = checkpoint => digest(checkpoint.ledger);

export function validateFundedCheckpoint(checkpoint) {
  if (![1, 2].includes(checkpoint?.schemaVersion) || checkpoint.kind !== 'godl-funded-accounting-checkpoint') fail('Invalid funded accounting checkpoint');
  const anchor = validateAccountingCheckpoint(checkpoint.anchor);
  const closing = checkpoint.closing, miner = checkpoint.schemaVersion === 2 ? requireOpenState(closing) : requireFundedState(closing);
  if (closing.wallet !== anchor.closing.wallet
      || uint(closing.context.slot) <= uint(anchor.closing.context.slot)
      || Date.parse(closing.observedAt) < Date.parse(anchor.closing.observedAt)) fail('Funded accounting anchor identity mismatch');
  for (const role of ['miner', 'minerExtended', 'automation', 'automationV2']) {
    if (closing.accounts[role].address !== anchor.closing.accounts[role].address) fail('Funded accounting address mismatch');
  }
  const priorMiner = anchor.closing.accounts.miner.value;
  if (String(miner.lastClaimGodlAt) !== String(priorMiner.lastClaimGodlAt)
      || miner.referrer !== priorMiner.referrer || uint(miner.rewardsGodl) < uint(priorMiner.rewardsGodl)) fail('Funded accounting principal requires separate reconciliation');
  const ledger = checkpoint.ledger;
  if (!ledger || ledger.schemaVersion !== checkpoint.schemaVersion || ledger.anchorReceiptSha256 !== digest(anchor.receipt)
      || ledger.closingSha256 !== digest(closing) || !HASH.test(ledger.previousCheckpointSha256)) fail('Invalid funded accounting provenance');
  const out = integer(ledger.grossOutLamports), returned = integer(ledger.returnedLamports);
  if (out - returned !== integer(ledger.netCostLamports, true)) fail('Inconsistent funded accounting cost');
  integer(ledger.netUsdLamportMicro, true);
  integer(ledger.ownerNetworkFeesLamports); integer(ledger.newRentLamports);
  const interval = ledger.lastInterval;
  if (!interval || uint(interval.fromExclusiveSlot) < uint(anchor.closing.context.slot)
      || uint(interval.toInclusiveSlot) !== uint(closing.context.slot)
      || uint(interval.fromExclusiveSlot) >= uint(interval.toInclusiveSlot)) fail('Invalid funded accounting interval');
  if (uint(interval.fromExclusiveSlot) === uint(anchor.closing.context.slot)
      && ledger.previousCheckpointSha256 !== ledger.anchorReceiptSha256) fail('Invalid funded accounting anchor link');
  for (const field of ['includedSignatures', 'excludedUnrelatedSignatures']) {
    if (!Array.isArray(interval[field]) || interval[field].some(value => typeof value !== 'string' || !value || value.length > 200)
        || new Set(interval[field]).size !== interval[field].length) fail('Invalid funded accounting evidence');
  }
  if (!Number.isSafeInteger(interval.excludedFailedNonOwnerTransactions) || interval.excludedFailedNonOwnerTransactions < 0) fail('Invalid funded accounting evidence count');
  return checkpoint;
}

export function extendFundedAccounting({ previous, interval, candles = [] }) {
  const continuing = previous?.kind === 'godl-funded-accounting-checkpoint';
  if (continuing) validateFundedCheckpoint(previous); else validateAccountingCheckpoint(previous);
  const anchor = continuing ? previous.anchor : previous;
  if (previous.closing.accounts.miner.value.referrer !== interval.closing.accounts.miner.value.referrer) fail('Claim referrer changed within funded accounting');
  const result = reconcileCostInterval({ opening: previous.closing, interval, candles, funded: true, allowOpen: true });
  const p = anchor.receipt.acquisitionPeriod;
  const prior = continuing ? previous.ledger : {
    grossOutLamports: String(parseUnits(p.grossOutSol, 9)), returnedLamports: String(parseUnits(p.returnedSol, 9)),
    ownerNetworkFeesLamports: String(parseUnits(p.ownerNetworkFeesSol, 9)), newRentLamports: String(parseUnits(p.newRentSol, 9)),
    netUsdLamportMicro: anchor.receipt.evidence.netUsdLamportMicro,
  };
  const out = integer(prior.grossOutLamports) + result.out;
  const returned = integer(prior.returnedLamports) + result.returned;
  const ledger = {
    schemaVersion: 2, anchorReceiptSha256: digest(anchor.receipt),
    previousCheckpointSha256: continuing ? fundedCheckpointHash(previous) : digest(anchor.receipt),
    closingSha256: digest(result.closing),
    grossOutLamports: String(out), returnedLamports: String(returned), netCostLamports: String(out - returned),
    netUsdLamportMicro: String(integer(prior.netUsdLamportMicro, true) + result.weighted),
    ownerNetworkFeesLamports: String(integer(prior.ownerNetworkFeesLamports) + result.fees),
    newRentLamports: String(integer(prior.newRentLamports) + result.newRent),
    lastInterval: { fromExclusiveSlot: String(result.from), toInclusiveSlot: String(result.through),
      includedSignatures: result.included.map(tx => tx.signature), excludedUnrelatedSignatures: result.excluded,
      excludedFailedNonOwnerTransactions: result.excludedFailedNonOwnerTransactions },
  };
  const next = { schemaVersion: 2, kind: 'godl-funded-accounting-checkpoint',
    anchor: structuredClone(anchor), closing: structuredClone(result.closing), ledger };
  return validateFundedCheckpoint(next);
}


/** Independent current cash coverage; this is not a profit projection. */
export function projectFundedPosition(checkpoint) {
  validateFundedCheckpoint(checkpoint);
  const miner = checkpoint.closing.accounts.miner.value, state = openMiningState(miner);
  const sol = n => ({ lamports: String(n), display: new Ratio(n, LAMPORTS).decimal(9) });
  const netSpendUsd = new Ratio(integer(checkpoint.ledger.netUsdLamportMicro, true), 1_000_000_000_000_000n).decimal(6);
  return {
    fromAt: checkpoint.anchor.receipt.acquisitionPeriod.startedAt,
    throughAt: checkpoint.closing.observedAt, throughSlot: String(checkpoint.closing.context.slot),
    netSpendSol: new Ratio(integer(checkpoint.ledger.netCostLamports, true), LAMPORTS).decimal(9),
    netSpendUsd: /^-0\.0+$/.test(netSpendUsd) ? netSpendUsd.slice(1) : netSpendUsd,
    ...(state.pendingSol ? { pendingRound: { roundId: miner.roundId, deployedSol: sol(state.pendingSol) } } : {}),
    storedSol: sol(state.storedSol), netReady: state.netReady,
    reason: 'Verified cash costs exclude refundable automation capital. Pending stake has an unknown outcome. Stored SOL is gross, before claim deductions; only actual received SOL offsets cash cost. A complete new net result waits for settlement and SOL claim.'
  };
}
