// Generated synthetic evidence only.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { ObservationStore } from './observation-store.mjs';
import { GODL_PROGRAM_ADDRESS, GODL_SOURCE_COMMIT } from './chain.mjs';

const wallet = '11111111111111111111111111111111', genesisHash = 'synthetic-network';
const scope = { wallet, genesisHash };
const key = n => String(n).padStart(20, '0');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function value(n, day = '2026-01-02') {
  return { ...scope, commitment: 'finalized', sourceCommit: GODL_SOURCE_COMMIT,
    programAddress: GODL_PROGRAM_ADDRESS, context: { slot: String(n) }, observedAt: `${day}T12:00:00.000Z`,
    accounts: { miner: { status: 'present', lamports: '100', value: { authority: wallet,
      rewardsSol: '0', rewardsGodl: '9007199254740993', checkpointFee: '0',
      roundId: '1', checkpointId: '1', deployed: Array(25).fill('0') } },
      minerExtended: { status: 'missing' }, automation: { status: 'missing' }, automationV2: { status: 'missing' } } };
}
function fixture(t, count = 10006) {
  const root = mkdtempSync(join(tmpdir(), 'godl-compression-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const path = join(root, 'observations.sqlite'), store = new ObservationStore(path);
  store.append(value(1, '2026-01-01'));
  const hash = store.database.prepare('SELECT accounts_hash FROM observations LIMIT 1').get().accounts_hash;
  const insert = store.database.prepare('INSERT INTO observations VALUES (?, ?, ?, ?, ?)');
  store.database.exec('BEGIN');
  for (let n = 2; n <= count; n++) insert.run(wallet, genesisHash, key(n), hash,
    JSON.stringify(value(n, n <= 6 ? '2026-01-01' : '2026-01-02'), null, n === 2 ? 2 : 0));
  store.database.exec('COMMIT');
  t.after(() => { if (store.database.isOpen) store.close(); });
  return { path, store };
}
const inventory = store => store.database.prepare('SELECT * FROM observations ORDER BY wallet,genesis_hash,slot_key').all();
const boundaries = store => store.accountingBoundaries({ ...scope, fromSlot: '0', toSlot: '20000',
  days: ['2026-01-01', '2026-01-02'], timeZone: 'UTC' });

test('bounded mixed-format compression preserves all original bytes and accounting while keeping 10k recent rows hot', t => {
  const { path, store } = fixture(t);
  const before = inventory(store), expected = boundaries(store), latest = store.latest(scope);
  assert.deepEqual(store.compact({ ...scope, maxRows: 2 }), { compressed: 2 });
  assert.equal(store.database.prepare('SELECT count(*) AS n FROM observation_packed').get().n, 2);
  assert.deepEqual(inventory(store), before);
  assert.deepEqual(boundaries(store), expected);
  while (store.compact(scope).compressed) { /* Bounded resumable batches. */ }
  assert.equal(store.database.prepare('SELECT count(*) AS n FROM observation_hot').get().n, 10000);
  assert.deepEqual(store.latest(scope), latest);
  assert.deepEqual(store.list({ ...scope, limit: 10000 }), before.slice(-10000).map(r => JSON.parse(r.snapshot_json)));
  assert.deepEqual(store.append(value(1, '2026-01-01')), { inserted: false });
  const conflict = value(1); conflict.accounts.miner.value.rewardsGodl = '2';
  assert.throws(() => store.append(conflict), /conflicting/);
  assert.throws(() => store.append(value(0)), /out-of-order/);
  assert.deepEqual(inventory(store), before);
  const dictionaries = store.database.prepare('SELECT count(*) AS n FROM observation_dictionaries').get().n;
  store.append(value(10007));
  assert.equal(store.compact(scope).compressed, 1);
  assert.equal(store.database.prepare('SELECT count(*) AS n FROM observation_dictionaries').get().n, dictionaries,
    'one-row refreshes must reuse a dictionary instead of retaining a full extra snapshot per refresh');
  const afterAppend = inventory(store);
  store.close();
  const bytes = digest(readFileSync(path)), readOnly = new ObservationStore(path, { readOnly: true });
  assert.deepEqual(inventory(readOnly), afterAppend);
  assert.equal(readOnly.latest(scope).context.slot, '10007');
  assert.throws(() => readOnly.compact(scope), /read-only/);
  readOnly.close();
  assert.equal(digest(readFileSync(path)), bytes);
});

test('older readers fail explicitly until all current compressed observations are expanded losslessly', t => {
  const { path, store } = fixture(t), before = inventory(store);
  store.compact(scope);
  const oldReader = new DatabaseSync(path, { readOnly: true });
  assert.throws(() => oldReader.prepare('SELECT snapshot_json FROM observations LIMIT 1'), /no such function/);
  oldReader.close();
  store.append(value(10007));
  const after = inventory(store);
  let result;
  do { result = store.expand({ maxRows: 2 }); } while (result.remaining);
  assert.equal(store.database.prepare('PRAGMA user_version').get().user_version, 0);
  assert.deepEqual(inventory(store), after);
  assert.deepEqual(after.slice(0, before.length), before);
  const restoredReader = new DatabaseSync(path, { readOnly: true });
  assert.equal(restoredReader.prepare('SELECT count(*) AS n FROM observations').get().n, 10007);
  assert.deepEqual(restoredReader.prepare('SELECT * FROM observations ORDER BY slot_key').all(), after);
  restoredReader.close();
});

test('preserves malformed/unsupported original bytes and skips invalid accounting candidates after compression', t => {
  const { store } = fixture(t), original = ' malformed original JSON\n';
  store.database.prepare('UPDATE observations SET snapshot_json = ? WHERE slot_key = ?').run(original, key(1));
  const before = inventory(store), expected = boundaries(store);
  store.compact(scope);
  assert.deepEqual(inventory(store), before);
  assert.equal(store.database.prepare('SELECT snapshot_json FROM observations WHERE slot_key = ?').get(key(1)).snapshot_json, original);
  assert.deepEqual(boundaries(store), expected);
});

test('isolates compression by wallet/network and rolls back a conflicting conversion atomically', t => {
  const { store } = fixture(t);
  const other = { ...value(1), genesisHash: 'other-network' }; store.append(other);
  store.compact({ ...scope, maxRows: 1 });
  const before = inventory(store);
  // Model interruption/corruption leaving a conflicting destination. Never delete the source.
  store.database.prepare(`INSERT INTO observation_packed SELECT wallet,genesis_hash,?,accounts_hash,dictionary_id,
    payload,original_length,original_sha256,observed_at,source_commit,program_address,closed,funded
    FROM observation_packed LIMIT 1`).run(key(2));
  const hot = store.database.prepare('SELECT * FROM observation_hot ORDER BY genesis_hash,slot_key').all();
  assert.throws(() => store.compact(scope), /UNIQUE constraint/);
  assert.deepEqual(store.database.prepare('SELECT * FROM observation_hot ORDER BY genesis_hash,slot_key').all(), hot);
  assert.deepEqual(store.latest({ ...scope, genesisHash: 'other-network' }), other);
  assert.equal(before.length, 10007);
});

test('rejects damaged compressed bytes and unsupported storage versions without rewriting originals', t => {
  const { path, store } = fixture(t);
  store.compact(scope);
  store.database.prepare('UPDATE observation_packed SET payload = ? WHERE slot_key = ?').run(Buffer.from('damaged'), key(1));
  // Recent publication must not scan/decode older retained payloads.
  assert.equal(store.latest(scope).context.slot, '10006');
  assert.equal(store.list({ ...scope, limit: 10000 }).length, 10000);
  assert.throws(() => inventory(store));
  assert.throws(() => store.expand());
  assert.equal(store.database.prepare('SELECT count(*) AS n FROM observation_packed').get().n, 6);
  store.database.exec('PRAGMA user_version = 999'); store.close();
  const bytes = digest(readFileSync(path));
  assert.throws(() => new ObservationStore(path), /Unsupported observation storage version/);
  assert.equal(digest(readFileSync(path)), bytes);
});
