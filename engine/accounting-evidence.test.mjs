import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { getAddressDecoder } from '@solana/addresses';
import { collectAccountingInterval, collectHistoricalCandles } from './accounting-evidence.mjs';
import { deriveAddresses, GODL_PROGRAM_ADDRESS, GODL_SOURCE_COMMIT } from './chain.mjs';
import { claimFixture } from './test-fixtures/claim-evidence.mjs';

const wallet = getAddressDecoder().decode(Buffer.alloc(32, 7));
const signatures = {
  newest: '2'.repeat(88),
  sameSlot: '3'.repeat(88),
  older: '4'.repeat(88),
  boundary: '5'.repeat(88),
  unrelated: '6'.repeat(88),
};

function response(request, result, { error } = {}) {
  const body = error
    ? { jsonrpc: '2.0', id: request.id, error }
    : { jsonrpc: '2.0', id: request.id, result };
  return Response.json(body);
}

function row(signature, slot, blockTime, transactionIndex, err = null) {
  return { signature, slot, blockTime, transactionIndex, err, confirmationStatus: 'finalized' };
}

function transaction(signature, slot, blockTime, transactionIndex, trackedAccounts) {
  const keys = [...Object.values(trackedAccounts), GODL_PROGRAM_ADDRESS];
  return {
    slot,
    blockTime,
    transactionIndex,
    version: 'legacy',
    transaction: {
      signatures: [signature],
      message: {
        accountKeys: keys,
        instructions: [{ programIdIndex: keys.length - 1, accounts: [0, 1], data: '4' }],
      },
    },
    meta: {
      err: null,
      fee: 5000,
      preBalances: keys.map(() => 10000),
      postBalances: keys.map(() => 10000),
      innerInstructions: [],
      loadedAddresses: { writable: [], readonly: [] },
    },
  };
}

async function fixtures() {
  const derived = await deriveAddresses(wallet);
  const trackedAccounts = {
    wallet,
    miner: derived.miner.address,
    minerExtended: derived.minerExtended.address,
    automation: derived.automation.address,
    automationV2: derived.automationV2.address,
  };
  const snapshot = slot => ({
    wallet,
    programAddress: GODL_PROGRAM_ADDRESS,
    sourceCommit: GODL_SOURCE_COMMIT,
    genesisHash: 'test-genesis',
    commitment: 'finalized',
    context: { slot: String(slot) },
    accounts: Object.fromEntries(Object.entries(trackedAccounts).filter(([role]) => role !== 'wallet')
      .map(([role, publicKey]) => [role, { address: publicKey, status: 'missing' }])),
  });
  const indexedRows = [
    row(signatures.newest, 12, 1200, 2),
    row(signatures.sameSlot, 12, 1200, 1),
    row(signatures.older, 11, 1100, 0),
    row(signatures.boundary, 10, 1000, 0),
  ];
  const transactions = new Map([
    [signatures.newest, transaction(signatures.newest, 12, 1200, 2, trackedAccounts)],
    [signatures.sameSlot, transaction(signatures.sameSlot, 12, 1200, 1, trackedAccounts)],
    [signatures.older, transaction(signatures.older, 11, 1100, 0, trackedAccounts)],
  ]);
  return { trackedAccounts, opening: snapshot(10), closing: snapshot(12), indexedRows, transactions };
}

function rpcFetch(fixture, mutate = () => {}) {
  const calls = [];
  const fetchImpl = async (_url, init) => {
    const request = JSON.parse(init.body);
    calls.push(request);
    if (request.method === 'getSignaturesForAddress') {
      const role = Object.entries(fixture.trackedAccounts).find(([, publicKey]) => publicKey === request.params[0])?.[0];
      const page = request.params[1].before === undefined
        ? fixture.indexedRows.slice(0, 2)
        : fixture.indexedRows.slice(2);
      const value = structuredClone(page);
      mutate({ request, role, value, fixture });
      return response(request, value);
    }
    if (request.method === 'getBlock') {
      const slot = request.params[0];
      const value = slot === 12
        ? { blockTime: 1200, signatures: [signatures.unrelated, signatures.sameSlot, signatures.newest] }
        : { blockTime: 1100, signatures: [signatures.older] };
      mutate({ request, value, fixture });
      return response(request, value);
    }
    if (request.method === 'getTransaction') {
      const value = structuredClone(fixture.transactions.get(request.params[0]) ?? null);
      const holder = { request, value, fixture };
      mutate(holder);
      return response(request, holder.value);
    }
    throw new Error(`unexpected RPC method ${request.method}`);
  };
  return { calls, fetchImpl };
}

