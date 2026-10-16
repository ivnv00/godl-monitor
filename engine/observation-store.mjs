import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { GODL_PROGRAM_ADDRESS, GODL_SOURCE_COMMIT } from './chain.mjs';
import { requireClosedState, requireFundedState, requireOpenState } from './ongoing-cost.mjs';

const MAX_U64 = (1n << 64n) - 1n;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 10_000;
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/;
const MAX_PACKED_BYTES = 1024 * 1024;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function unpack(payload, dictionary, length, hash) {
  if (!(payload instanceof Uint8Array) || !(dictionary instanceof Uint8Array)
      || dictionary.length > 32768 || !Number.isSafeInteger(length) || length < 1 || length > MAX_PACKED_BYTES) {
    throw new Error('Unsupported compressed observation');
  }
  const bytes = inflateRawSync(payload, { dictionary, maxOutputLength: length });
  if (bytes.length !== length || sha256(bytes) !== hash) throw new Error('Compressed observation integrity failure');
  return bytes.toString('utf8');
}

function selectionMetadata(row) {
  let value;
  try {
    value = JSON.parse(row.snapshot_json);
    if (value.wallet !== row.wallet || value.genesisHash !== row.genesis_hash
        || slotKey(value.context?.slot) !== row.slot_key) throw new Error('identity');
    observedAt(value.observedAt);
    requireOpenState(value);
  } catch { return [null, null, null, 0, 0]; }
  let closed = 0, funded = 0;
  try { requireClosedState(value); closed = 1; } catch { /* Original remains preserved. */ }
  try { requireFundedState(value); funded = 1; } catch { /* Unknown reserves stay unknown. */ }
  return [value.observedAt, typeof value.sourceCommit === 'string' ? value.sourceCommit : null,
    typeof value.programAddress === 'string' ? value.programAddress : null, closed, funded];
}

// Return only selection metadata. JSON access stays behind json_valid so a
// damaged legacy row cannot abort selection of otherwise valid saved evidence.
const ACCOUNTING_ROWS = `
  SELECT slot_key, json_extract(snapshot_json, '$.observedAt') AS observed_at
  FROM observations
  WHERE wallet = ? AND genesis_hash = ? AND slot_key > ? AND slot_key < ?
    AND CASE WHEN json_valid(snapshot_json) THEN
      json_extract(snapshot_json, '$.wallet') = wallet
      AND json_extract(snapshot_json, '$.genesisHash') = genesis_hash
      AND json_extract(snapshot_json, '$.commitment') = 'finalized'
      AND json_extract(snapshot_json, '$.sourceCommit') = ?
      AND json_extract(snapshot_json, '$.programAddress') = ?
      AND json_extract(snapshot_json, '$.accounts.miner.status') = 'present'
      AND json_extract(snapshot_json, '$.accounts.miner.value.rewardsSol') = '0'
      AND json_type(snapshot_json, '$.accounts.miner.value.deployed') = 'array'
      AND json_array_length(snapshot_json, '$.accounts.miner.value.deployed') = 25
      AND (
        (json_type(snapshot_json, '$.accounts.miner.value.roundId') = 'text'
          AND json_type(snapshot_json, '$.accounts.miner.value.checkpointId') = 'text'
          AND json_extract(snapshot_json, '$.accounts.miner.value.roundId')
            = json_extract(snapshot_json, '$.accounts.miner.value.checkpointId'))
        OR NOT EXISTS (
          SELECT 1 FROM json_each(snapshot_json, '$.accounts.miner.value.deployed')
          WHERE type != 'text' OR value != '0'
        )
      )
      AND (
        (? = 1
          AND json_extract(snapshot_json, '$.accounts.automation.status') IN ('present', 'missing')
          AND json_extract(snapshot_json, '$.accounts.automationV2.status') IN ('present', 'missing'))
        OR (? = 0
          AND json_extract(snapshot_json, '$.accounts.automation.status') = 'missing'
          AND json_extract(snapshot_json, '$.accounts.automationV2.status') = 'missing')
      )
    ELSE 0 END
  ORDER BY slot_key
`;

function nonemptyString(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}

function identity(wallet, genesisHash) {
  nonemptyString(wallet, 'wallet');
  if (!BASE58.test(wallet)) throw new TypeError('wallet must be a base58 string');
  nonemptyString(genesisHash, 'genesisHash');
  return { wallet, genesisHash };
}

