// Pure reconciliation of the existing saved-RPC claim projection. Hash binding
// protects envelope integrity; neither a hash nor this projection authenticates RPC.
import { createHash } from 'node:crypto';
import { address } from '@solana/addresses';
import { GODL_PROGRAM_ADDRESS, GODL_SOURCE_COMMIT } from './chain.mjs';
import { MAINNET_GENESIS } from './monitor.mjs';
import { instructionCode } from './period-cost.mjs';

const MINT = 'GodL6KZ9uuUoQwELggtVzQkKmU1LfqmDokPibPeDKkhF';
const TOKEN = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const ATA = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
const SYSTEM = '11111111111111111111111111111111';
const NO_REFERRERS = new Set([SYSTEM, 'JEKNVnkbo3jma5nREBBJCDoXFVeKkD56V3xKrvRmWxFG']);
const COMPUTE = 'ComputeBudget111111111111111111111111111111';
const U64 = (1n << 64n) - 1n;
const HASH = /^[a-f0-9]{64}$/;
const SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;
const fail = message => { throw new Error(message); };
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const amount = (value, maximum = U64) => {
  if (typeof value !== 'string' || value.length > 80 || !/^(0|[1-9]\d*)$/.test(value)
      || (maximum !== null && BigInt(value) > maximum)) fail('Invalid canonical claim accounting amount');
  return BigInt(value);
};
const marker = value => {
  if (typeof value !== 'string' || !/^-?(0|[1-9]\d*)$/.test(value) || value === '-0'
      || BigInt(value) < -(1n << 63n) || BigInt(value) >= (1n << 63n)) fail('Invalid canonical claim marker');
  return BigInt(value);
};
export const emptyClaimSummary = () => ({ count: 0, ownerReceiptBaseUnits: '0', treasuryDebitBaseUnits: '0', networkFeeLamports: '0' });

export function validateClaimSummary(summary) {
  if (!summary || !Number.isSafeInteger(summary.count) || summary.count < 0) fail('Invalid claim summary count');
  const owner = amount(summary.ownerReceiptBaseUnits, null), debit = amount(summary.treasuryDebitBaseUnits, null);
  const fee = amount(summary.networkFeeLamports, null);
  if (owner > debit || (!summary.count && (owner || debit || fee))) fail('Inconsistent claim summary');
  return summary;
}

/** Exact stored-counter conservation; no principal or refining attribution. */
export function validateClaimProgression(opening, closing, summary) {
  validateClaimSummary(summary);
  if (!opening || !closing || opening.wallet !== closing.wallet || opening.genesisHash !== MAINNET_GENESIS
      || closing.genesisHash !== MAINNET_GENESIS || opening.commitment !== 'finalized' || closing.commitment !== 'finalized'
      || [opening, closing].some(s => s.programAddress !== GODL_PROGRAM_ADDRESS || s.sourceCommit !== GODL_SOURCE_COMMIT
        || !Number.isFinite(Date.parse(s.observedAt)))
      || amount(closing.context?.slot) <= amount(opening.context?.slot)
      || Date.parse(closing.observedAt) < Date.parse(opening.observedAt)) fail('Claim observation identity or chronology mismatch');
  address(opening.wallet);
  for (const role of ['miner', 'minerExtended']) {
    const left = opening.accounts?.[role], right = closing.accounts?.[role];
    if (left?.status !== 'present' || right?.status !== 'present' || left.address !== right.address
        || left.value?.authority !== opening.wallet || right.value?.authority !== closing.wallet) fail('Claim account incarnation or authority mismatch');
    address(left.address);
  }
  const l = opening.accounts.miner.value, r = closing.accounts.miner.value;
  if (l.referrer !== r.referrer) fail('Claim referrer changed');
  address(l.referrer);
  const beforeMarker = marker(l.lastClaimGodlAt), afterMarker = marker(r.lastClaimGodlAt);
  if (afterMarker < beforeMarker || (!summary.count && afterMarker !== beforeMarker)
      || afterMarker > BigInt(Math.floor(Date.parse(closing.observedAt) / 1000))) fail('Claim marker inconsistent with successful claims');
  for (const field of ['checkpointId', 'roundId', 'lifetimeDeployed', 'lifetimeRewardsSol',
    ...(!summary.count ? ['rewardsGodl', 'refinedGodl', 'lifetimeRewardsGodl'] : [])]) {
    if (amount(r[field]) < amount(l[field])) fail(`Claim reward counter ${field} regressed`);
  }
  if (marker(r.lastClaimSolAt) < marker(l.lastClaimSolAt)) fail('SOL claim marker regressed');
  if (amount(closing.accounts.minerExtended.value.lifetimeXaut) < amount(opening.accounts.minerExtended.value.lifetimeXaut)) fail('Lifetime gold counter regressed');
  const deltaLifetime = amount(r.lifetimeRewardsGodl) - amount(l.lifetimeRewardsGodl);
  const deltaUnrefined = amount(r.rewardsGodl) - amount(l.rewardsGodl);
  const deltaRefined = amount(r.refinedGodl) - amount(l.refinedGodl);
  if (deltaLifetime - deltaUnrefined - deltaRefined !== amount(summary.treasuryDebitBaseUnits, null)) fail('GODL claim counter conservation mismatch');
  return summary;
}

