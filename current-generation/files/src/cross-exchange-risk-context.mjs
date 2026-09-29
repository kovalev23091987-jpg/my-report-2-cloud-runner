import {collectGateLiquidationHistory} from './gate-liquidation-history.mjs';
import {normalizeOkxDepthLevel} from './asset-identity-cache.mjs';
import {reserveProviderMinuteUnits} from './provider-minute-ledger.mjs';
export const CROSS_EXCHANGE_RISK_VERSION='cross-exchange-risk-v3-shared-market-catalog-20260930';
const CATALOG_TTL_MS=24*60*60*1000,DEPTH_TTL_MS=30_000,REALIZED_TTL_MS=5*60*1000,HISTORY_TTL_MS=15*60*1000;
const text=v=>String(v??'').trim();
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const baseOf=contract=>text(contract).toUpperCase().replace(/-USDT$/,'');
const validContract=contract=>/^[^-\s]{1,32}-USDT$/u.test(text(contract).toUpperCase());
const hash=value=>{let h=2166136261;for(const ch of String(value)){h^=ch.codePointAt(0);h=Math.imul(h,16777619);}return h>>>0;};
const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));

async function requestJson(fetchImpl,url,{headers={},timeout_ms=9000}={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout_ms);
 try{const response=await fetchImpl(url,{headers:{accept:'application/json','user-agent':'My-Report-2/cross-exchange-risk-v1',...headers},signal:controller.signal});const payload=await response.json().catch(()=>null);return{ok:response.ok,status:response.status,payload,error:response.ok?null:`HTTP_${response.status}`};}
 catch(error){return{ok:false,status:null,payload:null,error:String(error?.name==='AbortError'?'TIMEOUT':error?.message||error).slice(0,160)};}finally{clearTimeout(timer);}
}

export function normalizeCrossExchangeCatalogs({binance,bybit,okx}={}){
 const entries={};const put=(base,venue,symbol,metadata={})=>{if(!base||!symbol)return;Object.assign((entries[base]??={base}),{[venue]:symbol},metadata);};
 for(const row of Array.isArray(binance?.symbols)?binance.symbols:[])if(row?.status==='TRADING'&&row?.contractType==='PERPETUAL'&&row?.quoteAsset==='USDT')put(text(row.baseAsset).toUpperCase(),'binance',text(row.symbol).toUpperCase());
 for(const row of Array.isArray(bybit?.result?.list)?bybit.result.list:[])if(row?.status==='Trading'&&row?.quoteCoin==='USDT'&&String(row?.contractType||'').includes('Perpetual'))put(text(row.baseCoin).toUpperCase(),'bybit',text(row.symbol).toUpperCase());
 for(const row of Array.isArray(okx?.data)?okx.data:[])if(row?.state==='live'&&row?.instType==='SWAP'&&row?.settleCcy==='USDT')put(text(row.ctValCcy||row.instId?.split('-')?.[0]).toUpperCase(),'okx',text(row.instId).toUpperCase(),{okx_contract_value:finite(row.ctVal),okx_contract_multiplier:finite(row.ctMult)??1,okx_contract_value_currency:text(row.ctValCcy).toUpperCase()||null});
 return entries;
}

