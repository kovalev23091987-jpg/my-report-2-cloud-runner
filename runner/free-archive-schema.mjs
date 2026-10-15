import {PRIVATE_CANONICAL_DATABASES} from './private-canonical-history.mjs';
import {evaluateWithinRunReservation} from './d1-preaction-budget-guard.mjs';

// This family can only install the two fixed objects in the four already
// created empty archives. It cannot relocate a body or consume/reset a
// RETAINED_HISTORY slot. Its native cost still shares the same account ledger.
export const FREE_ARCHIVE_SCHEMA_POLICY=Object.freeze({max_runs_day:1,reservation:{rows_read:5000,rows_written:80},day:{rows_read:3500000,rows_written:70000},next_full:{rows_read:59000,rows_written:920},max_private_HTTP:16});
export const FREE_ARCHIVE_SCHEMA_TABLE=`CREATE TABLE IF NOT EXISTS report2_canonical_cold_archive_v1 (
 publication_id TEXT NOT NULL,raw_sha256 TEXT NOT NULL,run_id TEXT NOT NULL,snapshot_id TEXT NOT NULL,
 contract_code TEXT NOT NULL,observed_ts INTEGER NOT NULL,record_json TEXT NOT NULL,created_ts INTEGER NOT NULL,
 PRIMARY KEY(publication_id,raw_sha256))`;
