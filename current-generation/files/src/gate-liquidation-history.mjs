import {reserveProviderMinuteUnits,installProviderMinuteLedger} from './provider-minute-ledger.mjs';
export const GATE_LIQUIDATION_HISTORY_VERSION='gate-public-liquidation-stat-context-v2-20260930';
const TTL=15*60_000,finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
export function normalizeGateLiquidationStatistics(payload,{contract,now}={}){
 const interval=300_000,end=Math.floor(now/interval)*interval,start=end-24*interval,rows=Array.isArray(payload)?payload:[],valid=[],seen=new Set();let invalid=0;
 for(const row of rows){const seconds=finite(row?.time),ts=seconds===null?null:seconds*1000;
  if(!Number.isSafeInteger(ts)||ts>now||ts%interval!==0){invalid++;continue;}
  // A current bucket is still open; the extra two requested rows are guards.
  if(ts<start||ts+interval>end)continue;
  const long=finite(row?.long_liq_usd_new??row?.long_liq_usd),short=finite(row?.short_liq_usd_new??row?.short_liq_usd),oi=finite(row?.open_interest_usd);
  if(long===null||short===null||long<0||short<0||oi===null||oi<0||seen.has(ts)){invalid++;continue;}
  seen.add(ts);const nonnegative=key=>{const value=finite(row?.[key]);return value!==null&&value>=0?value:null;};
  valid.push({source_ts:ts,long_liquidated_usd:long,short_liquidated_usd:short,open_interest_usd:oi,mark_price:nonnegative('mark_price'),long_users:nonnegative('long_users'),short_users:nonnegative('short_users'),top_long_size_contracts:nonnegative('top_long_size'),top_short_size_contracts:nonnegative('top_short_size'),liquidation_amount_fields:{long:row?.long_liq_usd_new!==undefined?'long_liq_usd_new':'long_liq_usd',short:row?.short_liq_usd_new!==undefined?'short_liq_usd_new':'short_liq_usd'}});
 }
 valid.sort((a,b)=>b.source_ts-a.source_ts);const latest=valid[0],fresh=latest&&now-latest.source_ts<=TTL,complete=invalid===0&&Array.from({length:24},(_,i)=>end-(i+1)*interval).every(ts=>seen.has(ts));
 const total=values=>values.reduce((sum,row)=>({long:sum.long+row.long_liquidated_usd,short:sum.short+row.short_liquidated_usd}),{long:0,short:0}),observed=total(valid),recent=total(valid.filter(row=>row.source_ts>=end-3*interval)),baseline=total(valid.filter(row=>row.source_ts<end-3*interval)),expected=(baseline.long+baseline.short)/21*3;
 return {version:GATE_LIQUIDATION_HISTORY_VERSION,source:'GATE_LIQUIDATION_HISTORY',upstream_id:'GATE_USDT_PERPETUAL',contract,status:fresh&&invalid===0?'CLOSED':'NOT_CLOSED',reason:!fresh?'CURRENT_NATIVE_STATISTICS_REQUIRED':invalid?'INVALID_OR_DUPLICATE_STATISTIC_ROWS':null,source_ts:latest?.source_ts??null,observed_ts:now,unit:'USDT_QUOTE',requested_interval:'5m',native_statistics:latest??null,
  long_liquidated_recent:complete?recent.long:latest?.long_liquidated_usd??null,short_liquidated_recent:complete?recent.short:latest?.short_liquidated_usd??null,recent_window_minutes:complete?15:5,
  intensity_ratio:complete&&expected>0?(recent.long+recent.short)/expected:null,baseline_window_comparable:complete,whole_market_coverage:false,coverage:complete?'ONE_EXACT_GATE_PERPETUAL_120_MINUTES':'ONE_EXACT_GATE_PERPETUAL_STATISTIC',
  history:{status:complete?'CLOSED':'PARTIAL',window_start_ts:start,window_end_ts:end,window_minutes:120,expected_buckets:24,observed_buckets:valid.length,missing_buckets:24-valid.length,closed_intervals_only:true,long_liquidated_observed_usd:observed.long,short_liquidated_observed_usd:observed.short,complete_window:complete,rows:valid},
  positioning:latest?{source_ts:latest.source_ts,mark_price:latest.mark_price,open_interest_usd:latest.open_interest_usd,long_users:latest.long_users,short_users:latest.short_users,top_long_size_contracts:latest.top_long_size_contracts,top_short_size_contracts:latest.top_short_size_contracts}:null,
  equivalent_baseline_replacement:false,event_execution_prices_proven:false,independent_vote_added:false,direction_neutral_context:true,advisory_only:true};
}
export async function collectGateLiquidationHistory({db,fetch_impl=globalThis.fetch,contract,run_id,now=Date.now(),max_http=2}={}){
 const base=String(contract||'').toUpperCase().replace(/-USDT$/,''),symbol=`${base}_USDT`,source='GATE_LIQUIDATION_HISTORY';
 if(!/^[A-Z0-9]{1,32}$/.test(base))return{source,status:'NOT_APPLICABLE',network_calls:0};
 await db.prepare(`CREATE TABLE IF NOT EXISTS report2_gate_contract_identity (symbol TEXT PRIMARY KEY,expires_ts INTEGER NOT NULL,payload_json TEXT NOT NULL)`).run();
 const prior=await db.prepare(`SELECT payload_json FROM report2_gate_contract_identity WHERE symbol=?1 AND expires_ts>?2`).bind(symbol,now).first();let identity=null;try{identity=JSON.parse(prior?.payload_json||'null');}catch{}
 const hadIdentity=Boolean(identity),required=Math.min(identity?1:2,Math.max(0,Math.floor(max_http)));if(required<1)return{source,status:'SKIPPED_HTTP_ENVELOPE',reason:'EXACT_GATE_IDENTITY_AND_STATISTICS_REQUIRE_BUDGET',network_calls:0};
 await installProviderMinuteLedger(db);const grant=await reserveProviderMinuteUnits(db,{provider:'GATE_PUBLIC_STATISTICS',reservation_id:`${run_id}:GATE:${symbol}`,units:required,now,cap:6});
 if(!grant.allowed)return{source,status:'SKIPPED_QUOTA',reason:grant.status,network_calls:0,admission:grant};
 let network_calls=0;const receipts=[];async function get(path){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),9000);network_calls++;try{const response=await fetch_impl(`https://api.gateio.ws/api/v4/futures/usdt/${path}`,{headers:{accept:'application/json'},signal:controller.signal});const payload=await response.json().catch(()=>null);receipts.push({http_status:response.status,path,received_ts:Date.now()});return{ok:response.ok,payload,status:response.status};}catch(error){receipts.push({path,http_status:null,error:String(error.message).slice(0,100)});return{ok:false,payload:null,status:null};}finally{clearTimeout(timer);}}
 if(!identity){const raw=await get(`contracts/${encodeURIComponent(symbol)}`),p=raw.payload;if(!raw.ok||p?.name!==symbol||p?.in_delisting===true||!(finite(p?.quanto_multiplier)>0)||p?.type!=='direct')return{source,status:raw.ok?'SOURCE_UNSUPPORTED':'EXTERNAL_FAILURE',reason:'EXACT_ACTIVE_DIRECT_USDT_CONTRACT_REQUIRED',network_calls,receipts};identity={symbol,type:p.type,quanto_multiplier:Number(p.quanto_multiplier)};await db.prepare(`INSERT INTO report2_gate_contract_identity(symbol,expires_ts,payload_json) VALUES(?1,?2,?3) ON CONFLICT(symbol) DO UPDATE SET expires_ts=excluded.expires_ts,payload_json=excluded.payload_json`).bind(symbol,now+86400_000,JSON.stringify(identity)).run();}
 if(!hadIdentity&&required<2)return{source,status:'IDENTITY_VERIFIED',reason:'STATISTICS_DEFERRED_HTTP_ENVELOPE',native_symbol:symbol,exact_identity:true,identity,network_calls,receipts,admission:grant};
 const raw=await get(`contract_stats?contract=${encodeURIComponent(symbol)}&interval=5m&limit=26`),observed=Math.max(now,...receipts.map(r=>Number(r.received_ts)||now));
 return {...(raw.ok?normalizeGateLiquidationStatistics(raw.payload,{contract,now:observed}):{source,status:'EXTERNAL_FAILURE',reason:`HTTP_${raw.status??'UNKNOWN'}`}),exact_identity:identity.symbol===symbol,native_symbol:symbol,identity,network_calls,receipts,admission:grant,per_minute_operational_cap:6,free_keyless:true};
}
export function formatLiquidationHistoryFacts(risk={}){
 const lines=[],gate=risk.sources?.GATE_LIQUIDATION_HISTORY,coinalyze=risk.sources?.COINALYZE;
 if(gate?.status==='CLOSED'&&gate.exact_identity){const h=gate.history,p=gate.positioning,amount=v=>Number(v).toLocaleString('ru-RU',{maximumFractionDigits:2});
  if(h?.complete_window)lines.push(`Gate ${gate.native_symbol}: за 120 закрытых минут ликвидации Long ${amount(h.long_liquidated_observed_usd)} / Short ${amount(h.short_liquidated_observed_usd)} USDT; 24/24 интервала, только эта площадка.`);
  else if(h?.observed_buckets)lines.push(`Gate ${gate.native_symbol}: получено ${h.observed_buckets}/24 закрытых интервала; наблюдаемые ликвидации Long ${amount(h.long_liquidated_observed_usd)} / Short ${amount(h.short_liquidated_observed_usd)} USDT, история неполная.`);
  if(p?.open_interest_usd!==null&&p?.open_interest_usd!==undefined)lines.push(`Gate: OI ${amount(p.open_interest_usd)} USDT${p.long_users!==null&&p.short_users!==null?`; пользователей Long ${p.long_users} / Short ${p.short_users}`:''}.`);
 }
 if(coinalyze?.status==='CLOSED')lines.push(`Coinalyze: за 15 закрытых минут ликвидации Long ${coinalyze.long_liquidated_recent} / Short ${coinalyze.short_liquidated_recent} USD; ${coinalyze.comparable_symbols.length} проверенных рынков.`);
 else if(coinalyze?.partial_observation?.datapoints)lines.push(`Coinalyze: сохранено ${coinalyze.partial_observation.datapoints} закрытых наблюдений; сопоставимая история неполная.`);
 return lines;
}
