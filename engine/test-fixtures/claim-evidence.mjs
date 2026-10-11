// Generated synthetic accounts and hand-computable amounts; no saved RPC data.
import { address, getAddressDecoder, getAddressEncoder, getProgramDerivedAddress } from '@solana/addresses';
import { deriveAddresses, GODL_PROGRAM_ADDRESS } from '../chain.mjs';

const mint = 'GodL6KZ9uuUoQwELggtVzQkKmU1LfqmDokPibPeDKkhF';
const token = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const ataProgram = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
const compute = 'ComputeBudget111111111111111111111111111111';
const encoder = getAddressEncoder();
const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function encodeClaimBytes(bytes) {
  let n = 0n;
  for (const byte of bytes) n = n * 256n + BigInt(byte);
  let encoded = '';
  while (n) { encoded = alphabet[Number(n % 58n)] + encoded; n /= 58n; }
  let zeroes = 0;
  while (zeroes < bytes.length && bytes[zeroes] === 0) zeroes++;
  return '1'.repeat(zeroes) + encoded;
}

export function claimTransferData(amount) {
  const bytes = Buffer.alloc(9);
  bytes[0] = 3; bytes.writeBigUInt64LE(BigInt(amount), 1);
  return encodeClaimBytes(bytes);
}

async function ata(owner) {
  return (await getProgramDerivedAddress({ programAddress: address(ataProgram),
    seeds: [encoder.encode(owner), encoder.encode(address(token)), encoder.encode(address(mint))] }))[0];
}

export async function claimFixture({ referral = false, version = 'legacy', amount = '1000', computeBudget = false } = {}) {
  const wallet = getAddressDecoder().decode(Buffer.alloc(32, 7));
  const signature = '3'.repeat(88), slot = '123456';
  const derived = await deriveAddresses(wallet);
  const referrerAuthority = getAddressDecoder().decode(Buffer.alloc(32, 9));
  const referrer = (await getProgramDerivedAddress({ programAddress: address(GODL_PROGRAM_ADDRESS),
    seeds: ['referrer', encoder.encode(referrerAuthority)] }))[0];
  const recipient = await ata(wallet), treasuryTokens = await ata(derived.treasury.address);
  const referrerTokens = await ata(referrer);
  const roles = [wallet, derived.config.address, derived.miner.address, mint, recipient,
    derived.treasury.address, treasuryTokens, '11111111111111111111111111111111', token,
    ataProgram, derived.goldVault.address, derived.minerExtended.address,
    ...(referral ? [referrer, referrerTokens] : [])];
  const writable = [wallet, ...[2, 3, 4, 5, 6, 11, ...(referral ? [12, 13] : [])].map(i => roles[i])];
  const readonly = [roles[1], roles[7], roles[8], roles[9], roles[10], GODL_PROGRAM_ADDRESS,
    ...(computeBudget ? [compute] : [])];
  const keys = [...writable, ...readonly];
  const index = key => keys.indexOf(key);
  const total = BigInt(amount), referralAmount = referral ? total * 50n / 10000n : 0n;
  const ownerAmount = total - referralAmount;
  const transfer = (destination, value) => ({ programIdIndex: index(token),
    // Pinned Steel 4.0.9 supplies authority again in SPL's signer_pubkeys vector.
    accounts: [index(treasuryTokens), index(destination), index(derived.treasury.address), index(derived.treasury.address)], data: claimTransferData(value) });
  const inners = [...(referral ? [transfer(referrerTokens, referralAmount)] : []),
    ...(ownerAmount > 0n ? [transfer(recipient, ownerAmount)] : [])];
  const balance = (key, owner, value) => ({ accountIndex: index(key), mint, owner, programId: token,
    uiTokenAmount: { amount: value.toString(), decimals: 11, uiAmount: 999, uiAmountString: 'ignored' } });
  const preTokens = [balance(treasuryTokens, derived.treasury.address, total), balance(recipient, wallet, 0n),
    ...(referral ? [balance(referrerTokens, referrer, 0n)] : [])];
  const postTokens = [balance(treasuryTokens, derived.treasury.address, 0n), balance(recipient, wallet, ownerAmount),
    ...(referral ? [balance(referrerTokens, referrer, referralAmount)] : [])];
  const instructions = [...(computeBudget ? [{ programIdIndex: index(compute), accounts: [], data: encodeClaimBytes([2, 64, 66, 15, 0]) }] : []),
    { programIdIndex: index(GODL_PROGRAM_ADDRESS), accounts: roles.map(index), data: '5' }];
  const result = { slot, version, blockTime: 1_760_000_000,
    transaction: { signatures: [signature], message: {
      header: { numRequiredSignatures: 1, numReadonlySignedAccounts: 0,
        numReadonlyUnsignedAccounts: version === 0 ? 0 : readonly.length },
      accountKeys: version === 0 ? [wallet] : keys, instructions } },
    meta: { err: null, fee: '5000', preBalances: keys.map((_, i) => i === 0 ? '10000000' : '2039280'),
      postBalances: keys.map((_, i) => i === 0 ? '9995000' : '2039280'),
      loadedAddresses: { writable: version === 0 ? writable.slice(1) : [], readonly: version === 0 ? readonly : [] },
      preTokenBalances: preTokens, postTokenBalances: postTokens,
      innerInstructions: [{ index: instructions.length - 1, instructions: inners }] } };
  return { result, wallet, signature, slot, options: { wallet, expectedSignature: signature, expectedSlot: slot } };
}
