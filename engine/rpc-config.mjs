import { readFile, stat } from 'node:fs/promises';
import { RuntimeFailure, runtimeFailure } from './runtime-failure.mjs';

export const PUBLIC_RPC = 'https://api.mainnet-beta.solana.com';

// Optional per-user runtime configuration. Never include this file or endpoint
// credentials in the distributed app, process arguments, reports or diagnostics.
export async function readRpcConfiguration(path, explicitUrl) {
  let rpcUrl = explicitUrl ?? PUBLIC_RPC;
  if (path && !explicitUrl) {
    try {
      const mode = (await stat(path)).mode;
      if ((mode & 0o077) !== 0) throw new Error('Private RPC configuration must be readable only by its owner');
      const config = JSON.parse(await readFile(path, 'utf8'));
      rpcUrl = config.rpcUrl;
    } catch (error) {
      if (error.code !== 'ENOENT') throw new RuntimeFailure('configuration');
    }
  }
  let endpoint;
  try { endpoint = new URL(rpcUrl); } catch { throw new RuntimeFailure('configuration'); }
  if (!['https:', 'http:'].includes(endpoint.protocol) || endpoint.username || endpoint.password)
    throw new RuntimeFailure('configuration');
  return endpoint.href;
}

export function safeRpcError(error) { return JSON.stringify(runtimeFailure(error)); }
