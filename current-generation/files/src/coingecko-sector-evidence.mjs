import {buildEvidenceV2,SOURCE_POLICIES} from './evidence-source-adapters.mjs';
import {installEvidenceSourceStore,reserveEvidenceSourceAttempts,readEvidenceSourceCache,writeEvidenceSourceCache} from './evidence-source-store.mjs';
import {installProviderMinuteLedger,reserveProviderMinuteUnits} from './provider-minute-ledger.mjs';

export const COINGECKO_SECTOR_VERSION='coingecko-sector-v2-exact-provider-category-20261004';
const SOURCE='COINGECKO_SECTOR',MAX_AGE=900000,clean=v=>String(v??'').trim();
const num=v=>v===null||v===undefined||v===''||typeof v==='boolean'?null:Number.isFinite(Number(v))?Number(v):null;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
export const SUPPORTED_SECTOR_NAMES=Object.freeze({'Oracle':'оракулы','Decentralized Finance (DeFi)':'децентрализованные финансы','Meme':'мем-монеты','Gaming (GameFi)':'игровые проекты','Artificial Intelligence (AI)':'искусственный интеллект','Real World Assets (RWA)':'реальные активы','Layer 1 (L1)':'базовые блокчейны','Layer 2 (L2)':'сети второго уровня'});
export function sectorCategoryLabel(name){
 const value=clean(name);
 if(!/^[\p{L}\p{N} &().,'/-]{1,120}$/u.test(value)||/ecosystem/i.test(value)||/^(?:cryptocurrency|stablecoins?|all coins)$/i.test(value))return null;
 return SUPPORTED_SECTOR_NAMES[value]||value;
}
export function selectCoingeckoSectorCategory(metadata,directory){
 if(!Array.isArray(metadata?.categories)||!Array.isArray(directory))return null;
 const names=[...Object.keys(SUPPORTED_SECTOR_NAMES),...metadata.categories.filter(n=>!Object.hasOwn(SUPPORTED_SECTOR_NAMES,n))];
 for(const name of names){if(!metadata.categories.includes(name)||!sectorCategoryLabel(name))continue;const rows=directory.filter(r=>r?.name===name&&/^[a-z0-9-]{2,100}$/.test(r?.category_id));if(rows.length===1)return rows[0];}
 return null;
}
export function verifyCoingeckoSectorIdentity(metadata,{identity,contract,coin_id,category_name}={}){
 const address=clean(identity?.contract_or_mint),chain=identity?.chain;
 if(!['ethereum','solana'].includes(chain)||!address||metadata?.id!==coin_id||!/^[a-z0-9-]{2,100}$/.test(coin_id)||clean(metadata.symbol).toUpperCase()!==clean(contract).replace(/-USDT$/,'')||!Array.isArray(metadata?.categories)||(category_name&&!metadata.categories.includes(category_name)))return false;
 return chain==='solana'?metadata.platforms?.solana===address:clean(metadata.platforms?.ethereum).toLowerCase()===address.toLowerCase();
}
export function normalizeCoingeckoSector({metadata,categories,quotes,identity,contract,coin_id,category_id,category_name,observed_ts=Date.now()}={}){
 const matching=Array.isArray(categories)?categories.filter(r=>r.category_id===category_id&&r.name===category_name):[];
 if(!sectorCategoryLabel(category_name)||!verifyCoingeckoSectorIdentity(metadata,{identity,contract,coin_id,category_name})||matching.length!==1||!Array.isArray(quotes))return{status:'EXACT_ASSET_AND_CATEGORY_REQUIRED',evidence:[]};
 const counts=new Map(),symbols=new Map();
 for(const r of quotes){counts.set(r?.id,(counts.get(r?.id)||0)+1);const s=clean(r?.symbol).toUpperCase();symbols.set(s,(symbols.get(s)||0)+1);}
 const valid=r=>{const ts=Date.parse(r?.last_updated),change=num(r?.price_change_percentage_24h),symbol=clean(r?.symbol).toUpperCase();return r&&counts.get(r.id)===1&&symbols.get(symbol)===1&&Number.isFinite(ts)&&ts<=observed_ts&&observed_ts-ts<=MAX_AGE&&num(r.current_price)>0&&num(r.total_volume)>=100000&&change!==null?{id:r.id,symbol,source_ts:ts,change_24h_pct:change,quote:'USD_AGGREGATED'}:null;};
 const target=valid(quotes.find(r=>r.id===coin_id));
 if(!target||target.symbol!==contract.replace(/-USDT$/,''))return{status:'EXACT_FRESH_TARGET_QUOTE_REQUIRED',evidence:[]};
 const peers=quotes.filter(r=>r.id!==coin_id).map(valid).filter(r=>r&&Math.abs(r.source_ts-target.source_ts)<=120000).sort((a,b)=>a.id.localeCompare(b.id)).slice(0,50);
 if(peers.length<3)return{status:'INSUFFICIENT_FRESH_SECTOR_PEERS',evidence:[],summary:{eligible_peers:peers.length}};
 const sorted=peers.map(r=>r.change_24h_pct).sort((a,b)=>a-b),mid=Math.floor(sorted.length/2),median=sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2,source_ts=Math.min(target.source_ts,...peers.map(r=>r.source_ts));
 const relative=target.change_24h_pct-median,coverage=clamp(peers.length/20,.15,.75),summary={coin_id,tag_id:category_id,category_name,target_source_ts:target.source_ts,target_change_24h_pct:target.change_24h_pct,peer_median_change_24h_pct:median,relative_strength_pct_points:relative,eligible_peers:peers.length,returned_category_rows:quotes.length,full_sector_coverage:false,source_ts,window:'PROVIDER_ROLLING_24H_AT_NEAR_SYNCHRONOUS_QUOTES',quote:'USD_AGGREGATED_NOT_HTX_EXECUTION_PRICE',direction_neutral:false,entry_eligible:false,is_htx_price:false};
 const evidence=buildEvidenceV2({provider_id:SOURCE,upstream_id:'COINGECKO_AGGREGATED_VENUES',asset_id:`${identity.chain}:${identity.contract_or_mint}`,htx_contract:contract,block_id:'N15',metric_family:'SECTOR_RELATIVE_STRENGTH_CONTEXT',origin_event_id:`${coin_id}:${category_id}:${target.source_ts}`,dependency_group:`SECTOR:${coin_id}:${category_id}:${target.source_ts}`,source_ts,observed_ts,expires_at:Math.min(observed_ts+300000,source_ts+MAX_AGE),coverage_status:'PARTIAL_PROVIDER_DIRECTIONAL_CONTEXT',coverage_fraction:coverage,directional_strength:clamp(relative/10,-1,1),extra:{...summary,peers,sector_proof:'EXACT_ASSET_CATEGORY_AND_QUOTE_BASKET_V1',direction_policy:'RELATIVE_STRENGTH_SUPPORTS_LONG_RELATIVE_WEAKNESS_SUPPORTS_SHORT_LOW_WEIGHT'}});
 return{status:'CLOSED',evidence:[evidence],summary};
}

export async function collectCoingeckoSectorEvidence({db,fetch_impl=globalThis.fetch,request_admit,contract,run_id,asset_identity,asset_metadata,now=Date.now(),strict_fresh_manual=false}={}){
 let coin_id=clean(asset_metadata?.coingecko_id),category_id=clean(asset_metadata?.coingecko_category_id),category_name=clean(asset_metadata?.coingecko_category_name);const identity=asset_identity;
 const pinned=Boolean(coin_id||category_id||category_name),validAddress=identity?.chain==='ethereum'?/^0x[0-9a-f]{40}$/i.test(identity.contract_or_mint):identity?.chain==='solana'&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(identity.contract_or_mint);
 if(!validAddress||!/^[A-Z0-9]{2,30}-USDT$/.test(contract)||(pinned&&(!/^[a-z0-9-]{2,100}$/.test(coin_id)||!/^[a-z0-9-]{2,100}$/.test(category_id)||!sectorCategoryLabel(category_name))))return{status:'EXACT_SECTOR_REGISTRY_REQUIRED',evidence:[],network_calls:0};
 await installEvidenceSourceStore(db);
 const key=`${contract}:${identity.chain}:${identity.contract_or_mint}:${coin_id}:${category_id}`,cached=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:key,now});
 if(!strict_fresh_manual&&cached?.version===COINGECKO_SECTOR_VERSION)return cached;
 const backoff=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:'PROVIDER_BACKOFF',now});
 if(backoff)return{status:backoff.status,evidence:[],network_calls:0,backoff_until:backoff.backoff_until};
 const reservation_id=`EV2:${SOURCE}:${run_id}:${key}`,whole_job_admission=request_admit?.({logical_request_id:reservation_id,lane:'background',attempts:3});
 if(!whole_job_admission?.allowed)return{status:whole_job_admission?.status||'ADMISSION_REQUIRED',evidence:[],network_calls:0};
 const admission=await reserveEvidenceSourceAttempts(db,{source:SOURCE,reservation_id,attempts:3,daily_cap:SOURCE_POLICIES[SOURCE].daily_cap,now});
 if(!admission.allowed)return{status:admission.status,admission,evidence:[],network_calls:0};
 await installProviderMinuteLedger(db);
 const minute=await reserveProviderMinuteUnits(db,{provider:'COINGECKO',reservation_id,units:3,now,cap:9});
 if(!minute.allowed)return{status:'PROVIDER_RATE_LIMIT_LOCAL',admission:minute,evidence:[],network_calls:0};
 const receipts=[];let calls=0,providerBackoff=null;
 async function get(route,url){
  calls++;const c=new AbortController(),timer=setTimeout(()=>c.abort(),12000);
  try{
   const r=await fetch_impl(url,{headers:{accept:'application/json'},signal:c.signal,redirect:'error'}),body=await r.text();
   receipts.push({route,http_status:r.status,status:r.ok?'RECEIVED':`HTTP_${r.status}`});
   if([401,403,429,451].includes(r.status)){
    const raw=r.headers?.get?.('retry-after'),seconds=/^\d+$/.test(raw||'')?Number(raw):null,date=raw?Date.parse(raw):NaN;
    const until=Math.max(Date.now()+900000,seconds!==null?Date.now()+seconds*1000:Number.isFinite(date)?date:0);
    providerBackoff={status:r.status===429?'PROVIDER_RATE_LIMITED':'SOURCE_ACCESS_BLOCKED',backoff_until:until};
   }
   if(!r.ok||body.length>2*1024*1024)return null;
   try{return JSON.parse(body);}catch{return null;}
  }catch(error){receipts.push({route,status:'SOURCE_ERROR',error:String(error.message).slice(0,100)});return null;}finally{clearTimeout(timer);}
 }
 const metadataUrl=pinned?`https://api.coingecko.com/api/v3/coins/${coin_id}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false`:`https://api.coingecko.com/api/v3/coins/${identity.chain}/contract/${encodeURIComponent(identity.contract_or_mint)}`;
 const metadata=await get('EXACT_COIN_METADATA',metadataUrl);
 if(!pinned)coin_id=clean(metadata?.id);
 const verified=verifyCoingeckoSectorIdentity(metadata,{identity,contract,coin_id,category_name:pinned?category_name:null});
 const categories=verified?await get('EXACT_CATEGORY_DIRECTORY','https://api.coingecko.com/api/v3/coins/categories/list'):null;
 if(!pinned){const selected=selectCoingeckoSectorCategory(metadata,categories);category_name=selected?.name||'';category_id=selected?.category_id||'';}
 const match=Array.isArray(categories)&&categories.filter(r=>r.category_id===category_id&&r.name===category_name).length===1;
 const quotes=match?await get('CATEGORY_QUOTES',`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&category=${category_id}&order=market_cap_desc&per_page=100&page=1&sparkline=false`):null;
 const normalized=normalizeCoingeckoSector({metadata,categories,quotes,identity,contract,coin_id,category_id,category_name,observed_ts:Date.now()});
 const result={version:COINGECKO_SECTOR_VERSION,...normalized,...(receipts.some(r=>r.status!=='RECEIVED')?{status:'SOURCE_NOT_CLOSED'}:{}),...(providerBackoff?{status:providerBackoff.status}:{}),network_calls:calls,receipts,admission,whole_job_admission,minute_admission:minute,internal_only:true,free_only:true,monthly_module_bound:1488};
 const expires=normalized.status==='CLOSED'?normalized.evidence[0].expires_at:now+900000;
 await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:key,observed_ts:now,expires_ts:expires,payload:result});
 if(providerBackoff)await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:'PROVIDER_BACKOFF',observed_ts:now,expires_ts:providerBackoff.backoff_until,payload:providerBackoff});
 return result;
}
