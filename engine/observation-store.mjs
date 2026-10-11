import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { GODL_PROGRAM_ADDRESS, GODL_SOURCE_COMMIT } from './chain.mjs';
import { requireClosedState, requireFundedState, requireOpenState } from './ongoing-cost.mjs';

const MAX_U64 = (1n << 64n) - 1n;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 10_000;
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/;

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
    this.accountingRowsFirst = this.database.prepare(`${ACCOUNTING_ROWS} ASC`);
    this.accountingRowsLast = this.database.prepare(`${ACCOUNTING_ROWS} DESC`);
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
    const parameters = [wallet, genesisHash, fromKey, toKey, sourceCommit, programAddress, Number(funded), Number(funded)];
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
