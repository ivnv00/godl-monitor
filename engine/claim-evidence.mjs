import { address, getAddressEncoder, getProgramDerivedAddress, isOffCurveAddress } from '@solana/addresses';
import { deriveAddresses, GODL_PROGRAM_ADDRESS, GODL_SOURCE_COMMIT } from './chain.mjs';
import { projectTransaction } from './transaction-evidence.mjs';

const MINT = 'GodL6KZ9uuUoQwELggtVzQkKmU1LfqmDokPibPeDKkhF';
const TOKEN = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const ATA_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
const SYSTEM = '11111111111111111111111111111111';
const COMPUTE = 'ComputeBudget111111111111111111111111111111';
const COMPUTE_LENGTHS = new Map([[0, 9], [1, 5], [2, 5], [3, 9], [4, 5]]);
const U64_MAX = (1n << 64n) - 1n;
const encoder = getAddressEncoder();
const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const unavailable = reason => ({ status: 'unavailable', reason });
const malformed = () => { throw new Error('malformed claim evidence'); };

function amount(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,19})$/.test(value) || BigInt(value) > U64_MAX) malformed();
  return BigInt(value);
}

function bytes(data) {
  if (typeof data !== 'string' || data.length > 128 || !/^[1-9A-HJ-NP-Za-km-z]*$/.test(data)) malformed();
  let n = 0n;
  for (const character of data) n = n * 58n + BigInt(alphabet.indexOf(character));
  const tail = [];
  while (n) { tail.unshift(Number(n % 256n)); n /= 256n; }
  const leading = data.match(/^1*/)[0].length;
  return Buffer.from([...Array(leading).fill(0), ...tail]);
}

async function ata(owner) {
  return (await getProgramDerivedAddress({ programAddress: address(ATA_PROGRAM),
    seeds: [encoder.encode(address(owner)), encoder.encode(address(TOKEN)), encoder.encode(address(MINT))] }))[0];
}

function tokenBalances(rows, keys) {
  if (!Array.isArray(rows)) return null;
  const balances = new Map();
  for (const row of rows) {
    if (!row || !Number.isSafeInteger(row.accountIndex) || row.accountIndex < 0 || row.accountIndex >= keys.length) malformed();
    if (balances.has(row.accountIndex)) return null;
    if (!row.uiTokenAmount || !Number.isSafeInteger(row.uiTokenAmount.decimals) || row.uiTokenAmount.decimals < 0 || row.uiTokenAmount.decimals > 255) malformed();
    const rawAmount = amount(row.uiTokenAmount.amount);
    // Missing identity metadata is incomplete evidence, never an implied owner.
    if (typeof row.owner !== 'string' || typeof row.programId !== 'string' || typeof row.mint !== 'string') return null;
    address(row.owner); address(row.programId); address(row.mint);
    balances.set(row.accountIndex, { owner: row.owner, mint: row.mint, programId: row.programId,
      decimals: row.uiTokenAmount.decimals, amount: rawAmount });
  }
  return balances;
}

function sameIdentity(a, b) {
  return a.owner === b.owner && a.mint === b.mint && a.programId === b.programId && a.decimals === b.decimals;
}

/** Offline projection of supplied compiled RPC evidence; no chain-authenticity claim. */
export async function projectGodlClaim(result, options) {
  try { return await project(result, options); }
  catch { throw new Error('malformed claim evidence'); }
}

