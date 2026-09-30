import {installProviderMinuteLedger,reserveProviderMinuteUnits} from './provider-minute-ledger.mjs';
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
export const HTX_REALIZED_LIQUIDATIONS_VERSION='htx-public-v3-realized-liquidations-v1-20260930';
export function normalizeHtxRealizedLiquidations(payload,{contract,window_start_ts,window_end_ts,now}={}){
 const source='HTX_REALIZED_LIQUIDATIONS',source_ts=finite(payload?.ts),base={version:HTX_REALIZED_LIQUIDATIONS_VERSION,source,upstream_id:'HTX_USDT_PERPETUAL',contract,source_ts,observed_ts:now,window_start_ts,window_end_ts,unit:'USDT_QUOTE',coverage:'PUBLIC_REQUESTED_WINDOW_OBSERVATIONS',complete_window:false,pagination_complete:false,projected_liquidation_prices:false,whole_market_coverage:false,advisory_only:true,independent_vote_added:false};
 if(Number(payload?.code)!==200||!Array.isArray(payload?.data)||source_ts===null||source_ts>now+5000||now-source_ts>60_000)return{...base,status:'NOT_CLOSED',reason:'CURRENT_V3_RESPONSE_REQUIRED',events:[]};
 const seen=new Map();let invalid=0;
 for(const row of payload.data){const price=finite(row?.price),quantity=finite(row?.amount),notional=finite(row?.trade_turnover),ts=finite(row?.created_at),id=String(row?.query_id??'');
  if(row?.contract_code!==contract||row?.pair!==contract||row?.business_type!=='swap'||row?.trade_partition!=='USDT'||row?.offset!=='close'||!['buy','sell'].includes(row?.direction)||!Number.isSafeInteger(ts)||ts<window_start_ts||ts>=window_end_ts||!(price>0)||!(quantity>0)||!(notional>0)||Math.abs(notional-price*quantity)>Math.max(0.01,notional*0.001)||!/^\d+$/.test(id)||(typeof row.query_id==='number'&&!Number.isSafeInteger(row.query_id))){invalid++;continue;}
  const event={event_id:id,contract,source_ts:ts,price,quantity,notional_usd:notional,liquidated_side:row.direction==='buy'?'SHORT':'LONG',venue:'HTX',realized_only:true};
  if(seen.has(id)){if(JSON.stringify(seen.get(id))!==JSON.stringify(event))invalid++;continue;}seen.set(id,event);
 }
 const events=[...seen.values()].sort((a,b)=>b.source_ts-a.source_ts);
 return{...base,status:invalid?'NOT_CLOSED':'CLOSED',reason:invalid?'INVALID_OR_CONFLICTING_NATIVE_EVENTS':null,invalid_rows:invalid,events,observed_event_count:events.length,long_liquidated_observed_usd:events.filter(e=>e.liquidated_side==='LONG').reduce((sum,e)=>sum+e.notional_usd,0),short_liquidated_observed_usd:events.filter(e=>e.liquidated_side==='SHORT').reduce((sum,e)=>sum+e.notional_usd,0),empty_response_is_not_full_window_zero:true};
}
export async function collectHtxRealizedLiquidations({db,fetch_impl=globalThis.fetch,contract,run_id,now=Date.now()}={}){
 const source='HTX_REALIZED_LIQUIDATIONS';if(!/^[^-\s]{1,32}-USDT$/u.test(String(contract||'')))return{source,status:'NOT_APPLICABLE',network_calls:0};
 await installProviderMinuteLedger(db);const grant=await reserveProviderMinuteUnits(db,{provider:'HTX_PUBLIC_LIQUIDATIONS',reservation_id:`${run_id}:HTX_LIQ:${contract}`,units:1,now,cap:6});
 if(!grant.allowed)return{source,status:'SKIPPED_QUOTA',reason:grant.status,network_calls:0,admission:grant};
 const end=Math.floor(now/300_000)*300_000,start=end-7200_000,url=`https://api.hbdm.com/linear-swap-api/v3/swap_liquidation_orders?contract=${encodeURIComponent(contract)}&trade_type=0&start_time=${start}&end_time=${end}&direct=prev`,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),9000);
 try{const response=await fetch_impl(url,{headers:{accept:'application/json'},signal:controller.signal}),payload=await response.json().catch(()=>null),observed=Math.max(now,Date.now());return{...(response.ok?normalizeHtxRealizedLiquidations(payload,{contract,window_start_ts:start,window_end_ts:end,now:observed}):{source,status:'EXTERNAL_FAILURE',reason:`HTTP_${response.status}`}),network_calls:1,http_status:response.status,admission:grant,request_route:'GET /linear-swap-api/v3/swap_liquidation_orders',public_keyless:true};}
 catch(error){return{source,status:'EXTERNAL_FAILURE',reason:error?.name==='AbortError'?'TIMEOUT':'NETWORK_ERROR',network_calls:1,admission:grant};}finally{clearTimeout(timer);}
}
