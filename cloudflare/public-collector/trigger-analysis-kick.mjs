import {TRIGGER_KICK_PLAN,proveTriggeredRecheckD1Budget} from '../../current-generation/files/src/triggered-entry-recheck.mjs';

export const KICK_PLAN=TRIGGER_KICK_PLAN;
export function proveTriggerKickBudget(){
 return {...proveTriggeredRecheckD1Budget(),...KICK_PLAN,regular_analytics_interval_minutes:40,original_trigger_ttl_unchanged:true};
}
export function freshTriggerHint(row,now){
 let r;try{r=JSON.parse(row.last_result);}catch{return false;}
 return /^RCHK:[a-f0-9]{40}$/.test(String(row.task_id))&&row.state==='PENDING'&&Number.isSafeInteger(now)&&now>=row.due_ts&&now<row.expires_ts&&
   r.schema==='LIGHT_PRICE_RECHECK_V1'&&r.scope==='PRICE_AND_CANCELLATION_ONLY'&&r.status==='TRIGGER_PRICE_REACHED_FULL_ANALYSIS_REQUIRED'&&
   r.entry_authorized===false&&r.full_analysis_completed===false&&r.settlement_confirmed===false&&r.source==='HTX_OFFICIAL_COLLECTOR'&&
   Number.isFinite(r.price)&&r.price>0&&[r.checked_ts,r.source_ts,r.observed_ts].every(t=>Number.isSafeInteger(t)&&t>=row.created_ts&&t<=now&&now-t<=180000)&&
   r.task_id===row.task_id&&r.publication_id===row.publication_id&&r.run_id===row.run_id&&r.snapshot_id===row.snapshot_id&&
   /^[a-f0-9]{64}$/.test(r.analytical_fingerprint)&&/^[1-9][0-9]*$/.test(String(r.telegram_message_id));
}
// A bounded wake-up hint, never an analysis admission or entry decision.
// The runner rechecks the exact SENT binding, canonical hash, price, original
// lifetime, current evidence and the existing three-attempt daily admission.
export async function claimTriggerKick(db,{now_ts=Date.now()}={}){
 const usageBefore=db.usageSnapshot?.()||{rows_read:0,rows_written:0,unknown_ops:0};
 const base={schema:'EXACT_TRIGGER_ANALYSIS_KICK_V1',dispatch:false,entry_authorized:false,source_http:0,telegram:false};
 if(!proveTriggerKickBudget().safe||!Number.isSafeInteger(now_ts))return {...base,status:'KICK_PLAN_INVALID'};
 const day=new Date(now_ts).toISOString().slice(0,10),bucket=Math.floor(now_ts/300000)*300000;
 await db.prepare('CREATE TABLE IF NOT EXISTS report2_trigger_kick_poll(day_key TEXT PRIMARY KEY,last_bucket INTEGER NOT NULL,polls INTEGER NOT NULL CHECK(polls BETWEEN 1 AND 288))').run();
 await db.prepare('CREATE TABLE IF NOT EXISTS report2_trigger_kick_slot(day_key TEXT NOT NULL,slot INTEGER NOT NULL CHECK(slot BETWEEN 0 AND 2),task_id TEXT NOT NULL UNIQUE,kick_ts INTEGER NOT NULL,PRIMARY KEY(day_key,slot))').run();
 const counted=await db.prepare(`INSERT INTO report2_trigger_kick_poll(day_key,last_bucket,polls) VALUES(?1,?2,1)
   ON CONFLICT(day_key) DO UPDATE SET last_bucket=excluded.last_bucket,polls=polls+1
   WHERE last_bucket<excluded.last_bucket AND polls<288`).bind(day,bucket).run();
 if(Number(counted?.meta?.changes??0)!==1)return {...base,status:'POLL_ALREADY_COUNTED_OR_DAILY_CAP',day,bucket};
 const slots=await db.prepare('SELECT slot,task_id FROM report2_trigger_kick_slot WHERE day_key=?1 ORDER BY slot LIMIT 3').bind(day).all();
 if((slots.results||[]).length>=3)return {...base,status:'KICK_DAILY_CAP',day,bucket};
 // Materialized LIMIT 2 precedes any other operation. The existing partial
// trigger index excludes waiting receipts; no growing task scan is allowed.
 const found=await db.prepare(`SELECT task_id,publication_id,contract_code,direction,run_id,snapshot_id,due_ts,expires_ts,state,created_ts,updated_ts,last_result
   FROM v3_recheck_task_shadow AS t INDEXED BY idx_report2_recheck_trigger_ready
   WHERE state='PENDING' AND json_valid(last_result) AND json_extract(last_result,'$.status')='TRIGGER_PRICE_REACHED_FULL_ANALYSIS_REQUIRED'
     AND expires_ts>?1 AND due_ts<=?1
     AND NOT EXISTS(SELECT 1 FROM report2_trigger_kick_slot k WHERE k.task_id=t.task_id)
     ORDER BY expires_ts,due_ts LIMIT 2`).bind(now_ts).all();
 for(const row of found.results||[]){
   if(!freshTriggerHint(row,now_ts))continue;
   for(let slot=0;slot<3;slot++){
     const claim=await db.prepare(`INSERT INTO report2_trigger_kick_slot(day_key,slot,task_id,kick_ts)
       SELECT ?1,?2,?3,?4 WHERE EXISTS(SELECT 1 FROM v3_recheck_task_shadow WHERE task_id=?3 AND state='PENDING' AND updated_ts=?5 AND last_result=?6 AND expires_ts>?4)
       AND NOT EXISTS(SELECT 1 FROM report2_trigger_kick_slot WHERE task_id=?3 OR (day_key=?1 AND slot=?2)) ON CONFLICT DO NOTHING`).bind(day,slot,row.task_id,now_ts,row.updated_ts,row.last_result).run();
     if(Number(claim?.meta?.changes??0)!==1)continue;
     const ack=await db.prepare('SELECT day_key,slot,task_id,kick_ts FROM report2_trigger_kick_slot WHERE task_id=?1 LIMIT 1').bind(row.task_id).first();
     if(ack?.day_key!==day||Number(ack.slot)!==slot||Number(ack.kick_ts)!==now_ts)return {...base,status:'KICK_READBACK_FAILED'};
     const measured=db.usageSnapshot?.(),usage=measured?Object.fromEntries(['rows_read','rows_written','unknown_ops'].map(k=>[k,Number(measured[k]||0)-Number(usageBefore[k]||0)])):null;
     if(usage&&(usage.unknown_ops||usage.rows_read>KICK_PLAN.poll_rows_read||usage.rows_written>KICK_PLAN.poll_rows_written))return {...base,status:'KICK_MEASURED_ENVELOPE_BLOCKED',usage};
     return {...base,status:'EXACT_TRIGGER_ANALYSIS_WAKE_UP',dispatch:true,day,bucket,slot,task_id:row.task_id,expires_ts:row.expires_ts,kick_ts:now_ts,failed_dispatch_consumes_kick:true};
   }
 }
 return {...base,status:'NO_FRESH_TRIGGER_HINT',day,bucket};
}
