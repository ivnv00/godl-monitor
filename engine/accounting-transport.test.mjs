import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountingRpcTransport } from './accounting-transport.mjs';

test('serializes and paces concurrent RPC calls', async () => {
  let clock = 1000;
  const starts = [];
  const sleeps = [];
  let releaseFirst;
  const firstFinished = new Promise(resolve => { releaseFirst = resolve; });
  let calls = 0;
  const transport = createAccountingRpcTransport({
    minIntervalMs: 250,
    nowMs: () => clock,
    sleep: async delay => { sleeps.push(delay); clock += delay; },
    fetchImpl: async () => {
      starts.push(clock);
      calls += 1;
      if (calls === 1) await firstFinished;
      return new Response('{}', { status: 200 });
    },
  });
  const first = transport('https://rpc.invalid', { method: 'POST' });
  const second = transport('https://rpc.invalid', { method: 'POST' });
  await Promise.resolve();
  assert.equal(starts.length, 1);
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(starts, [1000, 1250]);
  assert.deepEqual(sleeps, [250]);
});

test('honors bounded Retry-After and creates a fresh timeout signal per attempt', async () => {
  let clock = Date.parse('2026-09-24T12:00:00.000Z');
  const sleeps = [];
  const signals = [];
  const retried = [];
  const statuses = [429, 503, 200];
  const transport = createAccountingRpcTransport({
    minIntervalMs: 0,
    maxAttempts: 4,
    baseRetryMs: 400,
    maxRetryDelayMs: 1500,
    requestTimeoutMs: 1234,
    nowMs: () => clock,
    sleep: async delay => { sleeps.push(delay); clock += delay; },
    onRetryResponse: async event => retried.push([event.attempt, event.response.status]),
    fetchImpl: async (_input, init) => {
      signals.push(init.signal);
      const status = statuses.shift();
      const headers = status === 429 ? { 'retry-after': '9' } : {};
      return new Response('{}', { status, headers });
    },
  });
  const deadSignal = new AbortController().signal;
  const response = await transport('https://rpc.invalid', { signal: deadSignal });
  assert.equal(response.status, 200);
  assert.deepEqual(retried, [[1, 429], [2, 503]]);
  assert.deepEqual(sleeps, [1500, 800]);
  assert.equal(signals.length, 3);
  assert.ok(signals.every(signal => signal !== deadSignal));
  assert.equal(new Set(signals).size, 3);
});

test('returns the final retryable response after the bounded attempt count', async () => {
  let calls = 0;
  const transport = createAccountingRpcTransport({
    minIntervalMs: 0,
    maxAttempts: 3,
    sleep: async () => {},
    fetchImpl: async () => { calls += 1; return new Response('{}', { status: 500 }); },
  });
  assert.equal((await transport('https://rpc.invalid')).status, 500);
  assert.equal(calls, 3);
});
