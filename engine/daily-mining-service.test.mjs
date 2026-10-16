import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { address, getAddressDecoder, getProgramDerivedAddress } from '@solana/addresses';
import { deriveAddresses, GODL_PROGRAM_ADDRESS, GODL_OBSERVATION_SOURCE_COMMIT } from './chain.mjs';
import { MAINNET_GENESIS } from './monitor.mjs';
import { refreshDailyMining, loadDailyMining } from './daily-mining-service.mjs';

const key = n => getAddressDecoder().decode(new Uint8Array(32).fill(n));
const wallet = key(6), PROGRAM = GODL_PROGRAM_ADDRESS;
const DEPLOYED = '457407037', SLOT = 457408037;
const AT = '2026-10-16T12:00:00.000Z', NOW = Date.parse(AT), SECOND = NOW / 1000;
function sig(n) {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const bytes = Buffer.alloc(64, 8); bytes.writeUInt32BE(n, 60);
  let number = BigInt(`0x${bytes.toString('hex')}`), text = '';
  while (number) { text = alphabet[Number(number % 58n)] + text; number /= 58n; }
  return text;
}
async function fixture(t, overrides = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'godl-synthetic-daily-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const miner = (await deriveAddresses(wallet)).miner.address;
  const snapshot = { wallet, genesisHash: MAINNET_GENESIS, commitment: 'finalized', programAddress: PROGRAM,
    sourceCommit: GODL_OBSERVATION_SOURCE_COMMIT, observedAt: AT, context: { slot: String(SLOT) },
    accounts: { miner: { address: miner, status: 'present' } } };
  const row = (n, seconds = SECOND - n * 100, slot = SLOT - n) => ({ signature: sig(n), slot, blockTime: seconds, err: null, confirmationStatus: 'finalized' });
  const rows = [row(1), row(2), row(3, SECOND - 86400, SLOT - 100)];
  const bytes = Buffer.alloc(8); bytes.writeBigUInt64LE(42n);
  const round = (await getProgramDerivedAddress({ programAddress: address(PROGRAM), seeds: ['round', bytes] }))[0];
  function transaction(item) {
    const keys = [PROGRAM, ...Array.from({ length: 10 }, (_, i) => key(i + 20))];
    keys[3] = miner; keys[4] = round;
    return { version: 'legacy', slot: item.slot, blockTime: item.blockTime,
      transaction: { signatures: [item.signature], message: { accountKeys: keys,
        instructions: [{ programIdIndex: 0, accounts: Array.from({ length: 10 }, (_, i) => i + 1), data: '29' }] } },
      meta: { err: null, innerInstructions: [], logMessages: [`Program ${PROGRAM} invoke [1]`,
        'Program log: Round ID: 42', 'Program log: Base rewards: 0.0001 SOL',
        'Program log: Split rewards: 0.00000000123 GODL', `Program ${PROGRAM} success`] } };
  }
  const calls = [], deployments = [];
  const state = { rows, transaction, page: undefined, deployment: DEPLOYED, wrongGenesis: false };
  const options = { snapshot, timeZone: 'Europe/Sofia', cachePath: join(directory, 'derived.json'), rpcUrl: 'https://synthetic.invalid',
    nowMs: NOW, requestDelayMs: 0, ...overrides,
    readDeployment: async options => { deployments.push(options); return { deployedAtSlot: state.deployment }; },
    fetchImpl: async (_url, init) => {
      const request = JSON.parse(init.body); calls.push(request);
      let result;
      if (request.method === 'getGenesisHash') result = state.wrongGenesis ? key(40) : MAINNET_GENESIS;
      else if (request.method === 'getSignaturesForAddress') result = state.page ? state.page(request.params[1]) : state.rows;
      else if (request.method === 'getTransaction') result = state.transaction(state.rows.find(row => row.signature === request.params[0]));
      else throw new Error('unexpected synthetic RPC');
      return { ok: true, text: async () => JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) };
    } };
  return { options, state, calls, deployments, row, transaction, snapshot, miner };
}
const txCalls = f => f.calls.filter(c => c.method === 'getTransaction');