async function loadVenueCatalog({db,fetch_impl,now}={}){
 await db.prepare(`CREATE TABLE IF NOT EXISTS report2_cross_exchange_catalog (catalog_id TEXT PRIMARY KEY, observed_ts INTEGER NOT NULL, expires_ts INTEGER NOT NULL, payload_json TEXT NOT NULL)`).run();
 const prior=await db.prepare(`SELECT payload_json,observed_ts FROM report2_cross_exchange_catalog WHERE catalog_id='CEX_V1' AND expires_ts>=?1 LIMIT 1`).bind(now).first();
 if(prior){try{return{status:'CLOSED',cache_status:'HIT',network_calls:0,observed_ts:Number(prior.observed_ts),entries:JSON.parse(prior.payload_json)};}catch{}}
 const [binance,bybit,okx]=await Promise.all([
  requestJson(fetch_impl,'https://fapi.binance.com/fapi/v1/exchangeInfo',{timeout_ms:12000}),
  requestJson(fetch_impl,'https://api.bybit.com/v5/market/instruments-info?category=linear&limit=1000',{timeout_ms:12000}),
  requestJson(fetch_impl,'https://www.okx.com/api/v5/public/instruments?instType=SWAP',{timeout_ms:12000}),
 ]);
 const entries=normalizeCrossExchangeCatalogs({binance:binance.ok?binance.payload:null,bybit:bybit.ok?bybit.payload:null,okx:okx.ok?okx.payload:null});
 if(Object.keys(entries).length)await db.prepare(`INSERT INTO report2_cross_exchange_catalog(catalog_id,observed_ts,expires_ts,payload_json) VALUES('CEX_V1',?1,?2,?3) ON CONFLICT(catalog_id) DO UPDATE SET observed_ts=excluded.observed_ts,expires_ts=excluded.expires_ts,payload_json=excluded.payload_json`).bind(now,now+CATALOG_TTL_MS,JSON.stringify(entries)).run();
 return{status:Object.keys(entries).length?'CLOSED':'NOT_CLOSED',cache_status:'REFRESHED',network_calls:3,observed_ts:now,entries,receipts:[['BINANCE',binance],['BYBIT',bybit],['OKX',okx]].map(([source,row])=>({source,status:row.ok?'CLOSED':row.error}))};
}

function depthMetrics(rows,side,referencePrice,{venue,instrument}={}){
 const ref=finite(referencePrice),clean=[];
 for(const row of Array.isArray(rows)?rows:[]){const price=finite(row?.[0]),qty=finite(row?.[1]);if(!price||!qty||price<=0||qty<=0)continue;if(venue==='OKX'){const normalized=normalizeOkxDepthLevel({price,contracts:qty,side,instrument});if(normalized.status==='CLOSED')clean.push({price,notional:normalized.quote_usd,raw_contracts:qty,base_quantity:normalized.base_quantity});}else clean.push({price,notional:price*qty});}
 clean.sort((a,b)=>side==='bid'?b.price-a.price:a.price-b.price);
 const within=pct=>clean.filter(row=>Math.abs((row.price/ref-1)*100)<=pct).reduce((sum,row)=>sum+row.notional,0);
 let cumulative=0,edge=null;for(const row of clean){cumulative+=row.notional;if(cumulative>=25000){edge=row.price;break;}}
 return{notional_1pct:within(1),notional_2pct:within(2),notional_5pct:within(5),usd_25000_slippage_pct:edge===null?null:Math.abs((edge/ref-1)*100),usd_25000_covered:edge!==null,levels:clean.length};
}
export function normalizeCrossExchangeDepth({venue,payload,reference_price,observed_ts,instrument=null,expected_symbol=null}={}){
 let bids=[],asks=[],symbol=null,source_ts=null;
 if(venue==='BINANCE'){bids=payload?.bids;asks=payload?.asks;symbol=payload?.symbol;source_ts=finite(payload?.T??payload?.E);}
 if(venue==='BYBIT'){bids=payload?.result?.b;asks=payload?.result?.a;symbol=payload?.result?.s;source_ts=finite(payload?.ts);}
 if(venue==='OKX'){const row=payload?.data?.[0];bids=row?.bids;asks=row?.asks;symbol=row?.instId;source_ts=finite(row?.ts);}
 const bestBid=finite(bids?.[0]?.[0]),bestAsk=finite(asks?.[0]?.[0]),ref=finite(reference_price),observed=finite(observed_ts),mid=bestBid&&bestAsk?(bestBid+bestAsk)/2:null;
 if(!ref||!mid||!bestBid||!bestAsk||bestBid>=bestAsk||Math.abs((mid/ref-1)*100)>5)return{source:venue,status:'NOT_CLOSED',reason:'PRICE_IDENTITY_MISMATCH_OR_BOOK_EMPTY_OR_CROSSED',symbol:symbol||null,observed_ts};
 if(!symbol||!expected_symbol||text(symbol).toUpperCase()!==text(expected_symbol).toUpperCase())return{source:venue,status:'NOT_CLOSED',reason:'EXACT_MARKET_SYMBOL_MISMATCH',symbol:symbol||null,observed_ts};
 if(source_ts===null||observed===null||source_ts>observed||observed-source_ts>DEPTH_TTL_MS)return{source:venue,status:'NOT_CLOSED',reason:'BOOK_TIMESTAMP_MISSING_STALE_OR_FUTURE',symbol,observed_ts,source_ts};
 const bid=depthMetrics(bids,'bid',ref,{venue,instrument}),ask=depthMetrics(asks,'ask',ref,{venue,instrument}),den=bid.notional_2pct+ask.notional_2pct;
 if(venue==='OKX'&&(!bid.levels||!ask.levels))return{source:venue,status:'NOT_CLOSED',reason:'OKX_UNIT_METADATA_REQUIRED',symbol:symbol||null,observed_ts};
 return{source:venue,status:'CLOSED',symbol,observed_ts,source_ts,valid_until_ts:source_ts+DEPTH_TTL_MS,exact_market_symbol:true,chain_asset_identity:false,mid_price:mid,price_difference_vs_htx_pct:(mid/ref-1)*100,bid,ask,depth_imbalance_2pct:den?(bid.notional_2pct-ask.notional_2pct)/den:0};
}

