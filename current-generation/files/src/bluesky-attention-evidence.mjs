import crypto from 'node:crypto';
import {normalizeAttentionSample,SOURCE_POLICIES} from './evidence-source-adapters.mjs';
import {installEvidenceSourceStore,reserveEvidenceSourceAttempts,readEvidenceSourceCache,writeEvidenceSourceCache} from './evidence-source-store.mjs';

export const BLUESKY_ATTENTION_EVIDENCE_VERSION='bluesky-attention-evidence-v2-api-host-20261001';
const SOURCE='BLUESKY_PUBLIC',TTL=SOURCE_POLICIES[SOURCE].ttl_ms,DAILY_CAP=SOURCE_POLICIES[SOURCE].daily_cap;
const text=value=>String(value??'').trim(),EVM=/^0x[0-9a-f]{40}$/i,BASE58=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const digest=value=>crypto.createHash('sha256').update(String(value)).digest('hex');
export const blueskyFailureStatus=httpStatus=>[401,403].includes(Number(httpStatus))?`ACCESS_BLOCKED_${Number(httpStatus)}`:'SOURCE_ERROR';
function exactIdentity(identity){const chain=text(identity?.chain).toLowerCase(),address=text(identity?.contract_or_mint);if(chain==='solana'&&BASE58.test(address))return{chain,address,case_sensitive:true};if(chain&&EVM.test(address))return{chain,address:address.toLowerCase(),case_sensitive:false};return null;}
const includesExact=(haystack,needle,caseSensitive)=>caseSensitive?text(haystack).includes(needle):text(haystack).toLowerCase().includes(needle.toLowerCase());

async function getJson(fetchImpl,url){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
 try{const response=await fetchImpl(url,{headers:{accept:'application/json','user-agent':'My-Report-2/bluesky-attention-v1'},signal:controller.signal});const payload=await response.json().catch(()=>null),detail=text(payload?.error||payload?.message).slice(0,80),schemaOk=payload!==null&&typeof payload==='object'&&!Array.isArray(payload)&&Array.isArray(payload.posts);return{ok:response.ok&&schemaOk,http_status:response.status,payload,error:response.ok&&!schemaOk?'INVALID_RESPONSE':response.ok?null:`HTTP_${response.status}${detail?`:${detail}`:''}`};}
 catch(error){return{ok:false,http_status:null,payload:null,error:String(error?.name==='AbortError'?'TIMEOUT':error?.message||error).slice(0,160)};}
 finally{clearTimeout(timer);}
}

export function normalizeBlueskyAttention({contract,identity,payload,window_start,window_end,history_windows=0,history_days=0,observed_ts=Date.now()}={}){
 const htxContract=text(contract).toUpperCase(),id=exactIdentity(identity);if(!id)return{status:'EXACT_ASSET_IDENTITY_REQUIRED',evidence:[],summary:null,internal_only:true};
 const rows=Array.isArray(payload?.posts)?payload.posts:[],seen=new Set(),posts=[];
 for(const row of rows){const uri=text(row?.uri),cid=text(row?.cid),did=text(row?.author?.did),body=text(row?.record?.text),key=uri||cid;if(!key||seen.has(key)||!did||!includesExact(body,id.address,id.case_sensitive))continue;seen.add(key);posts.push({uri,cid,did,body,created_at:text(row?.record?.createdAt),indexed_at:text(row?.indexedAt)});}
 const authors=new Map(),texts=new Map();for(const post of posts){authors.set(post.did,(authors.get(post.did)||0)+1);const bodyHash=digest(post.body.toLowerCase().replace(/\s+/g,' ').trim());texts.set(bodyHash,(texts.get(bodyHash)||0)+1);}
 const uniqueAuthors=authors.size,topAuthorPosts=Math.max(0,...authors.values()),topTextCopies=Math.max(0,...texts.values()),sampleSaturated=rows.length>=100||Boolean(text(payload?.cursor));
 const evidence=normalizeAttentionSample({provider_id:SOURCE,asset_id:`${id.chain}:${id.address}`,htx_contract:htxContract,window_start,window_end,unique_authors:uniqueAuthors,sample_saturated:sampleSaturated,history_windows,history_days,observed_ts});
 Object.assign(evidence,{chain:id.chain,token_address:id.address,original_post_count:posts.length,top_author_concentration:posts.length?topAuthorPosts/posts.length:0,duplicate_text_fraction:posts.length?topTextCopies/posts.length:0,query_identity:'EXACT_CONTRACT_OR_MINT',direction_policy:'ATTENTION_PRIORITY_ONLY_NO_DIRECTIONAL_VOTE'});
 return{status:'CLOSED',contract:htxContract,evidence:[evidence],summary:{unique_authors:uniqueAuthors,original_posts:posts.length,top_author_concentration:evidence.top_author_concentration,duplicate_text_fraction:evidence.duplicate_text_fraction,sample_saturated:sampleSaturated,history_windows,history_days},internal_only:true};
}

