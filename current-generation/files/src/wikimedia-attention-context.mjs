import crypto from 'node:crypto';
import {exactNativeSectorBinding} from './coingecko-sector-evidence.mjs';
import {buildEvidenceV2,SOURCE_POLICIES} from './evidence-source-adapters.mjs';
import {installEvidenceSourceStore,readEvidenceSourceCache,writeEvidenceSourceCache,reserveEvidenceSourceAttempts} from './evidence-source-store.mjs';
import {installProviderMinuteLedger,reserveProviderMinuteUnits} from './provider-minute-ledger.mjs';
export const WIKIMEDIA_ATTENTION_VERSION='wikimedia-attention-v1-20261005';
export const WIKIMEDIA_LIMITS=Object.freeze({published_user_agent_requests_per_minute:200,published_day_cap:null,published_month_cap:null,key_required:false,credit_cost:0,license:'CC0-1.0',internal_minute_cap:2,internal_daily_cap:12,ordinary_daily_cap:8,internal_31day_max:372,cache_ms:6*3600000,retries:0,timeout_ms:8000});
const SOURCE='WIKIMEDIA_ATTENTION',DAY=86400000,hash=s=>crypto.createHash('sha256').update(String(s)).digest('hex'),fmt=ts=>new Date(ts).toISOString().slice(0,10).replaceAll('-','')+'00';
// Exact encyclopedia page, not a ticker/full-text search. Additional page-view
// context only; the blockchain's native asset remains bound by the HTX registry.
export function exactWikimediaPage({contract,asset_identity}={}){return contract==='ADA-USDT'&&asset_identity?.chain==='cardano'&&exactNativeSectorBinding(asset_identity,contract)?'Cardano_(blockchain_platform)':null;}
export function normalizeWikimediaAttention({contract,asset_identity,payload,observed_ts}={}){
 const page=exactWikimediaPage({contract,asset_identity}),items=payload?.items;
 if(!page)return{status:'EXACT_VERIFIED_PAGE_BINDING_REQUIRED',evidence:[]};
 if(!Number.isSafeInteger(observed_ts)||!Array.isArray(items)||items.length!==14)return{status:'COMPLETE_DAILY_PAGEVIEW_WINDOW_REQUIRED',evidence:[]};
 const lastStart=Math.floor(observed_ts/DAY)*DAY-2*DAY,firstStart=lastStart-13*DAY,rows=items.slice().sort((a,b)=>String(a.timestamp).localeCompare(String(b.timestamp)));
 for(let i=0;i<14;i++){const r=rows[i];if(r.project!=='en.wikipedia'||r.article!==page||r.access!=='all-access'||r.agent!=='user'||r.granularity!=='daily'||r.timestamp!==fmt(firstStart+i*DAY)||!Number.isSafeInteger(r.views)||r.views<0)return{status:'EXACT_COMPLETE_PAGEVIEW_SERIES_REQUIRED',evidence:[]};}
 const previous=rows.slice(0,7).reduce((n,r)=>n+r.views,0),recent=rows.slice(7).reduce((n,r)=>n+r.views,0),end=lastStart+DAY,delta=previous?100*(recent/previous-1):null;
 if(!Number.isSafeInteger(previous)||!Number.isSafeInteger(recent))return{status:'EXACT_PAGEVIEW_TOTALS_REQUIRED',evidence:[]};
 const evidence=buildEvidenceV2({provider_id:SOURCE,upstream_id:'WIKIMEDIA_AQS_PAGEVIEWS',asset_id:'cardano:native:mainnet',htx_contract:contract,block_id:'N06',metric_family:'ENCYCLOPEDIA_PAGEVIEW_CONTEXT',origin_event_id:`${page}:${fmt(firstStart)}:${fmt(lastStart)}`,dependency_group:`WIKIMEDIA_PAGEVIEWS:${page}:${end}`,source_ts:end,observed_ts,expires_at:observed_ts+WIKIMEDIA_LIMITS.cache_ms,coverage_status:'EXACT_PAGE_14_COMPLETE_UTC_DAYS',coverage_fraction:0,directional_strength:null,risk_strength:null,unit:'pageviews',value:recent,extra:{article:page,project:'en.wikipedia.org',page_url:'https://en.wikipedia.org/wiki/Cardano_(blockchain_platform)',window_start:firstStart,window_end:end,previous_7day_views:previous,recent_7day_views:recent,change_pct:delta,day_count:14,agent:'user',source_clock_policy:'PUBLISHED_COMPLETE_UTC_DAILY_PAGEVIEW_ROWS',unique_traders_claim:false,directional_vote:false,provider_role:'ADDITIONAL_ATTENTION_CONTEXT',series_sha256:hash(JSON.stringify(rows))}});
 return{version:WIKIMEDIA_ATTENTION_VERSION,status:'CLOSED',contract,evidence:[evidence],summary:{recent_7day_views:recent,previous_7day_views:previous,change_pct:delta,day_count:14,window_end:end},internal_only:true};
}
export async function collectWikimediaAttention({db,fetch_impl=globalThis.fetch,request_admit,contract,run_id,asset_identity,now=Date.now(),clock=Date.now,strict_fresh_manual=false}={}){
 const page=exactWikimediaPage({contract,asset_identity});if(!page)return{status:'EXACT_VERIFIED_PAGE_BINDING_REQUIRED',network_calls:0,evidence:[]};
 await installEvidenceSourceStore(db);const key=`${WIKIMEDIA_ATTENTION_VERSION}:${page}`,cached=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:key,now});if(!strict_fresh_manual&&cached?.version===WIKIMEDIA_ATTENTION_VERSION)return cached;
 const backoff=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:'GLOBAL_BACKOFF',now});if(backoff)return{...backoff,evidence:[],network_calls:0,admission:{allowed:false,status:backoff.status}};
 const id=`WIKI:${run_id}:${contract}`,whole=request_admit?.({logical_request_id:id,lane:'background',attempts:1});if(whole?.allowed!==true||whole.duplicate)return{status:whole?.status||'WHOLE_JOB_HTTP_ADMISSION_REQUIRED',network_calls:0,evidence:[],admission:whole};
 let admission=await reserveEvidenceSourceAttempts(db,{source:SOURCE,reservation_id:id,attempts:1,daily_cap:strict_fresh_manual?WIKIMEDIA_LIMITS.internal_daily_cap:WIKIMEDIA_LIMITS.ordinary_daily_cap,now});if(!admission.allowed)return{status:admission.status,network_calls:0,evidence:[],admission};
 await installProviderMinuteLedger(db);admission=await reserveProviderMinuteUnits(db,{provider:SOURCE,reservation_id:id,units:1,cap:WIKIMEDIA_LIMITS.internal_minute_cap,now});if(!admission.allowed)return{status:admission.status,network_calls:0,evidence:[],admission};
 const last=Math.floor(now/DAY)*DAY-2*DAY,url=`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia.org/all-access/user/${encodeURIComponent(page)}/daily/${fmt(last-13*DAY)}/${fmt(last)}`;
 try{
  const response=await fetch_impl(url,{headers:{accept:'application/json','user-agent':'My-Report-2/1.0 (https://github.com/kovalev23091987-jpg/my-report-2-cloud-runner)'},redirect:'error',signal:AbortSignal.timeout(WIKIMEDIA_LIMITS.timeout_ms)}),body=await response.text(),observed=clock();
  if([429,503,403,451].includes(response.status)){const h=response.headers?.get?.('retry-after'),seconds=/^\d+$/.test(h||'')?Number(h):null,date=Date.parse(h||''),until=Math.max(observed+3600000,seconds===null?Number.isFinite(date)?date:0:observed+seconds*1000),status=response.status===429?'PROVIDER_RATE_LIMITED':'SOURCE_ACCESS_BACKOFF';await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:'GLOBAL_BACKOFF',observed_ts:observed,expires_ts:until,payload:{status,until_ts:until}});return{status,evidence:[],network_calls:1,receipts:[{http_status:response.status}],admission};}
  let payload;try{if(Buffer.byteLength(body)>100000)throw Error('RESPONSE_TOO_LARGE');payload=JSON.parse(body);}catch{return{status:'SOURCE_SCHEMA_INVALID',evidence:[],network_calls:1,receipts:[{http_status:response.status}],admission};}
  const normalized=response.ok?normalizeWikimediaAttention({contract,asset_identity,payload,observed_ts:observed}):{status:'SOURCE_ERROR',evidence:[]},result={...normalized,network_calls:1,admission,cache_status:'REFRESHED',receipts:[{route:'EXACT_PAGE_DAILY_VIEWS',http_status:response.status,body_sha256:hash(body)}]};if(result.status==='CLOSED')await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:key,observed_ts:observed,expires_ts:observed+WIKIMEDIA_LIMITS.cache_ms,payload:result});return result;
 }catch(e){return{status:'SOURCE_ERROR',error:String(e.message).slice(0,160),evidence:[],network_calls:1,admission};}
}
