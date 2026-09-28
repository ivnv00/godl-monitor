import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GODL_MINT, XAUT0_MINT, loadMarketQuotes, parseDexScreenerPairs } from './market-quotes.mjs';

const NOW = Date.parse('2026-09-27T12:00:00.000Z');
const pair = (mint, overrides = {}) => ({ chainId: 'solana', dexId: 'orca', pairAddress: `pair-${mint.slice(0, 4)}`,
  baseToken: { address: mint }, quoteToken: { address: 'USDC' }, priceUsd: '12.3400',
  liquidity: { usd: 20_000 }, volume: { h24: 500 }, ...overrides });
const response = body => ({ ok: true, json: async () => body });
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'godl-market-quotes-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const cache = join(root, 'cache');
  await mkdir(cache);
  return join(cache, 'quotes.json');
}

test('fetches both exact mints, chooses deepest pair deterministically, and writes a private cache', async t => {
  const cachePath = await fixture(t); let request;
  const body = [pair(GODL_MINT, { pairAddress: 'z', liquidity: { usd: 30_000 }, priceUsd: '2.01' }),
    pair(GODL_MINT, { pairAddress: 'a', liquidity: { usd: 30_000 }, priceUsd: '2.02' }), pair(XAUT0_MINT)];
  const result = await loadMarketQuotes({ cachePath, nowMs: NOW, fetchImpl: async (url, options) => {
    request = { url, options }; return response(body);
  }});
  assert.match(request.url, new RegExp(`${GODL_MINT},${XAUT0_MINT}$`));
  assert.equal(request.options.signal.constructor.name, 'AbortSignal');
  assert.equal(result.observedAt, '2026-09-27T12:00:00.000Z');
  assert.equal(result.expiresAt, '2026-09-27T12:10:00.000Z');
  assert.equal(result.source, 'DEX Screener');
  assert.equal(result.reason, null);
  assert.deepEqual(result.quotes.map(x => [x.asset, x.priceUsd, x.pairAddress]),
    [['GODL', '2.02', 'a'], ['XAUt0', '12.3400', `pair-${XAUT0_MINT.slice(0, 4)}`]]);
  assert.equal((await stat(cachePath)).mode & 0o777, 0o600);
  assert.equal(JSON.parse(await readFile(cachePath, 'utf8')).failedAttemptAt, null);
});

test('uses a valid cache for five minutes without fetching', async t => {
  const cachePath = await fixture(t); let calls = 0;
  const fetchImpl = async () => { calls++; return response([pair(GODL_MINT), pair(XAUT0_MINT)]); };
  await loadMarketQuotes({ cachePath, nowMs: NOW, fetchImpl });
  const cached = await loadMarketQuotes({ cachePath, nowMs: NOW + 299_999, fetchImpl });
  assert.equal(calls, 1);
  assert.equal(cached.observedAt, '2026-09-27T12:00:00.000Z');
});

test('rejects wrong-chain, wrong-mint, and quote-side appearances', () => {
  const body = [pair(GODL_MINT, { chainId: 'ethereum' }), pair('different', { quoteToken: { address: GODL_MINT } }),
    pair(XAUT0_MINT)];
  assert.deepEqual(parseDexScreenerPairs(body).map(quote => quote.asset), ['XAUt0']);
});

test('retains an independently valid GODL quote when the gold quote is missing', async t => {
  const cachePath = await fixture(t); let calls = 0;
  const fetchImpl = async () => { calls++; return response([pair(GODL_MINT),
    pair(XAUT0_MINT, { liquidity: { usd: 9_999 } })]); };
  const result = await loadMarketQuotes({ cachePath, nowMs: NOW, fetchImpl });
  assert.deepEqual(result.quotes.map(quote => quote.asset), ['GODL']);
  assert.match(result.reason, /XAUt0/);
  const cached = await loadMarketQuotes({ cachePath, nowMs: NOW + 299_999, fetchImpl });
  assert.equal(calls, 1);
  assert.deepEqual(cached, result);
});

test('rejects threshold failures and invalid decimal prices while accepting exact boundaries', () => {
  const invalidPrices = ['0', '-1', '1e3', 'NaN', 'Infinity', 12.3];
  for (const priceUsd of invalidPrices)
    assert.deepEqual(parseDexScreenerPairs([pair(GODL_MINT, { priceUsd }), pair(XAUT0_MINT)])
      .map(quote => quote.asset), ['XAUt0']);
  assert.deepEqual(parseDexScreenerPairs([pair(GODL_MINT, { liquidity: { usd: 9_999 } }), pair(XAUT0_MINT)])
    .map(quote => quote.asset), ['XAUt0']);
  assert.deepEqual(parseDexScreenerPairs([pair(GODL_MINT, { volume: { h24: 99 } }), pair(XAUT0_MINT)])
    .map(quote => quote.asset), ['XAUt0']);
  assert.equal(parseDexScreenerPairs([pair(GODL_MINT, { liquidity: { usd: 10_000 }, volume: { h24: 100 } }),
    pair(XAUT0_MINT)])[0].priceUsd, '12.3400');
  assert.deepEqual(parseDexScreenerPairs([pair(GODL_MINT, { priceUsd: `${'1'.repeat(29)}.${'2'.repeat(31)}` }),
    pair(XAUT0_MINT)]).map(quote => quote.asset), ['XAUt0']);
  const normalized = parseDexScreenerPairs([pair(GODL_MINT, { liquidity: { usd: 1e21 }, volume: { h24: 1e20 } }),
    pair(XAUT0_MINT)]);
  assert.equal(normalized[0].liquidityUsd, '1000000000000000000000');
  assert.equal(normalized[0].volume24hUsd, '100000000000000000000');
});

