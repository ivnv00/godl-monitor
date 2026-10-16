// Generated synthetic balances, addresses and history only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { projectEarnings } from './earnings.mjs';
import { extendFundedAccounting, fundedCheckpointHash, projectFundedPosition } from './funded-accounting.mjs';
import { extendClosedAccounting } from './ongoing-cost.mjs';
import { accountingFixture, indexedRow } from './test-fixtures/accounting.mjs';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const delta = (address, before, after) => ({ address, status: 'observed',
  beforeLamports: String(before), afterLamports: String(after),
  changeLamports: String(BigInt(after) - BigInt(before)) });
const nowMs = Date.parse('2026-01-02T11:01:00.000Z');
const market = { observedAt: '2026-01-02T11:00:00.000Z', expiresAt: '2026-01-02T11:02:00.000Z',
  source: 'DEX Screener', reason: null, goldReference: { source: 'CoinGecko', assetId: 'tether-gold',
    priceUsd: '10', observedAt: '2026-01-02T11:00:00.000Z' }, quotes: [
    { asset: 'GODL', mint: 'GodL6KZ9uuUoQwELggtVzQkKmU1LfqmDokPibPeDKkhF',
      priceUsd: '2', pairAddress: 'synthetic-godl-pair', dexId: 'synthetic-dex' },
    { asset: 'XAUt0', mint: 'AymATz4TCL9sWNEEV9Kvyz45CHVhDZ6kUgjTJPzLpU9P',
      priceUsd: '10', pairAddress: 'synthetic-gold-pair', dexId: 'synthetic-dex' },
  ] };

async function history(route = 'wallet') {
  const fixture = await accountingFixture();
  const closed = extendClosedAccounting({ previous: fixture.anchor, interval: fixture.interval, candles: fixture.candles });
  function step(previous, { slot, walletChange, minerLamports, miner, price, opcode = '2B', automationLamports = 0 }) {
    const closing = structuredClone(previous.closing);
    closing.context.slot = String(slot);
    closing.observedAt = new Date(Date.parse(closed.closing.observedAt) + (slot - 30) * 60_000).toISOString();
    Object.assign(closing.accounts.miner.value, miner);
    closing.accounts.miner.lamports = String(minerLamports ?? previous.closing.accounts.miner.lamports);
    closing.accounts.treasury.value.totalUnclaimed = closing.accounts.miner.value.rewardsGodl;
    if (automationLamports) closing.accounts.automation = {
      address: fixture.trackedAccounts.automation, status: 'present', lamports: String(automationLamports),
      value: { authority: fixture.wallet, balance: String(automationLamports) },
    };
    const tx = structuredClone(fixture.interval.transactions[0]);
    Object.assign(tx, { signature: String(slot).repeat(44), slot: String(slot - 5),
      blockTime: Date.parse(closing.observedAt) / 1000 - 300 });
    tx.godlInstructions[0].dataBase58 = opcode;
    tx.deltas.wallet = delta(fixture.wallet, 1_000_000_000, 1_000_000_000 + walletChange);
    tx.deltas.miner = delta(fixture.trackedAccounts.miner, previous.closing.accounts.miner.lamports, closing.accounts.miner.lamports);
    tx.deltas.automation = delta(fixture.trackedAccounts.automation,
      previous.closing.accounts.automation.lamports ?? 0, automationLamports);
    const interval = { wallet: fixture.wallet, trackedAccounts: fixture.trackedAccounts,
      fromExclusiveSlot: previous.closing.context.slot, toInclusiveSlot: String(slot),
      opening: structuredClone(previous.closing), closing,
      pages: Object.fromEntries(Object.entries(fixture.trackedAccounts).map(([role, address]) =>
        [role, { address, exhausted: true, rows: [indexedRow(tx)] }])), transactions: [tx] };
    return extendFundedAccounting({ previous, interval,
      candles: [[tx.blockTime, price, price, price, price, 1]] });
  }
  const deployed = Array(25).fill('0'); deployed[0] = '20000000';
  const pending = step(closed, { slot: 40, walletChange: -20_005_000, price: 200,
    miner: { roundId: '2', deployed, lifetimeDeployed: '20000000' } });
  const stored = step(pending, { slot: 50, walletChange: -5000, price: 100, opcode: '29', minerLamports: 1_000_010,
    miner: { checkpointId: '2', rewardsSol: '1000000', lifetimeRewardsSol: '1000000',
      rewardsGodl: '1300000000000', lifetimeRewardsGodl: '1300000000000' } });
  const combined = step(stored, { slot: 60, walletChange: -10_005_000, price: 100,
    miner: { roundId: '3', deployed: ['10000000', ...Array(24).fill('0')], lifetimeDeployed: '30000000' } });
  const claimed = step(stored, { slot: 60, price: 300, opcode: route === 'wallet' ? '4' : 'U',
    walletChange: route === 'wallet' ? 985_000 : -5000,
    automationLamports: route === 'wallet' ? 0 : 999_500, minerLamports: 10,
    miner: { rewardsSol: '0', lastClaimSolAt: '1767351300' } });
  const reopened = step(claimed, { slot: 70, walletChange: -10_005_000, price: 100,
    automationLamports: route === 'wallet' ? 0 : 999_500,
    miner: { roundId: '3', deployed: ['10000000', ...Array(24).fill('0')], lifetimeDeployed: '30000000' } });
  return { anchor: fixture.anchor, closed, pending, stored, combined, claimed, reopened };
}

