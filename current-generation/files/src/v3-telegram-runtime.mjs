import {
  deriveUserLifecycleStatus,
  decideLifecycleDispatch,
  revalidateBeforeSend,
  nextDispatchState,
  renderRussianLifecycleMessage,
  DISPATCH_STATE,
  USER_STATE,
} from './v3-telegram-lifecycle.mjs';

import {qualifiedObservationRecovery,findUnsentSourceRoleRefusal,observationRecoveryInsert} from './observation-prepublication-recovery.mjs';

export const V3_TELEGRAM_RUNTIME_VERSION='v3-telegram-runtime-shadow-v1';
function text(v){return v==null?'':String(v).trim();}
function upper(v){return text(v).toUpperCase();}
function finite(v){if(v==null||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;}
function json(v,fb){try{return JSON.stringify(v??fb);}catch{return JSON.stringify(fb);}}
function dispatchId(key){return `V3TG:${key}`;}

export async function prepareLifecycleTransition(db,ctx={},now_ts=Date.now()){
  const base={version:V3_TELEGRAM_RUNTIME_VERSION,mode:'SHADOW_ONLY',probability:null,validated_signal:false,trading_execution:false};
  if(!db?.prepare||!db?.batch) return {...base,status:'SOURCE_UNSUPPORTED'};
  const contract=text(ctx.contract),dir=upper(ctx.direction),wave=text(ctx.wave_id),rules=text(ctx.rules_version);
  if(!contract||!['LONG','SHORT'].includes(dir)||!wave||!rules) return {...base,status:'IDENTITY_NOT_CLOSED'};
  let previous=null;
  try{previous=await db.prepare(`SELECT status,reason,observation_ts,valid_until_ts,updated_ts FROM v3_user_lifecycle_shadow
    WHERE contract=?1 AND direction=?2 AND wave_id=?3 AND rules_version=?4 LIMIT 1`).bind(contract,dir,wave,rules).first();}
  catch(error){return {...base,status:/no such table/i.test(String(error?.message||error))?'MIGRATION_REQUIRED':'PARTIAL',error:String(error?.message||error)};}
  const previousStatus=upper(previous?.status||USER_STATE.NONE);
  const derived=deriveUserLifecycleStatus({...ctx,previous_status:previousStatus,direction:dir});
  if(derived.status===USER_STATE.NONE) return {...base,status:'CLOSED_NOT_USER_VISIBLE',previous_status:previousStatus,current_status:derived.status,reason:derived.reason,dispatch:null};
  const now=Math.trunc(Number(now_ts)||Date.now());
  const obs=Math.trunc(finite(ctx.observation_ts)??now);
  const until=finite(ctx.valid_until_ts);
  const dispatchCandidate=decideLifecycleDispatch({previous_status:previousStatus,current_status:derived.status,contract,direction:dir,wave_id:wave,rules_version:rules,cooldown_active:ctx.cooldown_active});
  const dispatchEnabled=ctx.dispatch_enabled !== false;
  let dispatch=dispatchEnabled ? dispatchCandidate : {...dispatchCandidate,dispatch:false,reason:dispatchCandidate.dispatch===true?'SHADOW_DISPATCH_DISABLED':dispatchCandidate.reason};
  let recovery=null;
  const qualified=qualifiedObservationRecovery({ctx,previous_status:previousStatus,current_status:derived.status,dispatch,now});
  if(qualified){
    const first=decideLifecycleDispatch({previous_status:USER_STATE.NONE,current_status:derived.status,contract,direction:dir,wave_id:wave,rules_version:rules,cooldown_active:ctx.cooldown_active});
    if(first.dispatch===true)try{
      const old=await findUnsentSourceRoleRefusal(db,{ctx,base_key:first.key,qualified});
      if(old){recovery={base_key:first.key,qualified};dispatch={...first,key:first.key+'|RECOVERY|'+qualified.snapshot_id,reason:'FRESH_QUALIFIED_OBSERVATION_AFTER_UNSENT_SOURCE_ROLE_REFUSAL'};}
    }catch(error){return {...base,status:'RECOVERY_JOURNAL_NOT_CLOSED',error:String(error.message).slice(0,180)};}
  }
  const stmts=[db.prepare(`INSERT INTO v3_user_lifecycle_shadow(
    contract,direction,wave_id,rules_version,status,reason,observation_ts,valid_until_ts,updated_ts,shadow_only)
    VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,1)
    ON CONFLICT(contract,direction,wave_id,rules_version) DO UPDATE SET
      status=excluded.status,reason=excluded.reason,observation_ts=excluded.observation_ts,
      valid_until_ts=excluded.valid_until_ts,updated_ts=excluded.updated_ts,shadow_only=1`)
    .bind(contract,dir,wave,rules,derived.status,derived.reason,obs,until,now)];
  let dispatchRow=null;
  if(dispatch.dispatch===true){
    dispatchRow={dispatch_id:dispatchId(dispatch.key),idempotency_key:dispatch.key,contract,direction:dir,wave_id:wave,lifecycle_event:derived.status,rules_version:rules,state:DISPATCH_STATE.PENDING,created_ts:now};
    if(recovery)stmts.push(observationRecoveryInsert(db,{row:dispatchRow,ctx,base_key:recovery.base_key,qualified:recovery.qualified,now}));
    else stmts.push(db.prepare(`INSERT OR IGNORE INTO v3_telegram_dispatch_shadow(
      dispatch_id,idempotency_key,contract,direction,wave_id,lifecycle_event,rules_version,state,
      decision_id,message_hash,created_ts,updated_ts,shadow_only)
      VALUES(?1,?2,?3,?4,?5,?6,?7,'PENDING',?8,?9,?10,?10,1)`)
      .bind(dispatchRow.dispatch_id,dispatchRow.idempotency_key,contract,dir,wave,derived.status,rules,text(ctx.decision_id)||null,text(ctx.message_hash)||null,now));
  }
  let acknowledgements;try{acknowledgements=await db.batch(stmts);}catch(error){return {...base,status:'PARTIAL',error:String(error?.message||error)};}
  if(recovery&&Number(acknowledgements?.[1]?.meta?.changes??acknowledgements?.[1]?.changes??0)!==1){dispatchRow=null;dispatch={dispatch:false,reason:'RECOVERY_ALREADY_QUEUED_OR_INELIGIBLE',key:null};}
  return {...base,status:'CLOSED',previous_status:previousStatus,current_status:derived.status,reason:derived.reason,dispatch:dispatchRow,dispatch_decision:dispatch};
}

export async function claimLifecycleDispatch(db,{idempotency_key,revalidation,now_ts=Date.now()}={}){
  if(!db?.prepare) return {status:'SOURCE_UNSUPPORTED',claimed:false};
  const key=text(idempotency_key);if(!key)return {status:'INVALID_KEY',claimed:false};
  const rv=revalidateBeforeSend(revalidation||{});
  const now=Math.trunc(Number(now_ts)||Date.now());
  if(!rv.ok){
    const state=nextDispatchState({current:DISPATCH_STATE.PENDING,revalidation:rv});
    try{await db.prepare(`UPDATE v3_telegram_dispatch_shadow SET state=?2,last_error=?3,updated_ts=?4
      WHERE idempotency_key=?1 AND state IN ('PENDING','FAILED_RETRYABLE')`).bind(key,state,rv.status,now).run();}catch(error){return {status:'PARTIAL',claimed:false,error:String(error?.message||error)};}
    return {status:state,claimed:false,revalidation:rv};
  }
  try{
    const result=await db.prepare(`UPDATE v3_telegram_dispatch_shadow SET state='SENDING',last_error=NULL,updated_ts=?2
      WHERE idempotency_key=?1 AND state IN ('PENDING','FAILED_RETRYABLE')`).bind(key,now).run();
    const changes=Number(result?.meta?.changes??result?.changes??0);
    return {status:changes===1?'SENDING':'NOT_CLAIMED',claimed:changes===1,revalidation:rv};
  }catch(error){return {status:'PARTIAL',claimed:false,error:String(error?.message||error)};}
}

export async function finalizeLifecycleDispatch(db,{idempotency_key,network_result,telegram_message_id=null,error=null,now_ts=Date.now()}={}){
  if(!db?.prepare)return {status:'SOURCE_UNSUPPORTED'};
  const key=text(idempotency_key);if(!key)return {status:'INVALID_KEY'};
  const state=nextDispatchState({current:DISPATCH_STATE.SENDING,network_result,revalidation:{ok:true}});
  const now=Math.trunc(Number(now_ts)||Date.now());
  const sent=state===DISPATCH_STATE.SENT?now:null;
  try{
    const result=await db.prepare(`UPDATE v3_telegram_dispatch_shadow SET state=?2,telegram_message_id=?3,last_error=?4,updated_ts=?5,
      sent_ts=CASE WHEN ?6 IS NULL THEN sent_ts ELSE ?6 END WHERE idempotency_key=?1 AND state='SENDING'`)
      .bind(key,state,text(telegram_message_id)||null,text(error)||null,now,sent).run();
    const changes=Number(result?.meta?.changes??result?.changes??0);
    return {status:changes===1?state:'NOT_FINALIZED',state,updated:changes===1};
  }catch(e){return {status:'PARTIAL',error:String(e?.message||e)};}
}

export function renderLifecycleForDispatch(ctx={}){
  return renderRussianLifecycleMessage(ctx);
}

export default {prepareLifecycleTransition,claimLifecycleDispatch,finalizeLifecycleDispatch,renderLifecycleForDispatch};
