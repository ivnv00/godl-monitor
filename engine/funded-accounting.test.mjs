import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { accountingFixture, indexedRow } from './test-fixtures/accounting.mjs';
import { extendFundedAccounting, fundedCheckpointHash, validateFundedCheckpoint } from './funded-accounting.mjs';
import { extendClosedAccounting } from './ongoing-cost.mjs';
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const delta = (address, before, after) => ({ address, status: 'observed', beforeLamports: String(before),
  afterLamports: String(after), changeLamports: String(BigInt(after) - BigInt(before)) });

async function funding() {
  const f = await accountingFixture();
  const tx = f.interval.transactions[0];
  tx.godlInstructions[0].dataBase58 = '24'; // AutomateV2, 61
  tx.deltas.automationV2 = delta(f.trackedAccounts.automationV2, 0, 30_000_000);
  f.interval.closing.accounts.automationV2 = { address: f.trackedAccounts.automationV2, status: 'present',
    lamports: '30000000', value: { authority: f.wallet, balance: '28000000' } };
  f.interval.closing.accounts.miner.value.rewardsGodl = f.anchor.closing.accounts.miner.value.rewardsGodl;
  return f;
}

function nextInterval(f, previous, { slot, walletChange, autoAfter, price, ownerPays = true, opcode = '2B', principal }) {
  const interval = structuredClone(f.interval), tx = interval.transactions[0];
  interval.fromExclusiveSlot = previous.closing.context.slot;
  interval.toInclusiveSlot = String(slot + 5);
  interval.closing = structuredClone(previous.closing);
  interval.closing.context.slot = String(slot + 5);
  interval.closing.observedAt = new Date(Date.parse(previous.closing.observedAt) + 600000).toISOString();
  tx.slot = String(slot); tx.signature = String(slot).repeat(44).slice(0, 88);
  tx.blockTime += (slot - 25) * 60;
  tx.godlInstructions[0].dataBase58 = opcode;
  tx.deltas.wallet = delta(f.wallet, 1_000_000_000, 1_000_000_000 + walletChange);
  tx.deltas.automationV2 = delta(f.trackedAccounts.automationV2, previous.closing.accounts.automationV2.lamports, autoAfter);
  if (!ownerPays) {
    tx.feePayer = f.trackedAccounts.miner; tx.ownerPaidNetworkFeeLamports = '0';
    tx.deltas.wallet = { address: f.wallet, status: 'not-in-transaction' };
  }
  interval.closing.accounts.automationV2 = autoAfter === 0 ? { address: f.trackedAccounts.automationV2, status: 'missing' }
    : { address: f.trackedAccounts.automationV2, status: 'present', lamports: String(autoAfter),
      value: { authority: f.wallet, balance: String(autoAfter - 2_000_000) } };
  interval.closing.accounts.miner.value.rewardsGodl = principal ?? previous.closing.accounts.miner.value.rewardsGodl;
  interval.pages = Object.fromEntries(Object.entries(f.trackedAccounts).map(([role, address]) =>
    [role, { address, exhausted: true, rows: role === 'wallet' && !ownerPays ? [] : [indexedRow(tx)] }]));
  return { interval, candles: [[tx.blockTime, price, price, price, price, 1]] };
}

test('funding excludes automation escrow and refundable rent, preserving exact reviewed prefix', async () => {
  const f = await funding(), original = JSON.stringify(f.anchor);
  const next = extendFundedAccounting({ previous: f.anchor, interval: f.interval, candles: f.candles });
  assert.equal(next.ledger.netCostLamports, '100010000');
  assert.equal(next.ledger.netUsdLamportMicro, '10001000000000000');
  assert.equal(next.ledger.newRentLamports, '0');
  assert.equal(next.ledger.ownerNetworkFeesLamports, '10000');
  assert.equal(next.ledger.previousCheckpointSha256, digest(f.anchor.receipt));
  assert.equal(JSON.stringify(f.anchor), original);
  assert.deepEqual(next.anchor, f.anchor);
  assert.throws(() => extendClosedAccounting({ previous: f.anchor, interval: f.interval, candles: f.candles }), /Waiting/);
});

test('automated consumption uses event prices without wallet movement; closure refunds cancel capital', async () => {
  const f = await funding();
  const funded = extendFundedAccounting({ previous: f.anchor, interval: f.interval, candles: f.candles });
  const spend = nextInterval(f, funded, { slot: 35, walletChange: 0, autoAfter: 20_000_000, price: 200, ownerPays: false, principal: '1200000000000' });
  const consumed = extendFundedAccounting({ previous: funded, ...spend });
  assert.equal(consumed.ledger.netCostLamports, '110010000');
  assert.equal(consumed.ledger.netUsdLamportMicro, '12001000000000000');
  assert.equal(consumed.ledger.previousCheckpointSha256, fundedCheckpointHash(funded));
  assert.equal(consumed.ledger.ownerNetworkFeesLamports, '10000');
  const refund = nextInterval(f, consumed, { slot: 45, walletChange: 19_995_000, autoAfter: 0, price: 300, opcode: 'e' }); // CloseAutomation, 37
  const closed = extendFundedAccounting({ previous: consumed, ...refund });
  assert.equal(closed.ledger.netCostLamports, '110015000');
  assert.equal(closed.ledger.netUsdLamportMicro, '12002500000000000');
  assert.equal(closed.ledger.ownerNetworkFeesLamports, '15000');
  assert.equal(closed.kind, 'godl-funded-accounting-checkpoint');
  assert.equal(closed.ledger.anchorReceiptSha256, digest(f.anchor.receipt));
});

