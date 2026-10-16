import test from 'node:test';
import assert from 'node:assert/strict';
import { address, getAddressDecoder, getProgramDerivedAddress } from '@solana/addresses';
import { GODL_PROGRAM_ADDRESS as PROGRAM } from './chain.mjs';
import { decodeMiningRewards, exactLogAmount } from './mining-rewards.mjs';

const key = n => getAddressDecoder().decode(new Uint8Array(32).fill(n));
const MINER = key(8), OTHER = key(9), WRAPPER = key(10), CHILD = key(11);
const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function encoded(bytes) {
  let n = BigInt(`0x${Buffer.from(bytes).toString('hex') || '0'}`), result = '';
  while (n) { result = alphabet[Number(n % 58n)] + result; n /= 58n; }
  return '1'.repeat(bytes.findIndex(x => x !== 0) < 0 ? bytes.length : bytes.findIndex(x => x !== 0)) + result;
}
async function roundAddress(id) {
  const bytes = Buffer.alloc(8); bytes.writeBigUInt64LE(BigInt(id));
  return (await getProgramDerivedAddress({ programAddress: address(PROGRAM), seeds: ['round', bytes] }))[0];
}
async function fixture({ variants = ['Split rewards: 0.00000000123 GODL'], roundId = '42', miner = MINER } = {}) {
  const keys = [PROGRAM, ...Array.from({length:10}, (_, i) => key(i + 20))];
  keys[3] = miner; keys[4] = await roundAddress(roundId);
  return { jsonrpc:'2.0', id:1, result:{ version:'legacy', slot:'123',
    transaction:{ signatures:['synthetic-signature'], message:{ accountKeys:keys,
      instructions:[{programIdIndex:0,accounts:Array.from({length:10},(_,i)=>i+1),data:encoded([66])}] } },
    meta:{err:null,innerInstructions:[],logMessages:[`Program ${PROGRAM} invoke [1]`,
      `Program log: Round ID: ${roundId}`, ...(variants.length ? ['Program log: Base rewards: 0.1 SOL'] : []), ...variants.map(x => `Program log: ${x}`), `Program ${PROGRAM} success`]}}};
}
const decode = tx => decodeMiningRewards(tx, {miner:MINER});

test('inverts emitted f64 amounts only when their full u64 preimage is unique', () => {
  for (const [text, units] of [['0','0'],['0.00000000001','1'],['0.00000000123','123'],['1.23456789012','123456789012']]) {
    assert.equal(exactLogAmount(text), BigInt(units));
  }
  for (const text of ['90071.99254740992','10000000','184467440.73709552','0.000000000001','NaN','inf','-1','1 GODL','']) {
    assert.throws(() => exactLogAmount(text));
  }
});

test('recovers each exclusive reward variant plus motherlode using integer addition', async () => {
  for (const variant of ['Split rewards','Pool share','Top miner rewards']) {
    const tx = await fixture({variants:[`${variant}: 0.00000000123 GODL`,'Motherlode rewards: 0.00000000007 GODL']});
    const result = await decode(tx);
    assert.equal(result.totalBaseUnits, '130');
    assert.deepEqual(result.events.map(({roundId,baseUnits})=>({roundId,baseUnits})),[{roundId:'42',baseUnits:'130'}]);
  }
  assert.equal((await decode(await fixture({variants:['Motherlode rewards: 0.00000000007 GODL']}))).totalBaseUnits,'7');
});

test('accepts source-proven zero paths and excludes other miners', async () => {
  for (const lines of [[],['Round account is empty'],['Round ID: 42'],['Round ID: 42','Round not valid'],['Round ID: 42','Round expired']]) {
    const tx = await fixture(); tx.result.meta.logMessages = [`Program ${PROGRAM} invoke [1]`,...lines.map(x=>`Program log: ${x}`),`Program ${PROGRAM} success`];
    const result = await decode(tx);
    assert.equal(result.totalBaseUnits, '0');
    assert.equal(result.checkpointCount, 1);
  }
  assert.equal((await decode(await fixture({miner:OTHER}))).totalBaseUnits,'0');
});

test('binds the target round PDA, rejects unsupported source and malformed credit paths', async () => {
  const changes = [
    tx => {tx.result.transaction.message.accountKeys[4]=key(19);},
    tx => {tx.result.transaction.message.instructions[0].accounts.pop();},
    tx => {tx.result.transaction.message.instructions[0].data=encoded([34]);},
    tx => {tx.result.meta.logMessages.splice(1,1);},
    tx => {tx.result.meta.logMessages.splice(2,0,'Program log: Round ID: 42');},
    tx => {tx.result.meta.logMessages.splice(2,0,'Program log: Pool share: 0.00000000001 GODL');},
    tx => {tx.result.meta.logMessages.splice(2,0,'Program log: Round expired');},
    tx => {tx.result.meta.logMessages.splice(3,0,'Program log: Motherlode rewards: 0 GODL','Program log: Motherlode rewards: 0 GODL');},
    tx => {tx.result.meta.logMessages[3]='Program log: Split rewards: 90071.99254740992 GODL';},
    tx => {tx.result.meta.logMessages[3]='Program log: Unknown rewards: 1 GODL';},
  ];
  for (const change of changes) {const tx=await fixture();change(tx);await assert.rejects(decode(tx));}
  await assert.rejects(decodeMiningRewards(await fixture(),{miner:MINER,sourceCommit:'unverified'}));
});