async function collectDepth({fetch_impl,entry,reference_price,now}={}){
 const calls=[];
 if(entry?.binance)calls.push(['BINANCE',requestJson(fetch_impl,`https://fapi.binance.com/fapi/v1/depth?symbol=${encodeURIComponent(entry.binance)}&limit=100`)]);
 if(entry?.bybit)calls.push(['BYBIT',requestJson(fetch_impl,`https://api.bybit.com/v5/market/orderbook?category=linear&symbol=${encodeURIComponent(entry.bybit)}&limit=50`)]);
 if(entry?.okx)calls.push(['OKX',requestJson(fetch_impl,`https://www.okx.com/api/v5/market/books?instId=${encodeURIComponent(entry.okx)}&sz=50`)]);
  const settled=await Promise.all(calls.slice(0,3).map(async([venue,promise])=>{const raw=await promise;const key=venue.toLowerCase();return raw.ok?normalizeCrossExchangeDepth({venue,payload:raw.payload,reference_price,observed_ts:now,expected_symbol:entry?.[key],instrument:venue==='OKX'?{base:entry.base,contract_value:entry.okx_contract_value,contract_multiplier:entry.okx_contract_multiplier,contract_value_currency:entry.okx_contract_value_currency}:null}):{source:venue,status:'SOURCE_ERROR',error:raw.error,observed_ts:now};}));
 const usable=settled.filter(row=>row.status==='CLOSED'),imbalance=usable.length?usable.reduce((s,row)=>s+row.depth_imbalance_2pct,0)/usable.length:null;
 return{source:'CROSS_EXCHANGE_DEPTH',status:usable.length?'CLOSED':'NOT_CLOSED',observed_ts:now,network_calls:calls.slice(0,3).length,venue_count:usable.length,venues:usable,aggregate_depth_imbalance_2pct:imbalance,independent_venues_notional_not_summed:true,advisory_only:true};
}