test('pending funds, corrupt provenance, unknown reserves and uncovered costs stay unknown', async () => {
  for (const mutate of [
    f => { f.interval.closing.accounts.miner.value.deployed[0] = '1'; f.interval.closing.accounts.miner.value.roundId = '2'; },
    f => { f.interval.closing.accounts.miner.value.rewardsSol = '1'; },
    f => { f.interval.closing.accounts.automationV2.value.balance = '30000001'; },
    f => { delete f.interval.closing.accounts.automationV2.value.balance; },
    f => { f.interval.transactions = []; },
    f => { f.candles = []; },
  ]) {
    const f = await funding(); mutate(f);
    assert.throws(() => extendFundedAccounting({ previous: f.anchor, interval: f.interval, candles: f.candles }));
  }
  const f = await funding(), next = extendFundedAccounting({ previous: f.anchor, interval: f.interval, candles: f.candles });
  for (const mutate of [
    c => { c.closing.accounts.automationV2.lamports = '30000001'; },
    c => { c.ledger.netCostLamports = '0'; },
    c => { c.ledger.previousCheckpointSha256 = '0'.repeat(64); },
    c => { c.anchor.receipt.acquisitionPeriod.netSpendSol = '0'; },
  ]) { const c = structuredClone(next); mutate(c); assert.throws(() => validateFundedCheckpoint(c)); }
});


test('actual SOL return routes reduce cost by received amounts, including referral deductions', async () => {
  for (const route of ['wallet', 'automation']) {
    const f = await funding();
    const funded = extendFundedAccounting({ previous: f.anchor, interval: f.interval, candles: f.candles });
    const returned = nextInterval(f, funded, { slot: 35,
      walletChange: route === 'wallet' ? 990000 : -5000,
      autoAfter: route === 'wallet' ? 30_000_000 : 30_999_500,
      price: 100, opcode: route === 'wallet' ? '4' : 'U' }); // 3 ClaimSOL / 27 ClaimSOLAndFundAutomation
    // Stored SOL accrual/claim occurs inside the interval; both endpoints remain zero.
    const next = extendFundedAccounting({ previous: funded, ...returned });
    assert.equal(next.ledger.netCostLamports, route === 'wallet' ? '99020000' : '99015500');
  }
});

test('prepaid checkpoint fee is not charged twice and actual owner recovery reduces cost', async () => {
  for (const ownerPays of [false, true]) {
    const f = await funding();
    for (const snapshot of [f.anchor.closing, f.interval.closing]) {
      snapshot.accounts.miner.lamports = '10010'; snapshot.accounts.miner.value.checkpointFee = '10000';
    }
    f.interval.transactions[0].deltas.miner = delta(f.trackedAccounts.miner, 10010, 10010);
    const funded = extendFundedAccounting({ previous: f.anchor, interval: f.interval, candles: f.candles });
    const checkpoint = nextInterval(f, funded, { slot: 35, walletChange: ownerPays ? 5000 : 0,
      autoAfter: 30_000_000, price: 100, ownerPays, opcode: '29' });
    checkpoint.interval.transactions[0].deltas.miner = delta(f.trackedAccounts.miner, 10010, 10);
    checkpoint.interval.closing.accounts.miner.lamports = '10';
    checkpoint.interval.closing.accounts.miner.value.checkpointFee = '0';
    const next = extendFundedAccounting({ previous: funded, ...checkpoint });
    assert.equal(next.ledger.netCostLamports, ownerPays ? '100005000' : funded.ledger.netCostLamports);
    assert.equal(next.ledger.newRentLamports, funded.ledger.newRentLamports);
  }
});

test('failed funding charges only owner fee and never mutates escrow', async () => {
  const f = await funding(), tx = f.interval.transactions[0];
  tx.outcome = 'failed'; tx.error = { InstructionError: [0, 'Custom'] };
  tx.deltas.wallet = delta(f.wallet, 1_000_000_000, 999_995_000);
  tx.deltas.automationV2 = delta(f.trackedAccounts.automationV2, 0, 0);
  f.interval.closing.accounts.automationV2 = structuredClone(f.anchor.closing.accounts.automationV2);
  for (const page of Object.values(f.interval.pages)) page.rows = [indexedRow(tx)];
  const next = extendFundedAccounting({ previous: f.anchor, interval: f.interval, candles: f.candles });
  assert.equal(next.ledger.netCostLamports, '100010000');
  tx.deltas.automationV2 = delta(f.trackedAccounts.automationV2, 0, 1);
  assert.throws(() => extendFundedAccounting({ previous: f.anchor, interval: f.interval, candles: f.candles }), /Failed transaction mutated/);
});
