import {SOURCE_POLICIES} from './evidence-source-adapters.mjs';
export const CACHE_MAINTENANCE_VERSION='expired-provider-cache-maintenance-v1-20261005';
export const CACHE_MAINTENANCE_BUDGET=Object.freeze({rows_read:128,rows_written:24});
export const CACHE_MAINTENANCE_SOURCES=Object.freeze([...new Set([...Object.keys(SOURCE_POLICIES),'COINMETRICS_SUPPLY','DELTA_OPTIONS'])].filter(s=>!['SNAPSHOT_GOVERNANCE','SOURCIFY_ABI'].includes(s)).sort());
const CURSOR_SOURCE='INTERNAL_EXPIRED_CACHE_CURSOR';
const PAGE=32,DELETE_LIMIT=8,MONTH=31*86400000;
export async function maintainExpiredProviderCache({db,now=Date.now(),admit}={}){
 const base={version:CACHE_MAINTENANCE_VERSION,source_http:0,MAIN:0,deleted:0,scanned:0,canonical_history_touched:false,reservations_touched:false};
 if(!db?.prepare||!Number.isSafeInteger(now)||now<=0)return{...base,status:'INVALID_CACHE_MAINTENANCE_INPUT'};
 const grant=admit?.(CACHE_MAINTENANCE_BUDGET);
 if(grant?.allowed!==true)return{...base,status:grant?.status||'CACHE_MAINTENANCE_ADMISSION_REQUIRED'};
 const source=CACHE_MAINTENANCE_SOURCES[Math.floor(now/2400000)%CACHE_MAINTENANCE_SOURCES.length];
 try{
  const cursor=await db.prepare('SELECT payload_json FROM report2_evidence_source_cache WHERE source=?1 AND asset_key=?2 LIMIT 1').bind(CURSOR_SOURCE,source).first();
  let after='';try{const c=JSON.parse(cursor?.payload_json);if(c?.version===CACHE_MAINTENANCE_VERSION&&typeof c.after==='string'&&c.after.length<=2048)after=c.after;}catch{}
  // The existing (source,asset_key) primary index bounds work even if all
  // entries in a provider page are fresh. Never scan by unindexed expiry.
  const q=await db.prepare('SELECT asset_key,observed_ts,expires_ts FROM report2_evidence_source_cache WHERE source=?1 AND asset_key>?2 ORDER BY asset_key LIMIT 32').bind(source,after).all();
  const rows=q?.results;
  if(!Array.isArray(rows)||rows.length>PAGE)throw Error('CACHE_PAGE_NOT_CLOSED');
  base.scanned=rows.length;let deleted=0;
  for(const row of rows.filter(r=>Number.isSafeInteger(r.observed_ts)&&Number.isSafeInteger(r.expires_ts)&&r.expires_ts<=now&&r.observed_ts<=r.expires_ts).slice(0,DELETE_LIMIT)){
   const exact=await db.prepare('SELECT payload_json FROM report2_evidence_source_cache WHERE source=?1 AND asset_key=?2 AND observed_ts=?3 AND expires_ts=?4 AND expires_ts<=?5 LIMIT 1').bind(source,row.asset_key,row.observed_ts,row.expires_ts,now).first();
   if(typeof exact?.payload_json!=='string')continue;
   const result=await db.prepare('DELETE FROM report2_evidence_source_cache WHERE source=?1 AND asset_key=?2 AND observed_ts=?3 AND expires_ts=?4 AND expires_ts<=?5 AND payload_json=?6').bind(source,row.asset_key,row.observed_ts,row.expires_ts,now,exact.payload_json).run();
   const changes=Number(result?.meta?.changes??result?.changes);
   if(!Number.isSafeInteger(changes)||changes<0||changes>1)throw Error('CACHE_DELETE_ACK_INVALID');
   deleted+=changes;base.deleted=deleted;
  }
  const next=rows.length===PAGE?rows.at(-1).asset_key:'';
  await db.prepare('INSERT INTO report2_evidence_source_cache(source,asset_key,observed_ts,expires_ts,payload_json) VALUES(?1,?2,?3,?4,?5) ON CONFLICT(source,asset_key) DO UPDATE SET observed_ts=excluded.observed_ts,expires_ts=excluded.expires_ts,payload_json=excluded.payload_json').bind(CURSOR_SOURCE,source,now,now+MONTH,JSON.stringify({version:CACHE_MAINTENANCE_VERSION,after:next})).run();
  return{...base,status:'BOUNDED_EXPIRED_CACHE_MAINTAINED',source,scanned:rows.length,deleted,page_complete:rows.length<PAGE,budget:CACHE_MAINTENANCE_BUDGET};
 }catch(error){return{...base,status:'CACHE_MAINTENANCE_ERROR',source,error:String(error.message).slice(0,180)};}
}
