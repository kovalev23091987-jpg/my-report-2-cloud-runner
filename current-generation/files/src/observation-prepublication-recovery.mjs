import {assessActionability,canonicalFingerprint,renderCanonicalTelegram} from './canonical-publication.mjs';

export const OBSERVATION_RECOVERY_VERSION='observation-prepublication-recovery-v2-fresh-state-refusal-20261006';
export const OBSERVATION_RECOVERY_MAX_JOURNAL_ROWS=8;
// These refusals occur before publication binding or a network attempt.
const recoverableRefusals=new Set(['OBSERVE_SOURCE_ROLES_NOT_CLOSED','OBSERVE_STATE_MISMATCH']);
const active=new Set(['PENDING','FAILED_RETRYABLE','SENDING','SENT']);

// Recover only an unsent pre-network publication refusal with a different,
// current, fully qualified canonical snapshot. Never reset the old journal.
export function qualifiedObservationRecovery({ctx,previous_status,current_status,dispatch,now}={}){
 const p=ctx?.canonical_observation_publication;
 if(previous_status!=='OBSERVE'||current_status!=='OBSERVE'||dispatch?.dispatch!==false||dispatch?.reason!=='NO_STATE_CHANGE'||ctx.dispatch_enabled!==true||ctx.cooldown_active===true||!p)return null;
 let c;try{c=JSON.parse(p.canonical_json);}catch{return null;}
 if(p.contract_code!==ctx.contract||p.direction!==ctx.direction||p.wave_id!==ctx.wave_id||p.run_id!==c.run_id||p.snapshot_id!==c.snapshot_id||p.snapshot_id!==`S392:${ctx.contract}:${p.observed_ts}`||p.observed_ts!==c.observed_ts||p.analytical_fingerprint!==c.analytical_fingerprint||canonicalFingerprint(c)!==c.analytical_fingerprint||c.metadata?.contract!==ctx.contract||c.direction!==ctx.direction||p.canonical_state!=='OBSERVE'||c.state!=='OBSERVE'||!Number.isSafeInteger(now)||!Number.isSafeInteger(c.observed_ts)||c.observed_ts>now||now-c.observed_ts>600000||!Number.isSafeInteger(p.created_ts)||p.created_ts<c.observed_ts||p.created_ts>now||!Number.isSafeInteger(c.trigger?.expires_ts)||c.trigger.expires_ts<=now)return null;
 if(assessActionability({canonical:c,lifecycle_event:'OBSERVE'}).deliver!==true||renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE'}).ok!==true)return null;
 return{publication_id:p.publication_id,snapshot_id:c.snapshot_id,observed_ts:c.observed_ts,canonical:c};
}

export async function findUnsentSourceRoleRefusal(db,{ctx,base_key,qualified}={}){
 const result=await db.prepare(`SELECT d.idempotency_key,d.state,d.lifecycle_event,d.last_error,d.telegram_message_id,d.sent_ts,d.updated_ts,b.idempotency_key AS binding_key
   FROM v3_telegram_dispatch_shadow d LEFT JOIN v3_dispatch_publication_binding_shadow b ON b.idempotency_key=d.idempotency_key
   WHERE d.contract=?1 AND d.direction=?2 AND d.wave_id=?3 AND d.rules_version=?4
   ORDER BY d.created_ts DESC LIMIT 9`).bind(ctx.contract,ctx.direction,ctx.wave_id,ctx.rules_version).all();
 if(result?.success===false||!Array.isArray(result?.results))throw Error('RECOVERY_JOURNAL_READ_NOT_CLOSED');
 const rows=result.results;if(rows.length>OBSERVATION_RECOVERY_MAX_JOURNAL_ROWS)return null;
 if(rows.some(r=>['OBSERVE','WAIT','ENTRY'].includes(r.lifecycle_event)&&active.has(r.state)))return null;
 const old=rows.find(r=>r.idempotency_key===base_key);
 return old?.state==='FAILED_FINAL'&&old.lifecycle_event==='OBSERVE'&&recoverableRefusals.has(old.last_error)&&old.telegram_message_id===null&&old.sent_ts===null&&old.binding_key===null&&Number.isSafeInteger(old.updated_ts)&&old.updated_ts<qualified.observed_ts?old:null;
}

export function observationRecoveryInsert(db,{row,ctx,base_key,qualified,now}={}){
 return db.prepare(`INSERT OR IGNORE INTO v3_telegram_dispatch_shadow(
   dispatch_id,idempotency_key,contract,direction,wave_id,lifecycle_event,rules_version,state,decision_id,message_hash,created_ts,updated_ts,shadow_only)
   SELECT ?1,?2,?3,?4,?5,'OBSERVE',?6,'PENDING',?7,?8,?9,?9,1
   WHERE EXISTS(SELECT 1 FROM v3_telegram_dispatch_shadow d
     WHERE d.idempotency_key=?10 AND d.contract=?3 AND d.direction=?4 AND d.wave_id=?5 AND d.rules_version=?6 AND d.lifecycle_event='OBSERVE'
       AND d.state='FAILED_FINAL' AND d.last_error IN ('OBSERVE_SOURCE_ROLES_NOT_CLOSED','OBSERVE_STATE_MISMATCH') AND d.telegram_message_id IS NULL AND d.sent_ts IS NULL AND d.updated_ts<?11
       AND NOT EXISTS(SELECT 1 FROM v3_dispatch_publication_binding_shadow b WHERE b.idempotency_key=d.idempotency_key))
   AND NOT EXISTS(SELECT 1 FROM v3_telegram_dispatch_shadow d
     WHERE d.contract=?3 AND d.direction=?4 AND d.wave_id=?5 AND d.rules_version=?6 AND d.lifecycle_event IN ('OBSERVE','WAIT','ENTRY')
       AND d.state IN ('PENDING','FAILED_RETRYABLE','SENDING','SENT'))`)
  .bind(row.dispatch_id,row.idempotency_key,ctx.contract,ctx.direction,ctx.wave_id,ctx.rules_version,ctx.decision_id||null,ctx.message_hash||null,now,base_key,qualified.observed_ts);
}