function input(chain, checkpoints) {
  const latest = checkpoints.at(-1);
  return { snapshot: latest.closing, checkpoint: chain.closed, checkpoints: [chain.anchor, chain.closed],
    fundedCheckpoint: latest, fundedCheckpoints: checkpoints, market, timeZone: 'UTC', nowMs };
}

test('pending deployment and gross stored SOL update cash position while retaining the dated settled net', async () => {
  const chain = await history();
  for (const [checkpoints, cost, storedSol, pending] of [
    [[chain.pending], '17.002000', '0', true],
    [[chain.pending, chain.stored], '17.002500', '1000000', false],
    [[chain.pending, chain.stored, chain.combined], '18.003000', '1000000', true],
  ]) {
    const result = projectEarnings(input(chain, checkpoints));
    assert.equal(result.schemaVersion, 2);
    assert.deepEqual(result.position, projectFundedPosition(checkpoints.at(-1)));
    assert.equal(result.position.netSpendUsd, cost);
    assert.equal(result.position.storedSol.lamports, storedSol);
    assert.equal(Boolean(result.position.pendingRound), pending);
    assert.equal(result.position.netReady, false);
    assert.equal(result.total.throughSlot, '30');
    assert.equal(result.total.throughAt, chain.closed.closing.observedAt);
    assert.equal(result.total.netSpendUsd, '13.001000');
    assert.equal(result.total.netPnlUsd, '10.999000');
    assert.equal(result.days[0].throughSlot, '30');
    assert.equal(result.days[0].netSpendUsd, '3.000500');
    assert.equal(result.days[0].netRewardUsd, '2.999500');
    assert.ok(result.holdings.unrefinedUsd);
  }
  const pending = projectEarnings(input(chain, [chain.pending]));
  assert.deepEqual(pending.position.pendingRound, { roundId: '2',
    deployedSol: { lamports: '20000000', display: '0.020000000' } });
  assert.equal(pending.position.netSpendSol, '0.150015000');
  const stored = projectEarnings(input(chain, [chain.pending, chain.stored]));
  assert.equal(stored.position.pendingRound, undefined, 'matching markers settle the retained grid');
  assert.equal(stored.position.storedSol.display, '0.001000000');
});