test('rejects missing, truncated, unbalanced, unmatched or failed transaction evidence', async () => {
  const changes = [
    tx => {tx.result.meta.logMessages=null;},
    tx => {tx.result.meta.logMessages.pop();},
    tx => {tx.result.meta.logMessages.push('Log truncated');},
    tx => {tx.result.meta.logMessages[0]=`Program ${PROGRAM} invoke [2]`;},
    tx => {tx.result.meta.logMessages[tx.result.meta.logMessages.length-1]=`Program ${CHILD} success`;},
    tx => {tx.result.meta.logMessages[tx.result.meta.logMessages.length-1]=`Program ${PROGRAM} failed: synthetic`;},
    tx => {tx.result.meta.logMessages.unshift(`Program ${CHILD} invoke [1]`);},
    tx => {tx.result.meta.innerInstructions=null;},
    tx => {tx.result.meta.innerInstructions=[{index:0,instructions:[]},{index:0,instructions:[]}];},
    tx => {tx.result.transaction.message.instructions[0].accounts[2]=-1;},
    tx => {tx.result.meta.innerInstructions=[{index:0,instructions:[{programIdIndex:0,accounts:[],data:'1'}]}];},
    tx => {tx.result.meta.err={InstructionError:[0,'error']};},
  ];
  for (const change of changes) {const tx=await fixture();change(tx);await assert.rejects(decode(tx));}
});

async function nested({failedCheckpoint=false, failedAncestor=false, spoofChild=false}={}) {
  const tx=await fixture(), result=tx.result, message=result.transaction.message;
  const checkpoint=message.instructions[0];
  const w=message.accountKeys.push(WRAPPER)-1, c=message.accountKeys.push(CHILD)-1;
  message.instructions=[{programIdIndex:w,accounts:[],data:'1'}];
  result.meta.innerInstructions=[{index:0,instructions:[{...checkpoint,stackHeight:2},
    ...(spoofChild?[{programIdIndex:c,accounts:[],data:'1',stackHeight:3}]:[])]}];
  const rewards=['Program log: Round ID: 42','Program log: Base rewards: 0.1 SOL','Program log: Split rewards: 0.00000000123 GODL'];
  result.meta.logMessages=[`Program ${WRAPPER} invoke [1]`,`Program ${PROGRAM} invoke [2]`,
    ...(spoofChild?[`Program ${CHILD} invoke [3]`,...rewards,`Program ${CHILD} success`]:rewards),
    `Program ${PROGRAM} ${failedCheckpoint?'failed: synthetic':'success'}`,`Program ${WRAPPER} ${failedAncestor?'failed: synthetic':'success'}`];
  if(failedAncestor){
    const out=message.accountKeys.push(key(12))-1;
    message.instructions=[{programIdIndex:out,accounts:[],data:'1'}];
    result.meta.innerInstructions[0].instructions=[{programIdIndex:w,accounts:[],data:'1',stackHeight:2},
      ...result.meta.innerInstructions[0].instructions.map(ix=>({...ix,stackHeight:ix.stackHeight+1}))];
    result.meta.logMessages=[`Program ${message.accountKeys[out]} invoke [1]`,
      ...result.meta.logMessages.map(line=>line.replace('invoke [1]','invoke [2]').replace('invoke [2]', 'invoke [3]')),
      `Program ${message.accountKeys[out]} success`];
    result.meta.logMessages[1]=`Program ${WRAPPER} invoke [2]`;
  }
  return tx;
}

test('requires checkpoint and all ancestors to succeed; child logs cannot impersonate rewards',async()=>{
  assert.equal((await decode(await nested())).totalBaseUnits,'123');
  assert.equal((await decode(await nested({failedCheckpoint:true}))).totalBaseUnits,'0');
  assert.equal((await decode(await nested({failedAncestor:true}))).totalBaseUnits,'0');
  assert.equal((await decode(await nested({spoofChild:true}))).totalBaseUnits,'0');
  const wrongDepth=await nested();wrongDepth.result.meta.innerInstructions[0].instructions[0].stackHeight=3;
  await assert.rejects(decode(wrongDepth));
});

