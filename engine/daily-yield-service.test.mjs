import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getAddressDecoder } from '@solana/addresses';
import { deriveAddresses, GODL_PROGRAM_ADDRESS, GODL_OBSERVATION_SOURCE_COMMIT } from './chain.mjs';
import { MAINNET_GENESIS } from './monitor.mjs';
import { loadDailyYield, refreshDailyYield } from './daily-yield-service.mjs';

const Q = 1n << 48n, SLOT = 457408000;
const wallet = getAddressDecoder().decode(new Uint8Array(32).fill(37));
const factor = raw => ({ rawBits: String(raw), fractionalBits: 48 });
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'godl-synthetic-yield-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const derived = await deriveAddresses(wallet);
  const account = (name, value) => ({ address: derived[name].address, status: 'present', value });
  const snapshot = { wallet, genesisHash: MAINNET_GENESIS, programAddress: GODL_PROGRAM_ADDRESS,
    sourceCommit: GODL_OBSERVATION_SOURCE_COMMIT, commitment: 'finalized', observedAt: '2026-10-16T00:01:00.000Z',
    context: { slot: String(SLOT) }, accounts: {
      miner: account('miner', { authority: wallet, rewardsGodl: '1000000', refinedGodl: '7', rewardsFactor: factor(Q), lastClaimGodlAt: '0' }),
      treasury: account('treasury', { minerRewardsFactor: factor(Q + Q / 2n) }),
      minerExtended: account('minerExtended', { authority: wallet, xautRewards: '2', lifetimeXaut: '5', xautRewardsFactor: factor(Q) }),
      goldVault: account('goldVault', { xautRewardsFactor: factor(2n * Q) }),
    } };
  const boundary = { schemaVersion: 1, kind: 'godl-daily-yield-opening', wallet, miner: derived.miner.address,
    minerExtended: derived.minerExtended.address, genesisHash: MAINNET_GENESIS, programAddress: GODL_PROGRAM_ADDRESS,
    sourceCommit: GODL_OBSERVATION_SOURCE_COMMIT, deployedAtSlot: '457407037', proofHash: 'a'.repeat(64),
    verifiedThroughSlot: String(SLOT - 10), evidenceAt: '2026-10-16T00:00:01.000Z',
    day: '2026-10-16', timeZone: 'UTC', fromAt: '2026-10-16T00:00:00.000Z',
    refined: { openingBaseUnits: '500000', lastClaimGodlAt: '0' }, gold: { openingBaseUnits: '3' } };
  const options = { snapshot, timeZone: 'UTC', boundaryPath: join(directory, 'opening.json'), cachePath: join(directory, 'rolling.json'),
    rpcUrl: 'https://synthetic.invalid' };
  const calls = [], times = new Map();
  options.fetchImpl = async (_url, request) => {
    const body = JSON.parse(request.body); calls.push(body);
    assert.equal(body.method, 'getBlockTime');
    assert.ok(request.signal);
    return { ok: true, text: async () => JSON.stringify({ jsonrpc: '2.0', id: body.id,
      result: times.has(body.params[0]) ? times.get(body.params[0]) : Date.parse(snapshot.observedAt) / 1000 - 1 }) };
  };
  const seed = () => writeFile(options.boundaryPath, JSON.stringify(boundary));
  return { options, snapshot, boundary, seed, calls, times };
}
function later(f, at, slot = SLOT + 1) {
  f.snapshot.observedAt = at; f.snapshot.context.slot = String(slot);
}
async function midnight(t, beforeAt = '2026-10-15T23:59:50.000Z', afterAt = '2026-10-16T00:00:10.000Z') {
  const f = await fixture(t);
  later(f, beforeAt, SLOT - 1); await refreshDailyYield(f.options);
  f.times.set(SLOT - 1, Date.parse(beforeAt) / 1000 - 1);
  later(f, afterAt); f.times.set(SLOT + 1, Date.parse(afterAt) / 1000 - 1);
  return f;
}

test('offline exact independent yields and dated current prefix; no RPC', async t => {
  const f = await fixture(t); await f.seed();
  const value = await loadDailyYield(f.options);
  assert.deepEqual(value.refined, { baseUnits: '7', openingBaseUnits: '500000', closingBaseUnits: '500007', lastClaimGodlAt: '0' });
  assert.deepEqual(value.gold, { baseUnits: '3', openingBaseUnits: '3', closingBaseUnits: '6' });
  assert.equal(value.throughSlot, String(SLOT)); assert.equal(value.throughAt, f.snapshot.observedAt);
  assert.equal(value.fromAt, f.boundary.fromAt); assert.equal(f.calls.length, 0);
});

