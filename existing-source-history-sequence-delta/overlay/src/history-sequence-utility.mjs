export const HISTORY_SEQUENCE_UTILITY_VERSION='history-sequence-utility-v1-20260925';
const finite=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;};
const clean=v=>String(v??'').trim();
export function normalizeBinanceHistoryFeature({symbol='BTCUSDT',market='spot',span_days,rows,gaps,first_close,last_close,observed_ts=Date.now()}={}){
  const span=finite(span_days),count=finite(rows),gap=finite(gaps),first=finite(first_close),last=finite(last_close);
  const closed=span!==null&&span>=30&&count!==null&&count>0&&gap===0&&first!==null&&first>0&&last!==null&&last>0;
  return {version:HISTORY_SEQUENCE_UTILITY_VERSION,status:closed?'CLOSED':'NOT_CLOSED',source:'Binance Public Data Archive',symbol:clean(symbol).toUpperCase(),market:clean(market),span_days:span,rows:count,gaps:gap,first_close:first,last_close:last,return_pct:closed?(last/first-1)*100:null,maintenance_only:true,hot_cycle:false,persist_every_trade:false,directional_vote:false};
}
export function recoverCoinbaseSequence({last_sequence,event_sequence,snapshot_sequence}={}){
  const last=finite(last_sequence),event=finite(event_sequence),snap=finite(snapshot_sequence);
  if(last===null||event===null)return {version:HISTORY_SEQUENCE_UTILITY_VERSION,status:'NOT_CLOSED',reason:'SEQUENCE_INPUT_INVALID',gap_detected:null};
  if(event===last+1)return {version:HISTORY_SEQUENCE_UTILITY_VERSION,status:'CLOSED',gap_detected:false,last_sequence:last,event_sequence:event,snapshot_sequence:snap,recovery:'NOT_REQUIRED',absence_is_negative:false,institutional_buying_claim:false};
  if(event<=last)return {version:HISTORY_SEQUENCE_UTILITY_VERSION,status:'NOT_CLOSED',reason:'DUPLICATE_OR_REORDERED',gap_detected:false,last_sequence:last,event_sequence:event,snapshot_sequence:snap};
  if(snap===null||snap<last)return {version:HISTORY_SEQUENCE_UTILITY_VERSION,status:'NOT_CLOSED',reason:'RECOVERY_SNAPSHOT_INVALID',gap_detected:true,last_sequence:last,event_sequence:event,snapshot_sequence:snap};
  return {version:HISTORY_SEQUENCE_UTILITY_VERSION,status:'CLOSED',gap_detected:true,last_sequence:last,event_sequence:event,snapshot_sequence:snap,recovery:'REST_L2_SNAPSHOT_RELOAD',recovery_required:true,absence_is_negative:false,institutional_buying_claim:false,measurement_only:true};
}
export function decideBitgetUtility({overlap_pct,live_context_status,coverage_measured=true}={}){
  const overlap=finite(overlap_pct);const live=String(live_context_status||'').toUpperCase()==='CLOSED';
  if(!coverage_measured||overlap===null||!live)return {version:HISTORY_SEQUENCE_UTILITY_VERSION,status:'NOT_CLOSED',decision:'KEEP_SHADOW_MEASUREMENT_INCOMPLETE',automatic_voting:false};
  return {version:HISTORY_SEQUENCE_UTILITY_VERSION,status:'CLOSED',source:'Bitget',overlap_pct:overlap,decision:'KEEP_SHADOW_THIRD_VENUE_CONTEXT_ONLY',fallback_enabled:false,third_venue_context:true,automatic_voting:false,directional_vote:false,measurement_only:true};
}
export function auditHyperliquidRecorderRuntime({runtime_files=[]}={}){
  const files=Array.isArray(runtime_files)?runtime_files:[];const hot=files.filter(x=>/worker\.js$|runtime|recorder/i.test(String(x?.path||x?.name||''))&&/hyperliquid/i.test(String(x?.content||'')));
  return {version:HISTORY_SEQUENCE_UTILITY_VERSION,status:hot.length?'CLOSED':'NOT_CLOSED',production_recorder_extension_found:hot.length>0,matching_files:hot.map(x=>x.path||x.name),decision:hot.length?'EXACT_RECORDER_PATH_PRESENT':'KEEP_SHADOW_NO_PRODUCTION_RECORDER_EXTENSION_FOUND'};
}
