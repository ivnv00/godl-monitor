import { open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { address } from '@solana/addresses';
import { deriveAddresses, GODL_PROGRAM_ADDRESS, GODL_OBSERVATION_SOURCE_COMMIT } from './chain.mjs';
import { MAINNET_GENESIS } from './monitor.mjs';
import { writeAtomicJson } from './accounting-service.mjs';
import { projectRewardBalances } from './reward-balances.mjs';

const DEPLOYED = '457407037', MAX_BYTES = 128 * 1024;
const U64 = (1n << 64n) - 1n, I64 = 1n << 63n, FIXED = (1n << 127n) - 1n;
const IDENTITY = ['wallet', 'miner', 'minerExtended', 'genesisHash', 'programAddress', 'sourceCommit', 'deployedAtSlot'];
const fail = () => { throw new Error('Daily yield evidence unavailable'); };
function uint(value, max = U64) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value) || value.length > 39 || BigInt(value) > max) fail();
  return value;
}
function marker(value) {
  if (typeof value !== 'string' || !/^(0|-?[1-9]\d*)$/.test(value) || value.length > 20
      || BigInt(value) < -I64 || BigInt(value) >= I64) fail();
  return value;
}
function factor(value) {
  if (value?.fractionalBits !== 48) fail();
  return uint(value.rawBits, FIXED);
}
function instant(value) {
  const at = Date.parse(value);
  if (typeof value !== 'string' || !Number.isSafeInteger(at) || at < 0 || new Date(at).toISOString() !== value) fail();
  return at;
}
function bounds(at, timeZone) {
  if (typeof timeZone !== 'string' || timeZone.length > 100) fail();
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, calendar: 'iso8601', year: 'numeric', month: '2-digit', day: '2-digit' });
  const dayAt = ms => {
    const parts = Object.fromEntries(formatter.formatToParts(ms).map(p => [p.type, p.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
  const day = dayAt(at);
  let low = at - 48 * 3600000, high = at;
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (dayAt(mid) < day) low = mid; else high = mid;
  }
  return { day, fromAt: new Date(high).toISOString() };
}
function identity(value) {
  if (!value || value.genesisHash !== MAINNET_GENESIS || value.programAddress !== GODL_PROGRAM_ADDRESS
      || value.sourceCommit !== GODL_OBSERVATION_SOURCE_COMMIT || value.deployedAtSlot !== DEPLOYED) fail();
  for (const k of ['wallet', 'miner', 'minerExtended']) address(value[k]);
}
function sameIdentity(left, right) {
  if (IDENTITY.some(k => left[k] !== right[k])) fail();
}
function dated(value) {
  const day = bounds(instant(value.fromAt), value.timeZone);
  if (day.day !== value.day || day.fromAt !== value.fromAt) fail();
}
function opening(value) {
  identity(value); dated(value);
  if (value.schemaVersion !== 1 || value.kind !== 'godl-daily-yield-opening'
      || typeof value.proofHash !== 'string' || !/^[a-f0-9]{64}$/.test(value.proofHash)) fail();
  if (BigInt(uint(value.verifiedThroughSlot)) < BigInt(DEPLOYED) || instant(value.evidenceAt) < instant(value.fromAt)) fail();
  if (value.refined !== undefined) { uint(value.refined.openingBaseUnits); marker(value.refined.lastClaimGodlAt);
    if (BigInt(value.refined.lastClaimGodlAt) >= BigInt(instant(value.fromAt) / 1000)) fail(); }
  if (value.gold !== undefined) uint(value.gold.openingBaseUnits);
  return value;
}
async function readBounded(path) {
  let file;
  try {
    file = await open(path, 'r');
    const size = (await file.stat()).size;
    if (!Number.isSafeInteger(size) || size > MAX_BYTES) fail();
    const bytes = Buffer.alloc(size + 1); let length = 0;
    while (length < bytes.length) {
      const { bytesRead } = await file.read(bytes, length, bytes.length - length, length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > size) fail();
    return JSON.parse(bytes.subarray(0, length).toString('utf8'));
  } catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
  finally { await file?.close(); }
}
async function save(path, value) {
  if (Buffer.byteLength(JSON.stringify(value, null, 2)) + 1 > MAX_BYTES) fail();
  await writeAtomicJson(path, value);
}
async function observe(snapshot, timeZone) {
  if (!snapshot || snapshot.commitment !== 'finalized') fail();
  const derived = await deriveAddresses(snapshot.wallet);
  const id = { ...Object.fromEntries(IDENTITY.map(k => [k, snapshot[k]])),
    miner: derived.miner.address, minerExtended: derived.minerExtended.address, deployedAtSlot: DEPLOYED };
  identity(id);
  const at = instant(snapshot.observedAt), slot = uint(snapshot.context?.slot);
  if (BigInt(slot) < BigInt(DEPLOYED)) fail();
  const accounts = snapshot.accounts;
  for (const name of ['miner', 'minerExtended', 'treasury', 'goldVault']) {
    const account = accounts?.[name];
    if (account && (account.address !== derived[name].address || !['present', 'missing'].includes(account.status))) fail();
    if (account?.status === 'present' && ['miner', 'minerExtended'].includes(name) && account.value?.authority !== snapshot.wallet) fail();
  }
  const result = { ...id, observedAt: snapshot.observedAt, slot, ...bounds(at, timeZone), timeZone };
  const miner = accounts?.miner?.status === 'present' ? accounts.miner.value : undefined;
  if (!miner) return result;
  uint(miner.rewardsGodl); uint(miner.refinedGodl); marker(miner.lastClaimGodlAt); factor(miner.rewardsFactor);
  const treasury = accounts?.treasury?.status === 'present' ? accounts.treasury.value : undefined;
  const extended = accounts?.minerExtended?.status === 'present' ? accounts.minerExtended.value : undefined;
  const vault = accounts?.goldVault?.status === 'present' ? accounts.goldVault.value : undefined;
  // Project each asset separately: a missing/regressed factor in one asset must
  // not remove a valid independently covered result for the other asset.
  if (treasury) {
    const rewardFactor = factor(treasury.minerRewardsFactor);
    try {
      const projected = projectRewardBalances({ ...snapshot, accounts: { miner: accounts.miner, treasury: accounts.treasury } });
      result.refined = { baseUnits: projected.refinedGodl.baseUnits, factor: rewardFactor, lastClaimGodlAt: miner.lastClaimGodlAt };
    } catch { /* Unsupported settlement remains unknown. */ }
  }
  if (extended) { uint(extended.xautRewards); uint(extended.lifetimeXaut); factor(extended.xautRewardsFactor); }
  if (extended && vault) {
    const rewardFactor = factor(vault.xautRewardsFactor);
    try {
      const projected = projectRewardBalances({ ...snapshot, accounts: { miner: accounts.miner, minerExtended: accounts.minerExtended, goldVault: accounts.goldVault } });
      result.gold = { baseUnits: projected.rewardObservation.cumulativeGoldBaseUnits, factor: rewardFactor };
    } catch { /* Unsupported settlement remains unknown. */ }
  }
  return result;
}
function validateSample(sample, cache) {
  sameIdentity(sample, cache); dated(sample);
  if (sample.timeZone !== cache.timeZone || BigInt(uint(sample.slot)) < BigInt(DEPLOYED)
      || bounds(instant(sample.observedAt), sample.timeZone).day !== sample.day) fail();
  for (const asset of ['refined', 'gold']) if (sample[asset] !== undefined) {
    uint(sample[asset].baseUnits); uint(sample[asset].factor, FIXED);
    if (asset === 'refined') marker(sample[asset].lastClaimGodlAt);
  }
  if (sample.blockTime !== undefined && (!Number.isSafeInteger(sample.blockTime) || sample.blockTime < 0
      || !Number.isSafeInteger(sample.blockTime * 1000) || sample.blockTime * 1000 > instant(sample.observedAt))) fail();
}
function validateCache(cache) {
  identity(cache);
  if (cache.schemaVersion !== 1 || cache.kind !== 'godl-daily-yield-cache') fail();
  validateSample(cache.latest, cache);
  if (cache.pending !== undefined) {
    dated({ ...cache.pending, timeZone: cache.timeZone });
    validateSample(cache.pending.before, cache);
    if (!Number.isSafeInteger(cache.pending.retryAfterMs) || cache.pending.retryAfterMs < 0
        || instant(cache.latest.observedAt) - instant(cache.pending.before.observedAt) > 48 * 3600000
        || BigInt(cache.pending.before.slot) > BigInt(cache.latest.slot)
        || instant(cache.pending.before.observedAt) > instant(cache.latest.observedAt)) fail();
  }
  if (cache.proof !== undefined) {
    const { before, after, proofHash } = cache.proof;
    validateSample(before, cache); validateSample(after, cache);
    if (before.blockTime === undefined || after.blockTime === undefined || BigInt(before.slot) >= BigInt(after.slot)
        || before.blockTime * 1000 >= instant(after.fromAt) || after.blockTime * 1000 < instant(after.fromAt)
        || instant(before.observedAt) > instant(after.observedAt)
        || instant(after.observedAt) - instant(before.observedAt) > 48 * 3600000
        || BigInt(after.slot) > BigInt(cache.latest.slot) || instant(after.observedAt) > instant(cache.latest.observedAt)
        || proofHash !== hashProof(before, after)) fail();
  }
  return cache;
}
function publication(current, boundary) {
  if (boundary === undefined) return undefined;
  opening(boundary); sameIdentity(current, boundary);
  if (boundary.timeZone !== current.timeZone) fail();
  if (boundary.day !== current.day || instant(boundary.evidenceAt) > instant(current.observedAt)
      || BigInt(boundary.verifiedThroughSlot) > BigInt(current.slot)) return undefined;
  const summary = { schemaVersion: 1, ...Object.fromEntries(IDENTITY.map(k => [k, current[k]])),
    proofHash: boundary.proofHash, day: current.day, timeZone: current.timeZone, fromAt: current.fromAt,
    throughAt: current.observedAt, throughSlot: current.slot };
  for (const asset of ['refined', 'gold']) {
    const start = boundary[asset], end = current[asset];
    if (!start || !end || BigInt(end.baseUnits) < BigInt(start.openingBaseUnits)) continue;
    if (asset === 'refined' && (start.lastClaimGodlAt !== end.lastClaimGodlAt
        || BigInt(end.lastClaimGodlAt) >= BigInt(instant(current.fromAt) / 1000))) continue;
    summary[asset] = { baseUnits: (BigInt(end.baseUnits) - BigInt(start.openingBaseUnits)).toString(),
      openingBaseUnits: start.openingBaseUnits, closingBaseUnits: end.baseUnits,
      ...(asset === 'refined' ? { lastClaimGodlAt: end.lastClaimGodlAt } : {}) };
  }
  return summary.refined || summary.gold ? summary : undefined;
}

/** Offline, bounded publication from a private verified midnight opening. */
export async function loadDailyYield({ snapshot, timeZone, boundaryPath }) {
  return publication(await observe(snapshot, timeZone), await readBounded(boundaryPath));
}

const hashProof = (before, after) => createHash('sha256').update(JSON.stringify({ before, after })).digest('hex');
async function blockTime(sample, rpcUrl, fetchImpl, id) {
  if (sample.blockTime !== undefined) return sample.blockTime;
  if (!Number.isSafeInteger(Number(sample.slot))) fail();
  const endpoint = new URL(rpcUrl);
  if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) fail();
  const signal = AbortSignal.timeout(2000);
  let timer;
  try {
    return await Promise.race([(async () => {
      const response = await fetchImpl(endpoint.href, { method: 'POST', headers: { 'content-type': 'application/json' }, signal,
        body: JSON.stringify({ jsonrpc: '2.0', id, method: 'getBlockTime', params: [Number(sample.slot)] }) });
      if (!response?.ok) fail();
      let raw = '';
      if (response.body?.getReader) {
        const reader = response.body.getReader(); let length = 0;
        try {
          for (;;) { const item = await reader.read(); if (item.done) break;
            length += item.value.byteLength; if (length > MAX_BYTES) fail(); raw += Buffer.from(item.value).toString('utf8'); }
        } finally { await reader.cancel().catch(() => {}); }
      } else { raw = await response.text(); if (Buffer.byteLength(raw) > MAX_BYTES) fail(); }
      const payload = JSON.parse(raw), time = payload?.result;
      if (payload.id !== id || payload.jsonrpc !== '2.0' || payload.error || !Number.isSafeInteger(time) || time < 0
          || !Number.isSafeInteger(time * 1000) || time * 1000 > instant(sample.observedAt)) fail();
      return time;
    })(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Daily yield block time unavailable')), 2000); })]);
  } finally { clearTimeout(timer); }
}

/** Normal polls only retain a compact private sample. Across midnight, equal
 * factors and equal projected balances prove zero yield in the unsampled gap. */
export async function refreshDailyYield({ snapshot, timeZone, boundaryPath, cachePath, rpcUrl, fetchImpl = fetch }) {
  const current = await observe(snapshot, timeZone), boundary = await readBounded(boundaryPath);
  const existing = publication(current, boundary); // Validate before any mutation.
  let cache = await readBounded(cachePath);
  if (cache !== undefined) {
    validateCache(cache); sameIdentity(current, cache);
    if (cache.timeZone !== timeZone) fail();
    if (BigInt(cache.latest.slot) > BigInt(current.slot) || instant(cache.latest.observedAt) > instant(current.observedAt)) return existing;
  }
  let pending = cache?.pending?.day === current.day ? cache.pending : undefined;
  const before = pending?.before ?? cache?.latest;
  const transition = before && BigInt(before.slot) < BigInt(current.slot)
    && (pending || instant(before.fromAt) < instant(current.fromAt) || before.blockTime !== undefined && before.blockTime * 1000 < instant(current.fromAt))
    && instant(current.observedAt) - instant(before.observedAt) <= 48 * 3600000;
  let captured;
  if (transition && !existing && (!pending || pending.retryAfterMs <= instant(current.observedAt))) {
    pending = { day: current.day, fromAt: current.fromAt, before, retryAfterMs: 0 };
    try {
      before.blockTime = await blockTime(before, rpcUrl, fetchImpl, 1);
      current.blockTime = await blockTime(current, rpcUrl, fetchImpl, 2);
      const midnight = instant(current.fromAt);
      if (before.blockTime * 1000 < midnight && current.blockTime * 1000 >= midnight && before.blockTime <= current.blockTime) {
        captured = { schemaVersion: 1, kind: 'godl-daily-yield-opening',
          ...Object.fromEntries(IDENTITY.map(k => [k, current[k]])), day: current.day, timeZone, fromAt: current.fromAt,
          verifiedThroughSlot: current.slot, evidenceAt: current.observedAt, proofHash: hashProof(before, current) };
        for (const asset of ['refined', 'gold']) {
          const start = before[asset], end = current[asset];
          if (!start || !end || start.factor !== end.factor || start.baseUnits !== end.baseUnits) continue;
          if (asset === 'refined' && (start.lastClaimGodlAt !== end.lastClaimGodlAt || BigInt(end.lastClaimGodlAt) >= BigInt(midnight / 1000))) continue;
          captured[asset] = { openingBaseUnits: end.baseUnits, ...(asset === 'refined' ? { lastClaimGodlAt: end.lastClaimGodlAt } : {}) };
        }
        if (!captured.refined && !captured.gold) captured = undefined;
        pending = undefined; // The gap was examined; unequal factors stay unknown.
      } else if (current.blockTime * 1000 < midnight) {
        pending.before = current; // Its actual finalized chain time is still before midnight.
      } else {
        pending = undefined;
      }
    } catch { pending.retryAfterMs = instant(current.observedAt) + 60000; }
  }
  if (existing || pending && instant(current.observedAt) - instant(pending.before.observedAt) > 48 * 3600000) pending = undefined;
  const proof = captured ? { before, after: current, proofHash: captured.proofHash } : cache?.proof;
  cache = { schemaVersion: 1, kind: 'godl-daily-yield-cache',
    ...Object.fromEntries(IDENTITY.map(k => [k, current[k]])), timeZone, latest: current,
    ...(pending ? { pending } : {}),
    ...(proof && instant(current.observedAt) - instant(proof.before.observedAt) <= 48 * 3600000 ? { proof } : {}) };
  validateCache(cache);
  await save(cachePath, cache);
  if (captured) { opening(captured); await save(boundaryPath, captured); }
  return publication(current, captured ?? boundary);
}
