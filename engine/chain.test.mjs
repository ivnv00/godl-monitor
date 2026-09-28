import assert from 'node:assert/strict';
import test from 'node:test';
import { getAddressDecoder, getAddressEncoder } from '@solana/addresses';
import {
  GODL_PROGRAM_ADDRESS,
  decodeAutomation,
  decodeAutomationV2,
  decodeBoard,
  decodeMiner,
  decodeGoldVault,
  deriveAddresses,
  readWalletState,
} from './chain.mjs';

const addressDecoder = getAddressDecoder();
const WALLET = addressDecoder.decode(Buffer.alloc(32, 7));
const OTHER_WALLET = addressDecoder.decode(Buffer.alloc(32, 8));
const addressEncoder = getAddressEncoder();

class Writer {
  constructor(length, discriminator) {
    this.bytes = new Uint8Array(length);
    this.bytes[0] = discriminator;
    this.view = new DataView(this.bytes.buffer);
    this.offset = 8;
  }

  u64(value) {
    this.view.setBigUint64(this.offset, BigInt(value), true);
    this.offset += 8;
    return this;
  }

  i64(value) {
    this.view.setBigInt64(this.offset, BigInt(value), true);
    this.offset += 8;
    return this;
  }

  publicKey(value) {
    this.bytes.set(addressEncoder.encode(value), this.offset);
    this.offset += 32;
    return this;
  }

  numeric(rawBits) {
    let value = BigInt(rawBits);
    if (value < 0n) value += 1n << 128n;
    for (let index = 0; index < 16; index += 1) {
      this.bytes[this.offset + index] = Number(value & 0xffn);
      value >>= 8n;
    }
    this.offset += 16;
    return this;
  }

  zeroes(length) {
    this.offset += length;
    return this;
  }

  account(overrides = {}) {
    assert.equal(this.offset, this.bytes.length, 'fixture must exactly fill the native account');
    return {
      data: [Buffer.from(this.bytes).toString('base64'), 'base64'],
      executable: false,
      lamports: 2_039_280,
      owner: GODL_PROGRAM_ADDRESS,
      rentEpoch: 18_446_744_073_709_552_000,
      ...overrides,
    };
  }
}

function boardFixture(overrides) {
  return new Writer(32, 105).u64(366_826).u64(400_000_000).u64(400_000_100).account(overrides);
}

function configFixture() {
  return new Writer(184, 101)
    .publicKey(OTHER_WALLET).u64(800_000_000_000n)
    .publicKey(WALLET).publicKey(OTHER_WALLET).publicKey(WALLET).publicKey(OTHER_WALLET)
    .u64(625).account();
}

function treasuryFixture() {
  return new Writer(80, 104)
    .u64(9_007_199_254_740_993n).u64(123)
    .numeric(3n * (1n << 48n) + 1n).numeric(-1n)
    .u64(44).u64(55).u64(66).account();
}

function minerFixture(authority = WALLET) {
  const writer = new Writer(576, 103).publicKey(authority).publicKey(OTHER_WALLET);
  for (let i = 0; i < 25; i += 1) writer.u64(BigInt(i) + 9_007_199_254_740_993n);
  for (let i = 0; i < 25; i += 1) writer.u64(i * 10);
  return writer.u64(10_000).u64(366_825).i64(-1).i64(1_789_839_440)
    .numeric(1n << 48n).u64(11).u64(22).u64(33).u64(366_825)
    .u64(44).u64(55).u64(66).account();
}

function minerExtendedFixture(authority = WALLET) {
  return new Writer(104, 121).publicKey(authority).numeric(2n << 48n)
    .u64(77).u64(88).zeroes(32).account();
}

function automationFixture(authority = WALLET) {
  const config = 1n | (1n << 8n) | (1n << 16n) | (7n << 24n);
  return new Writer(112, 111).u64(500_000).publicKey(authority).u64(2_530_000)
    .publicKey(OTHER_WALLET).u64(30_000).u64(config).u64(0b10101).account();
}

function legacyAutomationFixture(authority = WALLET) {
  return new Writer(112, 100).u64(250_000).publicKey(authority).u64(1_250_000)
    .publicKey(OTHER_WALLET).u64(10_000).u64(0).u64(5).account();
}

test('derives canonical GODL PDAs from the pinned native Rust seeds', async () => {
  const derived = await deriveAddresses(WALLET);
  assert.deepEqual(derived, {
    board: { address: '49RF5rddTaRVq6iypkGvEYKhq5kUWHgRVspigNZHjoJc', bump: 254 },
    config: { address: 'EdftHBeEWwhpMPd9MZdPrGMGTKKXN9unt76xdqmmoKsd', bump: 255 },
    treasury: { address: '5epGzdW6veQwLQiQs1L45uUQ8jdSLQHWL8RbC7uTWVY3', bump: 254 },
    miner: { address: 'CE2V1Hj3oVE72XTfNCf4iAvP6snHA8VvUSKjqnSthJDm', bump: 255 },
    minerExtended: { address: '9M581Yhkw5GzC8GYo12PGN42J5fm78YCU1K6xShPetao', bump: 255 },
    automation: { address: 'DK73rBXmLvtQ5uCLsT14XBYeoa1Atf9VDFGAX7QKUYA', bump: 255 },
    automationV2: { address: 'AVVWQr9xYcXxp2akHafrzpEWW1zh7i9kaqHmHkJwkd4G', bump: 252 },
    goldVault: { address: '7SAZa5WvT7W24455wzN1hqagbyeKyiczSo7qeCfkA3Sz', bump: 255 },
  });
});

