import assert from 'node:assert/strict';
import {packHistoryRow,unpackHistoryRow,archivedHeader,exactArchiveSql,createHistoryRestorer} from './retained-history.mjs';
import {evaluateWithinRunReservation} from './d1-preaction-budget-guard.mjs';

export const LOSSLESS_RECOVERY_POLICY=Object.freeze({max_rows:48,max_runs_day:2,hot_window_ms:48*3600000,tree_bytes:6000000,reservation:{rows_read:5000,rows_written:400},http_limits:{whole_job:164,hot:96,background:56,statistics:12},planned_whole_day:{rows_read:3413280,rows_written:69738},limits:{rows_read:3500000,rows_written:70000}});
const TABLE='full_evidence_shadow_log';
// Canonical publications and all lifecycle/calibration/forecast references stay
// hot. Preserve the latest original for every coin, including seldom selected
// coins; a date cutoff alone is not sufficient protection.
export const LOSSLESS_RECOVERY_SELECTION_SQL=`SELECT e.* FROM full_evidence_shadow_log e
 WHERE e.observed_ts<?1 AND EXISTS (
  SELECT 1 FROM full_evidence_shadow_log newer INDEXED BY idx_full_evidence_shadow_contract_ts
  WHERE newer.contract_code=e.contract_code AND (newer.observed_ts>e.observed_ts OR (newer.observed_ts=e.observed_ts AND newer.full_evidence_id>e.full_evidence_id)))
 ORDER BY e.observed_ts,e.full_evidence_id LIMIT 48`;

export async function reserveLosslessRecoveryBudget(db,{reservation_id,now=Date.now()}={}){
 if(!/^RETAINED_HISTORY:\d+:\d+$/.test(reservation_id||'')||!Number.isSafeInteger(now)||now<=0)throw Error('EXACT_RETAINED_RECOVERY_RESERVATION_REQUIRED');
 const p=LOSSLESS_RECOVERY_POLICY,day=new Date(now).toISOString().slice(0,10);
 // Count the existing maintenance family too. A new implementation never
 // renames/reset its spent reservations or refunds a preparation-only run.
 const ack=await db.prepare(`INSERT OR IGNORE INTO report2_runner_budget_ledger_shadow(reservation_id,day_utc,reserve_rows_read,reserve_rows_written,state,started_ts)
 SELECT ?1,?2,?3,?4,'RESERVED',?5 FROM (
 SELECT COALESCE(SUM(reserve_rows_read),0) AS reads,COALESCE(SUM(reserve_rows_written),0) AS writes,
 COALESCE(SUM(CASE WHEN state='FINALIZED' AND COALESCE(unknown_ops,1)>0 THEN 1 ELSE 0 END),0) AS unknown_count,
 COALESCE(SUM(CASE WHEN reservation_id LIKE 'RETAINED_HISTORY:%' THEN 1 ELSE 0 END),0) AS prior_count
 FROM report2_runner_budget_ledger_shadow WHERE day_utc=?2)
 WHERE reads+?3<=?6 AND writes+?4<=?7 AND unknown_count=0 AND prior_count<?8`).bind(reservation_id,day,p.reservation.rows_read,p.reservation.rows_written,now,p.limits.rows_read,p.limits.rows_written,p.max_runs_day).run();
 if(ack?.meta?.changes!==1)return{allowed:false,status:ack?.meta?.changes===0?'RETAINED_DAY_CAP_OR_DUPLICATE':'RETAINED_ADMISSION_ACK_INVALID'};
 const row=await db.prepare('SELECT reservation_id,day_utc,reserve_rows_read,reserve_rows_written,state FROM report2_runner_budget_ledger_shadow WHERE reservation_id=?1 LIMIT 1').bind(reservation_id).first();
 if(row?.state!=='RESERVED'||row.day_utc!==day||row.reserve_rows_read!==p.reservation.rows_read||row.reserve_rows_written!==p.reservation.rows_written)throw Error('RETAINED_RESERVATION_READBACK_REQUIRED');
 return{allowed:true,status:'ATOMIC_SHARED_DAY_RESERVED',reservation_id,reservation:p.reservation};
}

