import { boundedFetch } from './network-response.mjs';
import {
  address,
  getAddressDecoder,
  getAddressEncoder,
  getProgramDerivedAddress,
} from '@solana/addresses';
import { RuntimeFailure, rpcHTTPFailure } from './runtime-failure.mjs';

export const GODL_PROGRAM_ADDRESS = 'mineWsRs2Rmw2jPMkVbgAbDjV1E23yQ8TEodaX3iza4';
// Frozen accounting ABI: historical receipts remain pinned to their original
// source. Updating observation decoding does not authorize a new cost ledger.
export const GODL_SOURCE_COMMIT = '4b7bb4c6619d25f52ef9152de906a46027995143';
// Verified deployed source on 2026-10-16; only Config's observed layout changed.
export const GODL_OBSERVATION_SOURCE_COMMIT = '8cbbc86341445d11e3779dfd5be9363474d75683';
export const COMMITMENT = 'finalized';

const PROGRAM_ADDRESS = address(GODL_PROGRAM_ADDRESS);
const addressDecoder = getAddressDecoder();
const addressEncoder = getAddressEncoder();

const ACCOUNT_LAYOUTS = Object.freeze({
  board: { discriminator: 105, length: 32 },
  goldVault: { discriminator: 120, length: 88 },
  config: { discriminator: 101, length: [184, 232] },
  treasury: { discriminator: 104, length: 80 },
  miner: { discriminator: 103, length: 576, authority: true },
  minerExtended: { discriminator: 121, length: 104, authority: true },
  automation: { discriminator: 100, length: 112, authority: true },
  automationV2: { discriminator: 111, length: 112, authority: true },
});

class Reader {
  constructor(bytes, accountType) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.offset = 8;
    this.accountType = accountType;
  }

  u64() {
    const value = this.view.getBigUint64(this.offset, true);
    this.offset += 8;
    return value.toString();
  }

  i64() {
    const value = this.view.getBigInt64(this.offset, true);
    this.offset += 8;
    return value.toString();
  }

  publicKey() {
    const value = addressDecoder.decode(this.bytes.subarray(this.offset, this.offset + 32));
    this.offset += 32;
    return value;
  }

  u64Array(length) {
    return Array.from({ length }, () => this.u64());
  }

  numeric() {
    const rawBits = readSignedLittleEndian(this.bytes.subarray(this.offset, this.offset + 16));
    this.offset += 16;
    return { rawBits: rawBits.toString(), fractionalBits: 48 };
  }

  bytesHex(length) {
    const result = Buffer.from(this.bytes.subarray(this.offset, this.offset + length)).toString('hex');
    this.offset += length;
    return result;
  }

  done() {
    if (this.offset !== this.bytes.length) {
      throw new Error(`${this.accountType} decoder consumed ${this.offset} of ${this.bytes.length} bytes`);
    }
  }
}

function readSignedLittleEndian(bytes) {
  let value = 0n;
  for (let index = bytes.length - 1; index >= 0; index -= 1) {
    value = (value << 8n) | BigInt(bytes[index]);
  }
  const width = BigInt(bytes.length * 8);
  const signBit = 1n << (width - 1n);
  return value & signBit ? value - (1n << width) : value;
}

function rpcUnsigned(value, field, { rentEpoch = false } = {}) {
  if (typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value)) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value);
  // Solana serializes the u64::MAX rent-exempt sentinel as a JSON number. JSON.parse rounds it
  // to this exact Number value; map only that protocol sentinel back to its canonical integer.
  if (rentEpoch && value === 18_446_744_073_709_552_000) return '18446744073709551615';
  throw new Error(`${field} is not a lossless unsigned integer`);
}

function assertAccountEnvelope(accountType, account, bytes) {
  const layout = ACCOUNT_LAYOUTS[accountType];
  if (account.owner !== GODL_PROGRAM_ADDRESS) {
    throw new Error(`${accountType} owner ${account.owner} does not match GODL program ${GODL_PROGRAM_ADDRESS}`);
  }
  if (account.executable !== false) {
    throw new Error(`${accountType} account must not be executable`);
  }
  if (!(Array.isArray(layout.length) ? layout.length.includes(bytes.length) : bytes.length === layout.length)) {
    throw new Error(`${accountType} data length ${bytes.length} does not match expected ${layout.length}`);
  }
  if (bytes[0] !== layout.discriminator || bytes.subarray(1, 8).some((byte) => byte !== 0)) {
    throw new Error(`${accountType} discriminator does not match [${layout.discriminator},0,0,0,0,0,0,0]`);
  }
}

function decodeAccountData(accountType, account) {
  if (!account || typeof account !== 'object') throw new Error(`${accountType} RPC account is malformed`);
  if (!Array.isArray(account.data) || account.data[1] !== 'base64' || typeof account.data[0] !== 'string') {
    throw new Error(`${accountType} RPC account must use base64 encoding`);
  }
  const bytes = new Uint8Array(Buffer.from(account.data[0], 'base64'));
  assertAccountEnvelope(accountType, account, bytes);
  return bytes;
}

