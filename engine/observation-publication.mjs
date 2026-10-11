import { loadHistoricalIntervals } from './historical-accounting.mjs';
import { loadMarketQuotes } from './market-quotes.mjs';
import { loadEarningsCheckpoints, loadFundedCheckpoints, projectEarnings } from './earnings.mjs';

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

/** Publish validated balances/holdings before optional accounting chains or refreshed quotes. */
export async function publishEarningsViews({ view, snapshot, checkpoint, fundedCheckpoint, evidenceRoot, marketQuotes,
  timeZone, publish, readObservations, nowMs = Date.now, loadCheckpoints = loadEarningsCheckpoints,
  loadFunded = loadFundedCheckpoints, warn = console.error }) {
  let historicalIntervals = [];
  let checkpoints = [], fundedCheckpoints = [], earningsCheckpoint, earningsFunded;
  const fallbackFunded = () => {
    earningsFunded = undefined;
    view = { ...view, ...(checkpoint?.status ? { accounting: structuredClone(checkpoint.status) } : {}) };
    warn('Funded earnings history unavailable; verified closed history and current holdings remain available.');
  };
  const cached = await marketQuotes.cached;
  const initialMarket = marketQuotes.settled ? marketQuotes.market ?? cached : cached;
  function projected(market) {
    const options = { snapshot, market, timeZone, nowMs: nowMs() };
    let earnings;
    try { earnings = projectEarnings({ ...options, checkpoint: earningsCheckpoint, checkpoints,
      fundedCheckpoint: earningsFunded, fundedCheckpoints, historicalIntervals }); }
    catch {
      if (earningsFunded) {
        fallbackFunded();
        try { earnings = projectEarnings({ ...options, checkpoint: earningsCheckpoint, checkpoints }); }
        catch { /* The independently verified holdings are the final fallback below. */ }
      }
      if (!earnings) {
        earningsCheckpoint = undefined;
        warn('Earnings history unavailable; current holdings remain independent of accounting history.');
        try { earnings = projectEarnings(options); }
        catch { warn('Earnings estimate unavailable; balances and reconciled cost remain available.'); }
      }
    }
    return { ...view, ...(earnings ? { earnings } : {}) };
  }
  let first = projected(initialMarket);
  if (checkpoint) first = { ...first, earningsHistoryPending: true };
  await publish(first);
  earningsCheckpoint = checkpoint;
  earningsFunded = fundedCheckpoint;
  if (checkpoint && evidenceRoot) {
    try { checkpoints = await loadCheckpoints({ checkpoint, evidenceRoot }); }
    catch {
      earningsCheckpoint = undefined;
      warn('Earnings history unavailable; current holdings remain independent of accounting history.');
    }
  }
  if (earningsFunded) {
    try {
      if (!earningsCheckpoint || !evidenceRoot) throw new Error('Funded history unavailable');
      fundedCheckpoints = await loadFunded({ checkpoint: earningsFunded, evidenceRoot });
    } catch { fallbackFunded(); }
  }
  if (checkpoint || fundedCheckpoint) {
    const reconciled = projected(initialMarket);
    if (JSON.stringify(reconciled) !== JSON.stringify(first)) await publish(reconciled);
    first = reconciled;
  }
  if (earningsCheckpoint && typeof readObservations === 'function') {
    historicalIntervals = await loadHistoricalIntervals({checkpoints,
      fundedCheckpoints:earningsFunded ? fundedCheckpoints : [], readObservations,
      days:first.earnings?.days.map(day => day.day) ?? [], timeZone});
    if (historicalIntervals.length) {
      const recovered = projected(initialMarket);
      if (JSON.stringify(recovered.earnings) !== JSON.stringify(first.earnings)) await publish(recovered);
      first = recovered;
    }
  }
  const refreshed = await marketQuotes.refreshed;
  if (refreshed == null || JSON.stringify(refreshed) === JSON.stringify(initialMarket)) return first;
  const enriched = projected(refreshed);
  if (JSON.stringify(enriched.earnings) !== JSON.stringify(first.earnings)) await publish(enriched);
  return enriched;
}
