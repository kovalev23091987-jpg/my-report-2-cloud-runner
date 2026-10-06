import crypto from 'node:crypto';
import {exactNativeSectorBinding,COINGECKO_ASSET_PLATFORMS,verifyCoingeckoSectorIdentity} from './coingecko-sector-evidence.mjs';
import {buildEvidenceV2,SOURCE_POLICIES} from './evidence-source-adapters.mjs';
import {installEvidenceSourceStore,readEvidenceSourceCache,writeEvidenceSourceCache,reserveEvidenceSourceAttempts} from './evidence-source-store.mjs';
export const PUBLISHED_TOKEN_CALENDAR_VERSION='published-token-calendar-v1-exact-provider-context-20261006';
const SOURCE='DEFILLAMA_PUBLISHED_CALENDAR',TTL=6*60*60_000,MAX_AGE=24*60*60_000,MAX_BODY=4*1024*1024;
const hash=v=>crypto.createHash('sha256').update(v).digest('hex'),clean=v=>String(v??'').trim();
const validId=v=>/^[a-z0-9][a-z0-9-]{1,99}$/.test(v),safeTs=v=>Number.isSafeInteger(v)&&v>0;
export function publishedCalendarCandidateEligible({contract,asset_identity:identity}={}){
 if(!/^[^\s-]{1,32}-USDT$/u.test(contract||''))return false;
 return Boolean(exactNativeSectorBinding(identity,contract))||Boolean(COINGECKO_ASSET_PLATFORMS[identity?.chain]&&(identity.chain==='solana'?/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(identity.contract_or_mint||''):/^0x[0-9a-f]{40}$/i.test(identity.contract_or_mint||'')));
}
export async function resolvePublishedCalendarReference({db,contract,asset_identity:identity,asset_metadata={},now=Date.now()}={}){
 if(!publishedCalendarCandidateEligible({contract,asset_identity:identity}))return null;
 const native=exactNativeSectorBinding(identity,contract);
 if(native)return {coin_id:native.coin_id,asset_id:`${identity.chain}:native:mainnet`,contract,identity,method:'EXISTING_EXACT_NATIVE_CHAIN_BINDING'};
 const id=clean(asset_metadata.coingecko_id),platform=COINGECKO_ASSET_PLATFORMS[identity.chain];
 if(id&&!validId(id))return null;
 const url=id?`https://api.coingecko.com/api/v3/coins/${id}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false`:`https://api.coingecko.com/api/v3/coins/${platform}/contract/${encodeURIComponent(identity.contract_or_mint)}`;
 const cached=await readEvidenceSourceCache(db,{source:'COINGECKO_SECTOR',asset_key:`REFERENCE:provider-reference-cache-v1-20261004:${hash(url)}`,now});
 if(cached?.version!=='provider-reference-cache-v1-20261004'||cached.url!==url||!safeTs(cached.received_ts)||cached.received_ts>now||!safeTs(cached.expires_ts)||now>=Math.min(cached.expires_ts,cached.received_ts+TTL)||typeof cached.body!=='string'||cached.body.length>2*1024*1024||hash(cached.body)!==cached.body_sha256)return null;
 let metadata;try{metadata=JSON.parse(cached.body);}catch{return null;}
 const coin_id=clean(metadata?.id);
 if(!validId(coin_id)||id&&coin_id!==id||!verifyCoingeckoSectorIdentity(metadata,{identity,contract,coin_id,category_name:null}))return null;
 return {coin_id,asset_id:`${identity.chain}:${identity.contract_or_mint}`,contract,identity,method:'VALIDATED_ALREADY_RECEIVED_EXACT_COINGECKO_ADDRESS_METADATA',metadata_body_sha256:cached.body_sha256,metadata_received_ts:cached.received_ts,verified_metadata:{id:metadata.id,symbol:metadata.symbol,categories:metadata.categories,platforms:metadata.platforms}};
}
export function extractPublishedCalendarPage(body){
 if(typeof body!=='string'||Buffer.byteLength(body)>MAX_BODY)return null;
 const match=body.match(/<script\s+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
 let page;try{page=JSON.parse(match?.[1]||'').props.pageProps;}catch{return null;}
 const e=page?.emissions;if(!e||typeof e!=='object')return null;
 // Preserve the exact received calendar fields; charts, market prices and past
 // events are not needed, not inferred, and never persisted as a fresh signal.
 return {generatedAtSec:page.generatedAtSec,pageClockSec:page.pageClockSec,canonicalProtocol:page.canonicalProtocol,emissions:{geckoId:e.geckoId,meta:{gecko_id:e.meta?.gecko_id},token:e.token,name:e.name,tokenPrice:{symbol:e.tokenPrice?.symbol},upcomingEvent:e.upcomingEvent,notes:e.notes,forecastSections:e.forecastSections}};
}
export function derivePublishedCalendarContext({page,reference,observed_ts,now=observed_ts}={}){
 const native=reference&&exactNativeSectorBinding(reference.identity,reference.contract);
 const exactReference=native?reference.method==='EXISTING_EXACT_NATIVE_CHAIN_BINDING'&&reference.coin_id===native.coin_id&&reference.asset_id===`${reference.identity.chain}:native:mainnet`:reference&&reference.method==='VALIDATED_ALREADY_RECEIVED_EXACT_COINGECKO_ADDRESS_METADATA'&&reference.asset_id===`${reference.identity?.chain}:${reference.identity?.contract_or_mint}`&&safeTs(reference.metadata_received_ts)&&reference.metadata_received_ts<=observed_ts&&verifyCoingeckoSectorIdentity(reference.verified_metadata,{identity:reference.identity,contract:reference.contract,coin_id:reference.coin_id,category_name:null});
 if(!exactReference)return null;
 const e=page?.emissions,source_ts=Number(page?.generatedAtSec)*1000;
 if(!reference||!validId(reference.coin_id)||!safeTs(observed_ts)||!safeTs(now)||observed_ts>now||!safeTs(source_ts)||source_ts>observed_ts||now-source_ts>MAX_AGE||!validId(page.canonicalProtocol)||e?.geckoId!==reference.coin_id||e?.meta?.gecko_id!==reference.coin_id||e?.token!==`coingecko:${reference.coin_id}`||clean(e?.tokenPrice?.symbol).toUpperCase()!==reference.contract.slice(0,-5)||!Array.isArray(e.upcomingEvent)||e.upcomingEvent.length>100||!Array.isArray(e.notes)||e.notes.length>20||e.notes.some(n=>typeof n!=='string'||n.length>2000)||!Array.isArray(e.forecastSections))return null;
 const events=[],seen=new Set();
 for(const event of e.upcomingEvent){
  const ts=Number(event?.timestamp)*1000;if(!safeTs(ts)||ts<=now||ts>now+31*24*60*60_000)continue;
  // Linear rates and modelled rewards require a different unit interpretation.
  // They cannot be added to a one-off cliff amount.
  if(event.unlockType!=='cliff'||!Array.isArray(event.noOfTokens)||event.noOfTokens.length!==1)continue;
  const amount=event.noOfTokens[0],category=clean(event.category),description=clean(event.description);
  if(typeof amount!=='number'||!Number.isFinite(amount)||amount<=0||!category||category.length>100||!description||description.length>1000)return null;
  const key=JSON.stringify([ts,category,description]);if(seen.has(key))return null;seen.add(key);
  events.push({effective_at:ts,amount_tokens:amount,category,description,unlock_type:'cliff'});
 }
 if(!events.length)return null;
 events.sort((a,b)=>a.effective_at-b.effective_at||a.category.localeCompare(b.category)||a.description.localeCompare(b.description));
 return {coin_id:reference.coin_id,asset_id:reference.asset_id,source_ts,observed_ts,source_url:`https://defillama.com/unlocks/${page.canonicalProtocol}`,events,notes:e.notes,forecast_sections:e.forecastSections,interpretation:'PROVIDER_PUBLISHED_FUTURE_CLIFF_CALENDAR_NOT_OBSERVED_UNLOCK',token_unit:reference.contract.slice(0,-5),official_confirmation:false,actual_unlock_transfer_verified:false,score_contribution:0,entry_authorized:false};
}
export function normalizePublishedCalendar({page,reference,observed_ts,document_sha256}={}){
 const context=derivePublishedCalendarContext({page,reference,observed_ts});
 if(!context||!/^[0-9a-f]{64}$/.test(document_sha256||''))return {status:'EXACT_USABLE_PUBLISHED_CALENDAR_NOT_CONFIRMED',evidence:[],check_completed:false};
 const evidence=buildEvidenceV2({provider_id:SOURCE,upstream_id:'DEFILLAMA_PUBLISHED_VESTING_CALENDAR',asset_id:reference.asset_id,htx_contract:reference.contract,block_id:'N01',metric_family:'PROVIDER_PUBLISHED_FUTURE_TOKEN_CALENDAR',origin_event_id:`${reference.coin_id}:${document_sha256}`,dependency_group:`PUBLISHED_VESTING:${reference.coin_id}:${document_sha256}`,source_ts:context.source_ts,observed_ts,expires_at:Math.min(observed_ts+TTL,context.source_ts+MAX_AGE),coverage_status:'ADDITIONAL_PROVIDER_CALENDAR_NOT_OFFICIAL_EXECUTION',coverage_fraction:0,directional_strength:null,risk_strength:null,extra:{provider_calendar_page:page,provider_asset_reference:reference,calendar_context:context,document_sha256,source_clock_policy:'PUBLIC_PAGE_GENERATION_NOT_UNLOCK_EXECUTION',actual_unlock_transfer_verified:false,official_confirmation:false,entry_authorized:false,score_contribution:0}});
 return {version:PUBLISHED_TOKEN_CALENDAR_VERSION,status:'CLOSED',evidence:[evidence],context,check_completed:true,internal_only:true};
}
export async function collectPublishedTokenCalendar(params={}){
 const {db,contract,run_id,request_admit,fetch_impl=globalThis.fetch,now=Date.now(),clock=Date.now,strict_fresh_manual=false}=params;
 await installEvidenceSourceStore(db);
 const reference=await resolvePublishedCalendarReference({...params,now});
 if(!reference)return {status:'EXACT_ALREADY_VERIFIED_PROVIDER_ID_REQUIRED',evidence:[],network_calls:0,check_completed:false,internal_only:true};
 const url=`https://defillama.com/unlocks/${reference.coin_id}`,key=`${PUBLISHED_TOKEN_CALENDAR_VERSION}:${contract}:${reference.asset_id}:${url}`;
 const cached=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:key,now});
 if(!strict_fresh_manual&&cached?.version===PUBLISHED_TOKEN_CALENDAR_VERSION&&cached.status==='CLOSED'&&cached.evidence?.length===1&&cached.evidence[0].htx_contract===contract&&cached.evidence[0].asset_id===reference.asset_id&&derivePublishedCalendarContext({page:cached.evidence[0].provider_calendar_page,reference,observed_ts:cached.evidence[0].observed_ts,now})&&cached.evidence[0].expires_at>=now)return {...cached,network_calls:0,cache_status:'VALIDATED_ORIGINAL_CALENDAR_CONTEXT'};
 if(!strict_fresh_manual&&cached?.status==='PUBLISHED_CALENDAR_PROVIDER_ROUTE_NOT_FOUND'&&cached.url===url)return{...cached,network_calls:0,cache_status:'VALIDATED_PROVIDER_ROUTE_NEGATIVE_CACHE'};
 const backoff=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:'PROVIDER_BACKOFF',now});if(backoff)return{status:backoff.status,evidence:[],network_calls:0,check_completed:false};
 const reservation_id=`EV2:${SOURCE}:${run_id}:${hash(key)}`,whole=request_admit?.({logical_request_id:reservation_id,lane:'background',attempts:1});
 if(whole?.allowed!==true||whole.duplicate===true)return{status:whole?.duplicate?'ALREADY_RESERVED_NO_REDISPATCH':whole?.status||'SOURCE_ADMISSION_REQUIRED',evidence:[],network_calls:0,check_completed:false};
 const admission=await reserveEvidenceSourceAttempts(db,{source:SOURCE,reservation_id,attempts:1,daily_cap:SOURCE_POLICIES[SOURCE].daily_cap,now});if(!admission.allowed)return{status:admission.status,evidence:[],network_calls:0,check_completed:false,admission};
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);let result;
 try{
  const response=await fetch_impl(url,{redirect:'error',headers:{accept:'text/html'},signal:controller.signal});
  if(!response.ok){const status=response.status===404?'PUBLISHED_CALENDAR_PROVIDER_ROUTE_NOT_FOUND':[401,403,429,451].includes(response.status)?'PUBLISHED_CALENDAR_ACCESS_OR_RATE_BLOCKED':'PUBLISHED_CALENDAR_SOURCE_ERROR';if([401,403,429,451].includes(response.status))await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:'PROVIDER_BACKOFF',observed_ts:now,expires_ts:now+TTL,payload:{status}});result={status,evidence:[],check_completed:false,receipts:[{url,http_status:response.status}]};}
  else{const chunks=[];let bytes=0;for await(const chunk of response.body){bytes+=chunk.byteLength;if(bytes>MAX_BODY){controller.abort();throw Error('PUBLISHED_CALENDAR_BODY_BOUND_EXCEEDED');}chunks.push(Buffer.from(chunk));}const body=Buffer.concat(chunks).toString('utf8'),observed_ts=clock(),document_sha256=hash(body),page=extractPublishedCalendarPage(body);result={...normalizePublishedCalendar({page,reference,observed_ts,document_sha256}),receipts:[{url,http_status:response.status,received_ts:observed_ts,body_sha256:document_sha256,bytes}]};}
 }catch(e){result={status:'PUBLISHED_CALENDAR_SOURCE_NOT_CLOSED',reason:String(e.message).slice(0,160),evidence:[],check_completed:false};}finally{clearTimeout(timer);}
 result={...result,network_calls:1,admission,internal_only:true};
 if(result.status==='PUBLISHED_CALENDAR_PROVIDER_ROUTE_NOT_FOUND')await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:key,observed_ts:now,expires_ts:now+TTL,payload:{...result,url}});
 if(result.status==='CLOSED'&&Buffer.byteLength(JSON.stringify(result))<=16000)await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:key,observed_ts:result.evidence[0].observed_ts,expires_ts:result.evidence[0].expires_at,payload:result});
 return result;
}
