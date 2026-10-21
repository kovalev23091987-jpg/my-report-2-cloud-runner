import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const repo=process.cwd(),runtime=process.env.REPORT2_LINKED_RUNTIME,output=process.env.REPORT2_LINKED_OUTPUT,prefix='checkpoints/post597-native-bundle-20261021';
const sha=b=>createHash('sha256').update(b).digest('hex'),write=(n,d)=>fs.writeFileSync(path.join(output,n),JSON.stringify(d,null,2)+'\n');
const files=(root,rel='')=>fs.readdirSync(path.join(root,rel),{withFileTypes:true}).flatMap(x=>x.isDirectory()?files(root,path.join(rel,x.name)):[path.join(rel,x.name)]).sort();
test('ONE FIRST native anomaly atomic domain memory capture and admission kernel',async()=>{
 assert.ok(runtime&&output);fs.mkdirSync(output,{recursive:true});const plan=JSON.parse(fs.readFileSync(path.join(repo,prefix,'qualification-plan.json')));assert.equal(plan.semantic_status,'UNEXECUTED');
 execFileSync('git',['merge-base','--is-ancestor',plan.baseline_git_commit,'HEAD'],{cwd:repo});
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'report2-native-domain-baseline-')),baseline=path.join(temporary,'baseline');let returned=false;
 try{
  fs.cpSync(runtime,baseline,{recursive:true});
  for(const t of plan.runtime_targets){assert.equal(sha(fs.readFileSync(path.join(runtime,t.runtime_relative))),t.after_sha256);if(t.before_sha256===null)fs.rmSync(path.join(baseline,t.runtime_relative));else{const b=execFileSync('git',['show',plan.baseline_git_commit+':'+t.path],{cwd:repo,maxBuffer:8*1024*1024});assert.equal(sha(b),t.before_sha256);fs.writeFileSync(path.join(baseline,t.runtime_relative),b);}}
  const old=files(baseline),next=files(runtime);assert.equal(old.length,613);assert.equal(next.length,615);write('baseline-binding.json',{actual_full_assembled_runtime:true,baseline_location:'UNIQUE_OS_TEMP_OUTSIDE_ARTIFACT',baseline_git_commit:plan.baseline_git_commit,old_file_count:old.length,new_file_count:next.length,targets:plan.runtime_targets});
  const module=await import(pathToFileURL(path.join(repo,plan.callable.path)).href),result=await module[plan.callable.entry]({repo_root:repo,runtime_root:runtime,baseline_runtime_root:baseline,contract_json_path:path.join(repo,'contract-input/existing-store-contract.json')});
  write('native-domain-result.json',result);returned=true;
  assert.equal(result.status,'NEW_CONTROLLED_DOMAIN_COMPONENT_COMPLETED');assert.equal(result.control_count,16);assert.equal(result.fixture_cleanup_removed,true);assert.equal(result.old_components_replayed,0);assert.equal(result.native_installed_schema_qualified,false);assert.equal(result.independent_all105_observer_connected,false);
  write('result.json',{status:'PASS',new_common_cases:1,CONTROLLED_groups:16,Node_version:process.version,returned_component:'native-domain-result.json',old_accepted_components_replayed:0,native_SQL:0,provider_HTTP:0,MAIN:0,Telegram:0,native_activation_or_SENDING_qualified:false});
 }catch(error){write('failure-context.json',{returned_component_artifact:returned?'native-domain-result.json':null,error:String(error),stack:error.stack,completed_new_CONTROLLED_groups:error.completed_new_CONTROLLED_groups??null});throw error;}
 finally{fs.rmSync(temporary,{recursive:true,force:true});write('baseline-cleanup.json',{removed:!fs.existsSync(temporary),outside_artifact:true});}
});
