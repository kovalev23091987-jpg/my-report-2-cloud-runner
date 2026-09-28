import {finalizePublication,bindDispatchToPublication,loadBoundTelegram,renderCanonicalTelegram,renderCanonicalManual} from './canonical-publication.mjs';
import {enqueueRecheck} from './recheck-scheduler.mjs';

export const PUBLICATION_RECONCILER_VERSION='post-v7-publication-reconciler-v3-dispatch-bound-20260927';
export const PUBLICATION_BINDING_GRACE_MS=10*60_000;
const text=v=>v==null?'':String(v).trim();
const upper=v=>text(v).toUpperCase();
function rows(x){return Array.isArray(x?.results)?x.results:[];}
async function mark(db,key,state,error,now){
 const r=await db.prepare(`UPDATE v3_telegram_dispatch_shadow SET state=?2,last_error=?3,updated_ts=?4 WHERE idempotency_key=?1 AND state IN ('PENDING','FAILED_RETRYABLE')`).bind(text(key),state,text(error).slice(0,240),now).run();
 return Number(r?.meta?.changes??r?.changes??0)===1;
}

/*
 * A dispatch belongs to the analytical snapshot produced immediately before
 * that dispatch was created. source_run_id is the executor's current run and
 * must never be used as the identity of backlog rows from earlier runs.
 */
async function exactPublicationForDispatch(db,row,{executor_run_id=null,now_ts=Date.now()}={}){
 const life=await db.prepare(`SELECT status,reason,observation_ts,valid_until_ts,updated_ts FROM v3_user_lifecycle_shadow WHERE contract=?1 AND direction=?2 AND wave_id=?3 AND rules_version=?4 LIMIT 1`).bind(row.contract,upper(row.direction),row.wave_id,row.rules_version).first();
 if(!life)return {status:'LIFECYCLE_NOT_FOUND'};
 if(upper(life.status)!==upper(row.lifecycle_event))return {status:'LIFECYCLE_SUPERSEDED',life};
 const now=Math.trunc(Number(now_ts)||Date.now());
 if(upper(row.lifecycle_event)!=='IDEA_REMOVED'&&Number(life.valid_until_ts||0)>0&&Number(life.valid_until_ts)<now)return {status:'EXPIRED_NOT_SENT',life};
 const dispatchTs=Math.trunc(Number(row.created_ts||life.updated_ts||now));
 const lo=dispatchTs-PUBLICATION_BINDING_GRACE_MS;
 const isEntry=upper(row.lifecycle_event)==='ENTRY'&&text(row.decision_id);
 const q=isEntry
  ? await db.prepare(`SELECT publication_id,canonical_json,presentation_inputs_json,decision_id,actionability_status,run_id,snapshot_id,observed_ts,created_ts FROM canonical_publication_shadow WHERE contract_code=?1 AND direction=?2 AND wave_id=?3 AND decision_id=?4 AND created_ts BETWEEN ?5 AND ?6 ORDER BY created_ts DESC,publication_id ASC LIMIT 3`).bind(row.contract,upper(row.direction),row.wave_id,text(row.decision_id),lo,dispatchTs).all()
  : await db.prepare(`SELECT publication_id,canonical_json,presentation_inputs_json,decision_id,actionability_status,run_id,snapshot_id,observed_ts,created_ts FROM canonical_publication_shadow WHERE contract_code=?1 AND direction=?2 AND wave_id=?3 AND created_ts BETWEEN ?4 AND ?5 ORDER BY created_ts DESC,publication_id ASC LIMIT 3`).bind(row.contract,upper(row.direction),row.wave_id,lo,dispatchTs).all();
 let candidates=rows(q);
 /*
  * Legacy early-observation snapshots could be persisted before the discovery
  * wave id was copied into the publication row. The immutable canonical JSON
  * still contains that exact wave id, so repair only this proven one-to-one
  * mismatch. ENTRY remains strict and never uses this recovery path.
  */
 if(!candidates.length&&!isEntry){
  const fallback=await db.prepare(`SELECT publication_id,canonical_json,presentation_inputs_json,decision_id,actionability_status,run_id,snapshot_id,observed_ts,created_ts,wave_id FROM canonical_publication_shadow WHERE contract_code=?1 AND direction=?2 AND created_ts BETWEEN ?3 AND ?4 ORDER BY created_ts DESC,publication_id ASC LIMIT 3`).bind(row.contract,upper(row.direction),lo,dispatchTs).all();
  const exactWave=rows(fallback).filter(candidate=>{
   try{return (JSON.parse(candidate.canonical_json)?.early_candidate?.items||[]).some(item=>text(item?.wave_id)===text(row.wave_id));}catch{return false;}
  });
  if(exactWave.length>1)return {status:'AMBIGUOUS_CANONICAL_SNAPSHOT',life,matches:exactWave.length,executor_run_id:text(executor_run_id)||null};
  if(exactWave.length===1){
   const repair=await db.prepare(`UPDATE canonical_publication_shadow SET wave_id=?2 WHERE publication_id=?1 AND (wave_id IS NULL OR wave_id!=?2)`).bind(exactWave[0].publication_id,text(row.wave_id)).run();
   if(Number(repair?.meta?.changes??repair?.changes??0)!==1)return {status:'CANONICAL_WAVE_REPAIR_ACK_FAILED',life,matches:1,executor_run_id:text(executor_run_id)||null};
   candidates=[{...exactWave[0],wave_id:text(row.wave_id)}];
  }
 }
 if(!candidates.length){
  const age=Math.max(0,now-dispatchTs);
  return {status:age>=PUBLICATION_BINDING_GRACE_MS?'CANONICAL_SNAPSHOT_NOT_FOUND_TERMINAL':'CANONICAL_SNAPSHOT_NOT_FOUND',life,matches:0,executor_run_id:text(executor_run_id)||null,dispatch_age_ms:age};
 }
 const newestTs=Number(candidates[0].created_ts);
 const nearest=candidates.filter(x=>Number(x.created_ts)===newestTs);
 if(nearest.length!==1)return {status:'AMBIGUOUS_CANONICAL_SNAPSHOT',life,matches:nearest.length,executor_run_id:text(executor_run_id)||null};
 return {status:'CLOSED',life,pub:nearest[0],executor_run_id:text(executor_run_id)||null,matched_run_id:nearest[0].run_id||null};
}

