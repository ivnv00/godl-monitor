import test from 'node:test';
import assert from 'node:assert/strict';
import { runtimeFailure, rpcHTTPFailure } from './runtime-failure.mjs';

test('transport and local errors have fixed recovery categories without echoing input', () => {
  const secret = 'SYNTHETIC_FAILURE_DETAIL';
  for (const [error, code] of [
    [rpcHTTPFailure(401), 'accessDenied'], [rpcHTTPFailure(429), 'rateLimited'],
    [rpcHTTPFailure(503), 'providerUnavailable'],
    [new DOMException(secret, 'TimeoutError'), 'timedOut'],
    [new DOMException(secret, 'AbortError'), 'timedOut'],
    [new Error(secret, { cause: { code: 'ECONNRESET' } }), 'unreachable'],
    [new Error(secret, { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } }), 'timedOut'],
    [Object.assign(new Error(secret), { code: 'ENOSPC' }), 'localStorage'],
    [new SyntaxError(secret), 'invalidData'], [new Error(secret), 'unexpected'],
  ]) {
    const failure = runtimeFailure(error);
    assert.equal(failure.code, code);
    assert.doesNotMatch(JSON.stringify(failure), /SYNTHETIC_FAILURE_DETAIL/);
  }
});
