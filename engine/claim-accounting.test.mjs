import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { claimAccountingFixture } from './test-fixtures/claim-accounting.mjs';
import { accountingFixture, indexedRow } from './test-fixtures/accounting.mjs';
import { emptyClaimSummary, summarizeIntervalClaims, validateClaimProgression } from './claim-accounting.mjs';
import { extendFundedAccounting, fundedCheckpointHash, projectFundedPosition, validateFundedCheckpoint } from './funded-accounting.mjs';
import { reconcileCostInterval } from './ongoing-cost.mjs';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const extend = f => extendFundedAccounting({ previous: f.anchor, interval: f.interval, candles: f.candles });
const bind = f => { for (const entry of f.interval.godlClaims) entry.transactionSha256 = digest(f.interval.transactions.find(tx => tx.signature === entry.claim.signature)); };
const checkpointBind = c => { c.ledger.closingSha256 = digest(c.closing); };

test('v3 conserves carry-in, includes only owner network fee, and preserves reviewed bytes', async () => {
  const f = await claimAccountingFixture(), original = JSON.stringify(f);
  const c = extend(f);
  assert.equal(c.schemaVersion, 3);
  assert.equal(c.ledger.schemaVersion, 3);
  assert.deepEqual(c.ledger.claims, { count: 1, ownerReceiptBaseUnits: '1200000000000', treasuryDebitBaseUnits: '1200000000000', networkFeeLamports: '5000' });
  assert.deepEqual(c.ledger.lastInterval.claims, c.ledger.claims);
  assert.equal(c.ledger.netCostLamports, '100010000');
  assert.equal(c.ledger.ownerNetworkFeesLamports, '10000');
  assert.equal(c.ledger.newRentLamports, '0');
  assert.equal(c.ledger.netUsdLamportMicro, '10001000000000000');
  assert.equal(c.ledger.previousCheckpointSha256, digest(f.anchor.receipt));
  assert.deepEqual(c.anchor, f.anchor);
  assert.equal(JSON.stringify(f), original);
  assert.match(projectFundedPosition(c).reason, /GODL claim network fees are included/);
  assert.match(projectFundedPosition(c).reason, /do not prove mined principal/);
});

test('multiple and same-second claims count every receipt and exact historical fee', async () => {
  for (const sameSecond of [false, true]) {
    const f = await claimAccountingFixture({ count: 2, sameSecond, computeBudget: true });
    const c = extend(f);
    assert.deepEqual(c.ledger.claims, { count: 2, ownerReceiptBaseUnits: '2400000000000', treasuryDebitBaseUnits: '2400000000000', networkFeeLamports: '10000' });
    assert.equal(c.ledger.netCostLamports, '100015000');
    assert.equal(c.ledger.newRentLamports, '0');
    assert.equal(c.ledger.netUsdLamportMicro, '10001500000000000');
  }
});

test('referral rounding uses exact treasury debits without double charging deductions', async () => {
  const f = await claimAccountingFixture({ referral: true, amount: '1200000000199' });
  const c = extend(f), proof = f.interval.godlClaims[0].claim;
  assert.equal(proof.referralReceipt.amountBaseUnits, '6000000000');
  assert.equal(c.ledger.claims.ownerReceiptBaseUnits, '1194000000199');
  assert.equal(c.ledger.claims.treasuryDebitBaseUnits, '1200000000199');
  assert.equal(c.ledger.netCostLamports, '100010000');
});

test('receipts and counter conservation remain exact beyond JS safe integer', async () => {
  const f = await claimAccountingFixture({ amount: '9007199254740993' });
  const c = extend(f);
  assert.equal(c.ledger.claims.ownerReceiptBaseUnits, '9007199254740993');
  assert.equal(c.ledger.claims.treasuryDebitBaseUnits, '9007199254740993');
  assert.equal(BigInt(c.closing.accounts.miner.value.lifetimeRewardsGodl)
    - BigInt(c.anchor.closing.accounts.miner.value.lifetimeRewardsGodl)
    - (BigInt(c.closing.accounts.miner.value.rewardsGodl) - BigInt(c.anchor.closing.accounts.miner.value.rewardsGodl))
    - (BigInt(c.closing.accounts.miner.value.refinedGodl) - BigInt(c.anchor.closing.accounts.miner.value.refinedGodl)), 9007199254740993n);
});

