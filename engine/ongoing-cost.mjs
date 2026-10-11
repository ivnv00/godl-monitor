// Cumulative closed-window accounting. Pure: no network, filesystem or signer.
import { createHash } from 'node:crypto';
import { Ratio, GRAMS, LAMPORTS, parseUnits, uint } from './economics.mjs';
import { instructionCode, projectPeriodReceipt } from './period-cost.mjs';
import { GODL_PROGRAM_ADDRESS, GODL_SOURCE_COMMIT } from './chain.mjs';
import { MAINNET_GENESIS } from './monitor.mjs';
import { RuntimeFailure } from './runtime-failure.mjs';

const OWNED = ['miner', 'minerExtended', 'automation', 'automationV2'];
const ROLES = ['wallet', ...OWNED];
const MINING = new Set([3, 27, 29, 33, 34, 35, 37, 61, 66, 68]);
const CHECKPOINT = new Set([34, 66]);
const COMPUTE = 'ComputeBudget111111111111111111111111111111';
const RESET_PROGRAMS = new Set([GODL_PROGRAM_ADDRESS, COMPUTE,
  '11111111111111111111111111111111', 'rngJSm78htuZREU5F3tb3JKnYSaPx1nMHZxyvNNFmxy']);
const BOARD = '49RF5rddTaRVq6iypkGvEYKhq5kUWHgRVspigNZHjoJc';
const MICRO = 1_000_000n;
const fail = message => { throw new Error(message); };
const lamports = account => account.status === 'missing' ? 0n : uint(account.lamports);
const signed = (value, decimals = 0) => {
  if (typeof value !== 'string' || !/^-?(0|[1-9]\d*)(\.\d+)?$/.test(value)) fail('Invalid signed amount');
  return value.startsWith('-') ? -parseUnits(value.slice(1), decimals) : parseUnits(value, decimals);
};
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function requireClosedState(snapshot) {
  if (typeof snapshot?.genesisHash === 'string' && snapshot.genesisHash.length > 0
      && snapshot.genesisHash !== MAINNET_GENESIS) throw new RuntimeFailure('wrongNetwork');
  if (snapshot?.genesisHash !== MAINNET_GENESIS || snapshot.commitment !== 'finalized'
      || snapshot.programAddress !== GODL_PROGRAM_ADDRESS || snapshot.sourceCommit !== GODL_SOURCE_COMMIT
      || !Number.isFinite(Date.parse(snapshot.observedAt))) fail('Accounting snapshot identity mismatch');
  uint(snapshot.context.slot);
  for (const role of OWNED) {
    const account = snapshot.accounts?.[role];
    if (!account || !['present', 'missing'].includes(account.status)) fail('Owned account state unavailable');
    if (account.status === 'present' && account.value?.authority !== snapshot.wallet) fail('Owned account authority mismatch');
    lamports(account);
  }
  const miner = snapshot.accounts.miner;
  if (miner.status !== 'present') fail('Miner account unavailable');
  if (['automation', 'automationV2'].some(role => snapshot.accounts[role].status !== 'missing')
      || uint(miner.value.rewardsSol) !== 0n || !Array.isArray(miner.value.deployed)
      || miner.value.deployed.length !== 25 || miner.value.deployed.some(n => uint(n) !== 0n)) {
    fail('Waiting for automation funds, deployments and SOL rewards to settle');
  }
  // Under the pinned checkpoint handlers, a zero deployment grid cannot credit
  // mined SOL/GODL even if checkpointId lags after a no-funds deploy attempt.
  // update_rewards changes refined GODL only. Do not infer this for another ABI.
  return miner.value;
}

export function validateAccountingCheckpoint(checkpoint) {
  if (checkpoint?.schemaVersion !== 1 || checkpoint.kind !== 'godl-accounting-checkpoint') fail('Invalid accounting checkpoint');
  const miner = requireClosedState(checkpoint.closing);
  const period = projectPeriodReceipt(checkpoint.closing, checkpoint.receipt);
  if (parseUnits(period.earnedGodl, 11) !== uint(miner.rewardsGodl)) fail('Checkpoint principal disagrees with its receipt');
  if (String(checkpoint.receipt.evidence.closingSlot) !== String(checkpoint.closing.context.slot)) fail('Checkpoint closing slot mismatch');
  return checkpoint;
}

