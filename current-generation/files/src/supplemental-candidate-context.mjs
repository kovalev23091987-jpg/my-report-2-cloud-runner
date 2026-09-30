export const SUPPLEMENTAL_CANDIDATE_CONTEXT_VERSION='supplemental-candidate-context-v6-role-cache-priority-20260930';
const TTL_MS=60*60*1000,IDENTITY_TTL_MS=6*60*60*1000,IDENTITY_RETRY_TTL_MS=60*60*1000;
const clean=v=>String(v??'').trim();
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const baseOf=contract=>clean(contract).toUpperCase().replace(/[-_/]?(USDT|USD|USDC|PERP)$/,'');
const EVM=/^0x[0-9a-f]{40}$/i,BASE58=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const chainId=chain=>({ethereum:'1',bsc:'56',arbitrum:'42161',base:'8453',polygon:'137',optimism:'10',avalanche:'43114'}[clean(chain).toLowerCase()]||null);
const geckoNetwork=chain=>({ethereum:'eth',bsc:'bsc',arbitrum:'arbitrum',base:'base',polygon:'polygon_pos',optimism:'optimism',avalanche:'avax',solana:'solana'}[clean(chain).toLowerCase()]||null);
const canonicalChain=value=>({eth:'ethereum',ethereum:'ethereum',bsc:'bsc',arbitrum:'arbitrum',base:'base',polygon:'polygon',polygon_pos:'polygon',optimism:'optimism',avax:'avalanche',avalanche:'avalanche',solana:'solana'}[clean(value).toLowerCase()]||null);
const stableSymbol=value=>['USDT','USDC','USD','DAI','FDUSD'].includes(clean(value).toUpperCase());
const exactIdentity=row=>{
 const chain=clean(row?.chain).toLowerCase(),address=clean(row?.contract_or_mint);
 if(!chain||!address)return null;
 if(chain==='solana'?!BASE58.test(address):!EVM.test(address))return null;
 return {chain,contract_or_mint:chain==='solana'?address:address.toLowerCase()};
};
export function sameChainAssetIdentity(a,b){
 const left=exactIdentity(a),right=exactIdentity(b);
 if(!left||!right||left.chain!==right.chain)return false;
 return left.chain==='solana'?left.contract_or_mint===right.contract_or_mint:left.contract_or_mint.toLowerCase()===right.contract_or_mint.toLowerCase();
}

