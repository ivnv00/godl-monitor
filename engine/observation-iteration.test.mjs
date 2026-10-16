// Generated synthetic evidence only. Never load personal monitoring files.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ObservationStore } from './observation-store.mjs';
import { GODL_PROGRAM_ADDRESS, GODL_SOURCE_COMMIT } from './chain.mjs';
import { MAINNET_GENESIS, projectMonitor } from './monitor.mjs';

const wallet = '11111111111111111111111111111111';
const scope = { wallet, genesisHash: MAINNET_GENESIS };
const key = n => String(n).padStart(20, '0');
function snapshot(n) {
  return { ...scope, commitment: 'finalized', sourceCommit: GODL_SOURCE_COMMIT,
    programAddress: GODL_PROGRAM_ADDRESS, context: { slot: String(n) }, observedAt: '2026-10-16T00:00:00.000Z',
    accounts: { board: { status: 'missing' }, miner: { status: 'present', lamports: '100', value: {
      authority: wallet, rewardsSol: '0', rewardsGodl: '9007199254740993', refinedGodl: '0',
      checkpointFee: '0', roundId: '1', checkpointId: '1', deployed: Array(25).fill('0') } },
      minerExtended: { status: 'missing' }, automation: { status: 'missing' }, automationV2: { status: 'missing' } } };
}
function fixture(t, count = 10512) {
  const root = mkdtempSync(join(tmpdir(), 'godl-iteration-'));
  const store = new ObservationStore(join(root, 'synthetic.sqlite'));
  t.after(() => { if (store.database.isOpen) store.close(); rmSync(root, { recursive: true, force: true }); });
  store.append(snapshot(1));
  const hash = store.database.prepare('SELECT accounts_hash FROM observations').get().accounts_hash;
  const insert = store.database.prepare('INSERT INTO observations VALUES(?,?,?,?,?)');
  store.database.exec('BEGIN');
  for (let n = 2; n <= count; n++) insert.run(wallet, scope.genesisHash, key(n), hash, JSON.stringify(snapshot(n)));
  store.database.exec('COMMIT');
  return store;
}
function compact(store) {
  let result;
  do { result = store.compact({ ...scope, maxRows: 128 }); } while (result.compressed || result.archivedRows);
}
function parity(store, limit) {
  const options = { ...scope, ...(limit === undefined ? {} : { limit }) };
  const expected = store.list(options);
  const originalList = store.list;
  store.list = () => { throw new Error('ordinary rows must stream without list materialization'); };
  try {
    const selected = store.iterateRecent(options);
    assert.deepEqual([...selected], expected);
    assert.deepEqual([...selected], [], 'the iterable is single-pass');
  } finally { store.list = originalList; }
}

test('recent iteration matches full snapshots and order in original, packed and blocked storage', t => {
  const store = fixture(t);
  parity(store); parity(store, 1); parity(store, 10000);
  store.compact({ ...scope, maxRows: 128 });
  assert.equal(store.database.prepare('PRAGMA user_version').get().user_version, 1);
  parity(store, 10000);
  compact(store);
  assert.equal(store.database.prepare('PRAGMA user_version').get().user_version, 2);
  parity(store, 10000);
  store.database.function('godl_unpack_block_v2', () => { throw new Error('cold codec invoked'); });
  store.database.prepare('UPDATE observation_blocks SET payload=?,metadata=?').run(Buffer.from('damaged'), Buffer.from('damaged'));
  parity(store, 10000);
});

test('cold selection fallback matches list when a sparse hot window cannot cover the limit', t => {
  const store = fixture(t); compact(store);
  // Private generated fixture: leave three hot observations so cold blocks enter the selected window.
  store.database.prepare('DELETE FROM observation_hot WHERE slot_key < ?').run(key(10510));
  const expected = store.list({ ...scope, limit: 100 });
  assert.equal(expected.length, 100);
  assert.ok(BigInt(expected[0].context.slot) < 513n);
  assert.deepEqual([...store.iterateRecent({ ...scope, limit: 100 })], expected);
});

test('iteration preserves exact u64 slots, balances, absent miners and profile isolation', t => {
  const store = fixture(t, 1);
  const missing = snapshot('9007199254740993'); missing.accounts.miner = { status: 'missing' };
  const large = snapshot('18446744073709551615'); large.accounts.miner.value.rewardsGodl = '18446744073709551615';
  store.append(missing); store.append(large);
  store.append({ ...snapshot(2), genesisHash: 'synthetic-other-network' });
  parity(store, 100);
  const rows = [...store.iterateRecent(scope)];
  assert.equal(rows[1].accounts.miner.status, 'missing');
  assert.equal(rows[2].context.slot, '18446744073709551615');
  assert.equal(rows[2].accounts.miner.value.rewardsGodl, '18446744073709551615');
});

test('breaking or projection failure closes SQL iteration before append, compact and re-read', t => {
  const store = fixture(t, 3);
  for (const row of store.iterateRecent(scope)) { assert.equal(row.context.slot, '1'); break; }
  store.append(snapshot(4));
  const wrong = snapshot(2); wrong.accounts.miner.value.authority = 'synthetic-wrong-authority';
  store.database.prepare('UPDATE observations SET snapshot_json=? WHERE slot_key=?').run(JSON.stringify(wrong), key(2));
  assert.throws(() => projectMonitor(snapshot(4), { nowMs: Date.parse(snapshot(4).observedAt), history: store.iterateRecent(scope) }), /authority/);
  store.append(snapshot(5));
  store.compact({ ...scope, maxRows: 128 });
  assert.deepEqual([...store.iterateRecent(scope)], store.list(scope));
  assert.equal(store.latest(scope).context.slot, '5');
});

test('ordinary rows are decoded lazily and malformed selected JSON closes the SQL cursor', t => {
  const store = fixture(t, 3);
  store.database.prepare('UPDATE observations SET snapshot_json=? WHERE slot_key=?').run('synthetic malformed JSON', key(3));
  const rows = store.iterateRecent(scope)[Symbol.iterator]();
  assert.deepEqual(rows.next().value, snapshot(1));
  assert.deepEqual(rows.next().value, snapshot(2));
  assert.throws(() => rows.next(), /JSON/);
  store.append(snapshot(4));
  store.compact({ ...scope, maxRows: 128 });
  assert.equal(store.latest(scope).context.slot, '4');
});
