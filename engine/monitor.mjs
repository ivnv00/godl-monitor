import { projectRewardBalances } from './reward-balances.mjs';
import { Ratio, GRAMS, LAMPORTS, parseUnits, uint } from './economics.mjs';
import { RuntimeFailure } from './runtime-failure.mjs';

export const MAINNET_GENESIS = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const unavailable = reason => ({ status: 'unavailable', reason });
const tokens = amount => ({ baseUnits: String(uint(amount)), decimals: 11, display: new Ratio(uint(amount), GRAMS).decimal(11) });
const sol = amount => ({ lamports: String(uint(amount)), display: new Ratio(uint(amount), LAMPORTS).decimal(9) });

function observedTime(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error('valid observedAt required');
  return Date.parse(value);
}
function sameIdentity(snapshot, item) {
  if (item.wallet !== snapshot.wallet || item.genesisHash !== snapshot.genesisHash || item.commitment !== 'finalized') {
    throw new Error('observation history identity or commitment mismatch');
  }
  uint(item.context?.slot, 'history slot');
  observedTime(item.observedAt);
}

/** A presentation contract, deliberately refusing to infer cost basis from balance counters. */
export function projectMonitor(snapshot, { targetGodl = '10000', nowMs = Date.now(), staleAfterMs = 60_000, history = [] } = {}) {
  if (snapshot?.genesisHash !== MAINNET_GENESIS) throw new RuntimeFailure('wrongNetwork');
  if (snapshot.commitment !== 'finalized') throw new Error('monitor requires finalized observations');
  if (typeof snapshot.wallet !== 'string' || !snapshot.wallet) throw new Error('wallet required');
  if (!Number.isFinite(nowMs) || !Number.isFinite(staleAfterMs) || staleAfterMs <= 0) throw new Error('valid freshness policy required');
  const observedAt = observedTime(snapshot.observedAt), ageMs = nowMs - observedAt;
  if (ageMs < -5000) throw new Error('observation time is in the future');
  const slot = uint(snapshot.context?.slot, 'slot');
  const target = parseUnits(targetGodl, 11);
  if (target <= 0n) throw new Error('target must be positive');
  const minerAccount = snapshot.accounts?.miner, boardAccount = snapshot.accounts?.board;
  if (!['present', 'missing'].includes(minerAccount?.status)) throw new Error('miner observation status required');
  if (!['present', 'missing'].includes(boardAccount?.status)) throw new Error('board observation status required');
  const miner = minerAccount.status === 'present' ? minerAccount.value : null;
  if (miner && miner.authority !== snapshot.wallet) throw new Error('miner authority mismatch');
  const board = boardAccount.status === 'present' ? boardAccount.value : null;
  let balance = null, goal = { status: 'unavailable', reason: 'miner-account-not-found', targetGodl };
  let deployment = unavailable('miner-or-board-missing');
  if (miner) {
    balance = uint(miner.rewardsGodl, 'unrefined principal');
    const remaining = target > balance ? target - balance : 0n;
    goal = { status: 'observed', targetGodl: new Ratio(target, GRAMS).decimal(11),
      remainingGodl: new Ratio(remaining, GRAMS).decimal(11), progressPercent: new Ratio(balance * 100n, target).decimal(4),
      reached: balance >= target };
    if (board) {
      const played = uint(miner.roundId), checkpoint = uint(miner.checkpointId), current = uint(board.roundId);
      if (!Array.isArray(miner.deployed) || miner.deployed.length !== 25) throw new Error('miner deployed grid required');
      const committed = miner.deployed.reduce((sum, amount) => sum + uint(amount), 0n);
      deployment = { status: 'observed', lastPlayedRound: String(played), currentRound: String(current),
        currentRoundDeployed: played === current && committed > 0n,
        lastPlayedDeploymentSol: sol(committed),
        precedingRoundNeedsCheckpoint: checkpoint < played && played < current,
        pendingGodl: unavailable('uncheckpointed-reward-not-calculated') };
    }
  }
  const series = history.map(item => {
    sameIdentity(snapshot, item);
    if (uint(item.context.slot) > slot) throw new Error('history includes a later slot than current observation');
    const observedMiner = item.accounts?.miner;
    if (observedMiner?.status === 'present' && observedMiner.value?.authority !== item.wallet) throw new Error('history miner authority mismatch');
    return { observedAt: item.observedAt, slot: item.context.slot,
      unrefinedGodl: observedMiner?.status === 'present' ? tokens(observedMiner.value.rewardsGodl) : null };
  }).sort((a, b) => BigInt(a.slot) < BigInt(b.slot) ? -1 : BigInt(a.slot) > BigInt(b.slot) ? 1 : 0);
  const automations = ['automation', 'automationV2'].map(name => {
    const account = snapshot.accounts?.[name];
    if (!account || account.status === 'missing') return { kind: name, state: account ? 'account-missing' : 'not-observed' };
    if (account.status !== 'present' || account.value?.authority !== snapshot.wallet) throw new Error('automation authority/status mismatch');
    return { kind: name, state: 'configured-execution-unverified', balanceSol: sol(account.value.balance),
      amountPerSquareSol: sol(account.value.amount), executorFeeSol: sol(account.value.fee) };
  });
  const { rewardObservation, ...rewardBalances } = projectRewardBalances(snapshot);
  return {
    schemaVersion: 1, mode: 'read-only', wallet: snapshot.wallet, network: 'solana-mainnet-beta',
    provenance: { programAddress: snapshot.programAddress, sourceCommit: snapshot.sourceCommit,
      genesisHash: snapshot.genesisHash, commitment: snapshot.commitment, slot: String(slot), observedAt: snapshot.observedAt },
    observation: { status: ageMs > staleAfterMs ? 'stale' : 'current', ageMs: Math.max(0, ageMs), staleAfterMs,
      caveat: 'Freshness describes observation; it does not confirm whether any remote miner is running.' },
    capabilities: { canObserve: true, canPause: false, canExecute: false, reason: 'No transaction or control service is implemented.' },
    balances: { unrefinedGodl: miner ? tokens(balance) : unavailable('miner-account-not-found'),
      storedRefinedGodl: miner ? tokens(miner.refinedGodl) : unavailable('miner-account-not-found'),
      storedClaimableSol: miner ? sol(miner.rewardsSol) : unavailable('miner-account-not-found'),
      ...rewardBalances,
      notes: ['Stored balances may exclude rewards awaiting checkpoint or factor settlement.', 'Refined GODL is excluded from unrefined goal progress.'] },
    goal, deployment, automations, rewardObservation,
    performance: { netCostPerGodlUsd: unavailable('transaction-history-and-historical-prices-not-reconciled'),
      netSpendUsd: unavailable('transaction-history-and-historical-prices-not-reconciled'),
      earnedTodayGodl: unavailable('balance-changes-do-not-establish-earned-rewards'),
      estimatedCompletionDate: unavailable('strategy-evidence-insufficient') },
    history: { coverage: 'observed-balances-only', firstObservedAt: series[0]?.observedAt ?? snapshot.observedAt,
      count: series.length, series, note: 'Balance observations are not a cash-flow ledger; changes can include claims and checkpoints.' }
  };
}
