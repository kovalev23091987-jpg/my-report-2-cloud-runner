import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const repo=process.cwd(),runtime=process.env.REPORT2_LINKED_RUNTIME,output=process.env.REPORT2_LINKED_OUTPUT,P='checkpoints/anomaly-due-and-recovery-connected-20261022';
const sha=b=>createHash('sha256').update(b).digest('hex'),write=(n,x)=>fs.writeFileSync(path.join(output,n),JSON.stringify(x,null,2)+'\n');
function inventory(root,rel=''){return fs.readdirSync(path.join(root,rel),{withFileTypes:true}).flatMap(e=>{const p=path.join(rel,e.name);assert.ok(!e.isSymbolicLink());if(e.isDirectory())return inventory(root,p);const b=fs.readFileSync(path.join(root,p));return[{path:p.split(path.sep).join('/'),bytes:b.length,sha256:sha(b)}];}).sort((a,b)=>a.path.localeCompare(b.path));}
test('ONE FIRST due queue, captured watch consumer and returned-data purity',async()=>{
 fs.mkdirSync(output,{recursive:true});const plan=JSON.parse(fs.readFileSync(P+'/qualification-plan.json'));assert.equal(plan.semantic_status,'UNEXECUTED');
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'report2-due-getter-')),baseline=path.join(temporary,'source618'),globalBefore=path.join(temporary,'current617'),getterBefore=path.join(temporary,'getter618'),completed=[];
 try{
  const gitFile=p=>execFileSync('git',['show',plan.baseline_git_commit+':'+p],{cwd:repo,maxBuffer:2*1024*1024});
  const oldRunner=gitFile('current-generation/files/runner-main.mjs');assert.equal(sha(oldRunner),'c72f8f26850089c0dc8a8514abad257afa80c3699af79427ec0f2fb77c0eb4ac');
  fs.cpSync(runtime,baseline,{recursive:true});fs.writeFileSync(path.join(baseline,'runner-main.mjs'),oldRunner);
  fs.cpSync(baseline,globalBefore,{recursive:true});fs.writeFileSync(path.join(globalBefore,'src/worker.js'),gitFile('current-generation/files/src/worker.js'));fs.unlinkSync(path.join(globalBefore,'src/anomaly-native-due-watch.mjs'));
  fs.cpSync(runtime,getterBefore,{recursive:true});const intermediate=fs.readFileSync(P+'/runner-before-getter.mjs');assert.equal(sha(intermediate),'2bacab5bc4cd7dbdf6a8906455ff35be82e387195859ae3936dc22a9336ae737');fs.writeFileSync(path.join(getterBefore,'runner-main.mjs'),intermediate);
  const old=inventory(globalBefore),staged=inventory(baseline),current=inventory(runtime),getter=inventory(getterBefore);assert.equal(old.length,617);assert.equal(staged.length,618);assert.equal(current.length,618);assert.equal(getter.length,618);
  const currentMap=new Map(current.map(x=>[x.path,x]));for(const x of old)if(!['runner-main.mjs','src/worker.js'].includes(x.path))assert.deepEqual(x,currentMap.get(x.path),'ALL615_NON_TARGET_CURRENT_BASELINE_BYTES_EQUAL');
  write('baseline-binding.json',{current_before_files:617,candidate_files:618,source_and_getter_baselines_files:618,source_non_runner_equal:617,global_non_targets_equal:615,current_before_inventory_sha256:sha(JSON.stringify(old)),candidate_inventory_sha256:sha(JSON.stringify(current)),inventories_bound_to_actual_assembled_tree:true,old_tests_reexecuted:false});
  const args={runtime_root:path.join(runtime,'src'),baseline_runtime_root:path.join(baseline,'src'),repo_root:repo};
  const source=await import(pathToFileURL(path.join(repo,P,'source-bound/connected.mjs')).href);const parent=await source.runAnomalyDueParentConnected(args);write('due-parent-component.json',parent);completed.push('due-parent-component.json');assert.equal(parent.controlled_groups,12);assert.equal(parent.native_SQL,0);assert.equal(parent.old_components_imported_or_replayed,0);
  const third=await import(pathToFileURL(path.join(repo,P,'third-bound/connected.mjs')).href);const consumer=await third.runDueWatchConsumerConnected(args);write('due-consumer-component.json',consumer);completed.push('due-consumer-component.json');assert.equal(consumer.controlled_groups,9);assert.equal(consumer.nested_variants,22);assert.equal(consumer.native_SQL,0);assert.equal(consumer.old_components_replayed,0);
  const delta=await import(pathToFileURL(path.join(repo,plan.getter_case.path)).href);const purity=await delta[plan.getter_case.export]({...args,baseline_runtime_root:path.join(getterBefore,'src')});write('getter-purity-component.json',purity);completed.push('getter-purity-component.json');assert.equal(purity.controlled_groups,plan.getter_case.groups);
  write('result.json',{status:'PASS',new_common_cases:1,actual_Node_SPEC_tests:1,CONTROLLED_groups:21+plan.getter_case.groups,source_groups:12,consumer_groups:9,consumer_nested_variants:22,getter_groups:plan.getter_case.groups,actual_RemoteD1_into_LocalSQLite:true,full_candidate_files:618,full_current_baseline_files:617,old_components_replayed:0,Node:process.version,native_SQL:0,provider_HTTP:0,MAIN:0,Telegram:0,native_policy:null,independent105_connected:false,native_epoch_firstknowledge_saving_SENT_qualified:false,completed_components:completed});
 }catch(error){write('failure-context.json',{error:String(error),stack:error.stack,completed_components:completed,completed_due_parent_groups:error.completed_new_due_parent_groups??null,completed_due_consumer_groups:error.completed_new_due_consumer_groups??null,completed_getter_groups:error.completed_new_callback_purity_groups??null,old_completed_components_must_not_replay:true});throw error;}
 finally{fs.rmSync(temporary,{recursive:true,force:true});write('baseline-cleanup.json',{removed:!fs.existsSync(temporary),outside_artifact:true});}
});
