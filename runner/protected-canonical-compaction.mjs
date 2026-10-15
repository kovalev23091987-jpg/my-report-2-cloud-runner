import assert from 'node:assert/strict';
import {encodeCanonicalPublicationRow,retainCanonicalPublicationRow} from './canonical-cold-archive.mjs';
import {privateCanonicalHeader,createPrivateCanonicalRestorer,PRIVATE_CANONICAL_PREFIX} from './private-canonical-history.mjs';
import {combineMeasuredD1Usage} from './private-archive-d1-api.mjs';
import {evaluateWithinRunReservation} from './d1-preaction-budget-guard.mjs';
import {LOSSLESS_RECOVERY_POLICY} from './lossless-full-evidence-recovery.mjs';
import {retainCanonicalInPool,prefetchCanonicalArchivePool} from './private-archive-pool.mjs';
import {prefetchExactCanonicalRevisions} from './private-canonical-prefetch.mjs';
import {loadBoundedCanonicalCandidates,boundedCanonicalReferenceSQL} from './bounded-canonical-selection.mjs';

// Uses the existing RETAINED_HISTORY reservation, never an additional family.
// Only large, old REJECTED bodies are replaced. Every publication, scalar,
// reference and statistic remains in its original table and retains its clock.
export const PROTECTED_CANONICAL_POLICY=Object.freeze({max_rows:48,max_rows_per_batch:8,max_batches:6,native_readbacks:4,hot_window_ms:48*3600000,min_saved_bytes:16384,bridge_wire_bytes:1400000,reservation:LOSSLESS_RECOVERY_POLICY.reservation});
const REQUIRED_TABLES=['canonical_publication_shadow','v3_recheck_task_shadow','v3_dispatch_publication_binding_shadow','v3_user_lifecycle_shadow','v3_telegram_dispatch_shadow','tz101_entry_area_calibration_signal'];
const OPTIONAL_TABLES=['report2_command_v2','report2_publication_v2','report2_delivered_outcome_v2'];
const REFERENCE_TABLES=[...REQUIRED_TABLES,...OPTIONAL_TABLES];
const quote=column=>{if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(column))throw Error('CANONICAL_COLUMN_INVALID');return '"'+column+'"';};

// Repeated inside the conditional UPDATE so a new reference between selection
// and modification keeps the original hot, even if its own row did not change.
export function protectedCanonicalPredicate(cutoff='?1',present_tables=REFERENCE_TABLES){
 const present=new Set(present_tables);
 if(REQUIRED_TABLES.some(t=>!present.has(t))||[...present].some(t=>!REFERENCE_TABLES.includes(t)))throw Error('CANONICAL_PROTECTED_REFERENCE_SCHEMA_REQUIRED');
 // A V2 namespace may not be installed. Prove its absence again in the
 // conditional UPDATE: creation after selection keeps every affected row hot.
 const absent=OPTIONAL_TABLES.filter(t=>!present.has(t));
 const absence_guard=absent.length?`AND NOT EXISTS(SELECT 1 FROM sqlite_schema WHERE name IN (${absent.map(t=>`'${t}'`).join(',')}))`:'';
 const optional=OPTIONAL_TABLES.filter(t=>present.has(t)).map(t=>t==='report2_command_v2'?'AND NOT EXISTS(SELECT 1 FROM report2_command_v2 c WHERE c.result_snapshot_id=p.snapshot_id)':t==='report2_publication_v2'?'AND NOT EXISTS(SELECT 1 FROM report2_publication_v2 q WHERE q.publication_id=p.publication_id)':'AND NOT EXISTS(SELECT 1 FROM report2_delivered_outcome_v2 o WHERE o.publication_id=p.publication_id)').join('\n ');
 return `p.observed_ts<${cutoff} AND p.created_ts<${cutoff} AND (p.valid_until_ts IS NULL OR p.valid_until_ts<${cutoff})
 AND p.shadow_only=1 AND p.canonical_state='REJECTED' AND p.actionability_status IN ('UNASSESSED','INTERNAL_ONLY','REJECTED')
 AND (p.lifecycle_event IS NULL OR p.lifecycle_event NOT IN ('ENTRY','HOLD','EXIT'))
 AND p.canonical_json NOT GLOB 'R2PRIVATE_CANONICAL_V1:*'
 AND EXISTS(SELECT 1 FROM canonical_publication_shadow newer WHERE newer.contract_code=p.contract_code AND (newer.observed_ts>p.observed_ts OR (newer.observed_ts=p.observed_ts AND newer.publication_id>p.publication_id)))
 AND NOT EXISTS(SELECT 1 FROM v3_dispatch_publication_binding_shadow b WHERE b.publication_id=p.publication_id)
 AND NOT EXISTS(SELECT 1 FROM v3_recheck_task_shadow r WHERE r.contract_code=p.contract_code AND (r.publication_id=p.publication_id OR instr(COALESCE(r.last_result,''),p.publication_id)>0))
 AND NOT EXISTS(SELECT 1 FROM v3_user_lifecycle_shadow l WHERE l.contract=p.contract_code AND l.direction=p.direction AND (l.wave_id=p.wave_id OR l.observation_ts=p.observed_ts) AND l.status IN ('OBSERVE','WAIT','ENTRY','HOLD','EXIT'))
 AND NOT EXISTS(SELECT 1 FROM v3_telegram_dispatch_shadow d WHERE d.contract=p.contract_code AND d.direction=p.direction AND (d.wave_id=p.wave_id OR d.decision_id=p.decision_id))
 AND NOT EXISTS(SELECT 1 FROM tz101_entry_area_calibration_signal s WHERE s.decision_id=p.decision_id OR s.snapshot_id=p.snapshot_id)
 ${optional}
 ${absence_guard}`;
}
export const PROTECTED_CANONICAL_SELECTION_SQL=`SELECT p.* FROM canonical_publication_shadow p WHERE ${protectedCanonicalPredicate()} ORDER BY p.observed_ts,p.publication_id LIMIT 48`;

