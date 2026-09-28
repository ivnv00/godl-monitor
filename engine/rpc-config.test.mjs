import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,chmod,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readRpcConfiguration,safeRpcError,PUBLIC_RPC} from './rpc-config.mjs';
test('optional private config preserves public fallback and supports an explicit test RPC',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'godl-rpc-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const file=join(dir,'rpc.json');assert.equal(await readRpcConfiguration(file),PUBLIC_RPC+'/');
 await writeFile(file,JSON.stringify({rpcUrl:'https://mainnet.helius-rpc.com/?api-key=SYNTHETIC_fixture_secret'}),{mode:0o600});
 assert.match(await readRpcConfiguration(file),/mainnet.helius-rpc.com/);
 assert.equal(await readRpcConfiguration(file,'http://127.0.0.1:1234'),'http://127.0.0.1:1234/');
 await chmod(file,0o644);await assert.rejects(readRpcConfiguration(file),{ failureCode: 'configuration' });
});
test('RPC diagnostics omit private endpoint and query credentials',()=>{
 const endpoint='https://mainnet.helius-rpc.com/?api-key=SYNTHETIC_fixture_secret';
 const message=safeRpcError(new Error('Cannot reach '+endpoint+' with SYNTHETIC_fixture_secret'),endpoint);
 assert.ok(!message.includes('SYNTHETIC_fixture_secret'));assert.ok(!message.includes('https://'));
});

test('RPC diagnostics never echo path keys, provider bodies, local paths or unknown errors', () => {
  const secret = 'SYNTHETIC_PATH_CREDENTIAL';
  const endpoint = 'https://rpc.invalid/v1/' + secret;
  for (const error of [new Error('Provider rejected token ' + secret),
    new Error('Missing /private/local/' + secret), new SyntaxError(secret), null]) {
    const output = safeRpcError(error, endpoint);
    assert.doesNotMatch(output, /SYNTHETIC_PATH_CREDENTIAL|rpc\.invalid|private\/local/);
    const failure = JSON.parse(output);
    assert.equal(failure.schemaVersion, 1);
    assert.equal(failure.kind, 'godl-runtime-failure');
  }
});