test('preserves >2^53 integers and protocol floor order', async t => {
  const f = await fixture(t);
  f.snapshot.accounts.miner.value.rewardsGodl = '9007199254740993';
  f.boundary.refined.openingBaseUnits = '4503599627370496';
  f.boundary.gold.openingBaseUnits = '5'; await f.seed();
  const value = await loadDailyYield(f.options);
  assert.equal(value.refined.closingBaseUnits, '4503599627370503');
  assert.equal(value.refined.baseUnits, '7'); assert.equal(value.gold.baseUnits, '9007199254');
  f.snapshot.accounts.miner.value.rewardsGodl = '500000';
  f.boundary.refined.openingBaseUnits = '250000'; await f.seed();
  assert.equal((await loadDailyYield(f.options)).gold.baseUnits, '0');
});

test('refined GODL claim makes refined unknown; gold claims preserve lifetime earned', async t => {
  const f = await fixture(t); await f.seed();
  f.snapshot.accounts.miner.value.lastClaimGodlAt = '1792108800';
  const extended = f.snapshot.accounts.minerExtended.value;
  Object.assign(extended, { xautRewards: '0', lifetimeXaut: '6', xautRewardsFactor: factor(2n * Q) });
  const value = await loadDailyYield(f.options);
  assert.equal(value.refined, undefined); assert.equal(value.gold.baseUnits, '3');
});

test('negative deltas, regressed asset factors and missing accounts stay independently unknown', async t => {
  const f = await fixture(t); await f.seed();
  f.snapshot.accounts.goldVault.value.xautRewardsFactor = factor(0n);
  assert.equal((await loadDailyYield(f.options)).gold, undefined);
  assert.ok((await loadDailyYield(f.options)).refined);
  f.snapshot.accounts.goldVault.value.xautRewardsFactor = factor(2n * Q);
  f.snapshot.accounts.treasury.value.minerRewardsFactor = factor(0n);
  assert.equal((await loadDailyYield(f.options)).refined, undefined);
  assert.ok((await loadDailyYield(f.options)).gold);
  f.boundary.gold.openingBaseUnits = '7'; await f.seed();
  assert.equal(await loadDailyYield(f.options), undefined);
  f.snapshot.accounts.minerExtended.status = 'missing';
  assert.equal(await loadDailyYield(f.options), undefined);
});

test('missing boundary is unknown; older/newer day, future evidence or future slot do not publish', async t => {
  const f = await fixture(t); assert.equal(await loadDailyYield(f.options), undefined);
  await f.seed();
  for (const change of [() => { f.boundary.verifiedThroughSlot = String(SLOT + 1); },
    () => { f.boundary.evidenceAt = '2026-10-16T00:02:00.000Z'; },
    () => { later(f, '2026-10-17T00:01:00.000Z'); }]) {
    change(); await f.seed(); assert.equal(await loadDailyYield(f.options), undefined);
  }
});

test('rejects unsupported source, network, commitment, account PDA/authority and canonical fields', async t => {
  const f = await fixture(t); await f.seed();
  const original = structuredClone(f.snapshot);
  const bad = [s => { s.sourceCommit = 'unsupported'; }, s => { s.genesisHash = wallet; },
    s => { s.commitment = 'confirmed'; }, s => { s.context.slot = '457407036'; },
    s => { s.context.slot = '0457408000'; }, s => { s.accounts.goldVault.address = wallet; },
    s => { s.accounts.minerExtended.value.authority = GODL_PROGRAM_ADDRESS; },
    s => { s.accounts.miner.value.rewardsGodl = 1000000; }, s => { s.accounts.miner.value.lastClaimGodlAt = '-0'; },
    s => { s.accounts.treasury.value.minerRewardsFactor.fractionalBits = 32; },
    s => { s.accounts.goldVault.value.xautRewardsFactor.rawBits = String(1n << 127n); }];
  for (const change of bad) {
    const snapshot = structuredClone(original); change(snapshot);
    await assert.rejects(loadDailyYield({ ...f.options, snapshot }));
  }
  assert.equal(f.calls.length, 0);
});

test('corrupt, oversized, unsupported or wrong-profile opening remains byte-for-byte intact', async t => {
  const f = await fixture(t);
  const cases = ['{broken', 'null', 'false', '0', '""', ' '.repeat(128 * 1024 + 1),
    ...[b => { b.schemaVersion = 2; }, b => { b.wallet = GODL_PROGRAM_ADDRESS; }, b => { b.proofHash = 'not-proof'; },
      b => { b.sourceCommit = 'old'; }, b => { delete b.verifiedThroughSlot; }, b => { b.evidenceAt = 'invalid'; },
      b => { b.refined.openingBaseUnits = '00'; }, b => { b.fromAt = '2026-10-16T00:00:01.000Z'; },
      b => { b.minerExtended = wallet; }, b => { b.refined.lastClaimGodlAt = '1792108800'; }]
      .map(change => { const b = structuredClone(f.boundary); change(b); return JSON.stringify(b); })];
  for (const raw of cases) {
    await writeFile(f.options.boundaryPath, raw);
    await assert.rejects(loadDailyYield(f.options)); await assert.rejects(refreshDailyYield(f.options));
    assert.equal(await readFile(f.options.boundaryPath, 'utf8'), raw);
  }
});

