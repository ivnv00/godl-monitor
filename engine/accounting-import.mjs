import { constants } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { link, lstat, open, unlink } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { address } from '@solana/addresses';
import { deriveAddresses } from './chain.mjs';
import { validateAccountingCheckpoint } from './ongoing-cost.mjs';
import { acquireLock } from './accounting-service.mjs';

const MAX_INPUT_BYTES = 2 * 1024 * 1024;
const OWNED_ROLES = ['miner', 'minerExtended', 'automation', 'automationV2'];
const TOP_LEVEL_FIELDS = new Set([
  'schemaVersion', 'kind', 'receipt', 'closing', 'programDeployment', 'status', 'evidenceDirectory',
]);
const SHA256 = /^[a-f0-9]{64}$/;
const SLOT = /^(0|[1-9]\d*)$/;

export class AccountingImportError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AccountingImportError';
  }
}

const fail = message => { throw new AccountingImportError(message); };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const canonicalDate = value => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const safeSlot = value => typeof value === 'string' && SLOT.test(value)
  && Number.isSafeInteger(Number(value));

async function readBoundedRegularFile(path) {
  let before;
  try { before = await lstat(path); }
  catch { fail('The reviewed anchor could not be read.'); }
  if (!before.isFile() || before.isSymbolicLink() || before.size > MAX_INPUT_BYTES) {
    fail('The reviewed anchor must be a regular file no larger than 2 MiB.');
  }
  let file;
  try { file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW); }
  catch { fail('The reviewed anchor could not be read.'); }
  try {
    const opened = await file.stat();
    if (!opened.isFile() || opened.size > MAX_INPUT_BYTES
        || opened.dev !== before.dev || opened.ino !== before.ino) {
      fail('The reviewed anchor changed while it was being read.');
    }
    const bytes = Buffer.allocUnsafe(opened.size);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await file.read(bytes, offset, bytes.length - offset, offset);
      if (!bytesRead) fail('The reviewed anchor changed while it was being read.');
      offset += bytesRead;
    }
    const extra = Buffer.allocUnsafe(1);
    if ((await file.read(extra, 0, 1, offset)).bytesRead !== 0) {
      fail('The reviewed anchor changed while it was being read.');
    }
    const after = await file.stat();
    if (after.size !== opened.size || after.mtimeMs !== opened.mtimeMs
        || after.dev !== opened.dev || after.ino !== opened.ino) {
      fail('The reviewed anchor changed while it was being read.');
    }
    return bytes;
  } finally { await file.close(); }
}