test('paginates every tracked role, excludes the opening slot, and orders same-slot transactions by finalized block', async () => {
  const fixture = await fixtures();
  const evidence = [];
  const { calls, fetchImpl } = rpcFetch(fixture);
  const result = await collectAccountingInterval({
    wallet, opening: fixture.opening, closing: fixture.closing, pageSize: 2,
    fetchImpl, onResponse: async item => evidence.push(item),
  });
  assert.equal(calls.filter(call => call.method === 'getSignaturesForAddress').length, 10);
  assert.ok(calls.filter(call => call.method === 'getSignaturesForAddress')
    .every(call => call.params[1].minContextSlot === 12 && call.params[1].commitment === 'finalized'));
  assert.ok(calls.filter(call => call.method === 'getBlock')
    .every(call => !Object.hasOwn(call.params[1], 'minContextSlot')));
  assert.deepEqual(result.transactions.map(tx => tx.signature), [
    signatures.older, signatures.sameSlot, signatures.newest,
  ]);
  assert.deepEqual(result.transactions.map(tx => tx.transactionIndex), [0, 1, 2]);
  assert.ok(result.transactions.every(tx => tx.outerPrograms[0] === GODL_PROGRAM_ADDRESS));
  assert.ok(Object.values(result.pages).every(page => page.exhausted && page.rows.length === 3));
  assert.ok(Object.values(result.pages).every(page => page.rows.every(item => item.slot !== '10')));
  assert.equal(result.fromExclusiveSlot, '10');
  assert.equal(result.toInclusiveSlot, '12');
  assert.equal(evidence.length, calls.length);
  assert.ok(evidence.every(item => /^[a-f0-9]{64}$/.test(item.sha256)));
});

test('rejects a page cap before any role reaches the opening fence', async () => {
  const fixture = await fixtures();
  const { fetchImpl } = rpcFetch(fixture);
  await assert.rejects(collectAccountingInterval({
    wallet, opening: fixture.opening, closing: fixture.closing,
    pageSize: 2, maxPages: 1, fetchImpl,
  }), /page cap exhausted/);
});

test('rejects a required null transaction and never caches it', async () => {
  const fixture = await fixtures();
  fixture.transactions.set(signatures.newest, null);
  const { fetchImpl } = rpcFetch(fixture);
  const stored = new Map();
  const cache = { get: async key => stored.get(key) ?? null, set: async (key, value) => stored.set(key, value) };
  await assert.rejects(collectAccountingInterval({
    wallet, opening: fixture.opening, closing: fixture.closing, pageSize: 2, fetchImpl, cache,
  }), /required transaction unavailable/);
  assert.ok([...stored.values()].every(record => record.method === 'getBlock'));
});

test('rejects inconsistent evidence for one signature across tracked roles', async () => {
  const fixture = await fixtures();
  const { fetchImpl } = rpcFetch(fixture, ({ request, role, value }) => {
    if (request.method === 'getSignaturesForAddress' && role === 'miner' && !request.params[1].before) {
      value[0].blockTime += 1;
    }
  });
  await assert.rejects(collectAccountingInterval({
    wallet, opening: fixture.opening, closing: fixture.closing, pageSize: 2, fetchImpl,
  }), /conflicting signature evidence/);
});

test('requires the finalized block to prove each transaction index', async () => {
  const fixture = await fixtures();
  const { fetchImpl } = rpcFetch(fixture, holder => {
    if (holder.request.method === 'getBlock' && holder.request.params[0] === 12) {
      holder.value.signatures = [signatures.unrelated, signatures.newest, signatures.sameSlot];
    }
  });
  await assert.rejects(collectAccountingInterval({
    wallet, opening: fixture.opening, closing: fixture.closing, pageSize: 2, fetchImpl,
  }), /indexed\/block transaction index mismatch/);
});

test('rejects unsafe snapshot slots before issuing RPC requests', async () => {
  const fixture = await fixtures();
  fixture.closing.context.slot = '9007199254740992';
  let called = false;
  await assert.rejects(collectAccountingInterval({
    wallet, opening: fixture.opening, closing: fixture.closing,
    fetchImpl: async () => { called = true; },
  }), /safe-integer range/);
  assert.equal(called, false);
});

