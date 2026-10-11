// Generated synthetic account keys, times and monetary values only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { accountingFixture, indexedRow } from './test-fixtures/accounting.mjs';
import { extendFundedAccounting, projectFundedPosition, validateFundedCheckpoint } from './funded-accounting.mjs';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function pending(f) {
  Object.assign(f.interval.closing.accounts.miner.value, { rewardsGodl:'1000000000000', lifetimeRewardsGodl:'1000000000000', roundId:'1' });
  f.interval.closing.accounts.miner.value.deployed[0]='30000000';
  return extendFundedAccounting({previous:f.anchor,interval:f.interval,candles:f.candles});
}

test('pending deployment records exact cost and stake without declaring an outcome', async () => {
  const f=await accountingFixture(), before=JSON.stringify(f.anchor);
  const next=pending(f), position=projectFundedPosition(next);
  assert.equal(next.schemaVersion,2); assert.equal(next.ledger.schemaVersion,2);
  assert.equal(position.netSpendSol,'0.130010000');
  assert.equal(position.netSpendUsd,'13.001000');
  assert.deepEqual(position.pendingRound,{roundId:'1',deployedSol:{lamports:'30000000',display:'0.030000000'}});
  assert.deepEqual(position.storedSol,{lamports:'0',display:'0.000000000'});
  assert.equal(position.netReady,false);
  assert.match(position.reason,/unknown/);
  assert.equal(next.ledger.newRentLamports,'0');
  assert.equal(JSON.stringify(f.anchor),before);
  assert.equal(next.ledger.previousCheckpointSha256,digest(f.anchor.receipt));
});

test('terminal loss and zero-grid markers resolve stake without inventing SOL rewards', async () => {
  for (const clearedGrid of [false, true]) {
    const f = await accountingFixture(), first = pending(f);
    const interval = structuredClone(f.interval);
    interval.fromExclusiveSlot = '30'; interval.toInclusiveSlot = '40';
    interval.closing = structuredClone(first.closing); interval.closing.context.slot = '40';
    interval.closing.accounts.miner.value.checkpointId = '1';
    if (clearedGrid) interval.closing.accounts.miner.value.deployed.fill('0');
    const tx = interval.transactions[0]; tx.slot = '35'; tx.signature = 'z'.repeat(88);
    tx.godlInstructions[0].dataBase58 = '29'; // CheckpointWithMinerExtended
    tx.feePayer = f.trackedAccounts.miner; tx.ownerPaidNetworkFeeLamports = '0';
    tx.deltas.wallet = { address: f.wallet, status: 'not-in-transaction' };
    for (const [role, page] of Object.entries(interval.pages)) page.rows = role === 'wallet' ? [] : [indexedRow(tx)];
    const next = extendFundedAccounting({ previous:first, interval });
    assert.equal(projectFundedPosition(next).netReady, true);
    assert.equal(projectFundedPosition(next).storedSol.lamports, '0');
    assert.equal(next.ledger.netCostLamports, first.ledger.netCostLamports);
  }
});

test('malformed round amounts, custody underflow and unsupported versions do not become a position', async () => {
  for (const mutate of [
    m => { m.roundId = '01'; }, m => { m.checkpointId = '2'; },
    m => { m.deployed[0] = '-1'; }, m => { m.deployed[0] = '18446744073709551616'; },
    m => { m.deployed.pop(); }, m => { m.rewardsSol = '11'; },
    m => { delete m.rewardsSol; }, m => { m.checkpointFee = '11'; },
  ]) {
    const f = await accountingFixture(); pending(f); mutate(f.interval.closing.accounts.miner.value);
    assert.throws(() => extendFundedAccounting({ previous:f.anchor, interval:f.interval, candles:f.candles }));
  }
  const f = await accountingFixture(), next = pending(f);
  for (const version of [1, 3]) {
    const c = structuredClone(next); c.schemaVersion = version; c.ledger.schemaVersion = version;
    assert.throws(() => validateFundedCheckpoint(c));
  }
});

test('schema 1 terminal ledger can advance to schema 2 without rewriting its hashes or anchor', async () => {
  const f = await accountingFixture();
  const legacy = extendFundedAccounting({ previous:f.anchor, interval:f.interval, candles:f.candles });
  legacy.schemaVersion = 1; legacy.ledger.schemaVersion = 1;
  validateFundedCheckpoint(legacy);
  const before = JSON.stringify(legacy), interval = structuredClone(f.interval);
  interval.fromExclusiveSlot = '30'; interval.toInclusiveSlot = '40';
  interval.closing = structuredClone(legacy.closing); interval.closing.context.slot = '40';
  interval.transactions = []; for (const page of Object.values(interval.pages)) page.rows = [];
  const next = extendFundedAccounting({ previous:legacy, interval });
  assert.equal(next.schemaVersion, 2);
  assert.equal(next.ledger.previousCheckpointSha256, digest(legacy.ledger));
  assert.equal(JSON.stringify(legacy), before);
  assert.deepEqual(next.anchor, legacy.anchor);
  assert.equal(next.ledger.netCostLamports, legacy.ledger.netCostLamports);
});
