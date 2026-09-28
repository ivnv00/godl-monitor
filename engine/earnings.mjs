import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { GRAMS, Ratio, uint } from './economics.mjs';
import { validateAccountingCheckpoint } from './ongoing-cost.mjs';
import { projectPeriodReceipt } from './period-cost.mjs';
import { projectRewardBalances } from './reward-balances.mjs';

const GODL_MINT = 'GodL6KZ9uuUoQwELggtVzQkKmU1LfqmDokPibPeDKkhF';
const XAUT0_MINT = 'AymATz4TCL9sWNEEV9Kvyz45CHVhDZ6kUgjTJPzLpU9P';
const SYSTEM_PROGRAM = '11111111111111111111111111111111';
const REFERRER_SENTINEL = 'JEKNVnkbo3jma5nREBBJCDoXFVeKkD56V3xKrvRmWxFG';
const U64_MAX = (1n << 64n) - 1n;
const COST_SCALE = 1_000_000_000_000_000n;
const DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const HASH = /^[a-f0-9]{64}$/;
const fail = message => { throw new Error(message); };
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function signedInteger(value, name) {
  if (typeof value !== 'string' || !/^-?(?:0|[1-9]\d*)$/.test(value)) fail(`Invalid ${name}`);
  return BigInt(value);
}

function token(baseUnits, decimals) {
  if (baseUnits < 0n || baseUnits > U64_MAX) fail('Token amount exceeds u64');
  return { baseUnits: String(baseUnits), decimals,
    display: new Ratio(baseUnits, 10n ** BigInt(decimals)).decimal(decimals) };
}

