import { boundedFetch, httpsEndpoint } from './network-response.mjs';
import { address } from '@solana/addresses';
import { createHash } from 'node:crypto';
import { deriveAddresses, GODL_PROGRAM_ADDRESS } from './chain.mjs';
import { MAINNET_GENESIS } from './monitor.mjs';
import { RuntimeFailure, rpcHTTPFailure } from './runtime-failure.mjs';

const U64_MAX = (1n << 64n) - 1n;
const SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;
const unknown = reason => ({ status: 'unavailable', reason });

export function parseRpcJson(raw) {
  // Reviver source preserves RPC integers before Number rounding can lose bits.
  return JSON.parse(raw, (_key, value, context) => {
    if (typeof value === 'number' && !Number.isSafeInteger(value) && Number.isInteger(value)) {
      if (!context?.source) throw new Error('lossless JSON source support is required');
      return context.source;
    }
    return value;
  });
}

function uint(value, name) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) value = String(value);
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value) || BigInt(value) > U64_MAX) {
    throw new Error(`${name} must be a lossless u64`);
  }
  return value;
}

function signature(value) {
  if (typeof value !== 'string' || !SIGNATURE.test(value)) throw new Error('invalid signature');
  return value;
}

function index(value, keys) {
  if (!Number.isSafeInteger(value) || value < 0 || value >= keys.length) throw new Error('invalid account index');
  return value;
}

export function projectTransaction(result, { wallet, trackedAccounts, expectedSignature, expectedSlot }) {
  address(wallet); signature(expectedSignature);
  if (result === null) return { signature: expectedSignature, status: 'unavailable', reason: 'rpc-returned-null' };
  if (!result || result.transaction?.signatures?.[0] !== expectedSignature) throw new Error('transaction signature mismatch');
  const slot = uint(result.slot, 'slot');
  if (slot !== uint(expectedSlot, 'expected slot')) throw new Error('transaction slot mismatch');
  if (result.version !== 'legacy' && result.version !== 0) throw new Error('unsupported transaction version');
  if (result.meta === null) return { signature: expectedSignature, slot, status: 'unavailable', reason: 'metadata-unavailable' };
  const meta = result.meta, message = result.transaction.message;
  if (!meta || !Object.hasOwn(meta, 'err') || !Array.isArray(message?.accountKeys) || !message.accountKeys.length) {
    throw new Error('malformed transaction metadata or keys');
  }
  const loaded = meta.loadedAddresses;
  if (result.version === 0 && !loaded) throw new Error('version-0 loaded addresses unavailable');
  if (loaded && (!Array.isArray(loaded.writable) || !Array.isArray(loaded.readonly))) throw new Error('malformed loaded addresses');
  const keys = [...message.accountKeys, ...(loaded?.writable ?? []), ...(loaded?.readonly ?? [])].map(address);
  if (new Set(keys).size !== keys.length) throw new Error('duplicate transaction account keys');
  if (![meta.preBalances, meta.postBalances].every(values => Array.isArray(values) && values.length === keys.length)) {
    throw new Error('balance arrays do not match resolved account keys');
  }
  const before = meta.preBalances.map(value => BigInt(uint(value, 'pre balance')));
  const after = meta.postBalances.map(value => BigInt(uint(value, 'post balance')));
  const fee = uint(meta.fee, 'transaction fee');
  if (!Array.isArray(message.instructions)) throw new Error('missing compiled instructions');
  const instructions = message.instructions.map((instruction, i) => ({ instruction, outerIndex: i, inner: false }));
  if (meta.innerInstructions !== null && meta.innerInstructions !== undefined) {
    if (!Array.isArray(meta.innerInstructions)) throw new Error('invalid inner instructions');
    for (const group of meta.innerInstructions) {
      index(group.index, message.instructions);
      if (!Array.isArray(group.instructions)) throw new Error('invalid inner instruction group');
      for (const instruction of group.instructions) instructions.push({ instruction, outerIndex: group.index, inner: true });
    }
  }
  const godlInstructions = [];
  for (const { instruction, outerIndex, inner } of instructions) {
    const program = keys[index(instruction.programIdIndex, keys)];
    if (!Array.isArray(instruction.accounts) || typeof instruction.data !== 'string') throw new Error('invalid compiled instruction');
    const accounts = instruction.accounts.map(value => keys[index(value, keys)]);
    if (program === GODL_PROGRAM_ADDRESS) godlInstructions.push({ outerIndex, inner, accounts, dataBase58: instruction.data });
  }
  const deltas = Object.fromEntries(Object.entries(trackedAccounts).map(([role, publicKey]) => {
    address(publicKey);
    const i = keys.indexOf(publicKey);
    return [role, i < 0 ? { address: publicKey, status: 'not-in-transaction' } : {
      address: publicKey, status: 'observed', beforeLamports: before[i].toString(),
      afterLamports: after[i].toString(), changeLamports: (after[i] - before[i]).toString(),
    }];
  }));
  return { signature: expectedSignature, slot, status: 'observed', blockTime: result.blockTime,
    outcome: meta.err === null ? 'succeeded' : 'failed', error: meta.err, feePayer: keys[0],
    transactionFeeLamports: fee, ownerPaidNetworkFeeLamports: keys[0] === wallet ? fee : '0',
    deltas, godlInstructions, instructionsAreAttempts: meta.err !== null,
    attribution: 'unreconciled', netAcquisitionCost: unknown('cash-flows-and-rewards-unreconciled'),
    earnedUnrefinedGodl: unknown('checkpoint-reward-attribution-required') };
}

