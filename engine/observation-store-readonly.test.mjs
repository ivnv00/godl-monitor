import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ObservationStore } from './observation-store.mjs';
import { accountingFixture } from './test-fixtures/accounting.mjs';

test('read-only store preserves existing evidence and rejects writes and absent databases', async t => {
  const root = await mkdtemp(join(tmpdir(), 'godl-readonly-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'observations.sqlite');
  const f = await accountingFixture();
  const writer = new ObservationStore(path);
  writer.append(f.anchor.closing); writer.close();
  const bytes = await readFile(path);
  const reader = new ObservationStore(path, { readOnly: true });
  try {
    assert.deepEqual(reader.latest(f.anchor.closing), f.anchor.closing);
    assert.throws(() => reader.append(f.interval.closing), /read.only/i);
    assert.throws(() => reader.database.exec('DELETE FROM observations'), /readonly/i);
    assert.equal(reader.list(f.anchor.closing).length, 1);
  } finally { reader.close(); }
  assert.deepEqual(await readFile(path), bytes);
  const files = await readdir(root);
  assert.ok(files.every(name => ['observations.sqlite', 'observations.sqlite-wal', 'observations.sqlite-shm'].includes(name)));
  assert.throws(() => new ObservationStore(join(root, 'absent', 'database.sqlite'), { readOnly: true }));
  assert.deepEqual(await readdir(root), files);
});
