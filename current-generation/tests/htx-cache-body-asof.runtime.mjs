import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const repo=process.cwd(),runtime=process.env.REPORT2_LINKED_RUNTIME,output=process.env.REPORT2_LINKED_OUTPUT;
const prefix='checkpoints/cache-body-asof-connected-20261020';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const write=(name,value)=>fs.writeFileSync(path.join(output,name),JSON.stringify(value,null,2)+'\n');
const list=(root,rel='',exclude=new Set())=>fs.readdirSync(path.join(root,rel),{withFileTypes:true}).flatMap(item=>{
  if(!rel&&exclude.has(item.name))return[];
  const name=path.join(rel,item.name);
  return item.isDirectory()?list(root,name,exclude):[name];
}).sort();

test('ONE NEW linked HTX body knowledge, admitted cache fallback, and closed-asof research consumer',async()=>{
  assert.ok(runtime&&output);fs.mkdirSync(output,{recursive:true});
  const plan=JSON.parse(fs.readFileSync(path.join(repo,prefix,'qualification-plan.json'),'utf8'));
  assert.equal(plan.semantic_status,'UNEXECUTED');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'report2-cache-body-asof-'));
  const baselineRuntime=path.join(temp,'runtime-baseline'),baselineBody=path.join(temp,'body-baseline'),baselineCache=path.join(temp,'cache-baseline'),baselineRepo=path.join(temp,'repo-baseline');
  const completed=[];let returned=null;
  const originalFetch=globalThis.fetch;
  globalThis.fetch=()=>{throw Error('NO_REAL_NATIVE_PROVIDER_MAIN_OR_TELEGRAM_NETWORK');};
  try{
    fs.cpSync(runtime,baselineRuntime,{recursive:true});
    const changed=new Map();
    for(const target of plan.runtime_targets){
      const candidate=fs.readFileSync(path.join(runtime,target.runtime_relative));
      assert.equal(sha(candidate),target.after_sha256,target.runtime_relative);
      const before=fs.readFileSync(path.join(repo,target.baseline_path));
      assert.equal(sha(before),target.before_sha256,target.baseline_path);
      fs.writeFileSync(path.join(baselineRuntime,target.runtime_relative),before);
      changed.set(target.runtime_relative,target);
    }
    const runtimeNames=list(runtime);assert.deepEqual(list(baselineRuntime),runtimeNames);
    const sameRuntime={};
    for(const name of runtimeNames){
      const before=sha(fs.readFileSync(path.join(baselineRuntime,name))),after=sha(fs.readFileSync(path.join(runtime,name)));
      if(changed.has(name)){assert.equal(before,changed.get(name).before_sha256);assert.equal(after,changed.get(name).after_sha256);}
      else{assert.equal(before,after,name);sameRuntime[name]=after;}
    }
    // Each component also gets a full assembled baseline with exactly its own
    // targets restored; the other integrated component's modules remain equal.
    const componentBaselines={};
    for(const [component,destination]of [['body',baselineBody],['cache',baselineCache]]){
      fs.cpSync(runtime,destination,{recursive:true});
      const ownTargets=plan.runtime_targets.filter(target=>target.component===component);
      assert.ok(ownTargets.length>0,component+' target set');
      const ownNames=new Set(ownTargets.map(target=>target.runtime_relative));
      for(const target of ownTargets)fs.copyFileSync(path.join(repo,target.baseline_path),path.join(destination,target.runtime_relative));
      assert.deepEqual(list(destination),runtimeNames);
      const same={};
      for(const name of runtimeNames){
        const before=sha(fs.readFileSync(path.join(destination,name))),after=sha(fs.readFileSync(path.join(runtime,name)));
        if(ownNames.has(name))assert.equal(before,changed.get(name).before_sha256,name);
        else{assert.equal(before,after,component+':'+name);same[name]=after;}
      }
      componentBaselines[component]={restored:ownTargets,other_files:same};
    }
    // Both research roots contain the full checkout. Generated decrypted runtime,
    // output, and Git internals are outside that repository-source comparison.
    const excluded=new Set(['.git','runtime','audit-output']);
    fs.cpSync(repo,baselineRepo,{recursive:true,filter:source=>{
      const relative=path.relative(repo,source);return !relative||!excluded.has(relative.split(path.sep)[0]);
    }});
    const research=plan.research_target;
    assert.equal(sha(fs.readFileSync(path.join(repo,research.path))),research.after_sha256);
    const researchBefore=fs.readFileSync(path.join(repo,research.baseline_path));
    assert.equal(sha(researchBefore),research.before_sha256);
    fs.writeFileSync(path.join(baselineRepo,research.path),researchBefore);
    const repoNames=list(repo,'',excluded);assert.deepEqual(list(baselineRepo),repoNames);
    const sameRepo={};
    for(const name of repoNames){
      const before=sha(fs.readFileSync(path.join(baselineRepo,name))),after=sha(fs.readFileSync(path.join(repo,name)));
      if(name===research.path){assert.equal(before,research.before_sha256);assert.equal(after,research.after_sha256);}
      else{assert.equal(before,after,name);sameRepo[name]=after;}
    }
    write('baseline-binding.json',{actual_assembled_runtime:true,actual_full_repository_source_copy:true,baseline_location:'UNIQUE_OS_TEMP_OUTSIDE_ARTIFACT',runtime_changed:plan.runtime_targets,runtime_other_files:sameRuntime,component_baselines:componentBaselines,research_changed:research,repository_other_files:sameRepo,repository_generated_exclusions:[...excluded]});

    const bodyModule=await import(pathToFileURL(path.join(repo,'anomaly-research/body-completion-ingress-20261020/connected.mjs')).href);
    const body=await bodyModule.runBodyCompletionIngressConnected({runtime_root:path.join(runtime,'src'),baseline_runtime_root:path.join(baselineBody,'src'),repo_root:repo});
    returned='body-result.json';write(returned,body);
    assert.equal(body.new_affected_cases,1);assert.equal(body.assertion_groups,7);assert.equal(body.SQL,0);assert.equal(body.provider_HTTP,0);assert.equal(body.native_epoch,false);assert.equal(body.anomaly_domain_ACK,false);
    completed.push('body');returned=null;

    const sourceEntry=plan.source_component;
    const sourceModule=await import(pathToFileURL(path.join(repo,sourceEntry.path)).href);
    const source=await sourceModule[sourceEntry.export_name]({runtime_root:path.join(runtime,'src'),baseline_runtime_root:path.join(baselineCache,'src'),repo_root:repo});
    returned='cache-result.json';write(returned,source);
    for(const [key,value]of Object.entries(sourceEntry.expected))assert.deepEqual(source[key],value,'cache.'+key);
    completed.push('cache');returned=null;

    const researchModule=await import(pathToFileURL(path.join(repo,'anomaly-research/closed-asof-typed-consumer-20261020/connected.mjs')).href);
    const asof=await researchModule.runClosedAsofTypedConsumerConnected({repo_root:repo,baseline_repo_root:baselineRepo});
    returned='closed-asof-result.json';write(returned,asof);
    assert.equal(asof.new_affected_cases,1);assert.equal(asof.assertion_groups,7);assert.equal(asof.old37_or_3274_or_13096_recomputed,0);assert.equal(asof.native_commit_ACK,false);assert.equal(asof.admission,false);
    completed.push('closed-asof');returned=null;
    write('result.json',{status:'PASS',new_common_cases:1,new_component_cases:3,completed_components:completed,Node_version:process.version,body_controlled_groups:body.assertion_groups,cache_controlled_groups:source[sourceEntry.group_count_key],closed_asof_controlled_groups:asof.assertion_groups,old_accepted_semantic_reexecution:0,native_SQL:0,provider_HTTP:0,MAIN:0,Telegram:0,native_day_admission_restored:false,native_delivery_or_anomaly_ACK_qualified:false});
  }catch(error){write('failure-context.json',{completed_components:completed,returned_component_artifact:returned,error:String(error),stack:error.stack});throw error;}
  finally{globalThis.fetch=originalFetch;fs.rmSync(temp,{recursive:true,force:true});write('baseline-cleanup.json',{removed:!fs.existsSync(temp),outside_artifact:true});}
});
