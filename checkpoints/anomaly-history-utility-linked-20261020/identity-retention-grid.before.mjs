// Offline integration proposal for three observed prototype design risks.
// Qualified native identity/grid must come from a separate trusted ingest.
import {hash,TIMEFRAMES} from '../observer/observer.mjs';
const need=(v,m)=>{if(!v)throw Error(m);},str=v=>typeof v==='string'&&v.trim().length>0;
const ts=v=>Number.isSafeInteger(v)&&v>=1e12,num=v=>typeof v==='number'&&Number.isFinite(v);
function card(c){const {card_hash,...body}=c||{};need(card_hash===hash(body),'CARD_INTEGRITY');}
export function nativeMarketKey(instrument,native){
 need(instrument&&native&&['venue','market','native_instrument_id','instrument_epoch','contract_code','qualification_ref'].every(k=>str(native[k]))&&native.venue===instrument.venue&&native.market===instrument.market&&native.contract_code===instrument.contract&&native.qualified===true,'QUALIFIED_STABLE_NATIVE_ID_REQUIRED');
 return {venue:native.venue,market:native.market,native_instrument_id:native.native_instrument_id,instrument_epoch:native.instrument_epoch};
}
export function logicalEventIdentity(c,native){
 card(c);const market=nativeMarketKey(c.instrument,native);
 const key={market,timeframe:c.timeframe,event_start_ts:c.event_start_ts,event_end_ts:c.event_end_ts,event_family:'EFFORT_VS_RESULT'};
 return {logical_event_id:'LOGICAL_ANOM:'+hash(key),key,provenance_revision:hash({card_hash:c.card_hash,binding_ref:c.instrument.binding_ref,rules_hash:c.rules_hash,raw_sha256:c.provenance.raw_sha256}),native_identity_externally_qualified_here:false};
}
export function logicalCohortKey(logical_event_id,horizon,direction){
 need(str(logical_event_id)&&str(horizon)&&['LONG','SHORT'].includes(direction),'COHORT_KEY_ARGUMENTS');
 return hash({logical_event_id,horizon,direction});
}
export function newRegistry({max_events=512,max_revisions=32}={}){
 need(Number.isInteger(max_events)&&max_events>0&&Number.isInteger(max_revisions)&&max_revisions>0,'REGISTRY_BOUNDS');
 return {schema:'LOGICAL_ANOMALY_REGISTRY_V1',limits:{max_events,max_revisions},events:{}};
}
export function registerRevision(registry,c,native){
 const identity=logicalEventIdentity(c,native),id=identity.logical_event_id,old=registry.events[id];
 // Price/volume units are material facts. A changed unit must be reconciled,
 // never converted implicitly or counted as a separate independent event.
 const facts=hash({candle:c.candle,price_unit:c.instrument.price_unit,volume_unit:c.instrument.volume_unit,multiplier:c.instrument.multiplier});
 const legacyRevisionKey=hash({binding_ref:c.instrument.binding_ref,asset_id:c.instrument.asset_id,rules_hash:c.rules_hash,raw_sha256:c.provenance.raw_sha256,facts});
 // A body digest does not identify its retained locator or native mapping
 // receipt. Keep both proof references without creating another event.
 const revisionKey=hash({version:'PROOF_REFERENCE_V2',fact_revision_key:legacyRevisionKey,raw_ref:c.provenance.raw_ref,qualification_ref:native.qualification_ref});
 if(old?.revisions.some(r=>r.revision_key===revisionKey||r.revision_key===legacyRevisionKey&&r.raw_ref===c.provenance.raw_ref&&r.qualification_ref===native.qualification_ref))return {state:registry,status:'DUPLICATE_REVISION',logical_event_id:id};
 if(!old&&Object.keys(registry.events).length>=registry.limits.max_events||old&&old.revisions.length>=registry.limits.max_revisions)return {state:registry,status:'DEFERRED_REGISTRY_CAPACITY',logical_event_id:id};
 const state=structuredClone(registry),revision={revision_key:revisionKey,revision_key_version:'PROOF_REFERENCE_V2',card_hash:c.card_hash,raw_ref:c.provenance.raw_ref,raw_sha256:c.provenance.raw_sha256,claimed_first_known_ts:c.first_known_ts,qualification_ref:native.qualification_ref,rules_hash:c.rules_hash,fact_hash:facts};
 if(!old)state.events[id]={...identity,first_known_ts:c.first_known_ts,canonical_card:structuredClone(c),canonical_fact_hash:facts,revisions:[revision],conflicting_native_facts:false};
 else{state.events[id].revisions.push(revision);if(old.canonical_fact_hash!==facts)state.events[id].conflicting_native_facts=true;}
 return {state,status:old?(old.canonical_fact_hash===facts?'PROVENANCE_REVISION':'CONFLICTING_NATIVE_FACTS'):'REGISTERED',logical_event_id:id,independent_new_event:!old,canonical_first_known_ts:state.events[id].first_known_ts};
}
export function confirmationVerdict({event,native,snapshot,snapshot_native,grid,now_ts,max_age_ms=300000}={}){
 card(event);need(ts(now_ts)&&Number.isSafeInteger(max_age_ms)&&max_age_ms>0&&max_age_ms<=300000&&snapshot&&ts(snapshot.source_ts)&&ts(snapshot.received_ts)&&snapshot.source_ts<=snapshot.received_ts&&snapshot.received_ts<=now_ts&&now_ts-snapshot.source_ts<=max_age_ms,'FRESH_CONFIRMATION_SOURCE_REQUIRED');
 const a=nativeMarketKey(event.instrument,native),b=nativeMarketKey(snapshot.instrument,snapshot_native);
 need(hash(a)===hash(b)&&event.instrument.price_unit===snapshot.instrument.price_unit&&event.instrument.multiplier===snapshot.instrument.multiplier,'SAME_NATIVE_PRICE_MARKET_REQUIRED');
 const durations={...TIMEFRAMES,'1m':60000,'5m':300000},d=durations[event.conditions.timeframe];
 need(d&&grid&&grid.qualified===true&&str(grid.native_grid_ref)&&grid.timeframe===event.conditions.timeframe&&grid.market_key&&hash(grid.market_key)===hash(a)&&Number.isSafeInteger(grid.alignment_offset_ms)&&grid.alignment_offset_ms>=0&&grid.alignment_offset_ms<d,'NATIVE_CONFIRMATION_GRID_REQUIRED');
 const c=snapshot.closed_candle;
 need(c&&c.timeframe===grid.timeframe&&ts(c.start_ts)&&c.end_ts===c.start_ts+d&&(c.start_ts-grid.alignment_offset_ms)%d===0&&c.start_ts>=event.first_known_ts&&c.end_ts<=snapshot.source_ts&&snapshot.source_ts-c.end_ts<=max_age_ms&&['open','high','low','close'].every(k=>num(c[k])&&c[k]>0)&&c.low<=Math.min(c.open,c.close)&&c.high>=Math.max(c.open,c.close)&&c.low<=c.high&&c.raw_sha256===snapshot.raw_sha256&&/^[a-f0-9]{64}$/.test(c.raw_sha256),'CLOSED_NATIVE_CONFIRMATION_INVALID');
 return {status:c.close>event.candle.high?'CLOSED_ABOVE':c.close<event.candle.low?'CLOSED_BELOW':'CLOSED_INSIDE',LONG:c.close>event.candle.high?'CONFIRMED':c.close<event.candle.low?'REFUTED':'UNCHANGED',SHORT:c.close<event.candle.low?'CONFIRMED':c.close>event.candle.high?'REFUTED':'UNCHANGED',native_alignment_offset_ms:grid.alignment_offset_ms,event_alignment_not_reused:true,source_ts:snapshot.source_ts,entry_authorized:false,main_score_effect:0,external_grid_proof_qualified_by_this_function:false};
}
export function retentionDecision({logical_event,active,latest_source,detail_age_ms,reference_graph_complete,planned_outcome_keys,outcomes,outbox}={}){
 const reasons=[];need(logical_event?.canonical_card&&Array.isArray(logical_event.revisions),'LOGICAL_EVENT_REQUIRED');
 if(active!==false)reasons.push(active===true?'ACTIVE_WATCH':'WATCH_STATE_UNKNOWN');
 if(latest_source!==false)reasons.push(latest_source===true?'LATEST_NEEDED_SOURCE':'LATEST_SOURCE_UNKNOWN');
 if(reference_graph_complete!==true)reasons.push('REFERENCE_GRAPH_NOT_QUALIFIED');
 if(logical_event.conflicting_native_facts)reasons.push('UNRESOLVED_NATIVE_FACT_CONFLICT');
 if(!num(detail_age_ms)||detail_age_ms<48*3600000)reasons.push('HOT_48H_OR_AGE_UNKNOWN');
 const final=new Set(['SUCCESSFUL','FALSE','OPPOSITE','UNWORKED','CENSORED_FINAL']);
 if(!Array.isArray(planned_outcome_keys)||!planned_outcome_keys.length||new Set(planned_outcome_keys).size!==planned_outcome_keys.length||!Array.isArray(outcomes))reasons.push('OUTCOME_PLAN_OR_STATE_UNKNOWN');
 else{
  const map=new Map();for(const o of outcomes){if(map.has(o.key)){reasons.push('CONFLICTING_OUTCOME_REFERENCES');continue;}map.set(o.key,o);}
  for(const key of planned_outcome_keys){const o=map.get(key);if(!o||!final.has(o.status))reasons.push('UNFINISHED_OUTCOME:'+key);}
  if(outcomes.some(o=>!planned_outcome_keys.includes(o.key)))reasons.push('UNPLANNED_OUTCOME_REFERENCE');
 }
 if(!Array.isArray(outbox))reasons.push('OUTBOX_STATE_UNKNOWN');
 else for(const o of outbox)if(!(o.status==='SENT'&&str(o.message_id)||o.status==='FAILED_FINAL'&&o.resolved_no_send===true))reasons.push('UNRESOLVED_OUTBOX:'+String(o.key));
 const refs=new Map(logical_event.revisions.map(r=>[r.raw_sha256+'|'+r.raw_ref,{raw_ref:r.raw_ref,raw_sha256:r.raw_sha256}]));
 return {eligible_detail_expiry:reasons.length===0,reasons:[...new Set(reasons)],protect_cards_anchors_statistics:true,protected_proof_refs:reasons.length?[...refs.values()]:[],planned_outcome_count:Array.isArray(planned_outcome_keys)?planned_outcome_keys.length:null,production_retention_hook_installed:false,SQL_executed:0};
}