test('carry-in liquidation may reduce lifetime by refining deductions while conserving exact debit', async () => {
  const f = await claimAccountingFixture({ amount: '1194000000000', closingUnrefined: '0', closingRefined: '0' });
  const c = extend(f);
  assert.equal(c.closing.accounts.miner.value.lifetimeRewardsGodl, '994000000000');
  assert.equal(c.ledger.claims.treasuryDebitBaseUnits, '1194000000000');
});

test('both pinned no-referrer sentinels permit the standalone owner route', async () => {
  const f = await claimAccountingFixture();
  for (const snapshot of [f.anchor.closing, f.interval.closing]) snapshot.accounts.miner.value.referrer = 'JEKNVnkbo3jma5nREBBJCDoXFVeKkD56V3xKrvRmWxFG';
  assert.equal(extend(f).schemaVersion, 3);
});

test('old reconciliation remains guarded and v2 hash meaning is unchanged', async () => {
  const claims = await claimAccountingFixture();
  assert.throws(() => reconcileCostInterval({ opening: claims.anchor.closing, interval: claims.interval, candles: claims.candles, funded: true, allowOpen: true }), /separate reconciliation/);
  const f = await accountingFixture(), c = extend(f);
  assert.equal(c.schemaVersion, 2);
  assert.equal(fundedCheckpointHash(c), 'f8f93791a174665301f2e088dd3424cd096d7d1426f09259f80019cf29c6609b');
  assert.equal(c.ledger.claims, undefined);
  const v1 = structuredClone(c); v1.schemaVersion = v1.ledger.schemaVersion = 1;
  validateFundedCheckpoint(v1);
  assert.equal(fundedCheckpointHash(v1), '0c35947f546769113e0f4973a5bdae8d7dc3f14bbb78896066378346e0f08efc');
  for (const schemaVersion of [1, 2]) {
    const old = structuredClone(c); old.schemaVersion = old.ledger.schemaVersion = schemaVersion;
    old.closing.accounts.miner.value.lastClaimGodlAt = '1767351600'; checkpointBind(old);
    assert.throws(() => validateFundedCheckpoint(old), /principal requires separate/);
  }
});

test('v3 persists through a no-claim interval without changing accumulated receipts', async () => {
  const f = await claimAccountingFixture(), previous = extend(f);
  const closing = structuredClone(previous.closing);
  closing.context.slot = '40'; closing.observedAt = '2026-01-02T10:20:00.000Z';
  const interval = { ...structuredClone(f.interval), fromExclusiveSlot: previous.closing.context.slot,
    toInclusiveSlot: '40', closing, transactions: [], godlClaims: [],
    pages: Object.fromEntries(Object.entries(f.trackedAccounts).map(([role, address]) => [role, { address, exhausted: true, rows: [] }])) };
  const next = extendFundedAccounting({ previous, interval });
  assert.equal(next.schemaVersion, 3);
  assert.deepEqual(next.ledger.claims, previous.ledger.claims);
  assert.deepEqual(next.ledger.lastInterval.claims, emptyClaimSummary());
  assert.equal(next.ledger.previousCheckpointSha256, fundedCheckpointHash(previous));
  const altered = structuredClone(interval);
  altered.closing.accounts.miner.value.refinedGodl = '99999999999';
  assert.throws(() => extendFundedAccounting({ previous, interval: altered }), /regressed|conservation/);
});

