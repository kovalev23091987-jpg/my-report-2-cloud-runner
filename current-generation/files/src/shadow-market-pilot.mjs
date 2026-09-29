import crypto from 'node:crypto';

export const SHADOW_MARKET_SOURCE_REGISTRY=Object.freeze({
 KRAKEN_FUTURES:Object.freeze({provider_id:'KRAKEN_FUTURES',endpoint_id:'DERIVATIVES_V3_TICKERS',upstream_group:'KRAKEN_DERIVATIVES',mode:'SHADOW',optional:true,can_authorize_entry:false,can_create_hard_veto:false,request_cost:2,max_age_ms:20*60_000,urls:Object.freeze(['https://futures.kraken.com/derivatives/api/v3/instruments','https://futures.kraken.com/derivatives/api/v3/tickers'])}),
 DYDX_INDEXER:Object.freeze({provider_id:'DYDX_INDEXER',endpoint_id:'V4_PERPETUAL_MARKETS',upstream_group:'DYDX_CHAIN_INDEXER',mode:'SHADOW',optional:true,can_authorize_entry:false,can_create_hard_veto:false,request_cost:1,max_age_ms:20*60_000,urls:Object.freeze(['https://indexer.dydx.trade/v4/perpetualMarkets'])}),
});
const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value):null;
const text=value=>String(value??'').trim();
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const isoTime=value=>{const parsed=Date.parse(text(value));return Number.isFinite(parsed)?parsed:null;};

export function parseKrakenShadowSnapshot({tickers_payload,instruments_payload,received_at,identity_map={}}={}){
 const fail=reason=>({provider_id:'KRAKEN_FUTURES',status:'NOT_CLOSED',reason,markets:[],mode:'SHADOW',entry_eligible:false});
 if(tickers_payload?.result!=='success'||!Array.isArray(tickers_payload?.tickers)||instruments_payload?.result!=='success'||!Array.isArray(instruments_payload?.instruments))return fail('INVALID_RESPONSE');
 const serverTime=isoTime(tickers_payload.serverTime);if(serverTime===null)return fail('SERVER_TIME_INVALID');
 const instruments=new Map();for(const row of instruments_payload.instruments){const symbol=text(row?.symbol);if(!symbol||instruments.has(symbol))return fail('INSTRUMENT_DUPLICATE_OR_EMPTY');instruments.set(symbol,row);}
 const markets=[];for(const [htxBase,exactSymbolRaw] of Object.entries(identity_map||{})){
  const exactSymbol=text(exactSymbolRaw),instrument=instruments.get(exactSymbol),ticker=tickers_payload.tickers.find(row=>text(row?.symbol)===exactSymbol);if(!instrument||!ticker)continue;
  if(instrument.type!=='flexible_futures'||instrument.tradeable!==true||instrument.suspended===true||ticker.suspended===true)continue;
  const openInterest=finite(ticker.openInterest),fundingRate=finite(ticker.fundingRate),fundingRatePrediction=finite(ticker.fundingRatePrediction),markPrice=finite(ticker.markPrice),indexPrice=finite(ticker.indexPrice),volumeQuote=finite(ticker.volumeQuote??ticker.volume);
  if(openInterest===null||openInterest<0||fundingRate===null||fundingRatePrediction===null||markPrice===null||markPrice<=0||indexPrice===null||indexPrice<=0||volumeQuote===null||volumeQuote<0)continue;
  markets.push({htx_base:text(htxBase).toUpperCase(),native_symbol:exactSymbol,instrument_type:'FLEXIBLE_FUTURES_EXACT',open_interest_native:openInterest,funding_rate_native:fundingRate,funding_rate_prediction_native:fundingRatePrediction,mark_price_native:markPrice,index_price_native:indexPrice,quote_volume_native:volumeQuote,server_time:serverTime,last_trade_time:isoTime(ticker.lastTime),oi_source_ts:null,received_at,timestamp_basis:'SERVER_RESPONSE_TIME_NOT_OI_EVENT_TIME',units_unconverted:true});
 }
 return{provider_id:'KRAKEN_FUTURES',status:'CLOSED',mode:'SHADOW',markets,server_time:serverTime,received_at,entry_eligible:false,independent_vote_added:false};
}

export function parseDydxShadowSnapshot({payload,received_at,identity_map={}}={}){
 const fail=reason=>({provider_id:'DYDX_INDEXER',status:'NOT_CLOSED',reason,markets:[],mode:'SHADOW',entry_eligible:false});
 if(!payload||typeof payload!=='object'||Array.isArray(payload)||!payload.markets||typeof payload.markets!=='object'||Array.isArray(payload.markets))return fail('INVALID_RESPONSE');
 const markets=[];for(const [htxBase,exactTickerRaw] of Object.entries(identity_map||{})){
  const exactTicker=text(exactTickerRaw),row=payload.markets[exactTicker];if(!row||text(row.ticker)!==exactTicker||text(row.status).toUpperCase()!=='ACTIVE')continue;
  const openInterest=finite(row.openInterest),oraclePrice=finite(row.oraclePrice),volume24H=finite(row.volume24H),nextFundingRate=finite(row.nextFundingRate);
  if(openInterest===null||openInterest<0||oraclePrice===null||oraclePrice<=0||volume24H===null||volume24H<0||nextFundingRate===null)continue;
  markets.push({htx_base:text(htxBase).toUpperCase(),native_ticker:exactTicker,instrument_type:'PERPETUAL',open_interest_native:openInterest,oracle_price_native:oraclePrice,volume_24h_native:volume24H,next_funding_rate_native:nextFundingRate,received_at,source_ts:null,timestamp_basis:'HTTP_RECEIPT_ONLY_NO_METRIC_EVENT_TIME',units_unconverted:true,expected_funding_not_realized:true});
 }
 return{provider_id:'DYDX_INDEXER',status:'CLOSED',mode:'SHADOW',markets,received_at,entry_eligible:false,independent_vote_added:false};
}

