// ONE combined entry, PREPARED_UNEXECUTED. ROOT supplies external closure pin
// and its existing result writer. No provider/native SQL/Worker execution.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
const sha=b=>createHash('sha256').update(b).digest('hex');
export async function runBingxHistoryCombined({repo_root,expected_closure_sha256,save_result,only_component=null}={}){
 const partial={schema:'B04_COMBINED_PARTIAL_V1',returned:[],completed_components:[],save_callback_resolved:[],postpins_pending:null,native_SQL:0,provider_HTTP:0,MAIN:0,Telegram:0};
 const save=async(name,result)=>{const item={name,result:structuredClone(result)};partial.returned.push(item);await save_result(item);partial.save_callback_resolved.push(name);return result;};
 try{
  if(typeof save_result!=='function'||!/^([a-f0-9]{64})$/.test(String(expected_closure_sha256))||![null,'IDENTITY','TARGETS'].includes(only_component))throw Error('ROOT_EXTERNAL_CLOSURE_PIN_AND_RESULT_WRITER_REQUIRED');
  const root=resolve(repo_root),prefix='checkpoints/bingx-primary-producer-connected-20261024/bound-history',dir=join(root,prefix);
  if(fileURLToPath(import.meta.url)!==join(dir,'combined.proposed.mjs'))throw Error('EXACT_COMBINED_ENTRY_LOCATION_REQUIRED');
  const raw=await readFile(join(dir,'import-closure.json'));
  const observed=sha(raw);await save('closure-bytes',{expected:expected_closure_sha256,observed,bytes:raw.length,native_admission:false});
  assert.equal(observed,expected_closure_sha256,'EXTERNAL_CLOSURE_PIN_MISMATCH');
  const closure=JSON.parse(raw);
  assert.equal(closure.schema,'B04_COMBINED_REQUIRED_IMPORT_CLOSURE_V1');
  const attest=async stage=>{
   const files=[];
   for(const e of closure.files){const path=resolve(root,e.path);if(!path.startsWith(root+'/'))throw Error('CLOSURE_PATH_OUTSIDE_ROOT');const b=await readFile(path);files.push({path:e.path,role:e.role,expected_sha256:e.sha256,sha256:sha(b),expected_bytes:e.bytes,bytes:b.length});}
   const result={schema:'B04_COMBINED_FILESYSTEM_ATTEST_V1',stage,files,node_version:process.version,v8:process.versions.v8,full_Worker_imported:false,native_admission:false,TOCTOU_or_crash_durability_qualified:false};
   await save(stage,result);for(const e of files){assert.equal(e.sha256,e.expected_sha256,e.path);assert.equal(e.bytes,e.expected_bytes,e.path);}return result;
  };
  await attest('BEFORE_FIRST_APPLICATION_IMPORT');
  const plan=[{id:'IDENTITY',file:'identity-case.bound.mjs',name:'runBingxConsumerIdentityCase',schema:'BINGX_CONSUMER_IDENTITY_CONTROLLED_V1',variants:18},{id:'TARGETS',file:'targets-case.bound.mjs',name:'runBingxHistoryTargetsConnected',schema:'B04_BINGX_HISTORY_TARGETS_CONTROLLED_V1',variants:22}].filter(c=>only_component===null||c.id===only_component);
  const completed=[];
  for(const c of plan){
   partial.current_component=c.id;let value;
   try{const mod=await import(pathToFileURL(join(dir,c.file)).href);value=await mod[c.name]({repo_root:root,save_result:item=>save_result({name:c.id+'_INVOCATION_'+item.name,result:item.result})});}
   catch(error){await save(c.id+'_THREW',{schema:'B04_COMBINED_COMPONENT_THROW_V1',component:c.id,error:String(error?.message??error),partial_result:error?.partial_result??null});throw error;}
   // Preserve actual returned JSON before assertions, postpins or next component.
   await save(c.id+'_RETURNED',value);
   assert.equal(value.schema,c.schema);assert.equal(value.new_groups,1);assert.equal(value.new_variants,c.variants);assert.equal(value.pins_before_after_equal,true);
   for(const key of ['provider_HTTP','native_SQL','CF','dispatch','MAIN','Telegram'])assert.equal(value[key],0,key);
   completed.push({component:c.id,new_groups:value.new_groups,new_variants:value.new_variants});partial.completed_components.push(c.id);delete partial.current_component;
   partial.postpins_pending=c.id;await attest('AFTER_'+c.id);partial.postpins_pending=null;
  }
  const result={schema:'B04_COMBINED_CONTROLLED_RESULT_V1',selected_components:plan.map(c=>c.id),completed,component_groups:completed.length,component_variants:completed.reduce((n,c)=>n+c.new_variants,0),all_two_components_in_this_invocation:completed.length===2,omitted_components:['IDENTITY','TARGETS'].filter(id=>!plan.some(c=>c.id===id)),new_third_semantic_group:false,result_callback_awaited_before_assert_and_next:true,native_SQL:0,provider_HTTP:0,CF:0,dispatch:0,MAIN:0,Telegram:0,full_Worker_imported:false,old_accepted_cases_replayed:0,native_registry_or_current_producer_qualified:false,source479_adapter_executed:false,author_execution:'UNEXECUTED',write_callback_is_not_crash_durability_proof:true};
  await save('COMBINED_RETURNED',result);return result;
 }catch(error){error.combined_partial_result=structuredClone(partial);throw error;}
}
