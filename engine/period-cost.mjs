// Read-only, closed-period acquisition accounting. No signing or network calls.
import { Ratio, GRAMS, LAMPORTS, parseUnits, uint } from './economics.mjs';
import { MAINNET_GENESIS } from './monitor.mjs';
import { GODL_PROGRAM_ADDRESS, GODL_SOURCE_COMMIT } from './chain.mjs';
const MICRO = 1_000_000n;
const MINING = new Set([3, 27, 29, 33, 34, 35, 37, 51, 61, 66, 68]);
const sol = n => new Ratio(n, LAMPORTS).decimal(9);
const iso = seconds => new Date(seconds * 1000).toISOString();
const fail = message => { throw new Error(message); };
export function instructionCode(encoded) {
  if (typeof encoded !== 'string' || !encoded.length || encoded.length > 2048) fail('Invalid instruction encoding');
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let n = 0n;
  for (const character of encoded) {
    const digit = alphabet.indexOf(character); if (digit < 0) fail('Invalid base58 instruction');
    n = n * 58n + BigInt(digit);
  }
  if (encoded[0] === '1') return 0;
  while (n > 255n) n >>= 8n;
  return Number(n);
}

// The pinned checkpoint handler retains the deployment grid. Equality marks a
// terminal round (paid, lost or forfeited); a later checkpoint is a no-op.
// Old zero-grid snapshots can omit these markers: no stake can earn a reward.
export function deploymentIsSettled(miner) {
  if (!Array.isArray(miner.deployed) || miner.deployed.length !== 25) return false;
  const deployed = miner.deployed.map(value => uint(value));
  if (deployed.every(value => value === 0n)) return true;
  const marker = value => typeof value === 'string' && /^(0|[1-9]\d{0,19})$/.test(value);
  return marker(miner.roundId) && marker(miner.checkpointId)
    && uint(miner.roundId) === uint(miner.checkpointId);
}

