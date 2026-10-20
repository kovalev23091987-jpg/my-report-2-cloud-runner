import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const repo=process.cwd(),runtime=process.env.REPORT2_LINKED_RUNTIME,output=process.env.REPORT2_LINKED_OUTPUT,prefix='checkpoints/provider-visibility-following-geometry-20261020';
const sha=b=>createHash('sha256').update(b).digest('hex'),write=(name,value)=>fs.writeFileSync(path.join(output,name),JSON.stringify(value,null,2)+'\n');
test('ONE NEW atomic provider future visibility and retained following closed geometry',async()=>{
 assert.ok(runtime&&output);fs.mkdirSync(output,{recursive:true});
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'report2-visibility-geometry-')),baseline=path.join(temp,'runtime-baseline'),completed=[];let returned=null;
 const oldFetch=globalThis.fetch;globalThis.fetch=()=>{throw Error('NO_REAL_NATIVE_PROVIDER_MAIN_OR_TELEGRAM_NETWORK');};
 try{
  fs.cpSync(runtime,baseline,{recursive:true});
  fs.copyFileSync(path.join(repo,prefix,'provider-minute-ledger.before.mjs'),path.join(baseline,'src/provider-minute-ledger.mjs'));
  const enumerate=(dir,rel='')=>fs.readdirSync(path.join(dir,rel),{withFileTypes:true}).flatMap(x=>x.isDirectory()?enumerate(dir,path.join(rel,x.name)):[path.join(rel,x.name)]);
  const candidateFiles=enumerate(runtime).sort(),baselineFiles=enumerate(baseline).sort();assert.deepEqual(candidateFiles,baselineFiles);
  const changed='src/provider-minute-ledger.mjs',same={};
  for(const name of candidateFiles)if(name!==changed){const h=sha(fs.readFileSync(path.join(runtime,name)));assert.equal(sha(fs.readFileSync(path.join(baseline,name))),h,name);same[name]=h;}
  const pins=JSON.parse(fs.readFileSync(path.join(repo,'checkpoints/source-worker-provider-latency-contract-20261020/target-bindings.json')));
  assert.equal(sha(fs.readFileSync(path.join(runtime,changed))),pins.target.after_sha256);assert.equal(sha(fs.readFileSync(path.join(baseline,changed))),pins.target.before_sha256);
  write('baseline-binding.json',{actual_assembled_tree:true,baseline_location:'UNIQUE_OS_TEMP_OUTSIDE_ARTIFACT',same_files:same,only_changed:changed,before:pins.target.before_sha256,after:pins.target.after_sha256});
  const source=await import(pathToFileURL(path.join(repo,'checkpoints/source-worker-provider-latency-contract-20261020/future-visibility-connected.mjs')).href);
  const provider=await source.runProviderMinuteFutureVisibilityConnected({runtime_root:path.join(runtime,'src'),baseline_runtime_root:path.join(baseline,'src'),repo_root:repo});
  returned='provider-result.json';write(returned,provider);
  assert.equal(provider.status,'CONTROLLED_COMPONENT_COMPLETED');assert.equal(provider.control_count,12);assert.equal(provider.native_rows_read_cost,null);assert.equal(provider.admission_authorized,false);completed.push('provider');returned=null;
  const anomaly=await import(pathToFileURL(path.join(repo,'anomaly-research/following-closed-geometry-20261020/connected.mjs')).href);
  const geometry=await anomaly.runFollowingClosedGeometry({repo_root:repo});
  returned='following-geometry-result.json';write(returned,geometry);
  assert.equal(geometry.status,'DESCRIPTIVE_CONTEXT_CALCULATION_COMPLETED');assert.equal(geometry.controlled_group_count,8);assert.equal(geometry.population.context_cells,13096);assert.equal(geometry.activation_allowed,false);assert.equal(geometry.entry_anchor_levels_trigger_stop_TTL_recheck_research,false);completed.push('geometry');returned=null;
  write('result.json',{status:'PASS',new_cases:1,Node_version:process.version,components:completed,CONTROLLED_groups:20,actual_following_context_cells:geometry.population.context_cells,old_accepted_semantic_reexecution:0,native_SQL:0,sourceHTTP:0,MAIN:0,Telegram:0,whole_day_admission_restored:false,native_ACK_or_accuracy_qualified:false});
 }catch(error){write('failure-context.json',{completed_components:completed,returned_component_artifact:returned,error:String(error),stack:error.stack});throw error;}
 finally{globalThis.fetch=oldFetch;fs.rmSync(temp,{recursive:true,force:true});write('baseline-cleanup.json',{removed:!fs.existsSync(temp),outside_artifact:true});}
});
