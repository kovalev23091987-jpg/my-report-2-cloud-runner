import {reserveProviderMinuteUnits,installProviderMinuteLedger} from './provider-minute-ledger.mjs';
export const GATE_LIQUIDATION_HISTORY_VERSION='gate-public-liquidation-stat-context-v1-20260930';
const TTL=15*60_000,finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
export function normalizeGateLiquidationStatistics(payload,{contract,now}={}){
 const rows=Array.isArray(payload)?payload:[],valid=[],seen=new Set();let invalid=0;
 for(const row of rows){const ts=finite(row?.time)*1000,long=finite(row?.long_liq_usd),short=finite(row?.short_liq_usd),oi=finite(row?.open_interest_usd);
  if(!Number.isSafeInteger(ts)||ts>now||now-ts>TTL||long===null||short===null||long<0||short<0||oi===null||oi<0||seen.has(ts)){invalid++;continue;}
  seen.add(ts);valid.push({source_ts:ts,long_liquidated_usd:long,short_liquidated_usd:short,open_interest_usd:oi});
 }
 valid.sort((a,b)=>b.source_ts-a.source_ts);const latest=valid[0];
 return {version:GATE_LIQUIDATION_HISTORY_VERSION,source:'GATE_LIQUIDATION_HISTORY',upstream_id:'GATE_USDT_PERPETUAL',contract,status:latest&&invalid===0?'CLOSED':'NOT_CLOSED',reason:!latest?'CURRENT_NATIVE_STATISTICS_REQUIRED':invalid?'INVALID_OR_DUPLICATE_STATISTIC_ROWS':null,source_ts:latest?.source_ts??null,observed_ts:now,unit:'USDT_QUOTE',requested_interval:'5m',native_statistics:latest??null,
  long_liquidated_recent:latest?.long_liquidated_usd??null,short_liquidated_recent:latest?.short_liquidated_usd??null,
  intensity_ratio:null,baseline_window_comparable:false,whole_market_coverage:false,coverage:'ONE_EXACT_GATE_PERPETUAL_STATISTIC',event_execution_prices_proven:false,independent_vote_added:false,direction_neutral_context:true,advisory_only:true};
}
export async function collectGateLiquidationHistory({db,fetch_impl=globalThis.fetch,contract,run_id,now=Date.now(),max_http=2}={}){
 const base=String(contract||'').toUpperCase().replace(/-USDT$/,''),symbol=`${base}_USDT`,source='GATE_LIQUIDATION_HISTORY';
 if(!/^[A-Z0-9]{1,32}$/.test(base))return{source,status:'NOT_APPLICABLE',network_calls:0};
 await db.prepare(`CREATE TABLE IF NOT EXISTS report2_gate_contract_identity (symbol TEXT PRIMARY KEY,expires_ts INTEGER NOT NULL,payload_json TEXT NOT NULL)`).run();
 const prior=await db.prepare(`SELECT payload_json FROM report2_gate_contract_identity WHERE symbol=?1 AND expires_ts>?2`).bind(symbol,now).first();let identity=null;try{identity=JSON.parse(prior?.payload_json||'null');}catch{}
 const required=identity?1:2;if(max_http<required)return{source,status:'SKIPPED_HTTP_ENVELOPE',reason:'EXACT_GATE_IDENTITY_AND_STATISTICS_REQUIRE_BUDGET',network_calls:0};
 await installProviderMinuteLedger(db);const grant=await reserveProviderMinuteUnits(db,{provider:'GATE_PUBLIC_STATISTICS',reservation_id:`${run_id}:GATE:${symbol}`,units:required,now,cap:6});
 if(!grant.allowed)return{source,status:'SKIPPED_QUOTA',reason:grant.status,network_calls:0,admission:grant};
 let network_calls=0;const receipts=[];async function get(path){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),9000);network_calls++;try{const response=await fetch_impl(`https://api.gateio.ws/api/v4/futures/usdt/${path}`,{headers:{accept:'application/json'},signal:controller.signal});const payload=await response.json().catch(()=>null);receipts.push({http_status:response.status,path,received_ts:Date.now()});return{ok:response.ok,payload,status:response.status};}catch(error){receipts.push({path,http_status:null,error:String(error.message).slice(0,100)});return{ok:false,payload:null,status:null};}finally{clearTimeout(timer);}}
 if(!identity){const raw=await get(`contracts/${encodeURIComponent(symbol)}`),p=raw.payload;if(!raw.ok||p?.name!==symbol||p?.in_delisting===true||!(finite(p?.quanto_multiplier)>0)||p?.type!=='direct')return{source,status:raw.ok?'SOURCE_UNSUPPORTED':'EXTERNAL_FAILURE',reason:'EXACT_ACTIVE_DIRECT_USDT_CONTRACT_REQUIRED',network_calls,receipts};identity={symbol,type:p.type,quanto_multiplier:Number(p.quanto_multiplier)};await db.prepare(`INSERT INTO report2_gate_contract_identity(symbol,expires_ts,payload_json) VALUES(?1,?2,?3) ON CONFLICT(symbol) DO UPDATE SET expires_ts=excluded.expires_ts,payload_json=excluded.payload_json`).bind(symbol,now+86400_000,JSON.stringify(identity)).run();}
 const raw=await get(`contract_stats?contract=${encodeURIComponent(symbol)}&interval=5m&limit=2`),observed=Math.max(now,...receipts.map(r=>Number(r.received_ts)||now));
 return {...(raw.ok?normalizeGateLiquidationStatistics(raw.payload,{contract,now:observed}):{source,status:'EXTERNAL_FAILURE',reason:`HTTP_${raw.status??'UNKNOWN'}`}),exact_identity:identity.symbol===symbol,native_symbol:symbol,identity,network_calls,receipts,admission:grant,per_minute_operational_cap:6,free_keyless:true};
}