function finish(reader, value) {
  reader.done();
  return value;
}

export function decodeBoard(account) {
  const r = new Reader(decodeAccountData('board', account), 'board');
  return finish(r, { roundId: r.u64(), startSlot: r.u64(), endSlot: r.u64() });
}

export function decodeConfig(account) {
  const r = new Reader(decodeAccountData('config', account), 'config');
  const value = {
    admin: r.publicKey(),
    godlPerRound: r.u64(),
    buryAuthority: r.publicKey(),
    feeCollector: r.publicKey(),
    swapProgram: r.publicKey(),
    varAddress: r.publicKey(),
    motherlodeDenominator: r.u64(),
  };
  if (r.bytes.length === 232) Object.assign(value, {
    roundSlots: r.u64(), intermissionSlots: r.u64(), reservedHex: r.bytesHex(32),
  });
  return finish(r, value);
}

export function decodeTreasury(account) {
  const r = new Reader(decodeAccountData('treasury', account), 'treasury');
  return finish(r, {
    balance: r.u64(),
    motherlode: r.u64(),
    minerRewardsFactor: r.numeric(),
    stakeRewardsFactor: r.numeric(),
    totalStaked: r.u64(),
    totalUnclaimed: r.u64(),
    totalRefined: r.u64(),
  });
}

export function decodeGoldVault(account) {
  const r = new Reader(decodeAccountData('goldVault', account), 'goldVault');
  return finish(r, { xautRewardsFactor: r.numeric(), pendingXaut: r.u64(),
    totalXautDistributed: r.u64(), totalXautClaimed: r.u64(), totalSolSwapped: r.u64(), reservedHex: r.bytesHex(32) });
}

export function decodeMiner(account) {
  const r = new Reader(decodeAccountData('miner', account), 'miner');
  return finish(r, {
    authority: r.publicKey(),
    referrer: r.publicKey(),
    deployed: r.u64Array(25),
    cumulative: r.u64Array(25),
    checkpointFee: r.u64(),
    checkpointId: r.u64(),
    lastClaimGodlAt: r.i64(),
    lastClaimSolAt: r.i64(),
    rewardsFactor: r.numeric(),
    rewardsSol: r.u64(),
    rewardsGodl: r.u64(),
    refinedGodl: r.u64(),
    roundId: r.u64(),
    lifetimeDeployed: r.u64(),
    lifetimeRewardsSol: r.u64(),
    lifetimeRewardsGodl: r.u64(),
  });
}

export function decodeMinerExtended(account) {
  const r = new Reader(decodeAccountData('minerExtended', account), 'minerExtended');
  return finish(r, {
    authority: r.publicKey(),
    xautRewardsFactor: r.numeric(),
    xautRewards: r.u64(),
    lifetimeXaut: r.u64(),
    reservedHex: r.bytesHex(32),
  });
}

export function decodeAutomationV2(account) {
  const r = new Reader(decodeAccountData('automationV2', account), 'automationV2');
  const amount = r.u64();
  const authority = r.publicKey();
  const balance = r.u64();
  const executor = r.publicKey();
  const fee = r.u64();
  const config = r.u64();
  const mask = r.u64();
  r.done();
  const packed = BigInt(config);
  const strategyCode = Number(packed & 0xffn);
  return {
    amount,
    authority,
    balance,
    executor,
    fee,
    config,
    mask,
    strategy: strategyCode === 0 ? 'random' : strategyCode === 1 ? 'preferred' : 'unknown',
    strategyCode,
    claimAndFund: ((packed >> 8n) & 0xffn) !== 0n,
    isPooled: ((packed >> 16n) & 0xffn) !== 0n,
    reservedConfig: (packed >> 24n).toString(),
  };
}

export function decodeAutomation(account) {
  const r = new Reader(decodeAccountData('automation', account), 'automation');
  const amount = r.u64();
  const authority = r.publicKey();
  const balance = r.u64();
  const executor = r.publicKey();
  const fee = r.u64();
  const strategy = r.u64();
  const mask = r.u64();
  r.done();
  return {
    amount,
    authority,
    balance,
    executor,
    fee,
    strategy,
    strategyName: strategy === '0' ? 'random' : strategy === '1' ? 'preferred' : 'unknown',
    mask,
  };
}

