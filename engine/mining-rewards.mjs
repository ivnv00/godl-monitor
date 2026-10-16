// Offline projection of supplied finalized RPC logs against the verified checkpoint
// handler. The caller owns finality/provider trust and transaction-history coverage.
import { address, getProgramDerivedAddress } from '@solana/addresses';
import { GODL_PROGRAM_ADDRESS } from './chain.mjs';

// Updating another observation decoder must not silently authorize a new reward ABI.
export const GODL_MINING_SOURCE_COMMIT = '8cbbc86341445d11e3779dfd5be9363474d75683';

const U64_MAX = (1n << 64n) - 1n;
const U64_END = U64_MAX + 1n;
const SCALE = 100000000000;
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const COMPUTE = 'ComputeBudget111111111111111111111111111111';
const COMPUTE_LENGTHS = new Map([[0,9],[1,5],[2,5],[3,9],[4,5]]);
// Verified source's complete non-checkpoint dispatch table. 41 (admin injection)
// and 49 (OTC bonus) can add unrefined GODL but do not represent mining. 34 is the
// legacy checkpoint and is intentionally unsupported, even when it emits no log.
const NON_MINING = new Set([1,3,4,8,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,
  27,29,30,32,33,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,
  56,57,58,59,60,61,62,63,64,65,67,68,69]);
const REWARD = /^(Split rewards|Pool share|Top miner rewards|Motherlode rewards): (.+) GODL$/;
const fail = reason => { throw new Error(`mining-rewards-${reason}`); };

/** Invert Rust's amount_to_ui_amount(u64, 11), accepting a unique integer only.
 * Number is used solely to reproduce and invert the source's f64 display value;
 * recovered credits, sums and serialized amounts remain exact integers.
 */
export function exactLogAmount(text) {
  if (typeof text !== 'string' || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text)) fail('amount-invalid');
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0 || (value === 0 && !/^0(?:\.0+)?$/.test(text))) fail('amount-invalid');
  const f = n => Number(n) / SCALE;
  // The end sentinel is never evaluated: these searches cover exactly [0,u64MAX].
  const lower = strict => {
    let lo = 0n, hi = U64_END;
    while (lo < hi) {
      const mid = (lo + hi) >> 1n;
      if (strict ? f(mid) > value : f(mid) >= value) hi = mid;
      else lo = mid + 1n;
    }
    return lo;
  };
  const first = lower(false), end = lower(true);
  if (first > U64_MAX || end - first !== 1n || f(first) !== value) fail('amount-not-unique');
  return first;
}

function dataBytes(text) {
  if (typeof text !== 'string' || text.length > 2048 || !/^[1-9A-HJ-NP-Za-km-z]*$/.test(text)) fail('instruction-data-invalid');
  let n = 0n;
  for (const c of text) n = n * 58n + BigInt(ALPHABET.indexOf(c));
  const tail = [];
  while (n) { tail.unshift(Number(n % 256n)); n /= 256n; }
  return Buffer.from([...Array(text.match(/^1*/)[0].length).fill(0), ...tail]);
}

function unsigned(text) {
  if (!/^(0|[1-9]\d{0,19})$/.test(text) || BigInt(text) > U64_MAX) fail('round-invalid');
  return BigInt(text);
}

function instruction(ix, keys, depth) {
  const index = n => Number.isSafeInteger(n) && n >= 0 && n < keys.length;
  if (!ix || !index(ix.programIdIndex) || !Array.isArray(ix.accounts) || !ix.accounts.every(index)) fail('instruction-invalid');
  if (ix.stackHeight != null && (!Number.isSafeInteger(ix.stackHeight) || ix.stackHeight !== depth && depth !== null)) fail('instruction-depth-invalid');
  return { program:keys[ix.programIdIndex], accounts:ix.accounts.map(i => keys[i]),
    data:dataBytes(ix.data), stackHeight:ix.stackHeight, logs:[], parent:null, outcome:null };
}

