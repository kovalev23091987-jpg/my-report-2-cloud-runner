export const SCHEDULER_CONTROL_VERSION='post-v7-scheduler-control-v1-20260926';
const text=v=>v==null?'':String(v).trim();
const upper=v=>text(v).toUpperCase();
const stamp=v=>Number.isSafeInteger(Number(v))&&Number(v)>=1_000_000_000_000?Number(v):null;
const interval=v=>Number.isSafeInteger(Number(v))&&Number(v)>=60_000?Number(v):null;
export const PERIODIC_ANALYTICS_JOB='PERIODIC_ANALYTICS';
export const DEFAULT_PERIODIC_OWNER='GITHUB_ACTIONS';

export function maintenanceSucceeded({recall,prospective,prospective_enabled}={}){
 const recallClosed=recall?.persisted===true&&['CLOSED','PARTIAL','ALREADY_FILLED_THIS_HOUR'].includes(recall?.status);
 const prospectiveClosed=prospective_enabled===true?prospective?.status==='CLOSED':prospective_enabled===false&&prospective?.status==='DISABLED';
 return recallClosed&&prospectiveClosed;
}

export async function loadSchedulerOwnership(db,{job_key=PERIODIC_ANALYTICS_JOB,default_owner=DEFAULT_PERIODIC_OWNER}={}){
 if(!db?.prepare)return{status:'SOURCE_UNSUPPORTED',owner:null};
 try{
  const row=await db.prepare(`SELECT owner,updated_ts FROM v3_scheduler_job_ownership_shadow WHERE job_key=?1 LIMIT 1`).bind(text(job_key)).first();
  if(row&&text(row.owner))return{status:'CLOSED',owner:upper(row.owner),updated_ts:Number(row.updated_ts)||null,source:'D1'};
  return{status:'DEFAULT_OWNER',owner:upper(default_owner),updated_ts:null,source:'DEFAULT_FAIL_CLOSED'};
 }catch(error){
  if(/no such table/i.test(String(error?.message||error)))return{status:'MIGRATION_REQUIRED',owner:null};
  return{status:'READ_FAILED',owner:null,error:String(error?.message||error).slice(0,240)};
 }
}
export async function actorOwnsPeriodicAnalytics(db,{actor,job_key=PERIODIC_ANALYTICS_JOB,default_owner=DEFAULT_PERIODIC_OWNER}={}){
 const ownership=await loadSchedulerOwnership(db,{job_key,default_owner});
 if(!ownership.owner)return{...ownership,allowed:false,actor:upper(actor)};
 return{...ownership,allowed:upper(actor)===ownership.owner,actor:upper(actor)};
}

