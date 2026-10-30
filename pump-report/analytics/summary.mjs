import {positive,validTime} from '../contracts/index.mjs';
import {plusTenPrice} from './math.mjs';

export const SUMMARY_VERSION='pump-outcome-summary-v1-tz2-20261025';
export const PROPOSED_SAMPLE_REQUIREMENTS=Object.freeze({resolved_mature_waves:300,assets:20,calendar_days:14,temporal_holdout_waves:100});
const text=v=>typeof v==='string'&&v.trim().length>0;
const stable=v=>v&&typeof v==='object'?Array.isArray(v)?'['+v.map(stable).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}':JSON.stringify(v);
const lex=(a,b)=>String(a)<String(b)?-1:String(a)>String(b)?1:0;
const countReasons=rows=>{const out={};for(const r of rows)out[r]=(out[r]??0)+1;return out;};
function day(ts){const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(ts).map(x=>[x.type,x.value]));return p.year+'-'+p.month+'-'+p.day;}
function originValid(o){return o&&['instrument_id','asset_id','wave_id','signal_id','rules_version','profile_version'].every(k=>text(o[k]))&&validTime(o.t0)&&Number.isFinite(new Date(o.t0).getTime())&&positive(o.reference_price)&&
  ['AUTO','MANUAL'].includes(o.mode)&&['NO_MAP','PARTIAL_MAP','MAP'].includes(o.map_mode)&&['OBSERVED','ARTIFICIAL','NON_NATIVE','BACKFILLED','UNCLASSIFIED'].includes(o.evidence_class)&&typeof o.ready==='boolean';}