function websocketSample({WebSocketImpl,url,subscribe=null,parse,duration_ms}){
 return new Promise(resolve=>{let ws=null,done=false,opened=false;const events=[],finish=(status,error=null)=>{if(done)return;done=true;clearTimeout(timer);try{ws?.close();}catch{}resolve({status,events,error});};const timer=setTimeout(()=>finish(opened?'CLOSED':'NOT_CLOSED',opened?null:'WEBSOCKET_NOT_OPENED'),duration_ms);
  try{ws=new WebSocketImpl(url);ws.addEventListener('open',()=>{opened=true;if(subscribe)ws.send(JSON.stringify(subscribe));});ws.addEventListener('message',event=>{try{const payload=JSON.parse(String(event.data));if(payload?.event==='error'||payload?.success===false||Number(payload?.retCode||0)!==0){finish('SOURCE_ERROR',`SUBSCRIPTION_REJECTED:${text(payload?.code??payload?.retCode??payload?.ret_msg??payload?.msg).slice(0,80)}`);return;}for(const row of parse(payload))if(events.length<100)events.push(row);}catch{}});ws.addEventListener('close',()=>{if(!done)finish('NOT_CLOSED','WEBSOCKET_CLOSED_EARLY');});ws.addEventListener('error',()=>finish('SOURCE_ERROR','WEBSOCKET_ERROR'));}catch(error){finish('SOURCE_ERROR',String(error?.message||error).slice(0,120));}
 });
}
const liqRow=(venue,symbol,side,price,quantity,ts)=>{const p=finite(price),q=finite(quantity);return p&&q?{venue,symbol,liquidated_side:side,price:p,quantity:q,notional_usd:p*q,source_ts:finite(ts)}:null;};
function parseBinance(payload,wanted){const o=payload?.o;if(text(o?.s).toUpperCase()!==wanted)return[];const row=liqRow('BINANCE',wanted,text(o?.S).toUpperCase()==='SELL'?'LONG':'SHORT',o?.ap??o?.p,o?.z??o?.q,o?.T??payload?.E);return row?[row]:[];}
function parseBybit(payload,wanted){return (Array.isArray(payload?.data)?payload.data:[]).filter(r=>text(r?.s).toUpperCase()===wanted).map(r=>liqRow('BYBIT',wanted,text(r?.S).toUpperCase()==='BUY'?'LONG':'SHORT',r?.p,r?.v,r?.T??payload?.ts)).filter(Boolean);}
export function normalizeOkxLiquidationEvents(payload,wanted,entry){const out=[],base=text(wanted).toUpperCase().split('-')[0],ctVal=finite(entry?.okx_contract_value),ctMult=finite(entry?.okx_contract_multiplier)??1,ctCcy=text(entry?.okx_contract_value_currency).toUpperCase();for(const row of Array.isArray(payload?.data)?payload.data:[]){if(text(row?.instId).toUpperCase()!==wanted)continue;for(const d of Array.isArray(row?.details)?row.details:[row]){const position=text(d?.posSide??row?.posSide).toLowerCase(),orderSide=text(d?.side??row?.side).toLowerCase(),side=position==='long'?'LONG':position==='short'?'SHORT':orderSide==='sell'?'LONG':orderSide==='buy'?'SHORT':null,price=finite(d?.bkPx??d?.px??row?.bkPx),contracts=finite(d?.sz??row?.sz);if(!side||!price||!contracts||!ctVal)continue;const value=contracts*ctVal*ctMult,quantity=ctCcy===base?value:['USDT','USDC','USD'].includes(ctCcy)?value/price:null,x=liqRow('OKX',wanted,side,price,quantity,d?.ts??row?.ts);if(x)out.push(x);}}return out;}

