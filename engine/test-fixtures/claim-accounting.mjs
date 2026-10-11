// Generated synthetic evidence only; no saved wallet, RPC or accounting data.
import { createHash } from 'node:crypto';
import { accountingFixture, indexedRow } from './accounting.mjs';
import { claimFixture } from './claim-evidence.mjs';
import { projectGodlClaim } from '../claim-evidence.mjs';
import { projectTransaction } from '../transaction-evidence.mjs';
import { GODL_PROGRAM_ADDRESS } from '../chain.mjs';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Existing reviewed carry-in: 10 unrefined + 2 refined GODL. */
export async function claimAccountingFixture({ amount = '1200000000000', amounts,
  count = 1, referral = false, sameSecond = false, closingUnrefined = '300000000000',
  closingRefined = '100000000000', computeBudget = false } = {}) {
  const f = await accountingFixture();
  amounts ??= Array(count).fill(amount);
  if (!amounts.length) throw new Error('Claim fixture requires a claim');
  const opening = structuredClone(f.anchor.closing);
  const closing = structuredClone(opening);
  const rawTransactions = [], transactions = [], godlClaims = [];
  for (const [i, value] of amounts.entries()) {
    const fixture = await claimFixture({ amount: value, referral, computeBudget });
    const raw = fixture.result, keys = raw.transaction.message.accountKeys;
    const signature = String(i + 3).repeat(88);
    raw.slot = String(25 + i); raw.transaction.signatures[0] = signature;
    raw.blockTime = Date.parse('2026-01-02T10:05:00.000Z') / 1000 + (sameSecond ? 0 : i * 60);
    for (const role of ['miner', 'minerExtended', 'treasury']) {
      const index = keys.indexOf(opening.accounts[role].address);
      raw.meta.preBalances[index] = raw.meta.postBalances[index] = opening.accounts[role].lamports;
    }
    raw.meta.preBalances[0] = String(1_000_000_000n - BigInt(i) * 5000n);
    raw.meta.postBalances[0] = String(1_000_000_000n - BigInt(i + 1) * 5000n);
    const options = { wallet: f.wallet, expectedSignature: signature, expectedSlot: raw.slot };
    const claim = await projectGodlClaim(raw, options);
    const tx = { ...projectTransaction(raw, { ...options, trackedAccounts: f.trackedAccounts }),
      transactionIndex: i, outerPrograms: [GODL_PROGRAM_ADDRESS,
        ...(computeBudget ? ['ComputeBudget111111111111111111111111111111'] : [])] };
    if (claim.status !== 'observed') throw new Error(`Invalid synthetic claim: ${claim.reason}`);
    if (referral) opening.accounts.miner.value.referrer = closing.accounts.miner.value.referrer = tx.godlInstructions[0].accounts[12];
    rawTransactions.push(raw); transactions.push(tx);
    godlClaims.push({ claim, transactionSha256: digest(tx) });
  }
  // The pinned stored-counter conservation uses the treasury debit, including referral.
  const debit = amounts.reduce((sum, value) => sum + BigInt(value), 0n);
  const prior = opening.accounts.miner.value;
  Object.assign(closing.accounts.miner.value, {
    rewardsGodl: closingUnrefined, refinedGodl: closingRefined,
    lifetimeRewardsGodl: String(BigInt(prior.lifetimeRewardsGodl) + debit
      + BigInt(closingUnrefined) - BigInt(prior.rewardsGodl)
      + BigInt(closingRefined) - BigInt(prior.refinedGodl)),
    lastClaimGodlAt: String(transactions.at(-1).blockTime),
  });
  closing.context.slot = String(30 + amounts.length);
  closing.observedAt = new Date((transactions.at(-1).blockTime + 300) * 1000).toISOString();
  f.anchor.closing = structuredClone(opening);
  const interval = { wallet: f.wallet, trackedAccounts: f.trackedAccounts,
    opening, closing, fromExclusiveSlot: opening.context.slot, toInclusiveSlot: closing.context.slot,
    transactions, godlClaims,
    pages: Object.fromEntries(Object.entries(f.trackedAccounts).map(([role, address]) => [role,
      { address, exhausted: true, rows: transactions.filter(tx => tx.deltas[role].status === 'observed')
        .map(indexedRow).reverse() }])) };
  const minutes = [...new Set(transactions.map(tx => Math.floor(tx.blockTime / 60) * 60))];
  return { ...f, interval, rawTransactions, candles: minutes.map(time => [time, 100, 100, 100, 100, 1]) };
}