async function priorSent(db,row){
 const x=await db.prepare(`SELECT idempotency_key FROM v3_telegram_dispatch_shadow WHERE contract=?1 AND direction=?2 AND wave_id=?3 AND state='SENT' AND lifecycle_event IN ('OBSERVE','WAIT','ENTRY') AND CAST(telegram_message_id AS INTEGER)>0 AND updated_ts<?4 ORDER BY updated_ts DESC LIMIT 1`).bind(row.contract,upper(row.direction),row.wave_id,Number(row.updated_ts||Date.now())).first();
 return Boolean(x);
}

export async function reconcilePendingPublications(db,{now_ts=Date.now(),limit=8,source_run_id=null}={}){
 const now=Math.trunc(Number(now_ts)||Date.now());
 const boundedLimit=Math.max(1,Math.min(32,Number(limit)||8));
 const recentAfter=now-PUBLICATION_BINDING_GRACE_MS;
 const q=await db.prepare(`SELECT d.dispatch_id,d.idempotency_key,d.contract,d.direction,d.wave_id,d.lifecycle_event,d.rules_version,d.state,d.decision_id,d.created_ts,d.updated_ts FROM v3_telegram_dispatch_shadow d LEFT JOIN v3_dispatch_publication_binding_shadow b ON b.idempotency_key=d.idempotency_key WHERE d.state IN ('PENDING','FAILED_RETRYABLE') AND b.idempotency_key IS NULL ORDER BY CASE WHEN d.created_ts>=?2 THEN 0 ELSE 1 END,CASE WHEN d.lifecycle_event='IDEA_REMOVED' THEN 0 WHEN d.lifecycle_event='ENTRY' THEN 1 WHEN d.lifecycle_event='WAIT' THEN 2 ELSE 3 END,d.created_ts DESC LIMIT ?1`).bind(boundedLimit,recentAfter).all();
 const out=[];
 for(const row of rows(q)){
  const exact=await exactPublicationForDispatch(db,row,{executor_run_id:source_run_id,now_ts:now});
  if(exact.status!=='CLOSED'){
   if(exact.status==='EXPIRED_NOT_SENT')await mark(db,row.idempotency_key,'EXPIRED_NOT_SENT',exact.status,now);
   else if(['LIFECYCLE_SUPERSEDED','CANONICAL_SNAPSHOT_NOT_FOUND_TERMINAL','AMBIGUOUS_CANONICAL_SNAPSHOT'].includes(exact.status))await mark(db,row.idempotency_key,'FAILED_FINAL',exact.status,now);
   out.push({key:row.idempotency_key,status:exact.status,matches:exact.matches??null,dispatch_age_ms:exact.dispatch_age_ms??null});
   continue;
  }
  let canonical;
  try{canonical=JSON.parse(exact.pub.canonical_json);}catch{await mark(db,row.idempotency_key,'FAILED_FINAL','CANONICAL_JSON_INVALID',now);out.push({key:row.idempotency_key,status:'CANONICAL_JSON_INVALID'});continue;}
  if(text(canonical.run_id)!==text(exact.pub.run_id)){await mark(db,row.idempotency_key,'FAILED_FINAL','CANONICAL_RUN_MISMATCH',now);out.push({key:row.idempotency_key,status:'CANONICAL_RUN_MISMATCH'});continue;}
  const tg=renderCanonicalTelegram({canonical,lifecycle_event:row.lifecycle_event});
  let presentationInputs={};
  try{presentationInputs=JSON.parse(exact.pub.presentation_inputs_json||'{}')||{};}catch{presentationInputs={};}
  const savedManual=text(presentationInputs.manual_text||presentationInputs.manual?.text);
  const man=savedManual?{ok:true,status:'SAVED_CANONICAL_MANUAL',text:savedManual}:renderCanonicalManual({canonical,lifecycle_event:row.lifecycle_event});
  if(!tg.ok||!man.ok){await mark(db,row.idempotency_key,'FAILED_FINAL',tg.status||man.status,now);out.push({key:row.idempotency_key,status:'PRESENTATION_FAILED'});continue;}
  const f=await finalizePublication(db,{publication_id:exact.pub.publication_id,lifecycle_event:row.lifecycle_event,direction:row.direction,manual_text:man.text,telegram_text:tg.text,prior_sent:await priorSent(db,row),now_ts:now});
  if(f.deliver!==true){await mark(db,row.idempotency_key,'FAILED_FINAL',f.reason||f.status,now);out.push({key:row.idempotency_key,status:'SUPPRESSED_ACTIONABILITY',reason:f.reason||f.status});continue;}
  if(f.create_recheck===true){
   const t=canonical.trigger;
   const rq=await enqueueRecheck(db,{publication_id:exact.pub.publication_id,contract:row.contract,direction:row.direction,wave_id:row.wave_id,snapshot_id:canonical.snapshot_id,run_id:canonical.run_id,due_ts:t.next_recheck_ts,expires_ts:t.expires_ts,now_ts:now});
   if(rq.enqueued!==true){await mark(db,row.idempotency_key,'FAILED_RETRYABLE','RECHECK_TASK_NOT_PERSISTED',now);out.push({key:row.idempotency_key,status:'RECHECK_TASK_NOT_PERSISTED'});continue;}
  }
  const b=await bindDispatchToPublication(db,{idempotency_key:row.idempotency_key,publication_id:exact.pub.publication_id,contract:row.contract,direction:row.direction,wave_id:row.wave_id,lifecycle_event:row.lifecycle_event,rules_version:row.rules_version,decision_id:row.decision_id,now_ts:now});
  if(!b.bound){await mark(db,row.idempotency_key,'FAILED_FINAL',b.status,now);out.push({key:row.idempotency_key,status:b.status});continue;}
  out.push({key:row.idempotency_key,status:'BOUND_ACTIONABLE',publication_id:exact.pub.publication_id,run_id:canonical.run_id,snapshot_id:canonical.snapshot_id});
 }
 return {status:'CLOSED',processed:out.length,source_run_id:text(source_run_id)||null,executor_run_id:text(source_run_id)||null,results:out};
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
 const valid=Number(life.valid_until_ts??canonical?.trigger?.expires_ts??0)||null;
 if(valid!==null&&valid<Number(now_ts)&&upper(row.lifecycle_event)!=='IDEA_REMOVED')return {status:'EXPIRED_NOT_SENT',ok:false};
 return {...bound,status:'CLOSED',ok:true,revalidation:{status:upper(row.lifecycle_event),now:Number(now_ts),observation_ts:Number(canonical.observed_ts),valid_until_ts:valid,identity_current:true,data_current:true,cancellation_prior_delivery_verified:upper(row.lifecycle_event)==='IDEA_REMOVED'&&bound.prior_delivery_verified===true,lifecycle_stage:upper(row.lifecycle_event),hard_veto:false,superseded:false,timing_state:upper(row.lifecycle_event)==='ENTRY'?'ENTRY_WINDOW':'WAIT'}};
}

export default{PUBLICATION_RECONCILER_VERSION,PUBLICATION_BINDING_GRACE_MS,reconcilePendingPublications,loadBoundDispatchForNetwork};
