import assert from 'node:assert/strict';
import { getAddressDecoder } from '@solana/addresses';
import test from 'node:test';
import { GODL_PROGRAM_ADDRESS, GODL_SOURCE_COMMIT } from './chain.mjs';
import { MAINNET_GENESIS } from './monitor.mjs';
import { requireClosedState } from './ongoing-cost.mjs';

const decoder = getAddressDecoder();
const wallet = decoder.decode(Buffer.alloc(32, 7));
const address = byte => decoder.decode(Buffer.alloc(32, byte));

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
