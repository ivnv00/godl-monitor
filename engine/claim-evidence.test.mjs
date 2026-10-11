import test from 'node:test';
import assert from 'node:assert/strict';
import { projectGodlClaim } from './claim-evidence.mjs';
import { claimFixture, claimTransferData, encodeClaimBytes } from './test-fixtures/claim-evidence.mjs';

test('pinned Steel 4.0.9 transfer carries the duplicate treasury signer account', async () => {
  const fixture = await claimFixture();
  const transfer = fixture.result.meta.innerInstructions[0].instructions[0];
  transfer.accounts = [...transfer.accounts.slice(0, 3), transfer.accounts[2]];
  assert.equal((await projectGodlClaim(fixture.result, fixture.options)).status, 'observed');
  transfer.accounts.pop();
  assert.equal((await projectGodlClaim(fixture.result, fixture.options)).status, 'unavailable');
});

test('standalone owner-paid claim proves exact receipt, fee and zero rent without principal inference', async () => {
  const fixture = await claimFixture({ amount: '9007199254740993' });
  const before = JSON.stringify(fixture.result);
  const evidence = await projectGodlClaim(fixture.result, fixture.options);
  assert.equal(evidence.status, 'observed');
  assert.equal(evidence.ownerReceipt.amountBaseUnits, '9007199254740993');
  assert.equal(evidence.treasuryDebit.amountBaseUnits, '9007199254740993');
  assert.equal(evidence.ownerPaidNetworkFeeLamports, '5000');
  assert.equal(evidence.newAccountRentLamports, '0');
  assert.equal(evidence.principal.status, 'unavailable');
  assert.equal(evidence.refiningDeduction.status, 'unavailable');
  assert.equal(evidence.executionAllowed, false);
  assert.equal(JSON.stringify(fixture.result), before);
});

test('legacy and loaded v0 preserve u64 edges and ignore floating amounts and log text', async () => {
  for (const version of ['legacy', 0]) {
    for (const value of ['0', '9007199254740992', '9007199254740993', '18446744073709551615']) {
      const fixture = await claimFixture({ amount: value, version, computeBudget: true });
      fixture.result.meta.logMessages = ['Claiming 999999999 GODL'];
      const evidence = await projectGodlClaim(fixture.result, fixture.options);
      assert.equal(evidence.status, 'observed');
      assert.equal(evidence.ownerReceipt.amountBaseUnits, value);
      assert.equal(evidence.treasuryDebit.amountBaseUnits, value);
      assert.equal(evidence.source.commit, '4b7bb4c6619d25f52ef9152de906a46027995143');
    }
  }
});

