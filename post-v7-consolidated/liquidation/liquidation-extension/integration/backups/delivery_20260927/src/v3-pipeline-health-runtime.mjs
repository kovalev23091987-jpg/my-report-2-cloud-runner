import {assessPipelineHealth,decideHealthAlert} from './v3-telegram-lifecycle.mjs';

export const V3_PIPELINE_HEALTH_RUNTIME_VERSION='v3-pipeline-health-runtime-shadow-v1';
function text(v){return v==null?'':String(v).trim();}
function json(v,fb){try{return JSON.stringify(v??fb);}catch{return JSON.stringify(fb);}}
function eventId(event,ts){return `PIPELINE:${event}:${Math.trunc(Number(ts)||0)}`;}

export function buildPipelineHealth(input={}){
  const health=assessPipelineHealth(input);
  return {...health,version:V3_PIPELINE_HEALTH_RUNTIME_VERSION,shadow_only:true};
}

export async function persistPipelineHealth(db,{health,now_ts=Date.now(),namespace='PIPELINE'}={}){
  if(!db?.prepare||!db?.batch) return {status:'SOURCE_UNSUPPORTED',event:null};
  if(!health||!['HEALTHY_NO_IDEA','DEGRADED_PIPELINE'].includes(health.status)) return {status:'INVALID_HEALTH',event:null};
  const ns=text(namespace)||'PIPELINE', now=Math.trunc(Number(now_ts)||Date.now());
  let previous=null;
  try{ previous=await db.prepare(`SELECT status,reasons_json,changed_ts,last_checked_ts FROM v3_pipeline_health_shadow WHERE namespace=?1 LIMIT 1`).bind(ns).first(); }
  catch(error){ return {status:/no such table/i.test(String(error?.message||error))?'MIGRATION_REQUIRED':'PARTIAL',event:null,error:String(error?.message||error)}; }
  const prevStatus=text(previous?.status)||null;
  const transition=decideHealthAlert({previous:prevStatus,current:health.status});
  const changed=prevStatus!==health.status;
  const changedTs=changed?now:Number(previous?.changed_ts||now);
  const statements=[db.prepare(`INSERT INTO v3_pipeline_health_shadow(namespace,status,reasons_json,changed_ts,last_checked_ts,shadow_only)
    VALUES(?1,?2,?3,?4,?5,1)
    ON CONFLICT(namespace) DO UPDATE SET status=excluded.status,reasons_json=excluded.reasons_json,
      changed_ts=CASE WHEN v3_pipeline_health_shadow.status<>excluded.status THEN excluded.changed_ts ELSE v3_pipeline_health_shadow.changed_ts END,
      last_checked_ts=excluded.last_checked_ts,shadow_only=1`).bind(ns,health.status,json(health.reasons??[],[]),changedTs,now)];
  let evt=null;
  if(transition.send===true){
    evt={event_id:eventId(transition.event,now),transition:transition.event,from_status:prevStatus,to_status:health.status,reasons:health.reasons??[],state:'PENDING',created_ts:now};
    statements.push(db.prepare(`INSERT OR IGNORE INTO v3_pipeline_health_event_shadow(
      event_id,transition,from_status,to_status,reasons_json,state,created_ts,updated_ts,shadow_only)
      VALUES(?1,?2,?3,?4,?5,'PENDING',?6,?6,1)`).bind(evt.event_id,evt.transition,evt.from_status,evt.to_status,json(evt.reasons,[]),now));
  }
  try{ await db.batch(statements); }
  catch(error){ return {status:'PARTIAL',event:null,error:String(error?.message||error)}; }
  return {status:'CLOSED',previous_status:prevStatus,current_status:health.status,changed,event:evt,shadow_only:true};
}

export function renderPipelineHealthMessage(event){
  if(!event||!['DEGRADED','RECOVERED'].includes(text(event.transition))) return {ok:false,status:'EVENT_INVALID',message:null};
  if(event.transition==='DEGRADED'){
    const reasons=Array.isArray(event.reasons)&&event.reasons.length?event.reasons.join(', '):'причина не закрыта';
    return {ok:true,status:'READY',message:`⚠️ Мой отчёт 2 — техническое состояние ухудшилось\nПричина: ${reasons}\nЭто системное уведомление, не торговый сигнал.`};
  }
  return {ok:true,status:'READY',message:'✅ Мой отчёт 2 — техническая цепочка восстановлена\nЭто системное уведомление, не торговый сигнал.'};
}

export function classifyHealthDelivery({network_result,revalidation_ok=true}={}){
  if(revalidation_ok!==true) return 'FAILED_FINAL';
  const r=text(network_result).toUpperCase();
  if(r==='CONFIRMED_SENT') return 'SENT';
  if(['TIMEOUT','5XX','NETWORK_ERROR','UNKNOWN'].includes(r)) return 'FAILED_RETRYABLE';
  return 'FAILED_FINAL';
}

export default {buildPipelineHealth,persistPipelineHealth,renderPipelineHealthMessage,classifyHealthDelivery};
