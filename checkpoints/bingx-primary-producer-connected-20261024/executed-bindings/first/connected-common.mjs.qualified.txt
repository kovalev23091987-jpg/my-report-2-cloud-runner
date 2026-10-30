import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
const P='checkpoints/bingx-primary-producer-connected-20261024',OUT='audit-output/bingx-primary-producer-connected',sha=b=>createHash('sha256').update(b).digest('hex');
test('one FIRST connected BingX primary capture, typed history and real Worker boundary',async()=>{
 const repo=process.cwd(),out=join(repo,OUT);await fs.mkdir(out,{recursive:true});
 let serial=0,isolated,baseline;const oldFetch=globalThis.fetch;
 const progress={schema:'ACTUAL_FIRST_BINGX_PRIMARY_CONNECTED_CONTROLLED_V1',node:process.version,components:[],completed_groups:0,completed_variants:0,stage:'PREIMPORT',provider_HTTP:0,native_SQL:0,CF:0,production_MAIN:0,Telegram:0,full_private_assembly:false,old_accepted_cases_replayed:0,cleanup:false};
 const save=(name,value)=>{const n=String(++serial).padStart(4,'0')+'-'+name.replace(/[^A-Za-z0-9_.-]/g,'_').slice(0,110);writeFileSync(join(out,n+'.json'),JSON.stringify(value,null,2)+'\n');};
 const state=()=>writeFileSync(join(out,'common-result.json'),JSON.stringify(progress,null,2)+'\n');
 try{
  assert.match(process.version,/^v24\./);state();
  const pins=JSON.parse(await fs.readFile(join(repo,P,'qualification-pins.json'),'utf8'));
  const attest=async(root,stage)=>{const actual=[];for(const [path,pin]of Object.entries(pins.files)){const b=await fs.readFile(join(root,path));actual.push({path,bytes:b.length,sha256:sha(b),expected:pin});}save(stage,actual);for(const x of actual){assert.equal(x.bytes,x.expected.bytes,x.path);assert.equal(x.sha256,x.expected.sha256,x.path);}return actual;};
  await attest(repo,'BEFORE_ISOLATED_COPY');progress.full_pinned_files=Object.keys(pins.files).length;state();
  isolated=await fs.mkdtemp(join(tmpdir(),'report2-bingx-connected-candidate-'));baseline=await fs.mkdtemp(join(tmpdir(),'report2-bingx-connected-baseline-'));
  const prefixes=['current-generation/files/src',P,'anomaly-research/bingx-history-combined-20261024','anomaly-research/bingx-observation-producer-20261024','checkpoints/source-worker-bingx-primary-adapter-20261024','checkpoints/source-worker-bingx-native-schema-delta-20261024','checkpoints/source-worker-bingx-worker-dispatch-20261024'];
  for(const prefix of prefixes){await fs.mkdir(dirname(join(isolated,prefix)),{recursive:true});await fs.cp(join(repo,prefix),join(isolated,prefix),{recursive:true});}
  for(const path of Object.keys(pins.files)){try{await fs.access(join(isolated,path));}catch{await fs.mkdir(dirname(join(isolated,path)),{recursive:true});await fs.copyFile(join(repo,path),join(isolated,path));}}
  await fs.writeFile(join(isolated,'package.json'),'{"type":"module"}\n');
  for(const path of ['checkpoints/source-worker-bingx-primary-adapter-20261024/bingx-perpetual-market.mjs.txt','anomaly-research/bingx-history-combined-20261024/worker.combined.mjs.txt']){await fs.mkdir(dirname(join(baseline,path)),{recursive:true});await fs.copyFile(join(repo,path),join(baseline,path));}
  await attest(isolated,'BEFORE_FIRST_APPLICATION_IMPORT');progress.stage='SOURCE_SCHEMA';state();globalThis.fetch=async()=>{throw Error('NATIVE_NETWORK_FORBIDDEN');};
  const invoke=async(name,file,exportName,args,groups,variants,count)=>{
   progress.stage=name;state();let value;
   try{const mod=await import(pathToFileURL(join(isolated,file)).href);value=await mod[exportName]({repo_root:isolated,baseline_repo_root:baseline,...args});}
   catch(error){save(name+'_PARTIAL',{message:error.message,stack:error.stack,partial_result:error.partial_result??error.combined_partial_result??null});throw error;}
   save(name+'_RETURNED',value);const observed=count(value);progress.components.push({name,...observed});progress.completed_groups+=observed.groups;progress.completed_variants+=observed.variants;state();assert.equal(observed.groups,groups);assert.equal(observed.variants,variants);await attest(isolated,'AFTER_'+name);return value;
  };
  await invoke('SOURCE_SCHEMA',P+'/bound-schema/connected.mjs','runBingxNativeSchemaDeltaConnected',{save_result:item=>save('SCHEMA_INVOCATION_'+item.name,item.result)},1,12,v=>({groups:v.actual_completed_groups,variants:v.actual_completed_variants}));
  const plan=JSON.parse(await fs.readFile(join(repo,P,'qualification-plan.json'),'utf8'));
  await invoke('HISTORY_IDENTITY_AND_TARGETS',P+'/bound-history/combined.proposed.mjs','runBingxHistoryCombined',{expected_closure_sha256:plan.history_closure_sha256,save_result:item=>save('HISTORY_'+item.name,item.result)},2,40,v=>({groups:v.component_groups,variants:v.component_variants}));
  await invoke('SOURCE_WORKER_DISPATCH',P+'/bound-dispatch/connected.mjs','runBingxWorkerVenueDispatchConnected',{save_result:item=>save('DISPATCH_'+item.name,item.result)},1,17,v=>({groups:v.actual_completed_groups,variants:v.actual_completed_variants}));
  await invoke('PRODUCER_AND_INDIVIDUAL','anomaly-research/bingx-observation-producer-20261024/producer-individual-case.proposed.mjs','runBingxProducerIndividualCase',{binding_path:P+'/producer-bound-closure.json',expected_closure_sha256:plan.producer_closure_sha256,save_result:item=>save('PRODUCER_'+item.name,item.result)},1,16,v=>({groups:v.completed.length===16?1:0,variants:v.completed.length}));
  await invoke('ROOT_LAST_REFERENCE',P+'/last-reference-case.proposed.mjs','runBingxLastReferenceCase',{save_result:(name,value)=>save('LAST_'+name,value)},1,12,v=>({groups:v.groups,variants:v.variants}));
  await invoke('ROOT_ACTUAL_DEEP',P+'/deep-boundary-case.proposed.mjs','runBingxDeepBoundaryCase',{save_result:(name,value)=>save('DEEP_'+name,value)},1,7,v=>({groups:v.groups,variants:v.variants}));
  await attest(repo,'AFTER_ALL_ORIGINAL_REPOSITORY_PINS');progress.stage='ALL_NEW_CONTROLLED_COMPONENTS_COMPLETE';progress.pins_before_after_equal=true;assert.equal(progress.completed_groups,7);assert.equal(progress.completed_variants,104);state();
 }catch(error){progress.error={name:error.name,message:error.message,stack:error.stack};throw error;}
 finally{globalThis.fetch=oldFetch;try{if(isolated)await fs.rm(isolated,{recursive:true,force:true});if(baseline)await fs.rm(baseline,{recursive:true,force:true});progress.cleanup=true;}finally{state();}}
});
