import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { getAddressDecoder } from '@solana/addresses';
import { ObservationStore } from './observation-store.mjs';

const addressDecoder = getAddressDecoder();
const WALLET_A = addressDecoder.decode(Buffer.alloc(32, 7));
const WALLET_B = addressDecoder.decode(Buffer.alloc(32, 8));

function snapshot({
  wallet = WALLET_A,
  genesisHash = 'network-a',
  slot = '1',
  observedAt = '2026-09-24T10:00:00.000Z',
  balance = '100',
  accounts,
} = {}) {
  return {
    wallet,
    genesisHash,
    commitment: 'finalized',
    observedAt,
    context: { slot },
    accounts: accounts ?? {
      miner: { status: 'present', bump: 254, value: { balance } },
      automation: { status: 'missing' },
    },
  };
}

test('persists complete snapshots across reopen and creates parent directories', () => {
  const root = mkdtempSync(join(tmpdir(), 'godl-observations-'));
  const path = join(root, 'nested', 'observations.sqlite');
  const evidence = snapshot({ slot: '18446744073709551615', balance: '9007199254740993' });

  const first = new ObservationStore(path);
  assert.deepEqual(first.append(evidence), { inserted: true });
  first.close();

  const reopened = new ObservationStore(path);
  assert.deepEqual(reopened.latest({ wallet: WALLET_A, genesisHash: 'network-a' }), evidence);
  reopened.close();
});

test('same accounts at the same key are idempotent and preserve the original observation', () => {
  const store = new ObservationStore();
  const original = snapshot();
  assert.deepEqual(store.append(original), { inserted: true });

  const repeated = {
    ...snapshot({ observedAt: '2026-09-24T10:01:00.000Z' }),
    accounts: {
      automation: { status: 'missing' },
      miner: { value: { balance: '100' }, bump: 254, status: 'present' },
    },
  };
  assert.deepEqual(store.append(repeated), { inserted: false });
  assert.equal(store.latest({ wallet: WALLET_A, genesisHash: 'network-a' }).observedAt, original.observedAt);
  store.close();
});

test('rejects conflicting finalized evidence atomically', () => {
  const store = new ObservationStore();
  const original = snapshot();
  store.append(original);

  assert.throws(() => store.append(snapshot({ balance: '101' })), /conflicting finalized evidence/);
  assert.deepEqual(store.list({ wallet: WALLET_A, genesisHash: 'network-a' }), [original]);
  store.close();
});

test('rejects new older rows but permits an idempotent repeat of an existing older row', () => {
  const store = new ObservationStore();
  const first = snapshot({ slot: '10' });
  store.append(first);
  store.append(snapshot({ slot: '12' }));

  assert.throws(() => store.append(snapshot({ slot: '11' })), /out-of-order observation/);
  assert.deepEqual(store.append(first), { inserted: false });
  assert.deepEqual(store.list({ wallet: WALLET_A, genesisHash: 'network-a' }).map((row) => row.context.slot), ['10', '12']);
  store.close();
});

test('scopes every read and ordering decision to wallet plus genesis hash', () => {
  const store = new ObservationStore();
  store.append(snapshot({ wallet: WALLET_A, genesisHash: 'network-a', slot: '50' }));
  store.append(snapshot({ wallet: WALLET_B, genesisHash: 'network-a', slot: '2' }));
  store.append(snapshot({ wallet: WALLET_A, genesisHash: 'network-b', slot: '3' }));

  assert.deepEqual(store.list({ wallet: WALLET_A, genesisHash: 'network-a' }).map((row) => row.context.slot), ['50']);
  assert.equal(store.latest({ wallet: WALLET_B, genesisHash: 'network-a' }).context.slot, '2');
  assert.equal(store.latest({ wallet: WALLET_A, genesisHash: 'missing' }), null);
  store.close();
});

test('orders lossless u64 slots and applies limit to the most recent window', () => {
  const store = new ObservationStore();
  for (const slot of ['2', '9007199254740993', '18446744073709551615']) {
    store.append(snapshot({ slot }));
  }

  assert.deepEqual(
    store.list({ wallet: WALLET_A, genesisHash: 'network-a', limit: 2 }).map((row) => row.context.slot),
    ['9007199254740993', '18446744073709551615'],
  );
  for (const limit of [0, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1, 10_001]) {
    assert.throws(() => store.list({ wallet: WALLET_A, genesisHash: 'network-a', limit }), /limit/);
  }
  store.close();
});

test('rejects invalid dates, slots, commitments, wallets, and lossy account integers', () => {
  const invalidSnapshots = [
    snapshot({ observedAt: 'not-a-date' }),
    snapshot({ observedAt: '2026-02-31T10:00:00.000Z' }),
    snapshot({ slot: '01' }),
    snapshot({ slot: '-1' }),
    snapshot({ slot: '18446744073709551616' }),
    { ...snapshot(), commitment: 'confirmed' },
    snapshot({ wallet: 'wallet-0OIl' }),
    snapshot({ accounts: { balance: Number.MAX_SAFE_INTEGER + 1 } }),
  ];

  for (const evidence of invalidSnapshots) {
    const store = new ObservationStore();
    assert.throws(() => store.append(evidence));
    assert.deepEqual(store.list({ wallet: WALLET_A, genesisHash: 'network-a' }), []);
    store.close();
  }
});
