import {readSavedAutoObservation} from './saved-auto-observation.mjs';
import {readSavedAutoCandidateObservation} from './saved-auto-candidate-observation.mjs';

// Separate successor: preserve the qualified original reader unchanged.
// A new in-flight executor must not displace the run of a bound saved original.
export async function readCurrentSelectedRunAnalysisPacket({store,admission,clock=Date.now}){
  const started=clock();
  if(!Number.isSafeInteger(started)||started<0||!Number.isSafeInteger(admission?.after_install_ts)||admission.after_install_ts<=0||
    admission.after_install_ts>started||!/^[a-f0-9]{64}$/.test(admission?.implementation_sha256??'')||
    !/^[a-f0-9]{64}$/.test(admission?.expected_recipient_sha256??''))throw Error('EXACT_CURRENT_PACKET_SCOPE_REQUIRED');
  const executor=await store.get('pump:executor'),resources=await store.get('pump:resources'),queue=await store.get('pump:candidate-queue');
  if(queue!==null&&(typeof queue!=='object'||Array.isArray(queue)||Object.keys(queue).length>2000))throw Error('CANDIDATE_QUEUE_BOUND');
  const selected=Object.values(queue??{}).filter(r=>typeof r?.instrument_id==='string'&&r.instrument_id.startsWith('BINGX:USDT_M:')&&r.instrument_id.length<=256&&Number.isSafeInteger(r.last_checked_ts)&&r.last_checked_ts>=admission.after_install_ts&&r.last_checked_ts<=clock()).sort((a,b)=>b.last_checked_ts-a.last_checked_ts||a.instrument_id.localeCompare(b.instrument_id)).slice(0,2);
  const out={schema:'PUMP_CURRENT_SELECTED_RUN_ANALYSIS_PACKET_V1',selector:{basis:'LATEST_TWO_QUEUE_CHECKED_AFTER_INSTALL_THEN_EXACT_INDEX_AND_ORIGINAL_BINDING',after_install_ts:admission.after_install_ts,selected_instrument_ids:selected.map(r=>r.instrument_id),observed_ts:clock(),not_a_wholemarket_or_completedrun_claim:true},executor,project_resources:resources,latest_candidates:[],selected_analysis_run:null,selected_run_binding:null};
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
  const bound=out.latest_candidates.filter(c=>c.saved_original_bound===true&&c.status==='BOUND_SAVED_AUTO_CANDIDATE_ORIGINAL')
    .sort((a,b)=>b.analysis_ts-a.analysis_ts||a.instrument_id.localeCompare(b.instrument_id));
  const selectedOriginal=bound[0],selectedAnalysis=selectedOriginal?.private_evidence?.original?.analysis;
  out.selected_run_binding={basis:'NEWEST_STRICT_BOUND_CURRENT_AUTO_ORIGINAL',status:'NO_BOUND_CURRENT_ORIGINAL',run_read:false,
    selected_run_id:null,selected_analysis_key:null,all_selected_originals_same_run:null,other_selected_run_ids_unread:[],
    completed_saved_result_bound:false,whole_market_or_history_claimed:false};
  if(selectedAnalysis){
    const id=selectedAnalysis.run_id,uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
    const binding=out.selected_run_binding;
    binding.selected_run_id=id;binding.selected_analysis_key=selectedOriginal.analysis_key;
    binding.all_selected_originals_same_run=bound.every(c=>c.private_evidence.original.analysis.run_id===id);
    binding.other_selected_run_ids_unread=[...new Set(bound.map(c=>c.private_evidence.original.analysis.run_id).filter(r=>r!==id))];
    if(!uuid.test(id??'')){binding.status='SELECTED_RUN_ID_INVALID';}
    else {
      const run=await store.get('pump:run:'+id);out.selected_analysis_run=run;binding.run_read=true;
      const sameRun=run?.run_id===id&&Array.isArray(run?.checked)&&
        (run.implementation_sha256===undefined||run.implementation_sha256===admission.implementation_sha256)&&
        bound.filter(c=>c.private_evidence.original.analysis.run_id===id).every(c=>run.checked.some(r=>
          r?.analysis_key===c.analysis_key&&JSON.stringify(r.analysis)===JSON.stringify(c.private_evidence.original.analysis)));
      binding.saved_run_status=run?.status??null;
      binding.completed_saved_result_bound=Boolean(sameRun&&['COMPLETE','INCOMPLETE'].includes(run.status));
      binding.status=run===null?'SELECTED_RUN_RESULT_NOT_SAVED':!sameRun?'SELECTED_RUN_REFERENCE_MISMATCH':
        !binding.completed_saved_result_bound?'SELECTED_RUN_FINAL_STATUS_UNCONFIRMED':'BOUND_SELECTED_SAVED_RUN_'+run.status;
    }
  }
  const view={get:async key=>cache.has(key)?cache.get(key):store.get(key),scanPrefix:(...args)=>store.scanPrefix(...args)};
  out.observation=await readSavedAutoObservation({store:view,implementation_sha256:admission.implementation_sha256,expected_recipient_sha256:admission.expected_recipient_sha256,include_executor:false,confirmed_not_before_ts:admission.after_install_ts,clock});
  out.scope={maximum_queue_rows_projected:2,maximum_latest_indexes:2,maximum_candidate_originals:2,maximum_selected_analysis_run:1,card_page_limit:20,maximum_card_originals:1,maximum_business_queries:11,reservation_finalization_queries:4,maximum_total_queries:15,native_query_cap:16,catalog_outcome_waves_not_read:true,whole_history_or_market_claimed:false};
  return out;
}
