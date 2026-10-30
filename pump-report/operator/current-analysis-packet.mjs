import {readSavedAutoObservation} from './saved-auto-observation.mjs';
import {readSavedAutoCandidateObservation} from './saved-auto-candidate-observation.mjs';

// Reads latest checked analysis indexes even while a different light AUTO is
// in flight. Index adaptation below is explicit; it never claims a saved run.
export async function readCurrentAnalysisPacket({store,admission,clock=Date.now}){
  const executor=await store.get('pump:executor'),resources=await store.get('pump:resources'),queue=await store.get('pump:candidate-queue');
  if(queue!==null&&(typeof queue!=='object'||Array.isArray(queue)||Object.keys(queue).length>2000))throw Error('CANDIDATE_QUEUE_BOUND');
  const selected=Object.values(queue??{}).filter(r=>typeof r?.instrument_id==='string'&&r.instrument_id.startsWith('BINGX:USDT_M:')&&r.instrument_id.length<=256&&Number.isSafeInteger(r.last_checked_ts)&&r.last_checked_ts>=admission.after_install_ts&&r.last_checked_ts<=clock()).sort((a,b)=>b.last_checked_ts-a.last_checked_ts||a.instrument_id.localeCompare(b.instrument_id)).slice(0,2);
  const out={schema:'PUMP_CURRENT_SAVED_ANALYSIS_PACKET_V1',selector:{basis:'LATEST_TWO_QUEUE_CHECKED_AFTER_INSTALL_THEN_EXACT_INDEX_AND_ORIGINAL_BINDING',after_install_ts:admission.after_install_ts,selected_instrument_ids:selected.map(r=>r.instrument_id),observed_ts:clock(),not_a_wholemarket_or_completedrun_claim:true},executor,project_resources:resources,latest_candidates:[],latest_executor_run:null};
  const cache=new Map();
  for(const row of selected){
    const key='pump:latest-analysis:'+row.instrument_id,index=await store.get(key);
    if(!index?.analysis||index.analysis.instrument?.instrument_id!==row.instrument_id){out.latest_candidates.push({instrument_id:row.instrument_id,status:'LATEST_INDEX_MISSING_OR_ID_MISMATCH',index_key:key});continue;}
    const a=index.analysis;
    if(a.mode!=='AUTO'||a.run_purpose!=='PRODUCTION'||!Number.isSafeInteger(a.analysis_ts)||a.analysis_ts<admission.after_install_ts||a.analysis_ts>clock()){out.latest_candidates.push({instrument_id:row.instrument_id,status:'LATEST_INDEX_OUTSIDE_CURRENT_AUTO_SCOPE',index_key:key});continue;}
    const view={get:async k=>{const value=await store.get(k);cache.set(k,value);return value;}};
    const observed=await readSavedAutoCandidateObservation({store:view,observation:{latest_run_id:a.run_id,private_evidence:{run:{run_id:a.run_id,checked:[index]}}},implementation_sha256:admission.implementation_sha256,clock});
    out.latest_candidates.push({...observed,index_key:key,binding_basis:'ACTUAL_LATEST_ANALYSIS_INDEX_AND_IMMUTABLE_ORIGINAL_NOT_RUN_RECORD'});
  }
  if(typeof executor?.run_id==='string'&&/^[a-f0-9-]{36}$/i.test(executor.run_id))out.latest_executor_run=await store.get('pump:run:'+executor.run_id);
  const view={get:async key=>cache.has(key)?cache.get(key):store.get(key),scanPrefix:(...args)=>store.scanPrefix(...args)};
  out.observation=await readSavedAutoObservation({store:view,implementation_sha256:admission.implementation_sha256,expected_recipient_sha256:admission.expected_recipient_sha256,include_executor:false,confirmed_not_before_ts:admission.after_install_ts,clock});
  out.scope={maximum_queue_rows_projected:2,maximum_latest_indexes:2,maximum_candidate_originals:2,maximum_executor_run:1,card_page_limit:20,maximum_card_originals:1,maximum_business_queries:11,reservation_finalization_queries:4,maximum_total_queries:15,native_query_cap:16,catalog_outcome_waves_not_read:true,whole_history_or_market_claimed:false};
  return out;
}
