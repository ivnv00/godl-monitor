import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const run = promisify(execFile);
const cli = fileURLToPath(new URL('./accounting-cli.mjs', import.meta.url));

test('rejects an incomplete invocation before reading accounting state', async () => {
  await assert.rejects(
    run(process.execPath, [cli]),
    error => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /Usage: accounting-cli\.mjs/);
      return true;
    },
  );
});
