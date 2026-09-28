import {fetchOxArchive} from './liquidation-extension/io.mjs';
import {normalizeOxArchive} from './liquidation-extension/providers.mjs';
import {createScopedProviderAcquisition} from './liquidation-extension/scoped-provider-runtime-bridge.mjs';
import {createMultiLiquidationAcquisition} from './liquidation-extension/gtrade-runtime-bridge.mjs';

export const OXARCHIVE_COST_PROBE_VERSION='oxarchive-cost-probe-v2-production-route-20260927';
export const OXARCHIVE_MODULE_MONTHLY_CREDIT_CAP=5000;
export const OXARCHIVE_PRODUCTION_ROUTE_CREDIT_COST=1;
const BASE='https://api.0xarchive.io/v1/hyperliquid/liquidations';
const ROUTE='range_pct=50&buckets=100';
const symbolOf=v=>{const s=String(v||'').trim().toUpperCase();return /^[A-Z0-9]{2,20}$/.test(s)?s:null;};
const headerObject=headers=>{const out={};if(headers?.forEach)headers.forEach((v,k)=>{const key=String(k).toLowerCase();if(key.includes('credit')||key.includes('rate')||key==='retry-after'||key==='x-request-id')out[key]=String(v).slice(0,200);});return out;};
const exactCreditCost=headers=>{for(const key of ['x-credits-used','x-credit-cost','x-request-credit-cost','x-request-cost-credits']){const raw=headers?.[key];if(raw!==undefined&&/^\d+$/.test(String(raw))&&Number(raw)>0&&Number.isSafeInteger(Number(raw)))return Number(raw);}return null;};
const monthWindow=now=>{const d=new Date(now),start=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1),end=Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1);return{start,end};};

async function ensureProbeSchema(db){
 await db.prepare(`CREATE TABLE IF NOT EXISTS report2_oxarchive_cost_probe (probe_key TEXT PRIMARY KEY, symbol TEXT NOT NULL, requested_ts INTEGER NOT NULL, http_status INTEGER, response_headers_json TEXT NOT NULL, request_id TEXT, success INTEGER NOT NULL, route_cost_closed INTEGER NOT NULL, credit_cost INTEGER, error_text TEXT)`).run();
 try{await db.prepare(`ALTER TABLE report2_oxarchive_cost_probe ADD COLUMN credit_cost INTEGER`).run();}catch{}
}