test('incomplete or unsupported routes expose no partial monetary receipt', async t => {
  const cases = [
    ['failed transaction', f => { f.result.meta.err = { InstructionError: [0, 'Custom'] }; }],
    ['sponsored owner', f => { f.options.wallet = f.result.transaction.message.accountKeys[1]; }],
    ['additional signer', f => { f.result.transaction.message.header.numRequiredSignatures = 2; f.result.transaction.signatures.push('4'.repeat(88)); }],
    ['wrong discriminator', f => { f.result.transaction.message.instructions[0].data = '4'; }],
    ['padded discriminator', f => { f.result.transaction.message.instructions[0].data = encodeClaimBytes([4, 0]); }],
    ['wrong role order', f => { const a = f.result.transaction.message.instructions[0].accounts; [a[1], a[2]] = [a[2], a[1]]; }],
    ['duplicate role', f => { const a = f.result.transaction.message.instructions[0].accounts; a[4] = a[6]; }],
    ['short role list', f => { f.result.transaction.message.instructions[0].accounts.pop(); }],
    ['multiple outer claims', f => { f.result.transaction.message.instructions.push(structuredClone(f.result.transaction.message.instructions[0])); }],
    ['inner GODL claim', f => { f.result.meta.innerInstructions[0].instructions.push(structuredClone(f.result.transaction.message.instructions[0])); }],
    ['outer token transfer', f => { f.result.transaction.message.instructions.push(structuredClone(f.result.meta.innerInstructions[0].instructions[0])); }],
    ['wrong token mint', f => { f.result.meta.postTokenBalances[1].mint = f.result.transaction.message.accountKeys[1]; }],
    ['wrong token owner', f => { f.result.meta.preTokenBalances[1].owner = f.result.meta.preTokenBalances[0].owner; f.result.meta.postTokenBalances[1].owner = f.result.meta.preTokenBalances[0].owner; }],
    ['wrong token program', f => { f.result.meta.preTokenBalances[1].programId = f.wallet; f.result.meta.postTokenBalances[1].programId = f.wallet; }],
    ['wrong decimals', f => { f.result.meta.postTokenBalances[1].uiTokenAmount.decimals = 9; }],
    ['missing token owner', f => { delete f.result.meta.preTokenBalances[1].owner; }],
    ['missing pre token account', f => { f.result.meta.preTokenBalances.pop(); }],
    ['missing post token account', f => { f.result.meta.postTokenBalances.pop(); }],
    ['duplicate token account', f => { f.result.meta.preTokenBalances.push(structuredClone(f.result.meta.preTokenBalances[0])); }],
    ['missing all token metadata', f => { delete f.result.meta.preTokenBalances; }],
    ['unbalanced token delta', f => { f.result.meta.postTokenBalances[1].uiTokenAmount.amount = '999'; }],
    ['wrong transfer amount', f => { f.result.meta.innerInstructions[0].instructions[0].data = claimTransferData('999'); }],
    ['wrong treasury authority', f => { f.result.meta.innerInstructions[0].instructions[0].accounts[2] = 0; }],
    ['wrong treasury CPI signer', f => { f.result.meta.innerInstructions[0].instructions[0].accounts[3] = 0; }],
    ['wrong transfer recipient', f => { f.result.meta.innerInstructions[0].instructions[0].accounts[1] = 0; }],
    ['duplicate token transfer', f => { f.result.meta.innerInstructions[0].instructions.push(structuredClone(f.result.meta.innerInstructions[0].instructions[0])); }],
    ['unknown CPI', f => { f.result.meta.innerInstructions[0].instructions[0].programIdIndex = 0; }],
    ['token transfer checked CPI', f => { f.result.meta.innerInstructions[0].instructions[0].data = encodeClaimBytes([12, ...Array(9).fill(0)]); }],
    ['system account creation CPI', f => { const a = f.result.transaction.message.instructions[0].accounts; f.result.meta.innerInstructions[0].instructions[0].programIdIndex = a[7]; f.result.meta.innerInstructions[0].instructions[0].data = '1'; }],
    ['recipient creation', f => { const i = f.result.meta.preTokenBalances[1].accountIndex; f.result.meta.preBalances[i] = '0'; f.result.meta.postBalances[i] = '0'; }],
    ['miner extended creation', f => { const i = f.result.transaction.message.instructions[0].accounts[11]; f.result.meta.preBalances[i] = '0'; f.result.meta.postBalances[i] = '0'; }],
    ['rent topup', f => { f.result.meta.postBalances[1] = '2039281'; }],
    ['owner SOL movement beyond fee', f => { f.result.meta.postBalances[0] = '9994999'; }],
    ['readonly recipient', f => { f.result.transaction.message.header.numReadonlyUnsignedAccounts = f.result.transaction.message.accountKeys.length - 1; }],
    ['unavailable inner recording', f => { f.result.meta.innerInstructions = null; }],
    ['unexpected CPI under another outer instruction', f => { const original = structuredClone(f.result.transaction.message.instructions[0]); original.programIdIndex = 0; original.data = '1'; f.result.transaction.message.instructions.push(original); f.result.meta.innerInstructions[0].index = 1; }],
  ];
  for (const [name, mutate] of cases) await t.test(name, async () => {
    const fixture = await claimFixture(); mutate(fixture);
    const evidence = await projectGodlClaim(fixture.result, fixture.options);
    assert.equal(evidence.status, 'unavailable');
    assert.ok(evidence.reason.length < 80);
    for (const field of ['ownerReceipt', 'referralReceipt', 'treasuryDebit', 'ownerPaidNetworkFeeLamports', 'newAccountRentLamports']) assert.equal(Object.hasOwn(evidence, field), false);
  });
});

