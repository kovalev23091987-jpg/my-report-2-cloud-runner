export const EVIDENCE_SOURCE_STORE_VERSION='evidence-source-store-v1-20260928';

const text=value=>String(value??'').trim();
// Read existing instrumentation only. Absence is not a measured-zero receipt;
// it leaves admission with the existing caller. An invalid/unknown native
// snapshot must not authorize more source work after an earlier failure.
export function nativeSourceUsageUnclosed(db){
 if(typeof db?.usageSnapshot!=='function')return false;
 try{const n=db.usageSnapshot().unknown_ops;return!Number.isSafeInteger(n)||n<0||n>0;}catch{return true;}
}
const schemaReadiness=new WeakMap();
export async function ensureSourceSchemaOnce(db,namespace,install){
 let states=schemaReadiness.get(db);if(!states){states=new Map();schemaReadiness.set(db,states);}
 if(states.has(namespace))return states.get(namespace);
 const promise=Promise.resolve().then(async()=>{
  const before=typeof db.usageSnapshot==='function'?db.usageSnapshot().unknown_ops:null;
  const result=await install();
  if(before!==null&&db.usageSnapshot().unknown_ops!==before)throw Error('SCHEMA_NATIVE_USAGE_NOT_CLOSED');
  return result;
 });states.set(namespace,promise);
 try{return await promise;}catch(error){if(states.get(namespace)===promise)states.delete(namespace);throw error;}
}

export async function installEvidenceSourceStore(db){
 if(!db?.prepare||typeof db.batch!=='function')throw new Error('EVIDENCE_SOURCE_STORE_DB_REQUIRED');
 return ensureSourceSchemaOnce(db,EVIDENCE_SOURCE_STORE_VERSION,()=>db.batch([
  db.prepare(`CREATE TABLE IF NOT EXISTS report2_evidence_source_daily(source TEXT NOT NULL,day_utc TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,last_reservation_id TEXT,updated_at INTEGER NOT NULL,PRIMARY KEY(source,day_utc))`),
  db.prepare(`CREATE TABLE IF NOT EXISTS report2_evidence_source_reservation(reservation_id TEXT PRIMARY KEY,source TEXT NOT NULL,day_utc TEXT NOT NULL,attempts INTEGER NOT NULL,created_at INTEGER NOT NULL)`),
  db.prepare(`CREATE TABLE IF NOT EXISTS report2_evidence_source_cache(source TEXT NOT NULL,asset_key TEXT NOT NULL,observed_ts INTEGER NOT NULL,expires_ts INTEGER NOT NULL,payload_json TEXT NOT NULL,PRIMARY KEY(source,asset_key))`),
  db.prepare(`CREATE TABLE IF NOT EXISTS report2_evidence_source_credit_daily(source TEXT NOT NULL,day_utc TEXT NOT NULL,credits INTEGER NOT NULL DEFAULT 0,last_reservation_id TEXT,updated_at INTEGER NOT NULL,PRIMARY KEY(source,day_utc))`),
  db.prepare(`CREATE TABLE IF NOT EXISTS report2_evidence_source_credit_reservation(reservation_id TEXT PRIMARY KEY,source TEXT NOT NULL,day_utc TEXT NOT NULL,credits INTEGER NOT NULL,created_at INTEGER NOT NULL)`),
 ]));
}

