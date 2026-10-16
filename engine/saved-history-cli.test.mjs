// Generated synthetic files only; no live app state.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, statfsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ObservationStore } from './observation-store.mjs';
import { DatabaseSync } from 'node:sqlite';
import { REFERENCE, EvidenceArchive } from './evidence-archive.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'godl-history-cli-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const db = join(root, 'observations.sqlite'), accounting = join(root, 'accounting-checkpoint.json');
  new ObservationStore(db).close();
  const evidence = join(root, 'accounting-evidence'), run = join(evidence, 'synthetic-run'), cache = join(evidence, 'finalized-cache');
  mkdirSync(run, { recursive: true }); mkdirSync(cache);
  const bytes = Buffer.from('{"raw":"' + 'synthetic retained evidence '.repeat(1000) + '"}\n');
  const response = join(run, 'response-000001.json'), cached = join(cache, 'a'.repeat(64) + '.json');
  for (const path of [response, cached]) writeFileSync(path, bytes);
  const reconciliation = join(run, 'reconciliation.json'); writeFileSync(reconciliation, bytes);
  return { root, db, accounting, evidence, response, cached, reconciliation, bytes };
}
function invoke(f, mode, offline = true) {
  const args = [fileURLToPath(new URL('./saved-history-cli.mjs', import.meta.url)), mode,
    '--db', f.db, '--evidence', f.evidence, '--accounting', f.accounting];
  if (offline) args.push('--offline');
  return spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024 });
}
function requireSpace(t, f) {
  const disk = statfsSync(f.root, { bigint: true });
  if (disk.bavail * disk.bsize < 8n * 1024n ** 3n) { t.skip('Offline maintenance correctly requires 8 GiB free'); return false; }
  return true;
}

test('offline maintenance compresses only raw/cache evidence and restores original serialized bytes', t => {
  const f = fixture(t); if (!requireSpace(t, f)) return;
  const compacted = invoke(f, 'compact'); assert.equal(compacted.status, 0, compacted.stderr);
  assert.equal(JSON.parse(compacted.stdout).files, 2);
  for (const path of [f.response, f.cached]) { assert.deepEqual(readFileSync(path), REFERENCE); assert.equal(existsSync(path + '.gz'), false); }
  assert.deepEqual(readFileSync(f.reconciliation), f.bytes);
  const expanded = invoke(f, 'expand'); assert.equal(expanded.status, 0, expanded.stderr);
  for (const path of [f.response, f.cached, f.reconciliation]) assert.deepEqual(readFileSync(path), f.bytes);
});

test('requires explicit offline mode before mutating any saved history', t => {
  const f = fixture(t), before = readFileSync(f.db);
  const result = invoke(f, 'compact', false); assert.equal(result.status, 1);
  assert.deepEqual(readFileSync(f.db), before); assert.deepEqual(readFileSync(f.response), f.bytes);
  assert.equal(existsSync(f.response + '.gz'), false);
});

test('offline expansion restores committed mapping-only records and missing run directories for downgrade', t => {
  const f = fixture(t); if (!requireSpace(t, f)) return;
  const absent = join(f.evidence, 'interrupted-run', 'response-000003.json');
  mkdirSync(join(f.evidence, 'interrupted-run'));
  const archive = new EvidenceArchive(f.evidence); archive.put(absent, f.bytes); archive.close();
  rmSync(join(f.evidence, 'interrupted-run'), { recursive: true });
  const result = invoke(f, 'expand'); assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readFileSync(absent), f.bytes);
});

test('an active accounting writer prevents compression without touching evidence', t => {
  const f = fixture(t); if (!requireSpace(t, f)) return;
  const lock = new DatabaseSync(f.accounting + '.lock.sqlite'); lock.exec('BEGIN IMMEDIATE');
  try {
    const result = invoke(f, 'compact'); assert.equal(result.status, 1);
    assert.deepEqual(readFileSync(f.response), f.bytes); assert.equal(existsSync(f.response + '.gz'), false);
  } finally { lock.exec('ROLLBACK'); lock.close(); }
});
