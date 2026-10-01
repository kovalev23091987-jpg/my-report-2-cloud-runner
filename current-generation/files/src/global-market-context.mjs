export const GLOBAL_MARKET_CONTEXT_VERSION='global-market-context-v1-20260927';
export const DERIBIT_TTL_MS=60*60*1000;
// The public keyless endpoints do not publish a numeric IP allowance.  A
// thirty-minute shared cache bounds production to 48 refreshes/day even when
// scheduled and manual runs happen close together.
export const COINLOBSTER_TTL_MS=30*60*1000;
const DERIBIT_URL='https://www.deribit.com/api/v2';
const COINLOBSTER_URL='https://coinlobster.com';
const finite=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;};
const ratio=(a,b)=>finite(a)!==null&&finite(b)!==null&&Number(b)>0?Number(a)/Number(b):null;
const percent=(a,b)=>finite(a)!==null&&finite(b)!==null&&Number(a)!==0?((Number(b)/Number(a))-1)*100:null;
const optionSide=name=>String(name||'').toUpperCase().endsWith('-P')?'PUT':String(name||'').toUpperCase().endsWith('-C')?'CALL':null;

function dvolView(raw,currency){
 const rows=Array.isArray(raw?.result?.data)?raw.result.data.filter(x=>Array.isArray(x)&&x.length>=5):[];
 const first=rows[0],last=rows[rows.length-1];
 const firstClose=finite(first?.[4]),lastClose=finite(last?.[4]);
 return {currency,status:rows.length&&lastClose!==null?'CLOSED':'NOT_CLOSED',points:rows.length,first_ts:finite(first?.[0]),last_ts:finite(last?.[0]),dvol:lastClose,change_24h_pct:percent(firstClose,lastClose)};
}

function optionsView(raw,currency){
 const rows=Array.isArray(raw?.result)?raw.result:[];
 const totals={PUT:{open_interest:0,volume:0,count:0},CALL:{open_interest:0,volume:0,count:0}};
 for(const row of rows){const side=optionSide(row?.instrument_name);if(!side)continue;totals[side].count+=1;totals[side].open_interest+=finite(row?.open_interest)??0;totals[side].volume+=finite(row?.volume)??0;}
 const count=totals.PUT.count+totals.CALL.count;
 return {currency,status:count?'CLOSED':'NOT_CLOSED',instrument_count:count,put_open_interest:totals.PUT.open_interest,call_open_interest:totals.CALL.open_interest,put_call_oi_ratio:ratio(totals.PUT.open_interest,totals.CALL.open_interest),put_volume:totals.PUT.volume,call_volume:totals.CALL.volume,put_call_volume_ratio:ratio(totals.PUT.volume,totals.CALL.volume)};
}

export function normalizeDeribitMarketContext({btc_dvol,eth_dvol,btc_options,eth_options,observed_ts=Date.now()}={}){
 const btcDvol=dvolView(btc_dvol,'BTC'),ethDvol=dvolView(eth_dvol,'ETH');
 const btcOptions=optionsView(btc_options,'BTC'),ethOptions=optionsView(eth_options,'ETH');
 const closed=[btcDvol,ethDvol,btcOptions,ethOptions].every(x=>x.status==='CLOSED');
 const riskOff=[btcDvol,ethDvol].some(x=>(x.dvol??0)>=80||(x.change_24h_pct??0)>=15)||[btcOptions,ethOptions].some(x=>(x.put_call_oi_ratio??0)>=1.2);
 const supportive=[btcDvol,ethDvol].every(x=>x.change_24h_pct!==null&&x.change_24h_pct<=-5)&&[btcOptions,ethOptions].every(x=>x.put_call_oi_ratio!==null&&x.put_call_oi_ratio<1);
 return {source:'DERIBIT',version:GLOBAL_MARKET_CONTEXT_VERSION,status:closed?'CLOSED':'PARTIAL',observed_ts,ttl_ms:DERIBIT_TTL_MS,market_regime:riskOff?'RISK_OFF_ELEVATED':supportive?'RISK_ON_SUPPORTIVE':'MIXED_OR_NEUTRAL',btc:{dvol:btcDvol,options:btcOptions},eth:{dvol:ethDvol,options:ethOptions},advisory_only:true,directional_vote:false,hard_gate:false,internal_only:true};
}