function parsePrice(value) {
  if (typeof value !== 'string' || value.length > 80 || !DECIMAL.test(value) || !/[1-9]/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  return new Ratio(BigInt(whole + fraction), 10n ** BigInt(fraction.length));
}

function usd(baseUnits, decimals, price) {
  return new Ratio(baseUnits, 10n ** BigInt(decimals)).mul(price).decimal(6);
}

function marketState(market, nowMs) {
  const empty = reason => ({ value: { observedAt: market?.observedAt ?? null,
    expiresAt: market?.expiresAt ?? null, source: 'DEX Screener', quotes: [], reason }, prices: null });
  if (!market || market.source !== 'DEX Screener' || !Array.isArray(market.quotes)
      || market.quotes.length > 2) return empty('Market quotes unavailable or invalid.');
  const observed = Date.parse(market.observedAt), expires = Date.parse(market.expiresAt);
  if (!Number.isFinite(observed) || !Number.isFinite(expires) || observed > nowMs || expires <= observed)
    return empty('Market quote provenance is invalid.');
  const expected = new Map([['GODL', GODL_MINT], ['XAUt0', XAUT0_MINT]]);
  const prices = new Map(), quotes = [];
  for (const quote of market.quotes) {
    if (!quote || !expected.has(quote.asset) || quote.mint !== expected.get(quote.asset) || prices.has(quote.asset)
        || typeof quote.pairAddress !== 'string' || !quote.pairAddress
        || typeof quote.dexId !== 'string' || !quote.dexId) continue;
    const price = parsePrice(quote.priceUsd);
    if (!price) continue;
    prices.set(quote.asset, price); quotes.push(structuredClone(quote));
  }
  const stale = expires <= nowMs;
  const value = { ...structuredClone(market), quotes,
    reason: stale ? (market.reason ?? 'Market quotes are expired.') : market.reason };
  return { value, prices: stale ? null : prices };
}

function rewardState(snapshot) {
  const miner = snapshot.accounts?.miner;
  if (miner?.status !== 'present') return { unrefined: null, refined: null, gold: null, claim: null };
  const unrefined = uint(miner.value.rewardsGodl, 'unrefined GODL');
  const projected = projectRewardBalances(snapshot);
  const refined = projected.refinedGodl?.baseUnits == null ? null : uint(projected.refinedGodl.baseUnits, 'refined GODL');
  const gold = projected.rewardObservation.cumulativeGoldBaseUnits == null
    ? null : uint(projected.rewardObservation.cumulativeGoldBaseUnits, 'cumulative gold');
  let claim = null;
  const treasury = snapshot.accounts?.treasury;
  if (refined !== null && treasury?.status === 'present') {
    const total = uint(treasury.value.totalUnclaimed, 'treasury total unclaimed');
    if (total < unrefined) fail('Treasury total unclaimed is below miner rewards');
    const refiningFee = total > unrefined ? unrefined / 10n : 0n;
    const afterRefining = unrefined + refined - refiningFee;
    if (afterRefining > U64_MAX) fail('Claim amount exceeds u64');
    const referrer = miner.value.referrer;
    if (typeof referrer !== 'string' || !referrer) fail('Claim referrer unavailable');
    let referralFee = 0n;
    if (referrer !== SYSTEM_PROGRAM && referrer !== REFERRER_SENTINEL) {
      if (afterRefining > U64_MAX / 50n) fail('Referral multiplication exceeds u64');
      referralFee = afterRefining * 50n / 10_000n;
    }
    claim = { amount: afterRefining - referralFee, refiningFee, referralFee,
      refiningApplies: total > unrefined, referred: referralFee > 0n, referrer };
  }
  return { unrefined, refined, gold, claim };
}

function localDay(iso, formatter) {
  const parts = Object.fromEntries(formatter.formatToParts(new Date(iso))
    .filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function latestDays(nowMs, formatter) {
  const today = localDay(new Date(nowMs).toISOString(), formatter);
  const cursor = new Date(`${today}T12:00:00.000Z`);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(cursor); date.setUTCDate(date.getUTCDate() - index);
    return date.toISOString().slice(0, 10);
  });
}

function unavailableDay(day, observations, reason) {
  const result = { day, coverage: 'unavailable', reason };
  if (observations.length) {
    const first = observations[0].closing, last = observations.at(-1).closing;
    Object.assign(result, { fromAt: first.observedAt, throughAt: last.observedAt,
      fromSlot: String(first.context.slot), throughSlot: String(last.context.slot) });
  }
  return result;
}

function deltaField(result, name, opening, closing, decimals, price) {
  if (opening === null || closing === null) return false;
  if (closing < opening) fail(`${name} balance regressed`);
  const delta = closing - opening;
  result[name] = token(delta, decimals);
  const usdName = name === 'unrefinedGodl' ? 'unrefinedUsd' : name === 'refinedGodl' ? 'refinedUsd' : 'goldUsd';
  if (price) result[usdName] = usd(delta, decimals, price);
  return true;
}

function dailyProjection(day, observations, today, prices) {
  if (observations.length < 2) return unavailableDay(day, observations,
    observations.length ? 'Only one verified closed observation is available for this local day.' : 'No verified closed observations are available for this local day.');
  let opening = observations[0], closing = observations.at(-1);
  if (day === today) {
    const full = observations.filter(item => item.reward.refined !== null && item.reward.gold !== null && item.reward.claim !== null);
    if (full.length >= 2) [opening, closing] = [full[0], full.at(-1)];
  }
  const result = { day, fromAt: opening.closing.observedAt, throughAt: closing.closing.observedAt,
    fromSlot: String(opening.closing.context.slot), throughSlot: String(closing.closing.context.slot),
    coverage: 'partial', reason: 'First-to-last verified closed observations within the named local calendar day; midnight coverage is not implied.' };
  const godlPrice = prices?.get('GODL'), goldPrice = prices?.get('XAUt0');
  deltaField(result, 'unrefinedGodl', opening.reward.unrefined, closing.reward.unrefined, 11, godlPrice);
  deltaField(result, 'refinedGodl', opening.reward.refined, closing.reward.refined, 11, godlPrice);
  deltaField(result, 'gold', opening.reward.gold, closing.reward.gold, 6, goldPrice);
  const openingCost = signedInteger(opening.receipt.evidence.netUsdLamportMicro, 'checkpoint cost');
  const closingCost = signedInteger(closing.receipt.evidence.netUsdLamportMicro, 'checkpoint cost');
  result.netSpendUsd = new Ratio(closingCost - openingCost, COST_SCALE).decimal(6);
  if (opening.reward.claim && closing.reward.claim) {
    if (opening.reward.claim.referrer !== closing.reward.claim.referrer) fail('Claim referrer changed within checkpoint chain');
    if (opening.reward.claim.refiningApplies !== closing.reward.claim.refiningApplies
        || opening.reward.claim.referred !== closing.reward.claim.referred) {
      result.reason += ' Claim fee regime changed between endpoints, so combined reward and net values are unavailable.';
    } else if (closing.reward.claim.amount < opening.reward.claim.amount) {
      fail('Claimable GODL regressed');
    } else if (godlPrice && goldPrice && opening.reward.gold !== null && closing.reward.gold !== null) {
      const claimDelta = closing.reward.claim.amount - opening.reward.claim.amount;
      const goldDelta = closing.reward.gold - opening.reward.gold;
      const rewardValue = new Ratio(claimDelta, GRAMS).mul(godlPrice)
        .add(new Ratio(goldDelta, 1_000_000n).mul(goldPrice));
      result.rewardValueUsd = rewardValue.decimal(6);
      result.netRewardUsd = rewardValue.sub(new Ratio(closingCost - openingCost, COST_SCALE)).decimal(6);
    } else {
      result.reason += ' Fresh exact-mint market quotes or complete reward factors are unavailable.';
    }
  } else {
    result.reason += ' Complete reward factors and claim inputs are unavailable.';
  }
  return result;
}

function monotonicCounters(left, right) {
  const l = left.accounts.miner.value, r = right.accounts.miner.value;
  for (const name of ['checkpointId', 'roundId', 'lifetimeDeployed', 'lifetimeRewardsSol', 'lifetimeRewardsGodl']) {
    if (l[name] != null && r[name] != null && uint(r[name], name) < uint(l[name], name)) fail(`Reward counter ${name} regressed`);
  }
  const lx = left.accounts.minerExtended?.value?.lifetimeXaut;
  const rx = right.accounts.minerExtended?.value?.lifetimeXaut;
  if (lx != null && rx != null && uint(rx, 'lifetime gold') < uint(lx, 'lifetime gold')) fail('Lifetime gold counter regressed');
}

function totalProjection(snapshot, checkpoint, prices) {
  const result = { scope: 'unrefined-only',
    fromAt: checkpoint.receipt.acquisitionPeriod.startedAt,
    throughAt: checkpoint.closing.observedAt,
    throughSlot: String(checkpoint.closing.context.slot),
    reason: 'Checkpoint-attributed unrefined GODL only. Excludes refined GODL, gold, unknown opening holdings, off-chain costs, slippage, claim transaction fees and sale costs.' };
  const principal = uint(checkpoint.closing.accounts.miner.value.rewardsGodl, 'attributed unrefined GODL');
  const miner = snapshot.accounts?.miner, treasury = snapshot.accounts?.treasury;
  if (miner?.status !== 'present' || treasury?.status !== 'present') {
    result.reason += ' Current claim fee inputs are unavailable.';
    return result;
  }
  const checkpointMiner = checkpoint.closing.accounts.miner.value;
  if (String(miner.value.lastClaimGodlAt) !== String(checkpointMiner.lastClaimGodlAt)
      || uint(miner.value.rewardsGodl, 'current unrefined GODL') < principal) {
    result.reason += ' Current claim state no longer matches the closed checkpoint, so checkpoint principal is not valued.';
    return result;
  }
  const total = uint(treasury.value.totalUnclaimed, 'treasury total unclaimed');
  if (total < uint(miner.value.rewardsGodl, 'current unrefined GODL')) fail('Treasury total unclaimed is below current miner rewards');
  const refiningFee = total > uint(miner.value.rewardsGodl) ? principal / 10n : 0n;
  const afterRefining = principal - refiningFee;
  const referrer = miner.value.referrer;
  if (typeof referrer !== 'string' || !referrer) fail('Claim referrer unavailable');
  let referralFee = 0n;
  if (referrer !== SYSTEM_PROGRAM && referrer !== REFERRER_SENTINEL) {
    if (afterRefining > U64_MAX / 50n) fail('Referral multiplication exceeds u64');
    referralFee = afterRefining * 50n / 10_000n;
  }
  const claimable = afterRefining - referralFee;
  Object.assign(result, { claimableGodl: token(claimable, 11), refiningFee: token(refiningFee, 11),
    referralFee: token(referralFee, 11) });
  const spend = signedInteger(checkpoint.receipt.evidence.netUsdLamportMicro, 'cumulative checkpoint cost');
  result.netSpendUsd = new Ratio(spend, COST_SCALE).decimal(6);
  const price = prices?.get('GODL');
  if (price) {
    const value = new Ratio(claimable, GRAMS).mul(price);
    result.rewardValueUsd = value.decimal(6);
    result.netPnlUsd = value.sub(new Ratio(spend, COST_SCALE)).decimal(6);
  } else result.reason += ' Fresh exact-mint GODL pricing is unavailable.';
  return result;
}

/** Read immutable reconciliation runs and return the suffix connected to the current receipt. */
export async function loadEarningsCheckpoints({ checkpoint, evidenceRoot }) {
  validateAccountingCheckpoint(checkpoint);
  if (typeof evidenceRoot !== 'string' || !evidenceRoot) fail('Invalid earnings evidence root');
  const candidates = [];
  let entries;
  try { entries = await readdir(evidenceRoot, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return [structuredClone(checkpoint)]; throw error; }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'finalized-cache') continue;
    const path = join(evidenceRoot, entry.name, 'reconciliation.json');
    try {
      const record = JSON.parse(await readFile(path, 'utf8'));
      if (!record?.interval?.closing || !record.receipt || record.priorReceiptSha256 !== record.receipt.evidence?.previousReceiptSha256
          || !HASH.test(record.priorReceiptSha256)
          || String(record.interval.fromExclusiveSlot) !== String(record.receipt.evidence.lastInterval?.fromExclusiveSlot)
          || String(record.interval.toInclusiveSlot) !== String(record.interval.closing.context?.slot)) continue;
      const value = { schemaVersion: 1, kind: 'godl-accounting-checkpoint', receipt: record.receipt,
        closing: record.interval.closing, evidenceDirectory: join(evidenceRoot, entry.name),
        intervalFromExclusiveSlot: String(record.interval.fromExclusiveSlot) };
      validateAccountingCheckpoint(value);
      candidates.push(value);
    } catch { /* A partial, cache, failed, or corrupt run is not evidence. */ }
  }
  const byHash = new Map(), children = new Map();
  for (const candidate of candidates) {
    const hash = digest(candidate.receipt);
    const existing = byHash.get(hash);
    if (existing && JSON.stringify(existing.receipt) !== JSON.stringify(candidate.receipt)) fail('Accounting receipt hash collision');
    if (!existing) byHash.set(hash, candidate);
    const previous = candidate.receipt.evidence.previousReceiptSha256;
    const set = children.get(previous) ?? new Set(); set.add(hash); children.set(previous, set);
  }
  for (const set of children.values()) if (set.size > 1) fail('Forked accounting evidence');
  const reversed = [structuredClone(checkpoint)];
  let child = byHash.get(digest(checkpoint.receipt)) ?? { ...checkpoint,
    intervalFromExclusiveSlot: checkpoint.receipt.evidence?.lastInterval?.fromExclusiveSlot };
  let expected = checkpoint.receipt.evidence?.previousReceiptSha256;
  if (child && child.intervalFromExclusiveSlot !== String(byHash.get(expected)?.closing.context.slot ?? child.intervalFromExclusiveSlot)
      && byHash.has(expected)) fail('Accounting interval slot link mismatch');
  const seen = new Set([digest(checkpoint.receipt)]);
  while (HASH.test(expected) && byHash.has(expected)) {
    const parent = byHash.get(expected), parentHash = digest(parent.receipt);
    if (seen.has(parentHash)) fail('Cyclic accounting evidence');
    if (child && child.intervalFromExclusiveSlot !== String(parent.closing.context.slot)) fail('Accounting interval slot link mismatch');
    if (uint(parent.closing.context.slot) >= uint((child ?? checkpoint).closing.context.slot)) fail('Accounting slots did not advance');
    reversed.push(parent); seen.add(parentHash); child = parent;
    expected = parent.receipt.evidence?.previousReceiptSha256;
  }
  return reversed.reverse();
}