function publication(p){
  if(p?.state==='SENT'){
    const id=String(p.message_id??'');return /^[1-9][0-9]*$/.test(id)&&text(p.receipt_ref)?{state:'SENT',reason:null}:{state:'UNKNOWN',reason:'SENT_RECEIPT_NOT_BOUND'};
  }
  return ['UNSENT','UNKNOWN'].includes(p?.state)?{state:p.state,reason:null}:{state:'UNKNOWN',reason:'PUBLICATION_STATE_UNAVAILABLE'};
}
function outcomeIssue(o,s,recorded){
  if(!o)return null;
  if(!['HIT','MISS','UNKNOWN'].includes(o.status))return 'OUTCOME_STATUS_INVALID';
  if(o.wave_id!==s.wave_id||o.signal_id!==s.signal_id||o.t0!==s.t0||o.reference_price!==s.reference_price||o.rules_version!==s.rules_version||o.mode!==s.mode)return 'OUTCOME_ORIGIN_MISMATCH';
  const map=s.map_mode==='NO_MAP'?'WITHOUT_MAP':'WITH_MAP';if(o.map_mode!==map)return 'OUTCOME_MAP_MODE_MISMATCH';
  if(o.target_price!==plusTenPrice(s.reference_price)||o.deadline_ts!==s.t0+14400000)return 'OUTCOME_TARGET_OR_HORIZON_MISMATCH';
  const noHitProof=o.coverage?.no_hit_period_covered===true&&o.coverage?.no_hit_basis==='ENCLOSING_CLOSED_MINUTE_BARS_ALL_HIGHS_BELOW_TARGET';
  if(o.status==='MISS'&&(recorded<o.deadline_ts||o.coverage?.complete!==true&&!noHitProof))return 'MISS_WITHOUT_MATURE_COMPLETE_COVERAGE';
  if(o.status==='HIT'){
    const exact=validTime(o.hit_ts)&&o.hit_ts>=s.t0&&o.hit_ts<=Math.min(recorded,o.deadline_ts);
    const i=o.hit_interval,interval=validTime(i?.start_ts)&&validTime(i?.end_ts)&&i.start_ts>=s.t0&&i.end_ts>i.start_ts&&i.end_ts<=Math.min(recorded,o.deadline_ts);
    if(!exact&&!interval)return 'HIT_WITHOUT_IN_PERIOD_PROOF';
  }
  return null;
}
function counters(waves,now){
  const mature=waves.filter(w=>w.origin.t0+14400000<=now),pending=waves.filter(w=>w.origin.t0+14400000>now),counts=xs=>({hit:xs.filter(w=>w.status==='HIT').length,miss:xs.filter(w=>w.status==='MISS').length,unknown:xs.filter(w=>w.status==='UNKNOWN').length});
  const m=counts(mature),all=counts(waves);
  return {independent_waves:waves.length,mature_waves:mature.length,pending_waves:pending.length,outcomes:all,mature_outcomes:m,pending_known_hits:pending.filter(w=>w.status==='HIT').length,
    denominators:{all_independent_waves:waves.length,mature_waves:mature.length,resolved_mature_waves:m.hit+m.miss,unknown_mature_waves:m.unknown,pending_excluded_from_mature:pending.length},
    gapped_mature_waves:mature.filter(w=>w.coverage_status==='INCOMPLETE').length,coverage_unknown_mature_waves:mature.filter(w=>w.coverage_status==='UNKNOWN').length,
    enclosing_no_hit_proof_mature_waves:mature.filter(w=>w.coverage_status==='NO_HIT_PERIOD_COVERED').length,
    origin_conflict_waves:waves.filter(w=>w.origin_conflict).length,outcome_conflict_waves:waves.filter(w=>w.outcome_conflict).length,identity_conflict_waves:waves.filter(w=>w.identity_conflict).length,
    publication_counts:{sent:waves.filter(w=>w.publication==='SENT').length,unsent:waves.filter(w=>w.publication==='UNSENT').length,unknown:waves.filter(w=>w.publication==='UNKNOWN').length},
    reason_counts:countReasons(waves.flatMap(w=>w.reasons))};
}
function readiness(waves,now,requirements){
  const resolved=waves.filter(w=>w.origin.t0+14400000<=now&&['HIT','MISS'].includes(w.status)&&!w.origin_conflict&&!w.outcome_conflict).sort((a,b)=>a.origin.t0-b.origin.t0||lex(a.key,b.key));
  const assets=new Set(resolved.map(w=>w.origin.asset_id)).size,days=new Set(resolved.map(w=>day(w.origin.t0))).size,reasons=[];
  if(resolved.length<requirements.resolved_mature_waves)reasons.push('INSUFFICIENT_RESOLVED_MATURE_WAVES');
  if(assets<requirements.assets)reasons.push('INSUFFICIENT_ASSETS');if(days<requirements.calendar_days)reasons.push('INSUFFICIENT_CALENDAR_DAYS');
  if(resolved.length<requirements.temporal_holdout_waves)reasons.push('INSUFFICIENT_TEMPORAL_HOLDOUT');
  if(waves.some(w=>w.origin.evidence_class!=='OBSERVED'))reasons.push('NON_OBSERVED_COHORT_NOT_NATIVE_CALIBRATION');
  if(waves.some(w=>w.publication==='UNKNOWN'))reasons.push('PUBLICATION_STATUS_UNRESOLVED');
  const holdout=resolved.slice(-requirements.temporal_holdout_waves).map(w=>w.key);
  return {sample_floor_met:reasons.length===0,requirements:{...requirements},requirements_status:'PROPOSED_ENGINEERING_FLOOR_NOT_QUALITY_PROOF',resolved_mature_waves:resolved.length,assets,calendar_days_with_episodes:days,
    time_zone:'Europe/Moscow',temporal_holdout_wave_keys:holdout,training_wave_keys:resolved.slice(0,Math.max(0,resolved.length-holdout.length)).map(w=>w.key),
    blockers:reasons,calibration_validated:false,publication_allowed:false,success_rate_pct:null,probability:{value_pct:null,reason:reasons.length?'INSUFFICIENT_OR_UNQUALIFIED_SAMPLE':'CALIBRATION_NOT_PERFORMED'}};
}
export function summarizeOutcomes(records,options={}){
  if(!Array.isArray(records))throw Error('SUMMARY_RECORD_ARRAY_REQUIRED');
  const now=options.as_of_ts;if(!validTime(now))throw Error('SUMMARY_AS_OF_REQUIRED');
  const requirements={...PROPOSED_SAMPLE_REQUIREMENTS,...options.sample_requirements};
  if(Object.values(requirements).some(n=>!Number.isSafeInteger(n)||n<1)||Object.keys(requirements).some(k=>!Object.hasOwn(PROPOSED_SAMPLE_REQUIREMENTS,k)))throw Error('SUMMARY_SAMPLE_REQUIREMENTS_INVALID');
  const recordGroups=new Map(),invalid=[],future=[],notReady=[];let replays=0;
  for(const row of records){
    if(!text(row?.record_id)||!validTime(row.recorded_ts)||!originValid(row.origin)||row.recorded_ts<row.origin.t0){invalid.push({record_id:row?.record_id??null,reason:'SUMMARY_RECORD_INVALID'});continue;}
    if(row.recorded_ts>now){future.push(row.record_id);continue;}
    if(!row.origin.ready){notReady.push(row.record_id);continue;}
    const entries=recordGroups.get(row.record_id)??[];
    if(entries.some(r=>stable(r)===stable(row))){replays++;continue;}entries.push(row);recordGroups.set(row.record_id,entries);
  }
  const byWave=new Map();
  for(const entries of recordGroups.values())for(const r of entries){
    const key=JSON.stringify([r.origin.instrument_id,r.origin.wave_id]),issues=[];
    if(entries.length>1)issues.push('IMMUTABLE_RECORD_ID_CONFLICT');
    const issue=outcomeIssue(r.outcome,r.origin,r.recorded_ts);if(issue)issues.push(issue);
    if(issues.length)invalid.push({record_id:r.record_id,reason:issues.join(';')});
    const snapshots=byWave.get(key)??[];snapshots.push({record:r,issues,publication:publication(r.publication)});byWave.set(key,snapshots);
  }
  const instrumentAssets=new Map();
  for(const snapshots of byWave.values())for(const s of snapshots){const o=s.record.origin,assets=instrumentAssets.get(o.instrument_id)??new Set();assets.add(o.asset_id);instrumentAssets.set(o.instrument_id,assets);}
  const waves=[];
  for(const [key,snapshots] of byWave){
    snapshots.sort((a,b)=>a.record.recorded_ts-b.record.recorded_ts||lex(a.record.record_id,b.record.record_id));
    const first=snapshots[0],origin=first.record.origin,originConflict=snapshots.some(s=>stable(s.record.origin)!==stable(origin));
    const usable=snapshots.filter(s=>s.issues.length===0),hit=usable.filter(s=>s.record.outcome?.status==='HIT'),miss=usable.filter(s=>s.record.outcome?.status==='MISS');
    const outcomeConflict=hit.length>0&&miss.length>0,recordConflict=snapshots.some(s=>s.issues.includes('IMMUTABLE_RECORD_ID_CONFLICT')),identityConflict=instrumentAssets.get(origin.instrument_id).size>1;
    const known=hit.at(-1)??miss.at(-1)??usable.at(-1)??snapshots.at(-1),payload=known.record.outcome;
    const status=originConflict||outcomeConflict||recordConflict||identityConflict||known.issues.length>0?'UNKNOWN':payload?.status??'UNKNOWN';
    const sent=snapshots.find(s=>s.publication.state==='SENT'),pub=sent?.publication??snapshots.at(-1).publication;
    const reasons=[...new Set([...snapshots.flatMap(s=>s.issues),...(payload?.reasons??[]),...(originConflict?['WAVE_ORIGIN_CONFLICT']:[]),...(outcomeConflict?['HIT_MISS_CONFLICT']:[]),...(identityConflict?['INSTRUMENT_ASSET_IDENTITY_CONFLICT']:[]),...(pub.reason?[pub.reason]:[]),...(!payload?['OUTCOME_NOT_AVAILABLE']:[])])];
    waves.push({key,origin:{...origin},status,publication:pub.state,coverage_status:payload?.coverage?.complete===true?'COMPLETE':payload?.coverage?.no_hit_period_covered===true&&payload?.coverage?.no_hit_basis==='ENCLOSING_CLOSED_MINUTE_BARS_ALL_HIGHS_BELOW_TARGET'?'NO_HIT_PERIOD_COVERED':payload?.coverage?.complete===false?'INCOMPLETE':'UNKNOWN',
      origin_conflict:originConflict,outcome_conflict:outcomeConflict,identity_conflict:identityConflict,
      snapshots:snapshots.length,selected_record_id:known.record.record_id,reasons});
  }
  const groups=new Map();
  for(const wave of waves){const o=wave.origin,key=JSON.stringify([o.mode,wave.publication,o.map_mode,o.rules_version,o.profile_version,o.evidence_class]);const ws=groups.get(key)??[];ws.push(wave);groups.set(key,ws);}
  const cohorts=[...groups].sort(([a],[b])=>lex(a,b)).map(([key,ws])=>({cohort_key:key,mode:ws[0].origin.mode,publication:ws[0].publication,map_mode:ws[0].origin.map_mode,
    rules_version:ws[0].origin.rules_version,profile_version:ws[0].origin.profile_version,evidence_class:ws[0].origin.evidence_class,
    ...counters(ws,now),readiness:readiness(ws,now,requirements),wave_keys:ws.map(w=>w.key).sort(lex)}));
  const totals=counters(waves,now),m=totals.mature_outcomes;
  return {schema:'PUMP_OUTCOME_SUMMARY_V1',version:SUMMARY_VERSION,event:'PRICE_PLUS_10_PERCENT_WITHIN_4_HOURS',as_of_ts:now,input_records:records.length,
    distinct_record_ids:recordGroups.size,duplicate_record_replays:replays,wave_update_snapshots_collapsed:[...byWave.values()].reduce((n,x)=>n+Math.max(0,x.length-1),0),
    invalid_records:invalid.length,invalid_record_details:invalid,excluded_future_records:future.length,excluded_non_ready_records:notReady.length,
    ...totals,cohorts,success_rate_pct:null,probability:{value_pct:null,reason:'CALIBRATION_NOT_PERFORMED'},external_provenance_authenticated:false,
    status_text_ru:'Независимых волн: '+totals.independent_waves+'. Зрелых: '+totals.mature_waves+'; HIT '+m.hit+', MISS '+m.miss+', UNKNOWN '+m.unknown+'. Ещё не завершены: '+totals.pending_waves+'. Процент успешности и вероятность пока не оценены.',
    limitations:['UNKNOWN and pending are not wins or losses','Early HIT excluded from mature denominator until original four-hour deadline','Original wave/cohort snapshot immutable; conflicting origins censored','Readiness counts are proposed floors, not calibration or native provenance proof','No percentage transfer between AUTO/MANUAL, delivery states or map regimes']};
}