export function normalizeCoinLobsterContext({whale_radar,liquidations,observed_ts=Date.now()}={}){
 const pick=(payload,paths)=>{for(const path of paths){let value=payload;for(const key of path.split('.'))value=value?.[key];if(Array.isArray(value))return{rows:value,path};}return{rows:[],path:null};};
 const radar=pick(whale_radar,['data','data.coins','data.rows','data.items','data.radar','coins','rows','items','radar','results']);
 const liq=pick(liquidations,['perp_liquidations.top_coins','data','data.top_coins','data.topCoins','data.coins','data.rows','data.items','data.liquidations','top_coins','topCoins','coins','rows','items','liquidations','results']);
 const named=pick(liquidations,['named_liquidations']);
 const liquidationCurrent=liquidations?.available!==false&&liquidations?.stale!==true;
 const response_shapes={whale_radar_keys:whale_radar&&typeof whale_radar==='object'?Object.keys(whale_radar).slice(0,20):[],whale_radar_data_keys:whale_radar?.data&&typeof whale_radar.data==='object'&&!Array.isArray(whale_radar.data)?Object.keys(whale_radar.data).slice(0,20):[],liquidations_keys:liquidations&&typeof liquidations==='object'?Object.keys(liquidations).slice(0,20):[],liquidations_data_keys:liquidations?.data&&typeof liquidations.data==='object'&&!Array.isArray(liquidations.data)?Object.keys(liquidations.data).slice(0,20):[]};
 return {source:'COINLOBSTER',version:GLOBAL_MARKET_CONTEXT_VERSION,status:(radar.rows.length||liquidationCurrent&&(liq.rows.length||named.rows.length))?'CLOSED':'NOT_CLOSED',observed_ts,ttl_ms:COINLOBSTER_TTL_MS,whale_radar:radar.rows.slice(0,250),realized_liquidations:liquidationCurrent?liq.rows.slice(0,250):[],named_liquidations:liquidationCurrent?named.rows.slice(0,250):[],radar_array_path:radar.path,liquidations_array_path:liq.path,named_liquidations_array_path:named.path,liquidations_current:liquidationCurrent,response_shapes,advisory_only:true,directional_vote:false,hard_gate:false,internal_only:true};
}

async function jsonFetch(fetchImpl,url,init={},timeoutMs=12000){
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{const response=await fetchImpl(url,{...init,signal:controller.signal,headers:{accept:'application/json','user-agent':'My-Report-2/market-context-v1',...(init.headers||{})}});const body=await response.json().catch(()=>null);if(!response.ok)throw new Error(`HTTP_${response.status}`);return body;}
 finally{clearTimeout(timer);}
}

async function deribitRpc(fetchImpl,method,params,id){return jsonFetch(fetchImpl,DERIBIT_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id,method,params})});}

export async function fetchDeribitMarketContext({fetch_impl=globalThis.fetch,now=Date.now()}={}){
 const start=now-24*60*60*1000;
 const btc_dvol=await deribitRpc(fetch_impl,'public/get_volatility_index_data',{currency:'BTC',start_timestamp:start,end_timestamp:now,resolution:'3600'},1);
 const eth_dvol=await deribitRpc(fetch_impl,'public/get_volatility_index_data',{currency:'ETH',start_timestamp:start,end_timestamp:now,resolution:'3600'},2);
 const btc_options=await deribitRpc(fetch_impl,'public/get_book_summary_by_currency',{currency:'BTC',kind:'option'},3);
 const eth_options=await deribitRpc(fetch_impl,'public/get_book_summary_by_currency',{currency:'ETH',kind:'option'},4);
 return normalizeDeribitMarketContext({btc_dvol,eth_dvol,btc_options,eth_options,observed_ts:now});
}

export async function fetchCoinLobsterContext({fetch_impl=globalThis.fetch,now=Date.now()}={}){
 const whale_radar=await jsonFetch(fetch_impl,`${COINLOBSTER_URL}/api/public/whale-radar?window=4h`);
 const liquidations=await jsonFetch(fetch_impl,`${COINLOBSTER_URL}/api/public/liquidations`);
 return normalizeCoinLobsterContext({whale_radar,liquidations,observed_ts:now});
}

