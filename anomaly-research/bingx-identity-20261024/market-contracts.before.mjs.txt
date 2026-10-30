const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value):null;
const KNOWN_SUFFIX=new Set(['WATCH','CANDIDATE','BIAS']);

export function normalizeDirectionCandidate(value,{origin='UNKNOWN',source_ts=null,confirmation_state='UNCONFIRMED'}={}){
  const raw=String(value??'').trim().toUpperCase();let direction='UNKNOWN';
  if(raw==='LONG'||raw==='SHORT')direction=raw;
  else{const match=raw.match(/^(LONG|SHORT)_([A-Z]+)$/);if(match&&KNOWN_SUFFIX.has(match[2]))direction=match[1];}
  return {direction,origin,source_ts:finite(source_ts),confirmation_state,direction_raw:raw||null};
}

export function authorizeEntryDirection({candidate,final_route_state,final_direction,hard_veto=false}={}){
  if(hard_veto===true||final_route_state==='REJECTED')return {authorized:false,status:'VETO_OR_REJECTED',direction:'UNKNOWN'};
  const final=normalizeDirectionCandidate(final_direction,{origin:'FINAL_ROUTE',confirmation_state:'FINAL_CONFIRMED'});
  if(!['ENTRY_NOW_ANALYTICAL','ENTRY_NOW_VALIDATED'].includes(final_route_state)||final.direction==='UNKNOWN')return {authorized:false,status:'FINAL_DIRECTION_NOT_CONFIRMED',direction:'UNKNOWN',candidate:candidate??null};
  return {authorized:true,status:'FINAL_DIRECTION_CONFIRMED',direction:final.direction,candidate:candidate??null};
}

export function buildHtxReferencePrice({contract,type,bid=null,ask=null,value=null,source_ts,received_ts}={}){
  const allowed=new Set(['MID_OBSERVATION','EXECUTABLE_BID','EXECUTABLE_ASK','EXECUTABLE_VWAP']);
  const b=finite(bid),a=finite(ask),v=finite(value),source=finite(source_ts),received=finite(received_ts);
  if(!/^[^\s]+-USDT$/.test(String(contract||''))||!allowed.has(type)||source===null||received===null||received<source)return {status:'NOT_CLOSED',reason:'HTX_REFERENCE_IDENTITY_OR_TIME_INVALID'};
  let resolved=v;if(type==='MID_OBSERVATION')resolved=b!==null&&a!==null&&a>=b?(b+a)/2:null;
  if(type==='EXECUTABLE_BID')resolved=b;if(type==='EXECUTABLE_ASK')resolved=a;
  if(resolved===null||resolved<=0)return {status:'NOT_CLOSED',reason:'HTX_REFERENCE_PRICE_INVALID'};
  return {status:'CLOSED',venue:'HTX',contract,type,bid:b,ask:a,value:resolved,source_ts:source,received_ts:received};
}

export function normalizeExecutionStatus(component={}){
  const raw=String(component.execution_status??component.status??'').trim().toUpperCase();
  if(['SUCCESS','CLOSED','OK'].includes(raw))return {status:'SUCCESS',reason:null};
  if(['FAILED','ERROR','SOURCE_ERROR'].includes(raw))return {status:'FAILED',reason:String(component.reason??component.error??'EXECUTION_COMPONENT_FAILED')};
  if(['PARTIAL','DEGRADED'].includes(raw))return {status:'PARTIAL',reason:String(component.reason??'EXECUTION_COMPONENT_PARTIAL')};
  return {status:'UNKNOWN',reason:'EXECUTION_STATUS_NOT_RECOGNIZED'};
}

export function buildHtxExecutionReceipt({component,reference_price}={}){
  const normalized=normalizeExecutionStatus(component);
  if(normalized.status!=='SUCCESS'||reference_price?.status!=='CLOSED'||!String(reference_price?.type||'').startsWith('EXECUTABLE_'))return {status:'NOT_CLOSED',reason:normalized.status!=='SUCCESS'?normalized.reason:'EXECUTABLE_HTX_REFERENCE_REQUIRED'};
  return {status:'CLOSED',execution_status:'SUCCESS',venue:'HTX',contract:reference_price.contract,reference_price,execution_gate_replaced:false};
}

export function rolling24hChange({current,history_point}={}){
  const now=finite(current?.value??current),past=finite(history_point?.value??history_point),actual=finite(history_point?.actual_window_ms);
  if(now===null||past===null||past<=0||actual===null||Math.abs(actual-24*60*60_000)>5*60_000)return {status:'UNKNOWN',reason:'REAL_24H_WINDOW_REQUIRED',rolling_24h_change_pct:null};
  return {status:'CLOSED',semantics:'SNAPSHOT_ACTUAL_24H',actual_window_ms:actual,rolling_24h_change_pct:(now/past-1)*100};
}

export function traceFinalDecision(row){
  if(!row)return {before:'CANDIDATE',after:'REJECTED',reason:'NO_FINAL_DECISION_ROW'};
  return {before:row.before??'UNKNOWN',after:row.after??row.canonical_state??'UNKNOWN',reason:row.reason??'FINAL_DECISION_PRESENT'};
}
