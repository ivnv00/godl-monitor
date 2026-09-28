import { address } from '@solana/addresses';
import { createHash } from 'node:crypto';
import { deriveAddresses, GODL_PROGRAM_ADDRESS, GODL_SOURCE_COMMIT } from './chain.mjs';
import { parseRpcJson, projectTransaction } from './transaction-evidence.mjs';

const SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;
const TRACKED_ROLES = ['wallet', 'miner', 'minerExtended', 'automation', 'automationV2'];
const OWNED_ROLES = TRACKED_ROLES.slice(1);
const COINBASE_CANDLES = 'https://api.exchange.coinbase.com/products/SOL-USD/candles';

function fail(message) { throw new Error(message); }

function uint(value, name) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value);
  if (typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value)) return value;
  fail(`${name} must be a lossless unsigned integer`);
}

function rpcNumber(value, name) {
  const exact = uint(value, name);
  const number = Number(exact);
  if (!Number.isSafeInteger(number)) fail(`${name} exceeds the RPC safe-integer range`);
  return number;
}

function validSignature(value) {
  if (typeof value !== 'string' || !SIGNATURE.test(value)) fail('invalid transaction signature');
  return value;
}

function comparable(value) {
  if (Array.isArray(value)) return value.map(comparable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, comparable(value[key])]));
  }
  return value;
}

const jsonKey = value => JSON.stringify(comparable(value));
const sha256 = value => createHash('sha256').update(value).digest('hex');