test('persists partial recovery and resumes its frozen target after restart; fresh and offline reads make no RPC', async t => {
  const f = await fixture(t, { maxTransactions: 1 });
  assert.equal(await refreshDailyMining(f.options), undefined);
  assert.equal(txCalls(f).length, 1);
  let cache = JSON.parse(await readFile(f.options.cachePath));
  assert.equal(cache.pending.rows.length, 2);
  assert.equal(Object.keys(cache.transactions).length, 1);
  assert.ok(Object.values(cache.transactions)[0].result.meta.logMessages.length);
  const summary = await refreshDailyMining({ ...f.options, snapshot: { ...f.snapshot, observedAt: '2026-10-16T12:01:00.000Z' } });
  assert.equal(summary.unrefinedBaseUnits, '246');
  assert.equal(summary.transactionCount, 2); assert.equal(summary.checkpointCount, 2);
  assert.equal(summary.throughAt, AT); assert.equal(summary.throughSlot, String(SLOT));
  assert.equal(summary.fromAt, '2026-10-15T21:00:00.000Z');
  assert.equal(summary.day, '2026-10-16'); assert.equal(summary.timeZone, 'Europe/Sofia');
  assert.equal(f.calls.filter(c => c.method === 'getSignaturesForAddress').length, 1);
  assert.equal(f.calls.find(c => c.method === 'getSignaturesForAddress').params[1].minContextSlot, SLOT);
  assert.equal((await stat(f.options.cachePath)).mode & 0o777, 0o600);
  const count = f.calls.length, deploymentCount = f.deployments.length;
  assert.deepEqual(await refreshDailyMining(f.options), summary);
  assert.deepEqual(await loadDailyMining(f.options), summary);
  assert.equal(f.calls.length, count); assert.equal(f.deployments.length, deploymentCount);
  assert.equal(await loadDailyMining({ ...f.options, snapshot: { ...f.snapshot, context: { slot: String(SLOT - 2) } } }), undefined);
});

test('recollects a newer target and reuses same-day raw transactions, retaining the prior publication during progress', async t => {
  const f = await fixture(t); const original = await refreshDailyMining(f.options);
  const priorCalls = txCalls(f).length;
  f.state.rows.unshift(f.row(4, SECOND + 20, SLOT + 1), f.row(5, SECOND + 10, SLOT));
  const newer = { ...f.options, nowMs: NOW + 61000, maxTransactions: 1,
    snapshot: { ...f.snapshot, observedAt: '2026-10-16T12:01:00.000Z', context: { slot: String(SLOT + 2) } } };
  assert.deepEqual(await refreshDailyMining(newer), original);
  assert.deepEqual(await loadDailyMining(newer), original);
  assert.equal(txCalls(f).length, priorCalls + 1);
  const next = await refreshDailyMining(newer);
  assert.equal(next.unrefinedBaseUnits, '492'); assert.equal(next.transactionCount, 4);
  assert.equal(txCalls(f).length, priorCalls + 2);
  assert.equal(f.calls.filter(c => c.method === 'getSignaturesForAddress').length, 2);
});

test('excludes future rows by slot and time and includes exact local midnight', async t => {
  const f = await fixture(t);
  f.state.rows = [f.row(6, SECOND + 1, SLOT + 2), f.row(7, SECOND, SLOT + 1),
    f.row(8, SECOND - 1, SLOT), f.row(9, Date.parse('2026-10-15T21:00:00.000Z') / 1000, SLOT - 1),
    f.row(10, Date.parse('2026-10-15T21:00:00.000Z') / 1000 - 1, SLOT - 2)];
  const summary = await refreshDailyMining(f.options);
  assert.equal(summary.transactionCount, 2); assert.equal(summary.unrefinedBaseUnits, '246');
  assert.deepEqual(txCalls(f).map(x => x.params[0]), [sig(8), sig(9)]);
});

test('short, empty, missing-time, duplicate and unordered provider histories remain unknown and back off', async t => {
  const cases = [f => { f.state.rows = []; }, f => { f.state.rows.pop(); },
    f => { f.state.rows[0].blockTime = null; }, f => { f.state.rows[1] = f.state.rows[0]; },
    f => { f.state.rows[1].slot = SLOT + 1; }, f => { f.state.rows[1].blockTime = SECOND; },
    f => { f.state.rows[0].confirmationStatus = 'confirmed'; }, f => { f.state.rows[0].signature = 'invalid'; },
    f => { f.state.rows[0].slot = '01'; }, f => { f.state.rows[0].blockTime = SECOND + 1; }];
  for (const change of cases) {
    const f = await fixture(t); change(f);
    assert.equal(await refreshDailyMining(f.options), undefined);
    const count = f.calls.length; assert.equal(await refreshDailyMining(f.options), undefined); assert.equal(f.calls.length, count);
    assert.equal(txCalls(f).length, 0);
  }
});

