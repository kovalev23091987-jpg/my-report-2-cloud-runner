import {canonicalFingerprint} from './canonical-publication.mjs';
import {completeRecheck} from './recheck-scheduler.mjs';

export const ORIGINAL_IDEA_RECHECK_VERSION='ORIGINAL_IDEA_RECHECK_V1_20261010';
const stamp=v=>Number.isSafeInteger(v)&&v>1_000_000_000_000;
const compare=(p,op,v)=>op==='>='?p>=v:op==='>'?p>v:op==='<='?p<=v:op==='<'?p<v:false;
export function originalIdeaIdentity({task,canonical}={}){
 return Boolean(task?.task_id&&task.publication_id&&task.wave_id&&canonical?.status==='CLOSED'&&
  ['OBSERVE','WAIT_FOR_TRIGGER'].includes(canonical.state)&&['LONG','SHORT'].includes(canonical.direction)&&
  canonical.analytical_fingerprint===canonicalFingerprint(canonical)&&
  task.contract_code===canonical.metadata?.contract&&task.direction===canonical.direction&&
  task.run_id===canonical.run_id&&task.snapshot_id===canonical.snapshot_id&&
  task.due_ts===canonical.trigger?.next_recheck_ts&&task.expires_ts===canonical.trigger?.expires_ts);
}
// This receipt qualifies the original trigger only. All evidence and execution
// checks of the new full analysis are still required to authorize ENTRY.
export function qualifyOriginalIdeaSettlement({task,canonical,candles=[],now_ts,current_price=null,current_price_receipt=null}={}){
 const base={schema:ORIGINAL_IDEA_RECHECK_VERSION,status:'NOT_CONFIRMED',settlement_confirmed:false,entry_authorized:false,sourceHTTP:0,
  task_id:task?.task_id??null,publication_id:task?.publication_id??null,wave_id:task?.wave_id??null,
  contract:task?.contract_code??null,direction:task?.direction??null,original_run_id:task?.run_id??null,
  original_snapshot_id:task?.snapshot_id??null,original_fingerprint:canonical?.analytical_fingerprint??null,
  original_expires_ts:task?.expires_ts??null,checked_ts:now_ts,primary_price_receipt:current_price_receipt};
 const fail=reason=>({...base,reason});
 if(!originalIdeaIdentity({task,canonical})||!stamp(now_ts))return fail('EXACT_ORIGINAL_IDEA_REQUIRED');
 if(now_ts>=task.expires_ts)return {...fail('ORIGINAL_TTL_EXPIRED'),status:'EXPIRED'};
 const trigger=canonical.trigger,cancel=/^price\s*(>=|<=|>|<)\s*([0-9]+(?:\.[0-9]+)?(?:e[+-]?[0-9]+)?)$/i.exec(String(trigger.cancel_condition||''));
 if(trigger.metric!=='price'||trigger.unit!=='USDT'||!['>','>=','<','<='].includes(trigger.operator)||!(trigger.value>0)||!cancel||!(Number(cancel[2])>0))return fail('ORIGINAL_PRICE_CONDITIONS_REQUIRED');
 const primary=current_price_receipt;
 if(primary?.status!=='CLOSED'||primary.venue!=='HTX'||primary.type!=='MID_OBSERVATION'||primary.contract!==task.contract_code||primary.value!==current_price||!stamp(primary.source_ts)||!stamp(primary.received_ts)||primary.source_ts>primary.received_ts||primary.received_ts>now_ts||now_ts-primary.source_ts>180000||primary.source_ts<canonical.observed_ts)return fail('FRESH_PRIMARY_PRICE_REQUIRED');
 if(typeof current_price!=='number'||!Number.isFinite(current_price)||current_price<=0)return fail('FRESH_PRIMARY_PRICE_REQUIRED');
 if(compare(current_price,cancel[1],Number(cancel[2])))return {...fail('ORIGINAL_PRICE_CANCELLED'),status:'CANCELLED',price:current_price,cancel_condition:trigger.cancel_condition};
 const period=String(trigger.timeframe||'').toLowerCase(),duration=period==='5m'||period==='5min'?300000:period==='1m'||period==='1min'?60000:null;
 if(!duration)return fail('SUPPORTED_ORIGINAL_CANDLE_PERIOD_REQUIRED');
 const valid=candles.filter(c=>c?.contract===task.contract_code&&c.interval_ms===duration&&c.all_candles_closed===true&&
  stamp(c.source_ts)&&stamp(c.observed_ts)&&c.source_ts<=c.observed_ts&&c.observed_ts<=now_ts&&now_ts-c.source_ts<=180000&&
  stamp(c.window_start)&&stamp(c.window_end)&&c.window_start>=canonical.observed_ts&&c.window_end-c.window_start===duration&&
  c.window_end<=c.source_ts&&c.window_end<=now_ts&&c.window_end<task.expires_ts&&now_ts-c.window_end<=duration+180000&&
  ['open','high','low','close'].every(k=>typeof c[k]==='number'&&Number.isFinite(c[k])&&c[k]>0)&&
  c.low<=c.high&&c.open>=c.low&&c.open<=c.high&&c.close>=c.low&&c.close<=c.high&&
  ['HTX_OFFICIAL_CLOSED_CANDLE','HTX_OFFICIAL_FIVE_CLOSED_1M_CANDLES'].includes(c.source));
 if(!valid.length)return fail('FRESH_CLOSED_ORIGINAL_PERIOD_REQUIRED');
 const end=Math.max(...valid.map(c=>c.window_end)),latest=valid.filter(c=>c.window_end===end);
 if(latest.some(c=>['open','high','low','close'].some(k=>Math.abs(c[k]-latest[0][k])>Math.max(1,c[k])*1e-9)))return fail('CONFLICTING_PRIMARY_CANDLES');
 const c=latest[0];
 if(!compare(c.close,trigger.operator,trigger.value))return {...fail('CANDLE_CLOSE_HAS_NOT_SETTLED'),candle:c};
 if(!compare(current_price,trigger.operator,trigger.value))return {...fail('CURRENT_PRICE_NO_LONGER_SUPPORTS_TRIGGER'),candle:c};
 return {...base,status:'ORIGINAL_TRIGGER_SETTLED',settlement_confirmed:true,reason:'CLOSED_CANDLE_AND_CURRENT_PRIMARY_PRICE_MATCH_ORIGINAL_TRIGGER',candle:c,price:current_price,operator:trigger.operator,value:trigger.value};
}
export function classifyOriginalIdeaAnalysis({task,canonical,now_ts}={}){
 const r=canonical?.metadata?.original_idea_recheck;
 if(!stamp(now_ts)||!task?.task_id)return {result:null,reason:'INVALID_ANALYSIS_CLOCK'};
 if(now_ts>=task.expires_ts)return {result:'EXPIRED',reason:'ORIGINAL_TTL_EXPIRED'};
 if(canonical?.status!=='CLOSED'||canonical.analytical_fingerprint!==canonicalFingerprint(canonical)||
  canonical.metadata?.contract!==task.contract_code||canonical.run_id===task.run_id||canonical.observed_ts<task.lease_started_ts||
  canonical.observed_ts>now_ts||now_ts-canonical.observed_ts>180000||r?.task_id!==task.task_id||
  r.publication_id!==task.publication_id||r.wave_id!==task.wave_id||r.direction!==task.direction||
  r.original_run_id!==task.run_id||r.original_snapshot_id!==task.snapshot_id||r.original_expires_ts!==task.expires_ts)
  return {result:null,reason:'FRESH_SAME_IDEA_FULL_ANALYSIS_REQUIRED'};
 if(r.status==='CANCELLED')return {result:'CANCELLED',reason:'ORIGINAL_PRICE_CANCELLED'};
 if(['ENTRY_NOW_ANALYTICAL','ENTRY_NOW_VALIDATED'].includes(canonical.state)){
  if(canonical.direction!==task.direction||r.status!=='ORIGINAL_TRIGGER_SETTLED'||r.settlement_confirmed!==true||r.entry_authorized!==false)
   return {result:'PENDING',reason:'ORIGINAL_SETTLEMENT_NOT_CLOSED'};
  return {result:'DONE',reason:'ORIGINAL_SETTLEMENT_AND_FRESH_FULL_ENTRY_CONFIRMED'};
 }
 // Missing data, a failed source or a still-waiting analysis is not a factual
 // cancellation. Keep the original task and deadline for the next price check.
 return {result:'PENDING',reason:canonical.state==='REJECTED'?'FRESH_ANALYSIS_REFUSED_ENTRY':'ORIGINAL_IDEA_STILL_WAITING'};
}
export async function finishOriginalIdeaAnalysis(db,{task,canonical,publication_id,now_ts=Date.now()}={}){
 const outcome=classifyOriginalIdeaAnalysis({task,canonical,now_ts});
 if(!outcome.result)return {status:outcome.reason,completed:false};
 return {...await completeRecheck(db,{task_id:task.task_id,actor:task.lease_owner,lease_started_ts:task.lease_started_ts,
  result:outcome.result,new_publication_id:publication_id,analysis_receipt:canonical?.metadata?.original_idea_recheck??null,completion_reason:outcome.reason,now_ts}),reason:outcome.reason};
}