function rpcEndpoint(rpcUrl) {
  const endpoint = new URL(rpcUrl);
  if (!['https:', 'http:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) {
    fail('RPC URL must use http(s) without userinfo credentials');
  }
  endpoint.hash = '';
  return {
    endpoint,
    source: {
      rpcOrigin: endpoint.origin,
      endpointSha256: sha256(endpoint.href),
      endpointDetails: 'path and query omitted to protect provider credentials',
    },
  };
}

function createRpc({ rpcUrl, fetchImpl, onResponse, requestTimeoutMs, cache }) {
  if (typeof fetchImpl !== 'function') fail('fetchImpl must be a function');
  if (typeof onResponse !== 'function') fail('onResponse must be a function');
  if (cache !== undefined && (typeof cache?.get !== 'function' || typeof cache?.set !== 'function')) {
    fail('cache must provide async get and set functions');
  }
  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 1 || requestTimeoutMs > 60000) {
    fail('requestTimeoutMs must be 1..60000');
  }
  const { endpoint, source } = rpcEndpoint(rpcUrl);
  let sequence = 0;
  const rpc = async (method, params) => {
    const id = ++sequence;
    const cacheable = method === 'getBlock' || method === 'getTransaction';
    const cacheKey = cacheable ? sha256(endpoint.href + method + JSON.stringify(params)) : null;
    if (cacheable && cache) {
      const cached = await cache.get(cacheKey);
      if (cached !== null && cached !== undefined) {
        if (!cached || cached.method !== method || jsonKey(cached.params) !== jsonKey(params)
            || cached.source?.endpointSha256 !== source.endpointSha256
            || typeof cached.raw !== 'string' || cached.sha256 !== sha256(cached.raw)) {
          fail(`invalid cached ${method} evidence`);
        }
        const body = parseRpcJson(cached.raw);
        if (body?.id !== cached.id || body?.jsonrpc !== '2.0' || body.error
            || !Object.hasOwn(body, 'result') || body.result === null) {
          fail(`invalid cached ${method} RPC response`);
        }
        await onResponse({ ...cached, cacheHit: true });
        return body.result;
      }
    }
    const response = await fetchImpl(endpoint.href, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    if (!response || typeof response.text !== 'function') fail('RPC fetch returned an invalid response');
    const raw = await response.text();
    let body;
    try { body = parseRpcJson(raw); } catch (error) {
      await onResponse({ id, method, params, source, httpStatus: response.status ?? null,
        observedAt: new Date().toISOString(), sha256: sha256(raw), raw });
      throw error;
    }
    const record = { id, method, params, source, httpStatus: response.status ?? null,
      observedAt: new Date().toISOString(), sha256: sha256(raw), raw };
    await onResponse(record);
    if (!response.ok) fail(`RPC HTTP ${response.status ?? 'unknown'}`);
    if (body?.id !== id || body?.jsonrpc !== '2.0') fail('RPC response identity mismatch');
    if (body.error) fail(`RPC ${method} failed (code ${body.error.code ?? 'unknown'})`);
    if (!Object.hasOwn(body, 'result')) fail('RPC result missing');
    if (cacheable && cache && body.result !== null) await cache.set(cacheKey, record);
    return body.result;
  };
  return { rpc, source };
}

function validateSnapshot(snapshot, label, wallet, trackedAccounts) {
  if (!snapshot || snapshot.wallet !== wallet || snapshot.commitment !== 'finalized') {
    fail(`${label} snapshot wallet or commitment mismatch`);
  }
  if (snapshot.programAddress !== GODL_PROGRAM_ADDRESS || snapshot.sourceCommit !== GODL_SOURCE_COMMIT) {
    fail(`${label} snapshot program identity mismatch`);
  }
  for (const role of OWNED_ROLES) {
    if (snapshot.accounts?.[role]?.address !== trackedAccounts[role]) {
      fail(`${label} snapshot ${role} address mismatch`);
    }
  }
  return rpcNumber(snapshot.context?.slot, `${label} snapshot slot`);
}

function normalizeIndexedRow(row) {
  if (!row || typeof row !== 'object') fail('malformed signature row');
  const normalized = {
    signature: validSignature(row.signature),
    slot: uint(row.slot, 'indexed slot'),
    blockTime: row.blockTime,
    err: row.err,
    confirmationStatus: row.confirmationStatus,
  };
  if (!Object.hasOwn(row, 'err')) fail('indexed outcome missing');
  if (row.confirmationStatus !== 'finalized') fail('non-finalized signature');
  if (!Number.isSafeInteger(row.blockTime) || row.blockTime < 0) fail('invalid indexed block time');
  if (Object.hasOwn(row, 'transactionIndex')) {
    if (!Number.isSafeInteger(row.transactionIndex) || row.transactionIndex < 0) fail('invalid indexed transaction index');
    normalized.transactionIndex = row.transactionIndex;
  }
  return normalized;
}

function sameIndexedEvidence(left, right) {
  return left.slot === right.slot && left.blockTime === right.blockTime
    && jsonKey(left.err) === jsonKey(right.err)
    && (!Object.hasOwn(left, 'transactionIndex') || !Object.hasOwn(right, 'transactionIndex')
      || left.transactionIndex === right.transactionIndex);
}

function outerPrograms(result) {
  const message = result.transaction.message;
  const loaded = result.meta.loadedAddresses;
  const keys = [...message.accountKeys, ...(loaded?.writable ?? []), ...(loaded?.readonly ?? [])];
  return message.instructions.map(instruction => {
    if (!Number.isSafeInteger(instruction.programIdIndex)
        || instruction.programIdIndex < 0 || instruction.programIdIndex >= keys.length) {
      fail('invalid outer program index');
    }
    return address(keys[instruction.programIdIndex]);
  });
}

export async function collectAccountingInterval({ wallet, opening, closing,
  rpcUrl = 'https://api.mainnet-beta.solana.com', fetchImpl = globalThis.fetch,
  onResponse = async () => {}, pageSize = 1000, maxPages = 50, requestTimeoutMs = 10000, cache }) {
  const walletAddress = address(wallet);
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 1000) fail('pageSize must be 1..1000');
  if (!Number.isSafeInteger(maxPages) || maxPages < 1) fail('maxPages must be a positive safe integer');

  const derived = await deriveAddresses(walletAddress);
  const trackedAccounts = {
    wallet: walletAddress,
    miner: derived.miner.address,
    minerExtended: derived.minerExtended.address,
    automation: derived.automation.address,
    automationV2: derived.automationV2.address,
  };
  const from = validateSnapshot(opening, 'opening', walletAddress, trackedAccounts);
  const through = validateSnapshot(closing, 'closing', walletAddress, trackedAccounts);
  if (opening.genesisHash !== closing.genesisHash || !opening.genesisHash) fail('snapshot genesis mismatch');
  if (through < from) fail('closing snapshot slot precedes opening snapshot slot');

  const { rpc, source } = createRpc({ rpcUrl, fetchImpl, onResponse, requestTimeoutMs, cache });
  const pages = {};
  const indexed = new Map();

  for (const role of TRACKED_ROLES) {
    const rows = [];
    const seen = new Set();
    let before;
    let priorLastSlot = null;
    let exhausted = false;
    for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
      const options = { commitment: 'finalized', limit: pageSize, minContextSlot: through };
      if (before !== undefined) options.before = before;
      const result = await rpc('getSignaturesForAddress', [trackedAccounts[role], options]);
      if (!Array.isArray(result) || result.length > pageSize) fail(`invalid ${role} signature page`);
      if (result.length === 0) { exhausted = true; break; }

      let previousSlot = null;
      const validated = result.map(normalizeIndexedRow);
      for (const row of validated) {
        const slot = BigInt(row.slot);
        if (seen.has(row.signature)) fail(`duplicate or non-progressing ${role} signature page`);
        if (previousSlot !== null && slot > previousSlot) fail(`unordered ${role} signature page`);
        previousSlot = slot;
        seen.add(row.signature);

        const existing = indexed.get(row.signature);
        if (existing && !sameIndexedEvidence(existing, row)) fail('conflicting signature evidence across tracked accounts');
        if (slot > BigInt(from) && slot <= BigInt(through)) {
          rows.push(row);
          const merged = { ...(existing ?? row) };
          if (!Object.hasOwn(merged, 'transactionIndex') && Object.hasOwn(row, 'transactionIndex')) {
            merged.transactionIndex = row.transactionIndex;
          }
          indexed.set(row.signature, { ...merged, roles: [...(existing?.roles ?? []), role] });
        }
      }
      const firstSlot = BigInt(validated[0].slot);
      if (priorLastSlot !== null && firstSlot > priorLastSlot) fail(`cross-page ordering increased for ${role}`);
      priorLastSlot = BigInt(validated.at(-1).slot);
      const nextBefore = validated.at(-1).signature;
      if (nextBefore === before) fail(`non-progressing ${role} pagination cursor`);
      before = nextBefore;
      if (priorLastSlot <= BigInt(from)) { exhausted = true; break; }
    }
    if (!exhausted) fail(`${role} signature history page cap exhausted before the opening slot`);
    pages[role] = { address: trackedAccounts[role], rows, exhausted: true };
  }

  const required = [...indexed.values()].filter(row => row.err === null || row.roles.includes('wallet'));
  const blocks = new Map();
  for (const slot of [...new Set(required.map(row => row.slot))]) {
    const result = await rpc('getBlock', [rpcNumber(slot, 'block slot'), {
      commitment: 'finalized', transactionDetails: 'signatures', rewards: false,
      maxSupportedTransactionVersion: 0,
    }]);
    if (!result || !Array.isArray(result.signatures) || !Number.isSafeInteger(result.blockTime) || result.blockTime < 0) {
      fail(`missing or malformed finalized block ${slot}`);
    }
    const positions = new Map();
    result.signatures.forEach((entry, index) => {
      const signature = validSignature(entry);
      if (positions.has(signature)) fail(`duplicate signature in finalized block ${slot}`);
      positions.set(signature, index);
    });
    blocks.set(slot, { blockTime: result.blockTime, positions });
  }

  const transactions = [];
  for (const row of required) {
    const block = blocks.get(row.slot);
    const transactionIndex = block.positions.get(row.signature);
    if (transactionIndex === undefined) fail(`indexed signature missing from finalized block: ${row.signature}`);
    if (block.blockTime !== row.blockTime) fail('indexed/block time mismatch');
    if (Object.hasOwn(row, 'transactionIndex') && row.transactionIndex !== transactionIndex) {
      fail('indexed/block transaction index mismatch');
    }
    const result = await rpc('getTransaction', [row.signature, {
      commitment: 'finalized', encoding: 'json', maxSupportedTransactionVersion: 0,
    }]);
    const projected = projectTransaction(result, {
      wallet: walletAddress, trackedAccounts, expectedSignature: row.signature, expectedSlot: row.slot,
    });
    if (projected.status !== 'observed') fail(`required transaction unavailable: ${row.signature}`);
    if (projected.blockTime !== row.blockTime || projected.blockTime !== block.blockTime) fail('transaction block time mismatch');
    if (jsonKey(projected.error) !== jsonKey(row.err)) fail('indexed/transaction outcome mismatch');
    if (row.roles.some(role => projected.deltas[role]?.status !== 'observed')) {
      fail('indexed tracked account missing from transaction');
    }
    if (Object.hasOwn(result, 'transactionIndex') && result.transactionIndex !== transactionIndex) {
      fail('transaction/block transaction index mismatch');
    }
    transactions.push({ ...projected, outerPrograms: outerPrograms(result), transactionIndex });
  }
  transactions.sort((left, right) => {
    const slotOrder = BigInt(left.slot) - BigInt(right.slot);
    return slotOrder < 0n ? -1 : slotOrder > 0n ? 1 : left.transactionIndex - right.transactionIndex;
  });

  return {
    fromExclusiveSlot: String(from),
    toInclusiveSlot: String(through),
    trackedAccounts,
    pages,
    transactions,
    closing,
    source,
  };
}