function slotKey(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value)) {
    throw new TypeError('context.slot must be a canonical decimal integer string');
  }
  const slot = BigInt(value);
  if (slot > MAX_U64) throw new RangeError('context.slot must fit in an unsigned 64-bit integer');
  return value.padStart(20, '0');
}

function observedAt(value) {
  const match = typeof value === 'string'
    ? /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/.exec(value)
    : null;
  const milliseconds = match ? Date.parse(value) : Number.NaN;
  const normalized = match
    ? `${match[1]}.${(match[2] ?? '').padEnd(3, '0')}Z`
    : null;
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== normalized) {
    throw new TypeError('observedAt must be a valid ISO 8601 UTC timestamp string');
  }
  return value;
}

function canonicalJson(value, path = 'accounts', ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${path} contains a non-finite number`);
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
      throw new TypeError(`${path} contains an unsafe integer; encode lossless integers as strings`);
    }
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') throw new TypeError(`${path} contains a non-JSON value`);
  if (ancestors.has(value)) throw new TypeError(`${path} contains a cycle`);

  ancestors.add(value);
  let result;
  if (Array.isArray(value)) {
    result = `[${value.map((item, index) => canonicalJson(item, `${path}[${index}]`, ancestors)).join(',')}]`;
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      ancestors.delete(value);
      throw new TypeError(`${path} must contain only plain JSON objects`);
    }
    result = `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${canonicalJson(value[key], `${path}.${key}`, ancestors)}`
    )).join(',')}}`;
  }
  ancestors.delete(value);
  return result;
}

function validatedSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new TypeError('snapshot must be an object');
  }
  const scope = identity(snapshot.wallet, snapshot.genesisHash);
  if (snapshot.commitment !== 'finalized') {
    throw new TypeError("commitment must be 'finalized'");
  }
  observedAt(snapshot.observedAt);
  if (!snapshot.context || typeof snapshot.context !== 'object' || Array.isArray(snapshot.context)) {
    throw new TypeError('context must be an object');
  }
  const key = slotKey(snapshot.context.slot);
  if (!snapshot.accounts || typeof snapshot.accounts !== 'object' || Array.isArray(snapshot.accounts)) {
    throw new TypeError('accounts must be an object');
  }

  // Canonicalization both validates lossless JSON and makes the evidence hash
  // independent of object key insertion order.
  const canonicalAccounts = canonicalJson(snapshot.accounts);
  canonicalJson(snapshot, 'snapshot');
  const hash = createHash('sha256').update(canonicalAccounts).digest('hex');
  return { ...scope, key, hash, json: JSON.stringify(snapshot) };
}

function queryLimit(limit) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new RangeError(`limit must be a safe integer from 1 to ${MAX_LIMIT}`);
  }
  return limit;
}

function accountingDays(days, timeZone) {
  if (!Array.isArray(days) || days.length > 7) throw new RangeError('days must be an array of at most 7 dates');
  for (const day of days) {
    const timestamp = typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day)
      ? Date.parse(`${day}T00:00:00.000Z`) : Number.NaN;
    if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== day) {
      throw new TypeError('days must contain valid YYYY-MM-DD dates');
    }
  }
  nonemptyString(timeZone, 'timeZone');
  if (/^[+-]/.test(timeZone)) throw new TypeError('timeZone must be an IANA time zone');
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  return { requested: new Set(days), formatter };
}

/**
 * Durable, read-only monitor evidence keyed by wallet, network genesis, and slot.
 * list() selects the most recent `limit` rows, then returns that window in
 * ascending slot order. These observations are snapshots, not a cash-flow or
 * profitability ledger.
 */
