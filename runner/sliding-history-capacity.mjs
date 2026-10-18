import {protectedCanonicalPredicate} from './protected-canonical-compaction.mjs';
import {evaluateWithinRunReservation} from './d1-preaction-budget-guard.mjs';

// Owner18Oct: old detailed bodies may expire; identifiers, original clocks,
// decision summaries, statistics, latest rows and referenced signals remain.
// This is intentionally NOT the older lossless archive/48-row operation.
export const SLIDING_HISTORY_POLICY=Object.freeze({
 schema:'OWNER_PAID_SLIDING_HISTORY_V1',account_id:'70ee0af85191ea470e74c7383fdec772',
 primary_id:'057a2847-2cc4-4e52-8534-1be1596d21d5',primary_name:'report2-data-plane',
 account_ceiling_bytes:5_000_000_000,high_water_bytes:4_000_000_000,
 target_bytes:3_500_000_000,minimum_hot_ms:48*3600_000,
 metadata_age_ms:30*60_000,window_rows:128,reference_rows:1024,
 canonical_rows:48,evidence_rows:48,maximum_body_updates:96,
 // A new owner-authorized detail-expiry operation (96 body UPDATEs), NOT a
 // larger lossless archive allowance. Shares RETAINED_HISTORY two/day; old
 // archive mode remains48/5000R400W. Overall3500000R70000W stays unchanged.
 reservation:{rows_read:20000,rows_written:400},max_runs_day:2,
});
const count=n=>Number.isSafeInteger(n)&&n>=0;
const references={
 v3_dispatch_publication_binding_shadow:['publication_id'],
 v3_recheck_task_shadow:['contract_code','publication_id','last_result'],
 v3_user_lifecycle_shadow:['contract','direction','wave_id','observation_ts','status'],
 v3_telegram_dispatch_shadow:['contract','direction','wave_id','decision_id'],
 tz101_entry_area_calibration_signal:['decision_id','snapshot_id'],
 report2_command_v2:['result_snapshot_id'],report2_publication_v2:['publication_id'],
 report2_delivered_outcome_v2:['publication_id'],
};
const mandatory=['canonical_publication_shadow','full_evidence_shadow_log',...Object.keys(references).slice(0,5)];
const quote=s=>"'"+String(s).replaceAll("'","''")+"'";
export function slidingCapacityDecision({databases,complete,observed_ts,now=Date.now(),enabled=false,paid_confirmed=false}={}){
 const p=SLIDING_HISTORY_POLICY,out={schema:p.schema,due:false,allowed:false,sourceHTTP:0,SQL:0,history_days_promised:null};
 if(!enabled||!paid_confirmed)return{...out,status:'OWNER_PAID_POLICY_REQUIRED'};
 if(!complete||!count(now)||!count(observed_ts)||observed_ts>now||now-observed_ts>p.metadata_age_ms||!Array.isArray(databases)||!databases.length||databases.length>10)return{...out,status:'FRESH_COMPLETE_ACCOUNT_STORAGE_REQUIRED'};
 const ids=new Set();for(const d of databases){if(!/^[a-f0-9-]{36}$/.test(d?.uuid||'')||ids.has(d.uuid)||typeof d.name!=='string'||!count(d.file_size))return{...out,status:'EXACT_DATABASE_BYTES_REQUIRED'};ids.add(d.uuid);}
 const primary=databases.find(d=>d.uuid===p.primary_id&&d.name===p.primary_name);
 if(!primary)return{...out,status:'EXACT_PRIMARY_DATABASE_REQUIRED'};
 const total=databases.reduce((n,d)=>n+d.file_size,0);if(!count(total))return{...out,status:'EXACT_DATABASE_BYTES_REQUIRED'};
 return{...out,status:total>=p.high_water_bytes?'BOUNDED_OLD_DETAIL_EXPIRY_DUE':'STORAGE_BELOW_HIGH_WATERMARK',allowed:true,due:total>=p.high_water_bytes,
  account_bytes:total,primary_bytes:primary.file_size,other_database_bytes:total-primary.file_size,
  account_ceiling_bytes:p.account_ceiling_bytes,high_water_bytes:p.high_water_bytes,target_bytes:p.target_bytes,
  reclaim_target_bytes:Math.max(0,total-p.target_bytes),account_headroom_bytes:Math.max(0,p.account_ceiling_bytes-total),
  cleanup_reservation:p.reservation,maximum_body_updates:p.maximum_body_updates,
  cleanup_preserves_original_clocks:true,cleanup_preserves_scalar_statistics:true,
  throughput_or_full_report_accepted:false};
}