function trace(result) {
  const { meta, transaction:{ message } } = result;
  if (!Array.isArray(message.accountKeys) || !Array.isArray(message.instructions)
      || !Array.isArray(meta.innerInstructions) || !Array.isArray(meta.logMessages)) fail('trace-unavailable');
  if (result.version !== undefined && result.version !== 'legacy' && result.version !== 0) fail('version-unsupported');
  const loaded = meta.loadedAddresses ?? {writable:[], readonly:[]};
  if (!Array.isArray(loaded.writable) || !Array.isArray(loaded.readonly)) fail('loaded-addresses-invalid');
  if (result.version === 'legacy' && (loaded.writable.length || loaded.readonly.length)) fail('loaded-addresses-invalid');
  if (result.version === 0 && message.addressTableLookups?.length && !meta.loadedAddresses) fail('loaded-addresses-unavailable');
  const keys = [...message.accountKeys, ...loaded.writable, ...loaded.readonly];
  keys.forEach(k => address(k));
  const roots = message.instructions.map(ix => instruction(ix, keys, 1));
  const groups = new Map();
  for (const group of meta.innerInstructions) {
    if (!Number.isSafeInteger(group?.index) || group.index < 0 || group.index >= roots.length
        || groups.has(group.index) || !Array.isArray(group.instructions)) fail('inner-instructions-invalid');
    groups.set(group.index, group.instructions.map(ix => instruction(ix, keys, null)));
  }
  // Some providers include ComputeBudget's runtime invoke/success pairs. Consume
  // those normally; omit only validated compute instructions without an invocation.
  roots.forEach((node, i) => {
    if (node.program === COMPUTE && (groups.get(i)?.length || node.accounts.length
        || node.data.length !== COMPUTE_LENGTHS.get(node.data[0]))) fail('trace-mismatch');
  });
  const stack = [], nodes = [], positions = new Map();
  let outer = 0, rootIndex = null;
  const skipCompute = () => {
    while (outer < roots.length && roots[outer].program === COMPUTE) {
      outer++;
    }
  };
  for (const line of meta.logMessages) {
    if (typeof line !== 'string' || /(?:log(?:s)? truncated|truncat(?:ed|ion))/i.test(line)) fail('logs-truncated');
    const invoke = /^Program ([1-9A-HJ-NP-Za-km-z]+) invoke \[([1-9]\d*)\]$/.exec(line);
    const ended = /^Program ([1-9A-HJ-NP-Za-km-z]+) (success|failed: .+)$/.exec(line);
    if (invoke) {
      const depth = Number(invoke[2]);
      if (depth !== stack.length + 1) fail('trace-depth-mismatch');
      let node;
      if (!stack.length) {
        if (invoke[1] !== COMPUTE) skipCompute();
        rootIndex = outer;
        node = roots[outer++];
        positions.set(rootIndex, 0);
      } else {
        const position = positions.get(rootIndex);
        node = groups.get(rootIndex)?.[position];
        positions.set(rootIndex, position + 1);
      }
      if (!node || node.program !== invoke[1] || node.stackHeight != null && node.stackHeight !== depth) fail('trace-mismatch');
      node.parent = stack.at(-1) ?? null;
      stack.push(node); nodes.push(node);
    } else if (ended) {
      const node = stack.pop();
      if (!node || node.program !== ended[1]) fail('trace-unbalanced');
      node.outcome = ended[2] === 'success' ? 'success' : 'failed';
      if (!stack.length && positions.get(rootIndex) !== (groups.get(rootIndex)?.length ?? 0)) fail('trace-mismatch');
    } else if (line.startsWith('Program log: ')) {
      if (!stack.length) fail('log-without-invocation');
      stack.at(-1).logs.push(line.slice(13));
    } else if (/^Program \S+ (?:invoke|success|failed)/.test(line)) fail('trace-invalid');
  }
  skipCompute();
  if (stack.length || outer !== roots.length) fail('trace-incomplete');
  if (nodes.some(node => node.parent === null && node.outcome !== 'success')) fail('trace-outcome-mismatch');
  return nodes;
}