export function reconcileClosedPeriod({ wallet, trackedAccounts, pages, transactions, baselineClaim, closing, candles, startSlot, ownerConfirmedZeroOpening = false }) {
  const start = uint(startSlot), ownedRoles = ['miner', 'minerExtended', 'automation', 'automationV2'];
  if (closing.wallet !== wallet || closing.genesisHash !== MAINNET_GENESIS || closing.commitment !== 'finalized'
      || closing.programAddress !== GODL_PROGRAM_ADDRESS || closing.sourceCommit !== GODL_SOURCE_COMMIT) fail('Closing identity or program mismatch');
  for (const role of ownedRoles) if (closing.accounts[role]?.address !== trackedAccounts[role]) fail('Tracked account mismatch');
  const miner = closing.accounts.miner?.value;
  if (!miner || miner.authority !== wallet || ownedRoles.slice(2).some(role => closing.accounts[role].status !== 'missing')
      || uint(miner.rewardsSol) !== 0n || !deploymentIsSettled(miner)) fail('Period still has automation funds, deployment or unclaimed SOL');
  const rows = new Map();
  for (const role of ['wallet', 'miner', 'automation', 'automationV2']) {
    const page = pages[role]; if (!Array.isArray(page) || !page.length) fail('Missing signature page');
    let previous = null; const seen = new Set();
    for (const row of page) {
      const slot = uint(row.slot);
      if (row.confirmationStatus !== 'finalized' || !Object.hasOwn(row, 'err') || !Number.isSafeInteger(row.blockTime)
          || !Number.isSafeInteger(row.transactionIndex) || row.transactionIndex < 0 || seen.has(row.signature)
          || (previous !== null && slot > previous)) fail('Invalid finalized signature page');
      previous = slot; seen.add(row.signature);
      if (slot < start) continue;
      const existing = rows.get(row.signature);
      if (existing && (existing.slot !== row.slot || existing.blockTime !== row.blockTime || existing.transactionIndex !== row.transactionIndex
          || JSON.stringify(existing.err) !== JSON.stringify(row.err))) fail('Conflicting indexed transaction');
      rows.set(row.signature, { ...row, roles: [...(existing?.roles ?? []), role] });
    }
    // This is bounded period coverage, not a lifetime completeness claim.
    if (uint(page.at(-1).slot) >= start) fail('Signature page does not cross the period start');
  }
  const prior = pages.miner.find(row => uint(row.slot) < start);
  if (!prior || baselineClaim.signature !== prior.signature || baselineClaim.status !== 'observed' || baselineClaim.outcome !== 'succeeded'
      || String(miner.lastClaimGodlAt) !== String(baselineClaim.blockTime)
      || !baselineClaim.godlInstructions.some(ix => instructionCode(ix.dataBase58) === 4 && ix.accounts.includes(trackedAccounts.miner))) fail('Zero-opening inference is not supported by the preceding claim');
  const bySignature = new Map();
  for (const tx of transactions) {
    if (bySignature.has(tx.signature)) fail('Duplicate transaction');
    const row = rows.get(tx.signature);
    if (!row || tx.status !== 'observed' || uint(tx.slot) !== uint(row.slot) || tx.blockTime !== row.blockTime
        || tx.outcome !== (row.err === null ? 'succeeded' : 'failed')
        || JSON.stringify(tx.error) !== JSON.stringify(row.err)
        || row.roles.some(role => tx.deltas[role]?.status !== 'observed')) fail('Missing or conflicting transaction evidence');
    bySignature.set(tx.signature, tx);
  }
  for (const row of rows.values()) {
    // A failed transaction cannot mutate account state. Only its fee payer loses SOL;
    // the wallet page includes every owner-paid fee, even for failed attempts.
    if ((row.err === null || row.roles.includes('wallet')) && !bySignature.has(row.signature)) fail('Period transaction coverage is incomplete');
  }
  const ordered = [...bySignature.values()].sort((a,b) => Number(uint(a.slot)-uint(b.slot)) || rows.get(a.signature).transactionIndex-rows.get(b.signature).transactionIndex);
  if (uint(ordered[0]?.slot) !== start || !ordered[0].godlInstructions.some(ix => [33,68].includes(instructionCode(ix.dataBase58))
      && ix.accounts.includes(trackedAccounts.miner))) fail('Period must begin at the verified restart deployment');
  if (uint(closing.context.slot) < uint(ordered.at(-1).slot)) fail('Closing observation precedes period end');
  const prices = new Map();
  for (const candle of candles) {
    if (!Array.isArray(candle) || candle.length !== 6 || !Number.isSafeInteger(candle[0]) || candle[0] % 60
        || prices.has(candle[0]) || !Number.isFinite(candle[4]) || candle[4] <= 0) fail('Invalid or duplicate price candle');
    prices.set(candle[0], parseUnits(String(candle[4]), 6));
  }
  let out = 0n, returned = 0n, fees = 0n, weightedUsd = 0n;
  const firstBalances = {}, lastBalances = {}, included = [], excluded = [];
  for (const tx of ordered) {
    for (const role of ownedRoles) {
      const delta = tx.deltas[role]; if (delta?.status !== 'observed') continue;
      if (delta.address !== trackedAccounts[role]) fail('Transaction account mismatch');
      const before = uint(delta.beforeLamports), after = uint(delta.afterLamports);
      if (after-before !== BigInt(delta.changeLamports)) fail('Inconsistent balance delta');
      if (lastBalances[role] !== undefined && lastBalances[role] !== before) fail('Owned account balance continuity gap');
      firstBalances[role] ??= before; lastBalances[role] = after;
    }
    const relevant = tx.godlInstructions.filter(ix => ownedRoles.some(role => ix.accounts.includes(trackedAccounts[role])));
    if (!relevant.length) {
      if (ownedRoles.some(role => BigInt(tx.deltas[role]?.changeLamports ?? '0') !== 0n)) fail('Unclassified owned-account cash flow');
      excluded.push(tx.signature); continue;
    }
    if (tx.outcome === 'succeeded' && relevant.some(ix => !MINING.has(instructionCode(ix.dataBase58)))) fail('Unsupported reward-changing instruction in period');
    if (tx.outcome === 'succeeded' && tx.godlInstructions.some(ix => [4,41,49].includes(instructionCode(ix.dataBase58)))) fail('Claim, injection or OTC credit prevents simple principal attribution');
    const walletDelta = tx.deltas.wallet;
    if (walletDelta.address !== wallet) fail('Wallet mismatch');
    const change = walletDelta.status === 'observed' ? BigInt(walletDelta.changeLamports) : 0n;
    if (walletDelta.status === 'observed' && uint(walletDelta.afterLamports)-uint(walletDelta.beforeLamports) !== change) fail('Wallet balance delta mismatch');
    const ownerFee = uint(tx.ownerPaidNetworkFeeLamports);
    if (ownerFee !== (tx.feePayer === wallet ? uint(tx.transactionFeeLamports) : 0n)) fail('Fee payer mismatch');
    if (tx.outcome === 'failed' && change !== -ownerFee) fail('Failed transaction cash-flow mismatch');
    if (change < 0n) out -= change; else returned += change;
    fees += ownerFee;
    if (change !== 0n) {
      const price = prices.get(Math.floor(tx.blockTime/60)*60);
      if (!price) fail('Historical USD price coverage is incomplete');
      weightedUsd -= change * price;
    }
    included.push(tx.signature);
  }
  let newRent = 0n;
  for (const role of ownedRoles) {
    const final = closing.accounts[role].status === 'missing' ? 0n : uint(closing.accounts[role].lamports);
    if (lastBalances[role] !== undefined && lastBalances[role] !== final) fail('Closing owned balance mismatch');
    if (firstBalances[role] !== undefined) newRent += final-firstBalances[role];
  }
  if (newRent < 0n) fail('Old rent recovery requires separate attribution');
  const earned = uint(miner.rewardsGodl); if (!earned) fail('No new unrefined GODL denominator');
  const cash = out-returned;
  const acquisitionPeriod = {
    status: 'estimated', startedAt: iso(ordered[0].blockTime), throughAt: iso(ordered.at(-1).blockTime),
    openingGodl: '0.00000000000', earnedGodl: new Ratio(earned,GRAMS).decimal(11),
    netSpendSol: sol(cash), netCostPerGodlSol: new Ratio(cash*GRAMS,LAMPORTS*earned).decimal(12),
    netSpendUsd: new Ratio(weightedUsd,LAMPORTS*MICRO).decimal(6),
    netCostPerGodlUsd: new Ratio(weightedUsd*GRAMS,LAMPORTS*MICRO*earned).decimal(8),
    grossOutSol: sol(out), returnedSol: sol(returned), ownerNetworkFeesSol: sol(fees), newRentSol: sol(newRent),
    priceBasis: 'Coinbase SOL-USD one-minute close at each net wallet cash flow; historical USD estimate, not today’s SOL price.',
    baselineBasis: ownerConfirmedZeroOpening
      ? 'You confirmed that your opening unrefined balance was zero after claiming the old GODL. The preceding on-chain claim and activity gap support this starting point.'
      : 'Opening unrefined balance inferred as zero after the preceding successful GODL claim, matching the miner’s last-claim timestamp, with no indexed miner activity until the restart.',
    caveats: [ownerConfirmedZeroOpening
      ? 'The opening balance is owner-confirmed and supported by claim history; historical opening account bytes are not archived.'
      : 'Opening account bytes and the historical claim executable are not archived; the zero opening is an inference, not an exact historical-state observation.',
      'On-chain cash basis includes network/executor costs and new account rent still locked. External exchange, withdrawal and other off-chain fees are not observed.',
      'Only unrefined principal is counted; refined GODL is excluded. This estimate stops at the displayed end time and does not include later mining.'],
  };
  return { schemaVersion: 1, kind: 'godl-period-cost', wallet, genesisHash: MAINNET_GENESIS, programAddress: GODL_PROGRAM_ADDRESS,
    sourceCommit: GODL_SOURCE_COMMIT, startSlot: String(start), endSlot: ordered.at(-1).slot, acquisitionPeriod,
    evidence: { precedingClaim: baselineClaim.signature, closingSlot: closing.context.slot, ownerConfirmedZeroOpening,
      netUsdLamportMicro: String(weightedUsd),
      periodIndexedSignatures: rows.size, capturedTransactions: ordered.length, excludedFailedNonOwnerTransactions: rows.size-ordered.length,
      includedSignatures: included, excludedUnrelatedSignatures: excluded } };
}