test('journals hash-verifiable raw RPC errors but redacts their thrown message', async () => {
  const fixture = await fixtures();
  const records = [];
  const secret = 'provider-secret-detail';
  let thrown;
  try {
    await collectAccountingInterval({
      wallet, opening: fixture.opening, closing: fixture.closing,
      fetchImpl: async (_url, init) => {
        const request = JSON.parse(init.body);
        return response(request, null, { error: { code: -32000, message: secret, data: { secret } } });
      },
      onResponse: async item => records.push(item),
    });
  } catch (error) { thrown = error; }
  assert.match(thrown?.message ?? '', /RPC getSignaturesForAddress failed \(code -32000\)/);
  assert.equal(records.length, 1);
  assert.doesNotMatch(thrown.message, /provider-secret-detail/);
  const original = JSON.stringify({ jsonrpc: '2.0', id: 1,
    error: { code: -32000, message: secret, data: { secret } } });
  assert.equal(records[0].raw, original);
  assert.equal(records[0].sha256, createHash('sha256').update(original).digest('hex'));
});

test('reuses only finalized block and transaction details while refetching signature pages', async () => {
  const fixture = await fixtures();
  const stored = new Map();
  const cache = {
    get: async key => stored.get(key) ?? null,
    set: async (key, record) => stored.set(key, structuredClone(record)),
  };
  const first = rpcFetch(fixture);
  await collectAccountingInterval({
    wallet, opening: fixture.opening, closing: fixture.closing,
    pageSize: 2, fetchImpl: first.fetchImpl, cache,
  });
  assert.equal(stored.size, 5);
  assert.deepEqual([...stored.values()].map(record => record.method).sort(),
    ['getBlock', 'getBlock', 'getTransaction', 'getTransaction', 'getTransaction']);
  assert.ok([...stored.values()].every(record => record.sha256 === createHash('sha256').update(record.raw).digest('hex')));

  const second = rpcFetch(fixture);
  const responses = [];
  const result = await collectAccountingInterval({
    wallet, opening: fixture.opening, closing: fixture.closing,
    pageSize: 2, fetchImpl: second.fetchImpl, cache,
    onResponse: async record => responses.push(record),
  });
  assert.deepEqual(result.transactions.map(tx => tx.signature),
    [signatures.older, signatures.sameSlot, signatures.newest]);
  assert.equal(second.calls.length, 10);
  assert.ok(second.calls.every(call => call.method === 'getSignaturesForAddress'));
  assert.equal(responses.filter(record => record.cacheHit).length, 5);
  for (const hit of responses.filter(record => record.cacheHit)) {
    const original = [...stored.values()].find(record => record.method === hit.method
      && JSON.stringify(record.params) === JSON.stringify(hit.params));
    assert.equal(hit.raw, original.raw);
    assert.equal(hit.observedAt, original.observedAt);
  }
});

test('does not cache an RPC error from a cacheable finalized detail request', async () => {
  const fixture = await fixtures();
  const base = rpcFetch(fixture);
  const stored = new Map();
  const cache = { get: async key => stored.get(key) ?? null, set: async (key, record) => stored.set(key, record) };
  const fetchImpl = async (url, init) => {
    const request = JSON.parse(init.body);
    if (request.method === 'getBlock') {
      return response(request, null, { error: { code: -32001, message: 'temporary provider failure' } });
    }
    return base.fetchImpl(url, init);
  };
  await assert.rejects(collectAccountingInterval({
    wallet, opening: fixture.opening, closing: fixture.closing,
    pageSize: 2, fetchImpl, cache,
  }), /RPC getBlock failed/);
  assert.equal(stored.size, 0);
});

function candle(minute, close = 100) { return [minute, 90, 110, 95, close, 12]; }

test('collects at most 250-minute windows, deduplicates overlap, and returns only requested sorted candles', async () => {
  const records = [];
  const fetchImpl = async url => {
    const start = Date.parse(new URL(url).searchParams.get('start')) / 1000;
    const rows = start === 0
      ? [candle(15000), candle(14940), candle(60), candle(0), candle(120)]
      : [candle(15000)];
    return Response.json(rows);
  };
  const result = await collectHistoricalCandles({
    minutes: [15000, 60, 0, 14940, 60], fetchImpl,
    onResponse: async item => records.push(item), nowMs: 20000 * 1000,
  });
  assert.deepEqual(result.candles.map(row => row[0]), [0, 60, 14940, 15000]);
  assert.equal(records.length, 2);
  assert.ok(records.every(item => item.source.endpointSha256 === result.source.endpointSha256));
  assert.ok(records.every(item => item.raw && /^[a-f0-9]{64}$/.test(item.sha256)));
});

test('rejects missing historical prices and a minute that has not closed', async () => {
  await assert.rejects(collectHistoricalCandles({
    minutes: [60], nowMs: 1000 * 1000,
    fetchImpl: async () => (Response.json([candle(0)])),
  }), /missing Coinbase candle/);
  await assert.rejects(collectHistoricalCandles({
    minutes: [960], nowMs: 1000 * 1000,
    fetchImpl: async () => { throw new Error('must not fetch'); },
  }), /not yet closed/);
});

