import {normalizeOfficialEvent} from './official-event-receipt.mjs';
export const BOUNDED_OFFICIAL_EVENT_FETCHER_VERSION='bounded-official-event-fetcher-v1-20260925';
const arr=v=>Array.isArray(v)?v:[];
const clean=v=>String(v??'').trim();
function host(url){try{return new URL(url).hostname.toLowerCase();}catch{return null;}}
function items(json){for(const k of ['events','items','data','results'])if(Array.isArray(json?.[k]))return json[k];return Array.isArray(json)?json:[];}
export async function fetchBoundedOfficialEvents({fetch_impl=fetch,allowlist=[],contract_identity=null,now=Date.now(),max_sources=3,max_items=12}={}){
  const cfg=arr(allowlist).slice(0,Math.max(0,Math.min(3,Number(max_sources)||3)));
  if(!cfg.length)return{version:BOUNDED_OFFICIAL_EVENT_FETCHER_VERSION,status:'NOT_CONFIGURED',events:[],attempts:[],rumors_excluded:true,universal_unlock_source_assumed:false};
  const out=[],attempts=[];
  for(const src of cfg){
    const url=clean(src?.url),allowedHost=clean(src?.host).toLowerCase();
    if(!url||!/^https:\/\//i.test(url)||!allowedHost||host(url)!==allowedHost){attempts.push({url:url||null,status:'BLOCKED_ALLOWLIST'});continue;}
    try{
      const res=await fetch_impl(url,{headers:{accept:'application/json'},redirect:'error'});
      if(!res?.ok){attempts.push({url,status:`HTTP_${res?.status??'ERR'}`});continue;}
      const json=await res.json();attempts.push({url,status:'CLOSED'});
      for(const raw of items(json).slice(0,Math.max(0,Math.min(12,Number(max_items)||12)))){
        const contract=clean(raw?.contract_or_mint??raw?.contract??src?.contract_or_mint);
        if(contract_identity&&contract!==clean(contract_identity))continue;
        const receipt=normalizeOfficialEvent({
          source_url:clean(raw?.source_url)||url,source_kind:clean(src?.source_kind)||'OFFICIAL_PROJECT',
          published_at:raw?.published_at??raw?.publishedAt,event_at:raw?.event_at??raw?.eventAt,
          chain:raw?.chain??src?.chain,contract_or_mint:contract,event_type:raw?.event_type??raw?.eventType,
          title:raw?.title,confidence:raw?.confidence??'HIGH'
        });
        if(receipt.status==='CLOSED'&&receipt.rumor===false)out.push(receipt);
      }
    }catch(e){attempts.push({url,status:'FETCH_ERROR',error:String(e?.message||e).slice(0,180)});}
  }
  return{version:BOUNDED_OFFICIAL_EVENT_FETCHER_VERSION,status:out.length?'CLOSED':'NOT_CLOSED',events:out.slice(0,12),attempts,rumors_excluded:true,universal_unlock_source_assumed:false,bounded:true,max_sources:3,max_items:12};
}
export default{BOUNDED_OFFICIAL_EVENT_FETCHER_VERSION,fetchBoundedOfficialEvents};