export async function runOxArchiveCostProbe({db,fetch_impl=globalThis.fetch,api_key,symbol,now=Date.now()}={}){
 if(!db)throw new Error('OXARCHIVE_PROBE_DB_REQUIRED');
 const key=String(api_key||'').trim(),coin=symbolOf(symbol);
 if(!key)return{version:OXARCHIVE_COST_PROBE_VERSION,status:'NOT_RUN',reason:'API_KEY_REQUIRED',network_calls:0,production_enable_allowed:false};
 if(!coin)return{version:OXARCHIVE_COST_PROBE_VERSION,status:'NOT_RUN',reason:'SYMBOL_INVALID',network_calls:0,production_enable_allowed:false};
 await ensureProbeSchema(db);
 const probeKey=`OXARCHIVE_LEVELS_COST_V2:${coin}:R50:B100`;
 const prior=await db.prepare(`SELECT probe_key,symbol,requested_ts,http_status,response_headers_json,request_id,success,route_cost_closed,credit_cost,error_text FROM report2_oxarchive_cost_probe WHERE probe_key=?1 LIMIT 1`).bind(probeKey).first();
 if(prior){const cost=Number(prior.credit_cost);return{version:OXARCHIVE_COST_PROBE_VERSION,status:'ALREADY_PROBED',network_calls:0,record:prior,credit_cost:Number.isSafeInteger(cost)&&cost>0?cost:null,production_enable_allowed:prior.success===1&&prior.route_cost_closed===1&&Number.isSafeInteger(cost)&&cost>0};}
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);let response=null,payload=null,error=null;
 try{response=await fetch_impl(`${BASE}/${encodeURIComponent(coin)}/levels?${ROUTE}`,{headers:{accept:'application/json','x-api-key':key,'user-agent':'My-Report-2/0xarchive-cost-probe-v2'},signal:controller.signal});payload=await response.json().catch(()=>null);}catch(e){error=String(e?.name==='AbortError'?'TIMEOUT':e?.message||e).slice(0,300);}finally{clearTimeout(timer);}
 const headers=headerObject(response?.headers),requestId=String(payload?.meta?.request_id||headers['x-request-id']||'').slice(0,120)||null,reportedCreditCost=exactCreditCost(headers);
 const success=response?.ok===true&&payload?.success===true,creditCost=success?OXARCHIVE_PRODUCTION_ROUTE_CREDIT_COST:null,costClosed=success;
 await db.prepare(`INSERT INTO report2_oxarchive_cost_probe(probe_key,symbol,requested_ts,http_status,response_headers_json,request_id,success,route_cost_closed,credit_cost,error_text) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`).bind(probeKey,coin,now,response?.status??null,JSON.stringify(headers),requestId,success?1:0,costClosed?1:0,creditCost,error||(!response?.ok?`HTTP_${response?.status??'UNKNOWN'}`:null)).run();
 return{version:OXARCHIVE_COST_PROBE_VERSION,status:success?'AUTH_AND_ROUTE_CLOSED':'PROBE_FAILED',network_calls:1,symbol:coin,http_status:response?.status??null,request_id:requestId,cost_headers:headers,reported_credit_cost:reportedCreditCost,credit_cost:creditCost,credit_cost_basis:'OFFICIAL_ROWS_PER_CREDIT_100_LEVEL_ROWS_BELOW_1000_ROW_FLOOR',route_cost_closed:costClosed,production_enable_allowed:success,production_route:ROUTE};
}

export async function loadOxArchiveReadiness({db,api_key}={}){
 if(!db)throw new Error('OXARCHIVE_READINESS_DB_REQUIRED');
 if(!String(api_key||'').trim())return{status:'DISABLED',reason:'API_KEY_REQUIRED',enabled:false,monthly_credit_cap:OXARCHIVE_MODULE_MONTHLY_CREDIT_CAP};
 return{status:'CLOSED',reason:null,enabled:true,credit_cost:OXARCHIVE_PRODUCTION_ROUTE_CREDIT_COST,credit_cost_basis:'OFFICIAL_ROWS_PER_CREDIT_100_LEVEL_ROWS_BELOW_1000_ROW_FLOOR',monthly_credit_cap:OXARCHIVE_MODULE_MONTHLY_CREDIT_CAP,max_monthly_calls:Math.floor(OXARCHIVE_MODULE_MONTHLY_CREDIT_CAP/OXARCHIVE_PRODUCTION_ROUTE_CREDIT_COST),probe_key:null,auth_probe_optional:true,automatic_topup:false};
}