async function collectRealized({entry,now,WebSocketImpl=globalThis.WebSocket,duration_ms=6000}={}){
 if(typeof WebSocketImpl!=='function')return{source:'CROSS_EXCHANGE_REALIZED',status:'NOT_CLOSED',reason:'WEBSOCKET_UNAVAILABLE',observed_ts:now,network_connections:0,events:[]};
 const jobs=[];
 if(entry?.binance)jobs.push(websocketSample({WebSocketImpl,url:`wss://fstream.binance.com/market/ws/${entry.binance.toLowerCase()}@forceOrder`,parse:p=>parseBinance(p,entry.binance),duration_ms}));
 if(entry?.bybit)jobs.push(websocketSample({WebSocketImpl,url:'wss://stream.bybit.com/v5/public/linear',subscribe:{op:'subscribe',args:[`allLiquidation.${entry.bybit}`]},parse:p=>parseBybit(p,entry.bybit),duration_ms}));
 if(entry?.okx)jobs.push(websocketSample({WebSocketImpl,url:'wss://ws.okx.com:8443/ws/v5/public',subscribe:{op:'subscribe',args:[{channel:'liquidation-orders',instType:'SWAP'}]},parse:p=>normalizeOkxLiquidationEvents(p,entry.okx,entry),duration_ms}));
 const settled=await Promise.all(jobs.slice(0,3)),events=settled.flatMap(row=>row.events||[]),longUsd=events.filter(r=>r.liquidated_side==='LONG').reduce((s,r)=>s+r.notional_usd,0),shortUsd=events.filter(r=>r.liquidated_side==='SHORT').reduce((s,r)=>s+r.notional_usd,0);
 return{source:'CROSS_EXCHANGE_REALIZED',status:settled.some(r=>r.status==='CLOSED')?'CLOSED':'NOT_CLOSED',observed_ts:now,sample_duration_ms:duration_ms,network_connections:jobs.slice(0,3).length,events,long_liquidated_usd:longUsd,short_liquidated_usd:shortUsd,zero_events_is_valid_sample:true,advisory_only:true};
}

