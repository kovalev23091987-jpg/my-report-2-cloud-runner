import {selectOutcomeAnchor} from '../analytics/anchors.mjs';
import {createMaterializedV3Store} from './materialized-v3-store.mjs';
import {textHash} from './delivery.mjs';
import {recordPurpose,productionRecord} from '../contracts/run-purpose.mjs';
import {createSummaryRecordIndex} from './summary-index.mjs';
import {createWorkIndex} from './work-index.mjs';

const waveKey=a=>'pump:journal:'+a.instrument.instrument_id+':'+a.wave_id;
const signalKey=a=>'pump:signal:'+a.instrument.instrument_id+':'+a.wave_id;
const mapMode=a=>a.liquidations?.map_mode==='WITHOUT_MAP'?'NO_MAP':a.liquidations?.status==='PARTIAL'?'PARTIAL_MAP':'MAP';
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function createOutcomeWorkIndex({store}){
  return createWorkIndex({store,kind:'outcomes',targetKey:id=>id,completed:async(signal,{evidence})=>{
    if(!productionRecord({origin:signal.origin}))return evidence?.schema==='PUMP_OUTCOME_WORK_EXCLUSION_V1'&&evidence.signal_id===signal.signal_id&&equal(evidence.origin,signal.origin);
    const outcome=await store.get('pump:outcome:'+signal.signal_id);
    return ['HIT','MISS'].includes(outcome?.status)&&evidence?.origin?.signal_id===signal.signal_id&&equal(evidence.origin,signal.origin)&&equal(evidence.outcome,outcome);
  }});
}
export function createOutcomeJournal({store,profile,clock=Date.now,evidence_class='UNCLASSIFIED',retained_features=null,continuation_bounds=null}){
  if(typeof store.atomicPair!=='function')throw Error('ATOMIC_WAVE_AND_SUMMARY_STORE_REQUIRED');
  // The old all-purpose aggregate stays intact as historical evidence. This
  // derived production view replays the same append-only index in bounded pages.
  const sourceIndex=createSummaryRecordIndex({store});
  const outcomeWork=createOutcomeWorkIndex({store});
  const journalWork=createWorkIndex({store,kind:'journal',targetKey:id=>id,completed:async(journal,{evidence})=>{
    if(!journal.frozen_anchor||!evidence?.origin?.signal_id)return false;
    const signal=await store.get(evidence.origin.signal_id);
    return signal?.analysis_key===journal.frozen_anchor.analysis_id&&equal(signal.origin,evidence.origin);
  }});
  const resourcesAvailable=()=>{
    if(!store.admission||typeof store.usage!=='function')return true;
    if(store.usage().unknown_ops||store.admission.expires_ts<=clock())return false;
    if(typeof store.nativeRemaining==='function'){const r=store.nativeRemaining();return r.requests>=60&&r.rows_read>=100&&r.rows_written>=25;}
    try{store.check(100,25,60);return true;}catch{return false;}
  };
  const materialized=createMaterializedV3Store({store,clock,resourcesAvailable});
  async function remember(analysis,input,analysis_id,{defer_index=false,native_stage=null,ready_reference=null}={}){
    if(!analysis.wave_id)return;
    const requiredStore=native_stage?store.withStage(native_stage):store;
    const key=waveKey(analysis),now=clock();
    // Only the actual persisted saved-original reference is passed here by the
    // native guard/repair path. Keep its first known READY time on orphan repair;
    // a new repair clock must not move firstREADY behind a later observation.
    if(ready_reference!==null&&(ready_reference.schema!=='PUMP_NATIVE_TAIL_RECOVERY_V1'||
      ready_reference.analysis_key!==analysis_id||ready_reference.producer_run_id!==analysis.run_id||
      !Number.isSafeInteger(ready_reference.created_ts)||ready_reference.created_ts<analysis.analysis_ts||
      ready_reference.created_ts>now))throw Error('SAVED_READY_REFERENCE_CLOCK_UNBOUND');
    const at=ready_reference?.created_ts??now;
    if(!analysis.ready){
      if(analysis.wave_state==='CANCELLED')await requiredStore.atomic(key,j=>({state:j?{...j,terminal:{state:'CANCELLED',event_ts:analysis.analysis_ts,recorded_ts:at}}:j,result:true}));
      return;
    }
    const sha=await textHash(JSON.stringify(analysis));if(!analysis_id.endsWith(sha))throw Error('ANALYSIS_CONTENT_HASH_REQUIRED');

    const used=new Set(analysis.fact_ids??[]),known=[...Object.values(input.facts??{}).filter(f=>used.has(f.fact_id)).map(f=>f.received_ts),...(analysis.liquidations?.zones_up??[]).map(z=>z.received_ts),...(analysis.liquidations?.zones_down??[]).map(z=>z.received_ts)].filter(Number.isSafeInteger);
    const origin={instrument_id:analysis.instrument.instrument_id,asset_id:analysis.instrument.asset_id,wave_id:analysis.wave_id,signal_id:signalKey(analysis),t0:analysis.analysis_ts,reference_price:analysis.reference_price,rules_version:analysis.rules_version,profile_version:analysis.profile_version,mode:analysis.mode,map_mode:mapMode(analysis),evidence_class,run_purpose:input.run_purpose??analysis.run_purpose??'UNCLASSIFIED',ready:true};
    const row={analysis_id,analysis_sha256:sha,recorded_ts:at,features_known_ts:known.length?Math.max(...known):null,origin};
    const pending=await requiredStore.atomic(key,j=>{
      j??={schema:'PUMP_OUTCOME_JOURNAL_V1',analyses:[],publications:[],wave_expires_ts:analysis.next_wave?.expires_ts??analysis.analysis_ts+profile.wave_max_age_ms,terminal:null,frozen_anchor:null};
      const previous=j.analyses.find(r=>r.analysis_id===analysis_id);
      if(previous&&(!equal(previous.origin,row.origin)||previous.analysis_sha256!==sha))throw Error('IMMUTABLE_ANALYSIS_JOURNAL_CONFLICT');
      if(!previous)j.analyses.push(row);return {state:j,result:!j.frozen_anchor};
    });
    if(pending&&!defer_index){await journalWork.ensureReady();await journalWork.add(key);}
  }
  async function publication(card_id,{defer_heavy=false}={}){
    const card=await store.get('pump:card:'+card_id);if(!card?.analysis?.source_input_key||!['SENT','UNKNOWN','ERROR','STALE'].includes(card.state))return null;
    const a=card.analysis,key=waveKey(a),state=card.state==='SENT'?'SENT':card.state==='UNKNOWN'?'UNKNOWN':'FAILED';
    const event_ts=card.receipt?.confirmed_ts??card.updated_ts??card.created_ts,recorded_ts=clock();
    const event={event_id:'PUMP_PUBLICATION:'+card_id+':'+state+':'+event_ts,analysis_id:a.source_input_key,event_ts,recorded_ts,state,possible_send:state==='UNKNOWN',message_id:card.message_id??null,receipt_ref:state==='SENT'?'pump:card:'+card_id+'#receipt':null,card_id};
    await store.atomic(key,j=>{if(!j)throw Error('SAVED_ANALYSIS_JOURNAL_REQUIRED');if(!j.publications.some(e=>e.event_id===event.event_id))j.publications.push(event);return {state:j,result:true};});
    return sync(key,{defer_heavy});
  }
  async function sync(key,{defer_heavy=false}={}){
    const journal=await store.get(key);if(!journal)return null;
    const selected=selectOutcomeAnchor({...journal,as_of_ts:clock()});
    if(!selected.eligible){if(selected.status==='QUARANTINED')await store.set('pump:quarantine:'+key,selected);return selected;}
    const saved=await store.get(selected.anchor.analysis_id);if(!saved?.analysis||await textHash(JSON.stringify(saved.analysis))!==selected.anchor.analysis_sha256)throw Error('ANCHOR_SAVED_BYTES_READBACK_FAILED');
    await store.atomic(key,j=>{
      if(!j)throw Error('ORIGINAL_JOURNAL_REQUIRED');
      const recorded_ts=clock(),current=selectOutcomeAnchor({...j,as_of_ts:recorded_ts});
      if(!current.eligible||!equal(current.anchor,selected.anchor)||!equal(current.publication,selected.publication))throw Error('JOURNAL_SELECTION_CHANGED_RETRY_REQUIRED');
      if(j.frozen_anchor&&!equal(j.frozen_anchor,selected.anchor))throw Error('FROZEN_ANCHOR_CONFLICT');
      let terminal=j.terminal;
      // The actual first expiry closure and its first anchor share the same
      // CAS. Already frozen historical originals never receive retroactive IO.
      if(!j.frozen_anchor&&!terminal&&selected.publication?.state==='UNSENT'){
        if(!Number.isSafeInteger(j.wave_expires_ts)||j.wave_expires_ts<0||recorded_ts<j.wave_expires_ts)throw Error('UNSENT_EXPIRY_TERMINAL_CLOCK_UNBOUND');
        terminal={state:'EXPIRED',event_ts:j.wave_expires_ts,recorded_ts,evidence_ref:key+'#terminal'};
      }
      return {state:{...j,terminal,frozen_anchor:selected.anchor},result:true};
    });
    const a=saved.analysis,o=selected.summary_origin,publication=selected.publication;
    const original_event=journal.publications.find(row=>row.event_id===selected.anchor.selection.publication_event_id);
    const original_refs={original_publication_event_id:original_event?.event_id??null,original_card_id:original_event?.card_id??null};
    const signal={...o,instrument:a.instrument,mode:o.mode,map_mode:o.map_mode==='NO_MAP'?'WITHOUT_MAP':'WITH_MAP',plan:a.plan,analysis_key:selected.anchor.analysis_id,origin:o,publication,...original_refs,deadline_ts:o.t0+profile.horizon_ms};
    await store.atomic(o.signal_id,current=>{if(current?.origin&&!equal(current.origin,o)||current?.original_card_id&&current.original_card_id!==original_refs.original_card_id)throw Error('ORIGINAL_SIGNAL_IMMUTABLE');return {state:current?{...current,publication,...original_refs}:signal,result:true};});
    await outcomeWork.add(o.signal_id);
    const evidence_key=await record(signal,await store.get('pump:outcome:'+o.signal_id),{defer_heavy});
    await journalWork.complete(key,{evidence_key});return {...selected,summary_record_id:evidence_key,signal_id:o.signal_id};
  }
  async function syncTerminal(){
    const page=await journalWork.page({limit:20}),results=[];if(!page.ready)return [{status:'DEFERRED',reason:'WORK_INDEX_MIGRATING'}];
    for(const {id:key} of page.items){if(!resourcesAvailable())break;const j=await store.get(key);if(j&&(j.frozen_anchor||j.terminal||j.wave_expires_ts<=clock()))results.push(await sync(key));}return results;
  }
  async function record(signal,outcome,{defer_heavy=false}={}){
    if(!signal?.origin)return;
    if(!(await sourceIndex.initialize()).ready)throw Error('SUMMARY_INDEX_MIGRATING');
    const payload={origin:signal.origin,publication:signal.publication,outcome:outcome??null},hash=await textHash(JSON.stringify(payload)),key='pump:summary-record:'+hash;
    await store.atomic(key,current=>({state:current??{record_id:key,recorded_ts:clock(),...payload},result:true}));
    await sourceIndex.append(key);
    if(defer_heavy)return key;
    if(retained_features){const projected=await retained_features.record(signal,await store.get(key));if(projected?.status!=='SAVED'){const code=projected?.status==='DEFERRED_NATIVE_PROJECTION'?'DEFERRED_NATIVE_PROJECTION':'RETAINED_PROJECTION_NOT_SAVED';throw Object.assign(Error(code),{code,projection:projected});}}
    await catchUp({max_records:continuation_bounds?.fold_records??4,maturity_limit:0});
    return key;
  }
  async function catchUp({max_records=40,maturity_limit=5}={}){
    const initial=await materialized.recover(),page=await sourceIndex.page({after:initial.source_cursor??0,limit:max_records});
    const total=page.total;
    let processed=0;
    while(processed<max_records&&resourcesAvailable()){
      const aggregate=await materialized.aggregate(),cursor=aggregate.source_cursor??0;
      if(!page.migration_ready||cursor===total)break;
      const item=page.items.find(r=>r.seq===cursor+1);if(!item)break;
      const key=item.id,row=await store.get(key);if(!row||row.record_id!==key)throw Error('SUMMARY_RECORD_MISSING');
      const {origin,publication,outcome}=row;
      if(key!=='pump:summary-record:'+await textHash(JSON.stringify({origin,publication,outcome})))throw Error('SUMMARY_RECORD_CONTENT_HASH_MISMATCH');
      if(!productionRecord(row)){
        const purpose=recordPurpose(row),reason=purpose==='PRODUCTION'?'NON_OBSERVED':purpose;
        const committed=await materialized.exclude(cursor,reason);
        if(committed)processed++;continue;
      }
      const committed=await materialized.fold(row,item.seq,cursor);
      if(committed)processed++;
    }
    const view=await materialized.read({maturity_limit:Math.min(40,maturity_limit)}),source_cursor=view.source_cursor??0;
    const boundary=await sourceIndex.boundary();if(source_cursor>boundary.count)throw Error('SUMMARY_APPEND_ONLY_INDEX_RECONCILIATION_REQUIRED');
    const caught=page.migration_ready&&boundary.ready&&!boundary.pending&&source_cursor===boundary.count;
    return {...view,run_purpose:'PRODUCTION',status:!page.migration_ready||!boundary.ready?'SUMMARY_INDEX_MIGRATING':!caught?'SUMMARY_CATCHUP_REQUIRED':view.status,source_cursor,source_records_at_boundary:boundary.count,source_caught_up:caught,processed_records:processed,source_index_append_only:true,source_index_bounded:true};
  }
  async function summary({max_records=40}={}){
    if(!Number.isSafeInteger(max_records)||max_records<1||max_records>40)throw Error('SUMMARY_PAGE_BOUND_1_TO_40_REQUIRED');
    const result=await catchUp({max_records,maturity_limit:5}),m=result.mature_outcomes;
    result.status_text_ru=result.status==='CURRENT'?'Независимых волн: '+result.independent_waves+'. Зрелых: '+result.mature_waves+'; HIT '+m.hit+', MISS '+m.miss+', UNKNOWN '+m.unknown+'. Ещё не завершены: '+result.pending_waves+'. Процент успешности и вероятность пока не оценены.':'Сводка обновляется; текущие счётчики неполны. Процент успешности и вероятность пока не оценены.';
    await store.set('pump:summary-latest',result);return result;
  }
  return {remember,publication,sync,syncTerminal,record,summary,catchUp};
}
