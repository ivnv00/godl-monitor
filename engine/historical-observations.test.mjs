// Generated synthetic accounts, amounts and dates only.
import assert from 'node:assert/strict';
import test from 'node:test';
import { performance } from 'node:perf_hooks';
import { getAddressDecoder } from '@solana/addresses';
import { GODL_PROGRAM_ADDRESS, GODL_SOURCE_COMMIT } from './chain.mjs';
import { MAINNET_GENESIS } from './monitor.mjs';
import { ObservationStore } from './observation-store.mjs';

const address = byte => getAddressDecoder().decode(Buffer.alloc(32, byte));
const wallet = address(7);
const options = { wallet, genesisHash: MAINNET_GENESIS, fromSlot: '0', toSlot: '20000',
  days: ['2026-01-01', '2026-01-02'], timeZone: 'UTC' };

function snapshot(slot, observedAt = '2026-01-02T12:00:00.000Z') {
  return { wallet, genesisHash: MAINNET_GENESIS, commitment: 'finalized',
    programAddress: GODL_PROGRAM_ADDRESS, sourceCommit: GODL_SOURCE_COMMIT,
    context: { slot: String(slot) }, observedAt,
    accounts: {
      miner: { address: address(8), status: 'present', lamports: '10', value: {
        authority: wallet, rewardsSol: '0', rewardsGodl: '1', checkpointFee: '0',
        roundId: '7', checkpointId: '7', deployed: Array(25).fill('0'),
      } },
      minerExtended: { address: address(9), status: 'missing' },
      automation: { address: address(10), status: 'missing' },
      automationV2: { address: address(11), status: 'missing' },
    } };
}

// Direct insertion also models legacy or damaged rows append() would reject.
function insert(store, value, { slot = value.context?.slot, rowWallet = wallet,
  rowGenesis = MAINNET_GENESIS, json = JSON.stringify(value) } = {}) {
  store.database.prepare(`INSERT INTO observations VALUES (?, ?, ?, ?, ?)`)
    .run(rowWallet, rowGenesis, String(slot).padStart(20, '0'), 'synthetic-hash', json);
}

const slots = results => results.map(item => item.context.slot);
function useStore(t) {
  const store = new ObservationStore();
  t.after(() => store.close());
  return store;
}

test('selects actual first/last day boundaries beyond the list limit without mutating the database', t => {
  const store = useStore(t), count = 12050;
  const statement = store.database.prepare(`INSERT INTO observations VALUES (?, ?, ?, ?, ?)`);
  store.database.exec('BEGIN');
  for (let slot = 1; slot <= count; slot++) {
    const start = Date.parse(slot <= 2000 ? '2026-01-01T00:00:00.000Z' : '2026-01-02T00:00:00.000Z');
    const value = snapshot(slot, new Date(start + (slot <= 2000 ? slot : slot - 2000) * 5000).toISOString());
    statement.run(wallet, MAINNET_GENESIS, String(slot).padStart(20, '0'), 'synthetic-hash', JSON.stringify(value));
  }
  store.database.exec('COMMIT');
  assert.equal(store.list({ ...options, limit: 10000 })[0].context.slot, '2051');
  const before = store.database.prepare('SELECT total_changes() AS changes').get().changes;
  const schema = store.database.prepare('SELECT sql FROM sqlite_schema ORDER BY name').all();
  const started = performance.now();
  let decoded = 0;
  const parse = JSON.parse;
  JSON.parse = (...args) => { decoded++; return parse(...args); };
  let result;
  try { result = store.accountingBoundaries(options); } finally { JSON.parse = parse; }
  t.diagnostic(`12050 saved snapshots selected in ${(performance.now() - started).toFixed(1)} ms; ${decoded} full snapshots decoded`);
  assert.deepEqual(slots(result), ['1', '2000', '2001', '12050']);
  assert.deepEqual(result[0], snapshot(1, '2026-01-01T00:00:05.000Z'));
  assert.ok(decoded <= 4, 'decode full JSON only for boundary candidates');
  assert.equal(store.database.prepare('SELECT total_changes() AS changes').get().changes, before);
  assert.deepEqual(store.database.prepare('SELECT sql FROM sqlite_schema ORDER BY name').all(), schema);
  assert.equal(store.database.prepare('SELECT count(*) AS count FROM observations').get().count, count);
});

test('filters pending, stored, identity mismatches and unknown states while retaining settled grids', t => {
  const store = useStore(t);
  const changes = [
    s => { s.sourceCommit = 'synthetic-other-source'; },
    s => { s.programAddress = address(20); },
    s => { s.genesisHash = 'synthetic-other-network'; },
    s => { s.wallet = address(21); },
    s => { s.commitment = 'confirmed'; },
    s => { s.accounts.miner.value.rewardsSol = '1'; },
    s => { s.accounts.miner.value.deployed[0] = '1'; s.accounts.miner.value.checkpointId = '6'; },
    s => { s.accounts.automation.status = 'unknown'; },
  ];
  changes.forEach((change, index) => { const s = snapshot(index + 1); change(s); insert(store, s); });
  const settled = snapshot(9); settled.accounts.miner.value.deployed[0] = '5'; insert(store, settled);
  const zeroGrid = snapshot(10); delete zeroGrid.accounts.miner.value.roundId;
  delete zeroGrid.accounts.miner.value.checkpointId; insert(store, zeroGrid);
  insert(store, snapshot(11), { rowWallet: address(22) });
  insert(store, snapshot(12), { rowGenesis: 'synthetic-row-network' });
  assert.deepEqual(slots(store.accountingBoundaries(options)), ['9', '10']);
  assert.deepEqual(slots(store.accountingBoundaries({ ...options, funded: true })), ['9', '10']);
  assert.deepEqual(store.accountingBoundaries({ ...options, sourceCommit: 'synthetic-other-source' }), []);
  assert.deepEqual(store.accountingBoundaries({ ...options, programAddress: address(20) }), []);
  assert.deepEqual(store.accountingBoundaries({ ...options, genesisHash: 'synthetic-other-network' }), []);
});