export function extendClosedAccounting({ previous, interval, candles = [] }) {
  validateAccountingCheckpoint(previous);
  const opening = previous.closing, closing = interval.closing;
  const miner = requireClosedState(closing), priorMiner = opening.accounts.miner.value;
  const from = uint(opening.context.slot), through = uint(closing.context.slot);
  if (closing.wallet !== opening.wallet || through < from || uint(interval.fromExclusiveSlot) !== from
      || uint(interval.toInclusiveSlot) !== through) fail('Accounting interval identity or boundary mismatch');
  if (through === from) fail('Waiting for the finalized accounting slot to advance');
  if (closing.observedAt < opening.observedAt) fail('Accounting observation moved backwards');
  if (String(miner.lastClaimGodlAt) !== String(priorMiner.lastClaimGodlAt)
      || uint(miner.rewardsGodl) < uint(priorMiner.rewardsGodl)) fail('A GODL claim or principal decrease needs separate reconciliation');
  for (const role of ROLES) {
    const expected = role === 'wallet' ? opening.wallet : opening.accounts[role].address;
    if (interval.trackedAccounts[role] !== expected || (role !== 'wallet' && closing.accounts[role].address !== expected)) fail('Accounting address mismatch');
  }
  const indexed = new Map();
  for (const role of ROLES) {
    const page = interval.pages[role];
    if (!page || !Array.isArray(page.rows) || (!page.exhausted && (!page.rows.length || uint(page.rows.at(-1).slot) > from))) fail('Signature coverage does not reach the previous checkpoint');
    let prior = null;
    const seen = new Set();
    for (const row of page.rows) {
      const slot = uint(row.slot);
      if (seen.has(row.signature) || (prior !== null && slot > prior) || row.confirmationStatus !== 'finalized'
          || !Object.hasOwn(row, 'err') || !Number.isSafeInteger(row.blockTime)) fail('Invalid accounting signature page');
      seen.add(row.signature); prior = slot;
      if (slot <= from || slot > through) continue;
      const existing = indexed.get(row.signature);
      if (existing && (String(existing.slot) !== String(row.slot) || existing.blockTime !== row.blockTime
          || JSON.stringify(existing.err) !== JSON.stringify(row.err))) fail('Conflicting accounting signature');
      indexed.set(row.signature, { ...row, roles: [...(existing?.roles ?? []), role] });
    }
  }
  const transactions = new Map(), orderKeys = new Set();
  for (const tx of interval.transactions) {
    const row = indexed.get(tx.signature), orderKey = `${tx.slot}:${tx.transactionIndex}`;
    if (!row || tx.status !== 'observed' || transactions.has(tx.signature) || String(tx.slot) !== String(row.slot)
        || tx.blockTime !== row.blockTime || JSON.stringify(tx.error) !== JSON.stringify(row.err)
        || tx.outcome !== (row.err === null ? 'succeeded' : 'failed') || !Number.isSafeInteger(tx.transactionIndex)
        || tx.transactionIndex < 0 || orderKeys.has(orderKey)
        || row.roles.some(role => tx.deltas[role]?.status !== 'observed')) fail('Missing or inconsistent interval transaction');
    transactions.set(tx.signature, tx); orderKeys.add(orderKey);
  }
  for (const row of indexed.values()) {
    if ((row.err === null || row.roles.includes('wallet')) && !transactions.has(row.signature)) fail('Interval transaction coverage incomplete');
  }
  const ordered = [...transactions.values()].sort((a, b) => uint(a.slot) < uint(b.slot) ? -1 : uint(a.slot) > uint(b.slot) ? 1 : a.transactionIndex - b.transactionIndex);
  const prices = new Map();
  for (const candle of candles) {
    if (!Array.isArray(candle) || candle.length !== 6 || !Number.isSafeInteger(candle[0]) || candle[0] % 60
        || prices.has(candle[0]) || !Number.isFinite(candle[4]) || candle[4] <= 0) fail('Invalid accounting price candle');
    prices.set(candle[0], parseUnits(String(candle[4]), 6));
  }
  const last = Object.fromEntries(OWNED.map(role => [role, lamports(opening.accounts[role])]));
  let walletLast, out = 0n, returned = 0n, fees = 0n, weighted = 0n;
  const included = [], excluded = [];
  for (const tx of ordered) {
    for (const role of ROLES) {
      const delta = tx.deltas[role];
      if (!delta || delta.address !== interval.trackedAccounts[role]) fail('Missing transaction account role');
      if (delta.status === 'not-in-transaction') continue;
      if (delta.status !== 'observed') fail('Unknown transaction delta');
      const before = uint(delta.beforeLamports), after = uint(delta.afterLamports);
      if (after - before !== signed(delta.changeLamports)) fail('Inconsistent transaction balance delta');
      if (role === 'wallet') {
        if (walletLast !== undefined && walletLast !== before) fail('Wallet continuity gap');
        walletLast = after;
      } else {
        if (last[role] !== before) fail('Owned account continuity gap');
        last[role] = after;
      }
    }
    const relevant = tx.godlInstructions.filter(ix => OWNED.some(role => ix.accounts.includes(interval.trackedAccounts[role])));
    if (!relevant.length) {
      if (OWNED.some(role => signed(tx.deltas[role]?.changeLamports ?? '0') !== 0n)) fail('Unclassified owned-account movement');
      excluded.push(tx.signature); continue;
    }
    if (tx.outcome === 'succeeded') {
      // ResetPermissionless reads our candidate miner but never moves owner
      // funds. Its board-authorized inner Log is a no-op. Entropy/System outer
      // instructions belong to the keeper; admit only this exact zero-cash shape.
      const outerGodl = tx.godlInstructions.filter(ix => ix.inner === false);
      const innerGodl = tx.godlInstructions.filter(ix => ix.inner === true);
      const reset = outerGodl[0], log = innerGodl[0];
      const keeperReset = tx.deltas.wallet.status === 'not-in-transaction'
        && uint(tx.ownerPaidNetworkFeeLamports) === 0n
        && OWNED.every(role => signed(tx.deltas[role]?.changeLamports ?? '0') === 0n)
        && outerGodl.length === 1 && innerGodl.length === 1 && tx.godlInstructions.length === 2
        && instructionCode(reset.dataBase58) === 51 && reset.accounts[8] === interval.trackedAccounts.miner
        && Number.isSafeInteger(reset.outerIndex) && reset.outerIndex >= 0
        && instructionCode(log.dataBase58) === 8 && log.outerIndex === reset.outerIndex
        && log.accounts.length === 1 && log.accounts[0] === BOARD
        && Array.isArray(tx.outerPrograms) && tx.outerPrograms.includes(GODL_PROGRAM_ADDRESS)
        && tx.outerPrograms.every(program => RESET_PROGRAMS.has(program));
      // Keepers batch checkpoints for several miners. With no owner wallet in
      // the transaction, another miner's checkpoint cannot spend owner wallet
      // cash. Require the native checkpoint account position for our miner.
      const keeperBatch = tx.deltas.wallet.status === 'not-in-transaction'
        && tx.godlInstructions.every(ix => !ix.inner && CHECKPOINT.has(instructionCode(ix.dataBase58)))
        && relevant.every(ix => ix.accounts[2] === interval.trackedAccounts.miner);
      if (!keeperReset && tx.godlInstructions.some(ix => !MINING.has(instructionCode(ix.dataBase58)) || (!relevant.includes(ix) && !keeperBatch))) fail('Unsupported or unrelated GODL instruction needs separate reconciliation');
      if (!keeperReset && (!Array.isArray(tx.outerPrograms) || !tx.outerPrograms.length
          || tx.outerPrograms.some(program => ![GODL_PROGRAM_ADDRESS, COMPUTE].includes(program)))) fail('Mixed transaction needs separate cash attribution');
    }
    const change = tx.deltas.wallet.status === 'observed' ? signed(tx.deltas.wallet.changeLamports) : 0n;
    const fee = uint(tx.ownerPaidNetworkFeeLamports);
    if (fee !== (tx.feePayer === opening.wallet ? uint(tx.transactionFeeLamports) : 0n)) fail('Interval fee payer mismatch');
    if (tx.outcome === 'failed' && (change !== -fee || OWNED.some(role => signed(tx.deltas[role]?.changeLamports ?? '0') !== 0n))) fail('Failed transaction mutated owned funds');
    if (change < 0n) out -= change; else returned += change;
    fees += fee;
    if (change !== 0n) {
      const price = prices.get(Math.floor(tx.blockTime / 60) * 60);
      if (!price) fail('Historical price coverage incomplete');
      weighted -= change * price;
    }
    included.push(tx);
  }
  let newRent = 0n;
  for (const role of OWNED) {
    const final = lamports(closing.accounts[role]);
    if (last[role] !== final) fail('Closing owned balance mismatch');
    // A checkpoint consumes the prepaid bot fee, already included when wallet
    // cash originally left. It is not rent and must not be charged twice.
    const retainedBefore = lamports(opening.accounts[role]) - (role === 'miner' ? uint(priorMiner.checkpointFee) : 0n);
    const retainedAfter = final - (role === 'miner' ? uint(miner.checkpointFee) : 0n);
    if (retainedBefore < 0n || retainedAfter < retainedBefore) fail('Prior locked cash recovery needs separate attribution');
    newRent += retainedAfter - retainedBefore;
  }
  if (!included.length && uint(miner.rewardsGodl) !== uint(priorMiner.rewardsGodl)) fail('Unexplained unrefined balance change');
  const receipt = structuredClone(previous.receipt), p = receipt.acquisitionPeriod;
  out += parseUnits(p.grossOutSol, 9); returned += parseUnits(p.returnedSol, 9);
  fees += parseUnits(p.ownerNetworkFeesSol, 9); newRent += parseUnits(p.newRentSol, 9);
  weighted += signed(receipt.evidence.netUsdLamportMicro);
  const cash = out - returned, earned = uint(miner.rewardsGodl);
  if (!earned) fail('No earned GODL denominator');
  const latest = included.at(-1);
  if (latest) {
    const date = new Date(latest.blockTime * 1000).toISOString();
    if (date < p.throughAt) fail('Transaction time precedes the existing period');
    p.throughAt = date; receipt.endSlot = String(latest.slot);
  }
  Object.assign(p, {
    earnedGodl: new Ratio(earned, GRAMS).decimal(11),
    grossOutSol: new Ratio(out, LAMPORTS).decimal(9), returnedSol: new Ratio(returned, LAMPORTS).decimal(9),
    ownerNetworkFeesSol: new Ratio(fees, LAMPORTS).decimal(9), newRentSol: new Ratio(newRent, LAMPORTS).decimal(9),
    netSpendSol: new Ratio(cash, LAMPORTS).decimal(9), netCostPerGodlSol: new Ratio(cash * GRAMS, LAMPORTS * earned).decimal(12),
    netSpendUsd: new Ratio(weighted, LAMPORTS * MICRO).decimal(6),
    netCostPerGodlUsd: new Ratio(weighted * GRAMS, LAMPORTS * MICRO * earned).decimal(8),
  });
  receipt.evidence = {
    precedingClaim: previous.receipt.evidence.precedingClaim,
    ownerConfirmedZeroOpening: previous.receipt.evidence.ownerConfirmedZeroOpening,
    closingSlot: String(through), netUsdLamportMicro: String(weighted),
    reviewedAnchorReceiptSha256: previous.receipt.evidence.reviewedAnchorReceiptSha256 ?? digest(previous.receipt),
    previousReceiptSha256: digest(previous.receipt),
    extensionCount: (previous.receipt.evidence.extensionCount ?? 0) + 1,
    lastInterval: { fromExclusiveSlot: String(from), toInclusiveSlot: String(through),
      includedSignatures: included.map(tx => tx.signature), excludedUnrelatedSignatures: excluded,
      excludedFailedNonOwnerTransactions: indexed.size - transactions.size },
  };
  const next = { ...previous, receipt, closing: structuredClone(closing) };
  validateAccountingCheckpoint(next);
  return next;
}
