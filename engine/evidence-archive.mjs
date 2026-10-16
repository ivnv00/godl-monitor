import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { lstatSync, chmodSync } from 'node:fs';
import { join, relative, resolve, dirname, basename, sep } from 'node:path';

export const ARCHIVE_NAME = 'evidence-archive.sqlite';
export const REFERENCE = Buffer.from('GODL-EVIDENCE-REFERENCE/1\n');
export const REFERENCE_PREFIX = Buffer.from('GODL-EVIDENCE-REFERENCE/');
const APP_ID = 0x474f4445;
const MAX_BYTES = 128 * 1024 * 1024;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const HASH = /^[a-f0-9]{64}$/;
export function integrity(message = 'Saved evidence archive integrity failure') {
  const error = new Error(message); error.code = 'GODL_EVIDENCE_INTEGRITY'; return error;
}
function regular(path, directory = false) {
  const value = lstatSync(path);
  if (value.isSymbolicLink() || !(directory ? value.isDirectory() : value.isFile())) throw integrity('Unsupported evidence archive file');
  return value;
}
export function evidenceLocation(path, expectedRoot) {
  let logical = resolve(path); if (logical.endsWith('.gz')) logical = logical.slice(0, -3);
  const parent = dirname(logical), root = dirname(parent), name = basename(logical);
  if (!(/^response-\d{6,}\.json$/.test(name) || (basename(parent) === 'finalized-cache' && /^[a-f0-9]{64}\.json$/.test(name))))
    throw integrity('Unsupported archived evidence path');
  if (expectedRoot && resolve(expectedRoot) !== root) throw integrity('Evidence profile mismatch');
  regular(root, true);
  try { regular(parent, true); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return { root, logical, key: relative(root, logical).split(sep).join('/') };
}
function pack(bytes) { return bytes.length ? deflateRawSync(bytes, { level: 6 }) : Buffer.alloc(0); }
function unpack(bytes, length, maximum) {
  if (!(bytes instanceof Uint8Array) || !Number.isSafeInteger(length) || length < 0 || length > maximum
      || bytes.length > length + 1024 * 1024) throw integrity();
  const result = length ? inflateRawSync(bytes, { maxOutputLength: length }) : Buffer.alloc(0);
  if (result.length !== length || (!length && bytes.length)) throw integrity();
  return result;
}

/** Extract exact source bytes, never reserialize parsed monetary/numeric values. */
export function splitEvidence(bytes) {
  const whole = () => ({ object: bytes, envelope: Buffer.alloc(0), splitAt: 0 });
  const text = bytes.toString('utf8'); if (!Buffer.from(text).equals(bytes)) return whole();
  try {
    const candidates = [];
    const value = JSON.parse(text, function(key, item, context) {
      if (key === 'raw' && typeof item === 'string' && typeof context?.source === 'string')
        candidates.push({ owner: this, token: context.source });
      return item;
    });
    const candidate = candidates.find(item => item.owner === value);
    if (!candidate) return whole();
    const index = text.indexOf(candidate.token); if (index < 0) return whole();
    const prefix = Buffer.from(text.slice(0, index)), object = Buffer.from(candidate.token), suffix = Buffer.from(text.slice(index + candidate.token.length));
    if (!Buffer.concat([prefix, object, suffix]).equals(bytes)) throw integrity();
    return { object, envelope: Buffer.concat([prefix, suffix]), splitAt: prefix.length };
  } catch (error) { if (error.code === 'GODL_EVIDENCE_INTEGRITY') throw error; return whole(); }
}

/** Immutable records/objects; callers own the accounting writer lock for writes. */
export class EvidenceArchive {
  constructor(root, { readOnly = false } = {}) {
    this.root = resolve(root); regular(this.root, true); this.path = join(this.root, ARCHIVE_NAME);
    try { const info = regular(this.path); if (info.nlink !== 1) throw integrity('Shared archive database is unsupported'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; if (readOnly) throw error; }
    this.readOnly = readOnly;
    this.db = new DatabaseSync(this.path, { readOnly, timeout: 5000 });
    try {
      const version = this.db.prepare('PRAGMA user_version').get().user_version;
      const app = this.db.prepare('PRAGMA application_id').get().application_id;
      const tables = this.db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'").all().map(r => r.name).sort();
      if (!readOnly && !tables.length && version === 0 && app === 0) {
        this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; BEGIN IMMEDIATE;
          CREATE TABLE objects(hash TEXT PRIMARY KEY, original_length INTEGER NOT NULL, payload BLOB NOT NULL) STRICT, WITHOUT ROWID;
          CREATE TABLE records(hash TEXT PRIMARY KEY, original_length INTEGER NOT NULL,
            object_hash TEXT NOT NULL REFERENCES objects(hash), envelope BLOB NOT NULL,
            envelope_length INTEGER NOT NULL, split_at INTEGER NOT NULL) STRICT, WITHOUT ROWID;
          CREATE TABLE paths(path TEXT PRIMARY KEY, record_hash TEXT NOT NULL REFERENCES records(hash)) STRICT, WITHOUT ROWID;
          PRAGMA application_id=${APP_ID}; PRAGMA user_version=1; COMMIT;`);
        chmodSync(this.path, 0o600);
      } else {
        if (version !== 1 || app !== APP_ID || tables.join(',') !== 'objects,paths,records'
            || this.db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE type='trigger'").get().n) throw integrity('Unsupported evidence archive format');
        const expected = { objects: 'hash,original_length,payload', records: 'hash,original_length,object_hash,envelope,envelope_length,split_at', paths: 'path,record_hash' };
        for (const [table, names] of Object.entries(expected))
          if (this.db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name).join(',') !== names) throw integrity('Unsupported evidence archive schema');
        if (!readOnly) this.db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
      }
      this.findPath = this.db.prepare('SELECT record_hash FROM paths WHERE path=?');
      this.recordInfo = this.db.prepare('SELECT original_length,object_hash,envelope_length,split_at,length(envelope) AS compressed FROM records WHERE hash=?');
      this.objectInfo = this.db.prepare('SELECT original_length,length(payload) AS compressed FROM objects WHERE hash=?');
      this.recordData = this.db.prepare('SELECT envelope FROM records WHERE hash=?');
      this.objectData = this.db.prepare('SELECT payload FROM objects WHERE hash=?');
    } catch (error) { this.db.close(); throw error; }
  }
  key(path) { return evidenceLocation(path, this.root).key; }
  *logicalPaths() {
    for (const row of this.db.prepare('SELECT path FROM paths ORDER BY path').iterate()) {
      const parts = row.path.split('/');
      if (parts.length !== 2 || parts.some(part => !part || part === '.' || part === '..' || part.includes('\0')))
        throw integrity('Unsupported archived evidence key');
      const path = join(this.root, row.path);
      if (this.key(path) !== row.path) throw integrity('Unsupported archived evidence key');
      yield path;
    }
  }
  has(path) { return !!this.findPath.get(this.key(path)); }
  readHash(hash, maxBytes = MAX_BYTES) {
    try {
      if (!HASH.test(hash) || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_BYTES) throw integrity();
      const record = this.recordInfo.get(hash);
      if (!record || !HASH.test(record.object_hash) || !Number.isSafeInteger(record.original_length)
          || record.original_length < 0 || record.original_length > maxBytes || !Number.isSafeInteger(record.envelope_length)
          || record.envelope_length < 0 || record.envelope_length > record.original_length || !Number.isSafeInteger(record.split_at)
          || record.split_at < 0 || record.split_at > record.envelope_length || record.compressed > record.envelope_length + 1024 * 1024) throw integrity();
      const object = this.objectInfo.get(record.object_hash);
      if (!object || object.original_length !== record.original_length - record.envelope_length
          || object.compressed > object.original_length + 1024 * 1024) throw integrity();
      const body = unpack(this.objectData.get(record.object_hash).payload, object.original_length, maxBytes);
      if (digest(body) !== record.object_hash) throw integrity();
      const envelope = unpack(this.recordData.get(hash).envelope, record.envelope_length, maxBytes);
      const bytes = Buffer.concat([envelope.subarray(0, record.split_at), body, envelope.subarray(record.split_at)], record.original_length);
      if (digest(bytes) !== hash) throw integrity();
      return bytes;
    } catch (error) { if (error.code === 'GODL_EVIDENCE_INTEGRITY') throw error; throw integrity(); }
  }
  read(path, maxBytes = MAX_BYTES) {
    const found = this.findPath.get(this.key(path));
    if (!found) throw integrity('Saved evidence reference is missing from its archive');
    return this.readHash(found.record_hash, maxBytes);
  }
  put(path, bytes) {
    if (this.readOnly) throw integrity('Evidence archive is read-only');
    if (!Buffer.isBuffer(bytes) || bytes.length > MAX_BYTES) throw integrity('Evidence exceeds archive byte limit');
    const key = this.key(path), hash = digest(bytes), parts = splitEvidence(bytes), objectHash = digest(parts.object);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const existing = this.findPath.get(key);
      if (existing && existing.record_hash !== hash) throw integrity('Conflicting evidence record; original preserved');
      if (this.recordInfo.get(hash)) {
        if (!this.readHash(hash).equals(bytes)) throw integrity();
      } else {
        const saved = this.objectInfo.get(objectHash);
        if (saved) {
          const original = unpack(this.objectData.get(objectHash).payload, saved.original_length, MAX_BYTES);
          if (digest(original) !== objectHash || !original.equals(parts.object)) throw integrity();
        } else this.db.prepare('INSERT INTO objects VALUES(?,?,?)').run(objectHash, parts.object.length, pack(parts.object));
        this.db.prepare('INSERT INTO records VALUES(?,?,?,?,?,?)').run(hash, bytes.length, objectHash,
          pack(parts.envelope), parts.envelope.length, parts.splitAt);
      }
      this.db.prepare('INSERT OR IGNORE INTO paths VALUES(?,?)').run(key, hash);
      this.db.exec('COMMIT');
      return hash;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  close() { this.db.close(); }
}
