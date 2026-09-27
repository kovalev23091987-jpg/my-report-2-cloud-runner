import {claimLifecycleDispatch,finalizeLifecycleDispatch} from './v3-telegram-runtime.mjs';
import {renderPipelineHealthMessage,classifyHealthDelivery} from './v3-pipeline-health-runtime.mjs';
import {renderTzCompliantLifecycleMessage} from './v3-telegram-tz-formatter.mjs';

export const V3_TELEGRAM_DELIVERY_SIDECAR_VERSION='v3-telegram-delivery-sidecar-tz-reconciled-v1';
export const V3_TELEGRAM_DELIVERY_SIDECAR_BUDGET=Object.freeze({
  rows_read:320,
  rows_written:12,
  requests_soft_cap:24,
  max_lifecycle_dispatches:2,
  max_health_dispatches:1,
  relay_timeout_ms:8000,
});
function text(v){return v==null?'':String(v).trim();}
function upper(v){return text(v).toUpperCase();}
function finite(v){if(v==null||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;}
function rows(x){return Array.isArray(x?.results)?x.results:[];}
function parseJson(v,fb){try{return JSON.parse(v??JSON.stringify(fb));}catch{return fb;}}
function usageDelta(before,after){if(!before||!after)return null;return {rows_read:Math.max(0,Number(after.rows_read||0)-Number(before.rows_read||0)),rows_written:Math.max(0,Number(after.rows_written||0)-Number(before.rows_written||0)),requests:Math.max(0,Number(after.requests||0)-Number(before.requests||0)),unknown_ops:Math.max(0,Number(after.unknown_ops||0)-Number(before.unknown_ops||0))};}

export async function sendLifecycleRelay({relay_url,relay_key,text:message,fetch_impl=globalThis.fetch,timeout_ms=V3_TELEGRAM_DELIVERY_SIDECAR_BUDGET.relay_timeout_ms}={}){
  const url=text(relay_url),key=text(relay_key),msg=text(message);
  if(!url||!key||!msg)return {ok:false,network_result:'CONFIG_ERROR',status:'RELAY_NOT_CONFIGURED',message_id:null};
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),Math.max(1000,Number(timeout_ms)||8000));
  try{
    const response=await fetch_impl(url,{method:'POST',headers:{'content-type':'application/json; charset=UTF-8',authorization:`Bearer ${key}`},body:JSON.stringify({text:msg}),signal:controller.signal});
    let body=null;try{body=await response.json();}catch{body=null;}
    if(response.ok&&body?.ok===true)return {ok:true,network_result:'CONFIRMED_SENT',status:text(body.status)||'SENT',message_id:body.message_id??null,http_status:response.status};
    if(response.status>=500)return {ok:false,network_result:'5XX',status:'RELAY_5XX',message_id:null,http_status:response.status};
    if(body?.ok===false)return {ok:false,network_result:'REJECTED',status:text(body.status)||'RELAY_REJECTED',message_id:null,http_status:response.status};
    return {ok:false,network_result:'UNKNOWN',status:'AMBIGUOUS_RELAY_RESPONSE',message_id:null,http_status:response.status};
  }catch(error){
    if(error?.name==='AbortError')return {ok:false,network_result:'TIMEOUT',status:'RELAY_TIMEOUT',message_id:null};
    return {ok:false,network_result:'NETWORK_ERROR',status:'NETWORK_ERROR',message_id:null};
  }finally{clearTimeout(timer);}
}

