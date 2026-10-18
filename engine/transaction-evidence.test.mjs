import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { getAddressDecoder } from '@solana/addresses';
import { collectRecentTransactions, parseRpcJson, projectTransaction } from './transaction-evidence.mjs';
import { deriveAddresses, GODL_PROGRAM_ADDRESS } from './chain.mjs';
import { MAINNET_GENESIS } from './monitor.mjs';

const wallet = getAddressDecoder().decode(Buffer.alloc(32, 7));
const other = 'ComputeBudget111111111111111111111111111111';
const sig = '2'.repeat(88), secondSig = '3'.repeat(88);
const options = { wallet, trackedAccounts: { wallet }, expectedSignature: sig, expectedSlot: '12' };
function fixture() {
  return { slot: 12, blockTime: 1, version: 'legacy',
    transaction: { signatures: [sig], message: { accountKeys: [wallet, GODL_PROGRAM_ADDRESS],
      instructions: [{ programIdIndex: 1, accounts: [0], data: '5' }] } },
    meta: { err: null, fee: 5000, preBalances: [100000, 10], postBalances: [94000, 1010],
      innerInstructions: [], loadedAddresses: { writable: [], readonly: [] } } };
}

test('retains unsafe RPC integer source and exact deltas without inferring acquisition cost', () => {
  const raw = JSON.stringify(fixture()).replace('100000', '18446744073709551615').replace('94000', '18446744073709545615');
  const tx = projectTransaction(parseRpcJson(raw), options);
  assert.equal(tx.deltas.wallet.beforeLamports, '18446744073709551615');
  assert.equal(tx.deltas.wallet.changeLamports, '-6000');
  assert.equal(tx.ownerPaidNetworkFeeLamports, '5000');
  assert.equal(tx.netAcquisitionCost.status, 'unavailable');
  assert.equal(tx.earnedUnrefinedGodl.status, 'unavailable');
  assert.throws(() => projectTransaction(JSON.parse(raw), options), /lossless u64/);
});

test('resolves v0 writable then readonly keys; third-party fee remains distinct', () => {
  const tx = fixture();
  tx.version = 0;
  tx.transaction.message.accountKeys = [other];
  tx.transaction.message.instructions[0] = { programIdIndex: 2, accounts: [1], data: '5' };
  tx.meta.loadedAddresses = { writable: [wallet], readonly: [GODL_PROGRAM_ADDRESS] };
  tx.meta.preBalances = [10000, 100000, 10]; tx.meta.postBalances = [5000, 100020, 10];
  const view = projectTransaction(tx, options);
  assert.equal(view.deltas.wallet.changeLamports, '20');
  assert.equal(view.ownerPaidNetworkFeeLamports, '0');
  assert.equal(view.transactionFeeLamports, '5000');
  assert.deepEqual(view.godlInstructions[0].accounts, [wallet]);
  delete tx.meta.loadedAddresses;
  assert.throws(() => projectTransaction(tx, options), /loaded addresses unavailable/);
});

test('failed transaction preserves fee and labels instructions as attempts', () => {
  const tx = fixture(); tx.meta.err = { InstructionError: [0, 'InvalidArgument'] };
  tx.meta.postBalances = [95000, 10];
  const view = projectTransaction(tx, options);
  assert.equal(view.outcome, 'failed'); assert.equal(view.instructionsAreAttempts, true);
  assert.equal(view.ownerPaidNetworkFeeLamports, '5000');
  assert.equal(view.earnedUnrefinedGodl.status, 'unavailable');
});

test('missing transaction/meta is a coverage hole; mismatches and malformed indices reject', () => {
  assert.equal(projectTransaction(null, options).reason, 'rpc-returned-null');
  const noMeta = fixture(); noMeta.meta = null;
  assert.equal(projectTransaction(noMeta, options).reason, 'metadata-unavailable');
  for (const [mutate, pattern] of [
    [tx => { tx.transaction.signatures[0] = secondSig; }, /signature mismatch/],
    [tx => { tx.slot = 13; }, /slot mismatch/],
    [tx => { tx.meta.postBalances.pop(); }, /balance arrays/],
    [tx => { tx.transaction.message.instructions[0].programIdIndex = 99; }, /invalid account index/],
    [tx => { tx.meta.fee = -1; }, /lossless u64/],
  ]) { const tx = fixture(); mutate(tx); assert.throws(() => projectTransaction(tx, options), pattern); }
});

function fakeRpc(handler, calls = []) {
  return async (_url, init) => {
    const request = JSON.parse(init.body); calls.push(request);
    const result = handler(request);
    return Response.json({ jsonrpc: '2.0', id: request.id, result });
  };
}

async function captureFixture() {
  const derived = await deriveAddresses(wallet), tx = fixture();
  for (const role of ['miner', 'automation', 'automationV2']) {
    tx.transaction.message.accountKeys.push(derived[role].address);
    tx.meta.preBalances.push(100); tx.meta.postBalances.push(100);
  }
  return tx;
}