function referenceCTE(tables,bounds){
 let predicate=protectedCanonicalPredicate('?1',tables.filter(t=>t!=='full_evidence_shadow_log'));
 predicate=predicate.replace('NOT EXISTS(SELECT 1 FROM report2_command_v2 c WHERE c.result_snapshot_id=p.snapshot_id)',
  "p.snapshot_id NOT IN(SELECT result_snapshot_id FROM report2_command_v2 WHERE result_snapshot_id IS NOT NULL)");
 // The same complete bounded census is materialized once for the whole
 // mutation. A reference added after discovery is checked by this statement.
 const ctes=[],checks=[];
 for(const [table,bound] of Object.entries(bounds)){
  if(!Object.hasOwn(references,table)||!tables.includes(table)||!count(bound)||bound>SLIDING_HISTORY_POLICY.reference_rows+8)throw Error('EXPIRY_EXACT_REFERENCE_BOUND_REQUIRED');
  const name='expiry_'+table;ctes.push(`${name} AS MATERIALIZED(SELECT ${references[table].join(',')} FROM ${table} LIMIT ${bound+1})`);
  checks.push(`(SELECT COUNT(*) FROM ${name})<=${bound}`);predicate=predicate.replaceAll('FROM '+table+' ','FROM '+name+' ');
 }
 // Same conservative indexed16-row newer witness as existing retention.
 predicate=predicate.replace("EXISTS(SELECT 1 FROM canonical_publication_shadow newer WHERE newer.contract_code=p.contract_code AND (newer.observed_ts>p.observed_ts OR (newer.observed_ts=p.observed_ts AND newer.publication_id>p.publication_id)))",
  'EXISTS(SELECT 1 FROM (SELECT observed_ts,publication_id FROM canonical_publication_shadow INDEXED BY idx_canonical_publication_identity WHERE contract_code=p.contract_code AND run_id>p.run_id LIMIT 16) newer WHERE newer.observed_ts>p.observed_ts OR (newer.observed_ts=p.observed_ts AND newer.publication_id>p.publication_id))');
 return{with_sql:'WITH '+ctes.join(',')+' ',predicate:checks.join(' AND ')+' AND '+predicate};
}

export async function reserveCapacityExpiryBudget(db,{reservation_id,now=Date.now()}={}){
 const p=SLIDING_HISTORY_POLICY,day=new Date(now).toISOString().slice(0,10);
 if(!/^RETAINED_HISTORY:\d+:\d+$/.test(reservation_id||'')||!count(now)||now<1e12)throw Error('EXACT_RETAINED_RESERVATION_REQUIRED');
 const ack=await db.prepare(`INSERT OR IGNORE INTO report2_runner_budget_ledger_shadow(reservation_id,day_utc,reserve_rows_read,reserve_rows_written,state,started_ts)
 SELECT ?1,?2,?3,?4,'RESERVED',?5 FROM(
 SELECT COALESCE(SUM(MAX(reserve_rows_read,COALESCE(measured_rows_read,0)+CASE WHEN state='FINALIZED' THEN 1 ELSE 0 END)),0) AS reads,
 COALESCE(SUM(MAX(reserve_rows_written,COALESCE(measured_rows_written,0))),0) AS writes,
 COALESCE(SUM(CASE WHEN state='FINALIZED' AND COALESCE(unknown_ops,1)>0 THEN 1 ELSE 0 END),0) AS unknown_count,
 COALESCE(SUM(CASE WHEN reservation_id LIKE 'RETAINED_HISTORY:%' THEN 1 ELSE 0 END),0) AS prior_count
 FROM report2_runner_budget_ledger_shadow WHERE day_utc=?2)
 WHERE reads+?3+59000<=3500000 AND writes+?4+920<=70000 AND unknown_count=0 AND prior_count<2`).bind(reservation_id,day,p.reservation.rows_read,p.reservation.rows_written,now).run();
 if(ack?.meta?.changes!==1)return{allowed:false,status:ack?.meta?.changes===0?'RETAINED_DAY_CAP_UNKNOWN_OR_NEXT_FULL_RESERVE':'RETAINED_ADMISSION_ACK_INVALID'};
 const row=await db.prepare('SELECT reservation_id,day_utc,reserve_rows_read,reserve_rows_written,state FROM report2_runner_budget_ledger_shadow WHERE reservation_id=?1 LIMIT 1').bind(reservation_id).first();
 if(row?.state!=='RESERVED'||row.day_utc!==day||row.reserve_rows_read!==p.reservation.rows_read||row.reserve_rows_written!==p.reservation.rows_written)throw Error('RETAINED_RESERVATION_READBACK_REQUIRED');
 return{allowed:true,status:'ATOMIC_SHARED_DAY_RESERVED',reservation_id,reservation:p.reservation,next_full_protected:{rows_read:59000,rows_written:920},quotas_reset:false};
}
export function canonicalExpirySQL({tables,bounds,ids}){
 if(!Array.isArray(ids)||!ids.length||ids.length>48||new Set(ids).size!==ids.length||ids.some(id=>!/^PUB:[a-f0-9]{40,64}$/.test(id)))throw Error('EXACT_EXPIRY_PUBLICATIONS_REQUIRED');
 const scope=referenceCTE(tables,bounds);
 return `${scope.with_sql}UPDATE canonical_publication_shadow AS p
 SET canonical_json=json_set(json_remove(p.canonical_json,'$.metadata'),'$.status','DETAILS_EXPIRED',
  '$.metadata',json_object('contract',p.contract_code,'history_details_expired',json('true'),'expired_at_ts',?2,'original_observed_ts',p.observed_ts,'reason','OWNER_VOLUME_BOUNDED_RETENTION')),
 presentation_inputs_json=json_object('schema','EXPIRED_PRESENTATION_DETAILS_V1','contract',p.contract_code,'run_id',p.run_id,'snapshot_id',p.snapshot_id,'original_observed_ts',p.observed_ts,'expired_at_ts',?2)
 WHERE p.publication_id IN (${ids.map(quote).join(',')}) AND ${scope.predicate}
 AND json_valid(p.canonical_json) AND json_extract(p.canonical_json,'$.status')='CLOSED'
 AND json_extract(p.canonical_json,'$.state')='REJECTED'
 RETURNING publication_id,contract_code,run_id,snapshot_id,observed_ts,canonical_state,canonical_json`;
}

