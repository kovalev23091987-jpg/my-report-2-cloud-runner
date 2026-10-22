import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const repo=process.cwd(),runtime=process.env.REPORT2_LINKED_RUNTIME,output=process.env.REPORT2_LINKED_OUTPUT,P='checkpoints/anomaly-initial-ingress-connected-20261021';
const sha=b=>createHash('sha256').update(b).digest('hex'),write=(n,x)=>fs.writeFileSync(path.join(output,n),JSON.stringify(x,null,2)+'\n');
function inventory(root,relative=''){return fs.readdirSync(path.join(root,relative),{withFileTypes:true}).flatMap(e=>{const p=path.join(relative,e.name);assert.ok(!e.isSymbolicLink());if(e.isDirectory())return inventory(root,p);const b=fs.readFileSync(path.join(root,p));return[{path:p.split(path.sep).join('/'),bytes:b.length,sha256:sha(b)}];}).sort((a,b)=>a.path.localeCompare(b.path));}
test('ONE FIRST linked anomaly ingress and current-parent capability',async()=>{
 fs.mkdirSync(output,{recursive:true});const plan=JSON.parse(fs.readFileSync(P+'/qualification-plan.json'));assert.equal(plan.semantic_status,'UNEXECUTED');
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'report2-linked-anomaly-')),baseline=path.join(temporary,'staged617'),globalBefore=path.join(temporary,'current615');const completed=[];
 try{
  fs.cpSync(runtime,baseline,{recursive:true});const gitFile=p=>execFileSync('git',['show',plan.baseline_git_commit+':'+p],{cwd:repo,maxBuffer:2*1024*1024});
  const oldRunner=gitFile('current-generation/files/runner-main.mjs');assert.equal(sha(oldRunner),'480faff4a63cfc8a9a5aecb90b9beabf28b28fd8c954517f5a8b79850f06be57');fs.writeFileSync(path.join(baseline,'runner-main.mjs'),oldRunner);
  fs.cpSync(baseline,globalBefore,{recursive:true});for(const p of ['src/worker.js','src/anomaly-native-domain.mjs'])fs.writeFileSync(path.join(globalBefore,p),gitFile('current-generation/files/'+p));
  for(const p of ['src/anomaly-native-ingress.mjs','src/anomaly-record-observer.mjs'])fs.unlinkSync(path.join(globalBefore,p));
  const old=inventory(globalBefore),staged=inventory(baseline),current=inventory(runtime);assert.equal(old.length,615);assert.equal(staged.length,617);assert.equal(current.length,617);
  const digest=sha(JSON.stringify(old));write('global-baseline-binding.json',{current_before_files:615,candidate_files:617,source_component_staged_baseline_files:617,source_baseline_is_not_deployed615:true,current_before_inventory_sha256:digest,accepted603_actual_current615_inventory_sha256:plan.accepted_current615_inventory_sha256,accepted_tests_reexecuted:false});assert.equal(digest,plan.accepted_current615_inventory_sha256,'RECONSTRUCTED_CURRENT615_MUST_MATCH_SAVED_ACTUAL603_BYTES');
  const args={runtime_root:path.join(runtime,'src'),baseline_runtime_root:path.join(baseline,'src'),repo_root:repo};
  const source=await import(pathToFileURL(path.join(repo,P,'source-connected.central.mjs')).href);const parent=await source.runAnomalyParentAdmissionConnected(args);write('parent-component.json',parent);completed.push('parent-component.json');assert.equal(parent.controlled_groups,12);assert.equal(parent.native_SQL,0);assert.equal(parent.old_component_replay,false);
  const witness=source.getRootArtifactWitness();assert.ok(witness);const receipt=fs.readFileSync(path.join(repo,'report2-anomaly-domain-receipts.json'));assert.equal(sha(receipt),witness.sha256);assert.ok(receipt.length<=20480);fs.writeFileSync(path.join(output,'actual-receipt-consumer.json'),receipt);write('receipt-consumer-proof.json',{actual_fs_write_and_readback:true,bytes:receipt.length,sha256:sha(receipt),controlled_ACK_metadata:true,native_qualification:false,fs_durability_qualified:false});
  const third=await import(pathToFileURL(path.join(repo,P,'third-connected.central.mjs')).href);const ingress=await third.runNativeCardWatchWireConnected(args);write('ingress-component.json',ingress);completed.push('ingress-component.json');assert.equal(ingress.controlled_groups,8);assert.equal(ingress.nested_variants,14);assert.equal(ingress.native_SQL,0);assert.equal(ingress.old_components_replayed,0);
  write('result.json',{status:'PASS',new_common_cases:1,actual_Node_SPEC_tests:1,CONTROLLED_groups:20,source_groups:12,ingress_groups:8,ingress_nested_variants:14,actual_LocalSQLite:true,full_current615_matches_saved_actual603:true,full_candidate_files:617,staged_source_baseline_files:617,source_non_target_equal:616,actual_metadata_fs_consumer:true,old_components_replayed:0,Node:process.version,native_SQL:0,provider_HTTP:0,MAIN:0,Telegram:0,native_policy:null,independent105_connected:false,native_epoch_or_firstknowledge_or_SAVING_or_SENT_qualified:false,completed_components:completed});
 }catch(error){
  const receiptPath=path.join(repo,'report2-anomaly-domain-receipts.json');let retainedReceipt=null;
  if(fs.existsSync(receiptPath)){const receipt=fs.readFileSync(receiptPath);assert.ok(receipt.length<=20480);fs.writeFileSync(path.join(output,'actual-receipt-consumer.json'),receipt);retainedReceipt={bytes:receipt.length,sha256:sha(receipt),native_qualification:false};}
  write('failure-context.json',{error:String(error),stack:error.stack,completed_components:completed,completed_parent_groups:error.completed_new_parent_groups??null,completed_ingress_groups:error.completed_new_ingress_groups??null,retained_receipt_consumer:retainedReceipt,old_completed_components_must_not_replay:true});throw error;
 }
 finally{fs.rmSync(temporary,{recursive:true,force:true});write('baseline-cleanup.json',{removed:!fs.existsSync(temporary),outside_artifact:true});fs.rmSync(path.join(repo,'report2-anomaly-domain-receipts.json'),{force:true});fs.rmSync(path.join(repo,'report2-anomaly-domain-receipts.json.tmp'),{force:true});}
});
