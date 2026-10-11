import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { GODL_PROGRAM_ADDRESS, GODL_SOURCE_COMMIT } from './chain.mjs';
import { MAINNET_GENESIS } from './monitor.mjs';
import { ObservationStore } from './observation-store.mjs';
import { requireOpenState } from './ongoing-cost.mjs';
import { loadEarningsCheckpoints, loadFundedCheckpoints, projectEarnings } from './earnings.mjs';
import { loadHistoricalIntervals } from './historical-accounting.mjs';

const json = async path => JSON.parse(await readFile(path, 'utf8'));
let store;
try {
  const names = ['wallet', 'db', 'accounting', 'prices', 'evidence', 'time-zone', 'end-day'];
  const { values, tokens } = parseArgs({ strict: true, allowPositionals: false, tokens: true,
    options: Object.fromEntries(names.map(name => [name, { type: 'string' }])) });
  if (names.some(name => typeof values[name] !== 'string' || !values[name].trim())
      || new Set(tokens.map(token => token.name)).size !== tokens.length
      || /^[+-]/.test(values['time-zone'])) throw new Error('Invalid selected-week arguments');
  const nowMs = Date.now(), timeZone = values['time-zone'], endDay = values['end-day'];
  // Validate the calendar request before any database access. The same projection
  // supplies the exact seven dates used by the saved-observation selector.
  const days = projectEarnings({ snapshot: { accounts: {} }, timeZone, endDay, nowMs }).days.map(row => row.day);
  store = new ObservationStore(values.db, { readOnly: true });
  const snapshot = store.latest({ wallet: values.wallet, genesisHash: MAINNET_GENESIS });
  if (!snapshot || snapshot.wallet !== values.wallet || snapshot.genesisHash !== MAINNET_GENESIS
      || snapshot.programAddress !== GODL_PROGRAM_ADDRESS || snapshot.sourceCommit !== GODL_SOURCE_COMMIT
      || snapshot.commitment !== 'finalized' || Date.parse(snapshot.observedAt) > nowMs + 5000)
    throw new Error('Unsupported saved observation');
  requireOpenState(snapshot);
  const checkpoint = await json(values.accounting);
  const checkpoints = await loadEarningsCheckpoints({ checkpoint, evidenceRoot: values.evidence });
  let fundedCheckpoint, fundedCheckpoints = [];
  try { fundedCheckpoint = await json(`${values.accounting}.funded.json`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (fundedCheckpoint !== undefined) fundedCheckpoints = await loadFundedCheckpoints({ checkpoint: fundedCheckpoint, evidenceRoot: values.evidence });
  let market;
  // loadMarketQuotes also chmods valid caches, so this endpoint reads the cache
  // directly and leaves its permissions and bytes intact. projectEarnings checks
  // exact mints, prices, provenance and freshness; unavailable prices stay unknown.
  try { const cached = await json(values.prices); if (cached?.schemaVersion === 1) market = cached; }
  catch { /* Optional cached prices cannot prevent verified token/cost history. */ }
  const input = { snapshot, checkpoint, checkpoints, fundedCheckpoint, fundedCheckpoints, market, timeZone, endDay, nowMs };
  // Reject broken committed chains before optional recovery can mask the failure.
  projectEarnings(input);
  const historicalIntervals = await loadHistoricalIntervals({ checkpoints, fundedCheckpoints, days, timeZone,
    readObservations: options => store.accountingBoundaries(options) });
  const earnings = projectEarnings({ ...input, historicalIntervals });
  process.stdout.write(JSON.stringify({ schemaVersion: 1, wallet: snapshot.wallet, genesisHash: snapshot.genesisHash,
    programAddress: snapshot.programAddress, sourceCommit: snapshot.sourceCommit, commitment: 'finalized',
    observedAt: snapshot.observedAt, slot: String(snapshot.context.slot), endDay, earnings }) + '\n');
} catch {
  process.stderr.write('Selected earnings history unavailable; local evidence could not be verified.\n');
  process.exitCode = 1;
} finally { store?.close(); }
