import {buildPipelineHealth,persistPipelineHealth} from './v3-pipeline-health-runtime.mjs';

export const V3_PIPELINE_HEALTH_SIDECAR_VERSION='v3-pipeline-health-sidecar-shadow-v2-worker-degraded-20260928';
export const V3_PIPELINE_HEALTH_SIDECAR_BUDGET=Object.freeze({rows_read:8,rows_written:4,requests_soft_cap:4});
function text(v){return v==null?'':String(v).trim();}
function num(v){const n=Number(v);return Number.isFinite(n)?n:null;}
function usageDelta(before,after){if(!before||!after)return null;return {rows_read:Math.max(0,Number(after.rows_read||0)-Number(before.rows_read||0)),rows_written:Math.max(0,Number(after.rows_written||0)-Number(before.rows_written||0)),requests:Math.max(0,Number(after.requests||0)-Number(before.requests||0)),unknown_ops:Math.max(0,Number(after.unknown_ops||0)-Number(before.unknown_ops||0))};}

export function deriveTelegramRelayHealth(telegramZeroReason){
  const status=text(telegramZeroReason?.status).toUpperCase();
  const reason=text(telegramZeroReason?.reason).toUpperCase();
  if(['DELIVERY_UNHEALTHY_OR_UNKNOWN','DELIVERY_OR_OUTPUT_ERROR'].includes(status))return false;
  if(/RELAY|NETWORK|TIMEOUT|SEND_FAILED|DISPATCH_OR_RELAY_NOT_CLOSED/.test(`${status}|${reason}`))return false;
  return true;
}

export function buildPipelineHealthFromCron({cron,scan,telegram_zero_reason,critical_feed_state='OK'}={}){
  const cronOk=text(cron?.status).toUpperCase()==='SUCCESS';
  const scanClosed=Boolean(scan&&num(scan.universe_total)>0&&num(scan.scanned)===num(scan.universe_total)&&num(scan.errors||0)===0&&num(scan.stale||0)===0&&num(scan.stage0_coverage_pct)>=99.9);
  const internalStatus=text(cron?.v3_pipeline_health_status).toUpperCase();
  const internalReason=text(cron?.v3_pipeline_health_reason).toUpperCase();
  const eligible=Math.max(0,num(cron?.v3_live_shortlist_count)||0);
  const deep=Math.max(0,num(cron?.v3_live_deep_check_count)||0);
  const workerDegraded=internalStatus==='DEGRADED_PIPELINE';
  const health=buildPipelineHealth({
    stage0_closed:cronOk&&scanClosed,
    discovery_closed:Boolean(internalStatus),
    eligible_live_count:eligible,
    live_deep_check_count:deep,
    live_zero_reason:cron?.v3_live_zero_reason??null,
    maintenance_starved_live:internalReason==='MAINTENANCE_STARVED_LIVE',
    handoff_lost:['LIVE_DEEP_CHECK_SILENT_DROP','LIVE_HANDOFF_UNMAPPED_FAIL_CLOSED'].includes(internalReason),
    technical_final_block:workerDegraded,
    telegram_relay_ok:deriveTelegramRelayHealth(telegram_zero_reason),
    persistent_db_ok:true,
    critical_feed_state,
  });
  const reasons=[...new Set([...(health.reasons||[]),...(workerDegraded&&internalReason?[`WORKER_${internalReason}`]:[])])];
  return {...health,reasons,worker_health_status:internalStatus||null,worker_health_reason:internalReason||null,eligible_live_count:eligible,live_deep_check_count:deep,shadow_only:true};
}

export async function runV3PipelineHealthSidecar(db,{cron,scan,telegram_zero_reason,critical_feed_state='OK',now_ts=Date.now()}={}){
  const base={version:V3_PIPELINE_HEALTH_SIDECAR_VERSION,mode:'SHADOW_ONLY',market_signal:false};
  if(!db?.prepare||!db?.batch)return {...base,status:'SOURCE_UNSUPPORTED'};
  const before=typeof db.usageSnapshot==='function'?db.usageSnapshot():null;
  const health=buildPipelineHealthFromCron({cron,scan,telegram_zero_reason,critical_feed_state});
  const persisted=await persistPipelineHealth(db,{health,now_ts,namespace:'PIPELINE'});
  const after=typeof db.usageSnapshot==='function'?db.usageSnapshot():null;
  const delta=usageDelta(before,after);
  if(delta&&(delta.rows_read>V3_PIPELINE_HEALTH_SIDECAR_BUDGET.rows_read||delta.rows_written>V3_PIPELINE_HEALTH_SIDECAR_BUDGET.rows_written||delta.unknown_ops>0))return {...base,status:'BUDGET_ENVELOPE_EXCEEDED_FAIL_CLOSED',health,persistence:persisted,usage_delta:delta};
  return {...base,status:persisted.status,health,persistence:persisted,usage_delta:delta};
}

export default {V3_PIPELINE_HEALTH_SIDECAR_VERSION,V3_PIPELINE_HEALTH_SIDECAR_BUDGET,deriveTelegramRelayHealth,buildPipelineHealthFromCron,runV3PipelineHealthSidecar};