test('closed mode excludes both automations; funded mode requires known reserves', t => {
  const store = useStore(t);
  const early = snapshot(1);
  early.accounts.automation = { ...early.accounts.automation, status: 'present', lamports: '10',
    value: { authority: wallet, balance: '5' } }; insert(store, early);
  insert(store, snapshot(2));
  const late = snapshot(3);
  late.accounts.automationV2 = { ...late.accounts.automationV2, status: 'present', lamports: '10',
    value: { authority: wallet, balance: '5' } }; insert(store, late);
  const invalid = structuredClone(late); invalid.context.slot = '4';
  invalid.accounts.automationV2.value.balance = '11'; insert(store, invalid);
  const missingReserve = structuredClone(late); missingReserve.context.slot = '5';
  delete missingReserve.accounts.automationV2.value.balance; insert(store, missingReserve);
  assert.deepEqual(slots(store.accountingBoundaries(options)), ['2']);
  assert.deepEqual(slots(store.accountingBoundaries({ ...options, funded: true })), ['1', '3']);
});

test('malformed candidates cannot suppress other valid saved evidence', t => {
  const store = useStore(t);
  insert(store, {}, { slot: '1', json: '{broken' });
  const unsafe = snapshot(2); unsafe.accounts.miner.value.checkpointFee = '01'; insert(store, unsafe);
  const badTime = snapshot(3); badTime.observedAt = '2026-01-02T99:00:00.000Z'; insert(store, badTime);
  insert(store, snapshot(4)); insert(store, snapshot(5));
  const mismatch = snapshot(6); mismatch.context.slot = '999'; insert(store, mismatch, { slot: '6' });
  const wrongOwner = snapshot(7); wrongOwner.accounts.miner.value.authority = address(23); insert(store, wrongOwner);
  const unsafeGrid = snapshot(8); unsafeGrid.accounts.miner.value.deployed[0] = '18446744073709551616'; insert(store, unsafeGrid);
  const impossible = snapshot(9); impossible.accounts.miner.value.checkpointId = '8'; insert(store, impossible);
  assert.deepEqual(slots(store.accountingBoundaries(options)), ['4', '5']);
});

test('supports seven requested days with at most two validated snapshots each', t => {
  const store = useStore(t), days = Array.from({ length: 7 }, (_, index) => `2026-01-0${index + 1}`);
  for (let index = 0; index < 21; index++) {
    insert(store, snapshot(index + 1, `${days[Math.floor(index / 3)]}T12:00:00.000Z`));
  }
  assert.deepEqual(slots(store.accountingBoundaries({ ...options, days })),
    ['1', '3', '4', '6', '7', '9', '10', '12', '13', '15', '16', '18', '19', '21']);
});

test('strict slot bounds return a single actual endpoint or none', t => {
  const store = useStore(t);
  for (const slot of [1, 2, 3]) insert(store, snapshot(slot));
  assert.deepEqual(slots(store.accountingBoundaries({ ...options, fromSlot: '1', toSlot: '3' })), ['2']);
  assert.deepEqual(store.accountingBoundaries({ ...options, fromSlot: '3', toSlot: '4' }), []);
  assert.deepEqual(store.accountingBoundaries({ ...options, days: [] }), []);
  assert.deepEqual(store.accountingBoundaries({ ...options, days: ['2026-01-03'] }), []);
});

test('day selection honors local midnight and a repeated DST hour', t => {
  const store = useStore(t);
  const times = ['2026-10-31T22:59:59.000Z', '2026-10-31T23:00:00.000Z',
    '2026-11-01T05:30:00.000Z', '2026-11-01T06:30:00.000Z',
    '2026-11-02T04:59:59.000Z', '2026-11-02T05:00:00.000Z'];
  times.forEach((time, index) => insert(store, snapshot(index + 1, time)));
  assert.deepEqual(slots(store.accountingBoundaries({ ...options, days: ['2026-11-01'], timeZone: 'America/New_York' })), ['3', '5']);
  assert.deepEqual(slots(store.accountingBoundaries({ ...options, days: ['2026-11-01'], timeZone: 'Europe/Sofia' })), ['1', '4']);
});

test('rejects invalid query bounds, day requests and time zones', t => {
  const store = useStore(t);
  for (const invalid of [
    { fromSlot: '5', toSlot: '4' }, { fromSlot: '5', toSlot: '5' },
    { fromSlot: '-1' }, { fromSlot: '01' }, { toSlot: 10 }, { toSlot: '18446744073709551616' },
    { days: ['2026-02-30'] }, { days: ['2026-1-1'] }, { days: '2026-01-01' },
    { days: Array(8).fill('2026-01-01') }, { timeZone: 'Synthetic/Unknown' },
    { timeZone: '+01:00' }, { funded: 'true' }, { sourceCommit: '' }, { programAddress: '' },
  ]) assert.throws(() => store.accountingBoundaries({ ...options, ...invalid }));
});