test('zero receipt and unchanged same-second claim marker still promote and count a claim', async () => {
  const first = await claimAccountingFixture({ closingUnrefined: '0', closingRefined: '0' });
  const previous = extend(first);
  const f = await claimAccountingFixture({ amount: '0', closingUnrefined: '0', closingRefined: '0' });
  const tx = f.interval.transactions[0];
  tx.signature = '7'.repeat(88); tx.slot = '35';
  const claim = f.interval.godlClaims[0].claim;
  claim.signature = tx.signature; claim.slot = tx.slot;
  tx.deltas.wallet.beforeLamports = '999995000'; tx.deltas.wallet.afterLamports = '999990000';
  f.interval.fromExclusiveSlot = previous.closing.context.slot;
  f.interval.toInclusiveSlot = f.interval.closing.context.slot = '40';
  f.interval.closing.observedAt = '2026-01-02T10:15:00.000Z';
  f.interval.closing.accounts.miner.value = structuredClone(previous.closing.accounts.miner.value);
  for (const page of Object.values(f.interval.pages)) page.rows = page.rows.length ? [indexedRow(tx)] : [];
  bind(f);
  const c = extendFundedAccounting({ previous, interval: f.interval, candles: f.candles });
  assert.deepEqual(c.ledger.lastInterval.claims, { count: 1, ownerReceiptBaseUnits: '0', treasuryDebitBaseUnits: '0', networkFeeLamports: '5000' });
  assert.equal(c.ledger.claims.count, 2);
  assert.equal(c.ledger.claims.ownerReceiptBaseUnits, previous.ledger.claims.ownerReceiptBaseUnits);
  assert.equal(c.closing.accounts.miner.value.lastClaimGodlAt, previous.closing.accounts.miner.value.lastClaimGodlAt);
  assert.equal(c.schemaVersion, 3);
  assert.equal(c.ledger.netCostLamports, '100015000');
});