test('records HTTP response receipt time when a clock function is supplied', async t => {
  const cachePath = await fixture(t); const ticks = [NOW, NOW + 2_000];
  const result = await loadMarketQuotes({ cachePath, nowMs: () => ticks.shift(),
    fetchImpl: async () => response([pair(GODL_MINT), pair(XAUT0_MINT)]) });
  assert.equal(result.observedAt, '2026-09-27T12:00:02.000Z');
  assert.equal(result.expiresAt, '2026-09-27T12:10:02.000Z');
});

test('refresh failure retains stale quotes, records the attempt, and throttles retries for five minutes', async t => {
  const cachePath = await fixture(t); let calls = 0;
  await loadMarketQuotes({ cachePath, nowMs: NOW, fetchImpl: async () => response([pair(GODL_MINT), pair(XAUT0_MINT)]) });
  const failing = async () => { calls++; throw new Error('secret upstream detail'); };
  const stale = await loadMarketQuotes({ cachePath, nowMs: NOW + 600_001, fetchImpl: failing });
  assert.equal(stale.expiresAt, '2026-09-27T12:10:00.000Z');
  assert.equal(stale.quotes.length, 2);
  assert.match(stale.reason, /refresh failed/);
  const throttled = await loadMarketQuotes({ cachePath, nowMs: NOW + 600_001 + 299_999, fetchImpl: failing });
  assert.equal(calls, 1);
  assert.deepEqual(throttled, stale);
  assert.equal(JSON.parse(await readFile(cachePath, 'utf8')).failedAttemptAt, '2026-09-27T12:10:00.001Z');
});

test('corrupt and future caches are ignored and a total fetch failure returns a generic unavailable result', async t => {
  const cachePath = await fixture(t); let calls = 0;
  await writeFile(cachePath, '{broken');
  const corrupt = await loadMarketQuotes({ cachePath, nowMs: NOW, fetchImpl: async () => { calls++; throw new Error('token=private'); }});
  assert.equal(corrupt.quotes.length, 0);
  assert.match(corrupt.reason, /request failed/);
  assert.doesNotMatch(corrupt.reason, /private/);
  await loadMarketQuotes({ cachePath, nowMs: NOW + 100, fetchImpl: async () => { calls++; throw new Error('again'); }});
  assert.equal(calls, 1);

  const future = { schemaVersion: 1, observedAt: new Date(NOW + 1).toISOString(),
    expiresAt: new Date(NOW + 600_001).toISOString(), source: 'DEX Screener',
    quotes: parseDexScreenerPairs([pair(GODL_MINT), pair(XAUT0_MINT)]), reason: null, failedAttemptAt: null };
  await writeFile(cachePath, JSON.stringify(future));
  const recovered = await loadMarketQuotes({ cachePath, nowMs: NOW, fetchImpl: async () => { calls++; return response([pair(GODL_MINT), pair(XAUT0_MINT)]); }});
  assert.equal(calls, 2);
  assert.equal(recovered.reason, null);
  assert.equal(recovered.observedAt, '2026-09-27T12:00:00.000Z');
});

test('allowFetch false never calls the network and invalid configuration never throws', async t => {
  const cachePath = await fixture(t); let calls = 0;
  const result = await loadMarketQuotes({ cachePath, nowMs: NOW, allowFetch: false,
    fetchImpl: async () => { calls++; throw new Error('should not run'); } });
  assert.equal(calls, 0);
  assert.deepEqual(result.quotes, []);
  assert.match(result.reason, /no valid cache/);
  assert.deepEqual((await loadMarketQuotes({ cachePath: null })).quotes, []);
});

test('rejects exponent-form and noncanonical metadata loaded from cache', async t => {
  const cachePath = await fixture(t);
  const quotes = parseDexScreenerPairs([pair(GODL_MINT), pair(XAUT0_MINT)]);
  quotes[0].liquidityUsd = '1e5';
  await writeFile(cachePath, JSON.stringify({ schemaVersion: 1, observedAt: new Date(NOW).toISOString(),
    expiresAt: new Date(NOW + 600_000).toISOString(), source: 'DEX Screener', quotes,
    reason: null, failedAttemptAt: null }));
  const result = await loadMarketQuotes({ cachePath, nowMs: NOW, allowFetch: false });
  assert.deepEqual(result.quotes, []);
  assert.match(result.reason, /no valid cache/);
  quotes[0].liquidityUsd = '10000.0';
  await writeFile(cachePath, JSON.stringify({ schemaVersion: 1, observedAt: new Date(NOW).toISOString(),
    expiresAt: new Date(NOW + 600_000).toISOString(), source: 'DEX Screener', quotes,
    reason: null, failedAttemptAt: null }));
  assert.deepEqual((await loadMarketQuotes({ cachePath, nowMs: NOW, allowFetch: false })).quotes, []);
});
