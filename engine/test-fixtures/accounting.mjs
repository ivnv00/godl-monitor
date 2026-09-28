// Generated test data only. Every account comes from a repeated-byte public key
// or its protocol PDA; amounts and timestamps are deliberately hand-computable.
import { getAddressDecoder } from '@solana/addresses';
import { deriveAddresses, GODL_PROGRAM_ADDRESS, GODL_SOURCE_COMMIT } from '../chain.mjs';
import { MAINNET_GENESIS } from '../monitor.mjs';
import { reconcileClosedPeriod } from '../period-cost.mjs';
import { projectTransaction } from '../transaction-evidence.mjs';

export const wallet = getAddressDecoder().decode(Buffer.alloc(32, 7));
const factor = { rawBits: '0', fractionalBits: 48 };
const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const code = n => n < 58 ? alphabet[n] : alphabet[Math.floor(n / 58)] + alphabet[n % 58];
const seconds = iso => Date.parse(iso) / 1000;

export function rawMiningTransaction(trackedAccounts, { signature, slot, blockTime, change, opcode = 68 }) {
  const keys = [...Object.values(trackedAccounts), GODL_PROGRAM_ADDRESS];
  const balances = [1_000_000_000, 10, 20, 0, 0, 1];
  return {
    slot, blockTime, transactionIndex: 0, version: 'legacy',
    transaction: { signatures: [signature], message: { accountKeys: keys,
      instructions: [{ programIdIndex: 5, accounts: [0, 1], data: code(opcode) }] } },
    meta: { err: null, fee: 5000, preBalances: balances,
      postBalances: [balances[0] + change, ...balances.slice(1)],
      innerInstructions: [], loadedAddresses: { writable: [], readonly: [] } },
  };
}

export function indexedRow(transaction) {
  return { signature: transaction.signature, slot: transaction.slot,
    blockTime: transaction.blockTime, transactionIndex: transaction.transactionIndex,
    err: transaction.error, confirmationStatus: 'finalized' };
}

export async function accountingFixture() {
  const derived = await deriveAddresses(wallet);
  const trackedAccounts = Object.fromEntries(['wallet', 'miner', 'minerExtended', 'automation', 'automationV2']
    .map(role => [role, role === 'wallet' ? wallet : derived[role].address]));
  const snapshot = (slot, observedAt, principal, refined, gold) => ({
    wallet, genesisHash: MAINNET_GENESIS, commitment: 'finalized',
    programAddress: GODL_PROGRAM_ADDRESS, sourceCommit: GODL_SOURCE_COMMIT,
    context: { slot: String(slot) }, observedAt,
    accounts: {
      miner: { address: trackedAccounts.miner, status: 'present', lamports: '10', value: {
        authority: wallet, referrer: getAddressDecoder().decode(Buffer.alloc(32)),
        deployed: Array(25).fill('0'), cumulative: Array(25).fill('0'),
        checkpointFee: '0', checkpointId: '0', lastClaimGodlAt: String(seconds('2026-01-02T08:00:00.000Z')),
        lastClaimSolAt: '0', rewardsFactor: { ...factor }, rewardsSol: '0',
        rewardsGodl: principal, refinedGodl: refined, roundId: '0',
        lifetimeDeployed: '0', lifetimeRewardsSol: '0', lifetimeRewardsGodl: principal,
      } },
      minerExtended: { address: trackedAccounts.minerExtended, status: 'present', lamports: '20', value: {
        authority: wallet, xautRewardsFactor: { ...factor }, xautRewards: gold, lifetimeXaut: gold,
      } },
      automation: { address: trackedAccounts.automation, status: 'missing' },
      automationV2: { address: trackedAccounts.automationV2, status: 'missing' },
      treasury: { address: derived.treasury.address, status: 'present', lamports: '1', value: {
        minerRewardsFactor: { ...factor }, totalUnclaimed: principal,
      } },
      goldVault: { address: derived.goldVault.address, status: 'present', lamports: '1', value: {
        xautRewardsFactor: { ...factor },
      } },
    },
  });
  const project = raw => ({ ...projectTransaction(raw, { wallet, trackedAccounts,
    expectedSignature: raw.transaction.signatures[0], expectedSlot: String(raw.slot) }),
  transactionIndex: 0, outerPrograms: [GODL_PROGRAM_ADDRESS] });
  const initial = project(rawMiningTransaction(trackedAccounts, { signature: '2'.repeat(88), slot: 10,
    blockTime: seconds('2026-01-02T09:00:00.000Z'), change: -100_005_000 }));
  const baseline = { signature: '1'.repeat(88), slot: '1', blockTime: seconds('2026-01-02T08:00:00.000Z'),
    transactionIndex: 0, err: null, confirmationStatus: 'finalized' };
  const closing = snapshot(20, '2026-01-02T10:00:00.000Z', '1000000000000', '200000000000', '300000');
  const receipt = reconcileClosedPeriod({ wallet, trackedAccounts,
    pages: Object.fromEntries(['wallet', 'miner', 'automation', 'automationV2']
      .map(role => [role, [indexedRow(initial), { ...baseline }]])),
    transactions: [initial], baselineClaim: { ...baseline, status: 'observed', outcome: 'succeeded',
      godlInstructions: [{ dataBase58: code(4), accounts: [trackedAccounts.miner] }] },
    closing, candles: [[initial.blockTime, 100, 100, 100, 100, 1]], startSlot: '10', ownerConfirmedZeroOpening: true,
  });
  const anchor = { schemaVersion: 1, kind: 'godl-accounting-checkpoint', receipt, closing,
    status: { state: 'current', checkedAt: closing.observedAt, verifiedAt: closing.observedAt,
      verifiedThroughSlot: '20', reason: 'Synthetic reviewed anchor' } };
  const rawTransaction = rawMiningTransaction(trackedAccounts, { signature: '3'.repeat(88), slot: 25,
    blockTime: seconds('2026-01-02T10:05:00.000Z'), change: -30_005_000 });
  const transaction = project(rawTransaction);
  const interval = { wallet, trackedAccounts, fromExclusiveSlot: '20', toInclusiveSlot: '30',
    opening: structuredClone(closing),
    closing: snapshot(30, '2026-01-02T10:10:00.000Z', '1200000000000', '250000000000', '400000'),
    pages: Object.fromEntries(Object.entries(trackedAccounts).map(([role, address]) => [role,
      { address, rows: [indexedRow(transaction)], exhausted: true }])),
    transactions: [transaction] };
  return { wallet, trackedAccounts, anchor, interval,
    candles: [[transaction.blockTime, 100, 100, 100, 100, 1]], rawTransaction };
}