// A full-evidence proof is expired only after the corresponding REJECTED
// canonical is explicitly expired. All42 other original columns remain.
// If identity, JSON shape or correspondence is missing, retain the proof.
export function fullEvidenceExpirySQL(ids){
 if(!Array.isArray(ids)||!ids.length||ids.length>48||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||id.length>256))throw Error('EXACT_EXPIRY_EVIDENCE_REQUIRED');
 return `UPDATE full_evidence_shadow_log AS e SET stage392_proof_bundle_json=json_object(
 'schema','EXPIRED_FULL_EVIDENCE_DETAILS_V1','history_details_expired',json('true'),
 'full_evidence_id',e.full_evidence_id,'contract',e.contract_code,'original_observed_ts',e.observed_ts,'expired_at_ts',?2)
 WHERE e.full_evidence_id IN (${ids.map(quote).join(',')}) AND e.observed_ts<?1 AND e.persisted_ts<?1
 AND json_valid(e.stage392_proof_bundle_json)
 AND json_extract(e.stage392_proof_bundle_json,'$.history_details_expired') IS NULL
 AND EXISTS(SELECT 1 FROM full_evidence_shadow_log newer INDEXED BY idx_full_evidence_shadow_contract_ts
 WHERE newer.contract_code=e.contract_code AND newer.observed_ts>e.observed_ts)
 AND EXISTS(SELECT 1 FROM canonical_publication_shadow p INDEXED BY idx_canonical_publication_identity
 WHERE p.contract_code=e.contract_code AND p.snapshot_id=json_extract(e.stage392_proof_bundle_json,'$.snapshot_id')
 AND p.canonical_state='REJECTED' AND json_valid(p.canonical_json)
 AND json_extract(p.canonical_json,'$.metadata.history_details_expired')=1)
 RETURNING full_evidence_id,contract_code,observed_ts,stage392_proof_bundle_json`;
}