test('deduplicates four overlapping histories and preserves an unavailable detail', async () => {
  const calls = [], evidence = [];
  const tx = await captureFixture();
  const rows = [{ signature: sig, slot: 12, err: null, confirmationStatus: 'finalized' },
    { signature: secondSig, slot: 11, err: null, confirmationStatus: 'finalized' }];
  const result = await collectRecentTransactions({ wallet, onResponse: async record => evidence.push(record),
    fetchImpl: fakeRpc(request => request.method === 'getGenesisHash' ? MAINNET_GENESIS :
      request.method === 'getSignaturesForAddress' ? rows : request.params[0] === sig ? tx : null, calls) });
  assert.equal(calls.filter(call => call.method === 'getTransaction').length, 2);
  assert.equal(result.coverage.requestedTransactions, 2);
  assert.equal(result.coverage.availableTransactions, 1);
  assert.equal(result.coverage.lifetimeComplete, false);
  assert.equal(result.transactions[1].reason, 'rpc-returned-null');
  assert.equal(evidence.length, 7);
  assert.equal(result.source.rpcOrigin, 'https://api.mainnet-beta.solana.com');
  assert.ok(evidence.every(record => record.source.endpointSha256 === result.source.endpointSha256));
  assert.ok(evidence.every(record => /^[a-f0-9]{64}$/.test(record.sha256)));
  assert.ok(calls.filter(call => call.method !== 'getGenesisHash').every(call => call.params[1].commitment === 'finalized'));
});

test('wrong genesis prevents all history reads', async () => {
  const calls = [];
  await assert.rejects(collectRecentTransactions({ wallet, fetchImpl: fakeRpc(() => 'other-network', calls) }), { failureCode: 'wrongNetwork' });
  assert.equal(calls.length, 1);
});

test('non-finalized or conflicting pages are not admitted; outcome disagreement remains unavailable', async () => {
  const derived = await deriveAddresses(wallet);
  const rows = publicKey => [{ signature: sig, slot: publicKey === derived.miner.address ? 13 : 12,
    err: null, confirmationStatus: publicKey === derived.automation.address ? 'confirmed' : 'finalized' }];
  const tx = fixture(); tx.meta.err = 'different-outcome';
  const result = await collectRecentTransactions({ wallet,
    fetchImpl: fakeRpc(request => request.method === 'getGenesisHash' ? MAINNET_GENESIS :
      request.method === 'getSignaturesForAddress' ? rows(request.params[0]) : tx) });
  assert.equal(result.pages.filter(page => page.status === 'unavailable').length, 2);
  assert.equal(result.transactions.length, 1);
  assert.match(result.transactions[0].reason, /outcome mismatch/);
  assert.equal(result.coverage.recentPagesAvailable, false);
});

test('signature index cannot attribute a transaction to an address absent from its keys', async () => {
  const result = await collectRecentTransactions({ wallet, fetchImpl: fakeRpc(request =>
    request.method === 'getGenesisHash' ? MAINNET_GENESIS : request.method === 'getSignaturesForAddress' ?
      [{ signature: sig, slot: 12, err: null, confirmationStatus: 'finalized' }] : fixture()) });
  assert.equal(result.coverage.availableTransactions, 0);
  assert.match(result.transactions[0].reason, /indexed address missing/);
});

test('records endpoint provenance without persisting path/query credentials', async () => {
  const records = [], urls = [];
  const normalized = 'https://example.com/SYNTHETIC_provider_key/rpc?api-key=SYNTHETIC_query_key';
  const fake = fakeRpc(request => request.method === 'getGenesisHash' ? MAINNET_GENESIS : []);
  const result = await collectRecentTransactions({ wallet,
    rpcUrl: 'https://EXAMPLE.com:443/SYNTHETIC_provider_key/rpc?api-key=SYNTHETIC_query_key#unused',
    fetchImpl: async (url, init) => { urls.push(url); return fake(url, init); },
    onResponse: async record => records.push(record) });
  assert.equal(result.source.rpcOrigin, 'https://example.com');
  assert.equal(result.source.endpointSha256, createHash('sha256').update(normalized).digest('hex'));
  assert.ok(urls.every(url => url === normalized));
  assert.ok(records.every(record => JSON.stringify(record.source) === JSON.stringify(result.source)));
  assert.doesNotMatch(JSON.stringify({ result, records }), /SYNTHETIC_provider_key|SYNTHETIC_query_key|unused/);
  for (const rpcUrl of ['file:///secret', 'https://user:password@example.com']) {
    await assert.rejects(collectRecentTransactions({ wallet, rpcUrl,
      fetchImpl: () => { throw new Error('must not fetch'); } }), { failureCode: 'configuration' });
  }
});

test('oversized history pages stay unavailable without capturing their rejected bodies', async () => {
  const evidence = []; let cancelled = 0;
  const result = await collectRecentTransactions({ wallet, onResponse: async record => evidence.push(record),
    fetchImpl: async (_url, init) => {
      assert.equal(init.redirect, 'error');
      const request = JSON.parse(init.body);
      if (request.method === 'getGenesisHash') return Response.json({ jsonrpc: '2.0', id: request.id, result: MAINNET_GENESIS });
      return new Response(new ReadableStream({ start(controller) {
        controller.enqueue(Buffer.alloc(16 * 1024 * 1024)); controller.enqueue(Buffer.from('x'));
      }, cancel() { cancelled++; } }));
    } });
  assert.equal(cancelled, 4); assert.equal(result.coverage.recentPagesAvailable, false);
  assert.ok(result.pages.every(page => page.status === 'unavailable'));
  assert.deepEqual(evidence.map(record => record.method), ['getGenesisHash']);
});