test('zero claims require complete inner recording and do not accept a zero owner transfer', async () => {
  for (const missing of [null, undefined]) {
    const fixture = await claimFixture({ amount: '0' });
    fixture.result.meta.innerInstructions = missing;
    assert.equal((await projectGodlClaim(fixture.result, fixture.options)).status, 'unavailable');
  }
  const fixture = await claimFixture({ amount: '0' });
  const instruction = fixture.result.transaction.message.instructions[0];
  fixture.result.meta.innerInstructions[0].instructions.push({ programIdIndex: instruction.accounts[8],
    accounts: [instruction.accounts[6], instruction.accounts[4], instruction.accounts[5], instruction.accounts[5]], data: claimTransferData('0') });
  assert.equal((await projectGodlClaim(fixture.result, fixture.options)).status, 'unavailable');
});

test('malformed identity, envelope and amounts fail with one bounded generic diagnostic', async t => {
  const cases = [
    ['signature mismatch', f => { f.options.expectedSignature = '4'.repeat(88); }],
    ['slot mismatch', f => { f.options.expectedSlot = '999'; }],
    ['invalid wallet', f => { f.options.wallet = 'PRIVATE_PATH_OR_RESPONSE'; }],
    ['unsafe slot', f => { f.result.slot = Number.MAX_SAFE_INTEGER + 1; }],
    ['duplicate account key', f => { f.result.transaction.message.accountKeys[1] = f.wallet; }],
    ['missing header', f => { delete f.result.transaction.message.header; }],
    ['impossible header', f => { f.result.transaction.message.header.numReadonlySignedAccounts = 2; }],
    ['missing balances', f => { f.result.meta.preBalances.pop(); }],
    ['invalid outer account index', f => { f.result.transaction.message.instructions[0].accounts[0] = 9999; }],
    ['invalid inner account index', f => { f.result.meta.innerInstructions[0].instructions[0].accounts[0] = -1; }],
    ['invalid compiled base58', f => { f.result.transaction.message.instructions[0].data = 'PRIVATE_RESPONSE_0'; }],
    ['duplicate inner groups', f => { f.result.meta.innerInstructions.push(structuredClone(f.result.meta.innerInstructions[0])); }],
    ['invalid token index', f => { f.result.meta.preTokenBalances[1].accountIndex = 100; }],
    ...['00', '-1', '1.0', '1e3', '18446744073709551616', 1000].map(value => [`noncanonical token amount ${value}`, f => { f.result.meta.postTokenBalances[1].uiTokenAmount.amount = value; }]),
    ['missing loaded addresses', f => { f.result.version = 0; delete f.result.meta.loadedAddresses; }],
  ];
  for (const [name, mutate] of cases) await t.test(name, async () => {
    const fixture = await claimFixture(); mutate(fixture);
    await assert.rejects(projectGodlClaim(fixture.result, fixture.options), { message: 'malformed claim evidence' });
  });
});

test('null and absent metadata remain unavailable and do not invent receipt or slot', async () => {
  const fixture = await claimFixture();
  const nullEvidence = await projectGodlClaim(null, { ...fixture.options, expectedSlot: undefined });
  assert.equal(nullEvidence.status, 'unavailable');
  assert.equal(Object.hasOwn(nullEvidence, 'slot'), false);
  fixture.result.meta = null;
  assert.equal((await projectGodlClaim(fixture.result, fixture.options)).status, 'unavailable');
});

