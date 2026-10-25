import {selectOutcomeAnchor} from '../analytics/anchors.mjs';
import {summarizeOutcomes} from '../analytics/summary.mjs';
import {textHash} from './delivery.mjs';

const waveKey=a=>'pump:journal:'+a.instrument.instrument_id+':'+a.wave_id;
const signalKey=a=>'pump:signal:'+a.instrument.instrument_id+':'+a.wave_id;
const mapMode=a=>a.liquidations?.map_mode==='WITHOUT_MAP'?'NO_MAP':a.liquidations?.status==='PARTIAL'?'PARTIAL_MAP':'MAP';
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function createOutcomeJournal({store,profile,clock=Date.now,evidence_class='UNCLASSIFIED'}){
  async function remember(analysis,input,analysis_id){
    if(!analysis.wave_id)return;
    const key=waveKey(analysis),at=clock();
    if(!analysis.ready){
      if(analysis.wave_state==='CANCELLED')await store.atomic(key,j=>({state:j?{...j,terminal:{state:'CANCELLED',event_ts:analysis.analysis_ts,recorded_ts:at}}:j,result:true}));
      return;
    }
    const sha=await textHash(JSON.stringify(analysis));if(!analysis_id.endsWith(sha))throw Error('ANALYSIS_CONTENT_HASH_REQUIRED');
    const used=new Set(analysis.fact_ids??[]),known=[...Object.values(input.facts??{}).filter(f=>used.has(f.fact_id)).map(f=>f.received_ts),...(analysis.liquidations?.zones_up??[]).map(z=>z.received_ts),...(analysis.liquidations?.zones_down??[]).map(z=>z.received_ts)].filter(Number.isSafeInteger);
    const origin={instrument_id:analysis.instrument.instrument_id,asset_id:analysis.instrument.asset_id,wave_id:analysis.wave_id,signal_id:signalKey(analysis),t0:analysis.analysis_ts,reference_price:analysis.reference_price,rules_version:analysis.rules_version,profile_version:analysis.profile_version,mode:analysis.mode,map_mode:mapMode(analysis),evidence_class,ready:true};
    const row={analysis_id,analysis_sha256:sha,recorded_ts:at,features_known_ts:known.length?Math.max(...known):null,origin};
    await store.atomic(key,j=>{
      j??={schema:'PUMP_OUTCOME_JOURNAL_V1',analyses:[],publications:[],wave_expires_ts:analysis.next_wave?.expires_ts??analysis.analysis_ts+profile.wave_max_age_ms,terminal:null,frozen_anchor:null};
      const previous=j.analyses.find(r=>r.analysis_id===analysis_id);
      if(previous&&(!equal(previous.origin,row.origin)||previous.analysis_sha256!==sha))throw Error('IMMUTABLE_ANALYSIS_JOURNAL_CONFLICT');
      if(!previous)j.analyses.push(row);return {state:j,result:true};
    });
    await store.atomic('pump:journal-index',ids=>({state:[...new Set([...(ids??[]),key])],result:true}));
  }
  async function publication(card_id){
    const card=await store.get('pump:card:'+card_id);if(!card?.analysis?.source_input_key||!['SENT','UNKNOWN','ERROR','STALE'].includes(card.state))return null;
    const a=card.analysis,key=waveKey(a),state=card.state==='SENT'?'SENT':card.state==='UNKNOWN'?'UNKNOWN':'FAILED';
    const event_ts=card.receipt?.confirmed_ts??card.updated_ts??card.created_ts,recorded_ts=clock();
    const event={event_id:'PUMP_PUBLICATION:'+card_id+':'+state+':'+event_ts,analysis_id:a.source_input_key,event_ts,recorded_ts,state,possible_send:state==='UNKNOWN',message_id:card.message_id??null,receipt_ref:state==='SENT'?'pump:card:'+card_id+'#receipt':null,card_id};
    await store.atomic(key,j=>{if(!j)throw Error('SAVED_ANALYSIS_JOURNAL_REQUIRED');if(!j.publications.some(e=>e.event_id===event.event_id))j.publications.push(event);return {state:j,result:true};});
    return sync(key);
  }
  async function sync(key){
    const journal=await store.get(key);if(!journal)return null;
    const selected=selectOutcomeAnchor({...journal,as_of_ts:clock()});
    if(!selected.eligible){if(selected.status==='QUARANTINED')await store.set('pump:quarantine:'+key,selected);return selected;}
    const saved=await store.get(selected.anchor.analysis_id);if(!saved?.analysis||await textHash(JSON.stringify(saved.analysis))!==selected.anchor.analysis_sha256)throw Error('ANCHOR_SAVED_BYTES_READBACK_FAILED');
    await store.atomic(key,j=>{if(j.frozen_anchor&&!equal(j.frozen_anchor,selected.anchor))throw Error('FROZEN_ANCHOR_CONFLICT');return {state:{...j,frozen_anchor:selected.anchor},result:true};});
    const a=saved.analysis,o=selected.summary_origin,publication=selected.publication;
    const signal={...o,instrument:a.instrument,mode:o.mode,map_mode:o.map_mode==='NO_MAP'?'WITHOUT_MAP':'WITH_MAP',plan:a.plan,analysis_key:selected.anchor.analysis_id,origin:o,publication,deadline_ts:o.t0+profile.horizon_ms};
    await store.atomic(o.signal_id,current=>{if(current?.origin&&!equal(current.origin,o))throw Error('ORIGINAL_SIGNAL_IMMUTABLE');return {state:current?{...current,publication}:signal,result:true};});
    await store.atomic('pump:outcomes-pending',ids=>({state:[...new Set([...(ids??[]),o.signal_id])],result:true}));
    await record(signal,await store.get('pump:outcome:'+o.signal_id));return selected;
  }
  async function syncTerminal(){const ids=await store.get('pump:journal-index')??[],results=[];for(const key of ids){const j=await store.get(key);if(j&&(j.terminal||j.wave_expires_ts<=clock())&&!j.frozen_anchor)results.push(await sync(key));}return results;}
  async function record(signal,outcome){
    if(!signal?.origin)return;
    const payload={origin:signal.origin,publication:signal.publication,outcome:outcome??null},hash=await textHash(JSON.stringify(payload)),key='pump:summary-record:'+hash;
    await store.atomic(key,current=>({state:current??{record_id:key,recorded_ts:clock(),...payload},result:true}));
    await store.atomic('pump:summary-record-index',ids=>({state:[...new Set([...(ids??[]),key])],result:true}));
  }
  async function summary({max_records=1000}={}){
    const ids=await store.get('pump:summary-record-index')??[];
    if(ids.length>max_records)return {status:'SUMMARY_RESOURCE_ADMISSION_REQUIRED',record_count:ids.length,probability:null,success_rate_pct:null};
    const rows=[];for(const key of ids){const row=await store.get(key);if(row)rows.push(row);else throw Error('SUMMARY_RECORD_MISSING');}
    const result=summarizeOutcomes(rows,{as_of_ts:clock()});await store.set('pump:summary-latest',result);return result;
  }
  return {remember,publication,sync,syncTerminal,record,summary};
}
