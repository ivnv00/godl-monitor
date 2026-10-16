import { constants } from 'node:fs';
import { mkdir, open, unlink, link } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { gzip, gunzip } from 'node:zlib';
import { promisify } from 'node:util';

const zip = promisify(gzip), unzip = promisify(gunzip);
export const COMPACT_EVIDENCE_MAX_BYTES = 64 * 1024 * 1024;
export const EVIDENCE_MAX_BYTES = 128 * 1024 * 1024;

async function readRegular(path, maximum) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await file.stat();
    if (!info.isFile()) throw new Error('Unsupported evidence file');
    if (info.size > maximum) throw new Error('Evidence file exceeds byte limit');
    // Bound the read even if another process grows the file after stat.
    const chunks = [];
    let length = 0;
    while (length <= maximum) {
      const buffer = Buffer.alloc(Math.min(64 * 1024, maximum + 1 - length));
      const { bytesRead } = await file.read(buffer);
      if (!bytesRead) break;
      chunks.push(buffer.subarray(0, bytesRead)); length += bytesRead;
    }
    if (length > maximum) throw new Error('Evidence file exceeds byte limit');
    return { bytes: Buffer.concat(chunks, length), info };
  } finally { await file.close(); }
}

async function syncDirectory(path) {
  const directory = await open(dirname(path), 'r');
  try { await directory.sync(); } finally { await directory.close(); }
}

async function decode(path, maxBytes) {
  const saved = await readRegular(path, path.endsWith('.gz') ? maxBytes + 1024 * 1024 : maxBytes);
  const bytes = path.endsWith('.gz') ? await unzip(saved.bytes, { maxOutputLength: maxBytes }) : saved.bytes;
  if (bytes.length > maxBytes) throw new Error('Evidence file exceeds byte limit');
  return { ...saved, bytes };
}

/** Returns original serialized bytes. Plaintext wins; only ENOENT permits fallback. */
export async function readEvidenceFile(path, { maxBytes = EVIDENCE_MAX_BYTES } = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('Invalid evidence byte limit');
  if (path.endsWith('.gz')) return (await decode(path, maxBytes)).bytes;
  try { return (await decode(path, maxBytes)).bytes; }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return (await decode(`${path}.gz`, maxBytes)).bytes;
  }
}

async function writeBytes(path, bytes) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    const file = await open(temp, 'wx', 0o600);
    try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
    // A hard link publishes a complete file without replacing an existing name.
    await link(temp, path);
    await syncDirectory(path);
  } finally { await unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}

/** New raw/cache records only; reconciliation and checkpoint writers stay plain. */
export async function writeEvidenceJson(path, value) {
  const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n');
  let plaintextExists = false, compressedExists = false;
  try {
    const existing = await readRegular(path, EVIDENCE_MAX_BYTES);
    if (!existing.bytes.equals(bytes)) throw new Error('Conflicting evidence record; existing bytes preserved');
    plaintextExists = true;
  }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  try {
    const existing = await decode(`${path}.gz`, EVIDENCE_MAX_BYTES);
    if (!existing.bytes.equals(bytes)) throw new Error('Conflicting evidence record; existing bytes preserved');
    compressedExists = true;
  }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (plaintextExists) return path;
  if (compressedExists) return `${path}.gz`;
  if (bytes.length <= COMPACT_EVIDENCE_MAX_BYTES) {
    const compressed = await zip(bytes);
    if (compressed.length < bytes.length) {
      await publishExclusive(`${path}.gz`, compressed, EVIDENCE_MAX_BYTES, true);
      return `${path}.gz`;
    }
  }
  await publishExclusive(path, bytes, Math.max(EVIDENCE_MAX_BYTES, bytes.length), false);
  return path;
}

const sameIdentity = (left, right) => left.dev === right.dev && left.ino === right.ino
  && left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
const oversized = error => error.code === 'ERR_BUFFER_TOO_LARGE' || error.message === 'Evidence file exceeds byte limit';

