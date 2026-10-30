import {validTime,finite} from '../contracts/index.mjs';
import {summarizeOutcomes} from './summary.mjs';

export const MATERIALIZED_VERSION='pump-materialized-summary-v1-tz2-20261025';
const scalarFields=['independent_waves','mature_waves','pending_waves','pending_known_hits','gapped_mature_waves','coverage_unknown_mature_waves','enclosing_no_hit_proof_mature_waves','origin_conflict_waves','outcome_conflict_waves','identity_conflict_waves'];
const objectFields=['outcomes','mature_outcomes','denominators','publication_counts','reason_counts'];
const text=v=>typeof v==='string'&&v.trim().length>0;
const stable=v=>v&&typeof v==='object'?Array.isArray(v)?'['+v.map(stable).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}':JSON.stringify(v);
const order=(a,b)=>a.recorded_ts-b.recorded_ts||(a.record_id<b.record_id?-1:a.record_id>b.record_id?1:0);
const newest=(a,b)=>!a||order(a,b)<0?b:a;
const clone=v=>structuredClone(v);
const waveKey=o=>JSON.stringify([o.instrument_id,o.wave_id]);
const own=(o,k)=>Object.hasOwn(o,k)?o[k]:undefined;
async function hash(value){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stable(value)));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');}
const preparedEvents=new WeakSet();
const freeze=v=>{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;};
export async function prepareOutcomeRecordEvent(event){
  if(event?.kind==='DELIVERY_DIAGNOSTIC'){const prepared=Object.freeze({kind:event.kind});preparedEvents.add(prepared);return prepared;}
  if(event?.kind!=='OUTCOME_RECORD'||!text(event.event_id)||!event.record||event.event_id!==event.record.record_id||event.revision!==undefined&&(!Number.isSafeInteger(event.revision)||event.revision<1))throw Error('IMMUTABLE_OUTCOME_RECORD_EVENT_REQUIRED');
  const record=clone(event.record),fingerprint=await hash(record),prepared=freeze({kind:event.kind,event_id:event.event_id,revision:event.revision??null,record,fingerprint});
  preparedEvents.add(prepared);return prepared;
}
function emptyCounters(){
  return {...Object.fromEntries(scalarFields.map(k=>[k,0])),outcomes:{hit:0,miss:0,unknown:0},mature_outcomes:{hit:0,miss:0,unknown:0},
    denominators:{all_independent_waves:0,mature_waves:0,resolved_mature_waves:0,unknown_mature_waves:0,pending_excluded_from_mature:0},publication_counts:{sent:0,unsent:0,unknown:0},reason_counts:{},
    adverse:{total_drawdown_known:0,total_drawdown_unknown:0,pre_hit_drawdown_known:0,pre_hit_drawdown_unknown:0,hit_after_invalidation_yes:0,hit_after_invalidation_no:0,hit_after_invalidation_unknown:0}};
}
function numericDelta(target,source,sign){
  for(const [k,value] of Object.entries(source)){
    if(typeof value==='object'&&value!==null){target[k]??={};numericDelta(target[k],value,sign);}
    else if(typeof value==='number'){
      const next=(own(target,k)??0)+sign*value;if(!Number.isSafeInteger(next)||next<0)throw Error('MATERIALIZED_COUNTER_INVARIANT');
      Object.defineProperty(target,k,{value:next,writable:true,enumerable:true,configurable:true});
    }
  }
}
const counters=q=>Object.fromEntries([...scalarFields,...objectFields].map(k=>[k,clone(q[k])]));
function witnesses(wave){const rows=[wave.first,wave.last,wave.valid,wave.hit,wave.miss,wave.sent,...Object.values(wave.invalid)];const byId=new Map();for(const r of rows)if(r)byId.set(r.record_id,r);return [...byId.values()].sort(order);}
function selected(wave){return wave.hit??wave.miss??wave.valid??wave.last;}
function contribution(wave,at){
  const q=summarizeOutcomes(witnesses(wave),{as_of_ts:at});if(q.independent_waves!==1||q.cohorts.length!==1)throw Error('SINGLE_FROZEN_WAVE_REQUIRED');
  const c=q.cohorts[0],o=selected(wave)?.outcome,status=q.outcomes.hit?'HIT':q.outcomes.miss?'MISS':'UNKNOWN';
  const number=v=>q.outcome_conflict_waves===0&&finite(v)&&v>=0&&v<=100?v:null;
  const drawdown_total_pct=o?.coverage?.complete===true&&at>=wave.origin.t0+14400000?number(o?.drawdown_total_pct):null;
  const drawdown_before_hit_pct=status==='HIT'&&validTime(o?.hit_ts)&&!(o.reasons??[]).some(r=>['PRE_HIT_COVERAGE_INCOMPLETE','INTRABAR_FIRST_HIT_TIME_AND_ORDER_UNKNOWN'].includes(r))?number(o?.drawdown_before_hit_pct):null;
  const adverse={drawdown_total_pct,drawdown_before_hit_pct,hit_after_invalidation:typeof o?.hit_after_invalidation==='boolean'?o.hit_after_invalidation:null,
    source_record_id:selected(wave)?.record_id??null,outcome_conflicted:q.outcome_conflict_waves>0,execution_proven:false,user_profit:null};
  const totals=counters(q);totals.adverse={total_drawdown_known:drawdown_total_pct===null?0:1,total_drawdown_unknown:drawdown_total_pct===null?1:0,
    pre_hit_drawdown_known:status==='HIT'&&drawdown_before_hit_pct!==null?1:0,pre_hit_drawdown_unknown:status==='HIT'&&drawdown_before_hit_pct===null?1:0,
    hit_after_invalidation_yes:status==='HIT'&&adverse.hit_after_invalidation===true?1:0,hit_after_invalidation_no:status==='HIT'&&adverse.hit_after_invalidation===false?1:0,
    hit_after_invalidation_unknown:status==='HIT'&&adverse.hit_after_invalidation===null?1:0};
  return {cohort_key:c.cohort_key,descriptor:Object.fromEntries(['mode','publication','map_mode','rules_version','profile_version','evidence_class'].map(k=>[k,c[k]])),counters:totals,adverse};
}
function context(aggregate,wave,at){
  if(aggregate?.version!==MATERIALIZED_VERSION||!text(aggregate.materialization_id)||!validTime(at)||at<aggregate.updated_ts)throw Error('MATERIALIZED_CONTEXT_OR_CLOCK_INVALID');
  if(wave&&(wave.materialization_id!==aggregate.materialization_id||!Number.isSafeInteger(wave.state_revision)||at<wave.observed_as_of_ts))throw Error('WAVE_MATERIALIZATION_OR_CLOCK_INVALID');
}
function replace(aggregate,before,after,at){
  const next=clone(aggregate),old=before?.contribution,contributionNext=after.contribution;
  if(old){
    if(!own(next.cohorts,old.cohort_key))throw Error('PREVIOUS_WAVE_CONTRIBUTION_NOT_APPLIED');
    numericDelta(next.counters,old.counters,-1);numericDelta(next.cohorts[old.cohort_key].counters,old.counters,-1);
    if(next.cohorts[old.cohort_key].counters.independent_waves===0)delete next.cohorts[old.cohort_key];
  }
  next.cohorts[contributionNext.cohort_key]??={cohort_key:contributionNext.cohort_key,...contributionNext.descriptor,counters:emptyCounters()};
  numericDelta(next.counters,contributionNext.counters,1);numericDelta(next.cohorts[contributionNext.cohort_key].counters,contributionNext.counters,1);
  for(const reason of Object.keys(next.counters.reason_counts))if(next.counters.reason_counts[reason]===0)delete next.counters.reason_counts[reason];
  for(const c of Object.values(next.cohorts))for(const reason of Object.keys(c.counters.reason_counts))if(c.counters.reason_counts[reason]===0)delete c.counters.reason_counts[reason];
  if(contributionNext.counters.pending_waves)next.pending_deadlines[after.wave_key]={deadline_ts:after.origin.t0+14400000,state_revision:after.state_revision};else delete next.pending_deadlines[after.wave_key];
  next.revision++;next.updated_ts=at;return next;
}
export function createMaterializedSummary({materialization_id,as_of_ts}={}){
  if(!text(materialization_id)||!validTime(as_of_ts))throw Error('MATERIALIZATION_ID_AND_CLOCK_REQUIRED');
  return {version:MATERIALIZED_VERSION,materialization_id,revision:0,updated_ts:as_of_ts,records_applied:0,counters:emptyCounters(),cohorts:{},instrument_assets:{},pending_deadlines:{}};
}