export function normalizeCoinalyzeLiquidationHistory(payload,now,{requested_symbols=[]}={}){
 const rows=Array.isArray(payload)?payload:[],requested=[...new Set(requested_symbols.map(text).filter(Boolean))],interval=5*60_000,end=Math.floor(now/interval)*interval;
 if(!rows.length||!requested.length)return{source:'COINALYZE',status:'NO_DATA',reason:'EMPTY_HISTORY_OR_REQUEST_SET',observed_ts:now,market_count:0,datapoints:0,intensity_ratio:null,advisory_only:true};
 const recentBuckets=Array.from({length:3},(_,i)=>end-(3-i)*interval),baselineBuckets=Array.from({length:21},(_,i)=>end-(24-i)*interval),needed=new Set([...recentBuckets,...baselineBuckets]);
 const bySymbol=new Map(),conflicts=[],conflictKeys=new Set();
 for(const market of rows){const symbol=text(market?.symbol);if(!requested.includes(symbol))continue;const map=bySymbol.get(symbol)??new Map();for(const raw of Array.isArray(market?.history)?market.history:[]){const bucket=finite(raw?.t)*1000,l=finite(raw?.l),s=finite(raw?.s),key=`${symbol}:${bucket}`;if(!Number.isSafeInteger(bucket)||!needed.has(bucket)||bucket+interval>now||l===null||s===null||conflictKeys.has(key))continue;const prior=map.get(bucket);if(prior&&(prior.l!==l||prior.s!==s)){map.delete(bucket);conflicts.push(key);conflictKeys.add(key);continue;}if(!prior)map.set(bucket,{symbol,bucket,l,s});}bySymbol.set(symbol,map);}
 const comparable=[];for(const symbol of requested){const map=bySymbol.get(symbol);if(map&&recentBuckets.every(bucket=>map.has(bucket))&&baselineBuckets.every(bucket=>map.has(bucket)))comparable.push(symbol);}
 if(!comparable.length)return{source:'COINALYZE',status:'PARTIAL',reason:'CLOSED_COMPARABLE_WINDOWS_REQUIRED',observed_ts:now,market_count:rows.length,requested_symbols:requested,comparable_symbols:[],conflicting_duplicates:conflicts,datapoints:[...bySymbol.values()].reduce((sum,map)=>sum+map.size,0),intensity_ratio:null,coverage_fraction:0,advisory_only:true};
 const values=(symbols,buckets)=>symbols.flatMap(symbol=>buckets.map(bucket=>bySymbol.get(symbol).get(bucket)));
 const amounts=set=>set.reduce((a,r)=>({long:a.long+r.l,short:a.short+r.s}),{long:0,short:0}),recent=values(comparable,recentBuckets),baseline=values(comparable,baselineBuckets),a=amounts(recent),b=amounts(baseline),baselinePerBucket=(b.long+b.short)/baselineBuckets.length,expectedRecent=baselinePerBucket*recentBuckets.length,current=a.long+a.short,complete=comparable.length===requested.length&&!conflicts.length;
 return{source:'COINALYZE',status:complete?'CLOSED':'PARTIAL',reason:complete?null:'PARTIAL_MARKET_COVERAGE',observed_ts:now,market_count:rows.length,requested_symbols:requested,comparable_symbols:comparable,datapoints:recent.length+baseline.length,long_liquidated_recent:a.long,short_liquidated_recent:a.short,recent_total:current,baseline_total:b.long+b.short,baseline_bucket_mean:baselinePerBucket,expected_recent_total:expectedRecent,intensity_ratio:expectedRecent>0?current/expectedRecent:null,history_window_minutes:120,recent_window_minutes:15,closed_intervals_only:true,conflicting_duplicates:conflicts,coverage_fraction:comparable.length/requested.length,advisory_only:true};
}
export function compactCoinalyzeMarkets(payload,base){return (Array.isArray(payload)?payload:[]).filter(r=>(!text(base)||text(r?.base_asset).toUpperCase()===text(base).toUpperCase())&&['USDT','USD','USDC'].includes(text(r?.quote_asset).toUpperCase())&&r?.is_perpetual===true).map(r=>({symbol:text(r?.symbol),base_asset:text(r?.base_asset).toUpperCase(),quote_asset:text(r?.quote_asset).toUpperCase(),exchange:text(r?.exchange).toUpperCase(),is_perpetual:true})).filter(r=>r.symbol);}
export async function loadCoinalyzeMarkets({db,fetch_impl,api_key,base,now,run_id}={}){
 await db.prepare(`CREATE TABLE IF NOT EXISTS report2_coinalyze_catalog (catalog_id TEXT PRIMARY KEY, observed_ts INTEGER NOT NULL, expires_ts INTEGER NOT NULL, payload_json TEXT NOT NULL)`).run();
 const catalogId='FUTURES_V3_ALL';
 const prior=await db.prepare(`SELECT payload_json FROM report2_coinalyze_catalog WHERE catalog_id=?1 AND expires_ts>=?2 LIMIT 1`).bind(catalogId,now).first();if(prior){try{return{status:'CLOSED',cache_status:'HIT',network_calls:0,rows:compactCoinalyzeMarkets(JSON.parse(prior.payload_json),base)};}catch{}}
 const admission=await reserveProviderMinuteUnits(db,{provider:'COINALYZE',reservation_id:`${run_id}:CATALOG:${base}`,units:1,now,cap:30});
 if(!admission.allowed)return{status:'DEFERRED_RATE_LIMIT',cache_status:'MISS',network_calls:0,rows:[],error:admission.status,admission};
 const raw=await requestJson(fetch_impl,'https://api.coinalyze.net/v1/future-markets',{headers:{api_key},timeout_ms:12000}),allRows=raw.ok?compactCoinalyzeMarkets(raw.payload):[],rows=compactCoinalyzeMarkets(allRows,base);
 if(allRows.length)await db.prepare(`INSERT INTO report2_coinalyze_catalog(catalog_id,observed_ts,expires_ts,payload_json) VALUES(?1,?2,?3,?4) ON CONFLICT(catalog_id) DO UPDATE SET observed_ts=excluded.observed_ts,expires_ts=excluded.expires_ts,payload_json=excluded.payload_json`).bind(catalogId,now,now+CATALOG_TTL_MS,JSON.stringify(allRows)).run();
 return{status:rows.length?'CLOSED':'NOT_CLOSED',cache_status:'REFRESHED',network_calls:1,rows,error:raw.error,admission};
}
async function collectCoinalyzeHistory({db,fetch_impl,api_key,base,now,run_id}={}){
 if(!text(api_key))return{source:'COINALYZE',status:'DISABLED',reason:'API_KEY_REQUIRED',network_calls:0,observed_ts:now};
 const catalog=await loadCoinalyzeMarkets({db,fetch_impl,api_key,base,now,run_id});
 const preferred=['HUOBI','BINANCE','BYBIT','OKX','GATE'],rank=exchange=>{const i=preferred.indexOf(text(exchange).toUpperCase());return i<0?preferred.length:i;},markets=catalog.rows.filter(r=>text(r?.base_asset).toUpperCase()===base&&['USDT','USD','USDC'].includes(text(r?.quote_asset).toUpperCase())&&r?.is_perpetual===true).sort((a,b)=>rank(a.exchange)-rank(b.exchange)).slice(0,4),symbols=markets.map(r=>r.symbol).filter(Boolean);
 if(!symbols.length)return{source:'COINALYZE',status:'NOT_CLOSED',reason:'NO_EXACT_FUTURES_MARKETS',network_calls:catalog.network_calls,provider_call_units:catalog.network_calls,observed_ts:now};
 const admission=await reserveProviderMinuteUnits(db,{provider:'COINALYZE',reservation_id:`${run_id}:HISTORY:${base}:${symbols.join(',')}`,units:symbols.length,now,cap:30});
 if(!admission.allowed)return{source:'COINALYZE',status:'DEFERRED_RATE_LIMIT',reason:admission.status,network_calls:catalog.network_calls,provider_call_units:catalog.network_calls,observed_ts:now,admission};
 const to=Math.floor(now/(5*60_000))*5*60,from=to-24*5*60,url=`https://api.coinalyze.net/v1/liquidation-history?symbols=${encodeURIComponent(symbols.join(','))}&interval=5min&from=${from}&to=${to}&convert_to_usd=true`,raw=await requestJson(fetch_impl,url,{headers:{api_key},timeout_ms:12000});
 const networkCalls=catalog.network_calls+1,providerUnits=symbols.length+catalog.network_calls;
 return raw.ok?{...normalizeCoinalyzeLiquidationHistory(raw.payload,now,{requested_symbols:symbols}),network_calls:networkCalls,provider_call_units:providerUnits,symbols,catalog_cache_status:catalog.cache_status,admission}:{source:'COINALYZE',status:'SOURCE_ERROR',error:raw.error,network_calls:networkCalls,provider_call_units:providerUnits,observed_ts:now,admission};
}