async function removeUnchanged(path, original, maximum) {
  const current = await readRegular(path, maximum);
  if (!sameIdentity(original.info, current.info) || !original.bytes.equals(current.bytes))
    throw new Error('Evidence source changed; both forms preserved');
  await unlink(path);
  await syncDirectory(path);
}

async function publishExclusive(path, bytes, maxBytes, compressed) {
  try { await writeBytes(path, bytes); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const existing = compressed ? await decode(path, maxBytes) : await readRegular(path, maxBytes);
    const expected = compressed ? await unzip(bytes, { maxOutputLength: maxBytes }) : bytes;
    if (!existing.bytes.equals(expected)) throw new Error('Conflicting evidence forms; both preserved');
    await syncDirectory(path);
  }
}

/** Offline only: caller holds the accounting lock or has stopped the app. */
export async function compactEvidenceFile(path) {
  if (!path.endsWith('.json')) throw new Error('Expected a logical JSON evidence path');
  let original;
  try { original = await readRegular(path, COMPACT_EVIDENCE_MAX_BYTES); }
  catch (error) {
    if (oversized(error)) return { status: 'skipped', reason: 'oversized', path };
    if (error.code !== 'ENOENT') throw error;
    try { await decode(`${path}.gz`, COMPACT_EVIDENCE_MAX_BYTES); }
    catch (decodeError) {
      if (oversized(decodeError)) return { status: 'skipped', reason: 'oversized', path: `${path}.gz` };
      throw decodeError;
    }
    return { status: 'compacted', path: `${path}.gz` };
  }
  const compressed = await zip(original.bytes);
  if (!(await unzip(compressed, { maxOutputLength: COMPACT_EVIDENCE_MAX_BYTES })).equals(original.bytes))
    throw new Error('Evidence compression roundtrip failed');
  // Check an interrupted/conflicting destination even for incompressible input.
  try {
    const existing = await decode(`${path}.gz`, COMPACT_EVIDENCE_MAX_BYTES);
    if (!existing.bytes.equals(original.bytes)) throw new Error('Conflicting evidence forms; both preserved');
    await syncDirectory(path);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (compressed.length >= original.bytes.length) return { status: 'skipped', reason: 'not-beneficial', path };
    await publishExclusive(`${path}.gz`, compressed, COMPACT_EVIDENCE_MAX_BYTES, true);
  }
  await removeUnchanged(path, original, COMPACT_EVIDENCE_MAX_BYTES);
  return { status: 'compacted', path: `${path}.gz` };
}

/** Exact byte restoration, including whitespace and unsafe JSON integer digits. */
export async function expandEvidenceFile(path) {
  const logical = path.endsWith('.gz') ? path.slice(0, -3) : path;
  if (!logical.endsWith('.json')) throw new Error('Expected a JSON evidence path');
  let original;
  try { original = await readRegular(`${logical}.gz`, COMPACT_EVIDENCE_MAX_BYTES + 1024 * 1024); }
  catch (error) {
    if (oversized(error)) return { status: 'skipped', reason: 'oversized', path: `${logical}.gz` };
    if (error.code !== 'ENOENT') throw error;
    await readRegular(logical, COMPACT_EVIDENCE_MAX_BYTES);
    return { status: 'expanded', path: logical };
  }
  let bytes;
  try { bytes = await unzip(original.bytes, { maxOutputLength: COMPACT_EVIDENCE_MAX_BYTES }); }
  catch (error) {
    if (oversized(error)) return { status: 'skipped', reason: 'oversized', path: `${logical}.gz` };
    throw error;
  }
  await publishExclusive(logical, bytes, COMPACT_EVIDENCE_MAX_BYTES, false);
  await removeUnchanged(`${logical}.gz`, original, COMPACT_EVIDENCE_MAX_BYTES + 1024 * 1024);
  return { status: 'expanded', path: logical };
}
