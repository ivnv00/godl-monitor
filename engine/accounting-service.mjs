import { mkdir, readFile, writeFile, rename, unlink, open } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { getAddressDecoder } from '@solana/addresses';
import { readWalletState, GODL_PROGRAM_ADDRESS } from './chain.mjs';
import { parseRpcJson } from './transaction-evidence.mjs';
import { collectAccountingInterval, collectHistoricalCandles } from './accounting-evidence.mjs';
import { createAccountingRpcTransport } from './accounting-transport.mjs';
import { extendClosedAccounting, requireClosedState, validateAccountingCheckpoint } from './ongoing-cost.mjs';
import { projectPeriodReceipt } from './period-cost.mjs';
import { rpcHTTPFailure, runtimeFailureCode, runtimeFailureMessage } from './runtime-failure.mjs';

const LOADER = 'BPFLoaderUpgradeab1e11111111111111111111111';
const hash = value => createHash('sha256').update(value).digest('hex');
const json = async path => JSON.parse(await readFile(path, 'utf8'));

export async function writeAtomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    const file = await open(temp, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify(value, null, 2) + '\n'); await file.sync(); }
    finally { await file.close(); }
    await rename(temp, path);
  } finally { await unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}

// SQLite's OS-backed writer lock is released on process death. No age-based
// stale-lock deletion or PID-reuse assumptions are needed.
export async function acquireLock(path) {
  const database = new DatabaseSync(path);
  try { database.exec('PRAGMA busy_timeout=0; BEGIN IMMEDIATE'); }
  catch (error) {
    database.close();
    if (/locked|busy/i.test(error.message)) throw new Error('Accounting reconciliation is already running');
    throw error;
  }
  return async () => { try { database.exec('ROLLBACK'); } finally { database.close(); } };
}

export async function readProgramDeployment({ rpcUrl, fetchImpl = fetch, minContextSlot }) {
  async function account(publicKey, id) {
    const response = await fetchImpl(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id, method: 'getAccountInfo', params: [publicKey,
        { commitment: 'finalized', encoding: 'base64', dataSlice: { offset: 0, length: 45 }, minContextSlot: Number(minContextSlot) }] }),
      signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw rpcHTTPFailure(response.status);
    const result = parseRpcJson(await response.text());
    if (result.id !== id || result.jsonrpc !== '2.0' || result.error || !result.result?.value
        || BigInt(result.result.context.slot) < BigInt(minContextSlot)) throw new Error('Program identity unavailable');
    const value = result.result.value;
    if (value.owner !== LOADER || value.data?.[1] !== 'base64') throw new Error('Unsupported GODL program loader');
    return { value, data: Buffer.from(value.data[0], 'base64') };
  }
  if (!Number.isSafeInteger(Number(minContextSlot)) || BigInt(minContextSlot) < 0n) throw new Error('Invalid program context slot');
  const program = await account(GODL_PROGRAM_ADDRESS, 7101);
  if (!program.value.executable || program.data.length < 36 || program.data.readUInt32LE() !== 2) throw new Error('Invalid GODL program account');
  const programDataAddress = getAddressDecoder().decode(program.data.subarray(4, 36));
  const programData = await account(programDataAddress, 7102);
  if (programData.value.executable || programData.data.length < 13 || programData.data.readUInt32LE() !== 3) throw new Error('Invalid GODL program data');
  return { programDataAddress, deployedAtSlot: programData.data.readBigUInt64LE(4).toString() };
}

/** Trusted local checkpoint only. This does not admit snapshots to the observer DB. */
export function projectAccountingCheckpoint(snapshot, checkpoint) {
  validateAccountingCheckpoint(checkpoint);
  const period = projectPeriodReceipt(snapshot, checkpoint.receipt);
  const status = checkpoint.status;
  if (!status || !['current', 'waiting', 'blocked', 'retrying'].includes(status.state)
      || !Number.isFinite(Date.parse(status.checkedAt)) || !Number.isFinite(Date.parse(status.verifiedAt))
      || typeof status.reason !== 'string' || status.reason.length > 1000
      || String(status.verifiedThroughSlot) !== String(checkpoint.closing.context.slot)) throw new Error('Invalid accounting status');
  return { acquisitionPeriod: period, accounting: structuredClone(status) };
}