async function fetchJson(url,{fetch_impl,clock}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000),started=clock();
 try{
  const response=await fetch_impl(url,{headers:{accept:'application/json','user-agent':'My-Report-2/shadow-market-pilot-v1'},signal:controller.signal,redirect:'error'}),declared=Number(response.headers?.get?.('content-length')||0);if(declared>2*1024*1024)return{ok:false,status:'BODY_TOO_LARGE',http_status:response.status,started_ts:started,received_ts:clock()};
  const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>2*1024*1024)return{ok:false,status:'BODY_TOO_LARGE',http_status:response.status,started_ts:started,received_ts:clock(),bytes:bytes.length};
  const received=clock();if(!response.ok)return{ok:false,status:response.status===429?'RATE_LIMITED_429':response.status>=500?'UPSTREAM_5XX':response.status===401||response.status===403?'ACCESS_DENIED':'HTTP_ERROR',http_status:response.status,started_ts:started,received_ts:received,bytes:bytes.length,payload_hash:hash(bytes)};
  let payload;try{payload=JSON.parse(bytes.toString('utf8'));}catch{return{ok:false,status:'INVALID_RESPONSE',http_status:response.status,started_ts:started,received_ts:received,bytes:bytes.length,payload_hash:hash(bytes)};}
  return{ok:true,status:'CLOSED',http_status:response.status,started_ts:started,received_ts:received,bytes:bytes.length,payload_hash:hash(bytes),payload};
 }catch(error){return{ok:false,status:error?.name==='AbortError'?'TIMEOUT':'NETWORK_ERROR',http_status:null,started_ts:started,received_ts:clock(),error:text(error?.message).slice(0,120)};}finally{clearTimeout(timer);}
}

export function createShadowMarketPilot({fetch_impl=globalThis.fetch,admit,clock=Date.now}={}){
 const cache=new Map(),health=[];
 async function collect({provider_id,run_id,identity_map={}}={}){
  const source=SHADOW_MARKET_SOURCE_REGISTRY[provider_id];if(!source)return{status:'SOURCE_NOT_REGISTERED',mode:'SHADOW'};
  const cacheKey=`${run_id}:${provider_id}`;if(cache.has(cacheKey))return cache.get(cacheKey);
  const promise=(async()=>{
   const grant=typeof admit==='function'?await admit({reservation_id:`SHADOW_MARKET:${run_id}:${provider_id}`,provider_id,requests:source.request_cost,mode:'SHADOW'}):{allowed:false,reason:'ADMISSION_REQUIRED'};
   if(grant?.allowed!==true){const out={provider_id,status:'NOT_SELECTED_CAPACITY',attempted_http_count:0,failure_origin:'INTERNAL_SCHEDULER',mode:'SHADOW',entry_eligible:false};health.push(out);return out;}
   const receipts=[];for(const url of source.urls)receipts.push(await fetchJson(url,{fetch_impl,clock}));
   const failed=receipts.find(row=>!row.ok);if(failed){const out={provider_id,status:failed.status,attempted_http_count:receipts.length,transport_status:failed.status,failure_origin:'PROVIDER_OR_NETWORK',receipts,mode:'SHADOW',entry_eligible:false};health.push(out);return out;}
   const received=Math.max(...receipts.map(row=>row.received_ts)),parsed=provider_id==='KRAKEN_FUTURES'?parseKrakenShadowSnapshot({instruments_payload:receipts[0].payload,tickers_payload:receipts[1].payload,received_at:received,identity_map}):parseDydxShadowSnapshot({payload:receipts[0].payload,received_at:received,identity_map});
   const out={...parsed,attempted_http_count:receipts.length,transport_status:'CLOSED',schema_status:parsed.status==='CLOSED'?'CLOSED':'INVALID',coverage_status:parsed.markets?.length?'MAPPED':'UNSUPPORTED_OR_UNMAPPED',failure_origin:parsed.status==='CLOSED'?null:'SCHEMA',receipts:receipts.map(({payload,...receipt})=>receipt)};health.push(out);return out;
  })();cache.set(cacheKey,promise);return promise;
 }
 return{collect,summary:()=>({mode:'SHADOW',cache_entries:cache.size,health:[...health],score_changed:false,delivery_changed:false,entry_authorization:false})};
}

export default{SHADOW_MARKET_SOURCE_REGISTRY,parseKrakenShadowSnapshot,parseDydxShadowSnapshot,createShadowMarketPilot};