export class ObservationStore {
  constructor(path = ':memory:', { readOnly = false } = {}) {
    nonemptyString(path, 'path');
    if (typeof readOnly !== 'boolean') throw new TypeError('readOnly must be a boolean');
    if (readOnly && path === ':memory:') throw new TypeError('read-only store requires an existing database');
    this.readOnly = readOnly;
    if (!readOnly && path !== ':memory:') mkdirSync(dirname(path), { recursive: true });

    this.database = new DatabaseSync(path, { timeout: 5_000, readOnly });
    this.database.function('godl_unpack_snapshot_v1', { deterministic: true }, unpack);
    const version = this.database.prepare('PRAGMA user_version').get().user_version;
    if (![0, 1].includes(version)) {
      this.database.close();
      throw new Error('Unsupported observation storage version; original database preserved');
    }
    this.compressed = version === 1;
    const schema = this.database.prepare("SELECT type FROM sqlite_schema WHERE name = 'observations'").get();
    const expectedType = this.compressed ? 'view' : 'table';
    const columns = this.database.prepare(`PRAGMA table_info(${this.compressed ? 'observation_hot' : 'observations'})`).all();
    if ((schema && (schema.type !== expectedType || columns.map(c => c.name).join(',')
        !== 'wallet,genesis_hash,slot_key,accounts_hash,snapshot_json')) || (!schema && (readOnly || this.compressed))) {
      this.database.close();
      throw new Error('Unsupported observation storage schema; original database preserved');
    }
    if (!readOnly) this.database.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS ${this.compressed ? 'observation_hot' : 'observations'} (
        wallet TEXT NOT NULL,
        genesis_hash TEXT NOT NULL,
        slot_key TEXT NOT NULL CHECK (length(slot_key) = 20),
        accounts_hash TEXT NOT NULL,
        snapshot_json TEXT NOT NULL,
        PRIMARY KEY (wallet, genesis_hash, slot_key)
      ) STRICT;
    `);
    this.prepareStatements();
  }

  prepareStatements() {
    const readOnly = this.readOnly;
    this.findAtSlot = this.database.prepare(`
      SELECT accounts_hash, snapshot_json
      FROM observations
      WHERE wallet = ? AND genesis_hash = ? AND slot_key = ?
    `);
    this.findLatestKey = this.database.prepare(`
      SELECT slot_key
      FROM observations
      WHERE wallet = ? AND genesis_hash = ?
      ORDER BY slot_key DESC
      LIMIT 1
    `);
    if (!readOnly) this.insertRow = this.database.prepare(`
      INSERT INTO ${this.compressed ? 'observation_hot' : 'observations'} (wallet, genesis_hash, slot_key, accounts_hash, snapshot_json)
      VALUES (?, ?, ?, ?, ?)
    `);
    const recentRows = `WITH chosen AS MATERIALIZED (
      SELECT wallet, genesis_hash, slot_key FROM observation_hot WHERE wallet = ? AND genesis_hash = ?
      UNION ALL
      SELECT wallet, genesis_hash, slot_key FROM observation_packed WHERE wallet = ? AND genesis_hash = ?
      ORDER BY slot_key DESC LIMIT ?
    ) SELECT CASE WHEN h.slot_key IS NOT NULL THEN h.snapshot_json ELSE
      godl_unpack_snapshot_v1(p.payload, d.bytes, p.original_length, p.original_sha256) END AS snapshot_json
    FROM chosen c
    LEFT JOIN observation_hot h ON h.wallet = c.wallet AND h.genesis_hash = c.genesis_hash AND h.slot_key = c.slot_key
    LEFT JOIN observation_packed p ON p.wallet = c.wallet AND p.genesis_hash = c.genesis_hash AND p.slot_key = c.slot_key
    LEFT JOIN observation_dictionaries d ON d.id = p.dictionary_id
    ORDER BY c.slot_key ASC`;
    this.listRows = this.database.prepare(this.compressed ? recentRows : `
      SELECT snapshot_json FROM (
        SELECT slot_key, snapshot_json
        FROM observations
        WHERE wallet = ? AND genesis_hash = ?
        ORDER BY slot_key DESC
        LIMIT ?
      )
      ORDER BY slot_key ASC
    `);
    this.latestRow = this.database.prepare(this.compressed ? recentRows : `
      SELECT snapshot_json
      FROM observations
      WHERE wallet = ? AND genesis_hash = ?
      ORDER BY slot_key DESC
      LIMIT 1
    `);
    const rows = this.compressed ? `SELECT slot_key, observed_at FROM (
      ${ACCOUNTING_ROWS.replace('FROM observations', 'FROM observation_hot').replace('ORDER BY slot_key', '')}
      UNION ALL
      SELECT slot_key, observed_at FROM observation_packed
      WHERE wallet = ? AND genesis_hash = ? AND slot_key > ? AND slot_key < ?
        AND source_commit = ? AND program_address = ?
        AND ((? = 1 AND funded = 1) OR (? = 0 AND closed = 1))
    ) ORDER BY slot_key` : ACCOUNTING_ROWS;
    this.accountingRowsFirst = this.database.prepare(`${rows} ASC`);
    this.accountingRowsLast = this.database.prepare(`${rows} DESC`);
  }

  enableCompression() {
    if (this.compressed) return;
    // A view with a required codec makes old engines fail explicitly instead of
    // silently omitting compressed accounting history on a binary downgrade.
    this.database.exec(`
      ALTER TABLE observations RENAME TO observation_hot;
      CREATE TABLE observation_dictionaries (id INTEGER PRIMARY KEY, bytes BLOB NOT NULL,
        uses INTEGER NOT NULL DEFAULT 0 CHECK (uses >= 0 AND uses <= 256)) STRICT;
      CREATE TABLE observation_packed (
        wallet TEXT NOT NULL, genesis_hash TEXT NOT NULL, slot_key TEXT NOT NULL,
        accounts_hash TEXT NOT NULL, dictionary_id INTEGER NOT NULL REFERENCES observation_dictionaries(id),
        payload BLOB NOT NULL, original_length INTEGER NOT NULL, original_sha256 TEXT NOT NULL,
        observed_at TEXT, source_commit TEXT, program_address TEXT,
        closed INTEGER NOT NULL, funded INTEGER NOT NULL,
        PRIMARY KEY (wallet, genesis_hash, slot_key)
      ) STRICT, WITHOUT ROWID;
      CREATE VIEW observations AS
        SELECT wallet, genesis_hash, slot_key, accounts_hash, snapshot_json FROM observation_hot
        UNION ALL
        SELECT p.wallet, p.genesis_hash, p.slot_key, p.accounts_hash,
          godl_unpack_snapshot_v1(p.payload, d.bytes, p.original_length, p.original_sha256) AS snapshot_json
        FROM observation_packed p LEFT JOIN observation_dictionaries d ON p.dictionary_id = d.id;
      PRAGMA user_version = 1;
    `);
  }

  /** Bounded lossless maintenance; keep the complete normal 10,000-row UI window hot. */
  compact({ wallet, genesisHash, maxRows = 128, keepRecent = MAX_LIMIT } = {}) {
    if (this.readOnly) throw new Error('Observation store is read-only');
    identity(wallet, genesisHash);
    if (!Number.isSafeInteger(maxRows) || maxRows < 1 || maxRows > 256
        || !Number.isSafeInteger(keepRecent) || keepRecent < MAX_LIMIT) throw new RangeError('Invalid compression batch');
    const table = this.compressed ? 'observation_hot' : 'observations';
    this.database.exec('BEGIN IMMEDIATE');
    let changedSchema = false;
    try {
      const candidates = this.database.prepare(`SELECT *, CAST(snapshot_json AS BLOB) AS original_bytes FROM ${table}
        WHERE wallet = ? AND genesis_hash = ? AND slot_key < (
          SELECT slot_key FROM ${table} WHERE wallet = ? AND genesis_hash = ?
          ORDER BY slot_key DESC LIMIT 1 OFFSET ?)
        AND length(CAST(snapshot_json AS BLOB)) BETWEEN 1 AND ${MAX_PACKED_BYTES}
        ORDER BY slot_key LIMIT ?`).iterate(wallet, genesisHash, wallet, genesisHash, keepRecent - 1, maxRows);
      // Oversized originals remain readable and untouched; never impose a new
      // acceptance limit on evidence that an earlier version already retained.
      const eligible = [];
      let batchBytes = 0;
      for (const row of candidates) {
        const bytes = Buffer.byteLength(row.snapshot_json);
        // Invalid legacy UTF-8 cannot round-trip through SQLite's JS text API.
        // Leave those original SQLite bytes untouched instead of normalizing.
        if (!Buffer.from(row.snapshot_json).equals(row.original_bytes)) continue;
        if (batchBytes + bytes > 2 * MAX_PACKED_BYTES) break;
        batchBytes += bytes; eligible.push(row);
      }
      if (eligible.length) {
        if (!this.compressed) { this.enableCompression(); changedSchema = true; }
        // Reuse this scope's dictionary even when ordinary maintenance has only
        // one new cold row. Saving a full seed per refresh would erase savings.
        const saved = this.database.prepare(`SELECT d.id, d.bytes, d.uses FROM observation_packed p
          JOIN observation_dictionaries d ON d.id = p.dictionary_id
          WHERE p.wallet = ? AND p.genesis_hash = ? ORDER BY p.slot_key DESC LIMIT 1`).get(wallet, genesisHash);
        // Rotate after 256 rows so a changed snapshot layout also gets a recent
        // seed, without retaining a seed for every ordinary one-row refresh.
        const reuse = saved && saved.uses + eligible.length <= 256;
        const dictionary = reuse ? saved.bytes : Buffer.from(eligible[0].snapshot_json).subarray(-32768);
        const dictionaryId = reuse ? saved.id : this.database.prepare('INSERT INTO observation_dictionaries(bytes) VALUES (?)').run(dictionary).lastInsertRowid;
        const insert = this.database.prepare('INSERT INTO observation_packed VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        const remove = this.database.prepare('DELETE FROM observation_hot WHERE wallet = ? AND genesis_hash = ? AND slot_key = ?');
        for (const row of eligible) {
          const original = Buffer.from(row.snapshot_json), hash = sha256(original);
          const payload = deflateRawSync(original, { level: 1, dictionary });
          if (unpack(payload, dictionary, original.length, hash) !== row.snapshot_json) throw new Error('Observation round-trip failed');
          insert.run(row.wallet, row.genesis_hash, row.slot_key, row.accounts_hash, dictionaryId,
            payload, original.length, hash, ...selectionMetadata(row));
          remove.run(row.wallet, row.genesis_hash, row.slot_key);
        }
        this.database.prepare('UPDATE observation_dictionaries SET uses = uses + ? WHERE id = ?').run(eligible.length, dictionaryId);
      }
      this.database.exec('COMMIT');
      if (changedSchema) { this.compressed = true; this.prepareStatements(); }
      return { compressed: eligible.length };
    } catch (error) { this.database.exec('ROLLBACK'); throw error; }
  }

  /** Offline downgrade support. Expands current evidence, never restores stale backups. */
  expand({ maxRows = 128 } = {}) {
    if (this.readOnly) throw new Error('Observation store is read-only');
    if (!Number.isSafeInteger(maxRows) || maxRows < 1 || maxRows > 256) throw new RangeError('Invalid expansion batch');
    if (!this.compressed) return { expanded: 0, remaining: 0 };
    this.database.exec('BEGIN IMMEDIATE');
    let restored = false;
    try {
      const rows = this.database.prepare(`SELECT p.*, d.bytes AS dictionary FROM observation_packed p
        LEFT JOIN observation_dictionaries d ON d.id = p.dictionary_id LIMIT ?`).all(maxRows);
      const insert = this.database.prepare('INSERT INTO observation_hot VALUES (?, ?, ?, ?, ?)');
      const remove = this.database.prepare('DELETE FROM observation_packed WHERE wallet = ? AND genesis_hash = ? AND slot_key = ?');
      for (const row of rows) {
        const json = unpack(row.payload, row.dictionary, row.original_length, row.original_sha256);
        insert.run(row.wallet, row.genesis_hash, row.slot_key, row.accounts_hash, json);
        remove.run(row.wallet, row.genesis_hash, row.slot_key);
      }
      const remaining = this.database.prepare('SELECT count(*) AS n FROM observation_packed').get().n;
      this.database.exec('DELETE FROM observation_dictionaries WHERE id NOT IN (SELECT dictionary_id FROM observation_packed)');
      if (!remaining) {
        this.database.exec(`DROP VIEW observations; DROP TABLE observation_packed; DROP TABLE observation_dictionaries;
          ALTER TABLE observation_hot RENAME TO observations; PRAGMA user_version = 0;`);
        restored = true;
      }
      this.database.exec('COMMIT');
      if (restored) { this.compressed = false; this.prepareStatements(); }
      return { expanded: rows.length, remaining };
    } catch (error) { this.database.exec('ROLLBACK'); throw error; }
  }

  append(snapshot) {
    if (this.readOnly) throw new Error('Observation store is read-only');
    const row = validatedSnapshot(snapshot);
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const existing = this.findAtSlot.get(row.wallet, row.genesisHash, row.key);
      if (existing) {
        if (existing.accounts_hash !== row.hash) {
          throw new Error(`conflicting finalized evidence for slot ${snapshot.context.slot}`);
        }
        this.database.exec('COMMIT');
        return { inserted: false };
      }

      const latest = this.findLatestKey.get(row.wallet, row.genesisHash);
      if (latest && row.key < latest.slot_key) {
        throw new Error(`out-of-order observation at slot ${snapshot.context.slot}`);
      }

      this.insertRow.run(row.wallet, row.genesisHash, row.key, row.hash, row.json);
      this.database.exec('COMMIT');
      return { inserted: true };
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  list({ wallet, genesisHash, limit = DEFAULT_LIMIT } = {}) {
    identity(wallet, genesisHash);
    queryLimit(limit);
    const parameters = this.compressed ? [wallet, genesisHash, wallet, genesisHash, limit] : [wallet, genesisHash, limit];
    return this.listRows.all(...parameters).map((row) => JSON.parse(row.snapshot_json));
  }

  latest({ wallet, genesisHash } = {}) {
    identity(wallet, genesisHash);
    const row = this.compressed ? this.latestRow.get(wallet, genesisHash, wallet, genesisHash, 1)
      : this.latestRow.get(wallet, genesisHash);
    return row ? JSON.parse(row.snapshot_json) : null;
  }

  /** Actual first/last settled snapshots per requested local day; no inferred endpoints or writes. */
  accountingBoundaries({ wallet, genesisHash, fromSlot, toSlot, days, timeZone,
    funded = false, sourceCommit = GODL_SOURCE_COMMIT, programAddress = GODL_PROGRAM_ADDRESS } = {}) {
    identity(wallet, genesisHash);
    const fromKey = slotKey(fromSlot), toKey = slotKey(toSlot);
    if (fromKey >= toKey) throw new RangeError('fromSlot must precede toSlot');
    nonemptyString(sourceCommit, 'sourceCommit');
    nonemptyString(programAddress, 'programAddress');
    if (typeof funded !== 'boolean') throw new TypeError('funded must be a boolean');
    const { requested, formatter } = accountingDays(days, timeZone);
    if (!requested.size) return [];
    let parameters = [wallet, genesisHash, fromKey, toKey, sourceCommit, programAddress, Number(funded), Number(funded)];
    if (this.compressed) parameters = [...parameters, ...parameters];
    const selected = new Map(), rejected = new Set();
    for (const statement of [this.accountingRowsFirst, this.accountingRowsLast]) {
      const foundDays = new Set();
      // Stream metadata in each direction instead of mapping an unbounded
      // snapshot array. At most two valid full snapshots are decoded per day.
      for (const row of statement.iterate(...parameters)) {
        if (rejected.has(row.slot_key)) continue;
        let day;
        try {
          observedAt(row.observed_at);
          const parts = Object.fromEntries(formatter.formatToParts(new Date(row.observed_at))
            .map(part => [part.type, part.value]));
          day = `${parts.year}-${parts.month}-${parts.day}`;
        } catch { continue; }
        if (!requested.has(day) || foundDays.has(day)) continue;
        if (!selected.has(row.slot_key)) {
          try {
            const snapshot = JSON.parse(this.findAtSlot.get(wallet, genesisHash, row.slot_key).snapshot_json);
            if (snapshot.wallet !== wallet || snapshot.genesisHash !== genesisHash
                || snapshot.sourceCommit !== sourceCommit || snapshot.programAddress !== programAddress
                || slotKey(snapshot.context?.slot) !== row.slot_key) throw new Error('Saved snapshot identity mismatch');
            requireOpenState(snapshot);
            if (funded) requireFundedState(snapshot); else requireClosedState(snapshot);
            selected.set(row.slot_key, snapshot);
          } catch {
            rejected.add(row.slot_key);
            continue;
          }
        }
        foundDays.add(day);
        if (foundDays.size === requested.size) break;
      }
    }
    return [...selected].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, snapshot]) => snapshot);
  }

  close() {
    this.database.close();
  }
}
