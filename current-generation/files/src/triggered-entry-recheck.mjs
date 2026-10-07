import crypto from 'node:crypto';
import {TWO_CANDIDATE_PLAN} from './two-candidate-policy.mjs';
import {D1_DAILY_LIMITS} from './unified-budget.mjs';

export const TRIGGERED_RECHECK_VERSION='exact-sent-triggered-recheck-v1-20261008';
export const TRIGGERED_RECHECK_D1_RESERVATION=Object.freeze({rows_read:1500,rows_written:16});
export function proveTriggeredRecheckD1Budget(){
 // Reserve for every one of the72 cron invocations, even though ordinary
 // admitted cycles do not need this small admission-only ledger entry.
 const reads=D1_DAILY_LIMITS.planned_rows_read+72*TRIGGERED_RECHECK_D1_RESERVATION.rows_read;
 const writes=D1_DAILY_LIMITS.planned_rows_written+72*TRIGGERED_RECHECK_D1_RESERVATION.rows_written;
 return {safe:reads<=D1_DAILY_LIMITS.rows_read&&writes<=D1_DAILY_LIMITS.rows_written,maximum_planned_rows_read:reads,maximum_planned_rows_written:writes,cron_admissions_reserved:72,source_http:0};
}
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>[k,stable(v[k])])):v;
const fingerprint=c=>{const copy={...c};delete copy.analytical_fingerprint;return crypto.createHash('sha256').update(JSON.stringify(stable(copy))).digest('hex');};
const compare=(price,operator,value)=>operator==='>='?price>=value:operator==='>'?price>value:operator==='<='?price<=value:operator==='<'?price<value:false;
export function verifyTriggeredRecheck(row,{now_ts}={}){
 let c,r;try{c=JSON.parse(row.canonical_json);r=JSON.parse(row.last_result);}catch{return {eligible:false,status:'INVALID_SAVED_RECEIPT'};}
 const now=Number(now_ts),trigger=c.trigger,hash=fingerprint(c);
 const exact=row.state==='PENDING'&&['OBSERVE','WAIT_FOR_TRIGGER'].includes(c.state)&&['LONG','SHORT'].includes(c.direction)&&
   row.direction===c.direction&&c.metadata?.contract===row.contract_code&&c.run_id===row.run_id&&c.snapshot_id===row.snapshot_id&&
   hash===c.analytical_fingerprint&&hash===row.analytical_fingerprint&&hash===r.analytical_fingerprint&&
   r.task_id===row.task_id&&r.publication_id===row.publication_id&&r.run_id===row.run_id&&r.snapshot_id===row.snapshot_id&&
   /^[1-9][0-9]*$/.test(String(row.telegram_message_id))&&String(row.telegram_message_id)===r.telegram_message_id&&
   trigger?.expires_ts===row.expires_ts&&trigger?.next_recheck_ts===row.due_ts;
 if(!exact)return {eligible:false,status:'EXACT_SENT_IDENTITY_REQUIRED'};
 if(!Number.isSafeInteger(now)||now<row.due_ts||now>=row.expires_ts)return {eligible:false,status:'ORIGINAL_TRIGGER_WINDOW_CLOSED'};
 const clocks=[r.source_ts,r.observed_ts,r.checked_ts];
 if(!clocks.every(ts=>Number.isSafeInteger(ts)&&ts>=c.observed_ts&&ts<=now&&now-ts<=180000)||r.source!=='HTX_OFFICIAL_COLLECTOR')return {eligible:false,status:'FRESH_COLLECTOR_TRIGGER_REQUIRED'};
 const cancel=/^price\s*(>=|<=|>|<)\s*([0-9]+(?:\.[0-9]+)?(?:e[+-]?[0-9]+)?)$/i.exec(String(trigger.cancel_condition||''));
 if(r.schema!=='LIGHT_PRICE_RECHECK_V1'||r.scope!=='PRICE_AND_CANCELLATION_ONLY'||r.status!=='TRIGGER_PRICE_REACHED_FULL_ANALYSIS_REQUIRED'||r.entry_authorized!==false||r.full_analysis_completed!==false||r.settlement_confirmed!==false||trigger.metric!=='price'||trigger.unit!=='USDT'||!Number.isFinite(r.price)||r.price<=0||!Number.isFinite(trigger.value)||trigger.value<=0||!cancel||!compare(r.price,trigger.operator,trigger.value)||compare(r.price,cancel[1],Number(cancel[2])))return {eligible:false,status:'UNCANCELLED_PRICE_TRIGGER_REQUIRED'};
 return {eligible:true,status:'FRESH_EXACT_SENT_PRICE_TRIGGER',task_id:row.task_id,contract:row.contract_code,direction:row.direction,publication_id:row.publication_id,run_id:row.run_id,snapshot_id:row.snapshot_id,expires_ts:row.expires_ts,analytical_fingerprint:hash};
}

