const TRANSIENT_HTTP_STATUSES = new Set([500, 502, 503, 504]);

function positiveInteger(value, name, maximum) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new TypeError(`${name} must be an integer from 0 to ${maximum}`);
  }
  return value;
}

function retryAfterMs(response, nowMs, maximum) {
  const value = response.headers?.get?.('retry-after');
  if (typeof value !== 'string' || value.trim() === '') return null;
  const seconds = Number(value);
  const delay = Number.isFinite(seconds) && seconds >= 0
    ? Math.ceil(seconds * 1000)
    : Math.max(0, Date.parse(value) - nowMs());
  return Number.isFinite(delay) ? Math.min(delay, maximum) : null;
}

/** Serialize and pace read-only Solana JSON-RPC fetches, with bounded HTTP retries. */
export function createAccountingRpcTransport({
  fetchImpl = globalThis.fetch,
  minIntervalMs = 250,
  maxAttempts = 4,
  baseRetryMs = 500,
  maxRetryDelayMs = 30000,
  requestTimeoutMs = 10000,
  sleep = delay => new Promise(resolve => setTimeout(resolve, delay)),
  nowMs = Date.now,
  onRetryResponse = async () => {},
} = {}) {
  if (typeof fetchImpl !== 'function' || typeof sleep !== 'function'
      || typeof nowMs !== 'function' || typeof onRetryResponse !== 'function') {
    throw new TypeError('Invalid accounting RPC transport callback');
  }
  positiveInteger(minIntervalMs, 'minIntervalMs', 60000);
  positiveInteger(baseRetryMs, 'baseRetryMs', 60000);
  positiveInteger(maxRetryDelayMs, 'maxRetryDelayMs', 300000);
  positiveInteger(requestTimeoutMs, 'requestTimeoutMs', 60000);
  if (requestTimeoutMs < 1) throw new TypeError('requestTimeoutMs must be at least 1');
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) {
    throw new TypeError('maxAttempts must be an integer from 1 to 10');
  }

  let prior = Promise.resolve();
  let lastStartedAt = null;
  const run = async (input, init = {}) => {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (lastStartedAt !== null) {
        const pacingDelay = Math.max(0, minIntervalMs - (nowMs() - lastStartedAt));
        if (pacingDelay > 0) await sleep(pacingDelay);
      }
      lastStartedAt = nowMs();
      const response = await fetchImpl(input, {
        ...init,
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
      const retryable = response?.status === 429 || TRANSIENT_HTTP_STATUSES.has(response?.status);
      if (!retryable || attempt === maxAttempts) return response;
      await onRetryResponse({ input, init, response, attempt });
      const serverDelay = retryAfterMs(response, nowMs, maxRetryDelayMs);
      const fallbackDelay = Math.min(maxRetryDelayMs, baseRetryMs * (2 ** (attempt - 1)));
      await sleep(serverDelay ?? fallbackDelay);
    }
    throw new Error('Unreachable accounting RPC retry state');
  };

  return (input, init) => {
    const pending = prior.then(() => run(input, init), () => run(input, init));
    prior = pending.then(() => undefined, () => undefined);
    return pending;
  };
}
