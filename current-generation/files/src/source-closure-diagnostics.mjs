import {isExactHtxUsdtSwapKey} from './htx-contract-key.mjs';
const clock=x=>Number.isSafeInteger(x)&&x>=0?x:null;
const count=x=>Number.isSafeInteger(x)&&x>=0&&x<=2000000?x:null;
const text=x=>typeof x==='string'?x.replace(/[\x00-\x1f]/g,' ').slice(0,120):null;
export function buildHtxFlowClosureDiagnostic({contract,now,signed_flow,trajectory}={}){
 if(!isExactHtxUsdtSwapKey(contract)||clock(now)===null)return null;
 const a=signed_flow?.raw_acquisition_diagnostic,w=trajectory?.windows?.['4h'],end=clock(w?.order_flow?.window_end_ts),read=signed_flow?.saved_ring_read_diagnostic;
 const body={schema:'HTX_FLOW_CLOSURE_DIAGNOSTIC_V1',contract,evaluated_ts:now,freshness_limit_ms:300000,signed_raw_status:text(signed_flow?.status),signed_raw_ring:signed_flow?.saved_ring_diagnostic??null,acquisition:a?{status:text(a.status),failure_stage:text(a.failure_stage),error_code:text(a.error_code),observed_ts:clock(a.observed_ts),new_verified_minutes:count(a.new_verified_minutes),unverified_recent_minutes:count(a.unverified_recent_minutes),persisted_minutes:count(a.persisted_minutes),source_clocks:Object.fromEntries(['trades','minutes','metadata'].map(k=>{const r=a.source_clocks?.[k];return[k,{status:text(r?.status),source_ts:clock(r?.source_ts),received_ts:clock(r?.received_ts),age_ms:Number.isSafeInteger(r?.age_ms)?r.age_ms:null}];}))}:null,trajectory:{observed_ts:clock(trajectory?.timestamp),window_start_ts:clock(w?.order_flow?.window_start_ts),window_end_ts:end,window_age_ms:end===null?null:now-end,expected_1m_bars:count(w?.price?.expected_1m_bars),received_1m_bars:count(w?.price?.received_1m_bars)},diagnostic_only:true,internal_only:true,source_clocks_refreshed:false,network_calls:0};
 if(read?.diagnostic_only===true&&read.source_clock_unchanged===true&&clock(read.evaluated_ts)!==null&&read.evaluated_ts<=now)body.saved_ring_read={status:text(read.status),failure_stage:text(read.failure_stage),error_code:text(read.error_code),evaluated_ts:read.evaluated_ts,diagnostic_only:true,source_clock_unchanged:true};
 if(a)body.acquisition.current_run_verified_flow_retained=a.current_run_verified_flow_retained===true;
 return Buffer.byteLength(JSON.stringify(body))<=2048?body:null;
}
export function retainHtxFlowClosureDiagnostic(raw){
 if(raw?.schema!=='HTX_FLOW_CLOSURE_DIAGNOSTIC_V1'||raw?.diagnostic_only!==true||raw?.internal_only!==true||raw?.source_clocks_refreshed!==false||raw?.network_calls!==0||!isExactHtxUsdtSwapKey(raw.contract)||clock(raw.evaluated_ts)===null)return null;
 try{return Buffer.byteLength(JSON.stringify(raw))<=2048?raw:null;}catch{return null;}
}