async function loadLifecycleCandidate(db,row,now){
  const contract=text(row.contract),dir=upper(row.direction),wave=text(row.wave_id),rules=text(row.rules_version);
  const minFresh=now-30*60_000;
  const out=await db.batch([
    db.prepare(`SELECT status,reason,observation_ts,valid_until_ts,updated_ts FROM v3_user_lifecycle_shadow WHERE contract=?1 AND direction=?2 AND wave_id=?3 AND rules_version=?4 LIMIT 1`).bind(contract,dir,wave,rules),
    db.prepare(`SELECT lifecycle_stage,direction_hint,early_detection_quality_0_100,first_seen_ts,first_seen_price,last_seen_ts FROM v3_early_candidate_wave WHERE contract_code=?1 AND wave_id=?2 ORDER BY last_seen_ts DESC LIMIT 1`).bind(contract,wave),
    db.prepare(`SELECT f.decision_id,f.observation_ts,f.direction,f.entry_action,f.data_quality,f.execution_quality,f.independence_state,f.timing_state,f.risk_state,f.hard_veto,f.persisted_ts,f.decision_json,c.valid_until_ts AS context_valid_until,c.status AS telegram_context_status,c.score_lower_bound,c.score_upper_bound,c.context_json FROM final_decision_integration_shadow f LEFT JOIN final_decision_telegram_context_shadow c ON c.decision_id=f.decision_id WHERE f.contract_code=?1 ORDER BY f.persisted_ts DESC LIMIT 1`).bind(contract),
    db.prepare(`SELECT observed_ts,direction_hint,dc_long,dc_short,eq_status,dq_status,stage,data_sufficiency,missing_chains_json,evidence_flags_json,created_ts FROM shadow_decision_log WHERE contract_code=?1 AND observed_ts>=?2 ORDER BY observed_ts DESC LIMIT 1`).bind(contract,minFresh),
    db.prepare(`SELECT observed_ts,direction_hint,direction_state,long_evidence_domain_count,short_evidence_domain_count,early_detection_quality_0_100,feature_json,evidence_json FROM v3_early_feature_snapshot WHERE contract_code=?1 AND observed_ts>=?2 ORDER BY observed_ts DESC LIMIT 1`).bind(contract,minFresh),
    db.prepare(`SELECT observed_ts,timeframe,event_type,funnel_stage,data_quality,event_json FROM opportunity_shadow_event WHERE contract_code=?1 AND observed_ts>=?2 ORDER BY observed_ts DESC LIMIT 1`).bind(contract,minFresh),
    db.prepare(`SELECT current_phase,direction,entry_trigger_time,entry_trigger_price,base_low,base_high,last_observed_ts,campaign_json FROM multi_wave_campaign_shadow WHERE contract_code=?1 AND current_phase!='CLOSED' ORDER BY last_observed_ts DESC LIMIT 1`).bind(contract),
    db.prepare(`SELECT observed_ts,provider,asset_identity_verified,projected_map_status,realized_status,dq_status,source_ts,freshness_status,projected_clusters_json,realized_json,coverage_json,derived_json FROM liquidation_shadow_observation WHERE contract_code=?1 AND observed_ts>=?2 ORDER BY observed_ts DESC LIMIT 1`).bind(contract,minFresh),
  ]);
  const lifecycle=rows(out?.[0])?.[0]||null,early=rows(out?.[1])?.[0]||null,final=rows(out?.[2])?.[0]||null;
  const shadow=rows(out?.[3])?.[0]||null,feature=rows(out?.[4])?.[0]||null,opportunity=rows(out?.[5])?.[0]||null,campaign=rows(out?.[6])?.[0]||null,liquidation=rows(out?.[7])?.[0]||null;
  const observationTs=finite(lifecycle?.observation_ts)??finite(row.created_ts)??now;
  const validUntil=finite(lifecycle?.valid_until_ts)??finite(final?.context_valid_until)??(observationTs+10*60_000);
  const status=upper(row.lifecycle_event);
  const lifecycleCurrent=upper(lifecycle?.status)===status;
  const observationAge=now-observationTs;
  const dataCurrent=observationAge>=0&&observationAge<=20*60_000;
  const identityCurrent=Boolean(lifecycle&&lifecycleCurrent);
  const hardVeto=Number(final?.hard_veto||0)===1;
  const superseded=!lifecycleCurrent||['SUPERSEDED','INVALIDATED'].includes(upper(final?.telegram_context_status));
  const timing=upper(final?.timing_state||early?.lifecycle_stage||'NOT_EVALUATED');
  return {lifecycle,early,final,shadow,feature,opportunity,campaign,liquidation,revalidation:{status,now,observation_ts:observationTs,valid_until_ts:validUntil,identity_current:identityCurrent,data_current:dataCurrent,lifecycle_stage:upper(early?.lifecycle_stage),hard_veto:hardVeto,superseded,timing_state:timing},render:{status,ticker:contract,direction:dir,now,lifecycle,early,final,shadow,feature,opportunity,campaign,liquidation}};
}