// Admission authorizes one fresh analysis, never ENTRY. Attempted slots are
// durable and are not refunded after a failure or reset by another executor.
export async function admitTriggeredRecheck(db,{actor,now_ts,admit=()=>({allowed:false})}={}){
 const base={version:TRIGGERED_RECHECK_VERSION,claimed:false,entry_authorized:false,source_http:0};
 if(actor!=='GITHUB_ACTIONS'||!Number.isSafeInteger(now_ts))return {...base,status:'ANALYTICS_OWNER_REQUIRED'};
 if((await admit())?.allowed!==true)return {...base,status:'D1_BUDGET_BLOCKED'};
 await db.prepare(`CREATE TABLE IF NOT EXISTS report2_triggered_recheck_admission(day_key TEXT NOT NULL,slot INTEGER NOT NULL CHECK(slot>=0 AND slot<3),task_id TEXT NOT NULL UNIQUE,actor TEXT NOT NULL,attempt_started_ts INTEGER NOT NULL,PRIMARY KEY(day_key,slot))`).run();
 // The partial index restricts receipt inspection to collector-confirmed
 // trigger rows; unrelated waiting tasks cannot starve a reached trigger.
 await db.prepare(`CREATE INDEX IF NOT EXISTS idx_report2_recheck_trigger_ready ON v3_recheck_task_shadow(expires_ts,due_ts) WHERE state='PENDING' AND json_valid(last_result) AND json_extract(last_result,'$.status')='TRIGGER_PRICE_REACHED_FULL_ANALYSIS_REQUIRED'`).run();
 const found=await db.prepare(`SELECT t.*,p.canonical_json,p.analytical_fingerprint,d.telegram_message_id
   FROM v3_recheck_task_shadow t
   JOIN canonical_publication_shadow p ON p.publication_id=t.publication_id AND p.contract_code=t.contract_code AND p.direction=t.direction AND p.wave_id=t.wave_id AND p.run_id=t.run_id AND p.snapshot_id=t.snapshot_id
   JOIN v3_dispatch_publication_binding_shadow b ON b.publication_id=t.publication_id AND b.contract_code=t.contract_code AND b.direction=t.direction AND b.wave_id=t.wave_id AND b.run_id=t.run_id AND b.snapshot_id=t.snapshot_id AND b.analytical_fingerprint=p.analytical_fingerprint
   JOIN v3_telegram_dispatch_shadow d ON d.idempotency_key=b.idempotency_key AND d.state='SENT' AND d.contract=t.contract_code AND d.direction=t.direction AND d.wave_id=t.wave_id
   JOIN v3_user_lifecycle_shadow l ON l.contract=t.contract_code AND l.direction=t.direction AND l.wave_id=t.wave_id AND l.rules_version=b.rules_version AND l.status=b.lifecycle_event AND l.observation_ts=p.observed_ts AND l.valid_until_ts>?1
   WHERE t.state='PENDING' AND json_valid(t.last_result) AND json_extract(t.last_result,'$.status')='TRIGGER_PRICE_REACHED_FULL_ANALYSIS_REQUIRED'
     AND t.expires_ts>?1 AND t.due_ts<=?1 AND b.lifecycle_event IN ('OBSERVE','WAIT') AND p.actionability_status='ACTIONABLE'
     AND NOT EXISTS(SELECT 1 FROM report2_triggered_recheck_admission a WHERE a.task_id=t.task_id)
   ORDER BY t.expires_ts,t.due_ts LIMIT 2`).bind(now_ts).all();
 const day=new Date(now_ts).toISOString().slice(0,10);
 for(const row of found?.results||[]){
  const verified=verifyTriggeredRecheck(row,{now_ts});if(!verified.eligible)continue;
  for(let slot=0;slot<TWO_CANDIDATE_PLAN.burst_deep_checks_per_day;slot++){
   const result=await db.prepare(`INSERT INTO report2_triggered_recheck_admission(day_key,slot,task_id,actor,attempt_started_ts)
     SELECT ?1,?2,?3,?4,?5 WHERE EXISTS(SELECT 1 FROM v3_recheck_task_shadow WHERE task_id=?3 AND state='PENDING' AND last_result=?6 AND updated_ts=?7 AND expires_ts>?5)
     AND NOT EXISTS(SELECT 1 FROM report2_triggered_recheck_admission WHERE task_id=?3 OR (day_key=?1 AND slot=?2))
     ON CONFLICT DO NOTHING`).bind(day,slot,row.task_id,actor,now_ts,row.last_result,row.updated_ts).run();
   if(Number(result?.meta?.changes??result?.changes??0)!==1)continue;
   const readback=await db.prepare('SELECT day_key,slot,task_id,actor,attempt_started_ts FROM report2_triggered_recheck_admission WHERE task_id=?1 LIMIT 1').bind(row.task_id).first();
   if(readback?.day_key!==day||Number(readback.slot)!==slot||readback.actor!==actor||Number(readback.attempt_started_ts)!==now_ts)return {...base,status:'BURST_READBACK_FAILED'};
   return {...base,status:'TRIGGERED_FULL_ANALYSIS_ADMITTED',claimed:true,task:verified,day_key:day,slot,max_per_run:1,failed_attempt_consumes_slot:true};
  }
  return {...base,status:'DAILY_BURST_CAP_OR_CONCURRENT_ADMISSION',task_id:row.task_id};
 }
 return {...base,status:'NO_FRESH_EXACT_SENT_TRIGGER'};
}
