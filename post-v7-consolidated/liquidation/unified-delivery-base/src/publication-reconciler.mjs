import {finalizePublication,bindDispatchToPublication,loadBoundTelegram,renderCanonicalTelegram,renderCanonicalManual} from './canonical-publication.mjs';
import {enqueueRecheck} from './recheck-scheduler.mjs';
export const PUBLICATION_RECONCILER_VERSION='post-v7-publication-reconciler-v2-run-bound-20260926';
const text=v=>v==null?'':String(v).trim();const upper=v=>text(v).toUpperCase();
function rows(x){return Array.isArray(x?.results)?x.results:[];}
async function mark(db,key,state,error,now){const r=await db.prepare(`UPDATE v3_telegram_dispatch_shadow SET state=?2,last_error=?3,updated_ts=?4 WHERE idempotency_key=?1 AND state IN ('PENDING','FAILED_RETRYABLE')`).bind(text(key),state,text(error).slice(0,240),now).run();return Number(r?.meta?.changes??r?.changes??0)===1;}
async function exactPublicationForDispatch(db,row,{source_run_id=null}={}){
 const life=await db.prepare(`SELECT status,reason,observation_ts,valid_until_ts,updated_ts FROM v3_user_lifecycle_shadow WHERE contract=?1 AND direction=?2 AND wave_id=?3 AND rules_version=?4 LIMIT 1`).bind(row.contract,upper(row.direction),row.wave_id,row.rules_version).first();
 if(!life)return {status:'LIFECYCLE_NOT_FOUND'};
 if(upper(life.status)!==upper(row.lifecycle_event))return {status:'LIFECYCLE_SUPERSEDED'};
 const run=text(source_run_id);const isEntry=upper(row.lifecycle_event)==='ENTRY'&&text(row.decision_id);
 let q;
 if(run){
  q=isEntry
   ? await db.prepare(`SELECT publication_id,canonical_json,presentation_inputs_json,decision_id,actionability_status,run_id,snapshot_id,observed_ts FROM canonical_publication_shadow WHERE contract_code=?1 AND direction=?2 AND wave_id=?3 AND run_id=?4 AND decision_id=?5 ORDER BY publication_id ASC`).bind(row.contract,upper(row.direction),row.wave_id,run,text(row.decision_id)).all()
   : await db.prepare(`SELECT publication_id,canonical_json,presentation_inputs_json,decision_id,actionability_status,run_id,snapshot_id,observed_ts FROM canonical_publication_shadow WHERE contract_code=?1 AND direction=?2 AND wave_id=?3 AND run_id=?4 ORDER BY publication_id ASC`).bind(row.contract,upper(row.direction),row.wave_id,run).all();
 }else{
  const center=Number(row.created_ts||row.updated_ts||life.updated_ts||Date.now());const lo=center-30*60_000,hi=Number(row.updated_ts||center)+30*60_000;
  q=isEntry
   ? await db.prepare(`SELECT publication_id,canonical_json,presentation_inputs_json,decision_id,actionability_status,run_id,snapshot_id,observed_ts FROM canonical_publication_shadow WHERE contract_code=?1 AND direction=?2 AND wave_id=?3 AND decision_id=?4 AND created_ts BETWEEN ?5 AND ?6 ORDER BY publication_id ASC`).bind(row.contract,upper(row.direction),row.wave_id,text(row.decision_id),lo,hi).all()
   : await db.prepare(`SELECT publication_id,canonical_json,presentation_inputs_json,decision_id,actionability_status,run_id,snapshot_id,observed_ts FROM canonical_publication_shadow WHERE contract_code=?1 AND direction=?2 AND wave_id=?3 AND created_ts BETWEEN ?4 AND ?5 ORDER BY publication_id ASC`).bind(row.contract,upper(row.direction),row.wave_id,lo,hi).all();
 }
 const matches=rows(q);if(matches.length!==1)return {status:matches.length?'AMBIGUOUS_CANONICAL_SNAPSHOT':'CANONICAL_SNAPSHOT_NOT_FOUND',life,matches:matches.length,source_run_id:run||null};
 return {status:'CLOSED',life,pub:matches[0],source_run_id:run||matches[0].run_id||null};
}
async function priorSent(db,row){const x=await db.prepare(`SELECT idempotency_key FROM v3_telegram_dispatch_shadow WHERE contract=?1 AND direction=?2 AND wave_id=?3 AND state='SENT' AND lifecycle_event IN ('OBSERVE','WAIT','ENTRY') AND CAST(telegram_message_id AS INTEGER)>0 AND updated_ts<?4 ORDER BY updated_ts DESC LIMIT 1`).bind(row.contract,upper(row.direction),row.wave_id,Number(row.updated_ts||Date.now())).first();return Boolean(x);}
export async function reconcilePendingPublications(db,{now_ts=Date.now(),limit=8,source_run_id=null}={}){
 const now=Math.trunc(Number(now_ts)||Date.now());const q=await db.prepare(`SELECT dispatch_id,idempotency_key,contract,direction,wave_id,lifecycle_event,rules_version,state,decision_id,created_ts,updated_ts FROM v3_telegram_dispatch_shadow WHERE state IN ('PENDING','FAILED_RETRYABLE') ORDER BY CASE WHEN lifecycle_event='IDEA_REMOVED' THEN 0 WHEN lifecycle_event='ENTRY' THEN 1 WHEN lifecycle_event='WAIT' THEN 2 ELSE 3 END,updated_ts ASC LIMIT ?1`).bind(Math.max(1,Math.min(32,Number(limit)||8))).all();const out=[];
 for(const row of rows(q)){
  const existingBinding=await db.prepare(`SELECT publication_id FROM v3_dispatch_publication_binding_shadow WHERE idempotency_key=?1 LIMIT 1`).bind(row.idempotency_key).first();
  if(existingBinding?.publication_id){out.push({key:row.idempotency_key,status:'ALREADY_BOUND',publication_id:existingBinding.publication_id});continue;}
  const exact=await exactPublicationForDispatch(db,row,{source_run_id});if(exact.status!=='CLOSED'){if(exact.status==='LIFECYCLE_SUPERSEDED')await mark(db,row.idempotency_key,'FAILED_FINAL',exact.status,now);out.push({key:row.idempotency_key,status:exact.status,matches:exact.matches??null});continue;}
  let canonical;try{canonical=JSON.parse(exact.pub.canonical_json);}catch{await mark(db,row.idempotency_key,'FAILED_FINAL','CANONICAL_JSON_INVALID',now);out.push({key:row.idempotency_key,status:'CANONICAL_JSON_INVALID'});continue;}
  if(text(source_run_id)&&text(canonical.run_id)!==text(source_run_id)){await mark(db,row.idempotency_key,'FAILED_FINAL','CANONICAL_RUN_MISMATCH',now);out.push({key:row.idempotency_key,status:'CANONICAL_RUN_MISMATCH'});continue;}
  const tg=renderCanonicalTelegram({canonical,lifecycle_event:row.lifecycle_event});
  let presentationInputs={};try{presentationInputs=JSON.parse(exact.pub.presentation_inputs_json||'{}')||{};}catch{presentationInputs={};}
  const savedManual=text(presentationInputs.manual_text||presentationInputs.manual?.text);
  const man=savedManual?{ok:true,status:'SAVED_CANONICAL_MANUAL',text:savedManual}:renderCanonicalManual({canonical,lifecycle_event:row.lifecycle_event});
  if(!tg.ok||!man.ok){await mark(db,row.idempotency_key,'FAILED_FINAL',tg.status||man.status,now);out.push({key:row.idempotency_key,status:'PRESENTATION_FAILED'});continue;}
  const f=await finalizePublication(db,{publication_id:exact.pub.publication_id,lifecycle_event:row.lifecycle_event,direction:row.direction,manual_text:man.text,telegram_text:tg.text,prior_sent:await priorSent(db,row),now_ts:now});
  if(f.deliver!==true){await mark(db,row.idempotency_key,'FAILED_FINAL',f.reason||f.status,now);out.push({key:row.idempotency_key,status:'SUPPRESSED_ACTIONABILITY',reason:f.reason||f.status});continue;}
  if(f.create_recheck===true){const t=canonical.trigger;const rq=await enqueueRecheck(db,{publication_id:exact.pub.publication_id,contract:row.contract,direction:row.direction,wave_id:row.wave_id,snapshot_id:canonical.snapshot_id,run_id:canonical.run_id,due_ts:t.next_recheck_ts,expires_ts:t.expires_ts,now_ts:now});if(rq.enqueued!==true){await mark(db,row.idempotency_key,'FAILED_RETRYABLE','RECHECK_TASK_NOT_PERSISTED',now);out.push({key:row.idempotency_key,status:'RECHECK_TASK_NOT_PERSISTED'});continue;}}
  const b=await bindDispatchToPublication(db,{idempotency_key:row.idempotency_key,publication_id:exact.pub.publication_id,contract:row.contract,direction:row.direction,wave_id:row.wave_id,lifecycle_event:row.lifecycle_event,rules_version:row.rules_version,decision_id:row.decision_id,now_ts:now});if(!b.bound){await mark(db,row.idempotency_key,'FAILED_FINAL',b.status,now);out.push({key:row.idempotency_key,status:b.status});continue;}
  out.push({key:row.idempotency_key,status:'BOUND_ACTIONABLE',publication_id:exact.pub.publication_id,run_id:canonical.run_id,snapshot_id:canonical.snapshot_id});
 }
 return {status:'CLOSED',processed:out.length,source_run_id:text(source_run_id)||null,results:out};
}
export async function loadBoundDispatchForNetwork(db,{row,now_ts=Date.now()}={}){
 const bound=await loadBoundTelegram(db,{idempotency_key:row?.idempotency_key,now_ts});if(!bound.ok)return bound;
 const life=await db.prepare(`SELECT status,reason,observation_ts,valid_until_ts,updated_ts FROM v3_user_lifecycle_shadow WHERE contract=?1 AND direction=?2 AND wave_id=?3 AND rules_version=?4 LIMIT 1`).bind(row.contract,upper(row.direction),row.wave_id,row.rules_version).first();
 if(!life||upper(life.status)!==upper(row.lifecycle_event))return {status:'LIFECYCLE_SUPERSEDED',ok:false};
 const canonical=bound.canonical;
 const nativePresent=canonical?.liquidations?.early_context_present===true||canonical?.liquidations?.native_extension?.schema==='NATIVE_LIQUIDATION_CONTEXT_V1';
 if(nativePresent&&['OBSERVE','WAIT'].includes(upper(row.lifecycle_event))){
  let task=null;try{task=await db.prepare(`SELECT state,due_ts,expires_ts,run_id,snapshot_id FROM v3_recheck_task_shadow WHERE publication_id=?1 AND contract_code=?2 AND direction=?3 AND wave_id=?4 LIMIT 1`).bind(bound.publication_id,row.contract,upper(row.direction),row.wave_id).first();}catch{return {status:'RECHECK_TASK_NOT_PERSISTED',ok:false};}
  if(!task||!['PENDING','CLAIMED'].includes(task.state)||task.run_id!==canonical.run_id||task.snapshot_id!==canonical.snapshot_id||task.due_ts!==canonical?.trigger?.next_recheck_ts||task.expires_ts!==canonical?.trigger?.expires_ts)return {status:'RECHECK_TASK_NOT_PERSISTED',ok:false};
 }
 const valid=Number(life.valid_until_ts??canonical?.trigger?.expires_ts??0)||null;if(valid!==null&&valid<Number(now_ts)&&upper(row.lifecycle_event)!=='IDEA_REMOVED')return {status:'EXPIRED_NOT_SENT',ok:false};
 return {...bound,status:'CLOSED',ok:true,revalidation:{status:upper(row.lifecycle_event),now:Number(now_ts),observation_ts:Number(canonical.observed_ts),valid_until_ts:valid,identity_current:true,data_current:true,cancellation_prior_delivery_verified:upper(row.lifecycle_event)==='IDEA_REMOVED'&&bound.prior_delivery_verified===true,lifecycle_stage:upper(row.lifecycle_event),hard_veto:false,superseded:false,timing_state:upper(row.lifecycle_event)==='ENTRY'?'ENTRY_WINDOW':'WAIT'}};
}
export default{PUBLICATION_RECONCILER_VERSION,reconcilePendingPublications,loadBoundDispatchForNetwork};
