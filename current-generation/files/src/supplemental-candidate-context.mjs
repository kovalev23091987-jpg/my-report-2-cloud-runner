export const SUPPLEMENTAL_CANDIDATE_CONTEXT_VERSION='supplemental-candidate-context-v1-20260927';
const TTL_MS=60*60*1000;
const clean=v=>String(v??'').trim();
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const baseOf=contract=>clean(contract).toUpperCase().replace(/[-_/]?(USDT|USD|USDC|PERP)$/,'');
const EVM=/^0x[0-9a-f]{40}$/i,BASE58=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const chainId=chain=>({ethereum:'1',bsc:'56',arbitrum:'42161',base:'8453',polygon:'137',optimism:'10',avalanche:'43114'}[clean(chain).toLowerCase()]||null);
const geckoNetwork=chain=>({ethereum:'eth',bsc:'bsc',arbitrum:'arbitrum',base:'base',polygon:'polygon_pos',optimism:'optimism',avalanche:'avax',solana:'solana'}[clean(chain).toLowerCase()]||null);
const exactIdentity=row=>{
 const chain=clean(row?.chain).toLowerCase(),address=clean(row?.contract_or_mint);
 if(!chain||!address)return null;
 if(chain==='solana'?!BASE58.test(address):!EVM.test(address))return null;
 return {chain,contract_or_mint:chain==='solana'?address:address.toLowerCase()};
};

export function parseSupplementalIdentityRegistry(raw){
 let parsed=raw;
 if(typeof raw==='string'){try{parsed=JSON.parse(raw);}catch{return {status:'NOT_CLOSED',reason:'REGISTRY_JSON_INVALID',entries:{}};}}
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return {status:'NOT_CLOSED',reason:'REGISTRY_OBJECT_REQUIRED',entries:{}};
 const entries={};
 for(const [symbol,value] of Object.entries(parsed)){
  const base=baseOf(symbol);if(!base||!value||typeof value!=='object')continue;
  const identity=exactIdentity(value);
  const lighterMarket=Number(value.lighter_market_id),gmxMarket=clean(value.gmx_market_address).toLowerCase();
  entries[base]={base,identity,protocol_slug:clean(value.protocol_slug)||null,coinbase_product:clean(value.coinbase_product).toUpperCase()||null,
   lighter_market_id:Number.isSafeInteger(lighterMarket)&&lighterMarket>=0?lighterMarket:null,gmx_market_address:EVM.test(gmxMarket)?gmxMarket:null};
 }
 return {status:Object.keys(entries).length?'CLOSED':'NOT_CLOSED',reason:Object.keys(entries).length?null:'REGISTRY_EMPTY',entries};
}

function hashLane(value){let h=2166136261;for(const ch of clean(value)){h^=ch.codePointAt(0);h=Math.imul(h,16777619);}return Math.abs(h)>>>0;}
export function chooseSupplementalLane({run_id,contract,entry,derivatives_venues=0,critical_conflict=false}={}){
 const available=[];
 if(entry?.identity)available.push('DEX_RISK');
 if(entry?.protocol_slug)available.push('PROTOCOL');
 if(Number(derivatives_venues)<2||critical_conflict===true)available.push('BITGET_FALLBACK');
 if(entry?.coinbase_product)available.push('COINBASE_SPOT');
 if(!available.length)return null;
 return available[hashLane(`${run_id}:${contract}`)%available.length];
}

async function requestJson(fetchImpl,url,{method='GET',body=null,timeout_ms=9000}={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout_ms);
 try{
  const response=await fetchImpl(url,{method,headers:{accept:'application/json','content-type':'application/json','user-agent':'My-Report-2/supplemental-v1'},body:body===null?undefined:JSON.stringify(body),signal:controller.signal});
  const payload=await response.json().catch(()=>null);
  return {ok:response.ok,status:response.status,payload,error:response.ok?null:`HTTP_${response.status}`};
 }catch(error){return {ok:false,status:null,payload:null,error:String(error?.name==='AbortError'?'TIMEOUT':error?.message||error).slice(0,160)};}
 finally{clearTimeout(timer);}
}