export function parseSupplementalIdentityRegistry(raw){
 let parsed=raw;
 if(typeof raw==='string'){try{parsed=JSON.parse(raw);}catch{return {status:'NOT_CLOSED',reason:'REGISTRY_JSON_INVALID',entries:{}};}}
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return {status:'NOT_CLOSED',reason:'REGISTRY_OBJECT_REQUIRED',entries:{}};
 const entries={};
 for(const [symbol,value] of Object.entries(parsed)){
  const base=baseOf(symbol);if(!base||!value||typeof value!=='object')continue;
  const identity=exactIdentity(value);
  const lighterMarket=value.lighter_market_id===null||value.lighter_market_id===undefined||value.lighter_market_id===''?null:Number(value.lighter_market_id),gmxMarket=clean(value.gmx_market_address).toLowerCase();
  const officialDomains=(Array.isArray(value.official_domains)?value.official_domains:[]).map(x=>clean(x).toLowerCase().replace(/^https?:\/\//,'').split('/')[0]).filter(x=>/^[a-z0-9.-]+$/.test(x)&&x.includes('.')).slice(0,4);
  const officialFeeds=(Array.isArray(value.official_feeds)?value.official_feeds:[]).map(clean).filter(x=>{try{return new URL(x).protocol==='https:';}catch{return false;}}).slice(0,4);
  const officialFeedSpecs=(Array.isArray(value.official_feed_specs)?value.official_feed_specs:[]).flatMap(spec=>{const url=clean(spec?.url),format=clean(spec?.format).toUpperCase(),parser_id=clean(spec?.parser_id),refresh_period=clean(spec?.refresh_period),timezone=clean(spec?.timezone);try{if(new URL(url).protocol!=='https:')return[];}catch{return[];}if(!['RSS','ATOM','ICS'].includes(format)||parser_id!==`FIXED_${format}_V1`)return[];return[{url,format,parser_id,refresh_period:/^\d+[mhd]$/.test(refresh_period)?refresh_period:null,timezone:timezone||null}];}).slice(0,4);
  entries[base]={base,identity,coinpaprika_id:clean(value.coinpaprika_id)||null,sector_tag:clean(value.sector_tag)||null,protocol_slug:clean(value.protocol_slug)||null,coinbase_product:clean(value.coinbase_product).toUpperCase()||null,
   lighter_market_id:Number.isSafeInteger(lighterMarket)&&lighterMarket>=0?lighterMarket:null,gmx_market_address:EVM.test(gmxMarket)?gmxMarket:null,
   official_name:clean(value.official_name)||null,official_domains:officialDomains,official_feeds:officialFeeds,official_feed_specs:officialFeedSpecs,snapshot_space:/^[a-z0-9][a-z0-9._-]{1,99}$/i.test(clean(value.snapshot_space))?clean(value.snapshot_space):null};
 }
 return {status:Object.keys(entries).length?'CLOSED':'NOT_CLOSED',reason:Object.keys(entries).length?null:'REGISTRY_EMPTY',entries};
}

function hashLane(value){let h=2166136261;for(const ch of clean(value)){h^=ch.codePointAt(0);h=Math.imul(h,16777619);}return Math.abs(h)>>>0;}
export function chooseSupplementalLane({run_id,contract,entry,derivatives_venues=0,critical_conflict=false,cached_sources={}}={}){
 // A required futures cross-check is not interchangeable with protocol TVL
 // or spot context. A retained response (including backoff/error context)
 // suppresses another request until its existing cache expires.
 if((Number(derivatives_venues)<2||critical_conflict===true)&&!cached_sources.BITGET)return 'BITGET_FALLBACK';
 const available=[];
 if(entry?.identity){
  const expected=['DEX_SCREENER',...(geckoNetwork(entry.identity.chain)?['GECKOTERMINAL']:[]),...(chainId(entry.identity.chain)?['GOPLUS']:[]),...(entry.identity.chain==='solana'?['SOLANA_RPC']:[])];
  if(expected.some(source=>!cached_sources[source]))available.push('DEX_RISK','DEX_RISK','DEX_RISK');
 }
 if(entry?.identity&&entry?.protocol_slug&&!cached_sources.DEFILLAMA)available.push('PROTOCOL','PROTOCOL');
 if(entry?.coinbase_product&&!cached_sources.COINBASE)available.push('COINBASE_SPOT');
 if(!available.length)return null;
 return available[hashLane(`${run_id}:${contract}`)%available.length];
}

async function requestJson(fetchImpl,url,{method='GET',body=null,headers={},timeout_ms=9000}={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout_ms);
 try{
  const response=await fetchImpl(url,{method,headers:{accept:'application/json','content-type':'application/json','user-agent':'My-Report-2/supplemental-v2',...headers},body:body===null?undefined:JSON.stringify(body),signal:controller.signal});
  const payload=await response.json().catch(()=>null);
  return {ok:response.ok,status:response.status,payload,error:response.ok?null:`HTTP_${response.status}`};
 }catch(error){return {ok:false,status:null,payload:null,error:String(error?.name==='AbortError'?'TIMEOUT':error?.message||error).slice(0,160)};}
 finally{clearTimeout(timer);}
}

function splitGeckoTokenId(value){
 const id=clean(value),at=id.indexOf('_');if(at<1)return null;
 const chain=canonicalChain(id.slice(0,at)),address=id.slice(at+1);if(!chain)return null;
 return exactIdentity({chain,contract_or_mint:address});
}
function dominantIdentity(rows){
 const groups=new Map();
 for(const row of rows){const identity=exactIdentity(row),liq=finite(row?.liquidity_usd);if(!identity||liq===null||liq<0)continue;const key=`${identity.chain}|${identity.contract_or_mint}`;const prior=groups.get(key)||{identity,liquidity_usd:0,pools:0};prior.liquidity_usd+=liq;prior.pools+=1;groups.set(key,prior);}
 const ranked=[...groups.values()].sort((a,b)=>b.liquidity_usd-a.liquidity_usd);const top=ranked[0],second=ranked[1];
 if(!top||top.liquidity_usd<100_000)return null;
 if(second&&top.liquidity_usd<second.liquidity_usd*5)return null;
 return top;
}
function dexSearchIdentities(payload,base){
 const rows=Array.isArray(payload?.pairs)?payload.pairs:[];
 return rows.flatMap(row=>{
  const chain=canonicalChain(row?.chainId),a=clean(row?.baseToken?.symbol).toUpperCase(),b=clean(row?.quoteToken?.symbol).toUpperCase();
  if(!chain)return[];
  if(a===base&&stableSymbol(b))return[{chain,contract_or_mint:row?.baseToken?.address,liquidity_usd:row?.liquidity?.usd}];
  if(b===base&&stableSymbol(a))return[{chain,contract_or_mint:row?.quoteToken?.address,liquidity_usd:row?.liquidity?.usd}];
  return[];
 });
}
function geckoSearchIdentities(payload,base){
 const included=new Map((Array.isArray(payload?.included)?payload.included:[]).filter(x=>x?.type==='token').map(x=>[clean(x?.id),clean(x?.attributes?.symbol).toUpperCase()]));
 return (Array.isArray(payload?.data)?payload.data:[]).flatMap(row=>{
  const baseId=clean(row?.relationships?.base_token?.data?.id),quoteId=clean(row?.relationships?.quote_token?.data?.id),a=included.get(baseId),b=included.get(quoteId);
  const tokenId=a===base&&stableSymbol(b)?baseId:b===base&&stableSymbol(a)?quoteId:null,identity=splitGeckoTokenId(tokenId);
  return identity?[{...identity,liquidity_usd:row?.attributes?.reserve_in_usd}]:[];
 });
}
function uniqueProtocolSlug(payload,base,identity){
 const rows=(Array.isArray(payload)?payload:[]).filter(row=>clean(row?.symbol).toUpperCase()===base&&(finite(row?.tvl)??0)>=100_000&&clean(row?.slug));
 const chain=identity?.chain;if(!chain)return rows.length===1?clean(rows[0].slug):null;
 const aliases={ethereum:['ethereum','eth'],bsc:['bsc','binance'],arbitrum:['arbitrum'],base:['base'],polygon:['polygon'],optimism:['optimism'],avalanche:['avalanche'],solana:['solana']}[chain]||[];
 const compatible=rows.filter(row=>[row?.chain,...(Array.isArray(row?.chains)?row.chains:[])].some(v=>aliases.some(a=>clean(v).toLowerCase().includes(a))));
 return compatible.length===1?clean(compatible[0].slug):rows.length===1?clean(rows[0].slug):null;
}
export function resolveDiscoveredIdentity({base,dex_payload,gecko_payload,protocols_payload,now=Date.now()}={}){
 const symbol=baseOf(base),dex=dominantIdentity(dexSearchIdentities(dex_payload,symbol)),gecko=dominantIdentity(geckoSearchIdentities(gecko_payload,symbol));
 const agrees=Boolean(dex&&gecko&&sameChainAssetIdentity(dex.identity,gecko.identity));
 const identity=agrees?dex.identity:null,protocol_slug=uniqueProtocolSlug(protocols_payload,symbol,identity);
 return {base:symbol,identity_candidate:identity,identity:null,protocol_slug,coinbase_product:`${symbol}-USD`,status:identity||protocol_slug?'CANDIDATE_ONLY':'NOT_CLOSED',observed_ts:now,identity_method:identity?'DUAL_PROVIDER_DOMINANT_ADDRESS_CANDIDATE_ONLY':null,identity_sources:identity?['DEX_SCREENER_SEARCH','GECKOTERMINAL_SEARCH']:[],dex_liquidity_usd:dex?.liquidity_usd??null,gecko_liquidity_usd:gecko?.liquidity_usd??null,exact_identity:false,registry_confirmation_required:Boolean(identity)};
}

async function loadOrDiscoverIdentity({db,fetch_impl,base,now}={}){
 await db.prepare(`CREATE TABLE IF NOT EXISTS report2_supplemental_identity_cache (base_symbol TEXT PRIMARY KEY, observed_ts INTEGER NOT NULL, expires_ts INTEGER NOT NULL, payload_json TEXT NOT NULL)`).run();
 const prior=await db.prepare(`SELECT observed_ts,expires_ts,payload_json FROM report2_supplemental_identity_cache WHERE base_symbol=?1 AND expires_ts>=?2 LIMIT 1`).bind(base,now).first();
 if(prior){try{return{entry:JSON.parse(prior.payload_json),network_calls:0,cache_status:'HIT'};}catch{}}
 const query=encodeURIComponent(`${base}/USDT`),[dex,gecko,protocols]=await Promise.all([
  requestJson(fetch_impl,`https://api.dexscreener.com/latest/dex/search?q=${query}`),
  requestJson(fetch_impl,`https://api.geckoterminal.com/api/v2/search/pools?query=${query}&include=base_token%2Cquote_token&page=1`),
  requestJson(fetch_impl,'https://api.llama.fi/protocols',{timeout_ms:12000}),
 ]);
 const entry=resolveDiscoveredIdentity({base,dex_payload:dex.ok?dex.payload:null,gecko_payload:gecko.ok?gecko.payload:null,protocols_payload:protocols.ok?protocols.payload:null,now});
 entry.discovery_receipts=[{source:'DEX_SCREENER_SEARCH',status:dex.ok?'CLOSED':dex.error},{source:'GECKOTERMINAL_SEARCH',status:gecko.ok?'CLOSED':gecko.error},{source:'DEFILLAMA_PROTOCOLS',status:protocols.ok?'CLOSED':protocols.error}];
 const ttl=entry.status==='CLOSED'?IDENTITY_TTL_MS:IDENTITY_RETRY_TTL_MS;
 await db.prepare(`INSERT INTO report2_supplemental_identity_cache(base_symbol,observed_ts,expires_ts,payload_json) VALUES(?1,?2,?3,?4) ON CONFLICT(base_symbol) DO UPDATE SET observed_ts=excluded.observed_ts,expires_ts=excluded.expires_ts,payload_json=excluded.payload_json`).bind(base,now,now+ttl,JSON.stringify(entry)).run();
 return{entry,network_calls:3,cache_status:'REFRESHED'};
}

const sourceTtl=source=>({OXARCHIVE:5*60*1000,BITGET:5*60*1000,COINBASE:5*60*1000,DEFILLAMA:6*60*60*1000,GOPLUS:24*60*60*1000}[source]||TTL_MS);
async function loadCachedSources(db,contract,now,refreshed=[]){
 const cached=await db.prepare(`SELECT source,observed_ts,expires_ts,payload_json FROM report2_candidate_source_cache WHERE contract_code=?1 AND expires_ts>=?2`).bind(contract,now).all();
 const sources={};for(const row of cached?.results||[]){try{const payload=JSON.parse(row.payload_json);if(['DEFILLAMA','SOLANA_RPC','COINBASE','DEX_SCREENER','GECKOTERMINAL'].includes(row.source)&&payload.context_version!==SUPPLEMENTAL_CANDIDATE_CONTEXT_VERSION)continue;sources[row.source]={...payload,cache_status:refreshed.includes(row.source)?'REFRESHED':'HIT'};}catch{}}
 return sources;
}

function normalizeDexScreener(payload,identity,now){
 const rows=Array.isArray(payload)?payload:Array.isArray(payload?.pairs)?payload.pairs:[];
 const exact=rows.filter(r=>[r?.baseToken?.address,r?.quoteToken?.address].some(address=>sameChainAssetIdentity(identity,{chain:r?.chainId,contract_or_mint:address})));
 return {source:'DEX_SCREENER',status:exact.length?'CLOSED':'NOT_CLOSED',observed_ts:now,exact_identity:true,pools:exact.slice(0,20).map(r=>({pool_key:`${identity.chain}|${identity.chain==='solana'?clean(r?.pairAddress):clean(r?.pairAddress).toLowerCase()}`,liquidity_usd:finite(r?.liquidity?.usd),volume_24h_usd:finite(r?.volume?.h24),buys_24h:finite(r?.txns?.h24?.buys),sells_24h:finite(r?.txns?.h24?.sells)}))};
}
function normalizeGecko(payload,identity,now){
 const rows=Array.isArray(payload?.data)?payload.data:[];
 const pools=rows.filter(row=>{
  const relationIds=[row?.relationships?.base_token?.data?.id,row?.relationships?.quote_token?.data?.id].map(splitGeckoTokenId).filter(Boolean);
  return relationIds.some(candidate=>sameChainAssetIdentity(identity,candidate));
 }).slice(0,20).map(row=>{const r=row?.attributes||{};return{pool_key:`${identity.chain}|${identity.chain==='solana'?clean(r?.address||row?.id):clean(r?.address||row?.id).toLowerCase()}`,liquidity_usd:finite(r?.reserve_in_usd),volume_24h_usd:finite(r?.volume_usd?.h24),buys_24h:finite(r?.transactions?.h24?.buys),sells_24h:finite(r?.transactions?.h24?.sells)};});
 return {source:'GECKOTERMINAL',status:pools.length?'CLOSED':'NOT_CLOSED',observed_ts:now,exact_identity:true,pools};
}
function normalizeGoPlus(payload,identity,now){
 const key=identity.contract_or_mint.toLowerCase(),row=payload?.result?.[key]??payload?.result?.[identity.contract_or_mint]??null;
 const keys=['cannot_sell_all','cannot_buy','is_honeypot','is_mintable','is_proxy','owner_change_balance','transfer_pausable','trading_cooldown','is_blacklisted'];
 const flags={};for(const k of keys)flags[k]=row?.[k]===undefined||row?.[k]===null||row?.[k]===''?null:String(row[k])==='1'||row[k]===true;
 return {source:'GOPLUS',status:row?'CLOSED':'NOT_CLOSED',observed_ts:now,exact_identity:true,flags,unknown_is_safe:false};
}
export function normalizeSolana(payload,identity,now){
 const rows=Array.isArray(payload?.result)?payload.result:[],valid=rows.filter(r=>r?.err===null&&finite(r?.blockTime)!==null&&finite(r.blockTime)*1000<=now),hour=3600000;
 const current=valid.filter(r=>now-finite(r.blockTime)*1000<=hour).length,prior=valid.filter(r=>now-finite(r.blockTime)*1000>hour&&now-finite(r.blockTime)*1000<=2*hour).length;
 const source_ts=valid.length?Math.max(...valid.map(r=>finite(r.blockTime)*1000)):null,oldest=valid.length?Math.min(...valid.map(r=>finite(r.blockTime)*1000)):null;
 const capped=rows.length>=100,complete=!capped||oldest!==null&&oldest<=now-2*hour;
 return {source:'SOLANA_RPC',status:Array.isArray(payload?.result)?'CLOSED':'NOT_CLOSED',observed_ts:now,source_ts,exact_identity:true,mint:identity.contract_or_mint,recent_signature_count_1h:current,prior_signature_count_1h:prior,sample_capped:capped,comparable_windows:complete,coverage_fraction:complete?1:0,activity_is_not_supply:true,direction_neutral:true,signature_success_required:true};
}
export function normalizeDefiLlama(payload,slug,now,{identity=null,expected_symbol=null}={}){
 const rows=(Array.isArray(payload?.tvl)?payload.tvl:[]).filter(r=>finite(r?.date)!==null&&finite(r.date)*1000<=now&&finite(r?.totalLiquidityUSD)!==null).sort((a,b)=>a.date-b.date),latest=rows.at(-1),source_ts=latest?finite(latest.date)*1000:null,target=source_ts===null?null:source_ts/1000-7*86400,prior=target===null?null:[...rows].reverse().find(r=>finite(r.date)<=target),a=finite(prior?.totalLiquidityUSD),b=finite(latest?.totalLiquidityUSD);
 const address=clean(payload?.address).replace(/^ethereum:/,'');const asset_match=identity?.chain==='ethereum'&&sameChainAssetIdentity(identity,{chain:'ethereum',contract_or_mint:address});
 const symbol_match=expected_symbol&&clean(payload?.symbol).toUpperCase()===clean(expected_symbol).toUpperCase(),fresh=source_ts!==null&&now-source_ts<=48*3600000,baseline_close=prior&&target-finite(prior.date)<=86400;
 const exact=Boolean(asset_match&&symbol_match),usable=exact&&fresh&&baseline_close&&a!==null&&a>0&&b!==null;
 return {source:'DEFILLAMA',status:usable?'CLOSED':'NOT_CLOSED',reason:!exact?'PROTOCOL_TOKEN_IDENTITY_NOT_CLOSED':!fresh?'PROTOCOL_TVL_STALE':!baseline_close?'COMPARABLE_SEVEN_DAY_BASELINE_REQUIRED':null,observed_ts:now,source_ts,exact_identity:exact,protocol_slug:slug,tvl_usd:b,tvl_change_7d_pct:usable?((b/a)-1)*100:null,baseline_ts:prior?finite(prior.date)*1000:null,direction_neutral:true};
}
function firstData(payload){return Array.isArray(payload?.data)?payload.data[0]:payload?.data??null;}
function deviation(primary,secondary){const a=finite(primary),b=finite(secondary);return a!==null&&b!==null&&a>0?((b/a)-1)*100:null;}
function normalizeBitget(ticker,oi,funding,symbol,now,primaryPrice){
 const t=firstData(ticker),o=firstData(oi),f=firstData(funding);
 const exact=[t,o,f].filter(Boolean).every(r=>!r?.symbol||clean(r.symbol).toUpperCase()===symbol);
 const price=finite(t?.lastPr??t?.last);return {source:'BITGET',status:exact&&t?'CLOSED':'NOT_CLOSED',observed_ts:now,exact_identity:exact,symbol,price,price_difference_vs_htx_pct:deviation(primaryPrice,price),mark_price:finite(t?.markPrice),open_interest:finite(o?.openInterestList?.[0]?.size??o?.openInterest??o?.size),funding_rate:finite(f?.fundingRate)};
}
export function normalizeCoinbase(product,ticker,now,primaryPrice,requestedProduct=null){
 const id=clean(product?.id).toUpperCase(),base=clean(product?.base_currency).toUpperCase(),quote=clean(product?.quote_currency).toUpperCase();
 const expected=`${base}-${quote}`;
 const exact=id&&id===expected&&id===clean(requestedProduct).toUpperCase()&&['USD','USDT'].includes(quote);
 const price=finite(ticker?.price);return {source:'COINBASE',status:exact&&price!==null?'CLOSED':'NOT_CLOSED',observed_ts:now,exact_identity:exact,product:id||null,base,quote,price,price_difference_vs_htx_pct:deviation(primaryPrice,price),volume_24h:finite(ticker?.volume)};
}

export async function collectSupplementalCandidateContext({db,fetch_impl=globalThis.fetch,registry,venue_registry=null,contract,run_id,derivatives_venues=0,critical_conflict=false,primary_price=null,now=Date.now(),reserve_for_liquidations=false}={}){
 if(!db)throw new Error('SUPPLEMENTAL_CONTEXT_DB_REQUIRED');
 await db.prepare(`CREATE TABLE IF NOT EXISTS report2_candidate_source_cache (contract_code TEXT NOT NULL, source TEXT NOT NULL, observed_ts INTEGER NOT NULL, expires_ts INTEGER NOT NULL, payload_json TEXT NOT NULL, PRIMARY KEY(contract_code,source))`).run();
 const parsed=parseSupplementalIdentityRegistry(registry),base=baseOf(contract),providerIds=venue_registry?.entries?.[base]||{},manual=parsed.entries[base]||null;
 let discovered=null,identityDiscovery={network_calls:0,cache_status:'NOT_NEEDED'};
 if(!reserve_for_liquidations&&Number(derivatives_venues)>=2&&!critical_conflict&&manual?.identity==null&&manual?.protocol_slug==null){
  identityDiscovery=await loadOrDiscoverIdentity({db,fetch_impl,base,now});discovered=identityDiscovery.entry;
 }
 const entry={base,coinpaprika_id:manual?.coinpaprika_id||null,sector_tag:manual?.sector_tag||null,identity:manual?.identity||null,identity_candidate:discovered?.identity_candidate||null,protocol_slug:manual?.protocol_slug||discovered?.protocol_slug||null,coinbase_product:manual?.coinbase_product||discovered?.coinbase_product||`${base}-USD`,lighter_market_id:manual?.lighter_market_id??providerIds?.lighter_market_id??null,gmx_market_address:manual?.gmx_market_address||providerIds?.gmx_market_address||null,official_name:manual?.official_name||null,official_domains:manual?.official_domains||[],official_feeds:manual?.official_feeds||[],official_feed_specs:manual?.official_feed_specs||[],snapshot_space:manual?.snapshot_space||null};
 if(identityDiscovery.network_calls>0){
  const sources=await loadCachedSources(db,contract,now);
  return {version:SUPPLEMENTAL_CANDIDATE_CONTEXT_VERSION,status:Object.values(sources).some(x=>x.status==='CLOSED')?'CLOSED':'IDENTITY_CANDIDATE_DISCOVERED',contract,base,registry_status:parsed.status,identity_status:'CANDIDATE_ONLY',identity_method:discovered?.identity_method||null,asset_identity:null,asset_identity_candidate:entry.identity_candidate,registry_confirmation_required:Boolean(entry.identity_candidate),asset_metadata:{...(entry.coinpaprika_id&&entry.sector_tag?{coinpaprika_id:entry.coinpaprika_id,sector_tag:entry.sector_tag}:{}),official_name:entry.official_name,official_domains:entry.official_domains,official_feeds:entry.official_feeds,official_feed_specs:entry.official_feed_specs,snapshot_space:entry.snapshot_space},lane:'IDENTITY_DISCOVERY',network_calls:identityDiscovery.network_calls,liquidation_lane_reserved:false,liquidation_identity:{lighter_market_id:entry.lighter_market_id,gmx_market_address:entry.gmx_market_address},receipts:discovered?.discovery_receipts||[],sources,internal_only:true};
 }
 const cachedSources=await loadCachedSources(db,contract,now);
 const lane=reserve_for_liquidations?null:chooseSupplementalLane({run_id,contract,entry,derivatives_venues,critical_conflict,cached_sources:cachedSources});
 const receipts=[],calls=[];let httpCalls=0;const get=url=>{httpCalls++;return requestJson(fetch_impl,url);};const post=(url,body)=>{httpCalls++;return requestJson(fetch_impl,url,{method:'POST',body});};
 const queue=(source,request,normalize)=>{if(cachedSources[source]){receipts.push({source,status:cachedSources[source].status,cache_status:'HIT',actual_http:0});return;}calls.push([source,request(),normalize]);};
 if(lane==='DEX_RISK'&&entry?.identity){
  const id=entry.identity,network=geckoNetwork(id.chain),cid=chainId(id.chain);
  queue('DEX_SCREENER',()=>get(`https://api.dexscreener.com/tokens/v1/${encodeURIComponent(id.chain)}/${encodeURIComponent(id.contract_or_mint)}`),p=>normalizeDexScreener(p,id,now));
  if(network)queue('GECKOTERMINAL',()=>get(`https://api.geckoterminal.com/api/v2/networks/${encodeURIComponent(network)}/tokens/${encodeURIComponent(id.contract_or_mint)}/pools?page=1`),p=>normalizeGecko(p,id,now));
  if(cid)queue('GOPLUS',()=>get(`https://api.gopluslabs.io/api/v1/token_security/${cid}?contract_addresses=${encodeURIComponent(id.contract_or_mint)}`),p=>normalizeGoPlus(p,id,now));
  if(id.chain==='solana')queue('SOLANA_RPC',()=>post('https://api.mainnet-beta.solana.com',{jsonrpc:'2.0',id:1,method:'getSignaturesForAddress',params:[id.contract_or_mint,{limit:100,commitment:'finalized'}]}),p=>normalizeSolana(p,id,now));
 }else if(lane==='PROTOCOL'&&entry?.protocol_slug){
  queue('DEFILLAMA',()=>get(`https://api.llama.fi/protocol/${encodeURIComponent(entry.protocol_slug)}`),p=>normalizeDefiLlama(p,entry.protocol_slug,now,{identity:entry.identity,expected_symbol:base}));
 }else if(lane==='BITGET_FALLBACK'){
  const symbol=`${base}USDT`;const [ticker,oi,funding]=await Promise.all([
   get(`https://api.bitget.com/api/v2/mix/market/ticker?symbol=${encodeURIComponent(symbol)}&productType=USDT-FUTURES`),
   get(`https://api.bitget.com/api/v2/mix/market/open-interest?symbol=${encodeURIComponent(symbol)}&productType=USDT-FUTURES`),
   get(`https://api.bitget.com/api/v2/mix/market/current-fund-rate?symbol=${encodeURIComponent(symbol)}&productType=USDT-FUTURES`),
  ]);calls.push(['BITGET',Promise.resolve({ok:ticker.ok&&oi.ok&&funding.ok,payload:[ticker.payload,oi.payload,funding.payload],error:[ticker.error,oi.error,funding.error].filter(Boolean).join(',')}),p=>normalizeBitget(p[0],p[1],p[2],symbol,now,primary_price)]);
 }else if(lane==='COINBASE_SPOT'&&entry?.coinbase_product){
  const productId=entry.coinbase_product;const [product,ticker]=await Promise.all([get(`https://api.exchange.coinbase.com/products/${encodeURIComponent(productId)}`),get(`https://api.exchange.coinbase.com/products/${encodeURIComponent(productId)}/ticker`)]);
  calls.push(['COINBASE',Promise.resolve({ok:product.ok&&ticker.ok,payload:[product.payload,ticker.payload],error:[product.error,ticker.error].filter(Boolean).join(',')}),p=>normalizeCoinbase(p[0],p[1],now,primary_price,productId)]);
 }
 if(httpCalls>5)throw new Error('SUPPLEMENTAL_LANE_HTTP_BUDGET_EXCEEDED');
 const settled=await Promise.all(calls.map(async([source,promise,normalize])=>{const raw=await promise;const payload=raw.ok?normalize(raw.payload):{source,status:'SOURCE_ERROR',observed_ts:now,error:raw.error,exact_identity:false};return {source,payload};}));
 for(const {source,payload} of settled){
  payload.context_version=SUPPLEMENTAL_CANDIDATE_CONTEXT_VERSION;receipts.push({source,status:payload.status});
  await db.prepare(`INSERT INTO report2_candidate_source_cache(contract_code,source,observed_ts,expires_ts,payload_json) VALUES(?1,?2,?3,?4,?5) ON CONFLICT(contract_code,source) DO UPDATE SET observed_ts=excluded.observed_ts,expires_ts=excluded.expires_ts,payload_json=excluded.payload_json`).bind(contract,source,now,now+sourceTtl(source),JSON.stringify(payload)).run();
 }
 const sources=await loadCachedSources(db,contract,now,settled.map(x=>x.source));
 // Cached venue prices may be reused, but their old HTX comparison may not.
 for(const source of ['BITGET','COINBASE'])if(sources[source])sources[source]={...sources[source],price_difference_vs_htx_pct:deviation(primary_price,sources[source].price)};
 return {version:SUPPLEMENTAL_CANDIDATE_CONTEXT_VERSION,status:Object.values(sources).some(x=>x.status==='CLOSED')?'CLOSED':'NOT_CLOSED',contract,base,registry_status:parsed.status,identity_status:manual?.identity?'CLOSED':entry.identity_candidate?'CANDIDATE_ONLY':'NOT_CLOSED',identity_method:manual?.identity?'MANUAL_EXACT_REGISTRY':discovered?.identity_method||null,asset_identity:entry.identity,asset_identity_candidate:entry.identity_candidate,registry_confirmation_required:!manual?.identity&&Boolean(entry.identity_candidate),asset_metadata:{...(entry.coinpaprika_id&&entry.sector_tag?{coinpaprika_id:entry.coinpaprika_id,sector_tag:entry.sector_tag}:{}),official_name:entry.official_name,official_domains:entry.official_domains,official_feeds:entry.official_feeds,official_feed_specs:entry.official_feed_specs,snapshot_space:entry.snapshot_space},lane:lane||(reserve_for_liquidations?'RESERVED_FOR_LIQUIDATION_PANEL':Object.keys(sources).length?'CACHED_RESPONSES_REUSED':'NO_ELIGIBLE_LANE'),network_calls:httpCalls,collection_policy:'NEEDED_FUTURES_FIRST_THEN_ROLE_PRIORITY_WITH_CACHE_REUSE',liquidation_lane_reserved:reserve_for_liquidations===true,liquidation_identity:{lighter_market_id:entry.lighter_market_id,gmx_market_address:entry.gmx_market_address},receipts,sources,internal_only:true};
}

export default{parseSupplementalIdentityRegistry,sameChainAssetIdentity,chooseSupplementalLane,collectSupplementalCandidateContext};