function candleSource() {
  const endpoint = new URL(COINBASE_CANDLES);
  return {
    apiOrigin: endpoint.origin,
    endpointSha256: sha256(endpoint.href),
    endpoint: '/products/SOL-USD/candles',
  };
}

function validateCandle(row) {
  if (!Array.isArray(row) || row.length !== 6 || !Number.isSafeInteger(row[0]) || row[0] < 0 || row[0] % 60 !== 0) {
    fail('invalid Coinbase candle row');
  }
  if (row.slice(1).some(value => typeof value !== 'number' || !Number.isFinite(value))) fail('invalid Coinbase candle number');
  if (row.slice(1, 5).some(value => value <= 0) || row[5] < 0) fail('invalid Coinbase candle values');
  return row;
}

export async function collectHistoricalCandles({ minutes, fetchImpl = globalThis.fetch,
  onResponse = async () => {}, nowMs = Date.now() }) {
  if (!Array.isArray(minutes)) fail('minutes must be an array');
  if (typeof fetchImpl !== 'function' || typeof onResponse !== 'function') fail('invalid candle collector callback');
  if (!Number.isFinite(nowMs) || nowMs < 0) fail('nowMs must be a non-negative finite number');
  const requested = [...new Set(minutes.map((minute, index) => {
    if (!Number.isSafeInteger(minute) || minute < 0 || minute % 60 !== 0) fail(`minutes[${index}] must be a minute epoch`);
    if ((minute + 60) * 1000 > nowMs) fail(`minute ${minute} is not yet closed`);
    if (!Number.isFinite(new Date(minute * 1000).getTime())) fail(`minute ${minute} is outside the date range`);
    return minute;
  }))].sort((a, b) => a - b);
  const source = candleSource();
  if (requested.length === 0) return { candles: [], source };

  const windows = [];
  for (const minute of requested) {
    const current = windows.at(-1);
    if (!current || minute - current.start >= 250 * 60) windows.push({ start: minute, end: minute });
    else current.end = minute;
  }
  const observed = new Map();
  for (let index = 0; index < windows.length; index += 1) {
    const window = windows[index];
    const url = new URL(COINBASE_CANDLES);
    url.searchParams.set('granularity', '60');
    url.searchParams.set('start', new Date(window.start * 1000).toISOString());
    url.searchParams.set('end', new Date((window.end + 60) * 1000).toISOString());
    const response = await fetchImpl(url.href, { method: 'GET', headers: { accept: 'application/json' } });
    if (!response || typeof response.text !== 'function') fail('Coinbase fetch returned an invalid response');
    const raw = await response.text();
    await onResponse({ id: index + 1, method: 'GET', source, url: url.href,
      httpStatus: response.status ?? null, observedAt: new Date().toISOString(), sha256: sha256(raw), raw });
    if (!response.ok) fail(`Coinbase candles HTTP ${response.status ?? 'unknown'}`);
    let body;
    try { body = JSON.parse(raw); } catch { fail('Coinbase candles returned invalid JSON'); }
    if (!Array.isArray(body)) fail('Coinbase candles response must be an array');
    for (const candle of body) {
      validateCandle(candle);
      const existing = observed.get(candle[0]);
      if (existing && jsonKey(existing) !== jsonKey(candle)) fail(`conflicting Coinbase candle for minute ${candle[0]}`);
      observed.set(candle[0], candle);
    }
  }
  const candles = requested.map(minute => {
    const candle = observed.get(minute);
    if (!candle) fail(`missing Coinbase candle for minute ${minute}`);
    return candle;
  });
  return { candles, source };
}
