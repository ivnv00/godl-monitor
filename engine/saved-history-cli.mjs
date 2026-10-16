// Offline, lossless storage maintenance. Quit the app before invoking this tool.
import { parseArgs } from 'node:util';
import { readdir, lstat, statfs } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { ObservationStore } from './observation-store.mjs';
import { acquireLock } from './accounting-service.mjs';
import { compactEvidenceFile, expandEvidenceFile } from './evidence-storage.mjs';

const FLOOR = 8n * 1024n ** 3n;
async function requireSpace(path) {
  const disk = await statfs(path, { bigint: true });
  if (disk.bavail * disk.bsize < FLOOR) throw new Error('Storage maintenance requires 8 GiB free space');
}
async function* evidenceFiles(root, mode) {
  let entries;
  try { entries = await readdir(root, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name === 'funded-commits') continue;
    const directory = join(root, entry.name), seen = new Set();
    const pattern = entry.name === 'finalized-cache'
      ? /^([a-f0-9]{64}\.json)(\.gz)?$/ : /^(response-\d{6,}\.json)(\.gz)?$/;
    for (const file of await readdir(directory, { withFileTypes: true })) {
      const match = pattern.exec(file.name);
      if (!match || seen.has(match[1]) || (mode === 'expand' && !match[2])) continue;
      // Do not silently skip an evidence-shaped symlink or nonregular file.
      if (!file.isFile() || file.isSymbolicLink()) throw new Error('Unsupported evidence entry');
      seen.add(match[1]); yield join(directory, match[1]);
    }
  }
}

let store, release;
try {
  const { values, positionals } = parseArgs({ allowPositionals: true, strict: true, options: {
    db: { type: 'string' }, evidence: { type: 'string' }, accounting: { type: 'string' },
    offline: { type: 'boolean', default: false }, vacuum: { type: 'boolean', default: false },
  } });
  const [mode] = positionals;
  if (positionals.length !== 1 || !['compact', 'expand'].includes(mode) || !values.offline
      || !values.db || !values.evidence || !values.accounting) throw new Error('Invalid offline maintenance arguments');
  const db = resolve(values.db), evidence = resolve(values.evidence), accounting = resolve(values.accounting);
  if (new Set([db, evidence, accounting]).size !== 3 || dirname(db) !== dirname(accounting)
      || dirname(evidence) !== dirname(db)) throw new Error('Maintenance paths must share one profile');
  const info = await lstat(db);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('Unsupported observation file');
  try { const root = await lstat(evidence); if (!root.isDirectory() || root.isSymbolicLink()) throw new Error('Unsupported evidence root'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await requireSpace(dirname(db));
  release = await acquireLock(`${accounting}.lock.sqlite`);
  store = new ObservationStore(db);
  let observations = 0, files = 0, skipped = 0;
  if (mode === 'compact') {
    const table = store.compressed ? 'observation_hot' : 'observations';
    const scopes = store.database.prepare(`SELECT wallet,genesis_hash FROM ${table} GROUP BY wallet,genesis_hash`).all();
    for (const scope of scopes) {
      for (;;) {
        await requireSpace(dirname(db));
        const result = store.compact({ wallet: scope.wallet, genesisHash: scope.genesis_hash });
        observations += result.compressed;
        if (!result.compressed) break;
      }
    }
  } else {
    let result;
    do {
      await requireSpace(dirname(db)); result = store.expand(); observations += result.expanded;
    } while (result.remaining);
  }
  for await (const path of evidenceFiles(evidence, mode)) {
    await requireSpace(dirname(db));
    const result = await (mode === 'compact' ? compactEvidenceFile(path) : expandEvidenceFile(path));
    if (result.status === 'skipped') skipped++; else files++;
  }
  if (values.vacuum) {
    await requireSpace(dirname(db));
    store.database.exec('PRAGMA wal_checkpoint(TRUNCATE); VACUUM; PRAGMA wal_checkpoint(TRUNCATE)');
  }
  const integrity = store.database.prepare('PRAGMA quick_check').get().quick_check;
  if (integrity !== 'ok') throw new Error('Observation integrity check failed');
  process.stdout.write(JSON.stringify({ mode, observations, files, skipped, integrity, executionAllowed: false }) + '\n');
} catch (error) {
  // Paths and evidence content stay private, including arbitrary filesystem errors.
  console.error('Saved history maintenance stopped; committed evidence remains recoverable.');
  process.exitCode = 1;
} finally { store?.close(); await release?.(); }
