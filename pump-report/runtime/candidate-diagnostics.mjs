import {candidatePriority} from './candidate-priority.mjs';
// Diagnostic projections never supply eligibility, admission or selection.
const arr=v=>Array.isArray(v)?v:null;
const nat=v=>Number.isSafeInteger(v)&&v>=0?v:null;
const finite=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
const id=v=>typeof v==='string'&&/^BINGX:USDT_M:[0-9]{1,20}:[^\u0000-\u001f\u007f]{1,100}$/u.test(v)?v:null;
const key=v=>typeof v==='string'&&/^pump:analysis:[a-f0-9]{64}$/.test(v)?v:null;
const row=r=>r&&typeof r==='object'?{
  instrument_id:id(r.instrument_id),rank:nat(r.rank),score:finite(r.score),
  waiting_minutes:finite(r.waiting_minutes),movement_freshness:finite(r.movement_freshness),
  entry_proximity:finite(r.entry_proximity),confirmed_data_fraction:finite(r.confirmed_data_fraction),
  preliminary_growth_pct:finite(r.preliminary_growth_pct),reported_day_growth_pct:finite(r.reported_day_growth_pct),
  active_wave:typeof r.active_wave==='boolean'?r.active_wave:null,
  first_seen:nat(r.first_seen),last_checked_ts:nat(r.last_checked_ts),next_check_ts:nat(r.next_check_ts),
  movement_event_ts:nat(r.movement_event_ts),price_expires_ts:nat(r.price_expires_ts)
}:null;
// A bounded annotation from the same budget snapshot; never an admission input.
export function surplusLimitProjection(d){
  if(d?.schema!=='PUMP_SURPLUS_LIMIT_DIAGNOSTIC_V1'||nat(d.observed_ts)===null||d.observed_ts>8640000000000000||
    typeof d.utc_day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d.utc_day)||d.utc_day!==new Date(d.observed_ts).toISOString().slice(0,10)||
    !['retained_count','day_count','run_count'].every(k=>nat(d[k])!==null&&d[k]<=200)||
    d.day_count>d.retained_count||d.run_count>d.retained_count||
    d.limits?.retained!==200||nat(d.limits?.day)===null||d.limits.day<1||d.limits.day>24||d.limits?.run!==1)return null;
  const reasons=[...(d.retained_count>=d.limits.retained?['RETAINED_RECORD_LIMIT']:[]),...(d.day_count>=d.limits.day?['UTC_DAY_GRANT_LIMIT']:[]),...(d.run_count>0?['SAME_RUN_GRANT_LIMIT']:[])];
  if(!reasons.length||JSON.stringify(d.reasons)!==JSON.stringify(reasons))return null;
  return {schema:d.schema,observed_ts:d.observed_ts,utc_day:d.utc_day,retained_count:d.retained_count,day_count:d.day_count,run_count:d.run_count,
    limits:{retained:200,day:d.limits.day,run:1},reasons};
}
export function decisionProjection(d){
  if(!d||typeof d!=='object')return null;
  const leaders=arr(d.leaders);
  return {as_of_ts:nat(d.as_of_ts),queue_candidates:nat(d.queue_candidates),
    selected:row(d.selected),leaders:leaders?leaders.slice(0,5).map(row):null,
    leaders_truncated:leaders?d.leaders_truncated===true||leaders.length>5:null,
    leader_scope:'QUEUE_ORDER_BEFORE_SOURCE_ELIGIBILITY',
    preview_is_not_confirmed_impulse:true,diagnostic_is_not_eligibility:true};
}
export function captureDecision(candidates,picked,now,profile){
  const project=(r,rank)=>({instrument_id:r.instrument_id,rank,...candidatePriority(r,now,{profile}),
    preliminary_growth_pct:r.preliminary_growth,reported_day_growth_pct:r.reported_day_growth,
    active_wave:r.active_wave,first_seen:r.first_seen,last_checked_ts:r.last_checked_ts,
    next_check_ts:r.next_check_ts,movement_event_ts:r.movement_event_ts,price_expires_ts:r.price_expires_ts});
  return decisionProjection({as_of_ts:now,queue_candidates:candidates.length,
    selected:picked?project(picked,candidates.indexOf(picked)+1):null,
    leaders:candidates.slice(0,5).map((r,n)=>project(r,n+1)),leaders_truncated:candidates.length>5});
}
export function candidateRunDiagnostics(r){
  const checked=arr(r?.checked),deferred=arr(r?.deferred),decisions=arr(r?.candidate_selection);
  const ref=x=>{const a=x?.analysis,diagnostic=x?.source_coverage?.detail==='SURPLUS_LOGICAL_GRANT_LIMIT'?surplusLimitProjection(x.source_coverage.surplus_limit):null;return {
    instrument_id:id(a?.instrument?.instrument_id??x?.instrument_id),
    analysis_key:key(x?.analysis_key),analysis_ts:nat(a?.analysis_ts),
    ready:typeof a?.ready==='boolean'?a.ready:null,
    automatic_eligible:typeof a?.automatic_eligible==='boolean'?a.automatic_eligible:null,
    current_threshold_passed:typeof a?.current_threshold_passed==='boolean'?a.current_threshold_passed:null,
    allocation_kind:x?.candidate_quota?.kind==='UNASSIGNED_SURPLUS'?'UNASSIGNED_SURPLUS':
      Number.isSafeInteger(x?.candidate_quota?.period_start)?'BASE_OR_CARRY':null,
    ...(diagnostic?{surplus_limit:diagnostic}:{})};};
  return {schema:'PUMP_AUTO_CANDIDATE_DIAGNOSTICS_V1',
    checked:checked?checked.slice(0,8).map(ref):null,checked_truncated:checked?checked.length>8:null,
    deferred:deferred?deferred.slice(0,5).map(ref):null,deferred_truncated:deferred?deferred.length>5:null,
    decisions:decisions?decisions.slice(0,4).map(decisionProjection):null,
    decisions_truncated:decisions?r?.candidate_selection_truncated===true||decisions.length>4:null,
    current_result_only:true,historical_queue_not_reconstructed:true};
}
