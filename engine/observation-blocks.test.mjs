// Generated synthetic evidence only. Never load personal monitoring files.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { ObservationStore } from './observation-store.mjs';
import { GODL_PROGRAM_ADDRESS, GODL_SOURCE_COMMIT } from './chain.mjs';
import { MAINNET_GENESIS } from './monitor.mjs';

const wallet = '11111111111111111111111111111111';
const scope = { wallet, genesisHash: MAINNET_GENESIS };
const key = n => String(n).padStart(20, '0');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function value(n) {
  return { ...scope, commitment: 'finalized', sourceCommit: GODL_SOURCE_COMMIT,
    programAddress: GODL_PROGRAM_ADDRESS, context: { slot: String(n) },
    observedAt: new Date(Date.UTC(2026, 9, n <= 256 ? 24 : n <= 512 ? 25 : 26, 0, 0, n % 60)).toISOString(),
    accounts: { miner: { status: 'present', lamports: '100', value: { authority: wallet,
      rewardsSol: '0', rewardsGodl: '9007199254740993', checkpointFee: '0',
      roundId: '1', checkpointId: '1', deployed: Array(25).fill('0') } },
      minerExtended: { status: 'missing' }, automation: { status: 'missing' }, automationV2: { status: 'missing' } } };
}
function fixture(t, count = 10512) {
  const root = mkdtempSync(join(tmpdir(), 'godl-blocks-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const path = join(root, 'synthetic.sqlite'), store = new ObservationStore(path);
  store.append(value(1));
  const hash = store.database.prepare('SELECT accounts_hash FROM observations').get().accounts_hash;
  const insert = store.database.prepare('INSERT INTO observations VALUES(?,?,?,?,?)');
  store.database.exec('BEGIN');
  for (let n = 2; n <= count; n++) insert.run(wallet, scope.genesisHash, key(n), hash,
    JSON.stringify(value(n), null, n === 2 ? 2 : 0) + (n === 3 ? '\n' : ''));
  store.database.exec('COMMIT');
  t.after(() => { if (store.database.isOpen) store.close(); });
  return { store, path };
}
const inventory = store => store.database.prepare('SELECT * FROM observations ORDER BY wallet,genesis_hash,slot_key').all();
function compact(store, maxRows = 128) {
  let result;
  do { result = store.compact({ ...scope, maxRows }); } while (result.compressed || result.archivedRows);
}
const boundaries = (store, funded = false) => store.accountingBoundaries({ ...scope, fromSlot: '0', toSlot: '20000',
  days: ['2026-10-24', '2026-10-25', '2026-10-26'], timeZone: 'Europe/Sofia', funded });

test('schema2 blocks preserve exact full tuples, recent reads, read-only bytes, and explicit old-reader rejection', t => {
  const { store, path } = fixture(t), before = inventory(store), expected = boundaries(store);
  compact(store);
  assert.equal(store.database.prepare('PRAGMA user_version').get().user_version, 2);
  assert.deepEqual(inventory(store), before);
  assert.deepEqual(boundaries(store), expected);
  assert.equal(store.database.prepare('SELECT sum(row_count) n FROM observation_blocks').get().n, 512);
  assert.equal(store.database.prepare('SELECT count(*) n FROM observation_hot').get().n, 10000);
  assert.equal(store.database.prepare('SELECT count(*) n FROM observation_packed').get().n, 0);
  assert.equal(store.database.prepare('SELECT count(*) n FROM observation_dictionaries').get().n, 0);
  assert.deepEqual(store.append(value(1)), { inserted: false });
  const conflict = value(1); conflict.accounts.miner.value.rewardsGodl = '7';
  assert.throws(() => store.append(conflict), /conflicting/);
  assert.throws(() => store.append(value(0)), /out-of-order/);
  const oldReader = new DatabaseSync(path, { readOnly: true });
  // A version1 engine has the per-row codec, but cannot silently omit blocks.
  oldReader.function('godl_unpack_snapshot_v1', () => '');
  assert.throws(() => oldReader.prepare('SELECT * FROM observations'), /no such function: godl_unpack_block_v2/);
  oldReader.close();
  store.close();
  const bytes = digest(readFileSync(path)), ro = new ObservationStore(path, { readOnly: true });
  assert.deepEqual(inventory(ro), before);
  assert.deepEqual(boundaries(ro), expected);
  assert.throws(() => ro.expand(), /read-only/);
  ro.close();
  assert.equal(digest(readFileSync(path)), bytes);
});

test('10k hot reads and append do not decode cold payloads or metadata, including damaged blocks', t => {
  const { store } = fixture(t); compact(store);
  let decoded = 0;
  store.database.function('godl_unpack_block_v2', (payload, length, hash, count, first, last) => { decoded++; throw new Error('cold codec invoked'); });
  store.database.prepare('UPDATE observation_blocks SET payload=?,metadata=?').run(Buffer.from('damaged'), Buffer.from('damaged'));
  assert.equal(store.latest(scope).context.slot, '10512');
  assert.equal(store.list({ ...scope, limit: 10000 }).length, 10000);
  store.append(value(10513));
  assert.equal(decoded, 0);
  assert.throws(() => inventory(store), /cold codec invoked/);
  const hot = store.database.prepare('SELECT count(*) n FROM observation_hot').get().n;
  assert.throws(() => store.expand({ maxRows: 7 }));
  assert.equal(store.database.prepare('SELECT count(*) n FROM observation_hot').get().n, hot);
});

test('archived closed/funded boundaries merge metadata with packed/hot rows across DST and reject misleading candidates', t => {
  const { store } = fixture(t, 10513);
  const funded = value(257);
  funded.accounts.automation = { status: 'present', lamports: '12', value: { authority: wallet, balance: '10' } };
  store.database.prepare('UPDATE observations SET snapshot_json=? WHERE slot_key=?').run(JSON.stringify(funded), key(257));
  const invalid = value(1); invalid.accounts.miner.value.authority = 'synthetic-wrong-authority';
  store.database.prepare('UPDATE observations SET snapshot_json=? WHERE slot_key=?').run(JSON.stringify(invalid), key(1));
  // Backwards local-day ordering tests slot-based selection rather than dates as sort keys.
  const early = value(513); early.observedAt = '2026-10-24T21:30:00.000Z';
  store.database.prepare('UPDATE observations SET snapshot_json=? WHERE slot_key=?').run(JSON.stringify(early), key(513));
  const expectedClosed = boundaries(store), expectedFunded = boundaries(store, true);
  assert.ok(expectedClosed.length >= 5);
  assert.ok(expectedFunded.some(row => row.context.slot === '257'));
  compact(store);
  // Model intact metadata whose first candidate no longer meets full validation.
  const block = store.database.prepare('SELECT * FROM observation_blocks ORDER BY first_slot LIMIT 1').get();
  const metadata = JSON.parse(inflateRawSync(block.metadata));
  metadata[0] = [key(1), invalid.observedAt, GODL_SOURCE_COMMIT, GODL_PROGRAM_ADDRESS, 1, 1];
  const bytes = Buffer.from(JSON.stringify(metadata));
  store.database.prepare('UPDATE observation_blocks SET metadata=?,metadata_length=?,metadata_sha256=? WHERE id=?')
    .run(deflateRawSync(bytes), bytes.length, digest(bytes), block.id);
  assert.deepEqual(boundaries(store), expectedClosed);
  assert.deepEqual(boundaries(store, true), expectedFunded);
  // Metadata scan must decode full payloads only for selected candidates.
  const originalLookup = store.lookup.bind(store); let lookups = 0;
  store.lookup = (...args) => { lookups++; return originalLookup(...args); };
  boundaries(store);
  assert.ok(lookups <= 7, `unexpected full candidate count ${lookups}`);
});

test('bounded partial expansion is resumable, atomic on conflicts, and preserves new post-upgrade rows', t => {
  const { store, path } = fixture(t); compact(store);
  store.append(value(10513));
  const before = inventory(store);
  assert.deepEqual(store.expand({ maxRows: 7 }), { expanded: 7, remaining: 505 });
  assert.deepEqual(inventory(store), before);
  const block = store.database.prepare('SELECT * FROM observation_blocks ORDER BY first_slot LIMIT 1').get();
  const tuples = JSON.parse(inflateRawSync(block.payload));
  store.database.prepare('INSERT INTO observation_hot VALUES(?,?,?,?,?)').run(wallet, scope.genesisHash, ...tuples[0]);
  const original = store.database.prepare('SELECT payload,metadata FROM observation_blocks WHERE id=?').get(block.id);
  assert.throws(() => store.expand({ maxRows: 2 }), /UNIQUE constraint/);
  assert.deepEqual(store.database.prepare('SELECT payload,metadata FROM observation_blocks WHERE id=?').get(block.id), original);
  store.database.prepare('DELETE FROM observation_hot WHERE wallet=? AND genesis_hash=? AND slot_key=?')
    .run(wallet, scope.genesisHash, tuples[0][0]);
  store.close();
  const resumed = new ObservationStore(path); t.after(() => resumed.close());
  let result;
  do { result = resumed.expand({ maxRows: 23 }); assert.ok(result.expanded <= 23); } while (result.remaining);
  assert.equal(resumed.database.prepare('PRAGMA user_version').get().user_version, 0);
  assert.deepEqual(inventory(resumed), before);
  const plain = new DatabaseSync(path, { readOnly: true });
  assert.deepEqual(plain.prepare('SELECT * FROM observations ORDER BY wallet,genesis_hash,slot_key').all(), before);
  plain.close();
});

test('block creation rolls back atomically and dictionaries remain bounded during single-row maintenance', t => {
  const { store } = fixture(t, 10256);
  store.compact({ ...scope, maxRows: 255 });
  const before = inventory(store);
  store.database.exec(`CREATE TRIGGER interrupt_archive BEFORE DELETE ON observation_packed
    BEGIN SELECT RAISE(ABORT,'synthetic interruption'); END;`);
  assert.throws(() => store.compact({ ...scope, maxRows: 1 }), /synthetic interruption/);
  assert.equal(store.database.prepare('PRAGMA user_version').get().user_version, 1);
  assert.deepEqual(inventory(store), before);
  assert.equal(store.database.prepare("SELECT count(*) n FROM sqlite_schema WHERE name='observation_blocks'").get().n, 0);
  store.database.exec('DROP TRIGGER interrupt_archive');
  compact(store, 1);
  for (let n = 10257; n <= 10516; n++) { store.append(value(n)); store.compact({ ...scope, maxRows: 1 }); }
  assert.equal(store.database.prepare('SELECT count(*) n FROM observation_packed').get().n, 4);
  assert.ok(store.database.prepare('SELECT count(*) n FROM observation_dictionaries').get().n <= 2);
  assert.equal(store.database.prepare('SELECT sum(row_count) n FROM observation_blocks').get().n, 512);
  assert.equal(inventory(store).length, 10516);
});

test('block payloads remain bounded with large snapshots and preserve unsupported JSON and profile isolation', t => {
  const { store } = fixture(t, 10256);
  const update = store.database.prepare('UPDATE observations SET snapshot_json=? WHERE slot_key=?');
  for (let n = 1; n <= 4; n++) { const row = value(n); row.syntheticPadding = 'x'.repeat(700000); update.run(JSON.stringify(row), key(n)); }
  update.run(' unsupported original JSON\n', key(5));
  const other = { ...value(1), genesisHash: 'synthetic-other-network' }; store.append(other);
  const before = inventory(store); compact(store, 256);
  const blocks = store.database.prepare('SELECT * FROM observation_blocks').all();
  assert.ok(blocks.length >= 1);
  for (const block of blocks) {
    const tuples = JSON.parse(inflateRawSync(block.payload));
    assert.ok(tuples.length <= 256);
    assert.ok(tuples.reduce((n, row) => n + Buffer.byteLength(row[2]), 0) <= 2 * 1024 * 1024);
    assert.ok(block.original_length <= 4 * 1024 * 1024);
  }
  assert.deepEqual(inventory(store), before);
  assert.deepEqual(store.latest({ ...scope, genesisHash: other.genesisHash }), other);
  assert.equal(store.database.prepare('SELECT count(*) n FROM observation_packed').get().n < 256, true);
});

test('block integrity guards hashes, declared lengths and metadata independently, preserving originals on failure', t => {
  const { store, path } = fixture(t); compact(store);
  const original = store.database.prepare('SELECT * FROM observation_blocks ORDER BY id LIMIT 1').get();
  for (const [column, corrupted] of [['original_sha256', '0'.repeat(64)], ['original_length', 4 * 1024 * 1024 + 1],
    ['metadata_sha256', '0'.repeat(64)], ['metadata_length', 4 * 1024 * 1024 + 1], ['row_count', 255]]) {
    store.database.prepare(`UPDATE observation_blocks SET ${column}=? WHERE id=?`).run(corrupted, original.id);
    const blocks = store.database.prepare('SELECT * FROM observation_blocks ORDER BY id').all();
    const hot = store.database.prepare('SELECT count(*) n FROM observation_hot').get().n;
    assert.throws(() => store.expand({ maxRows: 13 }));
    assert.equal(store.database.prepare('SELECT count(*) n FROM observation_hot').get().n, hot);
    assert.deepEqual(store.database.prepare('SELECT * FROM observation_blocks ORDER BY id').all(), blocks);
    store.database.prepare(`UPDATE observation_blocks SET ${column}=? WHERE id=?`).run(original[column], original.id);
  }
  // Future schema changes must be rejected before opening WAL or writing state.
  store.database.exec('ALTER TABLE observation_blocks ADD COLUMN future TEXT'); store.close();
  const bytes = digest(readFileSync(path));
  assert.throws(() => new ObservationStore(path), /Unsupported observation storage schema/);
  assert.equal(digest(readFileSync(path)), bytes);
});

test('archive fallback chooses bounded keys before parsing snapshot JSON and retains exact u64 order', t => {
  const { store } = fixture(t);
  store.database.prepare('UPDATE observations SET snapshot_json=? WHERE slot_key=?').run('malformed unselected original', key(511));
  compact(store);
  const huge = value(1); huge.context.slot = '18446744073709551615';
  store.append(huge);
  assert.equal(store.latest(scope).context.slot, huge.context.slot);
  assert.throws(() => store.append(value(10513)), /out-of-order/);
  store.database.exec('BEGIN');
  store.database.exec('DELETE FROM observation_hot');
  assert.equal(store.latest(scope).context.slot, '512');
  assert.equal(store.list({ ...scope, limit: 1 })[0].context.slot, '512');
  assert.throws(() => store.list({ ...scope, limit: 2 }), /JSON/);
  store.database.exec('ROLLBACK');
  assert.equal(store.latest(scope).context.slot, huge.context.slot);
});

test('full block storage yields at least threefold savings including metadata and original account hashes', t => {
  const { store } = fixture(t, 10256);
  const first = store.compact({ ...scope, maxRows: 255 });
  assert.equal(first.archivedRows, 0);
  const packed = store.database.prepare('SELECT * FROM observation_packed').all();
  const packedBytes = packed.reduce((sum, row) => sum + Object.values(row)
    .reduce((n, value) => n + (value == null ? 0 : typeof value === 'number' ? 8 : Buffer.byteLength(value)), 0), 0)
    + store.database.prepare('SELECT sum(length(bytes)+16) n FROM observation_dictionaries').get().n;
  const result = store.compact({ ...scope, maxRows: 1 });
  assert.deepEqual(result, { compressed: 1, archivedRows: 256 });
  const block = store.database.prepare('SELECT * FROM observation_blocks').get();
  const blockBytes = Object.values(block).reduce((n, value) => n + (typeof value === 'number' ? 8 : Buffer.byteLength(value)), 0);
  t.diagnostic(`255 packed rows ${packedBytes} bytes; 256 archived rows with metadata and hashes ${blockBytes} bytes; ${(packedBytes / blockBytes).toFixed(1)}x smaller`);
  assert.ok(packedBytes / blockBytes >= 3);
  const tuples = JSON.parse(inflateRawSync(block.payload));
  assert.equal(tuples.length, 256);
  assert.ok(tuples.every(row => row[1].length === 64));
});
