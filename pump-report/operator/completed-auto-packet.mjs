import {readSavedAutoObservation} from './saved-auto-observation.mjs';
import {readSavedAutoCandidateObservation} from './saved-auto-candidate-observation.mjs';
import {readSavedOutcomeObservation} from './saved-outcome-observation.mjs';
import {readSavedCatalogSnapshot} from './saved-catalog-snapshot.mjs';

// The maximum is twelve business reads plus the existing four reservation /
// finalization queries. Reuse captured executor/run values explicitly; never
// replace the actual in-flight executor with a fictitious completed executor.
export async function readCompletedAutoPacket({store,admission,clock=Date.now}){
  const executor=await store.get('pump:executor'),resources=await store.get('pump:resources'),selector_observed_ts=clock();
  const grants=Object.values(resources?.automatic_surplus_grants??{});if(grants.length>200)throw Error('RECENT_GRANT_BOUND');
  const closed=grants.filter(g=>g.state==='CLOSED'&&Number.isSafeInteger(g.created_ts)&&g.created_ts>=admission.after_install_ts&&g.run_id!==executor?.run_id&&/^[a-f0-9-]{36}$/.test(g.run_id??'')).sort((a,b)=>b.created_ts-a.created_ts);
  const run_id=!executor?.owner&&/^[a-f0-9-]{36}$/.test(executor?.run_id??'')?executor.run_id:closed[0]?.run_id??null;
  const run=run_id?await store.get('pump:run:'+run_id):null;if(run&&run.run_id!==run_id)throw Error('KNOWN_RUN_ID_MISMATCH');
  const out={recent_selector:{basis:executor?.owner?'LATEST_CLOSED_POST_INSTALL_GRANT_EXCLUDING_LIVE_EXECUTOR':'RELEASED_EXECUTOR',after_install_ts:admission.after_install_ts,
    grant_rows:grants.length,selected_run_id:run_id,live_executor:executor,selector_observed_ts},known_run_id:run_id,known_run:run,
    known_run_status:run?'SAVED_KNOWN_RUN':'KNOWN_RUN_NOT_SAVED',known_candidates:[],project_resources:resources};
  const checked=run?.checked??[],sent=checked.find(row=>row.delivery?.state==='SENT'&&/^PUMP:[a-f0-9]{64}$/.test(row.delivery.card_id??''));
  // Prioritize one delivery original. Two originals remain available when no
  // selected delivery exists; the saved outcome then performs no extra reads.
  const maximum=sent?1:2,selected=[],used=new Set(),originals=new Map();
  const add=row=>{if(row&&selected.length<maximum&&!used.has(row.analysis_key)){selected.push(row);used.add(row.analysis_key);}};
  add(sent);for(const id of admission.candidate_instrument_ids)add(checked.find(row=>row.analysis?.instrument?.instrument_id===id));for(const row of checked)add(row);
  for(const row of selected){
    const result=await readSavedAutoCandidateObservation({store,observation:{latest_run_id:run_id,private_evidence:{run:{...run,checked:[row]}}},implementation_sha256:admission.implementation_sha256});
    out.known_candidates.push(result);if(result.analysis_key&&result.private_evidence?.original)originals.set(result.analysis_key,result.private_evidence.original);
  }
  if(sent){
    const target='pump:card:'+sent.delivery.card_id;let physicalPageRows=0,live_run_not_read=false;
    const view={async get(key){
      if(key==='pump:executor')return executor;
      if(key==='pump:run:'+run_id)return run;
      if(executor?.owner&&key==='pump:run:'+executor.run_id){live_run_not_read=true;return null;}
      if(key.startsWith('pump:analysis:')){if(!originals.has(key))throw Error('CARD_ORIGINAL_OUTSIDE_SELECTED_CAP');return originals.get(key);}
      return store.get(key);
    },async scanPrefix(prefix){const page=await store.scanPrefix(prefix,{after_key:target.slice(0,-1),limit:20});physicalPageRows=page.length;return page.filter(row=>row.key===target);}};
    out.observation=await readSavedAutoObservation({store:view,implementation_sha256:admission.implementation_sha256,expected_recipient_sha256:admission.expected_recipient_sha256,clock,after_key:target.slice(0,-1)});
    Object.assign(out.observation.scope,{known_run_card_projection:true,physical_page_rows:physicalPageRows,executor_snapshot_reused:true,executor_snapshot_ts:selector_observed_ts,
      selected_run_snapshot_reused:true,live_run_outside_scope_not_read:live_run_not_read});
  }else out.observation={schema:'PUMP_KNOWN_AUTO_RUN_NO_SELECTED_CARD_V1',status:run?'NO_SELECTED_SENT_CARD_IN_KNOWN_RUN':'KNOWN_RUN_NOT_SAVED',first_genuine_same_original_SENT_observed:false,private_evidence:{card:null,original:null},market_HTTP:0,Telegram:0};
  const queue=await store.get('pump:candidate-queue');
  out.requested_candidate_queue=Object.fromEntries(admission.candidate_instrument_ids.map(id=>[id,queue?.[id]??null]));
  if(admission.read_retained_wave===true){
    const candidate=out.known_candidates.find(row=>row.private_evidence?.original?.analysis),analysis=candidate?.private_evidence?.original?.analysis;
    if(analysis){const key='pump:wave:'+analysis.instrument.instrument_id,value=await store.get(key);out.retained_wave={key,observed_ts:clock(),value,
      same_wave_id:value?.wave_id===analysis.wave_id,analysis_next_wave_not_substituted:true};}
    else out.retained_wave={status:'NO_SELECTED_ORIGINAL',analysis_next_wave_not_substituted:true};
  }
  if(admission.read_saved_outcome===true)out.saved_outcome=await readSavedOutcomeObservation({store,observation:out.observation});
  if(admission.read_catalog_snapshot===true)out.catalog_snapshot=await readSavedCatalogSnapshot({store,implementation_sha256:admission.implementation_sha256,clock});
  out.scope={known_run_PK:1,candidate_queue_PK:1,maximum_selected_originals:2,maximum_selected_cards:1,maximum_retained_waves:1,
    physical_card_page_limit:20,maximum_business_reads:12,reservation_finalization_queries:4,maximum_total_queries:16,whole_history_or_day_claimed:false};
  return out;
}