test('rejects mismatched timezone; DST dates use exact local midnight', async t => {
  const f = await fixture(t); await f.seed();
  await assert.rejects(loadDailyYield({ ...f.options, timeZone: 'Europe/Sofia' }));
  for (const [at, fromAt, day] of [
    ['2026-03-29T12:00:00.000Z', '2026-03-28T22:00:00.000Z', '2026-03-29'],
    ['2026-10-25T12:00:00.000Z', '2026-10-24T21:00:00.000Z', '2026-10-25']]) {
    later(f, at); Object.assign(f.boundary, { fromAt, day, timeZone: 'Europe/Sofia', evidenceAt: fromAt });
    await f.seed(); const value = await loadDailyYield({ ...f.options, timeZone: 'Europe/Sofia' });
    assert.equal(value.fromAt, fromAt); assert.equal(value.day, day);
  }
});

test('captures future midnight with exact factor/projected equality, only two block-time calls', async t => {
  const f = await midnight(t); const value = await refreshDailyYield(f.options);
  assert.equal(value.refined.baseUnits, '0'); assert.equal(value.gold.baseUnits, '0');
  assert.equal(f.calls.length, 2); assert.equal(value.fromAt, '2026-10-16T00:00:00.000Z');
  const b = JSON.parse(await readFile(f.options.boundaryPath));
  assert.equal(b.verifiedThroughSlot, String(SLOT + 1)); assert.match(b.proofHash, /^[a-f0-9]{64}$/);
  assert.equal((await stat(f.options.boundaryPath)).mode & 0o777, 0o600);
  assert.equal((await stat(f.options.cachePath)).mode & 0o777, 0o600);
  later(f, '2026-10-16T12:00:00.000Z', SLOT + 2);
  f.snapshot.accounts.treasury.value.minerRewardsFactor = factor(Q * 2n);
  assert.equal((await refreshDailyYield(f.options)).refined.baseUnits, '500000');
  await loadDailyYield(f.options); assert.equal(f.calls.length, 2);
  assert.ok((await stat(f.options.cachePath)).size < 128 * 1024);
});

test('factor changes, balance changes and claim markers in the midnight gap never infer earnings', async t => {
  for (const change of [f => { f.snapshot.accounts.treasury.value.minerRewardsFactor = factor(2n * Q); },
    f => { f.snapshot.accounts.miner.value.refinedGodl = '8'; },
    f => { f.snapshot.accounts.miner.value.lastClaimGodlAt = '1'; }]) {
    const f = await midnight(t); change(f);
    const value = await refreshDailyYield(f.options);
    assert.equal(value.refined, undefined); assert.equal(value.gold.baseUnits, '0');
    assert.equal(f.calls.length, 2);
  }
  const f = await midnight(t); f.snapshot.accounts.goldVault.value.xautRewardsFactor = factor(3n * Q);
  assert.equal((await refreshDailyYield(f.options)).gold, undefined);
});

test('unequal factors are unknown even when floor rounding leaves projected balance unchanged', async t => {
  const f = await midnight(t); f.snapshot.accounts.goldVault.value.xautRewardsFactor = factor(2n * Q + 1n);
  const value = await refreshDailyYield(f.options);
  assert.equal(value.gold, undefined); assert.equal(value.refined.baseUnits, '0');
  later(f, '2026-10-16T00:02:00.000Z', SLOT + 2);
  await refreshDailyYield(f.options); assert.equal(f.calls.length, 2);
});

test('holds actual pre-midnight sample when observation clock already crossed midnight', async t => {
  const f = await midnight(t);
  f.times.set(SLOT + 1, Date.parse('2026-10-15T23:59:59.000Z') / 1000);
  assert.equal(await refreshDailyYield(f.options), undefined);
  assert.equal(f.calls.length, 2);
  let cache = JSON.parse(await readFile(f.options.cachePath));
  assert.equal(cache.pending.before.slot, String(SLOT + 1));
  later(f, '2026-10-16T00:00:20.000Z', SLOT + 2);
  f.times.set(SLOT + 2, Date.parse('2026-10-16T00:00:01.000Z') / 1000);
  assert.equal((await refreshDailyYield(f.options)).gold.baseUnits, '0');
  assert.equal(f.calls.length, 3);
  cache = JSON.parse(await readFile(f.options.cachePath)); assert.equal(cache.pending, undefined);
});