async function collectHistory(params={}){
 const first=await collectCoinalyzeHistory(params),used=Number(first.network_calls)||0;
 if(first.status==='CLOSED')return first;
 const fallback=await collectGateLiquidationHistory({...params,contract:`${params.base}-USDT`,max_http:Math.max(0,3-used)});
 return {...fallback,network_calls:used+Number(fallback.network_calls||0),fallback_from:{source:'COINALYZE',status:first.status,reason:first.reason??first.error??null,network_calls:used},equivalent_baseline_replacement:false};
}

async function loadCached(db,contract,now){const result=await db.prepare(`SELECT source,payload_json FROM report2_cross_exchange_risk_cache WHERE contract_code=?1 AND expires_ts>=?2`).bind(contract,now).all(),sources={};for(const row of result?.results||[]){try{sources[row.source]=JSON.parse(row.payload_json);}catch{}}return sources;}
async function loadPermittedCached(db,contract,now,allowed_lanes){const sources=await loadCached(db,contract,now);if(!Array.isArray(allowed_lanes))return sources;const allowed=new Set(allowed_lanes.flatMap(lane=>lane==='REALIZED'?['CROSS_EXCHANGE_REALIZED']:lane==='HISTORY'?['COINALYZE','GATE_LIQUIDATION_HISTORY']:lane==='DEPTH'?['CROSS_EXCHANGE_DEPTH']:[]));return Object.fromEntries(Object.entries(sources).filter(([source])=>allowed.has(source)));}
async function saveCached(db,contract,source,payload,now,ttl){await db.prepare(`INSERT INTO report2_cross_exchange_risk_cache(contract_code,source,observed_ts,expires_ts,payload_json) VALUES(?1,?2,?3,?4,?5) ON CONFLICT(contract_code,source) DO UPDATE SET observed_ts=excluded.observed_ts,expires_ts=excluded.expires_ts,payload_json=excluded.payload_json`).bind(contract,source,now,now+ttl,JSON.stringify(payload)).run();}