// These are real compiled synthetic claim responses, not pre-trusted projections.
async function collectedClaim(mutate = () => {}) {
  const f = await fixtures(), claim = await claimFixture({ referral: true });
  const raw = structuredClone(claim.result); mutate(raw);
  f.opening.context.slot = String(BigInt(claim.slot) - 1n);
  f.closing.context.slot = String(BigInt(claim.slot) + 1n);
  const fetchImpl = async (_url, init) => {
    const request = JSON.parse(init.body);
    if (request.method === 'getSignaturesForAddress') {
      const present = raw.transaction.message.accountKeys.includes(request.params[0]);
      return response(request, present && !request.params[1].before
        ? [row(claim.signature, Number(claim.slot), raw.blockTime, 0)] : []);
    }
    if (request.method === 'getBlock') return response(request, { blockTime: raw.blockTime, signatures: [claim.signature] });
    if (request.method === 'getTransaction') return response(request, raw);
    throw Error('Unexpected synthetic method');
  };
  return collectAccountingInterval({ wallet, opening: f.opening, closing: f.closing, fetchImpl });
}

test('collector binds exact claim receipts to the finalized full transaction envelope', async () => {
  const interval = await collectedClaim();
  assert.equal(interval.godlClaims.length, 1);
  const entry = interval.godlClaims[0];
  assert.equal(entry.claim.ownerReceipt.amountBaseUnits, '995');
  assert.equal(entry.claim.referralReceipt.amountBaseUnits, '5');
  assert.equal(entry.claim.treasuryDebit.amountBaseUnits, '1000');
  assert.equal(entry.claim.ownerPaidNetworkFeeLamports, '5000');
  assert.equal(entry.transactionSha256, createHash('sha256').update(JSON.stringify(interval.transactions[0])).digest('hex'));
  assert.equal(entry.claim.signature, interval.transactions[0].signature);
  assert.equal(entry.claim.slot, interval.transactions[0].slot);
});

test('collector never admits unsupported raw claim transfers, rent or missing metadata', async t => {
  for (const [name, mutate] of [
    ['absent transfer evidence', r => { r.meta.innerInstructions = []; }],
    ['new recipient rent', r => { r.meta.preBalances[3] = '0'; }],
    ['unknown token decimals', r => { r.meta.postTokenBalances[1].uiTokenAmount.decimals = 6; }],
    ['missing signer header', r => { delete r.transaction.message.header; }],
  ]) await t.test(name, async () => assert.rejects(collectedClaim(mutate)));
});

test('oversized finalized transaction is rejected before evidence callback or cache write', async () => {
  const fixture = await fixtures(), evidence = [], written = [];
  const rpc = rpcFetch(fixture); let cancelled = false;
  await assert.rejects(collectAccountingInterval({ wallet, opening: fixture.opening, closing: fixture.closing,
    pageSize: 2, cache: { get: async () => null, set: async (_key, record) => written.push(record) },
    onResponse: async record => evidence.push(record),
    fetchImpl: async (url, init) => {
      if (JSON.parse(init.body).method !== 'getTransaction') return rpc.fetchImpl(url, init);
      return new Response(new ReadableStream({ start(controller) {
        controller.enqueue(Buffer.alloc(16 * 1024 * 1024)); controller.enqueue(Buffer.from('x'));
      }, cancel() { cancelled = true; } }), { headers: { 'content-length': '1' } });
    } }), { failureCode: 'invalidData' });
  assert.equal(cancelled, true);
  assert.ok(evidence.length > 0);
  assert.ok(evidence.every(record => record.method !== 'getTransaction'));
  assert.ok(written.every(record => record.method !== 'getTransaction'));
});

test('oversized candle response is cancelled before raw evidence capture', async () => {
  const evidence = []; let cancelled = false;
  await assert.rejects(collectHistoricalCandles({ minutes: [0], nowMs: 120000,
    onResponse: async record => evidence.push(record), fetchImpl: async (_url, init) => {
      assert.equal(init.redirect, 'error');
      return new Response(new ReadableStream({ start(controller) {
        controller.enqueue(Buffer.alloc(4 * 1024 * 1024)); controller.enqueue(Buffer.from('x'));
      }, cancel() { cancelled = true; } }));
    } }), { failureCode: 'invalidData' });
  assert.equal(cancelled, true); assert.deepEqual(evidence, []);
});
