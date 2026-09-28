// Minimal in-memory Solana responses for the real accounting transport/decoders.
// Unexpected methods fail rather than falling through to a live provider.
import { getAddressEncoder, getAddressDecoder } from '@solana/addresses';
import { GODL_PROGRAM_ADDRESS } from '../chain.mjs';
import { MAINNET_GENESIS } from '../monitor.mjs';

const loader = 'BPFLoaderUpgradeab1e11111111111111111111111';
const encode = getAddressEncoder();
const programDataAddress = getAddressDecoder().decode(Buffer.alloc(32, 12));

function accountBytes(role, account) {
  if (!account || account.status === 'missing') return null;
  const layouts = { miner: [103, 576], minerExtended: [121, 104], treasury: [104, 80], goldVault: [120, 88] };
  const [tag, length] = layouts[role];
  const bytes = Buffer.alloc(length); bytes[0] = tag;
  const value = account.value;
  const u64 = (offset, field) => bytes.writeBigUInt64LE(BigInt(value[field] ?? 0), offset);
  if (role === 'miner') {
    bytes.set(encode.encode(value.authority), 8);
    bytes.set(encode.encode(value.referrer), 40);
    value.deployed.forEach((n, i) => bytes.writeBigUInt64LE(BigInt(n), 72 + i * 8));
    for (const [field, offset] of Object.entries({ checkpointFee: 472, checkpointId: 480,
      lastClaimGodlAt: 488, lastClaimSolAt: 496, rewardsSol: 520, rewardsGodl: 528,
      refinedGodl: 536, roundId: 544, lifetimeDeployed: 552, lifetimeRewardsSol: 560,
      lifetimeRewardsGodl: 568 })) u64(offset, field);
  } else if (role === 'minerExtended') {
    bytes.set(encode.encode(value.authority), 8);
    u64(56, 'xautRewards'); u64(64, 'lifetimeXaut');
  } else if (role === 'treasury') u64(64, 'totalUnclaimed');
  return { owner: GODL_PROGRAM_ADDRESS, executable: false, lamports: Number(account.lamports),
    rentEpoch: 0, data: [bytes.toString('base64'), 'base64'] };
}

export function accountingRpc(fixture, { empty = false } = {}) {
  const state = { requests: [], failureMethod: null, deploymentSlot: 1,
    closing: structuredClone(empty ? fixture.anchor.closing : fixture.interval.closing),
    transactions: empty ? [] : [structuredClone(fixture.rawTransaction)] };
  state.closing.context.slot = '30';
  const resultFor = request => {
    const slot = Number(state.closing.context.slot);
    switch (request.method) {
      case 'getMultipleAccounts': {
        const accounts = new Map(Object.entries(state.closing.accounts).map(([role, account]) =>
          [account.address, accountBytes(role, account)]));
        return { context: { slot }, value: request.params[0].map(key => accounts.get(key) ?? null) };
      }
      case 'getGenesisHash': return MAINNET_GENESIS;
      case 'getAccountInfo': {
        const program = request.params[0] === GODL_PROGRAM_ADDRESS;
        if (!program && request.params[0] !== programDataAddress) throw new Error('Unexpected program address');
        const bytes = Buffer.alloc(program ? 36 : 45);
        bytes.writeUInt32LE(program ? 2 : 3);
        if (program) bytes.set(encode.encode(programDataAddress), 4);
        else bytes.writeBigUInt64LE(BigInt(state.deploymentSlot), 4);
        return { context: { slot }, value: { owner: loader, executable: program,
          data: [bytes.toString('base64'), 'base64'] } };
      }
      case 'getSignaturesForAddress':
        if (request.params[1].before) return [];
        return state.transactions.filter(tx => tx.transaction.message.accountKeys.includes(request.params[0]))
          .map(tx => ({ signature: tx.transaction.signatures[0], slot: tx.slot, blockTime: tx.blockTime,
            err: tx.meta.err, confirmationStatus: 'finalized' })).reverse();
      case 'getBlock': {
        const matches = state.transactions.filter(tx => tx.slot === request.params[0]);
        return matches.length ? { blockTime: matches[0].blockTime,
          signatures: matches.map(tx => tx.transaction.signatures[0]) } : null;
      }
      case 'getTransaction':
        return state.transactions.find(tx => tx.transaction.signatures[0] === request.params[0]) ?? null;
      default: throw new Error(`Unexpected synthetic RPC method: ${request.method}`);
    }
  };
  state.fetch = async (url, init) => {
    const endpoint = new URL(url);
    if (endpoint.origin === 'https://api.exchange.coinbase.com') {
      return Response.json(fixture.candles);
    }
    if (endpoint.hostname !== 'rpc.invalid' && endpoint.hostname !== '127.0.0.1') {
      throw new Error('Synthetic accounting tests cannot contact a live provider');
    }
    const request = JSON.parse(init.body);
    state.requests.push(request);
    if (state.failureMethod === request.method) return Response.json({ jsonrpc: '2.0', id: request.id,
      error: { code: -32000, message: 'Synthetic provider failure' } }, { status: 400 });
    return Response.json({ jsonrpc: '2.0', id: request.id, result: resultFor(request) });
  };
  return state;
}