test('proof identity, exact envelope binding, receipts, fees and unsupported routes fail closed', async t => {
  const cases = [
    ['missing proof', f => { f.interval.godlClaims = []; }],
    ['missing collection', f => { delete f.interval.godlClaims; }],
    ['invalid collection', f => { f.interval.godlClaims = {}; }],
    ['duplicate proof', f => { f.interval.godlClaims.push(structuredClone(f.interval.godlClaims[0])); }],
    ['extra proof', f => { const extra = structuredClone(f.interval.godlClaims[0]); extra.claim.signature = '9'.repeat(88); f.interval.godlClaims.push(extra); }],
    ['hash mismatch', f => { f.interval.godlClaims[0].transactionSha256 = 'a'.repeat(64); }],
    ['bound envelope changed', f => { f.interval.transactions[0].transactionIndex = 1; }],
    ['proof schema', f => { f.interval.godlClaims[0].claim.schemaVersion = 2; }],
    ['proof kind', f => { f.interval.godlClaims[0].claim.kind = 'another-claim'; }],
    ['proof status', f => { f.interval.godlClaims[0].claim.status = 'unavailable'; }],
    ['proof wallet', f => { f.interval.godlClaims[0].claim.wallet = f.trackedAccounts.miner; }],
    ['proof slot', f => { f.interval.godlClaims[0].claim.slot = '26'; }],
    ['proof source', f => { f.interval.godlClaims[0].claim.source.commit = 'a'.repeat(40); }],
    ['proof program', f => { f.interval.godlClaims[0].claim.source.program = f.trackedAccounts.miner; }],
    ['execution enabled', f => { f.interval.godlClaims[0].claim.executionAllowed = true; }],
    ['authenticity scope', f => { f.interval.godlClaims[0].claim.evidenceScope = 'chain-authenticated'; }],
    ['principal attribution', f => { f.interval.godlClaims[0].claim.principal = { status: 'observed', amountBaseUnits: '1' }; }],
    ['refining attribution', f => { f.interval.godlClaims[0].claim.refiningDeduction.amountBaseUnits = '1'; }],
    ['owner receipt amount', f => { f.interval.godlClaims[0].claim.ownerReceipt.amountBaseUnits = '1200000000001'; }],
    ['receipt noncanonical', f => { f.interval.godlClaims[0].claim.ownerReceipt.amountBaseUnits = '01200000000000'; }],
    ['receipt number', f => { f.interval.godlClaims[0].claim.ownerReceipt.amountBaseUnits = 1200000000000; }],
    ['receipt overflow', f => { f.interval.godlClaims[0].claim.ownerReceipt.amountBaseUnits = '18446744073709551616'; }],
    ['receipt account', f => { f.interval.godlClaims[0].claim.ownerReceipt.account = f.trackedAccounts.miner; }],
    ['receipt owner', f => { f.interval.godlClaims[0].claim.ownerReceipt.tokenOwner = f.trackedAccounts.miner; }],
    ['receipt mint', f => { f.interval.godlClaims[0].claim.ownerReceipt.mint = f.trackedAccounts.miner; }],
    ['receipt decimals', f => { f.interval.godlClaims[0].claim.ownerReceipt.decimals = 9; }],
    ['fee mismatch', f => { f.interval.godlClaims[0].claim.ownerPaidNetworkFeeLamports = '5001'; }],
    ['rent', f => { f.interval.godlClaims[0].claim.newAccountRentLamports = '1'; }],
    ['payer mismatch', f => { f.interval.transactions[0].feePayer = f.trackedAccounts.miner; bind(f); }],
    ['unsupported code41', f => { f.interval.transactions[0].godlInstructions[0].dataBase58 = 'i'; bind(f); }],
    ['unsupported code49', f => { f.interval.transactions[0].godlInstructions[0].dataBase58 = 'r'; bind(f); }],
    ['padded claim', f => { f.interval.transactions[0].godlInstructions[0].dataBase58 = 'Jf'; bind(f); }],
    ['inner claim', f => { f.interval.transactions[0].godlInstructions[0].inner = true; bind(f); }],
    ['mixed outer route', f => { f.interval.transactions[0].outerPrograms.push('11111111111111111111111111111111'); bind(f); }],
    ['mixed GODL route', f => { f.interval.transactions[0].godlInstructions.push({ ...f.interval.transactions[0].godlInstructions[0], dataBase58: '4' }); bind(f); }],
    ['miner role', f => { f.interval.transactions[0].godlInstructions[0].accounts[2] = f.trackedAccounts.automation; bind(f); }],
    ['extended rent', f => { f.interval.transactions[0].deltas.minerExtended.beforeLamports = '0'; bind(f); }],
    ['wallet fee movement', f => { f.interval.transactions[0].deltas.wallet.changeLamports = '-5001'; bind(f); }],
    ['owned lamport mutation', f => { f.interval.transactions[0].deltas.miner.afterLamports = '11'; f.interval.transactions[0].deltas.miner.changeLamports = '1'; bind(f); }],
    ['coverage missing', f => { f.interval.pages.miner.rows = []; f.interval.pages.miner.exhausted = false; }],
    ['transaction missing', f => { f.interval.transactions = []; }],
    ['closing balance', f => { f.interval.closing.accounts.miner.lamports = '11'; }],
    ['historical prices missing', f => { f.candles = []; }],
  ];
  for (const [name, mutate] of cases) await t.test(name, async () => {
    const f = await claimAccountingFixture(); mutate(f); assert.throws(() => extend(f));
  });
});

