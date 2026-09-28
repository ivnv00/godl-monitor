// Only allowlisted codes and copy may cross the helper/UI boundary. Never try
// to redact arbitrary provider text: keys may live in paths, bodies or headers.
const messages = Object.freeze({
  accessDenied: 'RPC access was rejected. Check the key and access rules in Settings.',
  rateLimited: 'RPC rate limit reached. The next scheduled check will retry.',
  timedOut: 'RPC request timed out. Check the connection and try again.',
  unreachable: 'Could not reach the RPC provider. Check the connection and try again.',
  providerUnavailable: 'RPC provider could not complete the request. Try again later.',
  wrongNetwork: 'The RPC endpoint must use Solana mainnet. Check it in Settings.',
  configuration: 'Private RPC configuration could not be read. Check it in Settings.',
  localStorage: 'Local data could not be read or saved. Check storage and file access.',
  invalidData: 'The received data could not be verified. The last verified data is preserved.',
  invocation: 'Usage: the helper invocation is invalid. Reopen or replace the app.',
  unexpected: 'The check could not complete. Try again, or review support diagnostics in Settings.',
});

export class RuntimeFailure extends Error {
  constructor(code) {
    const known = Object.hasOwn(messages, code) ? code : 'unexpected';
    super(messages[known]);
    this.failureCode = known;
  }
}

export function rpcHTTPFailure(status) {
  return new RuntimeFailure(status === 401 || status === 403 ? 'accessDenied'
    : status === 429 ? 'rateLimited' : 'providerUnavailable');
}

export function runtimeFailureCode(error) {
  if (error instanceof RuntimeFailure) return error.failureCode;
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError'
      || ['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT'].includes(error?.cause?.code)) return 'timedOut';
  if (['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ENETUNREACH', 'EHOSTUNREACH'].includes(error?.cause?.code)
      || error?.message === 'fetch failed') return 'unreachable';
  if (['EACCES', 'EPERM', 'ENOSPC', 'EROFS', 'ENOENT', 'EIO'].includes(error?.code)) return 'localStorage';
  if (error instanceof SyntaxError) return 'invalidData';
  if (typeof error?.message === 'string' && error.message.startsWith('Usage:')) return 'invocation';
  return 'unexpected';
}

export function runtimeFailureMessage(code) { return messages[code] ?? messages.unexpected; }

export function runtimeFailure(error) {
  const code = runtimeFailureCode(error);
  return { schemaVersion: 1, kind: 'godl-runtime-failure', code, message: runtimeFailureMessage(code) };
}
