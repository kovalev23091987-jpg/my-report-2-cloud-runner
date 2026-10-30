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
