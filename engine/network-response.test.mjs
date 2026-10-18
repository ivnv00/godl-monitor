import test from 'node:test';
import assert from 'node:assert/strict';
import { readRpcConfiguration } from './rpc-config.mjs';
import { readProgramDeployment } from './accounting-service.mjs';
import { createAccountingRpcTransport } from './accounting-transport.mjs';
import { boundedFetch } from './network-response.mjs';
import { createServer } from 'node:http';
import { readWalletState } from './chain.mjs';
import { collectRecentTransactions } from './transaction-evidence.mjs';
import { collectAccountingInterval, collectHistoricalCandles } from './accounting-evidence.mjs';
import { accountingFixture } from './test-fixtures/accounting.mjs';
test('production configuration rejects plaintext HTTP', async () => {
  await assert.rejects(readRpcConfiguration(undefined, 'http://rpc.invalid/private'), { failureCode: 'configuration' });
});

for (const status of [307, 308]) {
  test(`deployment refuses ${status} without forwarding to its target`, async () => {
    const calls = [];
    await assert.rejects(readProgramDeployment({ rpcUrl: 'https://rpc.invalid/private', minContextSlot: '1',
      fetchImpl: async (url, init) => {
        calls.push(url);
        assert.equal(init.redirect, 'error');
        return new Response(null, { status, headers: { location: 'https://target.invalid/' } });
      } }), { failureCode: 'providerUnavailable' });
    assert.deepEqual(calls, ['https://rpc.invalid/private']);
  });
}

test('accounting transport rejects HTTP before sending a request', async () => {
  let calls = 0;
  const transport = createAccountingRpcTransport({ fetchImpl: async () => { calls++; return new Response('{}'); } });
  await assert.rejects(transport('http://rpc.invalid'), { failureCode: 'configuration' });
  assert.equal(calls, 0);
});


function streamed(chunks, headers = {}) {
  let cancelled = false;
  const response = new Response(new ReadableStream({
    start(controller) { for (const chunk of chunks) controller.enqueue(Buffer.from(chunk)); },
    cancel() { cancelled = true; },
  }), { headers });
  return { response, cancelled: () => cancelled };
}

test('stream byte ceiling rejects missing or false length and cancels before parsing', async () => {
  for (const headers of [{}, { 'content-length': '1' }, { 'content-encoding': 'gzip' }]) {
    const fixture = streamed(['1234', '5'], headers);
    await assert.rejects(boundedFetch(async () => fixture.response, 'https://rpc.invalid', {}, 4), { failureCode: 'invalidData' });
    assert.equal(fixture.cancelled(), true);
  }
});

test('exact limit succeeds and preserves split UTF-8 raw bytes and status headers', async () => {
  const bytes = Buffer.from('€  ');
  const response = new Response(new ReadableStream({ start(controller) {
    controller.enqueue(bytes.subarray(0, 1)); controller.enqueue(bytes.subarray(1)); controller.close();
  } }), { status: 429, headers: { 'retry-after': '2', 'content-length': String(bytes.length) } });
  const bounded = await boundedFetch(async () => response, 'https://rpc.invalid', {}, bytes.length);
  assert.equal(bounded.status, 429); assert.equal(bounded.headers.get('retry-after'), '2');
  assert.deepEqual(Buffer.from(await bounded.clone().arrayBuffer()), bytes);
  assert.equal(await bounded.text(), bytes.toString());
});

test('excessive declared length cancels without reading the body', async () => {
  let pulls = 0, cancelled = false;
  const response = new Response(new ReadableStream({ pull() { pulls++; }, cancel() { cancelled = true; } }, { highWaterMark: 0 }),
    { headers: { 'content-length': '5' } });
  await assert.rejects(boundedFetch(async () => response, 'https://rpc.invalid', {}, 4), { failureCode: 'invalidData' });
  assert.equal(pulls, 0); assert.equal(cancelled, true);
});

test('abort cancels a stalled reader even when the injected stream ignores the signal', async () => {
  const controller = new AbortController();
  let cancelled = false;
  const response = new Response(new ReadableStream({ cancel() { cancelled = true; } }));
  const pending = boundedFetch(async () => response, 'https://rpc.invalid', { signal: controller.signal }, 4);
  setImmediate(() => controller.abort());
  await assert.rejects(pending, { failureCode: 'timedOut' });
  assert.equal(cancelled, true);
  let calls = 0;
  await assert.rejects(boundedFetch(async () => { calls++; }, 'https://rpc.invalid', { signal: controller.signal }, 4),
    { failureCode: 'timedOut' });
  assert.equal(calls, 0);
});