export async function collectRecentTransactions({ wallet, rpcUrl = 'https://api.mainnet-beta.solana.com',
  limit = 3, fetchImpl = globalThis.fetch, onResponse = async () => {}, requestTimeoutMs = 10000 }) {
  address(wallet);
  const endpoint = httpsEndpoint(rpcUrl);
  endpoint.hash = '';
  const source = { rpcOrigin: endpoint.origin,
    endpointSha256: createHash('sha256').update(endpoint.href).digest('hex'),
    endpointDetails: 'path and query omitted to protect provider credentials' };
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('limit must be 1..100 per address');
  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 1 || requestTimeoutMs > 60000) throw new Error('invalid request timeout');
  let sequence = 0;
  async function rpc(method, params) {
    const id = ++sequence;
    const response = await boundedFetch(fetchImpl, endpoint.href, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }), signal: AbortSignal.timeout(requestTimeoutMs) });
    const raw = await response.text();
    await onResponse({ id, method, params, source, httpStatus: response.status, observedAt: new Date().toISOString(),
      sha256: createHash('sha256').update(raw).digest('hex'), raw });
    if (!response.ok) throw rpcHTTPFailure(response.status);
    const body = parseRpcJson(raw);
    if (body.id !== id || body.jsonrpc !== '2.0') throw new Error('RPC response identity mismatch');
    if (body.error) throw new RuntimeFailure('providerUnavailable');
    if (!Object.hasOwn(body, 'result')) throw new Error('RPC result missing');
    return body.result;
  }
  const genesisHash = await rpc('getGenesisHash', []);
  if (genesisHash !== MAINNET_GENESIS) throw new RuntimeFailure('wrongNetwork');
  const derived = await deriveAddresses(wallet);
  const trackedAccounts = { wallet, miner: derived.miner.address,
    automation: derived.automation.address, automationV2: derived.automationV2.address };
  const pages = [], requested = new Map();
  for (const [role, publicKey] of Object.entries(trackedAccounts)) {
    try {
      const rows = await rpc('getSignaturesForAddress', [publicKey, { commitment: 'finalized', limit }]);
      if (!Array.isArray(rows) || rows.length > limit) throw new Error('invalid signature page');
      const pageSignatures = new Set();
      let priorSlot = null;
      // Validate the whole page before admitting any signature from it.
      const validated = rows.map(row => {
        signature(row.signature); const slot = uint(row.slot, 'indexed slot');
        if (row.confirmationStatus !== 'finalized') throw new Error('non-finalized signature');
        if (pageSignatures.has(row.signature) || (priorSlot !== null && BigInt(slot) > priorSlot)) throw new Error('unordered or duplicate signature page');
        if (!Object.hasOwn(row, 'err')) throw new Error('indexed outcome missing');
        const existing = requested.get(row.signature);
        if (existing && (existing.slot !== slot || JSON.stringify(existing.error) !== JSON.stringify(row.err))) throw new Error('conflicting signature evidence');
        priorSlot = BigInt(slot); pageSignatures.add(row.signature);
        return { signature: row.signature, slot, error: row.err };
      });
      for (const row of validated) requested.set(row.signature, { ...row,
        roles: [...(requested.get(row.signature)?.roles ?? []), role] });
      pages.push({ role, address: publicKey, status: 'observed', count: rows.length,
        signatures: validated.map(row => row.signature), nextBefore: validated.at(-1)?.signature ?? null,
        coverage: 'bounded-recent-page; historical-completeness-unverified' });
    } catch (error) { pages.push({ role, address: publicKey, status: 'unavailable', reason: error.message }); }
  }
  const transactions = [];
  for (const row of requested.values()) {
    try {
      const result = await rpc('getTransaction', [row.signature, { commitment: 'finalized', encoding: 'json', maxSupportedTransactionVersion: 0 }]);
      const projected = projectTransaction(result, { wallet, trackedAccounts, expectedSignature: row.signature, expectedSlot: row.slot });
      if (projected.status === 'observed' && JSON.stringify(projected.error) !== JSON.stringify(row.error)) throw new Error('indexed/transaction outcome mismatch');
      if (projected.status === 'observed' && row.roles.some(role => projected.deltas[role].status !== 'observed')) throw new Error('indexed address missing from transaction');
      transactions.push(projected);
    } catch (error) { transactions.push({ signature: row.signature, slot: row.slot, status: 'unavailable', reason: error.message }); }
  }
  return { schemaVersion: 1, kind: 'recent-transaction-evidence', observedAt: new Date().toISOString(),
    wallet, genesisHash, commitment: 'finalized', source, trackedAccounts, pages, transactions,
    coverage: { lifetimeComplete: false, recentPagesAvailable: pages.every(page => page.status === 'observed'),
      requestedTransactions: requested.size, availableTransactions: transactions.filter(tx => tx.status === 'observed').length },
    netAcquisitionCost: unknown('bounded-unreconciled-evidence'), executionAllowed: false };
}
