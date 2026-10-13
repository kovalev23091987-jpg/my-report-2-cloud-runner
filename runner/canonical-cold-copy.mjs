import {encodeCanonicalPublicationRow,retainCanonicalPublicationRow} from './canonical-cold-archive.mjs';
import {privateCanonicalHeader,createPrivateCanonicalRestorer} from './private-canonical-history.mjs';
import {combineMeasuredD1Usage} from './private-archive-d1-api.mjs';
import {evaluateWithinRunReservation} from './d1-preaction-budget-guard.mjs';

export const CANONICAL_COPY_POLICY=Object.freeze({max_rows:2,max_runs_day:47,reservation:Object.freeze({rows_read:5000,rows_written:80}),max_daily_reads:3500000,max_daily_writes:70000});
const PUB=/^PUB:[a-f0-9]{40,64}$/,HEX=/^[a-f0-9]{64}$/;
export function canonicalProducerInMainHistory({producer_head,main_head,comparison}={}){
 if(!/^[a-f0-9]{40}$/.test(producer_head||'')||!/^[a-f0-9]{40}$/.test(main_head||''))return false;
 return producer_head===main_head||comparison?.merge_base_commit?.sha===producer_head&&comparison?.status==='ahead';
}
export function canonicalCopyCandidates(report,expected_head){
 if(report?.status!=='CLOSED'||report.head!==expected_head||!/^[a-f0-9]{40}$/.test(String(expected_head||''))||!report.run_id||!Array.isArray(report.candidates))return{status:'NO_EXACT_CLOSED_REPORT',candidates:[]};
 if(report.candidates.length>CANONICAL_COPY_POLICY.max_rows)return{status:'ARCHIVE_CANDIDATE_BOUND',candidates:[]};
 const seen=new Set();
 for(const c of report.candidates){
  if(!PUB.test(c.publication_id||'')||seen.has(c.publication_id)||c.run_id!==report.run_id||!c.snapshot_id||!c.contract||!Number.isSafeInteger(c.observed_ts)||c.observed_ts<=0||!HEX.test(c.canonical?.analytical_fingerprint||'')||c.canonical.run_id!==c.run_id||c.canonical.snapshot_id!==c.snapshot_id||c.canonical.observed_ts!==c.observed_ts)return{status:'ARCHIVE_REPORT_BINDING_REQUIRED',candidates:[]};
  seen.add(c.publication_id);
 }
 return{status:report.candidates.length?'EXACT_CLOSED_CANDIDATES':'NO_PUBLICATIONS',candidates:report.candidates.map(c=>({publication_id:c.publication_id,run_id:c.run_id,snapshot_id:c.snapshot_id,contract_code:c.contract,observed_ts:c.observed_ts,analytical_fingerprint:c.canonical.analytical_fingerprint}))};
}
// One atomic INSERT accounts for simultaneous archive/history callers. Never
// resets the day ledger and never consumes provider or analytical allowances.
export async function reserveCanonicalCopyBudget(db,{reservation_id,now=Date.now()}={}){
 if(!/^CANONICAL_COLD_COPY:[0-9]+:[0-9]+$/.test(reservation_id||'')||!Number.isSafeInteger(now)||now<=0)throw Error('ARCHIVE_RESERVATION_ID_REQUIRED');
 const p=CANONICAL_COPY_POLICY,day=new Date(now).toISOString().slice(0,10);
 const result=await db.prepare(`INSERT OR IGNORE INTO report2_runner_budget_ledger_shadow(reservation_id,day_utc,reserve_rows_read,reserve_rows_written,state,started_ts)
 SELECT ?1,?2,?3,?4,'RESERVED',?5 WHERE
 COALESCE((SELECT SUM(reserve_rows_read) FROM report2_runner_budget_ledger_shadow WHERE day_utc=?2),0)+?3<=?6 AND
 COALESCE((SELECT SUM(reserve_rows_written) FROM report2_runner_budget_ledger_shadow WHERE day_utc=?2),0)+?4<=?7 AND
 NOT EXISTS(SELECT 1 FROM report2_runner_budget_ledger_shadow WHERE day_utc=?2 AND state='FINALIZED' AND COALESCE(unknown_ops,1)>0) AND
 (SELECT COUNT(*) FROM report2_runner_budget_ledger_shadow WHERE day_utc=?2 AND reservation_id LIKE 'CANONICAL_COLD_COPY:%')<?8`).bind(reservation_id,day,p.reservation.rows_read,p.reservation.rows_written,now,p.max_daily_reads,p.max_daily_writes,p.max_runs_day).run();
 const changes=Number(result?.meta?.changes??result?.changes);if(changes!==1)return{allowed:false,status:changes===0?'ARCHIVE_DAY_BOUND_OR_DUPLICATE':'ARCHIVE_ADMISSION_ACK_INVALID'};
 const row=await db.prepare('SELECT reservation_id,day_utc,reserve_rows_read,reserve_rows_written,state FROM report2_runner_budget_ledger_shadow WHERE reservation_id=?1 LIMIT 1').bind(reservation_id).first();
 if(row?.state!=='RESERVED'||row.day_utc!==day||Number(row.reserve_rows_read)!==p.reservation.rows_read||Number(row.reserve_rows_written)!==p.reservation.rows_written)throw Error('ARCHIVE_RESERVATION_READBACK_REQUIRED');
 return{allowed:true,status:'ATOMIC_SHARED_DAY_RESERVED',reservation:p.reservation};
}
export async function copyCanonicalReport({source_db,archive_db,candidates,now=Date.now()}={}){
 if(!Array.isArray(candidates)||candidates.length>2||!candidates.length)throw Error('ARCHIVE_EXACT_CANDIDATES_REQUIRED');
 const usage=()=>combineMeasuredD1Usage(source_db.usageSnapshot(),archive_db.usageSnapshot()),reservation=CANONICAL_COPY_POLICY.reservation;
 const admit=e=>evaluateWithinRunReservation({reservation,currentUsage:usage(),extraRowsRead:e.rows_read,extraRowsWritten:e.rows_written+1});
 if(!admit({rows_read:1,rows_written:0}).allowed)throw Error('ARCHIVE_RUN_HEADROOM_DENIED');
 await archive_db.query('SELECT 1 AS size_marker');
 const reader=createPrivateCanonicalRestorer({archive_db,db_admit:admit,max_rows:2});
 const receipts=[];
 for(const binding of candidates){
  if(!admit({rows_read:5,rows_written:24}).allowed)throw Error('ARCHIVE_RUN_HEADROOM_DENIED');
  const row=await source_db.prepare('SELECT * FROM canonical_publication_shadow WHERE publication_id=?1 AND run_id=?2 LIMIT 1').bind(binding.publication_id,binding.run_id).first();if(!row)throw Error('ARCHIVE_SOURCE_ROW_MISSING');
  for(const [k,v] of Object.entries(binding))if(row[k]!==v)throw Error('ARCHIVE_SOURCE_REPORT_BINDING_MISMATCH');
  const record=encodeCanonicalPublicationRow(row),stored=await retainCanonicalPublicationRow(archive_db,record,{db_admit:admit,storage_bytes:archive_db.storage_bytes,now});
  if(!stored.retained)throw Error(stored.status);
  const restored=await reader.restore(await privateCanonicalHeader(row,record));
  if(JSON.stringify(restored)!==JSON.stringify(row))throw Error('ARCHIVE_PRIVATE_ORIGINAL_READBACK_MISMATCH');
  const {payload_gzip_base64,...manifest}=record;
  receipts.push({...manifest,stored,private_reader_verified:true,portable_decoder_and_projected_header_verified:true,original_clocks_unchanged:true});
 }
 return{status:'PRIVATE_ORIGINAL_ROWS_DURABLE_VERIFIED',records:receipts,sourceHTTP:0,main_rows_modified:0,private_payload_exported:false,report_effect:false,weight_effect:false};
}