test('unavailable block time backs off while preserving the previous midnight sample', async t => {
  const f = await midnight(t); f.times.set(SLOT - 1, null);
  assert.equal(await refreshDailyYield(f.options), undefined); assert.equal(f.calls.length, 1);
  later(f, '2026-10-16T00:00:30.000Z', SLOT + 2);
  await refreshDailyYield(f.options); assert.equal(f.calls.length, 1);
  f.times.set(SLOT - 1, Date.parse('2026-10-15T23:59:49.000Z') / 1000);
  later(f, '2026-10-16T00:01:11.000Z', SLOT + 3);
  f.times.set(SLOT + 3, Date.parse('2026-10-16T00:01:10.000Z') / 1000);
  assert.equal((await refreshDailyYield(f.options)).gold.baseUnits, '0');
  assert.equal(f.calls.length, 3);
});

test('cache corruptions, wrong identity/source and resource excess are preserved without RPC', async t => {
  const f = await fixture(t); await refreshDailyYield(f.options);
  const original = JSON.parse(await readFile(f.options.cachePath));
  for (const raw of ['{bad', 'null', 'false', '0', '""', ' '.repeat(128 * 1024 + 1), JSON.stringify({ ...original, schemaVersion: 2 }),
    JSON.stringify({ ...original, sourceCommit: 'old' }), JSON.stringify({ ...original, wallet: GODL_PROGRAM_ADDRESS })]) {
    await writeFile(f.options.cachePath, raw); await assert.rejects(refreshDailyYield(f.options));
    assert.equal(await readFile(f.options.cachePath, 'utf8'), raw);
  }
  assert.equal(f.calls.length, 0);
});

test('no network for same day, equal/regressed slots, or stale samples beyond two-day retention', async t => {
  const f = await fixture(t); await refreshDailyYield(f.options);
  later(f, '2026-10-16T12:00:00.000Z', SLOT + 1); await refreshDailyYield(f.options);
  later(f, '2026-10-17T00:01:00.000Z', SLOT); await refreshDailyYield(f.options);
  later(f, '2026-10-20T00:01:00.000Z', SLOT + 2); await refreshDailyYield(f.options);
  assert.equal(f.calls.length, 0);
  const cache = JSON.parse(await readFile(f.options.cachePath));
  assert.equal(cache.proof, undefined); assert.equal(cache.pending, undefined);
});

test('RPC null, future time, malformed response and oversized body leave midnight unknown', async t => {
  for (const response of [null, 'future', 'malformed', 'oversized']) {
    const f = await midnight(t);
    if (response === 'future') f.times.set(SLOT - 1, Date.parse('2026-10-16T00:00:00.000Z') / 1000);
    else if (response === null) f.times.set(SLOT - 1, null);
    else f.options.fetchImpl = async () => ({ ok: true, text: async () => response === 'malformed' ? '{bad' : ' '.repeat(128 * 1024 + 1) });
    assert.equal(await refreshDailyYield(f.options), undefined);
    await assert.rejects(readFile(f.options.boundaryPath), { code: 'ENOENT' });
  }
});

test('stalled block-time transport has a two-second deadline and backs off', async t => {
  const f = await midnight(t); let calls = 0;
  f.options.fetchImpl = async () => { calls++; return new Promise(() => {}); };
  const start = performance.now();
  assert.equal(await refreshDailyYield(f.options), undefined);
  assert.ok(performance.now() - start >= 1900);
  assert.ok(performance.now() - start < 3500);
  assert.equal(calls, 1);
  await refreshDailyYield(f.options); assert.equal(calls, 1);
});

test('streamed response is cancelled as soon as the byte cap is exceeded', async t => {
  const f = await midnight(t); let reads = 0, cancelled = false;
  f.options.fetchImpl = async () => ({ ok: true, body: { getReader: () => ({
    read: async () => { reads++; return { done: false, value: Buffer.alloc(128 * 1024 + 1) }; },
    cancel: async () => { cancelled = true; },
  }) } });
  assert.equal(await refreshDailyYield(f.options), undefined);
  assert.equal(reads, 1); assert.equal(cancelled, true);
});

test('retained proof tampering is rejected before either cache or opening is rewritten', async t => {
  const f = await midnight(t); await refreshDailyYield(f.options);
  const original = JSON.parse(await readFile(f.options.cachePath));
  const boundary = await readFile(f.options.boundaryPath, 'utf8');
  original.proof.before.gold.baseUnits = '999';
  const raw = JSON.stringify(original); await writeFile(f.options.cachePath, raw);
  await assert.rejects(refreshDailyYield(f.options));
  assert.equal(await readFile(f.options.cachePath, 'utf8'), raw);
  assert.equal(await readFile(f.options.boundaryPath, 'utf8'), boundary);
});
