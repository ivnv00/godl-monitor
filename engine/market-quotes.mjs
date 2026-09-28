import { chmod, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export const GODL_MINT = 'GodL6KZ9uuUoQwELggtVzQkKmU1LfqmDokPibPeDKkhF';
export const XAUT0_MINT = 'AymATz4TCL9sWNEEV9Kvyz45CHVhDZ6kUgjTJPzLpU9P';

const SOURCE = 'DEX Screener';
const CACHE_MS = 5 * 60 * 1000;
const EXPIRES_MS = 10 * 60 * 1000;
const URL = `https://api.dexscreener.com/tokens/v1/solana/${GODL_MINT},${XAUT0_MINT}`;
const ASSETS = new Map([[GODL_MINT, 'GODL'], [XAUT0_MINT, 'XAUt0']]);
const DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

const unavailable = reason => ({ observedAt: null, expiresAt: null, source: SOURCE, quotes: [], reason });
const time = value => typeof value === 'string' ? Date.parse(value) : NaN;
const decimalPrice = value => typeof value === 'string' && value.length <= 60 && DECIMAL.test(value)
  && (value.split('.')[1]?.length ?? 0) <= 30 && /[1-9]/.test(value) && Number.isFinite(Number(value));
const metadata = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;

function plainDecimal(value) {
  if (!metadata(value)) return null;
  if (Object.is(value, -0)) return '0';
  const [coefficient, exponentText] = String(value).toLowerCase().split('e');
  if (exponentText === undefined) return coefficient;
  const exponent = Number(exponentText), [integer, fraction = ''] = coefficient.split('.');
  const digits = `${integer}${fraction}`, point = integer.length + exponent;
  if (point <= 0) return `0.${'0'.repeat(-point)}${digits}`;
  if (point >= digits.length) return `${digits}${'0'.repeat(point - digits.length)}`;
  return `${digits.slice(0, point)}.${digits.slice(point)}`;
}

function missingReason(quotes) {
  const present = new Set(quotes.map(quote => quote.asset));
  const missing = [...ASSETS.values()].filter(asset => !present.has(asset));
  return missing.length ? `Missing qualifying DEX Screener quotes: ${missing.join(', ')}.` : null;
}

const decimalMetadata = value => typeof value === 'string' && DECIMAL.test(value)
  && metadata(Number(value)) && plainDecimal(Number(value)) === value;

function comparePairs(left, right) {
  const liquidity = right.liquidity.usd - left.liquidity.usd;
  if (liquidity !== 0) return liquidity;
  return String(left.pairAddress).localeCompare(String(right.pairAddress))
    || String(left.dexId).localeCompare(String(right.dexId));
}

/** Parse only exact requested base-token pairs and select the deepest qualifying pool. */
export function parseDexScreenerPairs(value) {
  if (!Array.isArray(value)) return [];
  const selected = [];
  for (const [mint, asset] of ASSETS) {
    const pair = value.filter(candidate => candidate && candidate.chainId === 'solana'
      && candidate.baseToken?.address === mint
      && typeof candidate.pairAddress === 'string' && candidate.pairAddress.length > 0
      && typeof candidate.dexId === 'string' && candidate.dexId.length > 0
      && decimalPrice(candidate.priceUsd)
      && metadata(candidate.liquidity?.usd) && candidate.liquidity.usd >= 10_000
      && metadata(candidate.volume?.h24) && candidate.volume.h24 >= 100)
      .sort(comparePairs)[0];
    if (!pair) continue;
    selected.push({
      asset, mint, priceUsd: pair.priceUsd, pairAddress: pair.pairAddress, dexId: pair.dexId,
      liquidityUsd: plainDecimal(pair.liquidity.usd), volume24hUsd: plainDecimal(pair.volume.h24),
    });
  }
  return selected;
}

function validQuote(quote, mint, asset) {
  return quote && quote.asset === asset && quote.mint === mint && decimalPrice(quote.priceUsd)
    && typeof quote.pairAddress === 'string' && quote.pairAddress.length > 0
    && typeof quote.dexId === 'string' && quote.dexId.length > 0
    && decimalMetadata(quote.liquidityUsd)
    && Number(quote.liquidityUsd) >= 10_000
    && decimalMetadata(quote.volume24hUsd)
    && Number(quote.volume24hUsd) >= 100;
}

function validateCache(value, nowMs) {
  if (!value || value.schemaVersion !== 1 || value.source !== SOURCE || !Array.isArray(value.quotes)) return null;
  const failed = value.failedAttemptAt == null ? null : time(value.failedAttemptAt);
  if (value.failedAttemptAt != null && (!Number.isFinite(failed) || failed > nowMs)) return null;
  if (value.reason !== null && typeof value.reason !== 'string') return null;
  const observed = time(value.observedAt), expires = time(value.expiresAt);
  if (value.observedAt === null && value.expiresAt === null && value.quotes.length === 0
    && typeof value.reason === 'string' && failed !== null)
    return { ...value, observedMs: null, failedAttemptMs: failed };
  if (!Number.isFinite(observed) || !Number.isFinite(expires) || observed > nowMs
    || expires !== observed + EXPIRES_MS || value.quotes.length > ASSETS.size) return null;
  let quoteIndex = 0;
  for (const [mint, asset] of ASSETS) {
    const quote = value.quotes[quoteIndex];
    if (quote?.asset === asset) {
      if (!validQuote(quote, mint, asset)) return null;
      quoteIndex++;
    }
  }
  if (quoteIndex !== value.quotes.length) return null;
  return { ...value, observedMs: observed, failedAttemptMs: failed };
}

const publicValue = value => ({ observedAt: value.observedAt, expiresAt: value.expiresAt,
  source: SOURCE, quotes: value.quotes, reason: value.reason });

async function readCache(cachePath, nowMs) {
  try {
    const value = validateCache(JSON.parse(await readFile(cachePath, 'utf8')), nowMs);
    if (value) await chmod(cachePath, 0o600);
    return value;
  } catch { return null; }
}

async function writeCache(cachePath, value) {
  const temporary = `${cachePath}.${process.pid}.${randomUUID()}.tmp`;
  let file;
  try {
    await mkdir(dirname(cachePath), { recursive: true, mode: 0o700 });
    file = await open(temporary, 'wx', 0o600);
    await file.writeFile(`${JSON.stringify(value, null, 2)}\n`);
    await file.sync();
    await file.close();
    file = null;
    await rename(temporary, cachePath);
    await chmod(cachePath, 0o600);
  } catch {
    try { await file?.close(); } catch {}
    try { await unlink(temporary); } catch {}
  }
}

/** Load exact-mint quotes, refreshing observations older than five minutes. */
export async function loadMarketQuotes({ cachePath, nowMs = Date.now, fetchImpl = fetch, allowFetch = true }) {
  try {
    const clock = typeof nowMs === 'function' ? nowMs : () => nowMs;
    const checkedAt = clock();
    if (typeof cachePath !== 'string' || cachePath.length === 0 || !Number.isFinite(checkedAt))
      return unavailable('Market quotes unavailable: invalid cache configuration.');
    const cached = await readCache(cachePath, checkedAt);
    if (cached && checkedAt - cached.observedMs < CACHE_MS) return publicValue(cached);
    if (!allowFetch) return cached ? publicValue(cached) : unavailable('Market quotes unavailable: no valid cache.');
    if (cached?.failedAttemptMs != null && checkedAt - cached.failedAttemptMs < CACHE_MS) return publicValue(cached);

    try {
      const response = await fetchImpl(URL, {
        headers: { accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(5000),
      });
      if (!response?.ok) throw new Error('request failed');
      const body = await response.json();
      if (!Array.isArray(body)) throw new Error('invalid response');
      const quotes = parseDexScreenerPairs(body);
      const receivedAt = clock(), observedAt = new Date(receivedAt).toISOString();
      const result = { schemaVersion: 1, observedAt,
        expiresAt: new Date(receivedAt + EXPIRES_MS).toISOString(), source: SOURCE, quotes,
        reason: missingReason(quotes), failedAttemptAt: null };
      await writeCache(cachePath, result);
      return publicValue(result);
    } catch {
      const reason = cached
        ? 'DEX Screener refresh failed; cached quotes retained.'
        : 'Market quotes unavailable: DEX Screener request failed.';
      const failedAt = clock();
      const failed = cached
        ? { ...publicValue(cached), schemaVersion: 1, reason, failedAttemptAt: new Date(failedAt).toISOString() }
        : { ...unavailable(reason), schemaVersion: 1, failedAttemptAt: new Date(failedAt).toISOString() };
      await writeCache(cachePath, failed);
      return publicValue(failed);
    }
  } catch {
    return unavailable('Market quotes unavailable: unexpected local error.');
  }
}
