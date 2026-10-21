import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const repo=process.cwd(),runtime=process.env.REPORT2_LINKED_RUNTIME,output=process.env.REPORT2_LINKED_OUTPUT,prefix='checkpoints/compact-catalog-primary-carriers-connected-20261021';
const sha=x=>createHash('sha256').update(x).digest('hex'),write=(name,value)=>fs.writeFileSync(path.join(output,name),JSON.stringify(value,null,2)+'\n');
const files=(root,rel='')=>fs.readdirSync(path.join(root,rel),{withFileTypes:true}).flatMap(x=>x.isDirectory()?files(root,path.join(rel,x.name)):[path.join(rel,x.name)]).sort();
test('ONE NEW linked compact public catalog and initial primary reason carriers',async()=>{
 assert.ok(runtime&&output);fs.mkdirSync(output,{recursive:true});
 const plan=JSON.parse(fs.readFileSync(path.join(repo,prefix,'qualification-plan.json')));assert.equal(plan.semantic_status,'UNEXECUTED');
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'report2-linked-carriers-')),combined=path.join(temp,'combined-baseline'),completed=[],results={},bindings={};let returned=null;
 const originalFetch=globalThis.fetch;globalThis.fetch=()=>{throw Error('NO_REAL_NATIVE_PROVIDER_MAIN_OR_TELEGRAM_NETWORK');};
 try{
  fs.cpSync(runtime,combined,{recursive:true});const names=files(runtime),changed=new Map(plan.runtime_targets.map(t=>[t.runtime_relative,t]));
  for(const t of plan.runtime_targets){assert.equal(sha(fs.readFileSync(path.join(runtime,t.runtime_relative))),t.after_sha256);const before=fs.readFileSync(path.join(repo,t.baseline_path));assert.equal(sha(before),t.before_sha256);fs.writeFileSync(path.join(combined,t.runtime_relative),before);}
  assert.deepEqual(files(combined),names);const combinedSame={};
  for(const f of names){const old=sha(fs.readFileSync(path.join(combined,f))),now=sha(fs.readFileSync(path.join(runtime,f)));if(changed.has(f))assert.equal(old,changed.get(f).before_sha256);else{assert.equal(old,now,f);combinedSame[f]=now;}}
  for(const component of plan.components){
   const root=path.join(temp,component.name+'-baseline');fs.cpSync(runtime,root,{recursive:true});const own=plan.runtime_targets.filter(t=>t.component===component.name);assert.equal(own.length,1);
   for(const t of own)fs.copyFileSync(path.join(repo,t.baseline_path),path.join(root,t.runtime_relative));
   assert.deepEqual(files(root),names);const same={};
   for(const f of names){const old=sha(fs.readFileSync(path.join(root,f))),now=sha(fs.readFileSync(path.join(runtime,f)));if(f===own[0].runtime_relative)assert.equal(old,own[0].before_sha256);else{assert.equal(old,now,component.name+':'+f);same[f]=now;}}
   bindings[component.name]={restored:own[0],other_files:same};
  }
  write('baseline-binding.json',{actual_full_assembled_runtime:true,baseline_location:'UNIQUE_OS_TEMP_OUTSIDE_ARTIFACT',combined_changed:plan.runtime_targets,combined_other_files:combinedSame,component_baselines:bindings});
  for(const component of plan.components){
   const module=await import(pathToFileURL(path.join(repo,component.path)).href);
   const result=await module[component.entry]({runtime_root:path.join(runtime,'src'),baseline_runtime_root:path.join(temp,component.name+'-baseline','src'),repo_root:repo});
   returned=component.name+'-result.json';write(returned,result);
   for(const[k,v]of Object.entries(component.expected))assert.deepEqual(result[k],v,component.name+'.'+k);
   results[component.name]=result;completed.push(component.name);returned=null;
  }
  write('result.json',{status:'PASS',new_common_cases:1,completed_components:completed,CONTROLLED_groups:plan.components.reduce((n,c)=>n+results[c.name][c.group_count_key],0),Node_version:process.version,old_565_588_589_components_replayed:0,native_SQL:0,provider_HTTP:0,MAIN:0,Telegram:0,actual395777_catalog_or_primary_recovered:false,missing_six_or_initial_cause_or_SENT_fixed:false});
 }catch(error){write('failure-context.json',{completed_components:completed,returned_component_artifact:returned,error:String(error),stack:error.stack,completed_new_control_groups:error.completed_new_control_groups??null});throw error;}
 finally{globalThis.fetch=originalFetch;fs.rmSync(temp,{recursive:true,force:true});write('baseline-cleanup.json',{removed:!fs.existsSync(temp),outside_artifact:true});}
});