test('missing, ambiguous, failed and mismatched successful transaction evidence never publishes', async t => {
  const changes = [() => null, tx => ({ ...tx, slot: SLOT + 1 }), tx => ({ ...tx, blockTime: SECOND }),
    tx => { tx.transaction.signatures[0] = sig(30); return tx; },
    tx => { tx.meta.err = { InstructionError: [0, 'synthetic'] }; return tx; },
    tx => { tx.meta.logMessages.pop(); return tx; },
    tx => { tx.meta.logMessages[3] = 'Program log: Split rewards: 90071.99254740992 GODL'; return tx; }];
  for (const change of changes) {
    const f = await fixture(t); f.state.transaction = row => change(f.transaction(row));
    assert.equal(await refreshDailyMining(f.options), undefined);
    assert.equal((JSON.parse(await readFile(f.options.cachePath))).published, undefined);
  }
});

test('failed indexed transactions require no detail request and contribute no reward', async t => {
  const f = await fixture(t); f.state.rows[0].err = { InstructionError: [0, 'synthetic'] };
  const summary = await refreshDailyMining(f.options);
  assert.equal(summary.unrefinedBaseUnits, '123'); assert.equal(summary.transactionCount, 2);
  assert.equal(summary.checkpointCount, 1); assert.equal(txCalls(f).length, 1);
});

test('fresh cached failed transactions use bounded calendar formatting without changing output or files', async t => {
  const f = await fixture(t), count = 160;
  f.state.rows = Array.from({ length: count }, (_, i) => ({ ...f.row(i + 1), err: { InstructionError: [0, 'synthetic'] } }));
  f.state.rows.push(f.row(count + 1, SECOND - 86400));
  const expected = await refreshDailyMining(f.options);
  assert.equal(expected.transactionCount, count); assert.equal(expected.checkpointCount, 0);
  assert.equal(expected.unrefinedBaseUnits, '0'); assert.equal(txCalls(f).length, 0);
  const before = await readFile(f.options.cachePath), requests = f.calls.length, deployments = f.deployments.length;
  const formatToParts = Intl.DateTimeFormat.prototype.formatToParts;
  let formats = 0;
  Intl.DateTimeFormat.prototype.formatToParts = function (...args) { formats++; return formatToParts.apply(this, args); };
  try {
    assert.deepEqual(await loadDailyMining(f.options), expected);
    assert.deepEqual(await refreshDailyMining(f.options), expected);
  } finally {
    Intl.DateTimeFormat.prototype.formatToParts = formatToParts;
  }
  assert.equal(f.calls.length, requests); assert.equal(f.deployments.length, deployments);
  assert.deepEqual(await readFile(f.options.cachePath), before);
  // Allow fixed midnight searches plus several calendar reads per transaction,
  // but reject a midnight binary search for every cached transaction.
  assert.ok(formats < count * 4 + 600, `expected bounded calendar formatting, got ${formats} calls`);
});