function parseAnchor(bytes) {
  try {
    const value = JSON.parse(bytes.toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { fail('The reviewed anchor is not valid JSON.'); }
}

function validateDeployment(deployment, checkpoint) {
  if (deployment === undefined) return;
  if (!deployment || typeof deployment !== 'object' || Array.isArray(deployment)
      || Object.keys(deployment).length !== 2
      || !Object.hasOwn(deployment, 'programDataAddress')
      || !Object.hasOwn(deployment, 'deployedAtSlot')) fail('The program deployment metadata is ambiguous.');
  try { address(deployment.programDataAddress); }
  catch { fail('The program deployment metadata is invalid.'); }
  if (!safeSlot(deployment.deployedAtSlot)
      || BigInt(deployment.deployedAtSlot) > BigInt(checkpoint.receipt.startSlot)) {
    fail('The program deployment metadata is outside the reviewed accounting period.');
  }
}

async function validateReviewedAnchor(candidate, wallet, now) {
  if (Object.keys(candidate).some(key => !TOP_LEVEL_FIELDS.has(key))) {
    fail('The reviewed anchor contains ambiguous top-level metadata.');
  }
  try { validateAccountingCheckpoint(candidate); }
  catch { fail('The reviewed anchor failed accounting validation.'); }
  if (candidate.closing.wallet !== wallet || candidate.receipt.wallet !== wallet) {
    fail('The reviewed anchor belongs to a different wallet.');
  }
  const derived = await deriveAddresses(wallet).catch(() => fail('The wallet address is invalid.'));
  for (const role of OWNED_ROLES) {
    if (candidate.closing.accounts?.[role]?.address !== derived[role].address) {
      fail('The reviewed anchor account identity does not match the wallet.');
    }
  }
  for (const [role, expected] of Object.entries(derived)) {
    const account = candidate.closing.accounts?.[role];
    if (account?.status === 'present' && account.address !== expected.address) {
      fail('The reviewed anchor account identity does not match the wallet.');
    }
  }
  if (!canonicalDate(candidate.closing.observedAt)
      || Date.parse(candidate.closing.observedAt) > now.getTime()
      || !safeSlot(candidate.closing.context.slot)
      || !safeSlot(candidate.receipt.startSlot)
      || !safeSlot(candidate.receipt.endSlot)
      || !safeSlot(candidate.receipt.evidence.closingSlot)) {
    fail('The reviewed anchor has an invalid date or slot boundary.');
  }
  validateDeployment(candidate.programDeployment, candidate);
  return candidate;
}

function reviewFor(checkpoint, wallet, sha256) {
  const period = checkpoint.receipt.acquisitionPeriod;
  return {
    wallet,
    sha256,
    startedAt: period.startedAt,
    throughAt: period.throughAt,
    observedAt: checkpoint.closing.observedAt,
    closingSlot: String(checkpoint.closing.context.slot),
    earnedGodl: period.earnedGodl,
    netSpendSol: period.netSpendSol,
    netSpendUsd: period.netSpendUsd,
    baselineBasis: period.baselineBasis,
    priceBasis: period.priceBasis,
    caveats: structuredClone(period.caveats),
  };
}

async function inspectBytes({ wallet, inputPath, now }) {
  const bytes = await readBoundedRegularFile(inputPath);
  const checkpoint = await validateReviewedAnchor(parseAnchor(bytes), wallet, now());
  const sha256 = digest(bytes);
  return { bytes, checkpoint, review: reviewFor(checkpoint, wallet, sha256) };
}

export async function inspectAccountingAnchor({ wallet, inputPath, now = () => new Date() }) {
  return (await inspectBytes({ wallet, inputPath, now })).review;
}

async function ensureDirectory(path) {
  let info;
  try { info = await lstat(path); }
  catch { fail('The accounting profile is unavailable.'); }
  if (!info.isDirectory() || info.isSymbolicLink()) fail('The accounting profile is unavailable.');
}

async function ensureEntryAbsent(path) {
  try { await lstat(path); }
  catch (error) {
    if (error?.code === 'ENOENT') return;
    fail('Existing accounting state could not be inspected.');
  }
  fail('Accounting state already exists for this profile.');
}

async function installNoReplace(path, value) {
  const directory = dirname(path);
  const temporary = join(directory, `.${basename(path)}.${randomUUID()}.tmp`);
  let created = false;
  try {
    const file = await open(temporary, 'wx', 0o600);
    created = true;
    try {
      await file.writeFile(JSON.stringify(value, null, 2) + '\n');
      await file.sync();
    } finally { await file.close(); }
    try { await link(temporary, path); }
    catch (error) {
      if (error?.code === 'EEXIST') fail('Accounting state already exists for this profile.');
      throw error;
    }
    const directoryHandle = await open(directory, constants.O_RDONLY);
    try { await directoryHandle.sync(); }
    finally { await directoryHandle.close(); }
  } finally {
    if (created) await unlink(temporary).catch(error => { if (error?.code !== 'ENOENT') throw error; });
  }
}

export async function importAccountingAnchor({ wallet, inputPath, profilePath, expectedSha256,
  reviewed, now = () => new Date() }) {
  if (reviewed !== true) fail('Reviewed-history acknowledgement is required.');
  if (typeof expectedSha256 !== 'string' || !SHA256.test(expectedSha256)) fail('The review digest is invalid.');
  await ensureDirectory(profilePath);
  const profile = resolve(profilePath);
  const anchorPath = join(profile, 'accounting-anchor.json');
  const checkpointPath = join(profile, 'accounting-checkpoint.json');
  const evidencePath = join(profile, 'accounting-evidence');
  const release = await acquireLock(`${checkpointPath}.lock.sqlite`).catch(error => {
    if (/already running/.test(error?.message ?? '')) fail('Accounting reconciliation is already running.');
    fail('The accounting profile could not be locked.');
  });
  try {
    await ensureEntryAbsent(anchorPath);
    await ensureEntryAbsent(checkpointPath);
    await ensureEntryAbsent(evidencePath);
    const inspected = await inspectBytes({ wallet, inputPath, now });
    if (inspected.review.sha256 !== expectedSha256) fail('The reviewed anchor changed after inspection.');
    const checkedAt = now().toISOString();
    const imported = {
      schemaVersion: inspected.checkpoint.schemaVersion,
      kind: inspected.checkpoint.kind,
      receipt: structuredClone(inspected.checkpoint.receipt),
      closing: structuredClone(inspected.checkpoint.closing),
      ...(inspected.checkpoint.programDeployment === undefined ? {} : {
        programDeployment: structuredClone(inspected.checkpoint.programDeployment),
      }),
      status: {
        state: 'waiting',
        checkedAt,
        verifiedAt: inspected.checkpoint.closing.observedAt,
        verifiedThroughSlot: String(inspected.checkpoint.closing.context.slot),
        reason: 'Reviewed accounting start imported; pending reconciliation.',
      },
    };
    await installNoReplace(anchorPath, imported);
    return inspected.review;
  } finally { await release(); }
}