// Receipts are reviewed local application state. Never let a missing, corrupt or
// wrong-wallet report take the live balance monitor down or supply a partial cost.
export function projectPeriodReceipt(snapshot, receipt) {
  if (receipt?.schemaVersion !== 1 || receipt.kind !== 'godl-period-cost'
      || receipt.wallet !== snapshot.wallet || receipt.genesisHash !== MAINNET_GENESIS
      || snapshot.genesisHash !== MAINNET_GENESIS || snapshot.commitment !== 'finalized'
      || receipt.programAddress !== GODL_PROGRAM_ADDRESS || receipt.sourceCommit !== GODL_SOURCE_COMMIT
      || snapshot.programAddress !== receipt.programAddress || snapshot.sourceCommit !== receipt.sourceCommit
      || uint(receipt.startSlot) > uint(receipt.endSlot) || uint(receipt.endSlot) > uint(receipt.evidence?.closingSlot)
      || uint(receipt.evidence.closingSlot) > uint(snapshot.context.slot)) fail('Period receipt identity or coverage mismatch');
  const p = receipt.acquisitionPeriod;
  const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
  if (!p || p.status !== 'estimated' || !date(p.startedAt) || !date(p.throughAt)
      || p.startedAt > p.throughAt || Date.parse(p.throughAt) > Date.parse(snapshot.observedAt)) fail('Invalid period receipt dates');
  const signedUnits = (value, decimals) => {
    if (typeof value !== 'string' || value.length > 64 || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) fail('Invalid receipt amount');
    return value.startsWith('-') ? -parseUnits(value.slice(1), decimals) : parseUnits(value, decimals);
  };
  const earned = signedUnits(p.earnedGodl,11), net = signedUnits(p.netSpendSol,9);
  if (earned <= 0n || signedUnits(p.openingGodl,11) !== 0n) fail('Invalid receipt principal');
  const out = signedUnits(p.grossOutSol,9), returned = signedUnits(p.returnedSol,9);
  const fees = signedUnits(p.ownerNetworkFeesSol,9), rent = signedUnits(p.newRentSol,9);
  if ([out,returned,fees,rent].some(n=>n<0n) || out-returned !== net || fees > out
      || new Ratio(net*GRAMS,LAMPORTS*earned).decimal(12) !== p.netCostPerGodlSol) fail('Inconsistent receipt SOL accounting');
  const weighted = signedUnits(receipt.evidence.netUsdLamportMicro,0);
  signedUnits(p.netSpendUsd,6); signedUnits(p.netCostPerGodlUsd,8);
  if (new Ratio(weighted,LAMPORTS*MICRO).decimal(6) !== p.netSpendUsd
      || new Ratio(weighted*GRAMS,LAMPORTS*MICRO*earned).decimal(8) !== p.netCostPerGodlUsd) fail('Inconsistent receipt USD accounting');
  const text = value => typeof value === 'string' && value.length > 0 && value.length <= 3000;
  if (![p.priceBasis,p.baselineBasis].every(text) || !Array.isArray(p.caveats) || !p.caveats.length
      || p.caveats.length > 10 || !p.caveats.every(text)) fail('Missing receipt explanation');
  return structuredClone(p);
}