export async function expireOldDetails({db,before_modify,now=Date.now(),source_cursor=0,evidence_cursor=0,decision}={}){
 const p=SLIDING_HISTORY_POLICY;
 if(decision?.allowed!==true||decision.due!==true||decision.schema!==p.schema||typeof before_modify!=='function'||!db?.prepare||typeof db.usageSnapshot!=='function'||![now,source_cursor,evidence_cursor].every(count))throw Error('ADMITTED_VOLUME_EXPIRY_REQUIRED');
 const out={schema:'BOUNDED_OLD_DETAILS_EXPIRY_V1',sourceHTTP:0,MAIN:0,Telegram:0,history_detail_loss_authorized:true,
  source_clocks_refreshed:false,publication_rows_deleted:0,reference_or_statistic_rows_modified:0,
  canonical_expired:[],full_evidence_expired:[],source_cursor,evidence_cursor,physical_bytes_reclaimed:null,native_throughput_qualified:false};
 const need=(r,w)=>{const a=evaluateWithinRunReservation({reservation:p.reservation,currentUsage:db.usageSnapshot(),extraRowsRead:r,extraRowsWritten:w+4});if(!a.allowed)throw Object.assign(Error('SLIDING_NATIVE_HEADROOM_REQUIRED:'+a.status),{expiry_receipt:{...out,D1:db.usageSnapshot()}});};
 need(500,0);
 const schema=(await db.prepare(`SELECT name,type FROM sqlite_schema WHERE name IN (${[...new Set([...mandatory,...Object.keys(references)])].map(quote).join(',')})`).all()).results;
 if(!Array.isArray(schema)||schema.some(r=>r.type!=='table')||mandatory.some(t=>!schema.some(r=>r.name===t)))throw Error('EXPIRY_REFERENCE_SCHEMA_REQUIRED');
 const tables=schema.map(r=>r.name),names=Object.keys(references).filter(t=>tables.includes(t));
 // No triggers may allocate extra rows or perform unaccounted side effects.
 need(500,0);const triggers=(await db.prepare("SELECT name FROM sqlite_schema WHERE type='trigger' AND tbl_name IN ('canonical_publication_shadow','full_evidence_shadow_log') AND (upper(sql) GLOB '* UPDATE *' OR upper(sql) GLOB '* DELETE *') LIMIT 1").all()).results;
 if(!Array.isArray(triggers)||triggers.length)throw Error('EXPIRY_TRIGGER_FREE_SCHEMA_REQUIRED');
 need(300,0);
 const metadata=(await db.prepare(`SELECT rowid AS source_rowid,publication_id,contract_code,observed_ts FROM canonical_publication_shadow WHERE rowid>?1 ORDER BY rowid LIMIT ${p.window_rows}`).bind(source_cursor).all()).results;
 if(!Array.isArray(metadata)||metadata.length>p.window_rows)throw Error('EXPIRY_METADATA_ACK_REQUIRED');
 const ids=metadata.slice(0,p.canonical_rows).map(r=>r.publication_id);
 need(2*names.length*(p.reference_rows+1)+32,0);
 const rows=await db.batch(names.map(t=>db.prepare(`SELECT ${references[t].join(',')} FROM ${t} LIMIT ${p.reference_rows+1}`)));
 if(!Array.isArray(rows)||rows.length!==names.length||rows.some(r=>!Array.isArray(r.results)||r.results.length>p.reference_rows))throw Error('EXPIRY_COMPLETE_BOUNDED_REFERENCES_REQUIRED');
 const bounds=Object.fromEntries(names.map((t,i)=>[t,rows[i].results.length+8]));
 const referenceReserve=64+4*Object.values(bounds).reduce((a,n)=>a+n+1,0)+500;
 const cutoff=now-p.minimum_hot_ms;
 if(ids.length){
  need(referenceReserve+48*36,48);
  await before_modify();
  const result=await db.prepare(canonicalExpirySQL({tables,bounds,ids})).bind(cutoff,now).all();
  if(!Array.isArray(result.results)||!count(result.meta?.changes)||result.meta.changes!==result.results.length||result.results.some(r=>!ids.includes(r.publication_id)||JSON.parse(r.canonical_json).status!=='DETAILS_EXPIRED'||r.observed_ts>=cutoff))throw Error('EXPIRY_CANONICAL_ACK_REQUIRED');
  out.canonical_expired=result.results.map(({canonical_json,...r})=>r);
 }
 out.next_source_cursor=metadata.length>48?metadata[47].source_rowid:0;
 need(300,0);
 const evidence=(await db.prepare(`SELECT rowid AS source_rowid,full_evidence_id FROM full_evidence_shadow_log WHERE rowid>?1 ORDER BY rowid LIMIT ${p.window_rows}`).bind(evidence_cursor).all()).results;
 if(!Array.isArray(evidence)||evidence.length>p.window_rows)throw Error('EXPIRY_EVIDENCE_METADATA_ACK_REQUIRED');
 const evidenceIds=evidence.slice(0,p.evidence_rows).map(r=>r.full_evidence_id);
 if(evidenceIds.length){need(48*36+64,48);await before_modify();const result=await db.prepare(fullEvidenceExpirySQL(evidenceIds)).bind(cutoff,now).all();
  if(!Array.isArray(result.results)||!count(result.meta?.changes)||result.meta.changes!==result.results.length||result.results.some(r=>!evidenceIds.includes(r.full_evidence_id)||JSON.parse(r.stage392_proof_bundle_json).history_details_expired!==true||r.observed_ts>=cutoff))throw Error('EXPIRY_FULL_EVIDENCE_ACK_REQUIRED');
  out.full_evidence_expired=result.results.map(({stage392_proof_bundle_json,...r})=>r);
 }
 out.next_evidence_cursor=evidence.length>48?evidence[47].source_rowid:0;
 need(0,0);out.D1=db.usageSnapshot();out.status='OLD_DETAIL_EXPIRY_COMPLETED_WITH_ORIGINAL_SCALARS_RETAINED';return out;
}