test('local-day cache validation retains DST and fractional-offset midnight boundaries', async t => {
  const cases = [
    { timeZone: 'Europe/Sofia', at: '2026-03-29T12:00:00.000Z', day: '2026-03-29', fromAt: '2026-03-28T22:00:00.000Z', nextAt: '2026-03-29T21:00:00.000Z' },
    { timeZone: 'America/New_York', at: '2026-11-01T12:00:00.000Z', day: '2026-11-01', fromAt: '2026-11-01T04:00:00.000Z', nextAt: '2026-11-02T05:00:00.000Z' },
    { timeZone: 'Australia/Lord_Howe', at: '2026-10-04T12:00:00.000Z', day: '2026-10-04', fromAt: '2026-10-03T13:30:00.000Z', nextAt: '2026-10-04T13:00:00.000Z' },
  ];
  for (const c of cases) {
    const f = await fixture(t, { timeZone: c.timeZone, nowMs: Date.parse(c.at) });
    f.options.snapshot = { ...f.snapshot, observedAt: c.at };
    const midnight = Date.parse(c.fromAt) / 1000;
    f.state.rows = [f.row(1, Date.parse(c.at) / 1000 - 1), f.row(2, midnight), f.row(3, midnight - 1)];
    const summary = await refreshDailyMining(f.options);
    assert.equal(summary.day, c.day); assert.equal(summary.fromAt, c.fromAt);
    assert.equal(summary.timeZone, c.timeZone); assert.equal(summary.transactionCount, 2);
    assert.equal(summary.unrefinedBaseUnits, '246');
    assert.deepEqual(txCalls(f).map(x => x.params[0]), [sig(1), sig(2)]);
    assert.deepEqual(await loadDailyMining(f.options), summary);
    const cache = JSON.parse(await readFile(f.options.cachePath));
    assert.equal(cache.publishedTarget.boundary.blockTime, midnight - 1);
    // An extra failed transaction avoids raw-decode mismatches: only its local
    // day makes this otherwise well-formed cached evidence invalid.
    cache.transactions[sig(4)] = { signature: sig(4), slot: String(SLOT - 4), blockTime: Date.parse(c.nextAt) / 1000,
      err: { InstructionError: [0, 'synthetic'] }, baseUnits: '0', checkpointCount: 0 };
    const wrongDay = JSON.stringify(cache); await writeFile(f.options.cachePath, wrongDay);
    const requests = f.calls.length, deployments = f.deployments.length;
    await assert.rejects(loadDailyMining(f.options)); await assert.rejects(refreshDailyMining(f.options));
    assert.equal(await readFile(f.options.cachePath, 'utf8'), wrongDay);
    assert.equal(f.calls.length, requests); assert.equal(f.deployments.length, deployments);
  }
});

test('rejects unsupported observation, deployment, network and wallet identity', async t => {
  const f = await fixture(t);
  for (const snapshot of [{ ...f.snapshot, sourceCommit: 'unsupported' }, { ...f.snapshot, commitment: 'confirmed' },
    { ...f.snapshot, accounts: { miner: { address: key(9), status: 'present' } } }]) {
    await assert.rejects(refreshDailyMining({ ...f.options, snapshot }));
  }
  assert.equal(f.calls.length, 0);
  f.state.deployment = '457407038'; assert.equal(await refreshDailyMining(f.options), undefined); assert.equal(f.calls.length, 0);
  const other = await fixture(t); other.state.wrongGenesis = true; assert.equal(await refreshDailyMining(other.options), undefined);
  assert.equal(txCalls(other).length, 0);
  const valid = await fixture(t); await refreshDailyMining(valid.options);
  const before = await readFile(valid.options.cachePath);
  await assert.rejects(refreshDailyMining({ ...valid.options, snapshot: { ...valid.snapshot, wallet: key(7),
    accounts: { miner: { address: (await deriveAddresses(key(7))).miner.address, status: 'present' } } } }));
  assert.deepEqual(await readFile(valid.options.cachePath), before);
});

test('preserves corrupt, unsupported, tampered and oversized cache files', async t => {
  const f = await fixture(t); await refreshDailyMining(f.options);
  const original = JSON.parse(await readFile(f.options.cachePath));
  const altered = structuredClone(original); altered.transactions[sig(1)].baseUnits = '124';
  const bad = ['{broken', JSON.stringify({ ...original, schemaVersion: 2 }), JSON.stringify(altered), ' '.repeat(16 * 1024 * 1024 + 1)];
  for (const raw of bad) {
    await writeFile(f.options.cachePath, raw);
    await assert.rejects(refreshDailyMining(f.options)); await assert.rejects(loadDailyMining(f.options));
    assert.equal(await readFile(f.options.cachePath, 'utf8'), raw);
  }
});

