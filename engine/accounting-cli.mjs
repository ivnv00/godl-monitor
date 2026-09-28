import { readRpcConfiguration, safeRpcError } from './rpc-config.mjs';
import { parseArgs } from 'node:util';
import { refreshAccounting } from './accounting-service.mjs';
let configuredRpc;
try {
  const { values, positionals } = parseArgs({ options: {
    wallet: { type: 'string' }, checkpoint: { type: 'string' }, anchor: { type: 'string' },
    evidence: { type: 'string' }, rpc: { type: 'string' }, 'rpc-config': { type: 'string' },
  }, allowPositionals: true });
  configuredRpc = await readRpcConfiguration(values['rpc-config'], values.rpc);
  if (positionals.length || !values.wallet || !values.checkpoint || !values.anchor || !values.evidence) {
    throw new Error('Usage: accounting-cli.mjs --wallet PUBLIC_ADDRESS --checkpoint FILE --anchor REVIEWED_LOCAL_ANCHOR --evidence DIRECTORY [--rpc URL]');
  }
  const status = await refreshAccounting({ wallet: values.wallet, checkpointPath: values.checkpoint,
    anchorPath: values.anchor, evidenceRoot: values.evidence, rpcUrl: configuredRpc });
  console.log(JSON.stringify({ ...status, executionAllowed: false }));
  if (status.state !== 'current') process.exitCode = 2;
} catch (error) { console.error(safeRpcError(error, configuredRpc)); process.exitCode = 1; }
