import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { getAddressDecoder } from '@solana/addresses';
import test from 'node:test';
import { GODL_PROGRAM_ADDRESS, GODL_SOURCE_COMMIT } from './chain.mjs';
import { MAINNET_GENESIS } from './monitor.mjs';
import { extendClosedAccounting, requireClosedState } from './ongoing-cost.mjs';
import { accountingFixture } from './test-fixtures/accounting.mjs';
import { runtimeFailure } from './runtime-failure.mjs';

const decoder = getAddressDecoder();
const wallet = decoder.decode(Buffer.alloc(32, 7));
const address = byte => decoder.decode(Buffer.alloc(32, byte));
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function closedSnapshot() {
  return {
    wallet,
    genesisHash: MAINNET_GENESIS,
    commitment: 'finalized',
    programAddress: GODL_PROGRAM_ADDRESS,
    sourceCommit: GODL_SOURCE_COMMIT,
    observedAt: '2026-09-28T00:00:00.000Z',
    context: { slot: '9007199254740993' },
    accounts: {
      miner: {
        address: address(8),
        status: 'present',
        lamports: '1',
        value: {
          authority: wallet,
          rewardsSol: '0',
          rewardsGodl: '1',
          deployed: Array(25).fill('0'),
        },
      },
      minerExtended: { address: address(9), status: 'missing' },
      automation: { address: address(10), status: 'missing' },
      automationV2: { address: address(11), status: 'missing' },
    },
  };
}

test('accepts a synthetic settled snapshot and rejects active deployment funds', () => {
  assert.equal(requireClosedState(closedSnapshot()).rewardsGodl, '1');
  const active = closedSnapshot();
  active.accounts.miner.value.deployed[0] = '1';
  assert.throws(() => requireClosedState(active), /Waiting for automation funds/);
});

test('only the accounting network mismatch gets mainnet recovery guidance', () => {
  const wrongNetwork = closedSnapshot();
  wrongNetwork.genesisHash = 'SYNTHETIC_WRONG_NETWORK';
  assert.throws(() => requireClosedState(wrongNetwork), error => {
    const failure = runtimeFailure(error);
    assert.equal(failure.code, 'wrongNetwork');
    assert.match(failure.message, /Solana mainnet/);
    assert.doesNotMatch(JSON.stringify(failure), /SYNTHETIC_WRONG_NETWORK/);
    return true;
  });
  for (const field of ['commitment', 'programAddress', 'sourceCommit', 'observedAt']) {
    const invalid = closedSnapshot();
    invalid[field] = 'SYNTHETIC_INVALID_IDENTITY';
    assert.throws(() => requireClosedState(invalid), error => {
      assert.equal(error.message, 'Accounting snapshot identity mismatch');
      assert.equal(runtimeFailure(error).code, 'unexpected');
      return true;
    });
  }
  for (const genesisHash of [undefined, null, '']) {
    const invalid = { ...closedSnapshot(), genesisHash };
    assert.throws(() => requireClosedState(invalid), error => {
      assert.equal(error.message, 'Accounting snapshot identity mismatch');
      assert.equal(runtimeFailure(error).code, 'unexpected');
      return true;
    });
  }
});


test('active automations and unclaimed SOL cannot be treated as a closed zero-cost day', () => {
  for (const role of ['automation', 'automationV2']) {
    const active = closedSnapshot();
    active.accounts[role] = { ...active.accounts[role], status: 'present', lamports: '1', value: { authority: wallet } };
    assert.throws(() => requireClosedState(active), /Waiting for automation funds/);
  }
  const active = closedSnapshot();
  active.accounts.miner.value.rewardsSol = '1';
  assert.throws(() => requireClosedState(active), /Waiting for automation funds/);
});

test('extends a reviewed anchor with exact cumulative cash, fees, prices and hash links', async () => {
  const { anchor, interval, candles } = await accountingFixture();
  const next = extendClosedAccounting({ previous: anchor, interval, candles });

  assert.deepEqual(next.receipt.acquisitionPeriod, {
    ...anchor.receipt.acquisitionPeriod,
    throughAt: '2026-01-02T10:05:00.000Z',
    earnedGodl: '12.00000000000',
    grossOutSol: '0.130010000',
    returnedSol: '0.000000000',
    ownerNetworkFeesSol: '0.000010000',
    newRentSol: '0.000000000',
    netSpendSol: '0.130010000',
    netCostPerGodlSol: '0.010834166667',
    netSpendUsd: '13.001000',
    netCostPerGodlUsd: '1.08341667',
  });
  assert.equal(next.receipt.evidence.closingSlot, '30');
  assert.equal(next.receipt.evidence.netUsdLamportMicro, '13001000000000000');
  assert.equal(next.receipt.evidence.extensionCount, 1);
  assert.equal(next.receipt.evidence.previousReceiptSha256, digest(anchor.receipt));
  assert.equal(next.receipt.evidence.reviewedAnchorReceiptSha256,
    next.receipt.evidence.previousReceiptSha256);
  assert.deepEqual(next.receipt.evidence.lastInterval, {
    fromExclusiveSlot: '20', toInclusiveSlot: '30',
    includedSignatures: ['3'.repeat(88)], excludedUnrelatedSignatures: [],
    excludedFailedNonOwnerTransactions: 0,
  });
});

test('rejects incomplete coverage, duplicate transactions and malformed prior receipts', async () => {
  const cases = [
    [/Signature coverage does not reach/, fixture => { fixture.interval.pages.wallet.exhausted = false; }],
    [/Missing or inconsistent interval transaction/, fixture => {
      fixture.interval.transactions.push(structuredClone(fixture.interval.transactions[0]));
    }],
    [/Inconsistent receipt SOL accounting/, fixture => {
      fixture.anchor.receipt.acquisitionPeriod.netSpendSol = '0.100006000';
    }],
    [/Interval transaction coverage incomplete/, fixture => { fixture.interval.transactions = []; }],
    [/Historical price coverage incomplete/, fixture => { fixture.candles = []; }],
  ];
  for (const [expected, mutate] of cases) {
    const fixture = await accountingFixture();
    mutate(fixture);
    assert.throws(() => extendClosedAccounting({ previous: fixture.anchor,
      interval: fixture.interval, candles: fixture.candles }), expected);
  }
});

test('rejects wrong ownership, fee attribution, claims and account continuity', async () => {
  const cases = [
    [/Accounting address mismatch/, fixture => { fixture.interval.trackedAccounts.miner = fixture.wallet; }],
    [/Interval fee payer mismatch/, fixture => {
      fixture.interval.transactions[0].ownerPaidNetworkFeeLamports = '0';
    }],
    [/Owned account authority mismatch/, fixture => {
      fixture.interval.closing.wallet = fixture.trackedAccounts.miner;
    }],
    [/GODL claim or principal decrease/, fixture => {
      fixture.interval.closing.accounts.miner.value.lastClaimGodlAt = '1767340801';
    }],
    [/Owned account continuity gap/, fixture => {
      const delta = fixture.interval.transactions[0].deltas.miner;
      delta.beforeLamports = '11';
      delta.afterLamports = '11';
    }],
  ];
  for (const [expected, mutate] of cases) {
    const fixture = await accountingFixture();
    mutate(fixture);
    assert.throws(() => extendClosedAccounting({ previous: fixture.anchor,
      interval: fixture.interval, candles: fixture.candles }), expected);
  }
});
