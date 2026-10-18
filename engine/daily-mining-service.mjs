import { boundedFetch, httpsEndpoint } from './network-response.mjs';
import { open } from 'node:fs/promises';
import { address } from '@solana/addresses';
import { deriveAddresses, GODL_PROGRAM_ADDRESS, GODL_OBSERVATION_SOURCE_COMMIT } from './chain.mjs';
import { MAINNET_GENESIS } from './monitor.mjs';
import { readProgramDeployment, writeAtomicJson } from './accounting-service.mjs';
import { parseRpcJson } from './transaction-evidence.mjs';
import { decodeMiningRewards } from './mining-rewards.mjs';

const DEPLOYED = '457407037', MAX_BYTES = 16 * 1024 * 1024, MAX_SIGNATURES = 10000;
const U64_MAX = (1n << 64n) - 1n, SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;
const fail = () => { throw new Error('Daily mining recovery evidence unavailable'); };
class WorkBudgetExhausted extends Error {}
function validSignature(value) {
  if (typeof value !== 'string' || !SIGNATURE.test(value)) return false;
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let n = 0n, bytes = 0;
  for (const c of value) n = n * 58n + BigInt(alphabet.indexOf(c));
  while (n) { bytes++; n >>= 8n; }
  return bytes + value.match(/^1*/)[0].length === 64;
}
function uint(value) {
  if (Number.isSafeInteger(value) && value >= 0) value = String(value);
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value) || BigInt(value) > U64_MAX) fail();
  return value;
}
function instant(value) {
  const n = Date.parse(value);
  if (typeof value !== 'string' || !Number.isFinite(n) || new Date(n).toISOString() !== value) fail();
  return n;
}
function dayReader(timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, calendar: 'iso8601', year: 'numeric', month: '2-digit', day: '2-digit' });
  return ms => {
    const p = Object.fromEntries(formatter.formatToParts(ms).map(x => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}`;
  };
}
function dayBounds(at, timeZone) {
  const date = dayReader(timeZone);
  const day = date(at);
  let low = at - 48 * 3600000, high = at;
  while (high - low > 1) { const mid = Math.floor((low + high) / 2); if (date(mid) < day) low = mid; else high = mid; }
  return { day, fromAt: new Date(high).toISOString() };
}
function indexed(row) {
  if (!row || !validSignature(row.signature) || row.confirmationStatus !== 'finalized'
      || !Object.hasOwn(row, 'err') || !(row.err === null || typeof row.err === 'object' && !Array.isArray(row.err))
      || !Number.isSafeInteger(row.blockTime) || row.blockTime < 0 || !Number.isSafeInteger(row.blockTime * 1000)) fail();
  return { signature: row.signature, slot: uint(row.slot), blockTime: row.blockTime, err: row.err };
}
function validateTarget(target, cache) {
  if (!target || instant(target.throughAt) < instant(cache.fromAt) || dayBounds(instant(target.throughAt), cache.timeZone).day !== cache.day) fail();
  uint(target.throughSlot);
  if (!Array.isArray(target.rows) || target.rows.length > MAX_SIGNATURES) fail();
  const seen = new Set(); let previous;
  for (const row of target.rows) {
    indexed({ ...row, confirmationStatus: 'finalized' });
    if (seen.has(row.signature) || BigInt(row.slot) > BigInt(target.throughSlot)
        || row.blockTime * 1000 < instant(cache.fromAt) || row.blockTime * 1000 > instant(target.throughAt)
        || previous && (BigInt(row.slot) > BigInt(previous.slot) || row.blockTime > previous.blockTime)) fail();
    seen.add(row.signature); previous = row;
  }
  const boundary = indexed({ ...target.boundary, confirmationStatus: 'finalized' });
  if (seen.has(boundary.signature) || boundary.blockTime * 1000 >= instant(cache.fromAt)
      || BigInt(boundary.slot) > BigInt(target.throughSlot)
      || previous && (BigInt(boundary.slot) > BigInt(previous.slot) || boundary.blockTime > previous.blockTime)) fail();
}
function validateCache(cache) {
  if (!cache || cache.schemaVersion !== 1 || cache.kind !== 'godl-daily-mining-cache'
      || cache.programAddress !== GODL_PROGRAM_ADDRESS || cache.sourceCommit !== GODL_OBSERVATION_SOURCE_COMMIT
      || cache.genesisHash !== MAINNET_GENESIS || cache.deployedAtSlot !== DEPLOYED) fail();
  address(cache.wallet); address(cache.miner);
  if (dayBounds(instant(cache.fromAt), cache.timeZone).day !== cache.day
      || dayBounds(instant(cache.fromAt), cache.timeZone).fromAt !== cache.fromAt
      || !Number.isSafeInteger(cache.checkedAtMs) || cache.checkedAtMs < 0
      || !Number.isSafeInteger(cache.retryAfterMs) || cache.retryAfterMs < 0
      || !cache.transactions || Array.isArray(cache.transactions) || typeof cache.transactions !== 'object'
      || Object.keys(cache.transactions).length > MAX_SIGNATURES) fail();
  // Each transaction needs its local day, not another binary search for midnight.
  const transactionDay = dayReader(cache.timeZone);
  for (const [signature, tx] of Object.entries(cache.transactions)) {
    if (signature !== tx.signature || !validSignature(signature) || !Number.isSafeInteger(tx.blockTime)
        || tx.blockTime * 1000 < instant(cache.fromAt) || transactionDay(tx.blockTime * 1000) !== cache.day
        || !Number.isSafeInteger(tx.checkpointCount) || tx.checkpointCount < 0 || tx.checkpointCount > 10000) fail();
    uint(tx.slot); uint(tx.baseUnits);
    if (!(tx.err === null || tx.err && typeof tx.err === 'object' && !Array.isArray(tx.err))
        || tx.err === null && (!tx.result || typeof tx.result !== 'object')
        || tx.err !== null && (tx.result !== undefined || tx.baseUnits !== '0' || tx.checkpointCount !== 0)) fail();
  }
  if (cache.pending) validateTarget(cache.pending, cache);
  if (cache.published) {
    const p = cache.published;
    for (const key of ['wallet', 'genesisHash', 'programAddress', 'sourceCommit', 'deployedAtSlot', 'day', 'timeZone', 'fromAt']) if (p[key] !== cache[key]) fail();
    if (p.schemaVersion !== 1 || !Number.isSafeInteger(p.transactionCount) || p.transactionCount < 0 || p.transactionCount > MAX_SIGNATURES
        || !Number.isSafeInteger(p.checkpointCount) || p.checkpointCount < 0) fail();
    uint(p.unrefinedBaseUnits); uint(p.throughSlot);
    if (instant(p.throughAt) < instant(cache.fromAt) || dayBounds(instant(p.throughAt), cache.timeZone).day !== cache.day) fail();
    validateTarget(cache.publishedTarget, cache);
    if (cache.publishedTarget.throughAt !== p.throughAt || cache.publishedTarget.throughSlot !== p.throughSlot) fail();
  }
  return cache;
}
async function readCache(path) {
  let file;
  try {
    file = await open(path, 'r');
    const size = (await file.stat()).size;
    if (!Number.isSafeInteger(size) || size > MAX_BYTES) fail();
    // A bounded read also protects against concurrent file growth after stat.
    const bytes = Buffer.alloc(size + 1); let length = 0;
    while (length < bytes.length) {
      const { bytesRead } = await file.read(bytes, length, bytes.length - length, length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > size) fail();
    return validateCache(JSON.parse(bytes.subarray(0, length).toString('utf8')));
  } catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
  finally { await file?.close(); }
}
async function save(path, cache) {
  validateCache(cache);
  if (Buffer.byteLength(JSON.stringify(cache, null, 2)) + 1 > MAX_BYTES) fail();
  await writeAtomicJson(path, cache);
}

async function validateTransactions(cache) {
  for (const tx of Object.values(cache.transactions)) {
    if (tx.err !== null) continue;
    const result = tx.result;
    if (result.transaction?.signatures?.[0] !== tx.signature || uint(result.slot) !== tx.slot
        || result.blockTime !== tx.blockTime || result.meta?.err !== null || !transactionKeys(result).includes(cache.miner)) fail();
    const decoded = await decodeMiningRewards(result, { miner: cache.miner, programAddress: cache.programAddress, sourceCommit: cache.sourceCommit });
    if (decoded.status !== 'observed' || decoded.sourceCommit !== cache.sourceCommit
        || decoded.totalBaseUnits !== tx.baseUnits || (decoded.checkpointCount ?? decoded.events.length) !== tx.checkpointCount) fail();
  }
  if (cache.published) {
    const transactions = cache.publishedTarget.rows.map(row => {
      const tx = cache.transactions[row.signature];
      if (!tx || tx.slot !== row.slot || tx.blockTime !== row.blockTime || JSON.stringify(tx.err) !== JSON.stringify(row.err)) fail();
      return tx;
    });
    const total = transactions.reduce((n, tx) => n + BigInt(tx.baseUnits), 0n);
    if (total.toString() !== cache.published.unrefinedBaseUnits || transactions.length !== cache.published.transactionCount
        || transactions.reduce((n, tx) => n + tx.checkpointCount, 0) !== cache.published.checkpointCount) fail();
  }
}
function transactionKeys(result) {
  const keys = result.transaction?.message?.accountKeys, loaded = result.meta?.loadedAddresses;
  if (!Array.isArray(keys) || loaded && (!Array.isArray(loaded.writable) || !Array.isArray(loaded.readonly))) fail();
  return [...keys, ...(loaded?.writable ?? []), ...(loaded?.readonly ?? [])];
}

/** Offline publication never changes recovery progress or starts network work. */
export async function loadDailyMining({ snapshot, timeZone, cachePath }) {
  if (!snapshot || snapshot.commitment !== 'finalized' || snapshot.genesisHash !== MAINNET_GENESIS
      || snapshot.programAddress !== GODL_PROGRAM_ADDRESS || snapshot.sourceCommit !== GODL_OBSERVATION_SOURCE_COMMIT) fail();
  address(snapshot.wallet);
  const slot = uint(snapshot.context?.slot), at = instant(snapshot.observedAt), bounds = dayBounds(at, timeZone);
  const cache = await readCache(cachePath);
  if (!cache) return undefined;
  const miner = (await deriveAddresses(snapshot.wallet)).miner.address;
  if (cache.wallet !== snapshot.wallet || cache.miner !== miner || snapshot.accounts?.miner?.address !== miner
      || snapshot.accounts?.miner?.status !== 'present') fail();
  if (cache.timeZone !== timeZone || cache.day !== bounds.day) return undefined;
  await validateTransactions(cache);
  const p = cache.published;
  return p && instant(p.throughAt) <= at && BigInt(p.throughSlot) <= BigInt(slot) ? structuredClone(p) : undefined;
}

/** Optional enrichment; only a proven complete local day prefix is publishable. */
export async function refreshDailyMining({ snapshot, timeZone, cachePath, rpcUrl, fetchImpl = fetch,
  nowMs = Date.now(), maxTransactions = 20, requestDelayMs = 250, budgetMs = 10000, readDeployment = readProgramDeployment }) {
  if (!snapshot || snapshot.commitment !== 'finalized' || snapshot.genesisHash !== MAINNET_GENESIS
      || snapshot.programAddress !== GODL_PROGRAM_ADDRESS || snapshot.sourceCommit !== GODL_OBSERVATION_SOURCE_COMMIT
      || !Number.isSafeInteger(nowMs) || nowMs < 0 || !Number.isSafeInteger(maxTransactions) || maxTransactions < 1 || maxTransactions > 100
      || !Number.isSafeInteger(requestDelayMs) || requestDelayMs < 0 || requestDelayMs > 10000
      || !Number.isSafeInteger(budgetMs) || budgetMs < 1 || budgetMs > 10000) fail();
  address(snapshot.wallet);
  const throughAt = snapshot.observedAt, throughSlot = uint(snapshot.context?.slot), at = instant(throughAt);
  if (!Number.isSafeInteger(Number(throughSlot)) || BigInt(throughSlot) < BigInt(DEPLOYED)) fail();
  const bounds = dayBounds(at, timeZone), derived = await deriveAddresses(snapshot.wallet), miner = derived.miner.address;
  if (snapshot.accounts?.miner?.address !== miner || snapshot.accounts?.miner?.status !== 'present') fail();
  const identity = { schemaVersion: 1, kind: 'godl-daily-mining-cache', wallet: snapshot.wallet, miner,
    genesisHash: snapshot.genesisHash, programAddress: snapshot.programAddress, sourceCommit: snapshot.sourceCommit,
    deployedAtSlot: DEPLOYED, timeZone, ...bounds };
  let cache = await readCache(cachePath);
  if (cache && ['wallet', 'miner', 'genesisHash', 'programAddress', 'sourceCommit', 'deployedAtSlot'].some(k => cache[k] !== identity[k])) fail();
  if (cache) await validateTransactions(cache);
  if (cache && (cache.day !== bounds.day || cache.timeZone !== timeZone)) cache = undefined;
  cache ??= { ...identity, checkedAtMs: 0, retryAfterMs: 0, transactions: {} };
  const publication = () => cache.published && instant(cache.published.throughAt) <= at
    && BigInt(cache.published.throughSlot) <= BigInt(throughSlot) ? structuredClone(cache.published) : undefined;
  if (cache.retryAfterMs > nowMs || !cache.pending && cache.published && nowMs - cache.checkedAtMs < 60000) return publication();
  if (cache.pending && (instant(cache.pending.throughAt) > at || BigInt(cache.pending.throughSlot) > BigInt(throughSlot))) return publication();
  let sequence = 0, lastRequestMs;
  const deadline = performance.now() + budgetMs;
  const remaining = () => deadline - performance.now();
  const requireTime = () => { if (remaining() <= 0) throw new WorkBudgetExhausted(); };
  const endpoint = httpsEndpoint(rpcUrl);
  const pacedFetch = async (url, options) => {
    requireTime();
    if (lastRequestMs !== undefined) {
      const delay = Math.max(0, requestDelayMs - (Date.now() - lastRequestMs));
      if (delay >= remaining()) throw new WorkBudgetExhausted();
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    requireTime();
    lastRequestMs = Date.now();
    // The deadline signal stays attached through fetch response body consumption.
    const signal = AbortSignal.any([options.signal, AbortSignal.timeout(Math.max(1, Math.ceil(remaining())))]);
    return boundedFetch(fetchImpl, url, { ...options, signal });
  };
  async function rpc(method, params) {
    const id = ++sequence, response = await pacedFetch(endpoint.href, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }), signal: AbortSignal.timeout(10000) });
    if (!response.ok) fail();
    const raw = await response.text();
    if (Buffer.byteLength(raw) > MAX_BYTES) fail();
    const body = parseRpcJson(raw);
    if (body.id !== id || body.jsonrpc !== '2.0' || body.error || !Object.hasOwn(body, 'result')) fail();
    return body.result;
  }
  async function deployment() {
    if ((await readDeployment({ rpcUrl, fetchImpl: pacedFetch, minContextSlot: throughSlot })).deployedAtSlot !== DEPLOYED) fail();
  }
  try {
    await deployment();
    if (await rpc('getGenesisHash', []) !== MAINNET_GENESIS) fail();
    if (!cache.pending) {
      const rows = [], seen = new Set(); let previous, before, boundary;
      let complete = false;
      for (let page = 0; page < 8 && !complete; page++) {
        const result = await rpc('getSignaturesForAddress', [miner, { commitment: 'finalized', minContextSlot: Number(throughSlot), limit: 1000, ...(before ? { before } : {}) }]);
        if (!Array.isArray(result) || result.length > 1000) fail();
        for (const item of result) {
          const row = indexed(item);
          if (seen.has(row.signature) || seen.size >= MAX_SIGNATURES || previous && (BigInt(row.slot) > BigInt(previous.slot) || row.blockTime > previous.blockTime)) fail();
          seen.add(row.signature); previous = row;
          if (BigInt(row.slot) <= BigInt(throughSlot)) {
            if (row.blockTime * 1000 > at) fail();
            if (row.blockTime * 1000 >= instant(bounds.fromAt)) rows.push(row);
            if (row.blockTime * 1000 < instant(bounds.fromAt)) { boundary ??= row; complete = true; }
          }
        }
        if (complete) break;
        // Short/empty provider history can be pruned; it proves no day boundary.
        if (result.length < 1000) fail();
        before = previous?.signature;
        if (!before) fail();
      }
      if (!complete) fail();
      if (cache.publishedTarget?.rows.some(previous => !rows.some(row => row.signature === previous.signature))) fail();
      cache.pending = { throughAt, throughSlot, rows, boundary };
      // Reuse only signatures admitted by the newly frozen day target.
      cache.transactions = Object.fromEntries(rows.filter(r => cache.transactions[r.signature]).map(r => [r.signature, cache.transactions[r.signature]]));
      await save(cachePath, cache);
    }
    let fetched = 0;
    for (const row of cache.pending.rows) {
      const existing = cache.transactions[row.signature];
      if (existing) { if (existing.slot !== row.slot || existing.blockTime !== row.blockTime || JSON.stringify(existing.err) !== JSON.stringify(row.err)) fail(); continue; }
      if (row.err !== null) { cache.transactions[row.signature] = { signature: row.signature, slot: row.slot, blockTime: row.blockTime, err: row.err, baseUnits: '0', checkpointCount: 0 }; continue; }
      if (fetched >= maxTransactions) break;
      fetched++;
      const tx = await rpc('getTransaction', [row.signature, { commitment: 'finalized', encoding: 'json', maxSupportedTransactionVersion: 0 }]);
      if (!tx || tx.transaction?.signatures?.[0] !== row.signature || uint(tx.slot) !== row.slot
          || tx.blockTime !== row.blockTime || !tx.meta || tx.meta.err !== null || !transactionKeys(tx).includes(miner)) fail();
      const decoded = await decodeMiningRewards(tx, { miner, programAddress: GODL_PROGRAM_ADDRESS, sourceCommit: GODL_OBSERVATION_SOURCE_COMMIT });
      if (decoded.status !== 'observed' || decoded.sourceCommit !== GODL_OBSERVATION_SOURCE_COMMIT || !Array.isArray(decoded.events)) fail();
      cache.transactions[row.signature] = { signature: row.signature, slot: row.slot, blockTime: row.blockTime,
        err: null, result: tx, baseUnits: uint(decoded.totalBaseUnits), checkpointCount: decoded.checkpointCount ?? decoded.events.length };
    }
    if (cache.pending.rows.every(r => cache.transactions[r.signature])) {
      await deployment();
      let total = 0n, checkpointCount = 0;
      for (const row of cache.pending.rows) {
        const tx = cache.transactions[row.signature]; total += BigInt(tx.baseUnits); checkpointCount += tx.checkpointCount;
        if (total > U64_MAX) fail();
      }
      const { throughAt: targetAt, throughSlot: targetSlot, rows } = cache.pending;
      cache.published = { schemaVersion: 1, ...Object.fromEntries(['wallet', 'genesisHash', 'programAddress', 'sourceCommit', 'deployedAtSlot', 'day', 'timeZone', 'fromAt'].map(k => [k, cache[k]])),
        throughAt: targetAt, throughSlot: targetSlot, unrefinedBaseUnits: total.toString(), transactionCount: rows.length, checkpointCount };
      cache.publishedTarget = cache.pending;
      delete cache.pending; cache.checkedAtMs = nowMs;
    }
    cache.retryAfterMs = 0;
    await save(cachePath, cache);
    return publication();
  } catch (error) {
    // No provider/error text enters the cache or the UI. Prior publication stays dated.
    cache.retryAfterMs = error instanceof WorkBudgetExhausted || remaining() <= 0 ? 0 : nowMs + 60000;
    await save(cachePath, cache);
    return publication();
  }
}
