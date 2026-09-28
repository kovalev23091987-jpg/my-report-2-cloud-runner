export const EVIDENCE_SOURCE_STORE_VERSION='evidence-source-store-v1-20260928';

const text=value=>String(value??'').trim();

export async function installEvidenceSourceStore(db){
 if(!db?.prepare||typeof db.batch!=='function')throw new Error('EVIDENCE_SOURCE_STORE_DB_REQUIRED');
 await db.batch([
  db.prepare(`CREATE TABLE IF NOT EXISTS report2_evidence_source_daily(source TEXT NOT NULL,day_utc TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,last_reservation_id TEXT,updated_at INTEGER NOT NULL,PRIMARY KEY(source,day_utc))`),
  db.prepare(`CREATE TABLE IF NOT EXISTS report2_evidence_source_reservation(reservation_id TEXT PRIMARY KEY,source TEXT NOT NULL,day_utc TEXT NOT NULL,attempts INTEGER NOT NULL,created_at INTEGER NOT NULL)`),
  db.prepare(`CREATE TABLE IF NOT EXISTS report2_evidence_source_cache(source TEXT NOT NULL,asset_key TEXT NOT NULL,observed_ts INTEGER NOT NULL,expires_ts INTEGER NOT NULL,payload_json TEXT NOT NULL,PRIMARY KEY(source,asset_key))`),
  db.prepare(`CREATE TABLE IF NOT EXISTS report2_evidence_source_credit_daily(source TEXT NOT NULL,day_utc TEXT NOT NULL,credits INTEGER NOT NULL DEFAULT 0,last_reservation_id TEXT,updated_at INTEGER NOT NULL,PRIMARY KEY(source,day_utc))`),
  db.prepare(`CREATE TABLE IF NOT EXISTS report2_evidence_source_credit_reservation(reservation_id TEXT PRIMARY KEY,source TEXT NOT NULL,day_utc TEXT NOT NULL,credits INTEGER NOT NULL,created_at INTEGER NOT NULL)`),
 ]);
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
 await db.batch([
  db.prepare(`INSERT INTO report2_evidence_source_daily(source,day_utc,attempts,last_reservation_id,updated_at) VALUES(?1,?2,0,NULL,?3) ON CONFLICT(source,day_utc) DO NOTHING`).bind(provider,day,now),
  db.prepare(`UPDATE report2_evidence_source_daily SET attempts=attempts+?1,last_reservation_id=?2,updated_at=?3 WHERE source=?4 AND day_utc=?5 AND attempts+?1<=?6 AND NOT EXISTS(SELECT 1 FROM report2_evidence_source_reservation WHERE reservation_id=?2)`).bind(count,id,now,provider,day,cap),
  db.prepare(`INSERT INTO report2_evidence_source_reservation(reservation_id,source,day_utc,attempts,created_at) SELECT ?1,?2,?3,?4,?5 FROM report2_evidence_source_daily WHERE source=?2 AND day_utc=?3 AND last_reservation_id=?1 ON CONFLICT(reservation_id) DO NOTHING`).bind(id,provider,day,count,now),
 ]);
 const row=await db.prepare(`SELECT source,attempts FROM report2_evidence_source_reservation WHERE reservation_id=?1`).bind(id).first();
 const allowed=row?.source===provider&&Number(row?.attempts)===count;
 return{allowed,status:allowed?'RESERVED':'DAILY_CAP_OR_DUPLICATE',source:provider,day_utc:day,attempts:allowed?count:0};
}

export async function readEvidenceSourceCache(db,{source,asset_key,now=Date.now()}={}){
 const row=await db.prepare(`SELECT observed_ts,expires_ts,payload_json FROM report2_evidence_source_cache WHERE source=?1 AND asset_key=?2 AND expires_ts>?3 LIMIT 1`).bind(text(source),text(asset_key),now).first();
 if(!row)return null;
 try{return{...JSON.parse(row.payload_json),cache_status:'HIT',network_calls:0};}catch{return null;}
}

export async function writeEvidenceSourceCache(db,{source,asset_key,observed_ts,expires_ts,payload}={}){
 await db.prepare(`INSERT INTO report2_evidence_source_cache(source,asset_key,observed_ts,expires_ts,payload_json) VALUES(?1,?2,?3,?4,?5) ON CONFLICT(source,asset_key) DO UPDATE SET observed_ts=excluded.observed_ts,expires_ts=excluded.expires_ts,payload_json=excluded.payload_json`).bind(text(source),text(asset_key),observed_ts,expires_ts,JSON.stringify(payload)).run();
}

export default{installEvidenceSourceStore,reserveEvidenceSourceAttempts,reserveEvidenceSourceCredits,readEvidenceSourceCache,writeEvidenceSourceCache};