test('aligns multiple checkpoints and versioned loaded addresses',async()=>{
  const tx=await fixture(), result=tx.result, message=result.transaction.message;
  message.instructions.push(structuredClone(message.instructions[0]));
  result.meta.logMessages.push(...result.meta.logMessages);
  assert.equal((await decode(tx)).totalBaseUnits,'246');
  result.version=0;
  const loaded=message.accountKeys.splice(3);
  result.meta.loadedAddresses={writable:loaded.slice(0,3),readonly:loaded.slice(3)};
  assert.equal((await decode(tx)).totalBaseUnits,'246');
  [result.meta.loadedAddresses.writable[1],result.meta.loadedAddresses.writable[2]] =
    [result.meta.loadedAddresses.writable[2],result.meta.loadedAddresses.writable[1]];
  await assert.rejects(decode(tx));
});


test('admits only verified non-mining routes when the target miner is present',async()=>{
  for(const code of [27,37,51,64,68,41,49]) {
    const tx=await fixture(); tx.result.transaction.message.instructions[0].data=encoded([code]);
    tx.result.meta.logMessages=[`Program ${PROGRAM} invoke [1]`,`Program ${PROGRAM} success`];
    assert.equal((await decode(tx)).totalBaseUnits,'0');
  }
  for(const code of [34,0,70,255]) {
    const tx=await fixture(); tx.result.transaction.message.instructions[0].data=encoded([code]);
    tx.result.meta.logMessages=[`Program ${PROGRAM} invoke [1]`,`Program ${PROGRAM} success`];
    await assert.rejects(decode(tx));
  }
  const other=await fixture({miner:OTHER});
  other.result.transaction.message.instructions[0].data=encoded([255]);
  assert.equal((await decode(other)).totalBaseUnits,'0');
});

test('aligns known non-logging compute budget instructions without relaxing log evidence',async()=>{
  const tx=await fixture(), m=tx.result.transaction.message;
  const ci=m.accountKeys.push('ComputeBudget111111111111111111111111111111')-1;
  m.instructions.unshift({programIdIndex:ci,accounts:[],data:encoded([2,1,0,0,0])});
  assert.equal((await decode(tx)).totalBaseUnits,'123');
  m.instructions[0].data='1';
  await assert.rejects(decode(tx));
});


test('rejects incomplete or impossible checkpoint log paths',async()=>{
  for(const logs of [
    ['Base rewards: 0.1 SOL'],
    ['Refunding 0 SOL'],
    ['Round account is empty','Round ID: 42'],
    ['Round ID: 42','Round expired','Base rewards: 0.1 SOL'],
    ['Round ID: 42','Split rewards: 0.00000000123 GODL'],
    ['Round ID: 42','Base rewards: 0.1 SOL','Refunding 0 SOL'],
    ['Round ID: 42','a new unsupported credit log'],
  ]) {
    const tx=await fixture();tx.result.meta.logMessages=[`Program ${PROGRAM} invoke [1]`,
      ...logs.map(x=>`Program log: ${x}`),`Program ${PROGRAM} success`];
    await assert.rejects(decode(tx));
  }
  for(const logs of [
    ['Round ID: 42','Refunding 0 SOL'],
    ['Round ID: 42','Base rewards: 0.1 SOL','Pool round deployed total is zero; skipping pooled reward'],
    ['Round ID: 42','Base rewards: 0.1 SOL','Split rewards: 0 GODL'],
  ]) {
    const tx=await fixture();tx.result.meta.logMessages=[`Program ${PROGRAM} invoke [1]`,
      ...logs.map(x=>`Program log: ${x}`),`Program ${PROGRAM} success`];
    assert.equal((await decode(tx)).totalBaseUnits,'0');
  }
});

test('aligns logged compute budget invocations before multiple GODL instructions', async () => {
  const tx = await fixture(), message = tx.result.transaction.message;
  const program = 'ComputeBudget111111111111111111111111111111';
  const compute = message.accountKeys.push(program) - 1;
  message.instructions.unshift(
    {programIdIndex:compute, accounts:[], data:encoded([2,1,0,0,0])},
    {programIdIndex:compute, accounts:[], data:encoded([3,1,0,0,0,0,0,0,0])});
  message.instructions.push({...structuredClone(message.instructions[2]), data:encoded([27])});
  tx.result.meta.logMessages.unshift(`Program ${program} invoke [1]`, `Program ${program} success`,
    `Program ${program} invoke [1]`, `Program ${program} success`);
  tx.result.meta.logMessages.push(`Program ${PROGRAM} invoke [1]`, `Program ${PROGRAM} success`);
  const result = await decode(tx);
  assert.equal(result.totalBaseUnits, '123');
  assert.equal(result.checkpointCount, 1);
});