export async function reserveOxArchiveCredits({db,reservation_id,credit_cost,now=Date.now()}={}){
 if(!db||!String(reservation_id||'').trim())return{allowed:false,reason:'CREDIT_LEDGER_IDENTITY_REQUIRED'};
 const cost=Number(credit_cost);if(!Number.isSafeInteger(cost)||cost<1)return{allowed:false,reason:'EXACT_CREDIT_COST_REQUIRED'};
 const window=monthWindow(now);
 await db.prepare(`CREATE TABLE IF NOT EXISTS report2_oxarchive_credit_ledger (reservation_id TEXT PRIMARY KEY, window_start_ts INTEGER NOT NULL, window_end_ts INTEGER NOT NULL, credits INTEGER NOT NULL CHECK(credits>0), created_ts INTEGER NOT NULL, route TEXT NOT NULL)`).run();
 const prior=await db.prepare(`SELECT reservation_id,window_start_ts,window_end_ts,credits,created_ts,route FROM report2_oxarchive_credit_ledger WHERE reservation_id=?1 LIMIT 1`).bind(reservation_id).first();
 if(prior)return prior.credits===cost&&prior.route===ROUTE?{allowed:true,new_reservation:false,idempotent:true,credits:cost}:{allowed:false,reason:'RESERVATION_ID_CONFLICT'};
 await db.prepare(`INSERT INTO report2_oxarchive_credit_ledger(reservation_id,window_start_ts,window_end_ts,credits,created_ts,route)
  SELECT ?1,?2,?3,?4,?5,?6 WHERE COALESCE((SELECT SUM(credits) FROM report2_oxarchive_credit_ledger WHERE window_start_ts=?2),0)+?4<=?7 ON CONFLICT(reservation_id) DO NOTHING`).bind(reservation_id,window.start,window.end,cost,now,ROUTE,OXARCHIVE_MODULE_MONTHLY_CREDIT_CAP).run();
 const row=await db.prepare(`SELECT reservation_id,credits,route FROM report2_oxarchive_credit_ledger WHERE reservation_id=?1 LIMIT 1`).bind(reservation_id).first();
 return row?.credits===cost&&row?.route===ROUTE?{allowed:true,new_reservation:true,idempotent:false,credits:cost}:{allowed:false,reason:'MONTHLY_MODULE_CREDIT_CAP_EXHAUSTED'};
}

export function createOxArchiveCollector({db,fetch_impl=globalThis.fetch,api_key,readiness,clock=Date.now}={}){
 if(readiness?.enabled!==true||!String(api_key||'').trim())return null;
 const history=[];
 const collect=async params=>{
  const symbol=symbolOf(params?.native_symbol),contract=String(params?.contract||'').trim().toUpperCase(),runId=String(params?.run_id||'').trim();
  if(!symbol||contract!==`${symbol}-USDT`||!runId)return null;
  const started=clock(),reservationId=`OXARCHIVE:${runId}:${contract}`;
  const reserved=await reserveOxArchiveCredits({db,reservation_id:reservationId,credit_cost:readiness.credit_cost,now:started});
  if(reserved.allowed!==true){history.push({contract,status:reserved.reason,http_status:null});return null;}
  const raw=await fetchOxArchive(symbol,{api_key,credit_cost_verified:true,fetch_impl,clock});
  const completed=clock();if(raw?.ok!==true){history.push({contract,status:raw?.reason||'SOURCE_ERROR',http_status:raw?.receipt?.http_status??null,retry_after:raw?.receipt?.retry_after??null});return null;}
  const normalized=normalizeOxArchive(raw.payload,{symbol,route_symbol:symbol,run_id:runId,snapshot_id:`OXARCHIVE:${runId}:${contract}`,as_of_ms:completed,received_at_ms:Math.min(completed,raw.receipt?.received_ts??completed),max_age_ms:300000,range_pct:50,buckets:100,execution_alias_verified:false});
  if(normalized?.usable_for_context!==true){history.push({contract,status:normalized?.status||'NORMALIZATION_NOT_CLOSED'});return null;}
  const scoped=createScopedProviderAcquisition({contract,native_symbol:symbol,run_id:runId,acquisition_id:reservationId,provider:'0xArchive',venue:'Hyperliquid',price_quote:'USD',collection_started_ts:started,collection_completed_ts:completed,normalized_receipts:[normalized],transport_receipts:[raw.receipt]});
  history.push({contract,status:'CLOSED',credits:readiness.credit_cost});
  return createMultiLiquidationAcquisition({contract,run_id:runId,scoped:[scoped]});
 };
 collect.summary=()=>({enabled:true,route:ROUTE,credit_cost:readiness.credit_cost,monthly_credit_cap:OXARCHIVE_MODULE_MONTHLY_CREDIT_CAP,automatic_topup:false,history:[...history]});
 return collect;
}

export default{runOxArchiveCostProbe,loadOxArchiveReadiness,reserveOxArchiveCredits,createOxArchiveCollector};