export async function collectBlueskyAttentionEvidence({db,fetch_impl=globalThis.fetch,request_admit,contract,run_id,asset_identity,now=Date.now(),strict_fresh_manual=false}={}){
 if(!db)throw new Error('BLUESKY_ATTENTION_DB_REQUIRED');const htxContract=text(contract).toUpperCase(),id=exactIdentity(asset_identity);if(!/^[^\s-]+-USDT$/u.test(htxContract)||!id)return{status:'EXACT_ASSET_IDENTITY_REQUIRED',evidence:[],network_calls:0,internal_only:true};
 await installEvidenceSourceStore(db);await db.prepare(`CREATE TABLE IF NOT EXISTS report2_social_attention_window(source TEXT NOT NULL,asset_key TEXT NOT NULL,window_start INTEGER NOT NULL,window_end INTEGER NOT NULL,unique_authors INTEGER NOT NULL,original_posts INTEGER NOT NULL,sample_saturated INTEGER NOT NULL,observed_ts INTEGER NOT NULL,PRIMARY KEY(source,asset_key,window_start))`).run();
 const assetKey=id.chain==='solana'?`${id.chain}:${id.address}`:`${id.chain}:${id.address}`.toLowerCase(),backoffKey=`ACCESS_BACKOFF:${BLUESKY_ATTENTION_EVIDENCE_VERSION}`,globalBackoff=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:backoffKey,now});if(globalBackoff)return{...globalBackoff,contract:htxContract,evidence:[],network_calls:0,cache_status:'GLOBAL_ACCESS_BACKOFF'};
 const cached=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:assetKey,now});if(!strict_fresh_manual&&cached)return{...cached,contract:htxContract};
 const reservationId=`EV2:${SOURCE}:${run_id}:${assetKey}:${Math.floor(now/TTL)}`,wholeJobAdmission=typeof request_admit==='function'?request_admit({logical_request_id:reservationId,lane:'background',attempts:1}):{allowed:false,status:'WHOLE_JOB_HTTP_ADMISSION_REQUIRED'};if(!wholeJobAdmission.allowed)return{status:wholeJobAdmission.status,evidence:[],network_calls:0,whole_job_admission:wholeJobAdmission,internal_only:true};
 const admission=await reserveEvidenceSourceAttempts(db,{source:SOURCE,reservation_id:reservationId,attempts:1,daily_cap:DAILY_CAP,now});if(!admission.allowed)return{status:admission.status,evidence:[],network_calls:0,admission,internal_only:true};
 const windowEnd=now,windowStart=now-TTL,url=`https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(id.address)}&sort=latest&since=${encodeURIComponent(new Date(windowStart).toISOString())}&until=${encodeURIComponent(new Date(windowEnd).toISOString())}&limit=100`,raw=await getJson(fetch_impl,url);
 let normalized=raw.ok?normalizeBlueskyAttention({contract:htxContract,identity:asset_identity,payload:raw.payload,window_start:windowStart,window_end:windowEnd,observed_ts:now}):{status:raw.error==='INVALID_RESPONSE'?'INVALID_RESPONSE':blueskyFailureStatus(raw.http_status),contract:htxContract,evidence:[],summary:null,internal_only:true};
 if(raw.ok){await db.prepare(`INSERT INTO report2_social_attention_window(source,asset_key,window_start,window_end,unique_authors,original_posts,sample_saturated,observed_ts) VALUES(?1,?2,?3,?4,?5,?6,?7,?8) ON CONFLICT(source,asset_key,window_start) DO UPDATE SET window_end=excluded.window_end,unique_authors=excluded.unique_authors,original_posts=excluded.original_posts,sample_saturated=excluded.sample_saturated,observed_ts=excluded.observed_ts`).bind(SOURCE,assetKey,windowStart,windowEnd,normalized.summary.unique_authors,normalized.summary.original_posts,normalized.summary.sample_saturated?1:0,now).run();
  const history=await db.prepare(`SELECT COUNT(*) AS windows,MIN(window_start) AS first_window FROM report2_social_attention_window WHERE source=?1 AND asset_key=?2 AND window_start>=?3`).bind(SOURCE,assetKey,now-30*24*60*60_000).first(),windows=Number(history?.windows||0),days=history?.first_window===null||history?.first_window===undefined?0:(now-Number(history.first_window))/(24*60*60_000);
  normalized=normalizeBlueskyAttention({contract:htxContract,identity:asset_identity,payload:raw.payload,window_start:windowStart,window_end:windowEnd,history_windows:windows,history_days:days,observed_ts:now});}
 const result={version:BLUESKY_ATTENTION_EVIDENCE_VERSION,...normalized,network_calls:1,cache_status:'REFRESHED',whole_job_admission:wholeJobAdmission,admission,receipts:[{route:'SEARCH_POSTS',status:raw.ok?'CLOSED':raw.error==='INVALID_RESPONSE'?'INVALID_RESPONSE':'SOURCE_ERROR',http_status:raw.http_status,error:raw.error??null}],internal_only:true};
 if(raw.ok)await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:assetKey,observed_ts:now,expires_ts:now+TTL,payload:result});
 else if([401,403].includes(raw.http_status))await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:backoffKey,observed_ts:now,expires_ts:now+6*60*60_000,payload:{...result,evidence:[],network_calls:0,cache_status:'GLOBAL_ACCESS_BACKOFF'}});return result;
}

export default{normalizeBlueskyAttention,collectBlueskyAttentionEvidence};