function unavailable(value, reason) {
  return value?.status === 'unavailable' && value.reason === reason && Object.keys(value).length === 2;
}

function validateBoundClaim(entry, tx, opening) {
  const claim = entry.claim;
  if (!HASH.test(entry.transactionSha256) || entry.transactionSha256 !== digest(tx)) fail('GODL claim transaction envelope hash mismatch');
  if (claim?.schemaVersion !== 1 || claim.kind !== 'godl-claim-evidence' || claim.status !== 'observed'
      || claim.executionAllowed !== false || claim.wallet !== opening.wallet || !SIGNATURE.test(claim.signature)
      || claim.signature !== tx.signature || amount(claim.slot) !== amount(tx.slot)
      || claim.source?.program !== GODL_PROGRAM_ADDRESS || claim.source?.commit !== GODL_SOURCE_COMMIT
      || claim.evidenceScope !== 'supplied-saved-rpc-only; chain-authenticity-and-finality-unverified'
      || !unavailable(claim.principal, 'receipt-does-not-prove-mined-principal')
      || !unavailable(claim.refiningDeduction, 'receipt-does-not-prove-refining-deduction')) fail('Invalid observed GODL claim proof identity or scope');
  const ix = tx.godlInstructions?.[0];
  if (tx.status !== 'observed' || tx.outcome !== 'succeeded' || tx.error !== null || tx.instructionsAreAttempts !== false
      || tx.feePayer !== opening.wallet || tx.godlInstructions.length !== 1 || ix.inner !== false
      || !Number.isSafeInteger(ix.outerIndex) || ix.outerIndex < 0 || ix.dataBase58 !== '5'
      || !Array.isArray(ix.accounts) || ![12, 14].includes(ix.accounts.length)
      || new Set(ix.accounts).size !== ix.accounts.length
      || !Array.isArray(tx.outerPrograms) || !tx.outerPrograms.includes(GODL_PROGRAM_ADDRESS)
      || tx.outerPrograms.some(program => ![GODL_PROGRAM_ADDRESS, COMPUTE].includes(program))) fail('Unsupported standalone GODL claim envelope');
  ix.accounts.forEach(address);
  const roles = new Map([[0, opening.wallet], [2, opening.accounts.miner.address], [3, MINT],
    [5, opening.accounts.treasury?.address], [7, SYSTEM], [8, TOKEN], [9, ATA],
    [10, opening.accounts.goldVault?.address], [11, opening.accounts.minerExtended.address]]);
  if ([...roles].some(([index, expected]) => !expected || ix.accounts[index] !== expected)) fail('GODL claim account roles mismatch');
  const referred = ix.accounts.length === 14;
  if (referred ? ix.accounts[12] !== opening.accounts.miner.value.referrer
    : !NO_REFERRERS.has(opening.accounts.miner.value.referrer)) fail('GODL claim referral route mismatch');
  const token = (receipt, account, owner) => {
    if (receipt?.status !== 'observed' || receipt.account !== account || receipt.tokenOwner !== owner
        || receipt.mint !== MINT || receipt.decimals !== 11) fail('GODL claim token receipt identity mismatch');
    return amount(receipt.amountBaseUnits);
  };
  const owner = token(claim.ownerReceipt, ix.accounts[4], opening.wallet);
  const debit = token(claim.treasuryDebit, ix.accounts[6], ix.accounts[5]);
  const referral = referred ? token(claim.referralReceipt, ix.accounts[13], ix.accounts[12]) : 0n;
  if ((!referred && (claim.referralReceipt?.status !== 'not-applicable' || Object.keys(claim.referralReceipt).length !== 1))
      || (referred && (!unavailable(claim.referrerAuthority, 'saved-transaction-does-not-contain-referrer-state')
        || debit * 50n > U64 || referral !== debit * 50n / 10000n))
      || owner + referral !== debit) fail('GODL claim receipt/referral conservation mismatch');
  const fee = amount(claim.ownerPaidNetworkFeeLamports);
  if (amount(claim.newAccountRentLamports) !== 0n || amount(tx.ownerPaidNetworkFeeLamports) !== fee
      || amount(tx.transactionFeeLamports) !== fee) fail('GODL claim fee or rent mismatch');
  for (const role of ['wallet', 'miner', 'minerExtended', 'automation', 'automationV2']) {
    const delta = tx.deltas?.[role], expected = role === 'wallet' ? opening.wallet : opening.accounts[role]?.address;
    if (!delta || delta.address !== expected) fail('GODL claim tracked account role mismatch');
    if (role === 'wallet' || role === 'miner' || role === 'minerExtended') {
      if (delta.status !== 'observed') fail('GODL claim account evidence unavailable');
    } else if (delta.status === 'not-in-transaction') continue;
    if (delta.status !== 'observed') fail('GODL claim account evidence unavailable');
    const expectedChange = role === 'wallet' ? -fee : 0n;
    if (amount(delta.afterLamports) - amount(delta.beforeLamports) !== expectedChange
        || delta.changeLamports !== String(expectedChange)) fail('Unsupported GODL claim lamport movement');
    if (['miner', 'minerExtended'].includes(role) && amount(delta.beforeLamports) === 0n) fail('GODL claim new account rent unsupported');
  }
  return { owner, debit, fee };
}