export async function reserveEvidenceSourceCredits(db,{source,reservation_id,credits,daily_credit_cap,now=Date.now()}={}){
 const provider=text(source),id=text(reservation_id),count=Number(credits),cap=Number(daily_credit_cap);if(!provider||!id||!Number.isSafeInteger(count)||count<1||!Number.isSafeInteger(cap)||cap<1)return{allowed:false,status:'INVALID_CREDIT_RESERVATION',credits:0};const day=new Date(now).toISOString().slice(0,10);
 await db.batch([
  db.prepare(`INSERT INTO report2_evidence_source_credit_daily(source,day_utc,credits,last_reservation_id,updated_at) VALUES(?1,?2,0,NULL,?3) ON CONFLICT(source,day_utc) DO NOTHING`).bind(provider,day,now),
  db.prepare(`UPDATE report2_evidence_source_credit_daily SET credits=credits+?1,last_reservation_id=?2,updated_at=?3 WHERE source=?4 AND day_utc=?5 AND credits+?1<=?6 AND NOT EXISTS(SELECT 1 FROM report2_evidence_source_credit_reservation WHERE reservation_id=?2)`).bind(count,id,now,provider,day,cap),
  db.prepare(`INSERT INTO report2_evidence_source_credit_reservation(reservation_id,source,day_utc,credits,created_at) SELECT ?1,?2,?3,?4,?5 FROM report2_evidence_source_credit_daily WHERE source=?2 AND day_utc=?3 AND last_reservation_id=?1 ON CONFLICT(reservation_id) DO NOTHING`).bind(id,provider,day,count,now),
 ]);const row=await db.prepare(`SELECT source,credits FROM report2_evidence_source_credit_reservation WHERE reservation_id=?1`).bind(id).first(),allowed=row?.source===provider&&Number(row?.credits)===count;return{allowed,status:allowed?'RESERVED':'DAILY_CREDIT_CAP_OR_DUPLICATE',source:provider,day_utc:day,credits:allowed?count:0};
}

export async function reserveEvidenceSourceAttempts(db,{source,reservation_id,attempts,daily_cap,now=Date.now()}={}){
 const provider=text(source),id=text(reservation_id),count=Number(attempts),cap=Number(daily_cap);
 if(!provider||!id||!Number.isSafeInteger(count)||count<1||!Number.isSafeInteger(cap)||cap<1)return{allowed:false,status:'INVALID_SOURCE_RESERVATION',attempts:0};
 const day=new Date(now).toISOString().slice(0,10);
 if(nativeSourceUsageUnclosed(db))return{allowed:false,status:'ADMISSION_LEDGER_UNAVAILABLE_NATIVE_USAGE',source:provider,day_utc:day,attempts:0};
 await db.batch([
  db.prepare(`INSERT INTO report2_evidence_source_daily(source,day_utc,attempts,last_reservation_id,updated_at) VALUES(?1,?2,0,NULL,?3) ON CONFLICT(source,day_utc) DO NOTHING`).bind(provider,day,now),
  db.prepare(`UPDATE report2_evidence_source_daily SET attempts=attempts+?1,last_reservation_id=?2,updated_at=?3 WHERE source=?4 AND day_utc=?5 AND attempts+?1<=?6 AND NOT EXISTS(SELECT 1 FROM report2_evidence_source_reservation WHERE reservation_id=?2)`).bind(count,id,now,provider,day,cap),
  db.prepare(`INSERT INTO report2_evidence_source_reservation(reservation_id,source,day_utc,attempts,created_at) SELECT ?1,?2,?3,?4,?5 FROM report2_evidence_source_daily WHERE source=?2 AND day_utc=?3 AND last_reservation_id=?1 ON CONFLICT(reservation_id) DO NOTHING`).bind(id,provider,day,count,now),
 ]);
 if(nativeSourceUsageUnclosed(db))return{allowed:false,status:'ADMISSION_LEDGER_UNAVAILABLE_NATIVE_USAGE',source:provider,day_utc:day,attempts:0};
 const row=await db.prepare(`SELECT source,attempts FROM report2_evidence_source_reservation WHERE reservation_id=?1`).bind(id).first();
 if(nativeSourceUsageUnclosed(db))return{allowed:false,status:'ADMISSION_LEDGER_UNAVAILABLE_NATIVE_USAGE',source:provider,day_utc:day,attempts:0};
 const allowed=row?.source===provider&&Number(row?.attempts)===count;
 return{allowed,status:allowed?'RESERVED':'DAILY_CAP_OR_DUPLICATE',source:provider,day_utc:day,attempts:allowed?count:0};
}
// Advisory preflight only. The unchanged atomic reservation remains the
// authority under concurrency; this never resets/refunds source or job usage.
export async function evidenceSourceAttemptHeadroom(db,{source,attempts,daily_cap,now=Date.now()}={}){
 const provider=text(source),count=Number(attempts),cap=Number(daily_cap);
 if(!db?.prepare||!provider||!Number.isSafeInteger(count)||count<1||!Number.isSafeInteger(cap)||cap<1||!Number.isSafeInteger(now)||now<=0)return{allowed:false,status:'INVALID_SOURCE_RESERVATION',attempts:0};
 const day_utc=new Date(now).toISOString().slice(0,10),row=await db.prepare('SELECT attempts FROM report2_evidence_source_daily WHERE source=?1 AND day_utc=?2').bind(provider,day_utc).first(),used=row?Number(row.attempts):0;
 if(row&&(row.attempts===null||row.attempts===''||typeof row.attempts==='boolean')||!Number.isSafeInteger(used)||used<0)return{allowed:false,status:'ADMISSION_LEDGER_UNAVAILABLE',attempts:0,source:provider,day_utc};
 return{allowed:used+count<=cap,status:used+count<=cap?'SOURCE_ATTEMPT_HEADROOM_AVAILABLE':'SOURCE_DAILY_CAP_REACHED',attempts:0,requested_attempts:count,source:provider,day_utc,used,cap,read_only:true};
}

