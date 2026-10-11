import { open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { address } from '@solana/addresses';
import { parseRpcJson } from './transaction-evidence.mjs';
import { projectGodlClaim } from './claim-evidence.mjs';

let file;
try {
  const { values, tokens } = parseArgs({ strict: true, allowPositionals: false, tokens: true,
    options: { wallet: { type: 'string' }, record: { type: 'string' } } });
  if (!values.wallet || !values.record?.trim() || tokens.length !== 2
      || new Set(tokens.map(token => token.name)).size !== 2) throw new Error('Invalid arguments');
  address(values.wallet);
  file = await open(values.record, 'r');
  const maximum = 8 * 1024 * 1024, info = await file.stat();
  if (!info.isFile() || info.size > maximum) throw new Error('Unsupported record');
  const bytes = await file.readFile();
  if (bytes.length > maximum) throw new Error('Unsupported record');
  const record = JSON.parse(bytes.toString('utf8'));
  if (!record || record.method !== 'getTransaction' || record.httpStatus !== 200
      || !Number.isSafeInteger(record.id) || record.id < 1 || typeof record.raw !== 'string'
      || typeof record.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(record.sha256)
      || createHash('sha256').update(record.raw).digest('hex') !== record.sha256
      || !Array.isArray(record.params) || record.params.length !== 2) throw new Error('Invalid record');
  const [signature, options] = record.params;
  if (!options || Object.keys(options).length !== 3 || options.commitment !== 'finalized'
      || options.encoding !== 'json' || options.maxSupportedTransactionVersion !== 0)
    throw new Error('Unsupported request');
  const body = parseRpcJson(record.raw);
  if (!body || body.jsonrpc !== '2.0' || body.id !== record.id || Object.hasOwn(body, 'error')
      || !Object.hasOwn(body, 'result')) throw new Error('Invalid response');
  const claim = await projectGodlClaim(body.result, { wallet: values.wallet,
    expectedSignature: signature, expectedSlot: body.result?.slot });
  // A local digest detects changed bytes; it does not authenticate the provider,
  // execution, cluster or finality. This inspector never contacts an RPC endpoint.
  const unavailable = reason => ({ status: 'unavailable', reason });
  process.stdout.write(JSON.stringify({ ...claim, evidence: {
    kind: 'saved-rpc-response', rawSha256: record.sha256, requestedCommitment: 'finalized',
    network: unavailable('saved-response-does-not-prove-cluster'),
    finality: unavailable('requested-commitment-is-not-independent-finality-proof'),
    authenticity: unavailable('saved-response-not-independently-authenticated'),
  } }) + '\n');
} catch {
  process.stderr.write('Claim evidence unavailable; the saved response could not be verified.\n');
  process.exitCode = 1;
} finally { await file?.close(); }
