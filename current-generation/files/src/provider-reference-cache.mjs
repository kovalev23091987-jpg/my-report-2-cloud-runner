import {readEvidenceSourceCache,writeEvidenceSourceCache,reserveEvidenceSourceAttempts} from './evidence-source-store.mjs';
import {installProviderMinuteLedger,reserveProviderMinuteUnits} from './provider-minute-ledger.mjs';

export const PROVIDER_REFERENCE_CACHE_VERSION='provider-reference-cache-v1-20261004';
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');

// Cache transport bodies, never candidate evidence. Callers revalidate exact
// identity/category membership and quote clocks for each requested market.
export function createProviderReferenceReader({db,source,run_id,request_admit,fetch_impl=globalThis.fetch,now=Date.now(),daily_cap,minute_provider=null,minute_cap=9}={}){
 const receipts=[];let calls=0,denied=null,backoff=null,sequence=0;
 async function get(route,url,{ttl_ms=0,max_bytes=2*1024*1024,shape=()=>true,bypass_cache=false}={}){
  if(denied||backoff)return null;
  const u=new URL(url),allowed=source==='COINGECKO_SECTOR'?u.hostname==='api.coingecko.com'&&u.pathname.startsWith('/api/v3/')
   :['COINPAPRIKA_SECTOR','COINPAPRIKA_HTX_IDENTITY'].includes(source)?u.hostname==='api.coinpaprika.com'&&u.pathname.startsWith('/v1/'):false;
  if(!allowed||u.protocol!=='https:'||u.username||u.password)throw Error('PROVIDER_REFERENCE_ROUTE_NOT_ALLOWED');
  const key=`REFERENCE:${PROVIDER_REFERENCE_CACHE_VERSION}:${await digest(url)}`;
  if(ttl_ms>0&&!bypass_cache){
   // Only immutable coin metadata is shared between the two existing roles.
   // Quotes, catalogs, evidence and backoff/reservations remain role scoped.
   const sibling=source==='COINPAPRIKA_SECTOR'?'COINPAPRIKA_HTX_IDENTITY':source==='COINPAPRIKA_HTX_IDENTITY'?'COINPAPRIKA_SECTOR':null;
   const shared=sibling&&u.hostname==='api.coinpaprika.com'&&/^\/v1\/coins\/[a-z0-9][a-z0-9-]{2,79}$/.test(u.pathname)&&!u.search;
   for(const owner of shared?[source,sibling]:[source]){
    const cached=await readEvidenceSourceCache(db,{source:owner,asset_key:key,now});
    if(cached?.version===PROVIDER_REFERENCE_CACHE_VERSION&&cached.url===url&&Number.isSafeInteger(cached.received_ts)&&Number.isSafeInteger(cached.expires_ts)&&cached.received_ts<=now&&now<Math.min(cached.expires_ts,cached.received_ts+ttl_ms)&&typeof cached.body==='string'&&cached.body.length<=max_bytes&&cached.body_sha256===await digest(cached.body)){
     try{const payload=JSON.parse(cached.body);if(shape(payload)){receipts.push({route,url,status:'VALIDATED_REFERENCE_CACHE',http_status:200,received_ts:cached.received_ts,expires_ts:Math.min(cached.expires_ts,cached.received_ts+ttl_ms),body_sha256:cached.body_sha256,actual_http:0,cache_owner_source:owner,shared_provider:owner!==source?'COINPAPRIKA':null});return payload;}}catch{}
    }
   }
  }
  const reservation_id=`EV2:${source}:${run_id}:${await digest(url)}:${sequence++}`;
  const whole=request_admit?.({logical_request_id:reservation_id,lane:'background',attempts:1});
  if(whole?.allowed!==true||whole?.duplicate===true){denied={...whole,allowed:false,status:whole?.duplicate===true?'ALREADY_RESERVED_NO_REDISPATCH':whole?.status||'ADMISSION_REQUIRED'};return null;}
  const daily=await reserveEvidenceSourceAttempts(db,{source,reservation_id,attempts:1,daily_cap,now});
  if(!daily.allowed){denied=daily;return null;}
  if(minute_provider){
   await installProviderMinuteLedger(db);
   const minute=await reserveProviderMinuteUnits(db,{provider:minute_provider,reservation_id,units:1,now,cap:minute_cap});
   if(!minute.allowed){denied={...minute,status:'PROVIDER_RATE_LIMIT_LOCAL'};return null;}
  }
  calls++;
  const c=new AbortController(),timer=setTimeout(()=>c.abort(),12000);
  try{
   const response=await fetch_impl(url,{headers:{accept:'application/json'},signal:c.signal,redirect:'error'}),body=await response.text(),received_ts=Date.now();
   const body_sha256=await digest(body);
   const receipt={route,url,http_status:response.status,status:response.ok?'RECEIVED':`HTTP_${response.status}`,received_ts,body_sha256,actual_http:1};receipts.push(receipt);
   if([401,403,429,451].includes(response.status)){
    const raw=response.headers?.get?.('retry-after'),seconds=/^\d+$/.test(raw||'')?Number(raw):null,date=raw?Date.parse(raw):NaN;
    backoff={status:response.status===429?'PROVIDER_RATE_LIMITED':'SOURCE_ACCESS_BLOCKED',backoff_until:Math.max(received_ts+900000,seconds!==null?received_ts+seconds*1000:Number.isFinite(date)?date:0)};
   }
   if(!response.ok||body.length>max_bytes)return null;
   let payload;try{payload=JSON.parse(body);}catch{receipt.status='INVALID_JSON';return null;}
   if(!shape(payload)){receipt.status='INVALID_RESPONSE_SHAPE';return null;}
   if(ttl_ms>0)await writeEvidenceSourceCache(db,{source,asset_key:key,observed_ts:received_ts,expires_ts:received_ts+ttl_ms,payload:{version:PROVIDER_REFERENCE_CACHE_VERSION,url,received_ts,expires_ts:received_ts+ttl_ms,body_sha256,body}});
   return payload;
  }catch(error){receipts.push({route,url,status:'SOURCE_ERROR',error:String(error.message).slice(0,100),actual_http:1});return null;}
  finally{clearTimeout(timer);}
 }
 return{get,summary:()=>({network_calls:calls,receipts,admission:denied||{allowed:true,status:'PER_TRANSPORT_RESERVED'},provider_backoff:backoff})};
}