export async function claimMaintenanceCadence(db,{job_key,actor='GITHUB_ACTIONS',now_ts=Date.now(),interval_ms,lease_ms=10*60_000}={}){
 const now=stamp(now_ts),iv=interval(interval_ms),lease=Math.max(60_000,Number(lease_ms)||600_000),key=text(job_key),owner=text(actor);
 if(!db?.prepare||!key||!owner||now===null||iv===null)return{status:'INVALID_INPUT',claimed:false,due:false};
 try{
  const existing=await db.prepare(`SELECT job_key,interval_ms,last_success_ts,lease_owner,lease_expires_ts,updated_ts FROM v3_maintenance_cadence_shadow WHERE job_key=?1 LIMIT 1`).bind(key).first();
  const last=stamp(existing?.last_success_ts);
  const due=last===null||now-last>=iv;
  if(!due)return{status:'NOT_DUE',claimed:false,due:false,last_success_ts:last,next_due_ts:last+iv};
  if(existing&&text(existing.lease_owner)&&Number(existing.lease_expires_ts||0)>now)return{status:'LEASE_ACTIVE',claimed:false,due:true,lease_owner:existing.lease_owner,lease_expires_ts:Number(existing.lease_expires_ts)};
  const leaseExp=now+lease;
  const r=await db.prepare(`INSERT INTO v3_maintenance_cadence_shadow(job_key,interval_ms,last_success_ts,lease_owner,lease_started_ts,lease_expires_ts,updated_ts,shadow_only)
    VALUES(?1,?2,NULL,?3,?4,?5,?4,1)
    ON CONFLICT(job_key) DO UPDATE SET interval_ms=excluded.interval_ms,lease_owner=excluded.lease_owner,lease_started_ts=excluded.lease_started_ts,lease_expires_ts=excluded.lease_expires_ts,updated_ts=excluded.updated_ts
    WHERE (v3_maintenance_cadence_shadow.last_success_ts IS NULL OR ?4-v3_maintenance_cadence_shadow.last_success_ts>=?2)
      AND (v3_maintenance_cadence_shadow.lease_expires_ts IS NULL OR v3_maintenance_cadence_shadow.lease_expires_ts<=?4)`).bind(key,iv,owner,now,leaseExp).run();
  if(Number(r?.meta?.changes??r?.changes??0)!==1)return{status:'CLAIM_RACE_LOST',claimed:false,due:true};
  const readback=await db.prepare(`SELECT interval_ms,last_success_ts,lease_owner,lease_started_ts,lease_expires_ts FROM v3_maintenance_cadence_shadow WHERE job_key=?1 LIMIT 1`).bind(key).first();
  if(!readback||text(readback.lease_owner)!==owner||Number(readback.lease_started_ts)!==now||Number(readback.lease_expires_ts)!==leaseExp)return{status:'CLAIM_READBACK_FAILED',claimed:false,due:true};
  return{status:'CLOSED',claimed:true,due:true,job_key:key,interval_ms:iv,last_success_ts:stamp(readback.last_success_ts),lease_owner:owner,lease_started_ts:now,lease_expires_ts:leaseExp};
 }catch(error){return{status:/no such table/i.test(String(error?.message||error))?'MIGRATION_REQUIRED':'CLAIM_FAILED',claimed:false,due:false,error:String(error?.message||error).slice(0,240)};}
}

export async function completeMaintenanceCadence(db,{job_key,actor='GITHUB_ACTIONS',lease_started_ts,success,now_ts=Date.now(),result=null}={}){
 const now=stamp(now_ts),claim=stamp(lease_started_ts),key=text(job_key),owner=text(actor);if(!db?.prepare||!key||!owner||now===null||claim===null)return{status:'INVALID_INPUT',completed:false,success_recorded:false};
 const ok=success===true;
 try{
  const r=await db.prepare(`UPDATE v3_maintenance_cadence_shadow SET last_success_ts=CASE WHEN ?4=1 THEN ?3 ELSE last_success_ts END,lease_owner=NULL,lease_started_ts=NULL,lease_expires_ts=NULL,updated_ts=?3,last_result=?5 WHERE job_key=?1 AND lease_owner=?2 AND lease_started_ts=?6 AND lease_expires_ts>=?3 AND ?3>=lease_started_ts`).bind(key,owner,now,ok?1:0,text(result)||null,claim).run();
  return{status:Number(r?.meta?.changes??r?.changes??0)===1?'CLOSED':'NOT_UPDATED',completed:Number(r?.meta?.changes??r?.changes??0)===1,success_recorded:ok&&Number(r?.meta?.changes??r?.changes??0)===1};
 }catch(error){return{status:/no such column/i.test(String(error?.message||error))?'MIGRATION_REQUIRED':'COMPLETE_FAILED',completed:false,error:String(error?.message||error).slice(0,240)};}
}

export default{SCHEDULER_CONTROL_VERSION,PERIODIC_ANALYTICS_JOB,DEFAULT_PERIODIC_OWNER,loadSchedulerOwnership,actorOwnsPeriodicAnalytics,claimMaintenanceCadence,completeMaintenanceCadence};
