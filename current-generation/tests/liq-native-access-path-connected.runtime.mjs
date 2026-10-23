import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const repo=process.cwd(),runtime=process.env.REPORT2_LINKED_RUNTIME,output=process.env.REPORT2_LINKED_OUTPUT,prefix='checkpoints/liq-native-access-path-connected-20261021';
const sha=b=>createHash('sha256').update(b).digest('hex'),write=(n,v)=>fs.writeFileSync(path.join(output,n),JSON.stringify(v,null,2)+'\n');
test('ONE FIRST exact parent-admitted liquidation access-path capture',async()=>{
 const plan=JSON.parse(fs.readFileSync(prefix+'/qualification-plan.json'));assert.equal(plan.semantic_status,'UNEXECUTED');
 fs.mkdirSync(output,{recursive:true});const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'report2-liq-access-baseline-')),baseline=path.join(temporary,'baseline');let returned=false;
 try{
  fs.cpSync(runtime,baseline,{recursive:true});const before=execFileSync('git',['show',plan.baseline_git_commit+':current-generation/files/runner-main.mjs'],{cwd:repo,maxBuffer:1024*1024});assert.equal(sha(before),'14b6f52d52aff8760ab16d03487ae62144a97a46078030d73637f8c15bbfc756');fs.writeFileSync(path.join(baseline,'runner-main.mjs'),before);
  const module=await import(pathToFileURL(path.join(repo,plan.callable.path)).href),result=await module[plan.callable.entry]({runtime_root:path.join(runtime,'src'),baseline_runtime_root:path.join(baseline,'src'),repo_root:repo});
  write('access-path-result.json',result);returned=true;
  assert.equal(result.status,'NEW_CONTROLLED_ACCESS_PATH_COMPONENT_COMPLETED');assert.equal(result.full_baseline_files,615);assert.equal(result.full_candidate_files,615);assert.equal(result.non_target_files_equal,614);assert.equal(result.native_SQL,0);assert.equal(result.source_HTTP,0);
  assert.equal(result.control_count,plan.new_CONTROLLED_groups);assert.equal(result.completed_old_components_replayed,0);
  write('result.json',{status:'PASS',new_common_cases:1,CONTROLLED_groups:result.control_count,Node_version:process.version,returned_component:'access-path-result.json',old_accepted_components_replayed:0,native_SQL:0,provider_HTTP:0,MAIN:0,Telegram:0,native_capture_executed:false,native_cost_saving_or_SENT_qualified:false});
 }catch(error){write('failure-context.json',{returned_component_artifact:returned?'access-path-result.json':null,error:String(error),stack:error.stack,completed_new_CONTROLLED_groups:error.completed_new_CONTROLLED_groups??null,completed_new_CONTROLLED_controls:error.completed_new_CONTROLLED_controls??null});throw error;}
 finally{fs.rmSync(temporary,{recursive:true,force:true});write('baseline-cleanup.json',{removed:!fs.existsSync(temporary),outside_artifact:true});}
});
