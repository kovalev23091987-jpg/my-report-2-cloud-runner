export const RUN_STAGES=Object.freeze(['RUN_STARTED','COLLECTION_COMPLETE','ANALYSIS_COMPLETE','PUBLICATION_COMMITTED','DELIVERY_RESULT','RUN_COMPLETE']);
const TERMINAL=new Set(['SUCCESS','FAILED','DEGRADED','PARTIAL']);

export function createRunHealth({run_id,generation,actor,started_ts=Date.now()}={}){
  if(!run_id||!generation||!actor)throw new Error('HEALTH_IDENTITY_REQUIRED');
  const events=[];let fatal=null;
  const record=(stage,{status='SUCCESS',reason=null,ts=Date.now(),metadata=null}={})=>{
    if(!RUN_STAGES.includes(stage))throw new Error('HEALTH_STAGE_INVALID');
    events.push(Object.freeze({stage,status,reason,ts,metadata}));return events.at(-1);
  };
  const fail=(error,{stage='RUN_COMPLETE',ts=Date.now()}={})=>{fatal=String(error?.message||error||'UNKNOWN_FATAL');return record(stage,{status:'FAILED',reason:fatal,ts});};
  const finalize=({now=Date.now(),no_ideas=false,analysis_complete=false,critical_contracts_ok=true}={})=>{
    const latest=Object.fromEntries(events.map(x=>[x.stage,x]));
    let status='FAILED',reason=fatal||'RUN_INCOMPLETE';
    if(fatal){status='FAILED';reason=fatal;}
    else if(!analysis_complete||!latest.ANALYSIS_COMPLETE){status='PARTIAL';reason='ANALYSIS_NOT_COMPLETE';}
    else if(!critical_contracts_ok){status='DEGRADED';reason='CRITICAL_DIRECTION_PRICE_OR_SCORE_MISSING';}
    else if(no_ideas){status='SUCCESS';reason='HEALTHY_NO_IDEA';}
    else if(latest.DELIVERY_RESULT?.status==='FAILED'){status='DEGRADED';reason=latest.DELIVERY_RESULT.reason||'DELIVERY_FAILED';}
    else {status='SUCCESS';reason='RUN_COMPLETE';}
    const result=Object.freeze({run_id,generation,actor,stage:'RUN_COMPLETE',status:TERMINAL.has(status)?status:'FAILED',reason,started_ts,completed_ts:now,events:[...events]});
    return result;
  };
  return {record,fail,finalize,events:()=>[...events]};
}

export function evaluateWatchdog({now=Date.now(),analytics_success_ts,analytics_started_ts,collector_heartbeat_ts,maintenance_until_ts=0,warmup_until_ts=0}={}){
  if(now<=Math.max(Number(maintenance_until_ts)||0,Number(warmup_until_ts)||0))return {status:'MAINTENANCE',alerts:[]};
  const alerts=[];
  if(!Number.isFinite(Number(analytics_success_ts))||now-Number(analytics_success_ts)>45*60_000)alerts.push('ANALYTICS_SUCCESS_MISSING_45M');
  if(Number.isFinite(Number(analytics_started_ts))&&now-Number(analytics_started_ts)>15*60_000)alerts.push('RUN_STARTED_STALE_15M');
  if(!Number.isFinite(Number(collector_heartbeat_ts))||now-Number(collector_heartbeat_ts)>12*60_000)alerts.push('COLLECTOR_HEARTBEAT_MISSING_12M');
  return {status:alerts.length?'FAILED':'HEALTHY',alerts};
}

export function createOpsStateBudget({max_writes=500,max_reads=2000}={}){
  let writes=0,reads=0;
  return {reserve({write=0,read=0}={}){if(!Number.isSafeInteger(write)||!Number.isSafeInteger(read)||write<0||read<0)return {allowed:false,status:'INVALID_KV_BUDGET'};if(writes+write>max_writes||reads+read>max_reads)return {allowed:false,status:'KV_DAILY_BUDGET_EXHAUSTED'};writes+=write;reads+=read;return {allowed:true,status:'RESERVED',writes,reads};},summary(){return {writes,reads,max_writes,max_reads};}};
}

export async function writeOpsHeartbeat(kv,key,value,budget,{expirationTtl=7200}={}){
  if(!kv?.put)return {written:false,status:'OPS_STATE_BINDING_UNAVAILABLE'};
  const admission=budget.reserve({write:1});if(!admission.allowed)return {written:false,status:admission.status};
  await kv.put(key,JSON.stringify(value),{expirationTtl});return {written:true,status:'WRITTEN'};
}