// Inputs are immutable normalized ROOT journal records, not raw card drafts.
// ROOT must atomically CAS the aggregate AND this wave against `expected`.
// The retained original observations are outside this compact derived state.
export async function foldOutcomeRecord(options={}){
  const prepared_event=await prepareOutcomeRecordEvent(options.event);return foldPreparedOutcomeRecord({...options,prepared_event});
}
// SHA preparation is outside ROOT's synchronous atomicPair callback. Prepared
// events are transient, frozen and not persisted; retry against fresh states.
export function foldPreparedOutcomeRecord({aggregate,wave=null,prepared_event,as_of_ts}={}){
  context(aggregate,wave,as_of_ts);
  if(!preparedEvents.has(prepared_event))throw Error('PREPARED_EVENT_FROM_THIS_MODULE_REQUIRED');
  const event=prepared_event;
  if(event?.kind==='DELIVERY_DIAGNOSTIC')return {status:'IGNORED_DELIVERY_DIAGNOSTIC',aggregate,wave,write_required:false};
  const r=clone(event.record),single=summarizeOutcomes([r],{as_of_ts});
  if(!['SENT','UNSENT','UNKNOWN'].includes(r.publication?.state))throw Error('NORMALIZED_PUBLICATION_STATE_REQUIRED');
  if(single.independent_waves!==1||single.excluded_future_records||single.excluded_non_ready_records)throw Error('READY_KNOWN_NORMALIZED_RECORD_REQUIRED');
  const key=waveKey(r.origin),fingerprint=event.fingerprint,id='record:'+r.record_id,revision=event.revision??(wave?.event_revision??0)+1;
  if(wave){
    if(wave.wave_key!==key||stable(wave.origin)!==stable(r.origin))throw Error('IMMUTABLE_WAVE_ORIGIN_CONFLICT');
    const seen=own(wave.record_digests,id);
    if(seen){if(seen!==fingerprint)throw Error('IMMUTABLE_RECORD_ID_CONFLICT');return {status:'DUPLICATE_EVENT',aggregate,wave,write_required:false};}
    if(revision!==wave.event_revision+1||r.recorded_ts<wave.last_recorded_ts)throw Error('WAVE_EVENT_REVISION_OR_CLOCK_OUT_OF_ORDER');
  }else if(revision!==1)throw Error('NEW_WAVE_MUST_START_AT_REVISION_ONE');
  const instrument='instrument:'+r.origin.instrument_id,asset=own(aggregate.instrument_assets,instrument);
  if(asset&&asset!==r.origin.asset_id)throw Error('INSTRUMENT_ASSET_CONFLICT');
  const next=wave?clone(wave):{materialization_id:aggregate.materialization_id,wave_key:key,origin:clone(r.origin),state_revision:0,event_revision:0,record_digests:{},invalid:{},first:clone(r),last:null,valid:null,hit:null,miss:null,sent:null};
  next.last=newest(next.last,r);
  if(single.invalid_records===0){next.valid=newest(next.valid,r);if(r.outcome?.status==='HIT')next.hit=newest(next.hit,r);if(r.outcome?.status==='MISS')next.miss=newest(next.miss,r);}
  else for(const issue of single.invalid_record_details)next.invalid[issue.reason]=newest(next.invalid[issue.reason],r);
  if(single.publication_counts.sent===1&&!next.sent)next.sent=clone(r);
  next.record_digests[id]=fingerprint;next.event_revision=revision;next.state_revision++;next.last_recorded_ts=r.recorded_ts;next.observed_as_of_ts=as_of_ts;
  next.contribution=contribution(next,as_of_ts);
  const updated=replace(aggregate,wave,next,as_of_ts);updated.records_applied++;updated.instrument_assets[instrument]=r.origin.asset_id;
  return {status:'APPLIED',write_required:true,expected:{aggregate_revision:aggregate.revision,wave_state_revision:wave?.state_revision??null},aggregate:updated,wave:next,
    maturity_due_ts:next.contribution.counters.pending_waves?next.origin.t0+14400000:null,input_record_mutated:false,raw_persistence_verified:false};
}

