import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {writeFileSync} from 'node:fs';import {createHash} from 'node:crypto';import {join,resolve} from 'node:path';import {pathToFileURL} from 'node:url';
const P='checkpoints/bingx-primary-producer-connected-20261024',OUT='audit-output/bingx-primary-producer-connected',sha=b=>createHash('sha256').update(b).digest('hex');
test('ONLY seven unstarted Root Deep variants on the real assembled Worker; prior97 never replayed',async()=>{
 const root=process.cwd(),runtime=resolve('runtime'),progress={schema:'ACTUAL_BINGX_REMAINING_ONLY_V1',prior_completed_run:40122401713,prior_completed_groups:6,prior_completed_variants:97,remaining_completed_groups:0,remaining_completed_variants:0,old_components_replayed:0,provider_HTTP:0,native_SQL:0,CF:0,MAIN:0,Telegram:0,stage:'PREIMPORT'};let serial=0;const fetchBefore=globalThis.fetch;
 const save=(name,value)=>writeFileSync(join(OUT,String(++serial).padStart(3,'0')+'-remaining-'+name.replace(/[^\w.-]/g,'_').slice(0,100)+'.json'),JSON.stringify(value,null,2)+'\n');const state=()=>writeFileSync(join(OUT,'remaining-common-result.json'),JSON.stringify(progress,null,2)+'\n');
 const inventory=async()=>{const rows=[];const walk=async d=>{for(const e of await fs.readdir(d,{withFileTypes:true})){if(e.name==='node_modules')continue;const p=join(d,e.name);if(e.isDirectory())await walk(p);else{const b=await fs.readFile(p);rows.push({path:p.slice(runtime.length+1),bytes:b.length,sha256:sha(b)});}}};await walk(runtime);return rows.sort((a,b)=>a.path.localeCompare(b.path));};
 try{
  state();const before=await inventory();save('ACTUAL_FULL_ASSEMBLED_BEFORE',before);progress.actual_full_assembled_files=before.length;
  const targets=JSON.parse(await fs.readFile(P+'/runtime-targets.json'));for(const [p,pin]of Object.entries(targets.targets)){const rel=p.replace('current-generation/files/',''),b=await fs.readFile(join(runtime,rel));assert.equal(b.length,pin.bytes,p);assert.equal(sha(b),pin.sha256,p);}
  const originalInputs=JSON.parse(await fs.readFile(P+'/remaining-input-pins.json'));for(const[p,pin]of Object.entries(originalInputs.files)){const b=await fs.readFile(p);assert.equal(b.length,pin.bytes,p);assert.equal(sha(b),pin.sha256,p);}
  progress.input_pins=Object.keys(originalInputs.files).length;progress.stage='ONLY_ROOT_DEEP7';state();globalThis.fetch=async()=>{throw Error('NATIVE_NETWORK_FORBIDDEN');};
  const m=await import(pathToFileURL(join(root,P,'deep-boundary-case.proposed.mjs')).href);let result;
  try{result=await m.runBingxDeepBoundaryCase({repo_root:root,runtime_root:runtime,save_result:(n,v)=>save(n,v)});}catch(error){save('PARTIAL',{message:error.message,stack:error.stack,partial_result:error.partial_result??null});throw error;}
  save('RETURNED',result);progress.remaining_completed_groups=result.groups;progress.remaining_completed_variants=result.variants;state();assert.equal(result.groups,1);assert.equal(result.variants,7);
  const after=await inventory();save('ACTUAL_FULL_ASSEMBLED_AFTER',after);assert.deepEqual(after,before);progress.full_assembled_before_after_equal=true;progress.stage='REMAINING7_CONTROLLED_COMPLETE';state();
 }catch(error){progress.error={message:error.message,stack:error.stack};throw error;}finally{globalThis.fetch=fetchBefore;state();}
});
