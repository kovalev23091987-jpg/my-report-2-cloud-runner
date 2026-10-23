import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const repo=process.cwd(),runtime=process.env.REPORT2_LINKED_RUNTIME,output=process.env.REPORT2_LINKED_OUTPUT;
const prefix='checkpoints/catalog-failure-carrier-connected-20261021',source='checkpoints/source-worker-unresolved-catalog-carrier-20261021',sha=x=>createHash('sha256').update(x).digest('hex'),write=(name,value)=>fs.writeFileSync(path.join(output,name),JSON.stringify(value,null,2)+'\n');
const files=(root,rel='')=>fs.readdirSync(path.join(root,rel),{withFileTypes:true}).flatMap(x=>x.isDirectory()?files(root,path.join(rel,x.name)):[path.join(rel,x.name)]).sort();
test('ONE NEW complete public parsed catalog carrier through existing partial-failure exporter',async()=>{
 assert.ok(runtime&&output);fs.mkdirSync(output,{recursive:true});
 const pins=JSON.parse(fs.readFileSync(path.join(repo,source,'target-bindings.json'))),temp=fs.mkdtempSync(path.join(os.tmpdir(),'report2-catalog-carrier-')),baseline=path.join(temp,'runtime-baseline');
 const originalFetch=globalThis.fetch;globalThis.fetch=()=>{throw Error('NO_REAL_NATIVE_PROVIDER_MAIN_OR_TELEGRAM_NETWORK');};let returned=null;
 try{
  fs.cpSync(runtime,baseline,{recursive:true});
  const name='src/'+pins.runtime_helper,before=fs.readFileSync(path.join(repo,source,'scope.before.mjs'));assert.equal(sha(before),pins.before_sha256);assert.equal(sha(fs.readFileSync(path.join(runtime,name))),pins.after_sha256);fs.writeFileSync(path.join(baseline,name),before);
  const names=files(runtime);assert.deepEqual(files(baseline),names);const same={};
  for(const f of names){const old=sha(fs.readFileSync(path.join(baseline,f))),next=sha(fs.readFileSync(path.join(runtime,f)));if(f===name){assert.equal(old,pins.before_sha256);assert.equal(next,pins.after_sha256);}else{assert.equal(old,next,f);same[f]=next;}}
  write('baseline-binding.json',{actual_full_assembled_runtime:true,baseline_location:'UNIQUE_OS_TEMP_OUTSIDE_ARTIFACT',only_changed:name,before_sha256:pins.before_sha256,after_sha256:pins.after_sha256,other_files:same});
  const component=await import(pathToFileURL(path.join(repo,source,'catalog-carrier-connected.mjs')).href);
  const result=await component.runUnresolvedCatalogCarrierConnected({runtime_root:path.join(runtime,'src'),baseline_runtime_root:path.join(baseline,'src'),repo_root:repo});
  returned='catalog-result.json';write(returned,result);
  assert.equal(result.status,'CONTROLLED_COMPONENT_COMPLETED');assert.equal(result.control_count,12);assert.equal(result.new_SQL,0);assert.equal(result.provider_HTTP,0);assert.equal(result.native_SQL,0);assert.equal(result.Telegram,0);assert.equal(result.old_scope_outputs_and_gates_unchanged,true);assert.equal(result.old_accepted_cases_replayed,false);assert.equal(result.existing_response395674_recovered,false);
  write('result.json',{status:'PASS',new_common_cases:1,CONTROLLED_groups:12,Node_version:process.version,old_588_components_replayed:0,old_accepted_semantic_reexecution:0,native_SQL:0,provider_HTTP:0,MAIN:0,Telegram:0,today395674_original_recovered:false,scope_refusal_or_Telegram_cause_fixed:false});
 }catch(error){write('failure-context.json',{returned_component_artifact:returned,error:String(error),stack:error.stack,completed_new_control_groups:error.completed_new_control_groups??null});throw error;}
 finally{globalThis.fetch=originalFetch;fs.rmSync(temp,{recursive:true,force:true});write('baseline-cleanup.json',{removed:!fs.existsSync(temp),outside_artifact:true});}
});