export async function refreshAccounting({ wallet, checkpointPath, anchorPath, evidenceRoot,
  rpcUrl = 'https://api.mainnet-beta.solana.com', fetchImpl = fetch,
  readSnapshot = readWalletState, readDeployment = readProgramDeployment,
  collectInterval = collectAccountingInterval, collectPrices = collectHistoricalCandles,
  now = () => new Date(), rpcTransportOptions = {} }) {
  if (new Set([checkpointPath, anchorPath, evidenceRoot].map(path => resolve(path))).size !== 3) throw new Error('Accounting paths must differ');
  await mkdir(dirname(checkpointPath), { recursive: true, mode: 0o700 });
  const release = await acquireLock(`${checkpointPath}.lock.sqlite`);
  try {
    let previous;
    try { previous = await json(checkpointPath); }
    catch (error) { if (error.code !== 'ENOENT') throw error; previous = await json(anchorPath); }
    validateAccountingCheckpoint(previous);
    if (previous.closing.wallet !== wallet) throw new Error('Accounting wallet mismatch');
    const run = join(evidenceRoot, `${now().toISOString().replaceAll(':', '-')}-${randomUUID()}`);
    await mkdir(run, { recursive: true, mode: 0o700 });
    let sequence = 0;
    const onResponse = async record => {
      if (typeof record.raw !== 'string' || record.sha256 !== hash(record.raw)) throw new Error('Raw accounting response hash mismatch');
      await writeAtomicJson(join(run, `response-${String(++sequence).padStart(6, '0')}.json`), record);
    };
    const endpoint = new URL(rpcUrl);
    if (!['https:', 'http:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) throw new Error('Unsupported accounting RPC URL');
    const source = { rpcOrigin: endpoint.origin, endpointSha256: hash(endpoint.href), endpointDetails: 'path and query omitted' };
    const captureResponse = async (response, options) => {
      const raw = await response.clone().text();
      const request = JSON.parse(options.body);
      await onResponse({ method: request.method, params: request.params, id: request.id, source,
        observedAt: now().toISOString(), httpStatus: response.status, sha256: hash(raw), raw });
    };
    const publicRpc = endpoint.hostname === 'api.mainnet-beta.solana.com'
      || endpoint.hostname === 'api.mainnet.solana.com';
    const rpcFetch = createAccountingRpcTransport({
      minIntervalMs: publicRpc ? 750 : 250,
      ...rpcTransportOptions,
      fetchImpl,
      onRetryResponse: async ({ response, init }) => captureResponse(response, init),
    });
    const capturedFetch = async (input, options) => {
      const response = await rpcFetch(input, options);
      await captureResponse(response, options);
      return response;
    };
    try {
      const closing = await readSnapshot({ wallet, rpcUrl, fetchImpl: capturedFetch });
      requireClosedState(closing);
      const deployment = await readDeployment({ rpcUrl, fetchImpl: capturedFetch, minContextSlot: closing.context.slot });
      if (BigInt(deployment.deployedAtSlot) > BigInt(previous.receipt.startSlot)
          || (previous.programDeployment && JSON.stringify(deployment) !== JSON.stringify(previous.programDeployment))) {
        throw new Error('GODL program upgrade requires source and accounting re-verification');
      }
      const cacheDirectory = join(evidenceRoot, 'finalized-cache');
      const cache = {
        get: async key => {
          if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('Invalid accounting cache key');
          try { return await json(join(cacheDirectory, `${key}.json`)); }
          catch (error) { if (error.code === 'ENOENT') return null; throw error; }
        },
        set: async (key, record) => {
          if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('Invalid accounting cache key');
          await writeAtomicJson(join(cacheDirectory, `${key}.json`), record);
        },
      };
      const interval = await collectInterval({ wallet, opening: previous.closing, closing, rpcUrl, fetchImpl: rpcFetch, onResponse, cache });
      const minutes = [...new Set(interval.transactions.filter(tx => tx.deltas.wallet?.status === 'observed'
        && tx.deltas.wallet.changeLamports !== '0' && tx.godlInstructions.length)
        .map(tx => Math.floor(tx.blockTime / 60) * 60))];
      const priceEvidence = await collectPrices({ minutes, fetchImpl, onResponse, nowMs: now().getTime() });
      const { candles } = priceEvidence;
      if (!Array.isArray(candles)) throw new Error('Invalid historical price evidence');
      const deploymentAfter = await readDeployment({ rpcUrl, fetchImpl: capturedFetch, minContextSlot: closing.context.slot });
      if (JSON.stringify(deploymentAfter) !== JSON.stringify(deployment)) throw new Error('Program changed while reconciling');
      const next = extendClosedAccounting({ previous, interval, candles });
      next.programDeployment = deployment;
      next.status = { state: 'current', checkedAt: now().toISOString(), verifiedAt: closing.observedAt,
        verifiedThroughSlot: closing.context.slot, reason: 'Closed mining history reconciled. New active funds remain outside the dated cost.' };
      await writeAtomicJson(join(run, 'reconciliation.json'), { interval, priceEvidence, priorReceiptSha256: hash(JSON.stringify(previous.receipt)), receipt: next.receipt, programDeployment: deployment });
      next.evidenceDirectory = run;
      await writeAtomicJson(checkpointPath, next);
      return next.status;
    } catch (error) {
      // Keep the established reconciliation state policy; raw text is used only
      // for classification and never persisted in a displayable status.
      const internalReason = typeof error.message === 'string' && !error.message.includes('://') ? error.message : 'Accounting provider request failed';
      const state = internalReason.startsWith('Waiting for') ? 'waiting'
        : /RPC|fetch|HTTP|timeout|price|candle|network|aborted|unavailable|coverage/i.test(internalReason) ? 'retrying' : 'blocked';
      const failureCode = state === 'waiting' ? undefined : runtimeFailureCode(error);
      const reason = state === 'waiting' ? 'Waiting for settled mining history and a newer finalized slot.'
        : runtimeFailureMessage(failureCode);
      const status = { state, checkedAt: now().toISOString(), verifiedAt: previous.closing.observedAt,
        verifiedThroughSlot: previous.closing.context.slot, reason, ...(failureCode ? { failureCode } : {}) };
      await writeAtomicJson(join(run, 'failure.json'), { status, preservedReceiptSha256: hash(JSON.stringify(previous.receipt)) });
      await writeAtomicJson(checkpointPath, { ...previous, status });
      return status;
    }
  } finally { await release(); }
}