test('caps enumeration at eight pages and rejects nonadvancing pages before transaction work', async t => {
  const f = await fixture(t);
  let page = 0;
  f.state.page = () => Array.from({ length: 1000 }, (_, i) => ({ ...f.row(1), signature: sig(++page * 1000 + i), slot: SLOT, blockTime: SECOND - 1 }));
  assert.equal(await refreshDailyMining(f.options), undefined);
  assert.equal(f.calls.filter(c => c.method === 'getSignaturesForAddress').length, 8); assert.equal(txCalls(f).length, 0);
  const repeating = await fixture(t); repeating.state.page = () => Array.from({ length: 1000 }, (_, i) => ({ ...repeating.row(1), signature: sig(i + 1), slot: SLOT, blockTime: SECOND - 1 }));
  assert.equal(await refreshDailyMining(repeating.options), undefined);
  assert.equal(repeating.calls.filter(c => c.method === 'getSignaturesForAddress').length, 2);
});

test('date and time zone changes replace only valid derived cache; previous day is never published', async t => {
  const f = await fixture(t); await refreshDailyMining(f.options);
  const tomorrow = { ...f.options, nowMs: NOW + 86400000, snapshot: { ...f.snapshot, observedAt: '2026-10-17T12:00:00.000Z' } };
  assert.equal(await loadDailyMining(tomorrow), undefined);
  const summary = await refreshDailyMining(tomorrow);
  assert.equal(summary.day, '2026-10-17'); assert.equal(summary.unrefinedBaseUnits, '0');
  assert.equal(summary.fromAt, '2026-10-16T21:00:00.000Z');
});

test('continues pagination through every midnight row and persists a strictly earlier boundary', async t => {
  const f = await fixture(t), midnight = Date.parse('2026-10-15T21:00:00.000Z') / 1000;
  const failed = n => ({ ...f.row(n, n < 1000 ? SECOND - 1 : midnight, SLOT - n), err: { InstructionError: [0, 'synthetic'] } });
  const first = Array.from({ length: 1000 }, (_, i) => failed(i + 1));
  const lastMidnight = failed(1001), boundary = f.row(1002, midnight - 1, SLOT - 1002);
  f.state.page = options => options.before ? [lastMidnight, boundary] : first;
  const summary = await refreshDailyMining(f.options);
  assert.equal(summary.transactionCount, 1001); assert.equal(summary.unrefinedBaseUnits, '0');
  assert.equal(f.calls.filter(x => x.method === 'getSignaturesForAddress').length, 2);
  const cache = JSON.parse(await readFile(f.options.cachePath));
  assert.equal(cache.publishedTarget.boundary.blockTime, midnight - 1);
  delete cache.publishedTarget.boundary;
  const corrupt = JSON.stringify(cache); await writeFile(f.options.cachePath, corrupt);
  await assert.rejects(loadDailyMining(f.options)); assert.equal(await readFile(f.options.cachePath, 'utf8'), corrupt);
});

test('a midnight row alone never proves complete history', async t => {
  const f = await fixture(t);
  f.state.rows = [f.row(1, Date.parse('2026-10-15T21:00:00.000Z') / 1000)];
  assert.equal(await refreshDailyMining(f.options), undefined); assert.equal(txCalls(f).length, 0);
});

test('work deadline aborts a slow transaction body, saves prior progress and resumes without failure backoff', async t => {
  const f = await fixture(t), fetchImpl = f.options.fetchImpl;
  f.options.fetchImpl = async (url, init) => {
    const response = await fetchImpl(url, init), request = JSON.parse(init.body);
    if (request.method !== 'getTransaction' || request.params[0] !== sig(2)) return response;
    return { ...response, text: () => new Promise((resolve, reject) => {
      if (init.signal.aborted) { reject(init.signal.reason); return; }
      init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
      // Keep this synthetic asynchronous request alive until its abort fires.
      const timer = setTimeout(() => resolve(response.text()), 1000);
      init.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
    }) };
  };
  const started = performance.now();
  assert.equal(await refreshDailyMining({ ...f.options, budgetMs: 100 }), undefined);
  assert.ok(performance.now() - started < 700);
  const cache = JSON.parse(await readFile(f.options.cachePath));
  assert.equal(cache.retryAfterMs, 0); assert.equal(Object.keys(cache.transactions).length, 1);
  const summary = await refreshDailyMining({ ...f.options, fetchImpl });
  assert.equal(summary.unrefinedBaseUnits, '246');
  assert.equal(f.calls.filter(c => c.method === 'getSignaturesForAddress').length, 1);
});