export async function collectCrossExchangeRiskContext({db,fetch_impl=globalThis.fetch,WebSocketImpl=globalThis.WebSocket,contract,run_id,reference_price,coinalyze_api_key='',lane_override='',allowed_lanes=null,now=Date.now(),realized_sample_ms=6000}={}){
 if(!db)throw new Error('CROSS_EXCHANGE_DB_REQUIRED');const normalized=text(contract).toUpperCase(),base=baseOf(normalized);if(!validContract(normalized))return{version:CROSS_EXCHANGE_RISK_VERSION,status:'NOT_CLOSED',reason:'CONTRACT_INVALID',sources:{},network_calls:0};
 await db.prepare(`CREATE TABLE IF NOT EXISTS report2_cross_exchange_risk_cache (contract_code TEXT NOT NULL, source TEXT NOT NULL, observed_ts INTEGER NOT NULL, expires_ts INTEGER NOT NULL, payload_json TEXT NOT NULL, PRIMARY KEY(contract_code,source))`).run();
 const catalog=await loadVenueCatalog({db,fetch_impl,now}),entry=catalog.entries?.[base]||null;if(catalog.network_calls>0)return{version:CROSS_EXCHANGE_RISK_VERSION,status:'CATALOG_REFRESHED',contract:normalized,lane:'VENUE_CATALOG',network_calls:catalog.network_calls,sources:await loadPermittedCached(db,normalized,now,allowed_lanes),receipts:catalog.receipts||[],internal_only:true};
 const availableLanes=['DEPTH','REALIZED'];availableLanes.push('HISTORY');
 const lanes=Array.isArray(allowed_lanes)?availableLanes.filter(name=>allowed_lanes.includes(name)):availableLanes;
 if(!lanes.length)return{version:CROSS_EXCHANGE_RISK_VERSION,status:'NO_LIQUIDATION_LANE',contract:normalized,network_calls:0,sources:await loadPermittedCached(db,normalized,now,allowed_lanes),internal_only:true};
 const requestedLane=text(lane_override).toUpperCase(),lane=lanes.includes(requestedLane)?requestedLane:lanes[hash(`${run_id}:${normalized}:CEX_V1`)%lanes.length];let payload,ttl;
 if(lane==='DEPTH'){payload=await collectDepth({fetch_impl,entry,reference_price,now});ttl=DEPTH_TTL_MS;}
 if(lane==='REALIZED'){payload=await collectRealized({entry,now,WebSocketImpl,duration_ms:realized_sample_ms});ttl=REALIZED_TTL_MS;}
 if(lane==='HISTORY'){payload=await collectHistory({db,fetch_impl,api_key:coinalyze_api_key,base,now,run_id});ttl=HISTORY_TTL_MS;}
 if(payload&&payload.source&&payload.status==='CLOSED')await saveCached(db,normalized,payload.source,payload,now,ttl);
 const sources=await loadPermittedCached(db,normalized,now,allowed_lanes),statuses=Object.values(sources).map(x=>x.status);
 return{version:CROSS_EXCHANGE_RISK_VERSION,status:statuses.includes('CLOSED')?'CLOSED':'NOT_CLOSED',contract:normalized,identity:'EXACT_LISTED_MARKET_SYMBOL_WITH_PRICE_CROSSCHECK',lane,lane_forced:lanes.includes(requestedLane),network_calls:Number(payload?.network_calls??payload?.network_connections??0),provider_call_units:payload?.provider_call_units??null,sources,receipts:[{source:payload?.source||lane,status:payload?.status||'NOT_CLOSED'}],internal_only:true,automatic_execution:false};
}

export default{CROSS_EXCHANGE_RISK_VERSION,normalizeCrossExchangeCatalogs,normalizeCrossExchangeDepth,normalizeOkxLiquidationEvents,normalizeCoinalyzeLiquidationHistory,compactCoinalyzeMarkets,collectCrossExchangeRiskContext};
