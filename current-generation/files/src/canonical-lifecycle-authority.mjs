import {earlySourceRolesClosed} from './observation-source-role-gate.mjs';
/** New Telegram ideas use the immutable canonical row of the same completed run.
 * A shadow bias is not a closed canonical direction. Prior-visible removals are
 * handled separately by the existing lifecycle and delivered-message gate.
 */
const text=v=>v==null?'':String(v).trim();
const stamp=v=>Number.isSafeInteger(v)&&v>=1_000_000_000_000;
const direction=v=>['LONG','SHORT'].includes(v)?v:null;
const no=status=>({status,reason:status,direction:null});
export function canonicalLifecycleAuthority({row,handoff,early,now_ts=Date.now()}={}){
 if(!row)return no('CURRENT_RUN_CANONICAL_NOT_FOUND');
 let canonical;try{canonical=JSON.parse(row.canonical_json);}catch{return no('CURRENT_RUN_CANONICAL_INVALID');}
 const contract=text(handoff?.contract_code),run=text(handoff?.source_run_id),wave=text(handoff?.wave_id)||text(early?.wave_id);
 if(!contract||!run||!wave||row.contract_code!==contract||canonical?.metadata?.contract!==contract||
  row.run_id!==run||canonical.run_id!==run||row.wave_id!==wave||early?.wave_id!==wave||
  row.snapshot_id!==canonical.snapshot_id||row.observed_ts!==canonical.observed_ts||
  row.snapshot_id!==`S392:${contract}:${row.observed_ts}`||row.canonical_state!==canonical.state||
  !/^[a-f0-9]{64}$/.test(row.analytical_fingerprint||'')||row.analytical_fingerprint!==canonical.analytical_fingerprint)
  return no('CURRENT_RUN_CANONICAL_IDENTITY_MISMATCH');
 const ts=row.observed_ts,created=row.created_ts;
 if(!stamp(now_ts)||!stamp(ts)||!stamp(created)||!stamp(handoff.deep_started_ts)||!stamp(handoff.deep_completed_ts)||
  ts<handoff.deep_started_ts||ts>handoff.deep_completed_ts||created<ts||created>now_ts||ts>now_ts||now_ts-ts>10*60_000)
  return no('CURRENT_RUN_CANONICAL_TIME_NOT_CLOSED');
 const d=direction(canonical.direction),resolution=canonical.metadata.direction_resolution;
 if(!d||row.direction!==d||resolution?.status!=='CLOSED'||resolution.direction!==d||
   !(Array.isArray(resolution.facts)&&resolution.facts.some(r=>r.direction===d&&text(r.evidence_id))))
  return no('CANONICAL_DIRECTION_NOT_CLOSED');
 if(!['OBSERVE','WAIT_FOR_TRIGGER','ENTRY_NOW_ANALYTICAL','ENTRY_NOW_VALIDATED'].includes(canonical.state))
  return no('CANONICAL_STATE_NOT_PUBLISHABLE');
 const score=canonical.scores?.coin_interest_0_100;
 if(canonical.state==='OBSERVE'&&!(typeof score==='number'&&Number.isFinite(score)&&score>=70))
  return no('CANONICAL_OBSERVE_THRESHOLD_NOT_CLOSED');
 // A blocked observation must not persist a user lifecycle or occupy its
 // same-wave dispatch identity before the publication gate can admit it.
 // Full identity, text and delivery freshness are still rechecked downstream.
 if(canonical.state==='OBSERVE'&&!earlySourceRolesClosed(canonical))
  return no('OBSERVE_SOURCE_ROLES_NOT_CLOSED');
 return {status:'CLOSED',direction:d,canonical_state:canonical.state,publication_id:row.publication_id,
  run_id:row.run_id,snapshot_id:row.snapshot_id,observed_ts:ts,source:'SAME_RUN_CANONICAL_ASSIGNED_DIRECTION',new_score_created:false};
}