async function checkpointCredit(node, programAddress) {
  let roundId = null, primary = false, motherlode = false, total = 0n, zeroPath = null;
  let base = false, refund = false, emptyPool = false;
  for (const log of node.logs) {
    const round = /^Round ID: (.+)$/.exec(log);
    const reward = REWARD.exec(log);
    if (round) {
      if (roundId !== null || zeroPath || primary || motherlode) fail('checkpoint-log-order');
      roundId = unsigned(round[1]).toString();
    } else if (reward) {
      if (roundId === null || zeroPath || !base || refund) fail('checkpoint-log-order');
      if (reward[1] === 'Motherlode rewards') {
        if (motherlode) fail('duplicate-reward');
        motherlode = true;
      } else {
        if (primary || motherlode || emptyPool) fail('duplicate-reward');
        primary = true;
      }
      total += exactLogAmount(reward[2]);
      if (total > U64_MAX) fail('credit-overflow');
    } else if (['Round account is empty','Round not valid','Round expired'].includes(log)) {
      if (zeroPath || base || refund || primary || motherlode || (log === 'Round account is empty') !== (roundId === null)) fail('checkpoint-log-order');
      zeroPath = log;
    } else if (/^Base rewards: (?:0|[1-9]\d*)(?:\.\d+)? SOL$/.test(log)) {
      if (roundId === null || zeroPath || base || refund || primary || motherlode) fail('checkpoint-log-order');
      base = true;
    } else if (/^Refunding (?:0|[1-9]\d*)(?:\.\d+)? SOL$/.test(log)) {
      if (roundId === null || zeroPath || base || refund || primary || motherlode) fail('checkpoint-log-order');
      refund = true;
    } else if (log === 'Pool round deployed total is zero; skipping pooled reward') {
      if (!base || zeroPath || refund || emptyPool || primary || motherlode) fail('checkpoint-log-order');
      emptyPool = true;
    } else fail('credit-path-unsupported');
  }
  if (roundId !== null) {
    const bytes = Buffer.alloc(8); bytes.writeBigUInt64LE(BigInt(roundId));
    const [round] = await getProgramDerivedAddress({programAddress:address(programAddress),seeds:['round',bytes]});
    if (round !== node.accounts[3]) fail('round-pda-mismatch');
  }
  return roundId === null ? null : {roundId,baseUnits:total.toString()};
}

/** Accepts getTransaction's JSON-RPC envelope or its result. Missing/ambiguous
 * evidence throws; it must never be treated as a zero by the history collector.
 */
export async function decodeMiningRewards(transaction, {
  miner, programAddress = GODL_PROGRAM_ADDRESS, sourceCommit = GODL_MINING_SOURCE_COMMIT,
} = {}) {
  if (programAddress !== GODL_PROGRAM_ADDRESS || sourceCommit !== GODL_MINING_SOURCE_COMMIT) fail('source-unsupported');
  address(miner);
  if (transaction?.error) fail('rpc-error');
  const result = transaction?.result ?? transaction;
  if (!result?.transaction?.message || !result.meta || result.meta.err !== null) fail('transaction-unavailable-or-failed');
  const nodes = trace(result), events = [];
  let total = 0n, checkpointCount = 0;
  for (const node of nodes) {
    // A caught CPI failure, or any failed ancestor, rolls back all its credits.
    let committed = true;
    for (let ancestor = node; ancestor; ancestor = ancestor.parent) {
      if (ancestor.outcome !== 'success') committed = false;
    }
    if (!committed || node.program !== programAddress) continue;
    if (node.data[0] !== 66) {
      if (node.accounts.includes(miner) && (!NON_MINING.has(node.data[0])
          || node.logs.some(log => REWARD.test(log)))) fail('credit-path-unsupported');
      continue;
    }
    if (node.accounts.length !== 10) fail('checkpoint-accounts-unsupported');
    if (node.accounts[2] !== miner) continue;
    checkpointCount++;
    const event = await checkpointCredit(node, programAddress);
    if (event) {
      events.push(event);
      total += BigInt(event.baseUnits);
      if (total > U64_MAX) fail('credit-overflow');
    }
  }
  return {status:'observed',events,checkpointCount,totalBaseUnits:total.toString(),sourceCommit};
}
