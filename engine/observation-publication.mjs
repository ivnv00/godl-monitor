import { loadMarketQuotes } from './market-quotes.mjs';
import { loadEarningsCheckpoints, projectEarnings } from './earnings.mjs';

/** Start the optional quote refresh before reading accounts, handling every rejection. */
export function startMarketQuotes({ cachePath, allowFetch, loadQuotes = loadMarketQuotes }) {
  const state = { settled: false, market: undefined };
  state.cached = loadQuotes({ cachePath, allowFetch: false }).catch(() => undefined);
  state.refreshed = (allowFetch ? loadQuotes({ cachePath, allowFetch: true }) : state.cached)
    .catch(() => undefined).then(market => {
      state.settled = true;
      state.market = market;
      return market;
    });
  return state;
}

/** Publish complete current data first; only optional market enrichment waits on the provider. */
export async function publishEarningsViews({ view, snapshot, checkpoint, evidenceRoot, marketQuotes,
  timeZone, publish, nowMs = Date.now, loadCheckpoints = loadEarningsCheckpoints, warn = console.error }) {
  let checkpoints = [], earningsCheckpoint = checkpoint;
  if (checkpoint && evidenceRoot) {
    try { checkpoints = await loadCheckpoints({ checkpoint, evidenceRoot }); }
    catch {
      earningsCheckpoint = undefined;
      warn('Earnings history unavailable; current holdings remain independent of accounting history.');
    }
  }
  const cached = await marketQuotes.cached;
  const initialMarket = marketQuotes.settled ? marketQuotes.market ?? cached : cached;
  function projected(market) {
    const options = { snapshot, market, timeZone, nowMs: nowMs() };
    let earnings;
    try { earnings = projectEarnings({ ...options, checkpoint: earningsCheckpoint, checkpoints }); }
    catch {
      earningsCheckpoint = undefined;
      warn('Earnings history unavailable; current holdings remain independent of accounting history.');
      try { earnings = projectEarnings(options); }
      catch { warn('Earnings estimate unavailable; balances and reconciled cost remain available.'); }
    }
    return { ...view, ...(earnings ? { earnings } : {}) };
  }
  const first = projected(initialMarket);
  await publish(first);
  const refreshed = await marketQuotes.refreshed;
  if (refreshed == null || JSON.stringify(refreshed) === JSON.stringify(initialMarket)) return first;
  const enriched = projected(refreshed);
  if (JSON.stringify(enriched.earnings) !== JSON.stringify(first.earnings)) await publish(enriched);
  return enriched;
}