export async function recoverLosslessFullEvidence({db,save_originals,fetch_archive,request_admit,before_modify,execute=false,now=Date.now(),secrets=[]}={}){
 if(!db?.prepare||typeof db.batch!=='function'||typeof db.usageSnapshot!=='function'||typeof save_originals!=='function'||typeof fetch_archive!=='function'||typeof request_admit!=='function'||!Number.isSafeInteger(now)||now<=0)throw Error('MEASURED_LOSSLESS_RECOVERY_REQUIRED');
 if(execute&&typeof before_modify!=='function')throw Error('CURRENT_OWN_GUARD_BEFORE_RELOCATION_REQUIRED');
 const p=LOSSLESS_RECOVERY_POLICY,admit=(rows_read,rows_written)=>{
  if(!evaluateWithinRunReservation({reservation:p.reservation,currentUsage:db.usageSnapshot(),extraRowsRead:rows_read,extraRowsWritten:rows_written+3}).allowed)throw Error('RETAINED_SHARED_D1_HEADROOM_REQUIRED');
 };
 admit(12,0);
 const schema=(await db.prepare("SELECT name,type,sql FROM sqlite_schema WHERE name IN ('report2_full_evidence_archive_v1','report2_full_evidence_retained_v1','idx_full_evidence_shadow_contract_ts')").all()).results||[];
 if(!schema.some(r=>r.name==='report2_full_evidence_archive_v1'&&r.type==='table')||!schema.some(r=>r.name==='idx_full_evidence_shadow_contract_ts'&&r.type==='index')||!schema.some(r=>r.name==='report2_full_evidence_retained_v1'&&r.type==='view'&&/UNION ALL/i.test(r.sql)&&/NOT EXISTS/i.test(r.sql)&&r.sql.includes('full_evidence_shadow_log')&&r.sql.includes('report2_full_evidence_archive_v1')))throw Error('CURRENT_RETAINED_TABLE_VIEW_AND_INDEX_REQUIRED');
 admit(3000,0);
 const selected=(await db.prepare(LOSSLESS_RECOVERY_SELECTION_SQL).bind(now-p.hot_window_ms).all()).results||[];
 if(selected.length>p.max_rows)throw Error('RETAINED_SOURCE_ROW_BOUND');
 const prepared=[];let tree_bytes=0,oversized=0;
 for(const row of selected){
  if(!row.full_evidence_id||!row.contract_code||!Number.isSafeInteger(row.observed_ts)||row.observed_ts>=now-p.hot_window_ms)throw Error('RETAINED_EXACT_OLD_ROW_REQUIRED');
  const raw=JSON.stringify(row);if(secrets.some(s=>typeof s==='string'&&s.length>=12&&raw.includes(s)))throw Error('RETAINED_SECRET_EXPORT_DENIED');
  let packed;try{packed=packHistoryRow(row);}catch(error){if(error.message==='HISTORY_ROW_TOO_LARGE'){oversized++;continue;}throw error;}
  assert.deepEqual(unpackHistoryRow(packed.envelope,packed.envelope.raw_sha256),row);
  const bytes=Buffer.byteLength(JSON.stringify(packed.envelope));if(tree_bytes+bytes>p.tree_bytes)break;
  tree_bytes+=bytes;prepared.push({row,...packed});
 }
 const out={schema:'LOSSLESS_FULL_EVIDENCE_RECOVERY_V1',sourceHTTP:0,MAIN:0,Telegram:0,canonical_rows_modified:0,lifecycle_or_calibration_rows_modified:0,history_discarded:false,source_clocks_refreshed:false,hot_window_ms:p.hot_window_ms,latest_per_coin_retained:true,selected:selected.length,oversized_retained_hot:oversized,prepared:prepared.length,moved:[],execute};
 if(!prepared.length)return{...out,status:selected.length?'OVERSIZED_OR_TREE_BOUND_KEEP_HOT':'NO_SAFE_COLD_ROWS'};
 const saved=await save_originals(prepared);
 if(!/^[a-f0-9]{40}$/.test(saved?.commit||''))throw Error('DURABLE_IMMUTABLE_GIT_COMMIT_REQUIRED');
 out.archive_commit=saved.commit;
 const reader=createHistoryRestorer({fetch_impl:fetch_archive,max_fetches:p.max_rows,request_admit});
 // Verify the entire exact durable batch before the first production change.
 for(const s of prepared){s.header=archivedHeader(s.row,{commit:saved.commit,path:s.path,raw_sha256:s.envelope.raw_sha256});assert.deepEqual(await reader.restore(s.header),s.row);}
 out.originals_verified=prepared.length;out.archive_HTTP=reader.usage().archive_http;
 if(!execute)return{...out,status:'DURABLE_ORIGINALS_VERIFIED_NO_PRIMARY_ROWS_MODIFIED',D1:db.usageSnapshot(),rows_readthrough_relocation_pending:true};
 try{for(const [index,s] of prepared.entries()){
  if(index%8===0)await before_modify();
  const plan=exactArchiveSql(TABLE,s.row,s.header);admit(5,16);
  const existing=await db.prepare(plan.read.sql).bind(...plan.read.params).first();if(existing)assert.deepEqual(await reader.restore(existing),s.row);
  // Compare every original column. A concurrent mutation leaves the hot row
  // untouched; the verified copy is never used to erase a different revision.
  // D1 batch is transactional. Delete the already durable exact revision
  // before allocating its small header; a full database can reuse those pages.
  // If header insertion fails, D1 rolls back the deletion as well.
  const ack=await db.batch([db.prepare(plan.remove.sql).bind(...plan.remove.params),db.prepare(plan.insert.sql).bind(...plan.insert.params)]);
  if(!Array.isArray(ack)||ack[0]?.meta?.changes!==1)throw Error('RETAINED_ORIGINAL_CHANGED_KEEP_HOT');
  const found=await db.prepare('SELECT * FROM report2_full_evidence_retained_v1 WHERE full_evidence_id=?1 LIMIT 1').bind(s.row.full_evidence_id).first();assert.deepEqual(await reader.restore(found),s.row);
  out.moved.push({id:s.row.full_evidence_id,contract:s.row.contract_code,observed_ts:s.row.observed_ts,raw_bytes:s.envelope.raw_bytes,raw_sha256:s.envelope.raw_sha256,path:s.path});
 }}catch(error){error.recovery_receipt={...out,status:'PARTIAL_RELOCATION_ORIGINALS_AND_VERIFIED_MOVES_RETAINED',D1:db.usageSnapshot(),archive_HTTP:reader.usage().archive_http};throw error;}
 return{...out,status:'LOSSLESS_RELOCATION_AND_CURRENT_READTHROUGH_VERIFIED',D1:db.usageSnapshot(),archive_HTTP:reader.usage().archive_http,partial_candidate_set:prepared.length<selected.length};
}