test('counter conservation, incarnation, marker and unchanged counters cannot be bypassed by proof', async t => {
  const cases = [
    ['unrefined mismatch', f => { f.interval.closing.accounts.miner.value.rewardsGodl = '300000000001'; }],
    ['refined mismatch', f => { f.interval.closing.accounts.miner.value.refinedGodl = '100000000001'; }],
    ['lifetime mismatch', f => { f.interval.closing.accounts.miner.value.lifetimeRewardsGodl = '1400000000001'; }],
    ['noncanonical counter', f => { f.interval.closing.accounts.miner.value.refinedGodl = '0100000000000'; }],
    ['missing counter', f => { delete f.interval.closing.accounts.miner.value.refinedGodl; }],
    ['round regression', f => { f.anchor.closing.accounts.miner.value.roundId = '1'; }],
    ['lifetime SOL regression', f => { f.anchor.closing.accounts.miner.value.lifetimeRewardsSol = '1'; }],
    ['lifetime deployment regression', f => { f.anchor.closing.accounts.miner.value.lifetimeDeployed = '1'; }],
    ['gold lifetime regression', f => { f.anchor.closing.accounts.minerExtended.value.lifetimeXaut = '300001'; }],
    ['SOL marker regression', f => { f.anchor.closing.accounts.miner.value.lastClaimSolAt = '1'; }],
    ['claim marker mismatches tx', f => { f.interval.closing.accounts.miner.value.lastClaimGodlAt = '1767348301'; }],
    ['claim marker regression', f => { f.interval.closing.accounts.miner.value.lastClaimGodlAt = '-1'; }],
    ['referrer changed', f => { f.interval.closing.accounts.miner.value.referrer = f.trackedAccounts.miner; }],
    ['authority changed', f => { f.interval.closing.accounts.miner.value.authority = f.trackedAccounts.miner; }],
    ['extended reincarnation', f => { f.interval.closing.accounts.minerExtended.status = 'missing'; }],
  ];
  for (const [name, mutate] of cases) await t.test(name, async () => {
    const f = await claimAccountingFixture(); mutate(f); assert.throws(() => extend(f));
  });
});

test('projection checker validates cumulative conservation and rejects malformed v3 summaries', async () => {
  const f = await claimAccountingFixture(), c = extend(f);
  assert.equal(validateClaimProgression(c.anchor.closing, c.closing, c.ledger.claims), c.ledger.claims);
  for (const mutate of [
    x => { delete x.ledger.claims; },
    x => { x.ledger.claims.count = 0; },
    x => { x.ledger.claims.count = 1.5; },
    x => { x.ledger.claims.treasuryDebitBaseUnits = '1'; },
    x => { x.ledger.claims.ownerReceiptBaseUnits = '1200000000001'; },
    x => { x.ledger.claims.networkFeeLamports = '10001'; },
    x => { x.ledger.lastInterval.claims.count = 2; },
    x => { x.ledger.lastInterval.claims.ownerReceiptBaseUnits = '0'; },
    x => { delete x.ledger.lastInterval.claims; },
  ]) { const altered = structuredClone(c); mutate(altered); assert.throws(() => validateFundedCheckpoint(altered)); }
});

test('failed claim attempts cannot carry successful proofs and charge only fee without promoting v3', async () => {
  const f = await claimAccountingFixture(), tx = f.interval.transactions[0];
  tx.outcome = 'failed'; tx.error = { InstructionError: [0, 'Custom'] }; tx.instructionsAreAttempts = true;
  f.interval.closing.accounts.miner.value = structuredClone(f.anchor.closing.accounts.miner.value);
  for (const page of Object.values(f.interval.pages)) page.rows = page.rows.length ? [indexedRow(tx)] : [];
  bind(f);
  assert.throws(() => extend(f), /Extra GODL claim proof/);
  f.interval.godlClaims = [];
  const c = extend(f);
  assert.equal(c.schemaVersion, 2);
  assert.equal(c.ledger.netCostLamports, '100010000');
});

test('summary helper rejects unsupported and extra claim evidence before optional projection', async () => {
  const f = await claimAccountingFixture();
  assert.deepEqual(summarizeIntervalClaims({ opening: f.anchor.closing, interval: f.interval }), extend(f).ledger.claims);
  const missing = structuredClone(f.interval); missing.godlClaims = [];
  assert.throws(() => summarizeIntervalClaims({ opening: f.anchor.closing, interval: missing }), /proof missing/);
});