export async function readEvidenceSourceCache(db,{source,asset_key,now=Date.now(),include_cache_clock=false}={}){
 const row=await db.prepare(`SELECT observed_ts,expires_ts,payload_json FROM report2_evidence_source_cache WHERE source=?1 AND asset_key=?2 AND expires_ts>?3 LIMIT 1`).bind(text(source),text(asset_key),now).first();
 if(!row)return null;
 try{return{...JSON.parse(row.payload_json),...(include_cache_clock?{cache_observed_ts:row.observed_ts,cache_expires_ts:row.expires_ts}:{}),cache_status:'HIT',network_calls:0};}catch{return null;}
}

export function evidenceSourceCacheWriteRequest({source,asset_key,observed_ts,expires_ts,payload}={}){
 return{op:'run',sql:`INSERT INTO report2_evidence_source_cache(source,asset_key,observed_ts,expires_ts,payload_json) VALUES(?1,?2,?3,?4,?5) ON CONFLICT(source,asset_key) DO UPDATE SET observed_ts=excluded.observed_ts,expires_ts=excluded.expires_ts,payload_json=excluded.payload_json`,params:[text(source),text(asset_key),observed_ts,expires_ts,JSON.stringify(payload)]};
}
export function evidenceSourceCacheWriteWireBytes(input){
 return new TextEncoder().encode(JSON.stringify(evidenceSourceCacheWriteRequest(input))).byteLength;
}
export async function writeEvidenceSourceCache(db,input={}){
 const request=evidenceSourceCacheWriteRequest(input);
 await db.prepare(request.sql).bind(...request.params).run();
}

// Optional cache persistence is not the source fact's validity or its clock.
// Never discard a qualified response for a cache failure or issue another SQL
// statement after native costs became unknown. Reservations are not refunded.
export async function writeOptionalEvidenceSourceCache(db,input={}){
 if(nativeSourceUsageUnclosed(db))return{status:'CACHE_WRITE_SKIPPED_UNCLOSED_NATIVE_USAGE',native_usage_unclosed:true};
 try{
  await writeEvidenceSourceCache(db,input);
  const unclosed=nativeSourceUsageUnclosed(db);
  return{status:unclosed?'CACHE_WRITE_UNCLOSED_NATIVE_USAGE':'CACHE_WRITE_COMPLETED',native_usage_unclosed:unclosed};
 }catch{return{status:'CACHE_WRITE_FAILED_VALID_RESPONSE_RETAINED',native_usage_unclosed:nativeSourceUsageUnclosed(db)};}
}

