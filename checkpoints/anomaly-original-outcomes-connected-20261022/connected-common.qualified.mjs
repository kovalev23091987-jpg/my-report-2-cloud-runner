import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const repo=process.cwd(),runtime=process.env.REPORT2_LINKED_RUNTIME,output=process.env.REPORT2_LINKED_OUTPUT,P='checkpoints/anomaly-original-outcomes-connected-20261022';
const sha=b=>createHash('sha256').update(b).digest('hex'),write=(n,x)=>fs.writeFileSync(path.join(output,n),JSON.stringify(x,null,2)+'\n');
function inventory(root,rel=''){return fs.readdirSync(path.join(root,rel),{withFileTypes:true}).flatMap(e=>{const p=path.join(rel,e.name);assert.ok(!e.isSymbolicLink());if(e.isDirectory())return inventory(root,p);const b=fs.readFileSync(path.join(root,p));return[{path:p.split(path.sep).join('/'),bytes:b.length,sha256:sha(b)}];}).sort((a,b)=>a.path.localeCompare(b.path));}
test('ONE FIRST complete original-event windows and factual outcome consumer',async()=>{
 fs.mkdirSync(output,{recursive:true});const plan=JSON.parse(fs.readFileSync(P+'/qualification-plan.json'));assert.equal(plan.semantic_status,'UNEXECUTED');
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'report2-original-outcomes-')),baseline=path.join(temporary,'current618'),completed=[];
 try{
  fs.cpSync(runtime,baseline,{recursive:true});const before=execFileSync('git',['show',plan.baseline_git_commit+':current-generation/files/src/anomaly-native-due-watch.mjs'],{cwd:repo,maxBuffer:2*1024*1024});assert.equal(sha(before),'224a90f1358c9b996bd78fdaecbd233f0be7b2e6fecf4a9fb56097d0270b9b74');fs.writeFileSync(path.join(baseline,'src/anomaly-native-due-watch.mjs'),before);
  const old=inventory(baseline),current=inventory(runtime),by=new Map(current.map(x=>[x.path,x]));assert.equal(old.length,618);assert.equal(current.length,618);for(const x of old)if(x.path!=='src/anomaly-native-due-watch.mjs')assert.deepEqual(x,by.get(x.path),'ALL617_NON_TARGET_BYTES_EQUAL');
  write('baseline-binding.json',{current_before_files:618,candidate_files:618,non_targets_equal:617,current_before_inventory_sha256:sha(JSON.stringify(old)),candidate_inventory_sha256:sha(JSON.stringify(current)),actual_complete_assembled_pair:true,old_tests_reexecuted:false});
  const args={runtime_root:path.join(runtime,'src'),baseline_runtime_root:path.join(baseline,'src'),repo_root:repo},outputs=[];
  for(const c of plan.components){
   const loaded=await import(pathToFileURL(path.join(repo,c.path)).href),result=await loaded[c.export](args);write(c.output,result);completed.push(c.output);
   assert.equal(result.controlled_groups,c.groups);assert.equal(result.native_SQL,0);assert.equal(result.MAIN,0);assert.equal(result.Telegram,0);outputs.push(result);
  }
  write('result.json',{status:'PASS',new_common_cases:1,actual_Node_SPEC_tests:1,CONTROLLED_groups:plan.components.reduce((n,c)=>n+c.groups,0),components:plan.components.map(c=>({output:c.output,controlled_groups:c.groups})),full_candidate_files:618,full_baseline_files:618,non_targets_equal:617,old_components_replayed:0,Node:process.version,native_SQL:0,provider_HTTP:0,MAIN:0,Telegram:0,native_policy:null,independent105_connected:false,native_epoch_firstknowledge_accuracy_SAVING_SENT_qualified:false,completed_components:completed});
 }catch(error){const partial=Object.fromEntries(Object.entries(error).filter(([k])=>k.startsWith('completed_')));write('failure-context.json',{error:String(error),stack:error.stack,completed_components:completed,completed_new_partial_groups:partial,old_completed_components_must_not_replay:true});throw error;}
 finally{fs.rmSync(temporary,{recursive:true,force:true});write('baseline-cleanup.json',{removed:!fs.existsSync(temporary),outside_artifact:true});}
});