function normalizeDexScreener(payload,identity,now){
 const rows=Array.isArray(payload)?payload:Array.isArray(payload?.pairs)?payload.pairs:[];
 const exact=rows.filter(r=>clean(r?.chainId).toLowerCase()===identity.chain&&[r?.baseToken?.address,r?.quoteToken?.address].some(x=>clean(x).toLowerCase()===identity.contract_or_mint.toLowerCase()));
 return {source:'DEX_SCREENER',status:exact.length?'CLOSED':'NOT_CLOSED',observed_ts:now,exact_identity:true,pools:exact.slice(0,20).map(r=>({pool_key:`${identity.chain}|${clean(r?.pairAddress).toLowerCase()}`,liquidity_usd:finite(r?.liquidity?.usd),volume_24h_usd:finite(r?.volume?.h24),buys_24h:finite(r?.txns?.h24?.buys),sells_24h:finite(r?.txns?.h24?.sells)}))};
}
function normalizeGecko(payload,identity,now){
 const rows=Array.isArray(payload?.data)?payload.data:[];
 const wanted=identity.contract_or_mint.toLowerCase();
 const pools=rows.filter(row=>{
  const relationIds=[row?.relationships?.base_token?.data?.id,row?.relationships?.quote_token?.data?.id].map(x=>clean(x).toLowerCase());
  return relationIds.some(id=>id===wanted||id.endsWith(`_${wanted}`));
 }).slice(0,20).map(row=>{const r=row?.attributes||{};return{pool_key:`${identity.chain}|${clean(r?.address||row?.id).toLowerCase()}`,liquidity_usd:finite(r?.reserve_in_usd),volume_24h_usd:finite(r?.volume_usd?.h24),buys_24h:finite(r?.transactions?.h24?.buys),sells_24h:finite(r?.transactions?.h24?.sells)};});
 return {source:'GECKOTERMINAL',status:pools.length?'CLOSED':'NOT_CLOSED',observed_ts:now,exact_identity:true,pools};
}
function normalizeGoPlus(payload,identity,now){
 const key=identity.contract_or_mint.toLowerCase(),row=payload?.result?.[key]??payload?.result?.[identity.contract_or_mint]??null;
 const keys=['cannot_sell_all','cannot_buy','is_honeypot','is_mintable','is_proxy','owner_change_balance','transfer_pausable','trading_cooldown','is_blacklisted'];
 const flags={};for(const k of keys)flags[k]=row?.[k]===undefined||row?.[k]===null||row?.[k]===''?null:String(row[k])==='1'||row[k]===true;
 return {source:'GOPLUS',status:row?'CLOSED':'NOT_CLOSED',observed_ts:now,exact_identity:true,flags,unknown_is_safe:false};
}
function normalizeSolana(payload,identity,now){
 const rows=Array.isArray(payload?.result)?payload.result:[],hour=3600000;
 const current=rows.filter(r=>finite(r?.blockTime)!==null&&now-finite(r.blockTime)*1000<=hour).length;
 const prior=rows.filter(r=>finite(r?.blockTime)!==null&&now-finite(r.blockTime)*1000>hour&&now-finite(r.blockTime)*1000<=2*hour).length;
 return {source:'SOLANA_RPC',status:Array.isArray(payload?.result)?'CLOSED':'NOT_CLOSED',observed_ts:now,exact_identity:true,mint:identity.contract_or_mint,recent_signature_count_1h:current,prior_signature_count_1h:prior,sample_capped:rows.length>=100};
}
function normalizeDefiLlama(payload,slug,now){
 const rows=Array.isArray(payload?.tvl)?payload.tvl:[];const latest=rows.at(-1),target=now/1000-7*86400;
 const prior=[...rows].reverse().find(r=>finite(r?.date)!==null&&finite(r.date)<=target);
 const a=finite(prior?.totalLiquidityUSD),b=finite(latest?.totalLiquidityUSD);
 return {source:'DEFILLAMA',status:a!==null&&b!==null?'CLOSED':'NOT_CLOSED',observed_ts:now,exact_identity:true,protocol_slug:slug,tvl_usd:b,tvl_change_7d_pct:a&&b!==null?((b/a)-1)*100:null};
}
function firstData(payload){return Array.isArray(payload?.data)?payload.data[0]:payload?.data??null;}
function deviation(primary,secondary){const a=finite(primary),b=finite(secondary);return a!==null&&b!==null&&a>0?((b/a)-1)*100:null;}
function normalizeBitget(ticker,oi,funding,symbol,now,primaryPrice){
 const t=firstData(ticker),o=firstData(oi),f=firstData(funding);
 const exact=[t,o,f].filter(Boolean).every(r=>!r?.symbol||clean(r.symbol).toUpperCase()===symbol);
 const price=finite(t?.lastPr??t?.last);return {source:'BITGET',status:exact&&t?'CLOSED':'NOT_CLOSED',observed_ts:now,exact_identity:exact,symbol,price,price_difference_vs_htx_pct:deviation(primaryPrice,price),mark_price:finite(t?.markPrice),open_interest:finite(o?.openInterestList?.[0]?.size??o?.openInterest??o?.size),funding_rate:finite(f?.fundingRate)};
}
function normalizeCoinbase(product,ticker,now,primaryPrice){
 const id=clean(product?.id).toUpperCase(),base=clean(product?.base_currency).toUpperCase(),quote=clean(product?.quote_currency).toUpperCase();
 const expected=`${base}-${quote}`;
 const exact=id&&id===expected&&['USD','USDT'].includes(quote);
 const price=finite(ticker?.price);return {source:'COINBASE',status:exact&&price!==null?'CLOSED':'NOT_CLOSED',observed_ts:now,exact_identity:exact,product:id||null,base,quote,price,price_difference_vs_htx_pct:deviation(primaryPrice,price),volume_24h:finite(ticker?.volume)};
}