/** Validate one proof for every successful claim; existing interval reconciliation
 * remains responsible for finalized signature, block, ordering and cash coverage. */
export function summarizeIntervalClaims({ opening, interval }) {
  if (interval.godlClaims !== undefined && !Array.isArray(interval.godlClaims)) fail('Invalid GODL claim proof collection');
  const entries = new Map();
  for (const entry of interval.godlClaims ?? []) {
    if (!entry?.claim || entries.has(entry.claim.signature)) fail('Duplicate or invalid GODL claim proof');
    entries.set(entry.claim.signature, entry);
  }
  let owner = 0n, debit = 0n, fee = 0n, count = 0, latest;
  for (const tx of interval.transactions) {
    if (tx.outcome !== 'succeeded') continue;
    const codes = tx.godlInstructions.map(ix => instructionCode(ix.dataBase58));
    if (codes.some(code => [41, 49].includes(code))) fail('Unsupported successful GODL claim route');
    if (!codes.includes(4)) continue;
    const entry = entries.get(tx.signature);
    if (!entry) fail('Successful GODL claim proof missing');
    const values = validateBoundClaim(entry, tx, opening);
    if (!Number.isSafeInteger(tx.blockTime) || BigInt(tx.blockTime) < marker(opening.accounts.miner.value.lastClaimGodlAt)
        || tx.blockTime > Math.floor(Date.parse(interval.closing.observedAt) / 1000)) fail('GODL claim block time mismatch');
    owner += values.owner; debit += values.debit; fee += values.fee; count++;
    if (!latest || amount(tx.slot) > amount(latest.slot)
        || (tx.slot === latest.slot && tx.transactionIndex > latest.transactionIndex)) latest = tx;
    entries.delete(tx.signature);
  }
  if (entries.size) fail('Extra GODL claim proof without a supported successful transaction');
  const summary = { count, ownerReceiptBaseUnits: String(owner), treasuryDebitBaseUnits: String(debit), networkFeeLamports: String(fee) };
  validateClaimProgression(opening, interval.closing, summary);
  if (latest && marker(interval.closing.accounts.miner.value.lastClaimGodlAt) !== BigInt(latest.blockTime)) fail('Closing GODL claim marker does not match successful claim');
  return summary;
}