test('decodes native layouts without losing integers or fixed-point bits', () => {
  assert.deepEqual(decodeBoard(boardFixture()), {
    roundId: '366826', startSlot: '400000000', endSlot: '400000100',
  });
  const miner = decodeMiner(minerFixture());
  assert.equal(miner.authority, WALLET);
  assert.equal(miner.deployed[0], '9007199254740993');
  assert.equal(miner.deployed[24], '9007199254741017');
  assert.equal(miner.lastClaimGodlAt, '-1');
  assert.deepEqual(miner.rewardsFactor, { rawBits: '281474976710656', fractionalBits: 48 });
  const automation = decodeAutomationV2(automationFixture());
  assert.deepEqual({
    strategy: automation.strategy,
    strategyCode: automation.strategyCode,
    claimAndFund: automation.claimAndFund,
    isPooled: automation.isPooled,
    reservedConfig: automation.reservedConfig,
  }, { strategy: 'preferred', strategyCode: 1, claimAndFund: true, isPooled: true, reservedConfig: '7' });
  assert.equal(decodeAutomation(legacyAutomationFixture()).strategyName, 'random');
});

test('rejects wrong owner, length and discriminator', () => {
  assert.throws(() => decodeBoard(boardFixture({ owner: OTHER_WALLET })), /owner/);

  const short = boardFixture();
  short.data[0] = Buffer.alloc(31).toString('base64');
  assert.throws(() => decodeBoard(short), /data length 31/);

  const wrongDiscriminator = boardFixture();
  const bytes = Buffer.from(wrongDiscriminator.data[0], 'base64');
  bytes[7] = 1;
  wrongDiscriminator.data[0] = bytes.toString('base64');
  assert.throws(() => decodeBoard(wrongDiscriminator), /discriminator/);
});

test('reads all eight accounts in one finalized RPC context and distinguishes missing accounts', async () => {
  const requests = [];
  const fetchImpl = async (_url, init) => {
    const request = JSON.parse(init.body);
    requests.push(request);
    if (request.method === 'getGenesisHash') {
      return { ok: true, json: async () => ({ jsonrpc: '2.0', id: 2, result: 'mainnet-genesis-hash' }) };
    }
    return {
      ok: true,
      async json() {
        return {
          jsonrpc: '2.0', id: 1,
          result: {
            context: { slot: 400_000_123, apiVersion: '2.3.8' },
            value: [
              boardFixture(), configFixture(), treasuryFixture(), minerFixture(),
              minerExtendedFixture(), legacyAutomationFixture(), null,
              new Writer(88,120).numeric(3n << 48n).u64(4).u64(5).u64(6).u64(7).zeroes(32).account(),
            ],
          },
        };
      },
    };
  };

  const snapshot = await readWalletState({ wallet: WALLET, rpcUrl: 'https://rpc.invalid', fetchImpl });
  assert.equal(requests[0].method, 'getMultipleAccounts');
  assert.equal(requests[0].params[1].commitment, 'finalized');
  assert.equal(requests[0].params[1].encoding, 'base64');
  assert.equal(requests[0].params[0].length, 8);
  assert.equal(requests[1].method, 'getGenesisHash');
  assert.deepEqual(snapshot.context, { slot: '400000123', apiVersion: '2.3.8' });
  assert.equal(snapshot.genesisHash, 'mainnet-genesis-hash');
  assert.match(snapshot.observedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(snapshot.accounts.miner.status, 'present');
  assert.equal(snapshot.accounts.automation.status, 'present');
  assert.equal(snapshot.accounts.automationV2.status, 'missing');
  assert.equal(snapshot.accounts.automationV2.address, 'AVVWQr9xYcXxp2akHafrzpEWW1zh7i9kaqHmHkJwkd4G');
  assert.equal(snapshot.accounts.treasury.value.balance, '9007199254740993');
});

test('rejects mismatched wallet authority and RPC failures', async () => {
  const values = [boardFixture(), configFixture(), treasuryFixture(), minerFixture(OTHER_WALLET), null, null, null, null];
  const fetchImpl = async (_url, init) => {
    const request = JSON.parse(init.body);
    return request.method === 'getGenesisHash'
      ? { ok: true, json: async () => ({ result: 'mainnet-genesis-hash' }) }
      : { ok: true, json: async () => ({ result: { context: { slot: 1 }, value: values } }) };
  };
  await assert.rejects(
    readWalletState({ wallet: WALLET, rpcUrl: 'https://rpc.invalid', fetchImpl }),
    /authority .* does not match requested wallet/,
  );

  await assert.rejects(
    readWalletState({
      wallet: WALLET,
      rpcUrl: 'https://rpc.invalid',
      fetchImpl: async () => ({ ok: true, json: async () => ({ error: { code: -32005, message: 'rate limited' } }) }),
    }),
    /RPC error -32005: rate limited/,
  );
});

test('gold vault uses exact Steel header, fixed factor and 88-byte layout', () => {
 const a=new Writer(88,120).numeric(3n << 48n).u64(4).u64(5).u64(6).u64(7).zeroes(32).account();
 assert.equal(decodeGoldVault(a).xautRewardsFactor.rawBits,String(3n << 48n));
 assert.equal(decodeGoldVault(a).totalSolSwapped,'7');
 assert.throws(()=>decodeGoldVault({...a,owner:OTHER_WALLET}),/owner/);
});