export async function deriveAddresses(wallet) {
  const walletAddress = address(wallet);
  const authority = addressEncoder.encode(walletAddress);
  const entries = await Promise.all([
    ['board', ['board']],
    ['config', ['config']],
    ['treasury', ['treasury']],
    ['miner', ['miner', authority]],
    ['minerExtended', ['miner_ext', authority]],
    ['automation', ['automation', authority]],
    ['automationV2', ['automation_v2', authority]],
    ['goldVault', ['gold_vault']],
  ].map(async ([name, seeds]) => {
    const [accountAddress, bump] = await getProgramDerivedAddress({ programAddress: PROGRAM_ADDRESS, seeds });
    return [name, { address: accountAddress, bump }];
  }));
  return Object.fromEntries(entries);
}

function decodePresent(accountType, account, expectedAuthority) {
  if (account === null) return { status: 'missing' };
  const decoders = {
    board: decodeBoard,
    goldVault: decodeGoldVault,
    config: decodeConfig,
    treasury: decodeTreasury,
    miner: decodeMiner,
    minerExtended: decodeMinerExtended,
    automation: decodeAutomation,
    automationV2: decodeAutomationV2,
  };
  const value = decoders[accountType](account);
  if (ACCOUNT_LAYOUTS[accountType].authority && value.authority !== expectedAuthority) {
    throw new Error(`${accountType} authority ${value.authority} does not match requested wallet ${expectedAuthority}`);
  }
  return {
    status: 'present',
    lamports: rpcUnsigned(account.lamports, `${accountType}.lamports`),
    rentEpoch: rpcUnsigned(account.rentEpoch, `${accountType}.rentEpoch`, { rentEpoch: true }),
    value,
  };
}

export async function readWalletState({ wallet, rpcUrl, fetchImpl = globalThis.fetch, requestTimeoutMs = 10000 }) {
  const walletAddress = address(wallet);
  if (typeof rpcUrl !== 'string' || rpcUrl.length === 0) throw new TypeError('rpcUrl is required');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 1 || requestTimeoutMs > 60000) throw new TypeError('requestTimeoutMs must be 1..60000');

  const derived = await deriveAddresses(walletAddress);
  const accountTypes = Object.keys(derived);
  const accountsRequest = (async () => {
    const response = await boundedFetch(fetchImpl, rpcUrl, {
      signal: AbortSignal.timeout(requestTimeoutMs),
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getMultipleAccounts',
        params: [accountTypes.map((name) => derived[name].address), {
          commitment: COMMITMENT,
          encoding: 'base64',
        }],
      }),
    });
    if (!response?.ok) throw rpcHTTPFailure(response?.status);
    const payload = await response.json();
    if (payload?.error) {
      throw new RuntimeFailure('providerUnavailable');
    }
    if (!payload?.result?.context || !Array.isArray(payload.result.value)) {
      throw new Error('GODL RPC response is missing result context or account values');
    }
    if (payload.result.value.length !== accountTypes.length) {
      throw new Error(`GODL RPC returned ${payload.result.value.length} accounts; expected ${accountTypes.length}`);
    }
    return { payload, observedAt: new Date().toISOString() };
  })();

  const genesisRequest = (async () => {
    const genesisResponse = await boundedFetch(fetchImpl, rpcUrl, {
      signal: AbortSignal.timeout(requestTimeoutMs),
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'getGenesisHash' }),
    });
    if (!genesisResponse?.ok) {
      throw rpcHTTPFailure(genesisResponse?.status);
    }
    const genesisPayload = await genesisResponse.json();
    if (genesisPayload?.error) {
      throw new RuntimeFailure('providerUnavailable');
    }
    if (typeof genesisPayload?.result !== 'string' || genesisPayload.result.length === 0) {
      throw new Error('GODL RPC response is missing the cluster genesis hash');
    }
    return genesisPayload;
  })();

  // Attach both rejection handlers before awaiting either request. Network
  // provenance still has to validate before any account observation is returned.
  const [{ payload, observedAt }, genesisPayload] = await Promise.all([accountsRequest, genesisRequest]);

  const accounts = Object.fromEntries(accountTypes.map((name, index) => [
    name,
    {
      address: derived[name].address,
      bump: derived[name].bump,
      ...decodePresent(name, payload.result.value[index], walletAddress),
    },
  ]));

  return {
    observedAt,
    wallet: walletAddress,
    programAddress: GODL_PROGRAM_ADDRESS,
    // Provenance identifies the frozen layout used to decode this observation.
    // Legacy RPC captures retain their original schema/source; the expanded
    // Config uses the newly verified source. Reconciliation checks deployment
    // independently and never infers program identity from layout compatibility.
    sourceCommit: accounts.config.status === 'present' && accounts.config.value.roundSlots !== undefined
      ? GODL_OBSERVATION_SOURCE_COMMIT : GODL_SOURCE_COMMIT,
    genesisHash: genesisPayload.result,
    commitment: COMMITMENT,
    context: {
      slot: rpcUnsigned(payload.result.context.slot, 'context.slot'),
      ...(payload.result.context.apiVersion ? { apiVersion: payload.result.context.apiVersion } : {}),
    },
    accounts,
  };
}
