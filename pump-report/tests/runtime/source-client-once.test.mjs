import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {sourceFeasibilityOnce,SOURCE_CONTROL_URL} from '../../operator/source-feasibility-once.mjs';

test('private fixed client requires admission and writes a durable one-attempt guard before POST with no key export or retry',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pump-f550-controlled-client-')),file=n=>path.join(dir,n),hash=b=>createHash('sha256').update(b).digest('hex');let calls=0;
  const options={admission_file:file('admission.json'),artifact_file:file('artifact.json'),control_key_file:file('key'),attempt_file:file('attempt.json'),output_file:file('response.json'),clock:()=>100000,fetch_impl:async()=>{calls++;assert.equal(JSON.parse(await fs.readFile(file('attempt.json'),'utf8')).state,'ATTEMPTED_NON_REFUNDABLE');return new Response(JSON.stringify({result:{raw_responses:[],publication_allowed:false}}),{status:200});}};
  await fs.writeFile(options.admission_file,JSON.stringify({status:'PROPOSED'}));assert.equal((await sourceFeasibilityOnce(options)).network_attempts,0);await assert.rejects(sourceFeasibilityOnce({...options,execute:true}),/POSITIVE_SOURCE_OPERATION_ADMISSION_REQUIRED/);assert.equal(calls,0);
  const artifact={manifest:{implementation_pin:{sha256:'b'.repeat(64)}},modules:{'runtime/provider-policy.mjs':"export const PROVIDER_STAGE = 'SOURCE_FEASIBILITY_SINGLE';"}},artifactBytes=JSON.stringify(artifact);await fs.writeFile(options.artifact_file,artifactBytes);await fs.writeFile(options.control_key_file,'CONTROLLED_PRIVATE_KEY',{mode:0o600});
  await fs.writeFile(options.admission_file,JSON.stringify({schema:'PUMP_F550_SOURCE_SINGLE_ADMISSION_V1',status:'ADMITTED_NOT_SPENT',run_id:'pump-f550-source-feasibility-20261025-one',endpoint:SOURCE_CONTROL_URL,provider_attempts_max:3,additional_CONTROL_operations:1,expires_ts:200000,own_lease:{owner:'CODEX:ACTIVE105_SOURCE_RELIABILITY:100000',expires_ts:300000},owner_permission_sha256:'a'.repeat(64),authority_main:'c'.repeat(40),artifact_sha256:hash(artifactBytes),implementation_sha256:'b'.repeat(64)}));
  assert.equal((await sourceFeasibilityOnce(options)).network_attempts,0);const r=await sourceFeasibilityOnce({...options,execute:true});assert.equal(calls,1);assert.equal(r.network_attempts,1);const raw=await fs.readFile(options.output_file,'utf8');assert.equal(raw.includes('CONTROLLED_PRIVATE_KEY'),false);assert.equal(JSON.parse(raw).body.result.publication_allowed,false);assert.equal((await fs.stat(options.output_file)).mode&0o077,0);
  await assert.rejects(sourceFeasibilityOnce({...options,execute:true}),/ALREADY_ATTEMPTED/);assert.equal(calls,1);
});
