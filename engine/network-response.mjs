import { RuntimeFailure, runtimeFailureCode } from './runtime-failure.mjs';

export const RESPONSE_LIMITS = Object.freeze({ small: 64 * 1024, wallet: 2 * 1024 * 1024,
  history: 16 * 1024 * 1024, market: 4 * 1024 * 1024 });

export function httpsEndpoint(input) {
  let endpoint;
  try { endpoint = new URL(input); } catch { throw new RuntimeFailure('configuration'); }
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) throw new RuntimeFailure('configuration');
  return endpoint;
}

// The transport also uses this before retry capture, where callers have not yet
// parsed the response. Unrecognized RPC methods receive the history ceiling.
export function rpcResponseLimit(init = {}) {
  let method;
  try { method = JSON.parse(init.body).method; } catch {}
  if (['getGenesisHash', 'getBlockTime', 'getAccountInfo'].includes(method)) return RESPONSE_LIMITS.small;
  return method === 'getMultipleAccounts' ? RESPONSE_LIMITS.wallet : RESPONSE_LIMITS.history;
}

// Consume decoded stream bytes before callers can parse, clone, cache or save
// evidence. A single fixed buffer also bounds bookkeeping for tiny chunks.
export async function boundedFetch(fetchImpl, input, init = {}, maxBytes = rpcResponseLimit(init)) {
  const endpoint = httpsEndpoint(input);
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > RESPONSE_LIMITS.history) throw new TypeError('Invalid response limit');
  const signal = init.signal;
  let response, reader, abortHandler;
  const cancel = () => {
    try { (reader ? reader.cancel() : response?.body?.cancel())?.catch(() => {}); } catch {}
  };
  const aborted = new Promise((_, reject) => {
    abortHandler = () => { reject(new RuntimeFailure('timedOut')); cancel(); };
    if (!signal?.aborted) signal?.addEventListener('abort', abortHandler, { once: true });
  });
  try {
    if (signal?.aborted) throw new RuntimeFailure('timedOut');
    const pending = Promise.resolve(fetchImpl(endpoint.href, { ...init, redirect: 'error' }));
    // An injected fetch may ignore cancellation. Dispose of a late response too.
    pending.then(value => {
      if (signal?.aborted) { try { value?.body?.cancel().catch(() => {}); } catch {} }
    }, () => {});
    response = await Promise.race([pending, aborted]);
    if (!response || response.redirected || (response.status >= 300 && response.status < 400)) {
      throw new RuntimeFailure('providerUnavailable');
    }
    if (!(response.headers instanceof Headers) || (response.body !== null && typeof response.body?.getReader !== 'function')) {
      throw new RuntimeFailure('invalidData');
    }
    const length = response.headers.get('content-length');
    if (length !== null && /^\d+$/.test(length.trim()) && BigInt(length.trim()) > BigInt(maxBytes)) {
      throw new RuntimeFailure('invalidData');
    }
    let bytes = null;
    if (response.body !== null) {
      reader = response.body.getReader();
      bytes = await Promise.race([(async () => {
        const buffer = Buffer.allocUnsafe(maxBytes);
        let count = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (signal?.aborted) throw new RuntimeFailure('timedOut');
          if (done) break;
          if (!(value instanceof Uint8Array) || value.byteLength > maxBytes - count) throw new RuntimeFailure('invalidData');
          buffer.set(value, count);
          count += value.byteLength;
        }
        return buffer.subarray(0, count);
      })(), aborted]);
    }
    return new Response(bytes, { status: response.status, statusText: response.statusText, headers: response.headers });
  } catch (error) {
    cancel();
    throw error instanceof RuntimeFailure ? error : new RuntimeFailure(runtimeFailureCode(error));
  } finally {
    signal?.removeEventListener('abort', abortHandler);
    reader?.releaseLock();
  }
}