/** Project current holdings, seven local-day closed deltas, and scoped cumulative unrefined P/L. */
export function projectEarnings({ snapshot, checkpoint, checkpoints, market,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone, nowMs = Date.now() }) {
  if (!Number.isFinite(nowMs)) fail('Invalid earnings projection time');
  validateAccountingCheckpoint(checkpoint);
  projectPeriodReceipt(snapshot, checkpoint.receipt);
  if (snapshot.wallet !== checkpoint.closing.wallet || snapshot.genesisHash !== checkpoint.closing.genesisHash
      || snapshot.programAddress !== checkpoint.closing.programAddress || snapshot.sourceCommit !== checkpoint.closing.sourceCommit
      || uint(snapshot.context.slot) < uint(checkpoint.closing.context.slot)
      || Date.parse(snapshot.observedAt) < Date.parse(checkpoint.closing.observedAt)) fail('Current snapshot does not cover the accounting checkpoint');
  if (!Array.isArray(checkpoints) || !checkpoints.length) fail('Verified earnings checkpoints are required');
  const chain = [...checkpoints].sort((a, b) => uint(a.closing.context.slot) < uint(b.closing.context.slot) ? -1 : 1);
  if (digest(chain.at(-1).receipt) !== digest(checkpoint.receipt)) fail('Earnings checkpoint chain is not current');
  const observations = chain.map((item, index) => {
    validateAccountingCheckpoint(item);
    if (item.closing.wallet !== checkpoint.closing.wallet || item.closing.genesisHash !== checkpoint.closing.genesisHash
        || item.closing.programAddress !== checkpoint.closing.programAddress || item.closing.sourceCommit !== checkpoint.closing.sourceCommit) fail('Earnings checkpoint identity mismatch');
    if (index) {
      const prior = chain[index - 1];
      if (item.receipt.evidence?.previousReceiptSha256 !== digest(prior.receipt)
          || String(item.receipt.evidence.lastInterval?.fromExclusiveSlot) !== String(prior.closing.context.slot)
          || uint(item.closing.context.slot) <= uint(prior.closing.context.slot)) fail('Broken earnings checkpoint chain');
      const leftMiner = prior.closing.accounts.miner.value, rightMiner = item.closing.accounts.miner.value;
      if (String(leftMiner.lastClaimGodlAt) !== String(rightMiner.lastClaimGodlAt)) fail('GODL claim marker changed within checkpoint chain');
      if (leftMiner.referrer !== rightMiner.referrer) fail('Claim referrer changed within checkpoint chain');
      if (uint(rightMiner.rewardsGodl) < uint(leftMiner.rewardsGodl)) fail('Unrefined GODL regressed');
      monotonicCounters(prior.closing, item.closing);
    }
    return { ...item, reward: rewardState(item.closing) };
  });
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  formatter.format(new Date(nowMs));
  const days = latestDays(nowMs, formatter), today = days[0];
  const marketResult = marketState(market, nowMs), current = rewardState(snapshot);
  const holdings = {};
  const godlPrice = marketResult.prices?.get('GODL'), goldPrice = marketResult.prices?.get('XAUt0');
  if (current.unrefined !== null && godlPrice) holdings.unrefinedUsd = usd(current.unrefined, 11, godlPrice);
  if (current.refined !== null && godlPrice) holdings.refinedUsd = usd(current.refined, 11, godlPrice);
  const currentProjected = projectRewardBalances(snapshot);
  const holdingGold = currentProjected.claimableGold?.baseUnits == null ? null : uint(currentProjected.claimableGold.baseUnits);
  if (holdingGold !== null && goldPrice) holdings.goldUsd = usd(holdingGold, 6, goldPrice);
  return { schemaVersion: 1, timeZone, market: marketResult.value, holdings,
    days: days.map(day => dailyProjection(day,
      observations.filter(item => localDay(item.closing.observedAt, formatter) === day), today, marketResult.prices)),
    total: totalProjection(snapshot, checkpoint, marketResult.prices) };
}