export function advanceWaveMaturity({aggregate,wave,as_of_ts}={}){
  context(aggregate,wave,as_of_ts);if(!wave)throw Error('MATURITY_WAVE_REQUIRED');
  if(!wave.contribution.counters.pending_waves||as_of_ts<wave.origin.t0+14400000)return {status:'NO_CLOCK_CHANGE',aggregate,wave,write_required:false};
  const next=clone(wave);next.state_revision++;next.observed_as_of_ts=as_of_ts;next.contribution=contribution(next,as_of_ts);
  const updated=replace(aggregate,wave,next,as_of_ts);
  return {status:'MATURED',write_required:true,expected:{aggregate_revision:aggregate.revision,wave_state_revision:wave.state_revision},aggregate:updated,wave:next,maturity_due_ts:null};
}
export function dueMaturityWaves(aggregate,{as_of_ts,limit=5}={}){
  context(aggregate,null,as_of_ts);if(!Number.isSafeInteger(limit)||limit<1||limit>40)throw Error('MATURITY_PAGE_BOUND_REQUIRED');
  return Object.entries(aggregate.pending_deadlines).filter(([,v])=>v.deadline_ts<=as_of_ts).sort(([a,x],[b,y])=>x.deadline_ts-y.deadline_ts||(a<b?-1:a>b?1:0)).slice(0,limit).map(([wave_key,v])=>({wave_key,...v}));
}
export function readMaterializedSummary(aggregate,{as_of_ts}={}){
  context(aggregate,null,as_of_ts);
  const due=Object.values(aggregate.pending_deadlines).filter(v=>v.deadline_ts<=as_of_ts).length;
  return {schema:'PUMP_MATERIALIZED_SUMMARY_V1',version:MATERIALIZED_VERSION,materialization_id:aggregate.materialization_id,revision:aggregate.revision,as_of_ts,
    status:due?'MATURITY_UPDATES_REQUIRED':'CURRENT',maturity_current:due===0,pending_clock_transitions:due,materialized_updated_ts:aggregate.updated_ts,...clone(aggregate.counters),
    cohorts:Object.values(aggregate.cohorts).sort((a,b)=>a.cohort_key<b.cohort_key?-1:a.cohort_key>b.cohort_key?1:0).map(({counters,...c})=>({...clone(c),...clone(counters)})),
    success_rate_pct:null,probability:{value_pct:null,reason:'CALIBRATION_NOT_PERFORMED'},calibration_validated:false,publication_allowed:false,external_provenance_authenticated:false,
    readiness_status:'SEPARATE_RESOURCE_ADMITTED_COHORT_AUDIT_REQUIRED',limitations:['Materialized counts require atomic aggregate+wave commit','Exact counters for frozen normalized append-only journal records; protocol conflicts stop reconciliation','When maturity_current=false mature/pending counters need explicit due transitions','No raw observations removed; no full-history read on query','No probability, calibration, profit or native storage capacity proven']};
}

