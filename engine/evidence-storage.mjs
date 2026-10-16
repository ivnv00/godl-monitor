import { constants } from 'node:fs';
import { mkdir, open, unlink, link, rename, lstat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { gzip, gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { EvidenceArchive, evidenceLocation, REFERENCE, REFERENCE_PREFIX, integrity } from './evidence-archive.mjs';

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

const isReference = bytes => bytes.subarray(0, REFERENCE_PREFIX.length).equals(REFERENCE_PREFIX);
function archived(path, archive, maxBytes) {
  let owned;
  try {
    const source = archive ?? (owned = new EvidenceArchive(evidenceLocation(path).root, { readOnly: true }));
    return source.read(path, maxBytes);
  } catch (error) { if (error.code === 'GODL_EVIDENCE_INTEGRITY') throw error; throw integrity(); }
  finally { owned?.close(); }
}
async function decode(path, maxBytes, archive) {
  const saved = await readRegular(path, path.endsWith('.gz') ? maxBytes + 1024 * 1024 : Math.max(maxBytes, REFERENCE.length));
  if (!path.endsWith('.gz') && isReference(saved.bytes)) {
    if (!saved.bytes.equals(REFERENCE)) throw integrity('Unsupported saved evidence reference');
    return { ...saved, bytes: archived(path, archive, maxBytes) };
  }
  const bytes = path.endsWith('.gz') ? await unzip(saved.bytes, { maxOutputLength: maxBytes }) : saved.bytes;
  if (bytes.length > maxBytes) throw new Error('Evidence file exceeds byte limit');
  return { ...saved, bytes };
}

/** Returns original serialized bytes. Plaintext wins; only ENOENT permits fallback. */
export async function readEvidenceFile(path, { maxBytes = EVIDENCE_MAX_BYTES, archive } = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('Invalid evidence byte limit');
  const logical = path.endsWith('.gz') ? path.slice(0, -3) : path;
  const candidates = path.endsWith('.gz') ? [path, logical] : [path, `${path}.gz`];
  for (const candidate of candidates) {
    try { return (await decode(candidate, maxBytes, archive)).bytes; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  // A committed mapping also recovers an interrupted marker publication. It
  // must never turn a missing archive object into a provider cache miss.
  let owned;
  try {
    let source = archive;
    if (!source) {
      try { source = owned = new EvidenceArchive(evidenceLocation(logical).root, { readOnly: true }); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    if (source?.has(logical)) return source.read(logical, maxBytes);
  } finally { owned?.close(); }
  const error = new Error('Evidence file is missing'); error.code = 'ENOENT'; throw error;
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
export async function writeEvidenceJson(path, value, { archive } = {}) {
  const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n');
  if (archive && bytes.length <= COMPACT_EVIDENCE_MAX_BYTES) {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    try {
      const existing = await readEvidenceFile(path, { archive });
      if (!existing.equals(bytes)) throw integrity('Conflicting evidence record; existing bytes preserved');
      // Recover a committed mapping whose marker was not published before exit.
      try { await readRegular(path, EVIDENCE_MAX_BYTES); }
      catch (error) {
        if (error.code !== 'ENOENT') throw error;
        try { await readRegular(`${path}.gz`, EVIDENCE_MAX_BYTES); }
        catch (missing) { if (missing.code !== 'ENOENT') throw missing; await publishReference(path, archive); }
      }
      return path;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    archive.put(path, bytes);
    await publishReference(path, archive);
    return path;
  }
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

async function replaceUnchanged(path, original, bytes, marker) {
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    if (marker) await link(marker, temp);
    else {
      const file = await open(temp, 'wx', 0o600);
      try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
    }
    const current = await readRegular(path, Math.max(COMPACT_EVIDENCE_MAX_BYTES, REFERENCE.length));
    if (!sameIdentity(original.info, current.info) || !original.bytes.equals(current.bytes))
      throw integrity('Evidence source changed; all committed forms preserved');
    await rename(temp, path); await syncDirectory(path);
  } finally { await unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}

/** Constant markers share bounded groups of inodes, avoiding a 4 KiB file per
 * response. Identity lives in the profile-scoped SQLite mapping, not the link. */
async function referenceMarker(path, archive) {
  const key = archive.key(path), pool = join(archive.root, '.evidence-reference-markers');
  await mkdir(pool, { recursive: true, mode: 0o700 });
  const directory = await lstat(pool);
  if (!directory.isDirectory() || directory.isSymbolicLink()) throw integrity('Unsupported evidence marker directory');
  const bucket = createHash('sha256').update(key).digest('hex').slice(0, 2);
  for (let generation = 0; generation < 65536; generation++) {
    const marker = join(pool, `${bucket}-${generation}.marker`);
    let saved;
    try { saved = await readRegular(marker, REFERENCE.length); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      try { await writeBytes(marker, REFERENCE); }
      catch (conflict) { if (conflict.code !== 'EEXIST') throw conflict; }
      saved = await readRegular(marker, REFERENCE.length);
    }
    if (!saved.bytes.equals(REFERENCE)) throw integrity('Invalid evidence reference marker');
    if (saved.info.nlink < 1024) return marker;
  }
  throw integrity('Evidence reference link capacity reached');
}
async function publishReference(path, archive, original) {
  const marker = await referenceMarker(path, archive);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  if (original) return replaceUnchanged(path, original, REFERENCE, marker);
  try { await link(marker, path); await syncDirectory(path); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (!(await readRegular(path, REFERENCE.length)).bytes.equals(REFERENCE)) throw integrity('Conflicting evidence destination');
    await syncDirectory(path);
  }
}
async function compactArchived(path, archive, onStage) {
  let plain, compressed;
  try {
    try { plain = await readRegular(path, COMPACT_EVIDENCE_MAX_BYTES); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    try { compressed = await readRegular(`${path}.gz`, COMPACT_EVIDENCE_MAX_BYTES + 1024 * 1024); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const bytes = plain ? (isReference(plain.bytes) ? await readEvidenceFile(path, { archive, maxBytes: COMPACT_EVIDENCE_MAX_BYTES }) : plain.bytes)
      : compressed ? await unzip(compressed.bytes, { maxOutputLength: COMPACT_EVIDENCE_MAX_BYTES })
      : archive.read(path, COMPACT_EVIDENCE_MAX_BYTES);
    if (compressed && !(await unzip(compressed.bytes, { maxOutputLength: COMPACT_EVIDENCE_MAX_BYTES })).equals(bytes))
      throw integrity('Conflicting evidence forms; both preserved');
    archive.put(path, bytes);
    if (!archive.read(path, COMPACT_EVIDENCE_MAX_BYTES).equals(bytes)) throw integrity();
    await onStage('archive-committed');
    if (!plain || !plain.bytes.equals(REFERENCE)) await publishReference(path, archive, plain);
    await onStage('reference-published');
    if (!(await readEvidenceFile(path, { archive, maxBytes: COMPACT_EVIDENCE_MAX_BYTES })).equals(bytes)) throw integrity();
    if (compressed) await removeUnchanged(`${path}.gz`, compressed, COMPACT_EVIDENCE_MAX_BYTES + 1024 * 1024);
    return { status: 'compacted', path };
  } catch (error) {
    if (oversized(error)) return { status: 'skipped', reason: 'oversized', path: plain ? path : `${path}.gz` };
    throw error;
  }
}

/** Offline only: caller holds the accounting lock or has stopped the app. */
export async function compactEvidenceFile(path, { archive, onStage = async () => {} } = {}) {
  if (!path.endsWith('.json')) throw new Error('Expected a logical JSON evidence path');
  if (archive) return compactArchived(path, archive, onStage);
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
export async function expandEvidenceFile(path, { archive } = {}) {
  const logical = path.endsWith('.gz') ? path.slice(0, -3) : path;
  if (!logical.endsWith('.json')) throw new Error('Expected a JSON evidence path');
  let reference;
  try { reference = await readRegular(logical, COMPACT_EVIDENCE_MAX_BYTES); }
  catch (error) {
    if (oversized(error)) return { status: 'skipped', reason: 'oversized', path: logical };
    if (error.code !== 'ENOENT') throw error;
  }
  if (!reference && archive?.has(logical)) {
    const bytes = archive.read(logical, COMPACT_EVIDENCE_MAX_BYTES);
    await publishExclusive(logical, bytes, COMPACT_EVIDENCE_MAX_BYTES, false);
    reference = await readRegular(logical, COMPACT_EVIDENCE_MAX_BYTES);
  }
  if (reference && isReference(reference.bytes)) {
    const bytes = await readEvidenceFile(logical, { archive, maxBytes: COMPACT_EVIDENCE_MAX_BYTES });
    // A conflicting leftover gzip must remain visible and block replacement.
    try {
      if (!(await decode(`${logical}.gz`, COMPACT_EVIDENCE_MAX_BYTES)).bytes.equals(bytes)) throw integrity('Conflicting evidence forms; both preserved');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await replaceUnchanged(logical, reference, bytes);
    return expandEvidenceFile(logical, { archive });
  }
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