async function project(result, { wallet, expectedSignature, expectedSlot }) {
  // The existing envelope is the sole shared transaction/lamport validator.
  const envelope = projectTransaction(result, { wallet, expectedSignature, expectedSlot, trackedAccounts: {} });
  const base = { schemaVersion: 1, kind: 'godl-claim-evidence', wallet, signature: expectedSignature,
    ...(envelope.slot === undefined ? {} : { slot: envelope.slot }),
    source: { program: GODL_PROGRAM_ADDRESS, commit: GODL_SOURCE_COMMIT }, executionAllowed: false,
    evidenceScope: 'supplied-saved-rpc-only; chain-authenticity-and-finality-unverified' };
  const reject = reason => ({ ...base, ...unavailable(reason) });
  if (envelope.status !== 'observed') return reject(envelope.reason);
  if (envelope.outcome !== 'succeeded') return reject('transaction-failed');
  if (envelope.feePayer !== wallet) return reject('owner-paid-route-required');
  const { meta, transaction: { message, signatures } } = result;
  const staticKeys = message.accountKeys;
  const loaded = meta.loadedAddresses ?? { writable: [], readonly: [] };
  if (result.version === 'legacy' && (loaded.writable.length || loaded.readonly.length)) return reject('legacy-loaded-addresses-unsupported');
  const keys = [...staticKeys, ...loaded.writable, ...loaded.readonly];
  const header = message.header;
  if (!header || !['numRequiredSignatures', 'numReadonlySignedAccounts', 'numReadonlyUnsignedAccounts']
    .every(key => Number.isSafeInteger(header[key]) && header[key] >= 0)
    || header.numRequiredSignatures > staticKeys.length
    || header.numReadonlySignedAccounts > header.numRequiredSignatures
    || header.numReadonlyUnsignedAccounts > staticKeys.length - header.numRequiredSignatures
    || signatures.length !== header.numRequiredSignatures) malformed();
  if (header.numRequiredSignatures !== 1 || header.numReadonlySignedAccounts !== 0) return reject('owner-only-signer-required');
  const writable = i => i < staticKeys.length
    ? i < staticKeys.length - header.numReadonlyUnsignedAccounts
    : i < staticKeys.length + loaded.writable.length;
  const outer = message.instructions;
  // Decode every compiled payload before interpreting a supported route.
  outer.forEach(instruction => bytes(instruction.data));
  if (envelope.godlInstructions.length !== 1 || envelope.godlInstructions[0].inner) return reject('standalone-outer-claim-required');
  const claim = envelope.godlInstructions[0];
  if (claim.dataBase58 !== '5') return reject('claim-discriminator-unsupported');
  for (let i = 0; i < outer.length; i++) {
    if (i === claim.outerIndex) continue;
    const instruction = outer[i], data = bytes(instruction.data);
    if (keys[instruction.programIdIndex] !== COMPUTE || instruction.accounts.length
      || data.length !== COMPUTE_LENGTHS.get(data[0])) return reject('mixed-outer-instructions');
  }
  if (![12, 14].includes(claim.accounts.length)) return reject('claim-account-route-unsupported');
  const hasReferral = claim.accounts.length === 14;
  const referrer = hasReferral ? claim.accounts[12] : null;
  if (hasReferral && !isOffCurveAddress(address(referrer))) return reject('referrer-pda-required');
  const derived = await deriveAddresses(wallet);
  const recipient = await ata(wallet), treasuryTokens = await ata(derived.treasury.address);
  const expected = [wallet, derived.config.address, derived.miner.address, MINT, recipient,
    derived.treasury.address, treasuryTokens, SYSTEM, TOKEN, ATA_PROGRAM,
    derived.goldVault.address, derived.minerExtended.address,
    ...(hasReferral ? [referrer, await ata(referrer)] : [])];
  if (new Set(claim.accounts).size !== claim.accounts.length
    || expected.some((key, i) => key !== claim.accounts[i])) return reject('claim-account-roles-mismatch');
  if ([0, 2, 3, 4, 5, 6, 11, ...(hasReferral ? [12, 13] : [])].some(i => !writable(keys.indexOf(claim.accounts[i])))) return reject('claim-account-permissions-mismatch');
  if ([4, 11, ...(hasReferral ? [12, 13] : [])].some(i => BigInt(meta.preBalances[keys.indexOf(claim.accounts[i])]) === 0n)) return reject('existing-accounts-required');
  const fee = BigInt(envelope.ownerPaidNetworkFeeLamports);
  if (keys.some((_, i) => BigInt(meta.postBalances[i]) - BigInt(meta.preBalances[i]) !== (i === 0 ? -fee : 0n))) return reject('unsupported-lamport-movement');
  const pre = tokenBalances(meta.preTokenBalances, keys), post = tokenBalances(meta.postTokenBalances, keys);
  if (!pre || !post || pre.size !== post.size || [...pre.keys()].some(i => !post.has(i))) return reject('token-metadata-incomplete-or-duplicate');
  const referrerTokens = hasReferral ? claim.accounts[13] : null;
  const tokenAccounts = [[treasuryTokens, derived.treasury.address], [recipient, wallet],
    ...(hasReferral ? [[referrerTokens, referrer]] : [])];
  for (const [key, owner] of tokenAccounts) {
    const i = keys.indexOf(key), before = pre.get(i), after = post.get(i);
    if (!before || !after) return reject('token-metadata-incomplete-or-duplicate');
    if (!sameIdentity(before, after) || before.owner !== owner || before.programId !== TOKEN
      || before.mint !== MINT || before.decimals !== 11) return reject('token-identity-mismatch');
  }
  const tokenIndexes = new Set(tokenAccounts.map(([key]) => keys.indexOf(key)));
  for (const [i, before] of pre) {
    const after = post.get(i);
    if (!sameIdentity(before, after) || (!tokenIndexes.has(i) && before.amount !== after.amount)) return reject('unexpected-token-movement');
  }
  const delta = key => post.get(keys.indexOf(key)).amount - pre.get(keys.indexOf(key)).amount;
  const receipt = delta(recipient), debit = -delta(treasuryTokens);
  const referralReceipt = hasReferral ? delta(referrerTokens) : 0n;
  if (receipt < 0n || referralReceipt < 0n || debit !== receipt + referralReceipt) return reject('token-balance-deltas-mismatch');
  // The pinned handler uses checked u64 multiplication before dividing the referral.
  if (hasReferral && (debit * 50n > U64_MAX || referralReceipt !== debit * 50n / 10000n)) return reject('referral-split-mismatch');
  if (!Array.isArray(meta.innerInstructions)) return reject('inner-instruction-evidence-unavailable');
  const groups = meta.innerInstructions;
  const seenGroups = new Set(), transfers = [];
  for (const group of groups) {
    if (seenGroups.has(group.index)) malformed();
    seenGroups.add(group.index);
    if (group.index !== claim.outerIndex && group.instructions.length) return reject('unexpected-inner-instructions');
    for (const instruction of group.instructions) {
      const data = bytes(instruction.data);
      // Steel 4.0.9 -> spl-token-2022 7.0.0 Transfer appends the authority
      // from its singleton signer_pubkeys list, preserving the repeated index.
      if (keys[instruction.programIdIndex] !== TOKEN || instruction.accounts.length !== 4 || data.length !== 9 || data[0] !== 3) return reject('unsupported-inner-instruction');
      transfers.push({ accounts: instruction.accounts.map(i => keys[i]), amount: data.readBigUInt64LE(1) });
    }
  }
  const expectedTransfers = [...(hasReferral ? [[referrerTokens, referralReceipt]] : []),
    ...(receipt > 0n ? [[recipient, receipt]] : [])];
  if (transfers.length !== expectedTransfers.length || transfers.some((transfer, i) =>
    transfer.amount !== expectedTransfers[i][1]
    || transfer.accounts.join(',') !== [treasuryTokens, expectedTransfers[i][0], derived.treasury.address, derived.treasury.address].join(','))) return reject('transfer-and-balance-evidence-mismatch');
  const tokenEvidence = (account, tokenOwner, value) => ({ status: 'observed', account, tokenOwner,
    mint: MINT, decimals: 11, amountBaseUnits: value.toString() });
  return { ...base, status: 'observed', ownerReceipt: tokenEvidence(recipient, wallet, receipt),
    referralReceipt: hasReferral ? tokenEvidence(referrerTokens, referrer, referralReceipt) : { status: 'not-applicable' },
    ...(hasReferral ? { referrerAuthority: unavailable('saved-transaction-does-not-contain-referrer-state') } : {}),
    treasuryDebit: tokenEvidence(treasuryTokens, derived.treasury.address, debit),
    ownerPaidNetworkFeeLamports: fee.toString(), newAccountRentLamports: '0',
    principal: unavailable('receipt-does-not-prove-mined-principal'),
    refiningDeduction: unavailable('receipt-does-not-prove-refining-deduction') };
}
