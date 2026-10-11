import { readRpcConfiguration, safeRpcError } from './rpc-config.mjs';
import { parseArgs } from 'node:util';
import { mkdir, rename, writeFile, unlink, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { readWalletState } from './chain.mjs';
import { ObservationStore } from './observation-store.mjs';
import { projectMonitor, MAINNET_GENESIS } from './monitor.mjs';
import { projectPeriodReceipt } from './period-cost.mjs';
import { projectAccountingCheckpoint, projectFundedAccountingCheckpoint } from './accounting-service.mjs';
import { startMarketQuotes, publishEarningsViews } from './observation-publication.mjs';

async function saveAtomic(path, data) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(data, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    await rename(temporary, path);
  } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}

let store;
let configuredRpc;
try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    wallet: { type: 'string' }, rpc: { type: 'string' }, 'rpc-config': { type: 'string' },
    db: { type: 'string' }, out: { type: 'string' }, period: { type: 'string' }, accounting: { type: 'string' },
    prices: { type: 'string' }, evidence: { type: 'string' }, 'time-zone': { type: 'string' },
    notify: { type: 'boolean', default: false },
    target: { type: 'string', default: '10000' }
  } });
  configuredRpc = await readRpcConfiguration(values['rpc-config'], values.rpc);
  const [command] = positionals;
  if (positionals.length !== 1 || !['observe', 'view'].includes(command) || !values.db || !values.out) {
    throw new Error('Usage: node monitor-cli.mjs observe --wallet PUBLIC_ADDRESS --db DB --out VIEW.json [--rpc URL] [--target GODL] | view --wallet PUBLIC_ADDRESS --db DB --out VIEW.json');
  }
  const paths = [values.db, values.out, values.period, values.accounting,
    values.accounting ? `${values.accounting}.funded.json` : undefined, values.prices, values.evidence].filter(Boolean).map(value => resolve(value));
  if (new Set(paths).size !== paths.length) throw new Error('database, view and period paths must differ');
  store = new ObservationStore(values.db);
  const marketQuotes = values.prices
    ? startMarketQuotes({ cachePath: values.prices, allowFetch: command === 'observe' }) : null;
  let snapshot;
  if (command === 'observe') snapshot = await readWalletState({ wallet: values.wallet, rpcUrl: configuredRpc });
  else {
    if (!values.wallet) throw new Error('--wallet required for view');
    snapshot = store.latest({ wallet: values.wallet, genesisHash: MAINNET_GENESIS });
    if (!snapshot) throw new Error('no observed mainnet account history for this wallet');
  }
  projectMonitor(snapshot, { targetGodl: values.target });
  const insertion = command === 'view' ? null : store.append(snapshot);
  const current = store.latest({ wallet: snapshot.wallet, genesisHash: MAINNET_GENESIS });
  const history = store.list({ wallet: snapshot.wallet, genesisHash: MAINNET_GENESIS, limit: 10000 });
  let view = projectMonitor(current, { targetGodl: values.target, history });
  if (values.period) {
    try { view.acquisitionPeriod = projectPeriodReceipt(current, JSON.parse(await readFile(values.period, 'utf8'))); }
    catch (error) {
      if (error.code !== 'ENOENT') console.error('Period cost unavailable; the receipt could not be verified.');
    }
  }
  let checkpoint, fundedCheckpoint;
  if (values.accounting) {
    try {
      const candidate = JSON.parse(await readFile(values.accounting, 'utf8'));
      Object.assign(view, projectAccountingCheckpoint(current, candidate));
      checkpoint = candidate;
    }
    catch (error) {
      // The original reviewed receipt remains the fallback. An invalid/future
      // checkpoint never takes fresh balances down or advances an unknown cost.
      if (error.code !== 'ENOENT') console.error('Ongoing accounting unavailable; the checkpoint could not be verified.');
    }
  }
  if (checkpoint) {
    try {
      const candidate = JSON.parse(await readFile(`${values.accounting}.funded.json`, 'utf8'));
      Object.assign(view, projectFundedAccountingCheckpoint(current, candidate, checkpoint));
      fundedCheckpoint = candidate;
    } catch (error) {
      if (error.code !== 'ENOENT') console.error('Funded accounting unavailable; the checkpoint could not be verified.');
    }
  }
  const publish = async next => {
    await saveAtomic(values.out, next);
    if (values.notify) process.stdout.write('view-ready\n');
  };
  if (marketQuotes) view = await publishEarningsViews({ view, snapshot: current, checkpoint, fundedCheckpoint,
    evidenceRoot: values.evidence, marketQuotes, publish,
    readObservations: options => store.accountingBoundaries(options),
    timeZone: values['time-zone'] ?? Intl.DateTimeFormat().resolvedOptions().timeZone });
  else await publish(view);
  if (!values.notify) console.log(JSON.stringify({ output: values.out, stored: insertion, observedAt: view.provenance.observedAt,
    finalizedSlot: view.provenance.slot, observation: view.observation.status,
    unrefinedGodl: view.balances.unrefinedGodl, costBasis: view.performance.netCostPerGodlUsd,
    acquisitionPeriod: view.acquisitionPeriod ?? null, historyRecords: history.length, executionAllowed: false }, null, 2));
} catch (error) { console.error(safeRpcError(error, configuredRpc)); process.exitCode = 1; }
finally { store?.close(); }