export function exactCanonicalBodyUpdate(row,header,cutoff,present_tables=REFERENCE_TABLES,reference_bounds=null,witness=null,reference_scope=null){
 const changed=Object.keys(row).filter(k=>row[k]!==header[k]);
 if(!changed.length||changed.some(k=>!k.endsWith('_json')&&k!=='manual_text'&&k!=='telegram_text'))throw Error('CANONICAL_ONLY_ORIGINAL_BODY_COLUMNS_ALLOWED');
 const params=changed.map(k=>header[k]),set=changed.map((k,i)=>`${quote(k)}=?${i+1}`).join(',');
 const exact=Object.entries(row).map(([k,v])=>{params.push(v);return `p.${quote(k)} IS ?${params.length}`;}).join(' AND ');
 params.push(cutoff);
 const predicate=protectedCanonicalPredicate('?'+params.length,present_tables),scope=reference_bounds?boundedCanonicalReferenceSQL(predicate,reference_bounds,witness,reference_scope):{with_sql:'',predicate};
 return{sql:`${scope.with_sql}UPDATE canonical_publication_shadow AS p SET ${set} WHERE ${exact} AND ${scope.predicate}`,params};
}

export async function compactProtectedCanonical({source_db,archive_db,archive_pool,archive_headroom,before_modify,execute=false,prefetch_private=false,require_native_preflight=false,source_cursor=0,max_mutation_batches=PROTECTED_CANONICAL_POLICY.max_batches,now=Date.now()}={}){
 if(!source_db?.prepare||typeof source_db.batch!=='function'||typeof source_db.usageSnapshot!=='function'||typeof (archive_pool||archive_db)?.usageSnapshot!=='function'||typeof archive_headroom!=='function'||!Number.isSafeInteger(now)||now<=0)throw Error('CANONICAL_MEASURED_COMPACTION_REQUIRED');
 if(execute&&typeof before_modify!=='function')throw Error('CURRENT_OWN_GUARD_BEFORE_COMPACTION_REQUIRED');
 if(!Number.isSafeInteger(max_mutation_batches)||max_mutation_batches<0||max_mutation_batches>PROTECTED_CANONICAL_POLICY.max_batches)throw Error('EXISTING_CANONICAL_BATCH_CAP_REQUIRED');
 const p=PROTECTED_CANONICAL_POLICY,usage=()=>combineMeasuredD1Usage(source_db.usageSnapshot(),(archive_pool||archive_db).usageSnapshot());
 const admit=e=>evaluateWithinRunReservation({reservation:p.reservation,currentUsage:usage(),extraRowsRead:e.rows_read,extraRowsWritten:e.rows_written+3});
 const need=(r,w)=>{if(!admit({rows_read:r,rows_written:w}).allowed)throw Error('CANONICAL_SHARED_NATIVE_HEADROOM_REQUIRED');};
 const out={schema:'PROTECTED_CANONICAL_BODY_COMPACTION_V1',sourceHTTP:0,MAIN:0,Telegram:0,execute,history_discarded:false,source_clocks_refreshed:false,publication_rows_deleted:0,reference_or_statistic_rows_modified:0,latest_per_coin_hot:true,all_ENTRY_and_ACTIONABLE_hot:true,hot_window_ms:p.hot_window_ms,selected:0,prepared:0,compacted:[],conflicts_retained_hot:[],deferred_hot:[],mutation_batches:0,native_readbacks:[]};
 const prepared=[],durable=new Map();
 try{
 need(50,0);
 const schema_result=await source_db.prepare(`SELECT name,type FROM sqlite_schema WHERE name IN (${REFERENCE_TABLES.map((_,i)=>'?'+(i+1)).join(',')})`).bind(...REFERENCE_TABLES).all(),tables=schema_result.results||[];
 const present=tables.filter(r=>r.type==='table').map(r=>r.name);
 out.reference_schema={present_tables:present,missing_required:REQUIRED_TABLES.filter(t=>!present.includes(t)),absent_optional:OPTIONAL_TABLES.filter(t=>!present.includes(t)),non_table_objects:tables.filter(r=>r.type!=='table').map(r=>({name:r.name,type:r.type})),schema_creation_performed:false,absent_namespace_rechecked_in_each_update:true};
 if(out.reference_schema.missing_required.length||out.reference_schema.non_table_objects.length||new Set(present).size!==tables.length){const error=Error('CANONICAL_PROTECTED_REFERENCE_SCHEMA_REQUIRED');error.compaction_receipt={...out,status:'CANONICAL_SCHEMA_PREFLIGHT_REFUSED',D1:usage()};throw error;}
 const schema_reads=schema_result.meta?.rows_read;
 if(!Number.isSafeInteger(schema_reads)||schema_reads<0)throw Error('CANONICAL_NATIVE_SCHEMA_COST_REQUIRED');
 const discovery=await loadBoundedCanonicalCandidates({source_db,present_tables:present,cutoff:now-p.hot_window_ms,prefix:PRIVATE_CANONICAL_PREFIX,admit,source_cursor,max_rows:p.max_rows}),selected=discovery.rows;
 out.bounded_discovery=discovery.receipt;out.selected=selected.length;
 if(!selected.length)return{...out,status:discovery.receipt.status,D1:usage()};
 const reference_reads=Object.values(discovery.bounds).reduce((s,n)=>s+n+1,0),per_update_reads=64+4*reference_reads+(out.reference_schema.absent_optional.length?Math.max(50,schema_reads):0);
 out.reference_schema.native_discovery_rows_read=schema_reads;out.reference_schema.per_update_read_reserve=per_update_reads;
 if(require_native_preflight){
  const size=discovery.primary_database_bytes;if(!Number.isSafeInteger(size)||size<0)throw Error('CANONICAL_PRIMARY_SIZE_NOT_MEASURED');
  out.primary_database_bytes_before=size;
 }
 if(selected.length>p.max_rows)throw Error('CANONICAL_SOURCE_ROW_BOUND');
 let copy_db=archive_db,copy_pool=archive_pool;
 if(prefetch_private===true){
  const revisions=[];
  for(const row of selected)try{revisions.push(encodeCanonicalPublicationRow(row));}catch(error){if(!/ARCHIVE_(?:RAW|COMPRESSED|WIRE)_BOUND/.test(error.message))throw error;}
  if(archive_pool){const prefetched=await prefetchCanonicalArchivePool({pool:archive_pool,revisions,db_admit:admit});copy_pool=prefetched.pool;out.private_prefetch=prefetched.receipt;}
  else{const prefetched=await prefetchExactCanonicalRevisions({archive_db,revisions,db_admit:admit});copy_db=prefetched.archive_db;out.private_prefetch=prefetched.receipt;}
 }
  for(const row of selected){
   if(!archive_headroom({max_copy_requests:3,reserved_native_readbacks:p.native_readbacks*(require_native_preflight?2:1)})){out.deferred_hot.push({publication_id:row.publication_id,reason:'SHARED_HTTP_HEADROOM'});continue;}
   if(JSON.parse(row.canonical_json)?.state!=='REJECTED'||row.canonical_json.startsWith(PRIVATE_CANONICAL_PREFIX))throw Error('CANONICAL_EXACT_REJECTED_ORIGINAL_REQUIRED');
   let record;try{record=encodeCanonicalPublicationRow(row);}catch(error){if(/ARCHIVE_(?:RAW|COMPRESSED|WIRE)_BOUND/.test(error.message)){out.deferred_hot.push({publication_id:row.publication_id,reason:'ORIGINAL_SIZE_BOUND'});continue;}throw error;}
   const provisional_header=await privateCanonicalHeader(row,record,{archive_slot:archive_pool?'A8':null}),saved_bytes=record.raw_bytes-Buffer.byteLength(JSON.stringify(provisional_header));
   if(saved_bytes<p.min_saved_bytes){out.deferred_hot.push({publication_id:row.publication_id,reason:'NO_USEFUL_SPACE_SAVING'});continue;}
   const provisional_plan=exactCanonicalBodyUpdate(row,provisional_header,now-p.hot_window_ms,present,discovery.bounds,discovery.witnesses[row.publication_id],discovery.reference_scope),provisional_statements=[provisional_plan,{sql:'SELECT * FROM canonical_publication_shadow WHERE publication_id=?1 LIMIT 1',params:[row.publication_id]}];
   if(Buffer.byteLength(JSON.stringify({op:'batch',statements:provisional_statements}))>p.bridge_wire_bytes){out.deferred_hot.push({publication_id:row.publication_id,reason:'BRIDGE_WIRE_BOUND'});continue;}
   if(!admit({rows_read:per_update_reads+96,rows_written:24}).allowed){out.deferred_hot.push({publication_id:row.publication_id,reason:'SHARED_NATIVE_HEADROOM_BEFORE_COPY'});continue;}
   need(5,24);
   const retained=copy_pool?await retainCanonicalInPool(copy_pool,record,{db_admit:admit,request_headroom:({max_requests})=>({allowed:archive_headroom({max_copy_requests:max_requests,reserved_native_readbacks:p.native_readbacks*(require_native_preflight?2:1)})}),now,include_verified_record:true}):await retainCanonicalPublicationRow(copy_db,record,{db_admit:admit,storage_bytes:copy_db.storage_bytes,now,include_verified_record:true});
   if(!retained.retained){out.deferred_hot.push({publication_id:row.publication_id,reason:retained.status});continue;}
   // Cache only the exact bytes just read back from private native storage.
   // No network is fabricated; the separate native sample below is reported.
   const stored=retained.verified_record,location=retained.location||'LEGACY';durable.set(`${location}:${stored.publication_id}:${stored.raw_sha256}`,JSON.stringify(stored));
   const header=await privateCanonicalHeader(row,stored,{archive_slot:location==='LEGACY'?null:location});
   const plan=exactCanonicalBodyUpdate(row,header,now-p.hot_window_ms,present,discovery.bounds,discovery.witnesses[row.publication_id],discovery.reference_scope),statements=[plan,{sql:'SELECT * FROM canonical_publication_shadow WHERE publication_id=?1 LIMIT 1',params:[row.publication_id]}];
   prepared.push({row,header,record:stored,location,statements,saved_bytes:stored.raw_bytes-Buffer.byteLength(JSON.stringify(header))});
  }
  out.prepared=prepared.length;
  const cachedDB=location=>({prepare(sql){if(sql!=='SELECT record_json FROM report2_canonical_cold_archive_v1 WHERE publication_id=?1 AND raw_sha256=?2 LIMIT 1')throw Error('EXACT_VERIFIED_CACHE_LOOKUP_REQUIRED');return{bind(pub,sha){return{async first(){const wire=durable.get(location+':'+pub+':'+sha);return wire?{record_json:wire}:null;}};}};}});
  const cached_options={archive_db:cachedDB('LEGACY'),archive_dbs:archive_pool?Object.fromEntries(archive_pool.locations.filter(s=>s!=='LEGACY').map(s=>[s,cachedDB(s)])):{}};
  const native_options=archive_pool?archive_pool.readerOptions():{archive_db};
  // Preflight the entire durable batch before its first primary modification.
  for(let i=0;i<prepared.length;i+=p.max_rows_per_batch){const group=prepared.slice(i,i+p.max_rows_per_batch),reader=createPrivateCanonicalRestorer({...cached_options,db_admit:admit,max_rows:p.max_rows_per_batch});assert.deepEqual(await reader.restore(group.map(s=>s.header)),group.map(s=>s.row));}
  if(require_native_preflight){
   out.native_preflight=[];
   for(const s of prepared.slice(0,p.native_readbacks)){
    const reader=createPrivateCanonicalRestorer({...native_options,db_admit:admit,max_rows:1});
    assert.deepEqual(await reader.restore(s.header),s.row);
    out.native_preflight.push({publication_id:s.row.publication_id,raw_sha256:s.record.raw_sha256,exact_original_verified:true,primary_still_unmodified:true});
   }
   out.native_preflight_required_before_mutation=true;
  }
  if(!execute)return{...out,status:'PRIVATE_ORIGINALS_VERIFIED_CANONICAL_BODIES_UNCHANGED',D1:usage()};
  let cursor=0;
  out.max_mutation_batches_this_job=max_mutation_batches;
  while(cursor<prepared.length&&out.mutation_batches<max_mutation_batches){
   const group=[];let statements=[];
   while(cursor+group.length<prepared.length&&group.length<p.max_rows_per_batch){const s=prepared[cursor+group.length],next=[...statements,...s.statements];if(Buffer.byteLength(JSON.stringify({op:'batch',statements:next}))>p.bridge_wire_bytes||!admit({rows_read:(group.length+1)*per_update_reads+96,rows_written:(group.length+1)*8+3}).allowed)break;group.push(s);statements=next;}
   if(!group.length){out.deferred_hot.push(...prepared.slice(cursor).map(s=>({publication_id:s.row.publication_id,reason:'SHARED_NATIVE_HEADROOM'})));cursor=prepared.length;break;}
   await before_modify();need(group.length*per_update_reads,group.length*8);
   const ack=await source_db.batch(statements.map(q=>source_db.prepare(q.sql).bind(...q.params)));out.mutation_batches++;
   if(!Array.isArray(ack)||ack.length!==statements.length)throw Error('CANONICAL_GROUP_ACK_REQUIRED');
   if(require_native_preflight){const size=ack.at(-1)?.meta?.size_after;out.primary_database_bytes_after=Number.isSafeInteger(size)&&size>=0?size:null;}
   const reader=createPrivateCanonicalRestorer({...cached_options,db_admit:admit,max_rows:p.max_rows_per_batch});
   for(const [i,s] of group.entries()){
    if(ack[i*2]?.meta?.changes!==1){out.conflicts_retained_hot.push(s.row.publication_id);continue;}
    assert.deepEqual(ack[i*2+1]?.results?.[0],s.header);assert.deepEqual(await reader.restore(ack[i*2+1].results[0]),s.row);
    out.compacted.push({publication_id:s.row.publication_id,run_id:s.row.run_id,contract:s.row.contract_code,observed_ts:s.row.observed_ts,raw_sha256:s.record.raw_sha256,archive_location:s.location,original_bytes:s.record.raw_bytes,hot_header_bytes:Buffer.byteLength(JSON.stringify(s.header)),logical_saved_bytes:s.saved_bytes});
   }
   cursor+=group.length;
  }
  out.deferred_hot.push(...prepared.slice(cursor).map(s=>({publication_id:s.row.publication_id,reason:'TRANSACTION_BOUND'})));
  const native_reader=createPrivateCanonicalRestorer({...native_options,db_admit:admit,max_rows:p.native_readbacks});
  const sample=out.compacted.slice(0,p.native_readbacks);need(5*sample.length,0);
  const headers=sample.length?await source_db.batch(sample.map(m=>source_db.prepare('SELECT * FROM canonical_publication_shadow WHERE publication_id=?1 LIMIT 1').bind(m.publication_id))):[];
  for(const [i,moved] of sample.entries()){
   const header=headers[i]?.results?.[0];if(!header)throw Error('CANONICAL_NATIVE_SAMPLE_HEADER_REQUIRED');
   const original=prepared.find(s=>s.row.publication_id===moved.publication_id).row;
   assert.deepEqual(await native_reader.restore(header),original);out.native_readbacks.push(moved.publication_id);
  }
  const measured=require_native_preflight&&Number.isSafeInteger(out.primary_database_bytes_before)&&Number.isSafeInteger(out.primary_database_bytes_after);
  out.bounded_discovery.next_cursor=out.deferred_hot.length||out.conflicts_retained_hot.length?source_cursor:discovery.receipt.cursor_after_complete_window;
  return{...out,status:out.compacted.length?'PROTECTED_REJECTED_BODIES_COMPACTED_EXACTLY':'NO_SAFE_CANONICAL_BODIES_CHANGED',D1:usage(),physical_database_free_bytes_measured:measured,physical_bytes_reclaimed:measured?out.primary_database_bytes_before-out.primary_database_bytes_after:null};
 }catch(error){error.compaction_receipt={...out,prepared:prepared.length,status:error.compaction_receipt?.status||'CANONICAL_COMPACTION_PARTIAL_OR_REFUSED_ORIGINALS_PRESERVED',...(error.discovery_receipt?{bounded_discovery:error.discovery_receipt}:{}),D1:usage()};throw error;}
}
