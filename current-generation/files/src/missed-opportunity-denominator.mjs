// Shadow-only, precommitted independent episodes. A missing outcome is
// censored, never a non-missed case; controlled fixtures are not empirical.
const H=Object.freeze({'1h':3600000,'4h':14400000,'12h':43200000,'24h':86400000});
const time=v=>Number.isSafeInteger(v)&&v>0;
const text=v=>typeof v==='string'&&v.trim().length>0;
const number=v=>typeof v==='number'&&Number.isFinite(v);
const hex=(v,n)=>typeof v==='string'&&new RegExp('^[a-f0-9]{'+n+'}$').test(v);
const stages=new Set(['ANOMALOUS_EVENT','CONFIRMATION_PENDING','ENTRY_TRIGGER_SHADOW','CHASE_RISK']);
function classify(row,now,threshold) {
 const e=row?.event,d=row?.decision,o=row?.outcome,h=row?.horizon;
 if(!e||!d||!o||!Object.hasOwn(H,h))return 'CENSORED_UNPROVEN_OR_MISSING_RECEIPT';
 if(!text(e.contract)||!text(e.episode_id)||e.independent_sample!==true||e.control_group!==false||e.control_eligible!==false||!time(e.event_close_ts)||!['LONG','SHORT'].includes(e.direction_at_event)||e.directional_evaluation_eligible!==true||!time(e.direction_locked_ts)||e.direction_locked_ts>e.event_close_ts)return 'CENSORED_NO_PRECOMMITTED_DIRECTIONAL_EPISODE';
 if(d.contract!==e.contract||d.episode_id!==e.episode_id||d.direction!==e.direction_at_event||d.stage!==e.funnel?.stage||!stages.has(d.stage)||!hex(d.head,40)||!text(d.run_id)||!text(d.snapshot_id)||!time(d.observed_ts)||d.observed_ts<e.event_close_ts||d.observed_ts>e.event_close_ts+600000||d.observed_ts>=e.event_close_ts+H[h]||!hex(row.source_artifact_digest?.replace(/^sha256:/,''),64))return 'CENSORED_ORIGINAL_DECISION_BINDING_REQUIRED';
 const target=e.event_close_ts+H[h];
 if(o.status!=='OK'||o.horizon!==h||o.trajectory_complete!==true||o.target_ts!==target||o.source_start_ts!==e.event_close_ts||o.source_end_ts!==target||!time(o.as_of_ts)||o.as_of_ts<target||o.as_of_ts>now||!Number.isSafeInteger(o.expected_bars)||o.expected_bars<1||o.observed_bars!==o.expected_bars||o.trajectory_coverage_pct!==100||o.direction_at_event!==e.direction_at_event||o.direction_locked_ts!==e.direction_locked_ts||o.directional_evaluation_eligible!==true||!number(o.mfe_pct)||!number(o.directional_return_pct))return 'CENSORED_INCOMPLETE_OR_UNBOUND_FUTURE_PATH';
 const reached=o.mfe_pct>=threshold,triggered=['ENTRY_TRIGGER_SHADOW','CHASE_RISK'].includes(d.stage);
 const missed=reached&&!triggered,late=reached&&d.stage==='CHASE_RISK',falseRejection=missed&&['ANOMALOUS_EVENT','CONFIRMATION_PENDING'].includes(d.stage);
 if(o.missed_opportunity_detected!==missed||o.late_entry_candidate!==late||o.false_rejection_candidate!==falseRejection)return 'CENSORED_RETROSPECTIVE_LABEL_CONFLICT';
 return missed?'ELIGIBLE_MISSED':'ELIGIBLE_NOT_MISSED';
}
export function summarizeMissedOpportunityEvidence({rows=[],now_ts,threshold_pct=5}={}) {
 if(!Array.isArray(rows)||rows.length>2048||!time(now_ts)||!number(threshold_pct)||threshold_pct<=0||threshold_pct>100)return {status:'INVALID_BOUNDED_COHORT',project_complete:false};
 const groups=new Map(),unidentified=[];
 for(const row of rows){
  const e=row?.event,h=row?.horizon;
  if(!text(e?.contract)||!text(e?.episode_id)||!Object.hasOwn(H,h)){unidentified.push(row);continue;}
  const key=[e.contract,e.episode_id,h].join('|');
  if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);
 }
 const cases=[],counts={eligible:0,missed:0,not_missed:0,censored:0,duplicate_replays:0,conflicting_duplicates:0};
 for(const [key,items] of groups){
  const signatures=new Set(items.map(x=>JSON.stringify(x)));counts.duplicate_replays+=items.length-1;
  const state=signatures.size>1?'CENSORED_CONFLICTING_DUPLICATE':classify(items[0],now_ts,threshold_pct);
  if(signatures.size>1)counts.conflicting_duplicates++;
  if(state==='ELIGIBLE_MISSED'){counts.eligible++;counts.missed++;}
  else if(state==='ELIGIBLE_NOT_MISSED'){counts.eligible++;counts.not_missed++;}
  else counts.censored++;
  cases.push({episode_horizon_key:key,status:state});
 }
 counts.censored+=unidentified.length;
 return {schema:'REPORT2_PRECOMMITTED_MISSED_OPPORTUNITY_DENOMINATOR_V1',status:counts.eligible?'SCOPED_PROVENANCE_BOUND_SHADOW_DENOMINATOR':'NO_ACTUAL_PROVEN_DIRECTIONAL_DENOMINATOR',threshold_pct,unique_episode_horizons:groups.size+unidentified.length,...counts,missed_rate_pct:counts.eligible?100*counts.missed/counts.eligible:null,cases,sourceHTTP:0,D1:0,Telegram:0,actual_ENTRY:false,validated_probability:false,auto_trading:false,all102_30_90day_history:false,project_complete:false};
}