export async function fetchCoinLobsterLiquidations({fetch_impl=globalThis.fetch,now=Date.now()}={}){
 const liquidations=await jsonFetch(fetch_impl,`${COINLOBSTER_URL}/api/public/liquidations`);
 return normalizeCoinLobsterContext({liquidations,observed_ts:now});
}

export function contextForContract(context,contract){
 const base=String(contract||'').toUpperCase().replace(/[-_/]?(USDT|USD|USDC|PERP)$/,'');
 const matches=row=>String(row?.base??row?.coin??row?.symbol??row?.asset??row?.ticker??'').toUpperCase().replace(/[-_/]?(USDT|USD|USDC|PERP)$/,'')===base;
 const coinlobster=context?.coinlobster;
 return {version:GLOBAL_MARKET_CONTEXT_VERSION,observed_ts:context?.observed_ts??null,deribit:context?.deribit??null,coinlobster:coinlobster?{...coinlobster,whale_radar:(coinlobster.whale_radar||[]).filter(matches).slice(0,8),realized_liquidations:(coinlobster.realized_liquidations||[]).filter(matches).slice(0,8),named_liquidations:(coinlobster.named_liquidations||[]).filter(matches).slice(0,8)}:null,internal_only:true};
}

export async function loadGlobalMarketContext({db,fetch_impl=globalThis.fetch,now=Date.now(),liquidation_only=false,strict_fresh_manual=false}={}){
 if(!db)throw new Error('GLOBAL_CONTEXT_DB_REQUIRED');
 await db.prepare(`CREATE TABLE IF NOT EXISTS report2_global_source_cache (source TEXT PRIMARY KEY, observed_ts INTEGER NOT NULL, expires_ts INTEGER NOT NULL, payload_json TEXT NOT NULL, status TEXT NOT NULL)`).run();
 async function cached(source,ttl,loader){
  const row=await db.prepare(`SELECT observed_ts,expires_ts,payload_json,status FROM report2_global_source_cache WHERE source=?1 LIMIT 1`).bind(source).first();
  if(!strict_fresh_manual&&row&&Number(row.expires_ts)>now){try{return {...JSON.parse(row.payload_json),cache_status:'HIT',network_calls:0};}catch{}}
  try{const payload=await loader();await db.prepare(`INSERT INTO report2_global_source_cache(source,observed_ts,expires_ts,payload_json,status) VALUES(?1,?2,?3,?4,?5) ON CONFLICT(source) DO UPDATE SET observed_ts=excluded.observed_ts,expires_ts=excluded.expires_ts,payload_json=excluded.payload_json,status=excluded.status`).bind(source,now,now+ttl,JSON.stringify(payload),payload.status||'CLOSED').run();return {...payload,cache_status:'REFRESHED',network_calls:Math.max(1,Number(payload?.network_calls)||0)};}
  catch(error){if(row){try{return {...JSON.parse(row.payload_json),status:'STALE_FALLBACK',cache_status:'STALE_FALLBACK',refresh_error:String(error?.message||error)};}catch{}}return {source,status:'SOURCE_ERROR',observed_ts:now,cache_status:'MISS_FAILED',error:String(error?.message||error),internal_only:true};}
 }
 const deribit=liquidation_only?{status:'NOT_APPLICABLE_LIQUIDATION_ONLY',internal_only:true}:await cached('DERIBIT',DERIBIT_TTL_MS,()=>fetchDeribitMarketContext({fetch_impl,now}));
 const coinlobster=liquidation_only
  ?await cached('COINLOBSTER_LIQUIDATIONS_V2',COINLOBSTER_TTL_MS,()=>fetchCoinLobsterLiquidations({fetch_impl,now}))
  :await cached('COINLOBSTER',COINLOBSTER_TTL_MS,()=>fetchCoinLobsterContext({fetch_impl,now}));
 return {version:GLOBAL_MARKET_CONTEXT_VERSION,status:[deribit,coinlobster].some(x=>x.status==='CLOSED')?'CLOSED':'NOT_CLOSED',observed_ts:now,deribit,coinlobster,internal_only:true};
}

export default{GLOBAL_MARKET_CONTEXT_VERSION,normalizeDeribitMarketContext,normalizeCoinLobsterContext,fetchDeribitMarketContext,fetchCoinLobsterContext,loadGlobalMarketContext,contextForContract};
