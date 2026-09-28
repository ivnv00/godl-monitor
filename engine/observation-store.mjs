import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const MAX_U64 = (1n << 64n) - 1n;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 10_000;
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/;

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

/**
 * Durable, read-only monitor evidence keyed by wallet, network genesis, and slot.
 * list() selects the most recent `limit` rows, then returns that window in
 * ascending slot order. These observations are snapshots, not a cash-flow or
 * profitability ledger.
 */
export class ObservationStore {
  constructor(path = ':memory:') {
    nonemptyString(path, 'path');
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });

    this.database = new DatabaseSync(path, { timeout: 5_000 });
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS observations (
        wallet TEXT NOT NULL,
        genesis_hash TEXT NOT NULL,
        slot_key TEXT NOT NULL CHECK (length(slot_key) = 20),
        accounts_hash TEXT NOT NULL,
        snapshot_json TEXT NOT NULL,
        PRIMARY KEY (wallet, genesis_hash, slot_key)
      ) STRICT;
    `);
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
    this.insertRow = this.database.prepare(`
      INSERT INTO observations (wallet, genesis_hash, slot_key, accounts_hash, snapshot_json)
      VALUES (?, ?, ?, ?, ?)
    `);
    this.listRows = this.database.prepare(`
      SELECT snapshot_json FROM (
        SELECT slot_key, snapshot_json
        FROM observations
        WHERE wallet = ? AND genesis_hash = ?
        ORDER BY slot_key DESC
        LIMIT ?
      )
      ORDER BY slot_key ASC
    `);
    this.latestRow = this.database.prepare(`
      SELECT snapshot_json
      FROM observations
      WHERE wallet = ? AND genesis_hash = ?
      ORDER BY slot_key DESC
      LIMIT 1
    `);
  }

  append(snapshot) {
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
    return this.listRows.all(wallet, genesisHash, limit).map((row) => JSON.parse(row.snapshot_json));
  }

  latest({ wallet, genesisHash } = {}) {
    identity(wallet, genesisHash);
    const row = this.latestRow.get(wallet, genesisHash);
    return row ? JSON.parse(row.snapshot_json) : null;
  }

  close() {
    this.database.close();
  }
}