test('wallet and automation SOL claims credit actual receipts once and reconnect settled daily cost coverage', async () => {
  for (const [route, netSpendUsd, netSpendSol] of [
    ['wallet', '16.707000', '0.149035000'],
    ['automation', '16.704150', '0.149025500'],
  ]) {
    const chain = await history(route);
    const result = projectEarnings(input(chain, [chain.pending, chain.stored, chain.claimed]));
    assert.equal(result.position.netReady, true);
    assert.equal(result.position.storedSol.lamports, '0');
    assert.equal(result.position.pendingRound, undefined);
    assert.equal(result.position.netSpendUsd, netSpendUsd);
    assert.equal(result.position.netSpendSol, netSpendSol);
    assert.equal(result.total.throughSlot, '60');
    assert.equal(result.total.netSpendUsd, netSpendUsd);
    assert.equal(result.total.rewardValueUsd, '26.000000');
    assert.equal(result.days[0].throughSlot, '60');
    assert.equal(result.days[0].netSpendUsd, route === 'wallet' ? '6.706500' : '6.703650');
    const reopened = projectEarnings(input(chain, [chain.pending, chain.stored, chain.claimed, chain.reopened]));
    assert.equal(reopened.position.netReady, false);
    assert.equal(reopened.position.throughSlot, '70');
    assert.equal(reopened.total.throughSlot, '60');
    assert.equal(reopened.total.netSpendUsd, netSpendUsd);
    assert.deepEqual(reopened.days[0], result.days[0]);
  }
});

test('expired quotes preserve open position and historical cash cost without fabricating a current reward value', async () => {
  const chain = await history();
  const options = input(chain, [chain.pending, chain.stored]);
  const fresh = projectEarnings(options);
  const result = projectEarnings({ ...options, market: { ...market, expiresAt: new Date(nowMs).toISOString() } });
  assert.deepEqual(result.position, fresh.position);
  assert.equal(result.position.netSpendUsd, '17.002500');
  assert.equal(result.total.throughSlot, '30');
  assert.equal(result.total.netSpendUsd, '13.001000');
  assert.equal(result.total.netPnlUsd, undefined);
  assert.equal(result.days[0].netSpendUsd, '3.000500');
  assert.equal(result.days[0].netRewardUsd, undefined);
  assert.deepEqual(result.holdings, {});
});

test('all open checkpoints remain required and validated even though net selects settled boundaries', async () => {
  const chain = await history();
  const options = input(chain, [chain.pending, chain.stored, chain.claimed]);
  assert.throws(() => projectEarnings({ ...options, fundedCheckpoints: [chain.pending, chain.claimed] }), /Broken earnings/);
  const corrupt = structuredClone(chain.stored);
  corrupt.closing.accounts.miner.value.rewardsSol = '1000001';
  assert.throws(() => projectEarnings({ ...options, fundedCheckpoints: [chain.pending, corrupt, chain.claimed] }), /provenance/);
});

test('legacy terminal funded checkpoints retain schema 1 and their original ledger hash meaning', async () => {
  const chain = await history();
  // One terminal checkpoint linked directly to the closed anchor, as written by v1.
  const legacy = structuredClone(chain.claimed);
  legacy.schemaVersion = 1; legacy.ledger.schemaVersion = 1;
  legacy.ledger.previousCheckpointSha256 = digest(chain.closed.receipt);
  legacy.ledger.lastInterval.fromExclusiveSlot = chain.closed.closing.context.slot;
  const before = JSON.stringify(legacy);
  const hash = fundedCheckpointHash(legacy);
  const result = projectEarnings(input(chain, [legacy]));
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.position, undefined);
  assert.equal(result.total.throughSlot, '60');
  assert.equal(result.total.netSpendUsd, '16.707000');
  assert.equal(JSON.stringify(legacy), before);
  assert.equal(fundedCheckpointHash(legacy), hash);
  assert.equal(hash, digest(legacy.ledger));
});