export async function collectSupplementalCandidateContext({db,fetch_impl=globalThis.fetch,registry,venue_registry=null,contract,run_id,derivatives_venues=0,critical_conflict=false,primary_price=null,now=Date.now(),reserve_for_liquidations=false}={}){
 if(!db)throw new Error('SUPPLEMENTAL_CONTEXT_DB_REQUIRED');
 await db.prepare(`CREATE TABLE IF NOT EXISTS report2_candidate_source_cache (contract_code TEXT NOT NULL, source TEXT NOT NULL, observed_ts INTEGER NOT NULL, expires_ts INTEGER NOT NULL, payload_json TEXT NOT NULL, PRIMARY KEY(contract_code,source))`).run();
 const parsed=parseSupplementalIdentityRegistry(registry),base=baseOf(contract),providerIds=venue_registry?.entries?.[base]||{},entry=parsed.entries[base]||Object.keys(providerIds).length?{...(parsed.entries[base]||{base,identity:null,protocol_slug:null,coinbase_product:null}),...providerIds}:null;
 const lane=reserve_for_liquidations?null:chooseSupplementalLane({run_id,contract,entry,derivatives_venues,critical_conflict});
 const receipts=[],calls=[];const get=url=>requestJson(fetch_impl,url);const post=(url,body)=>requestJson(fetch_impl,url,{method:'POST',body});
 if(lane==='DEX_RISK'&&entry?.identity){
  const id=entry.identity,network=geckoNetwork(id.chain),cid=chainId(id.chain);
  calls.push(['DEX_SCREENER',get(`https://api.dexscreener.com/tokens/v1/${encodeURIComponent(id.chain)}/${encodeURIComponent(id.contract_or_mint)}`),p=>normalizeDexScreener(p,id,now)]);
  if(network)calls.push(['GECKOTERMINAL',get(`https://api.geckoterminal.com/api/v2/networks/${encodeURIComponent(network)}/tokens/${encodeURIComponent(id.contract_or_mint)}/pools?page=1`),p=>normalizeGecko(p,id,now)]);
  if(cid)calls.push(['GOPLUS',get(`https://api.gopluslabs.io/api/v1/token_security/${cid}?contract_addresses=${encodeURIComponent(id.contract_or_mint)}`),p=>normalizeGoPlus(p,id,now)]);
  if(id.chain==='solana')calls.push(['SOLANA_RPC',post('https://api.mainnet-beta.solana.com',{jsonrpc:'2.0',id:1,method:'getSignaturesForAddress',params:[id.contract_or_mint,{limit:100}]}),p=>normalizeSolana(p,id,now)]);
 }else if(lane==='PROTOCOL'&&entry?.protocol_slug){
  calls.push(['DEFILLAMA',get(`https://api.llama.fi/protocol/${encodeURIComponent(entry.protocol_slug)}`),p=>normalizeDefiLlama(p,entry.protocol_slug,now)]);
 }else if(lane==='BITGET_FALLBACK'){
  const symbol=`${base}USDT`;const [ticker,oi,funding]=await Promise.all([
   get(`https://api.bitget.com/api/v2/mix/market/ticker?symbol=${encodeURIComponent(symbol)}&productType=USDT-FUTURES`),
   get(`https://api.bitget.com/api/v2/mix/market/open-interest?symbol=${encodeURIComponent(symbol)}&productType=USDT-FUTURES`),
   get(`https://api.bitget.com/api/v2/mix/market/current-fund-rate?symbol=${encodeURIComponent(symbol)}&productType=USDT-FUTURES`),
  ]);calls.push(['BITGET',Promise.resolve({ok:ticker.ok&&oi.ok&&funding.ok,payload:[ticker.payload,oi.payload,funding.payload],error:[ticker.error,oi.error,funding.error].filter(Boolean).join(',')}),p=>normalizeBitget(p[0],p[1],p[2],symbol,now,primary_price)]);
 }else if(lane==='COINBASE_SPOT'&&entry?.coinbase_product){
  const productId=entry.coinbase_product;const [product,ticker]=await Promise.all([get(`https://api.exchange.coinbase.com/products/${encodeURIComponent(productId)}`),get(`https://api.exchange.coinbase.com/products/${encodeURIComponent(productId)}/ticker`)]);
  calls.push(['COINBASE',Promise.resolve({ok:product.ok&&ticker.ok,payload:[product.payload,ticker.payload],error:[product.error,ticker.error].filter(Boolean).join(',')}),p=>normalizeCoinbase(p[0],p[1],now,primary_price)]);
 }
 if(calls.length>5)throw new Error('SUPPLEMENTAL_LANE_HTTP_BUDGET_EXCEEDED');
 const settled=await Promise.all(calls.map(async([source,promise,normalize])=>{const raw=await promise;const payload=raw.ok?normalize(raw.payload):{source,status:'SOURCE_ERROR',observed_ts:now,error:raw.error,exact_identity:false};return {source,payload};}));
 for(const {source,payload} of settled){
  receipts.push({source,status:payload.status});
  await db.prepare(`INSERT INTO report2_candidate_source_cache(contract_code,source,observed_ts,expires_ts,payload_json) VALUES(?1,?2,?3,?4,?5) ON CONFLICT(contract_code,source) DO UPDATE SET observed_ts=excluded.observed_ts,expires_ts=excluded.expires_ts,payload_json=excluded.payload_json`).bind(contract,source,now,now+TTL_MS,JSON.stringify(payload)).run();
 }
 const cached=await db.prepare(`SELECT source,observed_ts,expires_ts,payload_json FROM report2_candidate_source_cache WHERE contract_code=?1 AND expires_ts>=?2`).bind(contract,now).all();
 const sources={};for(const row of cached?.results||[]){try{sources[row.source]={...JSON.parse(row.payload_json),cache_status:settled.some(x=>x.source===row.source)?'REFRESHED':'HIT'};}catch{}}
 return {version:SUPPLEMENTAL_CANDIDATE_CONTEXT_VERSION,status:Object.keys(sources).length?'CLOSED':'NOT_CLOSED',contract,base,registry_status:parsed.status,lane:lane||(reserve_for_liquidations?'RESERVED_FOR_LIQUIDATION_PANEL':'NO_ELIGIBLE_LANE'),network_calls:calls.length,liquidation_lane_reserved:reserve_for_liquidations===true,liquidation_identity:entry?{lighter_market_id:entry.lighter_market_id,gmx_market_address:entry.gmx_market_address}:null,receipts,sources,internal_only:true};
}

export default{parseSupplementalIdentityRegistry,chooseSupplementalLane,collectSupplementalCandidateContext};
