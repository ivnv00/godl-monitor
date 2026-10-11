import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, lstat, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { getAddressDecoder } from '@solana/addresses';
import test from 'node:test';
import { importAccountingAnchor, inspectAccountingAnchor } from './accounting-import.mjs';
import { acquireLock, refreshAccounting } from './accounting-service.mjs';
import { accountingFixture } from './test-fixtures/accounting.mjs';

const run = promisify(execFile);
const cli = fileURLToPath(new URL('./accounting-import-cli.mjs', import.meta.url));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const fixedNow = () => new Date('2026-01-03T00:00:00.000Z');
const json = async path => JSON.parse(await readFile(path, 'utf8'));

async function scenario(t, mutate = () => {}) {
  const fixture = await accountingFixture();
  const root = await mkdtemp(join(tmpdir(), 'godl-accounting-import-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const profilePath = join(root, 'profile');
  await mkdir(profilePath, { mode: 0o700 });
  const candidate = structuredClone(fixture.anchor);
  mutate(candidate, fixture);
  const bytes = Buffer.from(JSON.stringify(candidate, null, 2) + '\n');
  const inputPath = join(root, 'reviewed-anchor.json');
  await writeFile(inputPath, bytes, { mode: 0o600 });
  return { fixture, root, profilePath, inputPath, candidate, bytes,
    anchorPath: join(profilePath, 'accounting-anchor.json'),
    checkpointPath: join(profilePath, 'accounting-checkpoint.json'),
    evidencePath: join(profilePath, 'accounting-evidence') };
}

async function cliResult(args) {
  try {
    const result = await run(process.execPath, [cli, ...args]);
    return { code: 0, stdout: result.stdout, stderr: result.stderr, body: JSON.parse(result.stdout) };
  } catch (error) {
    return { code: error.code, stdout: error.stdout, stderr: error.stderr, body: JSON.parse(error.stdout) };
  }
}

test('CLI inspects offline and imports the identical reviewed bytes into empty state', async t => {
  const s = await scenario(t, candidate => {
    candidate.status = { state: 'current', reason: 'foreign runtime state' };
    candidate.evidenceDirectory = '/private/foreign/evidence';
    candidate.programDeployment = {
      programDataAddress: getAddressDecoder().decode(Buffer.alloc(32, 9)),
      deployedAtSlot: '1',
    };
  });
  const inspect = await cliResult(['--mode', 'inspect', '--wallet', s.fixture.wallet, '--input', s.inputPath]);
  assert.equal(inspect.code, 0);
  assert.equal(inspect.stderr, '');
  assert.deepEqual(inspect.body, {
    schemaVersion: 1,
    status: 'review',
    review: {
      wallet: s.fixture.wallet,
      sha256: sha256(s.bytes),
      startedAt: s.candidate.receipt.acquisitionPeriod.startedAt,
      throughAt: s.candidate.receipt.acquisitionPeriod.throughAt,
      observedAt: s.candidate.closing.observedAt,
      closingSlot: '20',
      earnedGodl: '10.00000000000',
      netSpendSol: '0.100005000',
      netSpendUsd: '10.000500',
      baselineBasis: s.candidate.receipt.acquisitionPeriod.baselineBasis,
      priceBasis: s.candidate.receipt.acquisitionPeriod.priceBasis,
      caveats: s.candidate.receipt.acquisitionPeriod.caveats,
    },
  });
  await assert.rejects(lstat(s.anchorPath));

  const imported = await cliResult(['--mode', 'import', '--wallet', s.fixture.wallet, '--input', s.inputPath,
    '--profile', s.profilePath, '--expected-sha256', inspect.body.review.sha256, '--reviewed']);
  assert.equal(imported.code, 0);
  assert.equal(imported.body.status, 'imported');
  assert.deepEqual(imported.body.review, inspect.body.review);
  const installed = await json(s.anchorPath);
  assert.deepEqual(installed.receipt, s.candidate.receipt);
  assert.deepEqual(installed.closing, s.candidate.closing);
  assert.deepEqual(installed.programDeployment, s.candidate.programDeployment);
  assert.equal(installed.status.state, 'waiting');
  assert.match(installed.status.reason, /pending reconciliation/);
  assert.equal(installed.evidenceDirectory, undefined);
  assert.equal((await stat(s.anchorPath)).mode & 0o777, 0o600);
  await assert.rejects(lstat(s.checkpointPath));
});

test('authoritative schema, arithmetic, wallet, PDA, date and slot checks reject malformed anchors', async t => {
  const cases = [
    ['schema', anchor => { anchor.schemaVersion = 2; }],
    ['arithmetic', anchor => { anchor.receipt.acquisitionPeriod.netSpendSol = '1.000000000'; }],
    ['wallet', (anchor, fixture) => {
      const other = getAddressDecoder().decode(Buffer.alloc(32, 8));
      anchor.closing.wallet = other; anchor.receipt.wallet = other;
    }],
    ['owned PDA', anchor => { anchor.closing.accounts.miner.address = getAddressDecoder().decode(Buffer.alloc(32, 8)); }],
    ['present known PDA', anchor => { anchor.closing.accounts.treasury.address = getAddressDecoder().decode(Buffer.alloc(32, 8)); }],
    ['future observation', anchor => { anchor.closing.observedAt = '2027-01-01T00:00:00.000Z'; }],
    ['unsafe slot', anchor => {
      anchor.closing.context.slot = '9007199254740992';
      anchor.receipt.evidence.closingSlot = '9007199254740992';
    }],
    ['unknown metadata', anchor => { anchor.reviewedBy = 'someone'; }],
    ['ambiguous deployment', anchor => { anchor.programDeployment = { deployedAtSlot: '1' }; }],
  ];
  for (const [name, mutate] of cases) await t.test(name, async t => {
    const s = await scenario(t, mutate);
    await assert.rejects(inspectAccountingAnchor({ wallet: s.fixture.wallet, inputPath: s.inputPath, now: fixedNow }));
    await assert.rejects(lstat(s.anchorPath));
  });

  const malformed = await scenario(t);
  await writeFile(malformed.inputPath, '{broken');
  await assert.rejects(inspectAccountingAnchor({ wallet: malformed.fixture.wallet,
    inputPath: malformed.inputPath, now: fixedNow }));
});

test('bounded reader rejects oversized, nonregular and symlink inputs', async t => {
  const s = await scenario(t);
  const oversized = join(s.root, 'oversized.json');
  await writeFile(oversized, Buffer.alloc(2 * 1024 * 1024 + 1));
  const directory = join(s.root, 'directory-input');
  await mkdir(directory);
  const linked = join(s.root, 'linked-input.json');
  await symlink(s.inputPath, linked);
  for (const inputPath of [oversized, directory, linked]) {
    await assert.rejects(inspectAccountingAnchor({ wallet: s.fixture.wallet, inputPath, now: fixedNow }));
  }
});

test('import requires acknowledgement and the exact inspected digest', async t => {
  const s = await scenario(t);
  const review = await inspectAccountingAnchor({ wallet: s.fixture.wallet, inputPath: s.inputPath, now: fixedNow });
  await assert.rejects(importAccountingAnchor({ wallet: s.fixture.wallet, inputPath: s.inputPath,
    profilePath: s.profilePath, expectedSha256: review.sha256, reviewed: false, now: fixedNow }), /acknowledgement/);
  s.candidate.status.reason = 'changed but still valid foreign metadata';
  await writeFile(s.inputPath, JSON.stringify(s.candidate));
  await assert.rejects(importAccountingAnchor({ wallet: s.fixture.wallet, inputPath: s.inputPath,
    profilePath: s.profilePath, expectedSha256: review.sha256, reviewed: true, now: fixedNow }), /changed after inspection/);
  await assert.rejects(lstat(s.anchorPath));
});

test('any existing accounting entry, including links and unreadable data, prevents replacement', async t => {
  for (const kind of ['anchor', 'checkpoint', 'evidence', 'dangling-link', 'unreadable']) await t.test(kind, async t => {
    const s = await scenario(t);
    const review = await inspectAccountingAnchor({ wallet: s.fixture.wallet, inputPath: s.inputPath, now: fixedNow });
    if (kind === 'anchor') await writeFile(s.anchorPath, 'preserve-anchor');
    if (kind === 'checkpoint') await writeFile(s.checkpointPath, 'preserve-checkpoint');
    if (kind === 'evidence') await mkdir(s.evidencePath);
    if (kind === 'dangling-link') await symlink(join(s.root, 'missing'), s.anchorPath);
    if (kind === 'unreadable') { await writeFile(s.checkpointPath, 'private'); await chmod(s.checkpointPath, 0o000); }
    await assert.rejects(importAccountingAnchor({ wallet: s.fixture.wallet, inputPath: s.inputPath,
      profilePath: s.profilePath, expectedSha256: review.sha256, reviewed: true, now: fixedNow }), /already exists/);
    if (kind === 'anchor') assert.equal(await readFile(s.anchorPath, 'utf8'), 'preserve-anchor');
    if (kind === 'checkpoint') assert.equal(await readFile(s.checkpointPath, 'utf8'), 'preserve-checkpoint');
    if (kind === 'unreadable') {
      const info = await lstat(s.checkpointPath);
      assert.equal(info.size, Buffer.byteLength('private'));
      assert.equal(info.mode & 0o777, 0);
    }
  });
});

test('the shared reconciliation lock serializes import and installation never overwrites', async t => {
  const s = await scenario(t);
  const review = await inspectAccountingAnchor({ wallet: s.fixture.wallet, inputPath: s.inputPath, now: fixedNow });
  const release = await acquireLock(`${s.checkpointPath}.lock.sqlite`);
  try {
    await assert.rejects(importAccountingAnchor({ wallet: s.fixture.wallet, inputPath: s.inputPath,
      profilePath: s.profilePath, expectedSha256: review.sha256, reviewed: true, now: fixedNow }), /already running/);
  } finally { await release(); }
  await importAccountingAnchor({ wallet: s.fixture.wallet, inputPath: s.inputPath,
    profilePath: s.profilePath, expectedSha256: review.sha256, reviewed: true, now: fixedNow });
  const original = await readFile(s.anchorPath);
  await assert.rejects(importAccountingAnchor({ wallet: s.fixture.wallet, inputPath: s.inputPath,
    profilePath: s.profilePath, expectedSha256: review.sha256, reviewed: true, now: fixedNow }), /already exists/);
  assert.deepEqual(await readFile(s.anchorPath), original);
});

test('CLI exposes only authored recovery messages for expected import failures', async t => {
  const s = await scenario(t);
  const otherWallet = getAddressDecoder().decode(Buffer.alloc(32, 8));
  const wrongWallet = await cliResult(['--mode', 'inspect', '--wallet', otherWallet, '--input', s.inputPath]);
  assert.equal(wrongWallet.code, 1);
  assert.equal(wrongWallet.body.message, 'The reviewed anchor belongs to a different wallet.');

  await writeFile(s.inputPath, '{private malformed bytes');
  const invalid = await cliResult(['--mode', 'inspect', '--wallet', s.fixture.wallet, '--input', s.inputPath]);
  assert.equal(invalid.code, 1);
  assert.equal(invalid.body.message, 'The reviewed anchor is not valid JSON.');
  assert.doesNotMatch(invalid.stdout, /private malformed|SyntaxError/);

  const changed = await scenario(t);
  const review = await inspectAccountingAnchor({ wallet: changed.fixture.wallet,
    inputPath: changed.inputPath, now: fixedNow });
  changed.candidate.status.reason = 'changed foreign status';
  await writeFile(changed.inputPath, JSON.stringify(changed.candidate));
  const changedResult = await cliResult(['--mode', 'import', '--wallet', changed.fixture.wallet,
    '--input', changed.inputPath, '--profile', changed.profilePath,
    '--expected-sha256', review.sha256, '--reviewed']);
  assert.equal(changedResult.code, 1);
  assert.equal(changedResult.body.message, 'The reviewed anchor changed after inspection.');

  const existing = await scenario(t);
  const existingReview = await inspectAccountingAnchor({ wallet: existing.fixture.wallet,
    inputPath: existing.inputPath, now: fixedNow });
  await writeFile(existing.anchorPath, 'preserve-existing-history');
  const existingResult = await cliResult(['--mode', 'import', '--wallet', existing.fixture.wallet,
    '--input', existing.inputPath, '--profile', existing.profilePath,
    '--expected-sha256', existingReview.sha256, '--reviewed']);
  assert.equal(existingResult.code, 1);
  assert.equal(existingResult.body.message, 'Accounting state already exists for this profile.');
  assert.equal(await readFile(existing.anchorPath, 'utf8'), 'preserve-existing-history');
});

test('CLI keeps arbitrary parser details and private paths out of error JSON', async t => {
  const s = await scenario(t);
  const secretPath = join(s.root, 'SECRET-private-anchor.json');
  const missing = await cliResult(['--mode', 'inspect', '--wallet', s.fixture.wallet, '--input', secretPath]);
  assert.equal(missing.code, 1);
  assert.deepEqual(missing.body, { schemaVersion: 1, status: 'error',
    message: 'The reviewed anchor could not be read.' });
  assert.equal(missing.stderr, '');
  assert.doesNotMatch(missing.stdout, /SECRET|godl-accounting-import/);

  const secretArgument = '--SECRET-unsupported-option';
  const parser = await cliResult([secretArgument]);
  assert.equal(parser.code, 1);
  assert.deepEqual(parser.body, { schemaVersion: 1, status: 'error',
    message: 'The reviewed accounting anchor could not be processed.' });
  assert.equal(parser.stderr, '');
  assert.doesNotMatch(parser.stdout, /SECRET|unsupported-option|ERR_PARSE_ARGS/);
});

test('refreshAccounting continues from an imported anchor with injected synthetic evidence', async t => {
  const s = await scenario(t);
  const review = await inspectAccountingAnchor({ wallet: s.fixture.wallet, inputPath: s.inputPath, now: fixedNow });
  await importAccountingAnchor({ wallet: s.fixture.wallet, inputPath: s.inputPath,
    profilePath: s.profilePath, expectedSha256: review.sha256, reviewed: true, now: fixedNow });
  const status = await refreshAccounting({
    wallet: s.fixture.wallet,
    anchorPath: s.anchorPath,
    checkpointPath: s.checkpointPath,
    evidenceRoot: s.evidencePath,
    rpcUrl: 'https://synthetic.invalid',
    fetchImpl: async () => { throw new Error('unexpected network request'); },
    readSnapshot: async () => structuredClone(s.fixture.interval.closing),
    readDeployment: async () => ({
      programDataAddress: getAddressDecoder().decode(Buffer.alloc(32, 9)), deployedAtSlot: '1',
    }),
    collectInterval: async () => structuredClone(s.fixture.interval),
    collectPrices: async () => ({ candles: structuredClone(s.fixture.candles) }),
    now: () => new Date('2026-01-03T01:00:00.000Z'),
    rpcTransportOptions: { minIntervalMs: 0 },
  });
  assert.equal(status.state, 'current');
  const checkpoint = await json(s.checkpointPath);
  assert.equal(checkpoint.receipt.acquisitionPeriod.netSpendUsd, '13.001000');
  assert.equal(checkpoint.receipt.evidence.extensionCount, 1);
});


test('reviewed terminal retained grid is accepted, ambiguous settlement is rejected without writes', async t => {
  for (const settled of [true, false]) {
    const s = await scenario(t, candidate => {
      const miner = candidate.closing.accounts.miner.value;
      Object.assign(miner, { roundId: '7', checkpointId: settled ? '7' : '6' });
      miner.deployed[0] = '100000';
    });
    const result = await cliResult(['--mode', 'inspect', '--wallet', s.fixture.wallet, '--input', s.inputPath]);
    assert.equal(result.code, settled ? 0 : 1);
    assert.equal(await readFile(s.inputPath, 'utf8'), s.bytes.toString());
    await assert.rejects(lstat(s.anchorPath));
    await assert.rejects(lstat(s.checkpointPath));
  }
});