// X2: ROOT-approved V3 storage contract. Old exports/states remain unchanged;
// actual ROOT storage/queue/runtime admission is separate from this kernel.
export const MATERIALIZED_V3_VERSION='pump-materialized-summary-v3-external-replay-20261025';
const receiptSchemaV3='pump-materialized-record-receipt-v3-20261025';
const bindingSchemaV3='pump-materialized-instrument-binding-v3-20261025';
const maturitySchemaV3='pump-materialized-maturity-reference-v3-20261025';
function contextV3(aggregate,wave,at,{allow_pending=false}={}){
  if(aggregate?.version!==MATERIALIZED_V3_VERSION||!text(aggregate.materialization_id)||!validTime(at)||at<aggregate.updated_ts||!Number.isSafeInteger(aggregate.source_cursor)||aggregate.source_cursor<0)throw Error('MATERIALIZED_V3_CONTEXT_REQUIRED');
  if(wave&&(wave.version!==MATERIALIZED_V3_VERSION||wave.materialization_id!==aggregate.materialization_id||!Number.isSafeInteger(wave.state_revision)||at<wave.observed_as_of_ts))throw Error('MATERIALIZED_V3_WAVE_REQUIRED');
  if(!allow_pending&&aggregate.maturity_pending)throw Error('MATERIALIZED_V3_PENDING_QUEUE_INTENT');
  if(['record_digests','pending_deadlines','instrument_assets'].some(k=>Object.hasOwn(aggregate,k))||wave&&Object.hasOwn(wave,'record_digests'))throw Error('MATERIALIZED_V3_EXTERNAL_STATE_REQUIRED');
}
function shadowV3(aggregate,wave,binding=null){
  const a=clone(aggregate);a.version=MATERIALIZED_VERSION;a.pending_deadlines={};a.instrument_assets={};
  if(binding)a.instrument_assets['instrument:'+binding.instrument_id]=binding.asset_id;
  delete a.maturity_pending;delete a.source_cursor;
  const w=wave?clone(wave):null;if(w){delete w.version;w.record_digests={};}
  return {aggregate:a,wave:w};
}
function finishV3Step(before,folded,{source_cursor,kind,record_id=null,fingerprint=null}={}){
  if(!folded.write_required)return {...folded,aggregate:before};
  const a=clone(folded.aggregate),w=clone(folded.wave);a.version=MATERIALIZED_V3_VERSION;w.version=MATERIALIZED_V3_VERSION;
  delete a.pending_deadlines;delete a.instrument_assets;delete w.record_digests;
  a.source_cursor=source_cursor;
  // Only one external queue update may be in flight. Its durable intent is
  // committed with the exact same wave and scalar cohort/global counters.
  a.maturity_pending={transition_id:'V3:'+a.materialization_id+':'+a.revision,kind,record_id,fingerprint,
    materialization_id:a.materialization_id,wave_key:w.wave_key,wave_state_revision:w.state_revision,source_cursor,
    active:w.contribution.counters.pending_waves>0,deadline_ts:w.contribution.counters.pending_waves?w.origin.t0+14400000:null};
  return {...folded,aggregate:a,wave:w,maturity_intent:clone(a.maturity_pending),external_record_receipt_is_not_an_applied_marker:true};
}
export function createMaterializedSummaryV3({materialization_id,as_of_ts}={}){
  const a=createMaterializedSummary({materialization_id,as_of_ts});a.version=MATERIALIZED_V3_VERSION;a.source_cursor=0;a.maturity_pending=null;
  delete a.pending_deadlines;delete a.instrument_assets;return a;
}
// ROOT stores this immutable cell and reads it back BEFORE atomic wave+global
// commit. Existence means identity pinned, never that counters were applied.
export function prepareMaterializedRecordReceiptV3({materialization_id,prepared_event,source_seq}={}){
  if(!text(materialization_id)||!preparedEvents.has(prepared_event)||prepared_event.kind!=='OUTCOME_RECORD'||!Number.isSafeInteger(source_seq)||source_seq<1)throw Error('MATERIALIZED_V3_RECORD_RECEIPT_INPUT_REQUIRED');
  return {schema:receiptSchemaV3,materialization_id,source_seq,record_id:prepared_event.record.record_id,fingerprint:prepared_event.fingerprint,wave_key:waveKey(prepared_event.record.origin)};
}
export function foldPreparedOutcomeRecordV3({aggregate,wave=null,prepared_event,source_seq,record_receipt,instrument_binding,as_of_ts}={}){
  contextV3(aggregate,wave,as_of_ts);
  if(!preparedEvents.has(prepared_event)||prepared_event.kind!=='OUTCOME_RECORD')throw Error('MATERIALIZED_V3_PREPARED_RECORD_REQUIRED');
  const expected=prepareMaterializedRecordReceiptV3({materialization_id:aggregate.materialization_id,prepared_event,source_seq});
  if(!record_receipt||Object.entries(expected).some(([k,v])=>record_receipt[k]!==v))throw Error('MATERIALIZED_V3_RECORD_RECEIPT_CONFLICT');
  const r=prepared_event.record;
  if(instrument_binding?.schema!==bindingSchemaV3||instrument_binding.materialization_id!==aggregate.materialization_id||instrument_binding.instrument_id!==r.origin.instrument_id||instrument_binding.asset_id!==r.origin.asset_id)throw Error('MATERIALIZED_V3_INSTRUMENT_ASSET_CONFLICT');
  if(wave&&(wave.wave_key!==expected.wave_key||stable(wave.origin)!==stable(r.origin)))throw Error('IMMUTABLE_WAVE_ORIGIN_CONFLICT');
  if(source_seq<=aggregate.source_cursor){
    if(!wave)throw Error('MATERIALIZED_V3_REPLAY_WAVE_MISSING');
    return {status:'REPLAY_BEHIND_COMMITTED_CURSOR',write_required:false,aggregate,wave,record_receipt_verified:true};
  }
  if(source_seq!==aggregate.source_cursor+1)throw Error('MATERIALIZED_V3_SOURCE_SEQUENCE_GAP');
  const shadow=shadowV3(aggregate,wave,instrument_binding),folded=foldPreparedOutcomeRecord({...shadow,prepared_event,as_of_ts});
  return finishV3Step(aggregate,folded,{source_cursor:source_seq,kind:'RECORD',record_id:r.record_id,fingerprint:prepared_event.fingerprint});
}
export function advanceWaveMaturityV3({aggregate,wave,as_of_ts,maturity_reference}={}){
  contextV3(aggregate,wave,as_of_ts);if(!wave)throw Error('MATURITY_WAVE_REQUIRED');
  const ref=maturity_reference;
  if(ref?.schema!==maturitySchemaV3||ref.materialization_id!==aggregate.materialization_id||ref.wave_key!==wave.wave_key||ref.wave_state_revision!==wave.state_revision||ref.active!==true||ref.deadline_ts!==wave.origin.t0+14400000)throw Error('MATERIALIZED_V3_STALE_MATURITY_REFERENCE');
  const shadow=shadowV3(aggregate,wave),folded=advanceWaveMaturity({...shadow,as_of_ts});
  if(!folded.write_required)return {...folded,aggregate,wave};
  return finishV3Step(aggregate,folded,{source_cursor:aggregate.source_cursor,kind:'CLOCK'});
}
// ROOT first installs or deactivates its single current queue reference and
// verifies this exact persisted body. Old queue rows are never GC'd here.
export function acknowledgeMaterializedMaturityV3({aggregate,maturity_reference,as_of_ts}={}){
  contextV3(aggregate,null,as_of_ts,{allow_pending:true});const intent=aggregate.maturity_pending;
  if(!intent)return {status:'NO_QUEUE_INTENT',write_required:false,aggregate};
  const expected={schema:maturitySchemaV3,materialization_id:intent.materialization_id,wave_key:intent.wave_key,wave_state_revision:intent.wave_state_revision,active:intent.active,deadline_ts:intent.deadline_ts,transition_id:intent.transition_id};
  if(!maturity_reference||Object.entries(expected).some(([k,v])=>maturity_reference[k]!==v))throw Error('MATERIALIZED_V3_QUEUE_READBACK_MISMATCH');
  const next=clone(aggregate);next.maturity_pending=null;next.revision++;next.updated_ts=as_of_ts;
  return {status:'QUEUE_INTENT_ACKNOWLEDGED',write_required:true,expected:{aggregate_revision:aggregate.revision,transition_id:intent.transition_id},aggregate:next};
}
export function readMaterializedSummaryV3(aggregate,{as_of_ts,maturity_boundary=null}={}){
  contextV3(aggregate,null,as_of_ts,{allow_pending:true});
  const view=readMaterializedSummary(shadowV3(aggregate,null).aggregate,{as_of_ts});
  const b=maturity_boundary,empty=aggregate.counters.pending_waves===0;
  const bound=b&&b.materialization_id===aggregate.materialization_id&&b.aggregate_revision===aggregate.revision&&b.as_of_ts===as_of_ts&&b.complete===true&&b.has_more!==true&&text(b.source_ref)&&Number.isSafeInteger(b.due_count)&&b.due_count>=0;
  const conflict=bound&&b.due_count>aggregate.counters.pending_waves;
  const due=conflict||b!==null&&!bound?null:empty?0:bound?b.due_count:null,current=!aggregate.maturity_pending&&due===0;
  return {...view,schema:'PUMP_MATERIALIZED_SUMMARY_V3',version:MATERIALIZED_V3_VERSION,
    source_cursor:aggregate.source_cursor,status:aggregate.maturity_pending?'MATURITY_QUEUE_SYNC_REQUIRED':conflict?'MATURITY_BOUNDARY_CONFLICT':due===null?'MATURITY_BOUNDARY_REQUIRED':due?'MATURITY_UPDATES_REQUIRED':'CURRENT',
    maturity_current:current,pending_clock_transitions:due,maturity_intent_pending:Boolean(aggregate.maturity_pending),
    maturity_boundary_ref:bound&&!conflict?b.source_ref:null,external_replay_receipts:true,scalar_cohort_counters:true,
    originals_required:true,delete_allowed:false,approved_delete_ttl_ms:null,
    limitations:[...view.limitations,'V3 requires exact ROOT record receipt/instrument binding readback and atomic source-cursor+wave+aggregate commit','Queue intent blocks new folds until actual persisted queue reference is acknowledged','CURRENT with pending waves requires a current complete ROOT maturity-queue boundary; caller flags are not native admission','Old v2 originals/digests remain historical; no cleanup or capacity test performed']};
}