export const FREE_ARCHIVE_SCHEMA_INDEX='CREATE INDEX IF NOT EXISTS report2_canonical_cold_archive_clock_v1 ON report2_canonical_cold_archive_v1(observed_ts,publication_id)';
export const FREE_ARCHIVE_SCHEMA_READ="SELECT name,type,sql FROM sqlite_schema WHERE name IN ('report2_canonical_cold_archive_v1','report2_canonical_cold_archive_clock_v1') ORDER BY name";
const normalize=s=>String(s).replace(/\bIF NOT EXISTS\b/gi,'').replace(/\s+/g,'').replace(/;$/,'').toLowerCase();
function verifySchema(rows,{complete=false}={}){
 if(!Array.isArray(rows)||rows.length>2)throw Error('FREE_ARCHIVE_SCHEMA_READBACK_REQUIRED');
 const expected=new Map([['report2_canonical_cold_archive_v1',['table',FREE_ARCHIVE_SCHEMA_TABLE]],['report2_canonical_cold_archive_clock_v1',['index',FREE_ARCHIVE_SCHEMA_INDEX]]]),seen=new Set();
 for(const row of rows){const e=expected.get(row.name);if(!e||seen.has(row.name)||row.type!==e[0]||normalize(row.sql)!==normalize(e[1]))throw Error('FREE_ARCHIVE_EXISTING_SCHEMA_MISMATCH_KEEP_ORIGINAL');seen.add(row.name);}
 if(complete&&seen.size!==2)throw Error('FREE_ARCHIVE_SCHEMA_READBACK_REQUIRED');
 return seen.size===2;
}
export async function reserveFreeArchiveSchemaBudget(db,{reservation_id,now=Date.now()}={}){
 if(!/^FREE_ARCHIVE_SCHEMA_INIT:[0-9]+:[0-9]+$/.test(reservation_id||'')||!Number.isSafeInteger(now)||now<=0)throw Error('FREE_ARCHIVE_SCHEMA_RESERVATION_REQUIRED');
 const p=FREE_ARCHIVE_SCHEMA_POLICY,day=new Date(now).toISOString().slice(0,10);
 const ack=await db.prepare(`INSERT OR IGNORE INTO report2_runner_budget_ledger_shadow(reservation_id,day_utc,reserve_rows_read,reserve_rows_written,state,started_ts)
 SELECT ?1,?2,?3,?4,'RESERVED',?5 FROM (
 SELECT COALESCE(SUM(MAX(reserve_rows_read,COALESCE(measured_rows_read,0)+CASE WHEN state='FINALIZED' THEN 1 ELSE 0 END)),0) AS reads,
 COALESCE(SUM(MAX(reserve_rows_written,COALESCE(measured_rows_written,0))),0) AS writes,
 COALESCE(SUM(CASE WHEN state='FINALIZED' AND COALESCE(unknown_ops,1)>0 THEN 1 ELSE 0 END),0) AS unknown_count,
 COALESCE(SUM(CASE WHEN reservation_id LIKE 'FREE_ARCHIVE_SCHEMA_INIT:%' THEN 1 ELSE 0 END),0) AS prior_count
 FROM report2_runner_budget_ledger_shadow WHERE day_utc=?2)
 WHERE reads+?3<=?6 AND writes+?4<=?7 AND unknown_count=0 AND prior_count<?8`).bind(reservation_id,day,p.reservation.rows_read,p.reservation.rows_written,now,p.day.rows_read-p.next_full.rows_read,p.day.rows_written-p.next_full.rows_written,p.max_runs_day).run();
 if(ack?.meta?.changes!==1)return{allowed:false,status:ack?.meta?.changes===0?'FREE_ARCHIVE_SCHEMA_SHARED_DAY_DENIED':'FREE_ARCHIVE_SCHEMA_ADMISSION_ACK_REQUIRED'};
 const row=await db.prepare('SELECT day_utc,reserve_rows_read,reserve_rows_written,state FROM report2_runner_budget_ledger_shadow WHERE reservation_id=?1 LIMIT 1').bind(reservation_id).first();
 if(row?.day_utc!==day||row.state!=='RESERVED'||row.reserve_rows_read!==p.reservation.rows_read||row.reserve_rows_written!==p.reservation.rows_written)throw Error('FREE_ARCHIVE_SCHEMA_RESERVATION_READBACK_REQUIRED');
 return{allowed:true,status:'FREE_ARCHIVE_SCHEMA_SHARED_DAY_RESERVED',reservation:p.reservation,protected_next_full:p.next_full,retained_history_cap_changed:false};
}
export async function initializeFreeArchiveSchemas({pool,source_usage,before_mutate,execute=false}={}){
 if(!pool?.enabled||typeof source_usage!=='function'||typeof before_mutate!=='function')throw Error('FREE_ARCHIVE_SCHEMA_BOUNDED_CONTROL_REQUIRED');
 const locations=Object.keys(PRIVATE_CANONICAL_DATABASES).filter(s=>s!=='LEGACY');
 if(JSON.stringify(pool.locations)!==JSON.stringify(['LEGACY',...locations]))throw Error('FREE_ARCHIVE_SCHEMA_EXACT_FOUR_RESOURCES_REQUIRED');
 const out={schema:'FREE_ARCHIVE_SCHEMA_INITIALIZATION_V1',execute,locations:[],existing_main_rows_modified:0,sourceHTTP:0,MAIN:0,Telegram:0,relocation_performed:false,writer_activation:false};
 const admit=(r,w)=>{const usages=[source_usage(),pool.usageSnapshot()],usage=Object.fromEntries(['requests','rows_read','rows_written','unknown_ops'].map(k=>[k,usages.reduce((s,u)=>s+u[k],0)]));if(!evaluateWithinRunReservation({reservation:FREE_ARCHIVE_SCHEMA_POLICY.reservation,currentUsage:usage,extraRowsRead:r,extraRowsWritten:w+1}).allowed)throw Error('FREE_ARCHIVE_SCHEMA_NATIVE_HEADROOM_REQUIRED');};
 try{
  for(const location of locations){
   const db=pool.get(location);admit(100,16);
   const identity=await db.verifyDatabase();
   const rows=(await db.query(FREE_ARCHIVE_SCHEMA_READ)).results,complete=verifySchema(rows);
   const item={location,database_id:identity.database_id,already_initialized:complete,initialized:false};out.locations.push(item);
   if(!complete&&execute){await before_mutate();admit(100,16);await db.query(FREE_ARCHIVE_SCHEMA_TABLE+';'+FREE_ARCHIVE_SCHEMA_INDEX);admit(100,0);verifySchema((await db.query(FREE_ARCHIVE_SCHEMA_READ)).results,{complete:true});item.initialized=true;}
   else if(complete)item.initialized=true;
  }
  out.status=out.locations.every(r=>r.initialized)?'EXACT_FOUR_FREE_ARCHIVE_SCHEMAS_VERIFIED':'FREE_ARCHIVE_SCHEMAS_PREPARED_NO_DDL';return out;
 }catch(error){error.schema_receipt={...out,status:'FREE_ARCHIVE_SCHEMA_PARTIAL_OR_REFUSED'};throw error;}
}
