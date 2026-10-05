import {COINPAPRIKA_HTX_MARKETS_URL,coinpaprikaHtxMarketRows,normalizeCoinpaprikaProviderReference,verifyCoinpaprikaProviderReference} from './coinpaprika-htx-identity.mjs';
import {normalizeCoinpaprikaMarketSupply} from './coinpaprika-market-supply.mjs';
import {buildEvidenceV2,SOURCE_POLICIES} from './evidence-source-adapters.mjs';
import {installEvidenceSourceStore,readEvidenceSourceCache,writeEvidenceSourceCache} from './evidence-source-store.mjs';
import {createProviderReferenceReader} from './provider-reference-cache.mjs';
export const COINPAPRIKA_SECTOR_VERSION='coinpaprika-sector-v8-project-activity-market-reference-20261005';
const SOURCE='COINPAPRIKA_SECTOR',MAX_AGE=15*60000,PLATFORMS={ethereum:'eth-ethereum',solana:'sol-solana'},clean=v=>String(v??'').trim(),finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null,clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
export function verifyCoinpaprikaIdentity(metadata,{identity,base,coin_id,tag_id}={}){
 const platform=PLATFORMS[identity?.chain],address=clean(identity?.contract_or_mint);if(!platform||!address||metadata?.id!==coin_id||metadata?.symbol!==base||metadata?.is_active!==true)return false;
 const contracts=Array.isArray(metadata.contracts)?metadata.contracts:[];return contracts.some(r=>r?.platform===platform&&(identity.chain==='solana'?r.contract===address:clean(r.contract).toLowerCase()===address.toLowerCase()));
}
// Select only a provider-declared functional category also present on the exact
// verified asset. A consensus algorithm/ecosystem tag is never a sector fallback.
export function comparableCoinpaprikaFunctionalTag(row){
 // Provider "functional" includes investor/regulatory themes and consensus
 // mechanics in actual responses. These are not project-activity sectors.
 const id=clean(row?.id);
 return row?.type==='functional'&&!/^(?:alleged-|made-in-|recently-|presale$|defunct$|wrapped-token$|personal-token$|celebrity-tokens$|binance-launch(?:pad|pool)$)/.test(id)&&!/(?:-portfolio|-holdings|-token$)/.test(id)&&!['cryptocurrency','pos','staking','restaking','liquid-restaking-tokens','sharding','scalable','high-transaction-speed-tps','feeless','open-source','governance','cosmos','substrate','metis-andromeda','wbet','dapps-token'].includes(id);
}
export function selectCoinpaprikaFunctionalSector(metadata,directory){
 if(!Array.isArray(metadata?.tags)||!Array.isArray(directory))return null;
 const declared=new Set(metadata.tags.map(row=>clean(row?.id)));
 const counts=new Map();for(const row of directory)counts.set(row?.id,(counts.get(row?.id)||0)+1);
 const eligible=directory.filter(row=>declared.has(row?.id)&&counts.get(row.id)===1&&comparableCoinpaprikaFunctionalTag(row)&&/^[a-z0-9-]{3,80}$/.test(row.id));
 return eligible.sort((a,b)=>a.id.localeCompare(b.id))[0]||null;
}
export function normalizeCoinpaprikaSector({metadata,tag,tickers,identity,provider_reference=null,contract,coin_id,tag_id,observed_ts=Date.now()}={}){
 const base=clean(contract).replace(/-USDT$/,'');if(!(provider_reference?verifyCoinpaprikaProviderReference(provider_reference,contract,observed_ts)&&provider_reference.coinpaprika_id===coin_id&&metadata?.id===coin_id&&metadata?.symbol===base&&metadata?.is_active===true:verifyCoinpaprikaIdentity(metadata,{identity,base,coin_id,tag_id}))||tag?.id!==tag_id||!comparableCoinpaprikaFunctionalTag(tag)||!Array.isArray(tag?.coins)||!tag.coins.includes(coin_id)||!Array.isArray(tickers))return{status:'EXACT_ASSET_AND_FUNCTIONAL_SECTOR_REQUIRED',evidence:[],summary:{tag_id:tag?.id,tag_type:tag?.type,members_are_array:Array.isArray(tag?.coins),contains_target:Array.isArray(tag?.coins)&&tag.coins.includes(coin_id),metadata_active:metadata?.is_active,ticker_rows:Array.isArray(tickers)?tickers.length:0,tag_member_sample:Array.isArray(tag?.coins)?tag.coins.slice(0,6):null}};
 const ids=new Set(tag.coins),duplicates=new Set(),byId=new Map();for(const r of tickers){if(byId.has(r?.id))duplicates.add(r.id);byId.set(r?.id,r);}
 const valid=r=>{const ts=Date.parse(r?.last_updated),q=r?.quotes?.USD,change=finite(q?.percent_change_24h);return r&&!duplicates.has(r.id)&&Number.isFinite(ts)&&ts<=observed_ts&&observed_ts-ts<=MAX_AGE&&finite(q?.price)>0&&change!==null&&finite(q?.volume_24h)>=100000?{id:r.id,symbol:r.symbol,source_ts:ts,change_24h_pct:change,quote:'USD_AGGREGATED'}:null;};
 const target=valid(byId.get(coin_id));if(!target||target.symbol!==base)return{status:'EXACT_FRESH_TARGET_QUOTE_REQUIRED',evidence:[],summary:null};
 const symbolCounts=new Map();for(const id of ids){const symbol=byId.get(id)?.symbol;if(symbol)symbolCounts.set(symbol,(symbolCounts.get(symbol)||0)+1);}
 const peers=[...ids].filter(id=>id!==coin_id).map(id=>valid(byId.get(id))).filter(r=>r&&r.symbol!==base&&symbolCounts.get(r.symbol)===1&&Math.abs(r.source_ts-target.source_ts)<=2*60000).sort((a,b)=>a.id.localeCompare(b.id)).slice(0,50);
 if(peers.length<3)return{status:'INSUFFICIENT_FRESH_SECTOR_PEERS',evidence:[],summary:{eligible_peers:peers.length,tag_members:ids.size,free_tier_assets_limited:true}};
 const sorted=peers.map(r=>r.change_24h_pct).sort((a,b)=>a-b),mid=Math.floor(sorted.length/2),median=sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2,source_ts=Math.min(target.source_ts,...peers.map(r=>r.source_ts)),relative=target.change_24h_pct-median,peerCoverage=peers.length/Math.max(1,ids.size-1),summary={coin_id,tag_id,target_source_ts:target.source_ts,target_change_24h_pct:target.change_24h_pct,peer_median_change_24h_pct:median,relative_strength_pct_points:relative,eligible_peers:peers.length,tag_members:ids.size,peer_coverage_fraction:peerCoverage,free_tier_assets_limited:true,source_ts,window:'PROVIDER_ROLLING_24H_AT_NEAR_SYNCHRONOUS_QUOTES',quote:'USD_AGGREGATED_NOT_HTX_EXECUTION_PRICE',direction_neutral:false,entry_eligible:false,is_htx_price:false};
 const evidence=buildEvidenceV2({provider_id:SOURCE,upstream_id:'COINPAPRIKA_AGGREGATED_VENUES',asset_id:provider_reference?.asset_id||`${identity.chain}:${identity.contract_or_mint}`,htx_contract:contract,block_id:'N15',metric_family:'SECTOR_RELATIVE_STRENGTH_CONTEXT',origin_event_id:`${coin_id}:${tag_id}:${target.source_ts}`,dependency_group:`COINPAPRIKA_SECTOR:${coin_id}:${tag_id}:${target.source_ts}`,source_ts,observed_ts,expires_at:Math.min(observed_ts+5*60000,source_ts+MAX_AGE),coverage_status:'PARTIAL_FREE_TIER_DIRECTIONAL_CONTEXT',coverage_fraction:clamp(peerCoverage,.15,.75),directional_strength:clamp(relative/10,-1,1),risk_strength:null,extra:{...summary,peers,...(provider_reference?{provider_reference,category_name:tag.name,provider_tag:{id:tag.id,type:tag.type,name:tag.name,coins:tag.coins}}:{}),sector_proof:'EXACT_ASSET_CATEGORY_AND_QUOTE_BASKET_V1',direction_policy:'RELATIVE_STRENGTH_SUPPORTS_LONG_RELATIVE_WEAKNESS_SUPPORTS_SHORT_LOW_WEIGHT'}});
 return{status:'CLOSED',evidence:[evidence],summary};
}
export async function collectCoinpaprikaSectorEvidence({db,fetch_impl=globalThis.fetch,request_admit,contract,run_id,asset_identity,asset_metadata,now=Date.now(),strict_fresh_manual=false}={}){
 const base=clean(contract).replace(/-USDT$/,''),existingChain=Boolean(PLATFORMS[asset_identity?.chain]&&asset_identity?.contract_or_mint);
 let coin_id=clean(asset_metadata?.coinpaprika_id),tag_id=clean(asset_metadata?.sector_tag);const pinned=Boolean(tag_id),marketDiscovery=!existingChain||!coin_id;
 if(!db?.prepare||!/^\S{1,32}-USDT$/u.test(contract)||(pinned&&!/^[a-z0-9-]{3,80}$/.test(tag_id)))return{status:'EXACT_SECTOR_REGISTRY_REQUIRED',evidence:[],network_calls:0};
 await installEvidenceSourceStore(db);
 const key=marketDiscovery?`${contract}:PROVIDER_MARKET_REFERENCE:${coin_id||'DISCOVERY'}:${tag_id}`:`${contract}:${asset_identity.chain}:${asset_identity.contract_or_mint}:${coin_id}:${tag_id}`;
 const cached=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:key,now});
 if(!strict_fresh_manual&&cached?.version===COINPAPRIKA_SECTOR_VERSION)return{...cached,contract};
 const backoff=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:'PROVIDER_BACKOFF',now});if(backoff)return{status:backoff.status,evidence:[],network_calls:0,backoff_until:backoff.backoff_until};
 const reader=createProviderReferenceReader({db,source:SOURCE,run_id,request_admit,fetch_impl,now,clock:Date.now,daily_cap:SOURCE_POLICIES[SOURCE].daily_cap});
 const request=async(route,url,ttl_ms=0)=>reader.get(route,url,{ttl_ms,max_bytes:6*1024*1024,max_cache_bytes:route==='FREE_AGGREGATED_QUOTES'?16384:6*1024*1024,bypass_cache:strict_fresh_manual&&['FREE_AGGREGATED_QUOTES','EXACT_ASSET_SUPPLY_TICKER'].includes(route),shape:v=>v&&typeof v==='object'});
 const finish=async(result)=>{
  const summary=reader.summary(),final={version:COINPAPRIKA_SECTOR_VERSION,...result,...(!summary.admission.allowed?{status:summary.admission.status}:{}),...(summary.provider_backoff?{status:summary.provider_backoff.status}:{}),...summary,internal_only:true,free_only:true,monthly_module_bound:48*31,official_free_monthly_requests:20000};
  if(summary.provider_backoff)await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:'PROVIDER_BACKOFF',observed_ts:now,expires_ts:summary.provider_backoff.backoff_until,payload:summary.provider_backoff});
  const expiry=result.evidence?.length?Math.min(...result.evidence.map(r=>r.expires_at)):now+15*60000;
  if(expiry>now)await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:key,observed_ts:now,expires_ts:expiry,payload:final});
  return final;
 };
 let catalog=null,metadata=null,reference=null;
 if(marketDiscovery){
  catalog=await request('HTX_MARKET_CATALOG',COINPAPRIKA_HTX_MARKETS_URL,6*3600000);
  if(!Array.isArray(catalog))return finish({status:'COINPAPRIKA_HTX_MARKETS_NOT_CLOSED',evidence:[]});
  const rows=coinpaprikaHtxMarketRows(catalog,contract);
  const ids=[...new Set(rows.map(r=>clean(r.base_currency_id)))];
  if(ids.length!==1||!/^[a-z0-9][a-z0-9-]{2,79}$/.test(ids[0]))return finish({status:rows.length?'AMBIGUOUS_COINPAPRIKA_HTX_MARKET_IDENTITY':'NO_EXACT_HTX_SPOT_MARKET_IN_COINPAPRIKA',evidence:[]});
  if(coin_id&&coin_id!==ids[0])return finish({status:'DECLARED_PROVIDER_ID_CONFLICTS_WITH_HTX_MARKET',evidence:[]});
  coin_id=ids[0];
 }
 if(!/^[a-z0-9][a-z0-9-]{2,79}$/.test(coin_id))return finish({status:'EXACT_SECTOR_REGISTRY_REQUIRED',evidence:[]});
 metadata=await request('EXACT_COIN_METADATA',`https://api.coinpaprika.com/v1/coins/${encodeURIComponent(coin_id)}`,21600000);
 if(marketDiscovery){
  reference=normalizeCoinpaprikaProviderReference({markets:catalog,metadata,contract});
  reference.reference_observed_ts=Math.min(...reader.summary().receipts.filter(r=>['HTX_MARKET_CATALOG','EXACT_COIN_METADATA'].includes(r.route)).map(r=>r.received_ts));
  if(!verifyCoinpaprikaProviderReference(reference,contract,Date.now()))return finish({status:reference.status==='CLOSED_PROVIDER_MARKET_REFERENCE'?'PROVIDER_REFERENCE_CLOCK_NOT_CLOSED':reference.status,evidence:[]});
 }else if(!verifyCoinpaprikaIdentity(metadata,{identity:asset_identity,base,coin_id,tag_id}))return finish({status:'EXACT_ASSET_AND_SECTOR_IDENTITY_NOT_CLOSED',evidence:[]});
 if(!pinned){
  const directory=await request('FUNCTIONAL_SECTOR_DIRECTORY','https://api.coinpaprika.com/v1/tags',21600000);
  const selected=selectCoinpaprikaFunctionalSector(metadata,directory);if(selected)tag_id=selected.id;
 }
 let tag=null,tickers=null,sectorResult={status:'EXACT_FUNCTIONAL_SECTOR_NOT_FOUND',evidence:[]};
 if(tag_id){
  tag=await request('FUNCTIONAL_SECTOR_MEMBERS',`https://api.coinpaprika.com/v1/tags/${encodeURIComponent(tag_id)}?additional_fields=coins`,3600000);
  if(tag?.id===tag_id&&comparableCoinpaprikaFunctionalTag(tag)&&Array.isArray(tag.coins)&&tag.coins.includes(coin_id)){
   tickers=await request('FREE_AGGREGATED_QUOTES','https://api.coinpaprika.com/v1/tickers?quotes=USD',60000);
   sectorResult=normalizeCoinpaprikaSector({metadata,tag,tickers,identity:asset_identity,provider_reference:reference,contract,coin_id,tag_id,observed_ts:Date.now()});
  }else sectorResult={status:'EXACT_FUNCTIONAL_SECTOR_MEMBERS_NOT_CLOSED',evidence:[]};
 }
 let ticker=Array.isArray(tickers)?tickers.filter(r=>r?.id===coin_id):[];
 // No extra ticker call when a present basket explicitly lacks the target:
 // that is a provider/free-tier coverage gap, not permission to spend more.
 if(reference&&!tickers){const t=await request('EXACT_ASSET_SUPPLY_TICKER',`https://api.coinpaprika.com/v1/tickers/${encodeURIComponent(coin_id)}`,60000);ticker=t?[t]:[];}
 const supply=reference&&ticker.length===1?normalizeCoinpaprikaMarketSupply({reference,ticker:ticker[0],contract,observed_ts:Date.now()}):{status:'EXACT_PROVIDER_SUPPLY_RECORD_NOT_CLOSED',evidence:[]};
 const evidence=[...supply.evidence,...sectorResult.evidence];
 return finish({status:evidence.length?'CLOSED':sectorResult.status,evidence,summary:sectorResult.summary||null,provider_reference:reference,supply_status:supply.status,sector_status:sectorResult.status,chain_route_authorized:false});
}
