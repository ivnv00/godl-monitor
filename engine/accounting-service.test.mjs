import assert from 'node:assert/strict';
import test from 'node:test';
import { readProgramDeployment } from './accounting-service.mjs';

test('validates upgradeable-loader metadata and preserves the deployment slot exactly', async () => {
  const publicKey = Buffer.alloc(32, 7);
  const program = Buffer.alloc(36);
  program.writeUInt32LE(2);
  publicKey.copy(program, 4);
  const programData = Buffer.alloc(45);
  programData.writeUInt32LE(3);
  programData.writeBigUInt64LE(9_007_199_254_740_993n, 4);
  let calls = 0;
  const fetchImpl = async (_url, options) => {
    const request = JSON.parse(options.body);
    calls += 1;
    const data = calls === 1 ? program : programData;
    return new Response(JSON.stringify({
      jsonrpc: '2.0',
      id: request.id,
      result: {
        context: { slot: 200 },
        value: {
          owner: 'BPFLoaderUpgradeab1e11111111111111111111111',
          executable: calls === 1,
          data: [data.toString('base64'), 'base64'],
        },
      },
    }), { status: 200 });
  };

  const deployment = await readProgramDeployment({
    rpcUrl: 'https://rpc.invalid',
    minContextSlot: '100',
    fetchImpl,
  });
  assert.equal(deployment.deployedAtSlot, '9007199254740993');
  assert.equal(calls, 2);
});