test('referral evidence rejects altered splits, token authority ownership, order and source u64 overflow', async t => {
  const cases = [
    ['bad referral split with matching transfer and delta', f => {
      f.result.meta.postTokenBalances[1].uiTokenAmount.amount = '198';
      f.result.meta.postTokenBalances[2].uiTokenAmount.amount = '2';
      f.result.meta.innerInstructions[0].instructions[0].data = claimTransferData('2');
      f.result.meta.innerInstructions[0].instructions[1].data = claimTransferData('198');
    }],
    ['referrer authority used as token owner', f => {
      f.result.meta.preTokenBalances[2].owner = f.wallet;
      f.result.meta.postTokenBalances[2].owner = f.wallet;
    }],
    ['referral transfer follows owner transfer', f => { f.result.meta.innerInstructions[0].instructions.reverse(); }],
    ['missing referral transfer', f => { f.result.meta.innerInstructions[0].instructions.shift(); }],
    ['missing referrer pre token metadata', f => { f.result.meta.preTokenBalances.pop(); }],
    ['wrong referrer ATA', f => { const a = f.result.transaction.message.instructions[0].accounts; a[13] = a[4]; }],
  ];
  for (const [name, mutate] of cases) await t.test(name, async () => {
    const fixture = await claimFixture({ referral: true, amount: '200' }); mutate(fixture);
    assert.equal((await projectGodlClaim(fixture.result, fixture.options)).status, 'unavailable');
  });
  const overflow = await claimFixture({ referral: true, amount: '18446744073709551615' });
  assert.equal((await projectGodlClaim(overflow.result, overflow.options)).reason, 'referral-split-mismatch');
  const exactLimit = await claimFixture({ referral: true, amount: '368934881474191032' });
  const receipt = await projectGodlClaim(exactLimit.result, exactLimit.options);
  assert.equal(receipt.status, 'observed');
  assert.equal(receipt.referralReceipt.amountBaseUnits, '1844674407370955');
  assert.equal(receipt.ownerReceipt.amountBaseUnits, '367090207066820077');
});

test('unrelated token changes and compute-budget CPI invalidate a whole receipt', async () => {
  const fixture = await claimFixture();
  const extra = structuredClone(fixture.result.meta.preTokenBalances[0]);
  extra.accountIndex = 0; extra.uiTokenAmount.amount = '0';
  fixture.result.meta.preTokenBalances.push(extra);
  fixture.result.meta.postTokenBalances.push({ ...structuredClone(extra), uiTokenAmount: { amount: '1', decimals: 11 } });
  assert.equal((await projectGodlClaim(fixture.result, fixture.options)).reason, 'unexpected-token-movement');
  const compute = await claimFixture({ computeBudget: true });
  compute.result.meta.innerInstructions.push({ index: 0, instructions: structuredClone(compute.result.meta.innerInstructions[0].instructions) });
  assert.equal((await projectGodlClaim(compute.result, compute.options)).reason, 'unexpected-inner-instructions');
});

test('projection is offline and fee arithmetic remains lossless at u64 limits', async () => {
  const fixture = await claimFixture();
  fixture.result.meta.fee = '9007199254740993';
  fixture.result.meta.preBalances[0] = '18446744073709551615';
  fixture.result.meta.postBalances[0] = '18437736874454810622';
  const previousFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('network access forbidden'); };
  try {
    const evidence = await projectGodlClaim(fixture.result, fixture.options);
    assert.equal(evidence.status, 'observed');
    assert.equal(evidence.ownerPaidNetworkFeeLamports, '9007199254740993');
  } finally { globalThis.fetch = previousFetch; }
});

test('referral route proves PDA-owned receipt and floor rounding including zero CPI', async () => {
  for (const [amount, owner, referral] of [['0', '0', '0'], ['199', '199', '0'], ['200', '199', '1'], ['201', '200', '1']]) {
    const fixture = await claimFixture({ referral: true, amount, version: 0, computeBudget: true });
    const evidence = await projectGodlClaim(fixture.result, fixture.options);
    assert.equal(evidence.status, 'observed');
    assert.equal(evidence.ownerReceipt.amountBaseUnits, owner);
    assert.equal(evidence.referralReceipt.amountBaseUnits, referral);
    assert.equal(evidence.referralReceipt.tokenOwner, fixture.result.meta.postTokenBalances[2].owner);
    assert.equal(evidence.referrerAuthority.status, 'unavailable');
  }
});