// Operational observations, separate from forecast accuracy and strategy weights.
// The caller must reserve DB headroom before this optional diagnostic work.
export const SOURCE_PRIORITY_HISTORY_SQL=`SELECT contract,source_id,run_id,observed_ts,actual_http,status,operational_class,evidence_rows,valid_rows,decision_usable_rows FROM report2_evidence_source_health_observation INDEXED BY report2_evidence_source_health_recent WHERE source_id=?1 AND contract=?2 AND observed_ts>=?3 AND observed_ts<=?4 ORDER BY observed_ts DESC LIMIT 4`;
export function sourceHistoryStatistics(observations=[],{contract,source_id,now=Date.now()}={}){
 const rejected_observations=[];
 const rows=(observations||[]).filter(r=>r.source_id===source_id).filter(r=>{
  const valid=r.contract===contract&&typeof r.run_id==='string'&&r.run_id.length>0&&Number.isSafeInteger(r.observed_ts)&&r.observed_ts<=now&&r.observed_ts>=now-86400000&&Number.isSafeInteger(r.actual_http)&&r.actual_http>0&&['evidence_rows','valid_rows','decision_usable_rows'].every(k=>Number.isSafeInteger(r[k])&&r[k]>=0)&&r.valid_rows<=r.evidence_rows&&r.decision_usable_rows<=r.valid_rows;
  if(!valid)rejected_observations.push({source_id:r.source_id,reason:'EXACT_MARKET_CLOCK_OR_COUNTER_INVALID'});return valid;
 }).sort((a,b)=>b.observed_ts-a.observed_ts||b.run_id.localeCompare(a.run_id)).slice(0,4);
 const latest=rows[0],useful=latest?.operational_class==='CONTEXT_AVAILABLE'&&latest.valid_rows>0;
 return{source_id,observations:rows.length,latest_class:latest?.operational_class||null,latest_observed_ts:latest?.observed_ts||null,useful:!!useful,valid_rows_per_http:useful?rows.reduce((n,r)=>n+(r.operational_class==='CONTEXT_AVAILABLE'?r.valid_rows:0),0)/rows.reduce((n,r)=>n+r.actual_http,0):0,rejected_observations};
}
export async function readEvidenceSourcePriorityHistory(db,{contract,source_ids=[],admit,now=Date.now()}={}){
 const ids=[...new Set(source_ids)];
 const base={contract,observations:[],predictive_weight_changed:false,quarantine_activated:false,score_cap:0,read_only:true};
 if(!db?.prepare||!contract||!ids.length||ids.length>8||ids.some(id=>typeof id!=='string'||!id)||!Number.isSafeInteger(now)||now<=0)return{...base,status:'SOURCE_PRIORITY_SCOPE_REQUIRED'};
 // Each query uses the existing source/contract/time index. No schema writes,
 // unrestricted contract scan, provider transport or source reservation.
 const grant=admit?.({rows_read:ids.length*32,rows_written:0});
 if(grant?.allowed!==true)return{...base,status:grant?.status||'HEALTH_DB_ADMISSION_REQUIRED'};
 const before=typeof db.usageSnapshot==='function'?db.usageSnapshot().unknown_ops:null,observations=[];
 try{
  for(const source_id of ids){
   const q=await db.prepare(SOURCE_PRIORITY_HISTORY_SQL).bind(source_id,contract,now-86400000,now).all();
   if(before!==null&&db.usageSnapshot().unknown_ops!==before)return{...base,status:'SOURCE_PRIORITY_NATIVE_USAGE_UNKNOWN'};
   observations.push(...(q?.results||[]));
  }
  return{...base,status:'CLOSED_EXACT_SOURCE_PRIORITY_HISTORY',observations,source_ids:ids,scope:'LAST_FOUR_REAL_ATTEMPTS_PER_EXACT_SOURCE_MARKET_24H',admitted_rows_read:ids.length*32};
 }catch(error){return{...base,status:'SOURCE_PRIORITY_HISTORY_UNAVAILABLE',error:String(error.message).slice(0,120)};}
}
export async function recordEvidenceSourceHealth(db,{contract,run_id,observations=[],admit,now=Date.now()}={}){
 const rows=observations.filter(r=>Number.isSafeInteger(r.actual_http)&&r.actual_http>0);
 if(!rows.length){
  if(!contract||!run_id||!db?.prepare)return{status:'NO_NEW_TRANSPORT_OBSERVATION',observations:[],predictive_weight_changed:false};
  const grant=admit?.({rows_read:24,rows_written:0});if(grant?.allowed!==true)return{status:grant?.status||'HEALTH_DB_ADMISSION_REQUIRED',observations:[],predictive_weight_changed:false};
  try{const q=await db.prepare(`SELECT source_id,run_id,operational_class,valid_rows,decision_usable_rows,observed_ts FROM report2_evidence_source_health_observation WHERE contract=?1 AND observed_ts>=?2 ORDER BY observed_ts DESC LIMIT 24`).bind(contract,now-24*60*60_000).all(),history=q?.results||[];return{status:history.length?'CLOSED_OPERATIONAL_JOURNAL_CACHE':'NO_NEW_TRANSPORT_OBSERVATION',contract,observations:history,scope:'RECENT_EXACT_MARKET_READBACK_24H',score_cap:0,predictive_weight_changed:false,quarantine_activated:false};}catch{return{status:'NO_NEW_TRANSPORT_OBSERVATION',observations:[],predictive_weight_changed:false};}
 }
 // One strict 17-block audit can attempt more than five independent owners.
 // Keep a hard bound, but journal every actually attempted owner instead of
 // silently dropping the whole quality block once the fifth source is passed.
 if(!contract||!run_id||rows.length>24)return{status:'HEALTH_SCOPE_NOT_CLOSED',observations:[],predictive_weight_changed:false};
 // D1 counts the table row plus both indexes (measured: 3 writes/observation).
 const grant=admit?.({rows_read:rows.length*16,rows_written:rows.length*3+4});
 if(grant?.allowed!==true)return{status:grant?.status||'HEALTH_DB_ADMISSION_REQUIRED',observations:[],predictive_weight_changed:false};
 try{
  await db.batch([
   db.prepare(`CREATE TABLE IF NOT EXISTS report2_evidence_source_health_observation(run_id TEXT NOT NULL,contract TEXT NOT NULL,source_id TEXT NOT NULL,observed_ts INTEGER NOT NULL,actual_http INTEGER NOT NULL,status TEXT NOT NULL,operational_class TEXT NOT NULL,evidence_rows INTEGER NOT NULL,valid_rows INTEGER NOT NULL,decision_usable_rows INTEGER NOT NULL,PRIMARY KEY(run_id,contract,source_id))`),
   db.prepare(`CREATE INDEX IF NOT EXISTS report2_evidence_source_health_recent ON report2_evidence_source_health_observation(source_id,contract,observed_ts DESC)`),
  ]);
  await db.batch(rows.map(r=>db.prepare(`INSERT INTO report2_evidence_source_health_observation(run_id,contract,source_id,observed_ts,actual_http,status,operational_class,evidence_rows,valid_rows,decision_usable_rows) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10) ON CONFLICT(run_id,contract,source_id) DO NOTHING`).bind(run_id,contract,r.source_id,now,r.actual_http,r.status,r.operational_class,r.evidence_rows,r.valid_rows,r.decision_usable_rows)));
  const summaries=[];
  for(const r of rows){
   const q=await db.prepare(`SELECT run_id,operational_class,valid_rows,decision_usable_rows FROM report2_evidence_source_health_observation WHERE source_id=?1 AND contract=?2 ORDER BY observed_ts DESC LIMIT 10`).bind(r.source_id,contract).all(),history=q?.results||[];
   summaries.push({source_id:r.source_id,current_operational_class:r.operational_class,persisted_current_run:history.some(x=>x.run_id===run_id),recent_observations:history.length,invalid_response_count:history.filter(x=>x.operational_class==='INVALID_RESPONSE').length,external_failure_count:history.filter(x=>x.operational_class==='EXTERNAL_FAILURE').length,rate_limited_count:history.filter(x=>x.operational_class==='PROVIDER_RATE_LIMITED').length,access_blocked_count:history.filter(x=>x.operational_class==='ACCESS_BLOCKED').length,internal_failure_count:history.filter(x=>x.operational_class==='INTERNAL_FAILURE').length,valid_empty_count:history.filter(x=>x.operational_class==='VALID_RESPONSE_NO_EVENT').length,decision_usable_observations:history.filter(x=>Number(x.decision_usable_rows)>0).length});
  }
  return{status:summaries.every(r=>r.persisted_current_run)?'CLOSED_OPERATIONAL_JOURNAL':'PERSISTENCE_NOT_CONFIRMED',contract,observations:summaries,scope:'LAST_10_ATTEMPTED_RESPONSES_PER_EXACT_MARKET',score_cap:0,predictive_weight_changed:false,quarantine_activated:false};
 }catch(error){return{status:'HEALTH_JOURNAL_ERROR',error:String(error.message).slice(0,120),observations:[],predictive_weight_changed:false};}
}

export default{installEvidenceSourceStore,reserveEvidenceSourceAttempts,reserveEvidenceSourceCredits,readEvidenceSourceCache,writeEvidenceSourceCache};