async function deferLifecycleDispatch(db,{idempotency_key,error,now_ts=Date.now()}={}){
  const now=Math.trunc(Number(now_ts)||Date.now());
  const r=await db.prepare(`UPDATE v3_telegram_dispatch_shadow SET state='FAILED_RETRYABLE',last_error=?2,updated_ts=?3 WHERE idempotency_key=?1 AND state='SENDING'`).bind(text(idempotency_key),text(error).slice(0,240),now).run();
  return Number(r?.meta?.changes??r?.changes??0)===1;
}

async function finalizeHealthEvent(db,{event_id,state,message_id=null,error=null,now_ts=Date.now()}={}){
  const now=Math.trunc(Number(now_ts)||Date.now());
  const sent=state==='SENT'?now:null;
  const r=await db.prepare(`UPDATE v3_pipeline_health_event_shadow SET state=?2,telegram_message_id=?3,last_error=?4,updated_ts=?5,sent_ts=CASE WHEN ?6 IS NULL THEN sent_ts ELSE ?6 END WHERE event_id=?1 AND state='SENDING'`).bind(text(event_id),state,text(message_id)||null,text(error)||null,now,sent).run();
  return Number(r?.meta?.changes??r?.changes??0)===1;
}

export async function runV3TelegramDeliverySidecar(db,{enabled=false,relay_url=null,relay_key=null,now_ts=Date.now(),fetch_impl=globalThis.fetch}={}){
  const base={version:V3_TELEGRAM_DELIVERY_SIDECAR_VERSION,mode:'SHADOW_GATED_DELIVERY',network_send:enabled===true,probability:null,validated_signal:false,trading_execution:false};
  if(enabled!==true)return {...base,status:'NETWORK_DISABLED_FAIL_CLOSED',lifecycle:[],health:[]};
  if(!db?.prepare||!db?.batch)return {...base,status:'SOURCE_UNSUPPORTED',lifecycle:[],health:[]};
  const now=Math.trunc(Number(now_ts)||Date.now());
  const before=typeof db.usageSnapshot==='function'?db.usageSnapshot():null;
  let lifecycleRows=[],healthRows=[];
  try{
    const loaded=await db.batch([
      db.prepare(`SELECT dispatch_id,idempotency_key,contract,direction,wave_id,lifecycle_event,rules_version,state,decision_id,created_ts,updated_ts FROM v3_telegram_dispatch_shadow WHERE state IN ('PENDING','FAILED_RETRYABLE') ORDER BY CASE WHEN lifecycle_event='ENTRY' THEN 0 ELSE 1 END,updated_ts ASC LIMIT ${V3_TELEGRAM_DELIVERY_SIDECAR_BUDGET.max_lifecycle_dispatches}`),
      db.prepare(`SELECT event_id,transition,from_status,to_status,reasons_json,state,created_ts,updated_ts FROM v3_pipeline_health_event_shadow WHERE state IN ('PENDING','FAILED_RETRYABLE') ORDER BY updated_ts ASC LIMIT ${V3_TELEGRAM_DELIVERY_SIDECAR_BUDGET.max_health_dispatches}`),
    ]);
    lifecycleRows=rows(loaded?.[0]);healthRows=rows(loaded?.[1]);
  }catch(error){return {...base,status:/no such table/i.test(String(error?.message||error))?'MIGRATION_REQUIRED':'INPUT_LOAD_PARTIAL',error:String(error?.message||error),lifecycle:[],health:[]};}
  const lifecycle=[];
  for(const row of lifecycleRows){
    let loaded;
    try{loaded=await loadLifecycleCandidate(db,row,now);}catch(error){lifecycle.push({idempotency_key:row.idempotency_key,status:'REVALIDATION_LOAD_PARTIAL'});continue;}
    const claim=await claimLifecycleDispatch(db,{idempotency_key:row.idempotency_key,revalidation:loaded.revalidation,now_ts:now});
    if(claim.claimed!==true){lifecycle.push({idempotency_key:row.idempotency_key,status:claim.status,sent:false});continue;}
    const rendered=renderTzCompliantLifecycleMessage(loaded.render);
    if(rendered.ok!==true){
      if(rendered.retryable===true){await deferLifecycleDispatch(db,{idempotency_key:row.idempotency_key,error:rendered.status,now_ts:now});lifecycle.push({idempotency_key:row.idempotency_key,status:'FAILED_RETRYABLE',sent:false,reason:rendered.status});continue;}
      const fin=await finalizeLifecycleDispatch(db,{idempotency_key:row.idempotency_key,network_result:'RENDER_ERROR',error:rendered.status,now_ts:now});lifecycle.push({idempotency_key:row.idempotency_key,status:fin.state||fin.status,sent:false,reason:rendered.status});continue;
    }
    const net=await sendLifecycleRelay({relay_url,relay_key,text:rendered.message,fetch_impl});
    const fin=await finalizeLifecycleDispatch(db,{idempotency_key:row.idempotency_key,network_result:net.network_result,telegram_message_id:net.message_id,error:net.status,now_ts:Date.now()});
    lifecycle.push({idempotency_key:row.idempotency_key,status:fin.state||fin.status,sent:(fin.state||fin.status)==='SENT',message_id:net.message_id??null,formatter:rendered.formatter});
  }
  const health=[];
  for(const row of healthRows){
    const current=await db.prepare(`SELECT status,reasons_json,last_checked_ts FROM v3_pipeline_health_shadow WHERE namespace='PIPELINE' LIMIT 1`).first();
    const target=upper(row.to_status),stillCurrent=upper(current?.status)===target;
    if(!stillCurrent){await db.prepare(`UPDATE v3_pipeline_health_event_shadow SET state='FAILED_FINAL',last_error='SUPERSEDED_HEALTH_STATE',updated_ts=?2 WHERE event_id=?1 AND state IN ('PENDING','FAILED_RETRYABLE')`).bind(row.event_id,now).run();health.push({event_id:row.event_id,status:'FAILED_FINAL',sent:false});continue;}
    const claim=await db.prepare(`UPDATE v3_pipeline_health_event_shadow SET state='SENDING',last_error=NULL,updated_ts=?2 WHERE event_id=?1 AND state IN ('PENDING','FAILED_RETRYABLE')`).bind(row.event_id,now).run();
    if(Number(claim?.meta?.changes??claim?.changes??0)!==1){health.push({event_id:row.event_id,status:'NOT_CLAIMED',sent:false});continue;}
    const rendered=renderPipelineHealthMessage({transition:row.transition,reasons:parseJson(row.reasons_json,[])});
    if(rendered.ok!==true){await finalizeHealthEvent(db,{event_id:row.event_id,state:'FAILED_FINAL',error:rendered.status,now_ts:now});health.push({event_id:row.event_id,status:'FAILED_FINAL',sent:false});continue;}
    const net=await sendLifecycleRelay({relay_url,relay_key,text:rendered.message,fetch_impl});
    const state=classifyHealthDelivery({network_result:net.network_result,revalidation_ok:true});
    await finalizeHealthEvent(db,{event_id:row.event_id,state,message_id:net.message_id,error:net.status,now_ts:Date.now()});
    health.push({event_id:row.event_id,status:state,sent:state==='SENT',message_id:net.message_id??null,system_alert:true,market_signal:false});
  }
  const after=typeof db.usageSnapshot==='function'?db.usageSnapshot():null;const delta=usageDelta(before,after);
  const sent=lifecycle.filter(x=>x.sent).length+health.filter(x=>x.sent).length;
  if(delta&&(delta.rows_read>V3_TELEGRAM_DELIVERY_SIDECAR_BUDGET.rows_read||delta.rows_written>V3_TELEGRAM_DELIVERY_SIDECAR_BUDGET.rows_written||delta.unknown_ops>0))return {...base,status:'BUDGET_ENVELOPE_EXCEEDED_FAIL_CLOSED',lifecycle,health,sent,usage_delta:delta};
  return {...base,status:'CLOSED',lifecycle,health,sent,usage_delta:delta,secrets_logged:false};
}

export default {V3_TELEGRAM_DELIVERY_SIDECAR_VERSION,V3_TELEGRAM_DELIVERY_SIDECAR_BUDGET,sendLifecycleRelay,runV3TelegramDeliverySidecar};