test('injected fetch cannot hide an already-followed redirect', async () => {
  const response = new Response('{}');
  Object.defineProperty(response, 'redirected', { value: true });
  await assert.rejects(boundedFetch(async () => response, 'https://rpc.invalid'), { failureCode: 'providerUnavailable' });
});

for (const status of [429, 503, 200]) {
  test(`accounting applies the small response cap before ${status} capture or return`, async () => {
    let calls = 0, captures = 0;
    const fixture = streamed([Buffer.alloc(64 * 1024), Buffer.from('x')]);
    const response = new Response(fixture.response.body, { status });
    const transport = createAccountingRpcTransport({ minIntervalMs: 0, sleep: async () => {},
      fetchImpl: async (_url, init) => { calls++; assert.equal(init.redirect, 'error'); return response; },
      onRetryResponse: async () => { captures++; } });
    await assert.rejects(transport('https://rpc.invalid', { body: JSON.stringify({ method: 'getGenesisHash' }) }),
      { failureCode: 'invalidData' });
    assert.equal(calls, 1); assert.equal(captures, 0); assert.equal(fixture.cancelled(), true);
  });
}

test('the final retry response is capped too, after preserving a valid prior retry body', async () => {
  let calls = 0;
  const captured = [];
  const transport = createAccountingRpcTransport({ minIntervalMs: 0, sleep: async () => {}, maxAttempts: 2,
    fetchImpl: async () => ++calls === 1 ? new Response('retry', { status: 429 })
      : new Response(Buffer.alloc(64 * 1024 + 1), { status: 503 }),
    onRetryResponse: async ({ response }) => captured.push(await response.clone().text()) });
  await assert.rejects(transport('https://rpc.invalid', { body: JSON.stringify({ method: 'getGenesisHash' }) }),
    { failureCode: 'invalidData' });
  assert.equal(calls, 2); assert.deepEqual(captured, ['retry']);
});


for (const status of [307, 308]) {
  test(`native fetch does not forward a ${status} RPC body to a redirect target`, async t => {
    const paths = [];
    const server = createServer((request, response) => {
      paths.push(request.url);
      response.writeHead(status, { location: '/target' }); response.end();
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const transport = createAccountingRpcTransport({ minIntervalMs: 0,
      fetchImpl: async (_url, init) => fetch(`http://127.0.0.1:${server.address().port}/source`, init) });
    await assert.rejects(transport('https://synthetic.invalid', { method: 'POST', body: '{"wallet":"synthetic"}' }));
    assert.deepEqual(paths, ['/source']);
  });

  test(`observation, recent history, interval and candles reject injected ${status} responses`, async () => {
    const fixture = await accountingFixture();
    const requests = [], captured = [];
    const fetchImpl = async (url, init) => {
      assert.equal(new URL(url).protocol, 'https:'); assert.equal(init.redirect, 'error'); requests.push(url);
      return new Response(null, { status, headers: { location: 'https://target.invalid/' } });
    };
    const onResponse = async record => captured.push(record);
    await assert.rejects(readWalletState({ wallet: fixture.wallet, rpcUrl: 'https://rpc.invalid', fetchImpl }),
      { failureCode: 'providerUnavailable' });
    await assert.rejects(collectRecentTransactions({ wallet: fixture.wallet, rpcUrl: 'https://rpc.invalid', fetchImpl, onResponse }),
      { failureCode: 'providerUnavailable' });
    await assert.rejects(collectAccountingInterval({ wallet: fixture.wallet, opening: fixture.interval.opening,
      closing: fixture.interval.closing, rpcUrl: 'https://rpc.invalid', fetchImpl, onResponse }),
      { failureCode: 'providerUnavailable' });
    await assert.rejects(collectHistoricalCandles({ minutes: [0], nowMs: 120000, fetchImpl, onResponse }),
      { failureCode: 'providerUnavailable' });
    assert.ok(requests.every(url => !url.includes('target.invalid'))); assert.deepEqual(captured, []);
  });
}

test('many tiny chunks preserve the exact body within the same byte ceiling', async () => {
  let remaining = 4096;
  const response = new Response(new ReadableStream({ pull(controller) {
    if (!remaining--) { controller.close(); return; }
    controller.enqueue(Uint8Array.of(120));
  } }, { highWaterMark: 0 }));
  const bounded = await boundedFetch(async () => response, 'https://rpc.invalid', {}, 4096);
  assert.equal(await bounded.text(), 'x'.repeat(4096));
});

test('accounting transport preserves a caller abort instead of replacing it with its retry timeout', async () => {
  let calls = 0;
  const transport = createAccountingRpcTransport({ fetchImpl: async () => { calls++; return new Response('{}'); } });
  await assert.rejects(transport('https://rpc.invalid', { signal: AbortSignal.abort() }), { failureCode: 'timedOut' });
  assert.equal(calls, 0);
});
