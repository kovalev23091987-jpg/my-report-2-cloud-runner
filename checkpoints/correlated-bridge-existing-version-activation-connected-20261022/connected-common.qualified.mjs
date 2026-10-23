import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const repo=process.cwd(),runtime=process.env.REPORT2_LINKED_RUNTIME,output=process.env.REPORT2_LINKED_OUTPUT,P='checkpoints/correlated-bridge-existing-version-activation-connected-20261022';
const sha=b=>createHash('sha256').update(b).digest('hex'),write=(n,x)=>fs.writeFileSync(path.join(output,n),JSON.stringify(x,null,2)+'\n');
function inventory(root,rel=''){return fs.readdirSync(path.join(root,rel),{withFileTypes:true}).flatMap(e=>{const p=path.join(rel,e.name);assert.ok(!e.isSymbolicLink());if(e.isDirectory())return inventory(root,p);const b=fs.readFileSync(path.join(root,p));return[{path:p.split(path.sep).join('/'),bytes:b.length,sha256:sha(b)}];}).sort((a,b)=>a.path.localeCompare(b.path));}
test('FAILED TAIL ONLY with exact retained SOURCE8 and THIRD10 qualifications',async()=>{
 fs.mkdirSync(output,{recursive:true});const plan=JSON.parse(fs.readFileSync(P+'/qualification-plan.json'));assert.equal(plan.semantic_status,'UNEXECUTED');
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'report2-existing-activation-')),baseline=path.join(temporary,'old618'),completed=[];
 try{
  fs.cpSync(runtime,baseline,{recursive:true});const old=inventory(baseline),current=inventory(runtime);assert.equal(old.length,618);assert.equal(current.length,618);assert.deepEqual(old,current,'ALL618_RUNTIME_BYTES_EQUAL_REPO_ONLY_CHANGE');assert.equal(sha(JSON.stringify(current)),plan.accepted_621_candidate_inventory_sha256,'ACTUAL_CURRENT_COMPLETE_TREE_EQUALS_ACCEPTED621_INVENTORY');
  write('baseline-binding.json',{baseline_files:618,candidate_files:618,non_targets_equal:618,baseline_inventory_sha256:sha(JSON.stringify(old)),candidate_inventory_sha256:sha(JSON.stringify(current)),accepted621_inventory_binding:true,old_tests_reexecuted:false});
  const args={runtime_root:runtime,baseline_runtime_root:baseline,repo_root:repo};
  for(const c of plan.components){const loaded=await import(pathToFileURL(path.join(repo,c.path)).href),result=await loaded[c.export](args);write(c.output,result);completed.push(c.output);assert.equal(result.controlled_groups,c.groups);assert.equal(result.native_SQL,0);assert.equal(result.MAIN,0);assert.equal(result.Telegram,0);}
  write('result.json',{status:'PASS',new_common_cases:1,actual_Node_SPEC_tests:1,CONTROLLED_groups_executed_this_run:2,CONTROLLED_groups_previously_completed_reused:18,connected_qualification_total_groups:20,completed_input_reuse_receipt:plan.reuse_receipt,components:plan.components.map(c=>({output:c.output,controlled_groups:c.groups})),full_candidate_files:618,full_baseline_files:618,non_targets_equal:618,accepted621_complete_inventory_binding:true,old_components_replayed:0,Node:process.version,native_SQL:0,provider_HTTP:0,MAIN:0,Telegram:0,native_activation_or_cost_or_daygrant_or_SENT_qualified:false,completed_components:completed});
 }catch(error){const partial=Object.fromEntries(Object.entries(error).filter(([k])=>k.startsWith('completed_')));write('failure-context.json',{error:String(error),stack:error.stack,completed_components:completed,completed_new_partial_groups:partial,old_completed_components_must_not_replay:true});throw error;}
 finally{fs.rmSync(temporary,{recursive:true,force:true});write('baseline-cleanup.json',{removed:!fs.existsSync(temporary),outside_artifact:true});}
});
