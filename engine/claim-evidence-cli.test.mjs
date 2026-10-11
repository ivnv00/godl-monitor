// Synthetic local RPC records only; no network or user profile access.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claimFixture } from './test-fixtures/claim-evidence.mjs';

const run = promisify(execFile);
const cli = fileURLToPath(new URL('./claim-evidence-cli.mjs', import.meta.url));
const genericError = 'Claim evidence unavailable; the saved response could not be verified.\n';
const digest = raw => createHash('sha256').update(raw).digest('hex');

async function savedRecord(t, options) {
  const f = await claimFixture(options), root = await mkdtemp(join(tmpdir(), 'godl-claim-inspector-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'saved-private-response.json');
  const raw = JSON.stringify({ jsonrpc: '2.0', id: 1, result: f.result });
  const record = { id: 1, method: 'getTransaction', httpStatus: 200,
    params: [f.signature, { commitment: 'finalized', encoding: 'json', maxSupportedTransactionVersion: 0 }],
    source: { rpcOrigin: 'https://synthetic-private.invalid', endpointSha256: 'a'.repeat(64) },
    observedAt: '2026-01-01T00:00:00.000Z', sha256: digest(raw), raw };
  await writeFile(path, JSON.stringify(record), { mode: 0o640 });
  return { f, root, path, record, args: [cli, '--wallet', f.wallet, '--record', path] };
}

async function rejects(args) {
  await assert.rejects(run(process.execPath, args), error =>
    error.code === 1 && error.stdout === '' && error.stderr === genericError);
}

test('claim inspector rejects incomplete or network invocations without exposing input', async () => {
  for (const args of [[], ['--record', '/private/missing-record'], ['--rpc', 'https://private.invalid/secret']]) {
    await assert.rejects(run(process.execPath, [cli, ...args]), error =>
      error.code === 1 && error.stdout === '' && error.stderr === genericError);
  }
});

test('saved claim inspector proves an exact receipt offline and preserves input bytes and permissions', async t => {
  const f = await savedRecord(t, { amount: '9007199254740993' });
  const before = await readFile(f.path), mode = (await stat(f.path)).mode;
  const noFetch = 'data:text/javascript,' + encodeURIComponent('globalThis.fetch = () => { throw new Error("Network forbidden"); };');
  const { stdout, stderr } = await run(process.execPath, ['--import', noFetch, ...f.args]);
  assert.equal(stderr, '');
  const report = JSON.parse(stdout);
  assert.equal(report.status, 'observed'); assert.equal(report.executionAllowed, false);
  assert.equal(report.ownerReceipt.amountBaseUnits, '9007199254740993');
  assert.equal(report.ownerPaidNetworkFeeLamports, '5000'); assert.equal(report.newAccountRentLamports, '0');
  assert.equal(report.principal.status, 'unavailable'); assert.equal(report.refiningDeduction.status, 'unavailable');
  assert.equal(report.evidence.requestedCommitment, 'finalized');
  for (const field of ['network', 'finality', 'authenticity']) assert.equal(report.evidence[field].status, 'unavailable');
  assert.equal(report.evidence.rawSha256, f.record.sha256);
  assert.ok(!stdout.includes(f.path)); assert.ok(!stdout.includes('synthetic-private.invalid'));
  assert.deepEqual(await readFile(f.path), before); assert.equal((await stat(f.path)).mode, mode);
  assert.deepEqual(await readdir(f.root), ['saved-private-response.json']);
});

test('raw unsafe RPC fee integers retain every digit through the saved-record boundary', async t => {
  const f = await savedRecord(t);
  f.f.result.meta.fee = '9007199254740993';
  f.f.result.meta.preBalances[0] = '18446744073709551615';
  f.f.result.meta.postBalances[0] = (18446744073709551615n - 9007199254740993n).toString();
  f.record.raw = JSON.stringify({ jsonrpc: '2.0', id: 1, result: f.f.result })
    .replace('"fee":"9007199254740993"', '"fee":9007199254740993');
  f.record.sha256 = digest(f.record.raw);
  await writeFile(f.path, JSON.stringify(f.record));
  const report = JSON.parse((await run(process.execPath, f.args)).stdout);
  assert.equal(report.status, 'observed'); assert.equal(report.ownerPaidNetworkFeeLamports, '9007199254740993');
});

test('version-zero referral report separates the owner receipt and referral transfer', async t => {
  const f = await savedRecord(t, { referral: true, version: 0, amount: '201', computeBudget: true });
  const report = JSON.parse((await run(process.execPath, f.args)).stdout);
  assert.equal(report.status, 'observed'); assert.equal(report.ownerReceipt.amountBaseUnits, '200');
  assert.equal(report.referralReceipt.amountBaseUnits, '1'); assert.equal(report.treasuryDebit.amountBaseUnits, '201');
  assert.equal(report.referrerAuthority.status, 'unavailable');
});

test('saved envelope digest, identity, outcome and exact request options fail closed', async t => {
  const f = await savedRecord(t);
  const cases = [
    r => { r.sha256 = '0'.repeat(64); }, r => { r.method = 'sendTransaction'; },
    r => { r.httpStatus = 500; }, r => { r.id = 2; }, r => { r.id = '1'; },
    r => { r.params[0] = '4'.repeat(88); }, r => { r.params[1].encoding = 'jsonParsed'; },
    r => { r.params[1].commitment = 'confirmed'; }, r => { delete r.params[1].maxSupportedTransactionVersion; },
    r => { r.params.push('unexpected'); }, r => { r.params[1].unexpected = true; },
    r => { r.raw = JSON.stringify({ jsonrpc: '2.0', id: 1, error: { message: 'private-token' } }); r.sha256 = digest(r.raw); },
    r => { r.raw = JSON.stringify({ jsonrpc: '2.0', id: 1 }); r.sha256 = digest(r.raw); },
    r => { r.raw = '{private-token'; r.sha256 = digest(r.raw); },
  ];
  for (const change of cases) {
    const record = structuredClone(f.record); change(record); await writeFile(f.path, JSON.stringify(record));
    const before = await readFile(f.path); await rejects(f.args); assert.deepEqual(await readFile(f.path), before);
  }
});

test('unsupported or missing transactions report unavailable without inventing receipt, fees or slot', async t => {
  const f = await savedRecord(t);
  for (const result of [null, { ...f.f.result, meta: { ...f.f.result.meta, err: { InstructionError: [0, 'failed'] } } }]) {
    f.record.raw = JSON.stringify({ jsonrpc: '2.0', id: 1, result }); f.record.sha256 = digest(f.record.raw);
    await writeFile(f.path, JSON.stringify(f.record));
    const report = JSON.parse((await run(process.execPath, f.args)).stdout);
    assert.equal(report.status, 'unavailable');
    assert.equal(report.ownerReceipt, undefined); assert.equal(report.ownerPaidNetworkFeeLamports, undefined);
    if (result === null) assert.equal(report.slot, undefined);
    assert.equal(report.evidence.authenticity.status, 'unavailable');
  }
});

test('invalid and duplicate arguments, malformed records, directories and oversized files stay private', async t => {
  const f = await savedRecord(t);
  for (const args of [ [...f.args, '--wallet', f.f.wallet], [...f.args, '--record', f.path], [...f.args, 'extra'],
    f.args.map(x => x === f.f.wallet ? 'invalid-wallet' : x),
    f.args.map(x => x === f.path ? f.root : x), f.args.map(x => x === f.path ? join(f.root, 'absent') : x) ]) await rejects(args);
  for (const data of ['{broken-private', JSON.stringify(null), 'x'.repeat(8 * 1024 * 1024 + 1)]) {
    await writeFile(f.path, data); await rejects(f.args); assert.equal(await readFile(f.path, 'utf8'), data);
  }
});
