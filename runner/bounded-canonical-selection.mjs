// Bound native reads before inspecting large bodies. Source clocks and rows
// are never changed by discovery; a complete bounded reference census is
// required before an original may become a compaction candidate.
export const BOUNDED_CANONICAL_SELECTION=Object.freeze({discovery_rows:128,max_windows:4,reference_rows:256,newer_witness_rows:16,reference_growth_margin:8});
const columns={v3_dispatch_publication_binding_shadow:['publication_id'],v3_recheck_task_shadow:['contract_code','publication_id','last_result'],v3_user_lifecycle_shadow:['contract','direction','wave_id','observation_ts','status'],v3_telegram_dispatch_shadow:['contract','direction','wave_id','decision_id'],tz101_entry_area_calibration_signal:['decision_id','snapshot_id'],report2_command_v2:['result_snapshot_id'],report2_publication_v2:['publication_id'],report2_delivered_outcome_v2:['publication_id']};
// These exact indexes are in the retained production schema. An absent index
// refuses before reading any large body. Unindexed namespaces keep their full
// bounded census; no matching reference is discarded to make a batch fit.
const scopedIndexes={v3_dispatch_publication_binding_shadow:['publication_id','idx_dispatch_publication_id','publication_ids'],v3_recheck_task_shadow:['contract_code','idx_v3_recheck_wave_active','contracts'],v3_user_lifecycle_shadow:['contract','sqlite_autoindex_v3_user_lifecycle_shadow_1','contracts'],v3_telegram_dispatch_shadow:['contract','idx_v3_dispatch_wave','contracts']};
function referenceSource(table,scope){
 const spec=scopedIndexes[table];if(!scope||!spec)return table;
 if(scope.schema!=='EXACT_CANONICAL_REFERENCE_SCOPE_V1'||!Array.isArray(scope.contracts)||!Array.isArray(scope.publication_ids)||[scope.contracts,scope.publication_ids].some(a=>!a.length||a.length>48||new Set(a).size!==a.length||a.some(v=>typeof v!=='string'||!v.length||Buffer.byteLength(v)>128)))throw Error('EXACT_CANONICAL_REFERENCE_SCOPE_REQUIRED');
 const [column,index,key]=spec,values=scope[key].map(v=>"'"+v.replaceAll("'","''")+"'").join(',');
 return `${table} INDEXED BY ${index} WHERE ${column} IN (${values})`;
}
const newerOriginal="EXISTS(SELECT 1 FROM canonical_publication_shadow newer WHERE newer.contract_code=p.contract_code AND (newer.observed_ts>p.observed_ts OR (newer.observed_ts=p.observed_ts AND newer.publication_id>p.publication_id)))";
const newerBounded=`EXISTS(SELECT 1 FROM (SELECT observed_ts,publication_id FROM canonical_publication_shadow INDEXED BY idx_canonical_publication_identity WHERE contract_code=p.contract_code AND run_id>p.run_id LIMIT ${BOUNDED_CANONICAL_SELECTION.newer_witness_rows}) newer WHERE newer.observed_ts>p.observed_ts OR (newer.observed_ts=p.observed_ts AND newer.publication_id>p.publication_id))`;
export function boundedNewerPredicate(predicate,witness=null){
 if(!predicate.includes(newerOriginal))throw Error('EXACT_CANONICAL_NEWER_PREDICATE_REQUIRED');
 if(witness!==null&&!/^PUB:[a-f0-9]{40,64}$/.test(witness))throw Error('EXACT_NEWER_WITNESS_REQUIRED');
 const exact=witness?`EXISTS(SELECT 1 FROM canonical_publication_shadow newer WHERE newer.publication_id='${witness}' AND newer.contract_code=p.contract_code AND (newer.observed_ts>p.observed_ts OR (newer.observed_ts=p.observed_ts AND newer.publication_id>p.publication_id)))`:newerBounded;
 return predicate.replace(newerOriginal,exact);
}
export function boundedCanonicalReferenceSQL(predicate,bounds,witness=null,scope=null){
 const ctes=[],guards=[];let rewritten=boundedNewerPredicate(predicate,witness);
 for(const [table,bound] of Object.entries(bounds)){
  if(!columns[table]||!Number.isSafeInteger(bound)||bound<0||bound>BOUNDED_CANONICAL_SELECTION.reference_rows+BOUNDED_CANONICAL_SELECTION.reference_growth_margin)throw Error('EXACT_BOUNDED_CANONICAL_REFERENCE_REQUIRED');
  const name='r2_'+table;ctes.push(`${name} AS MATERIALIZED(SELECT ${columns[table].join(',')} FROM ${referenceSource(table,scope)} LIMIT ${bound+1})`);guards.push(`(SELECT COUNT(*) FROM ${name})<=${bound}`);
  rewritten=rewritten.replaceAll('FROM '+table+' ','FROM '+name+' ');
 }
 return{with_sql:ctes.length?'WITH '+ctes.join(',')+' ':'',predicate:'('+guards.join(' AND ')+') AND '+rewritten};
}
const basic=(p,cutoff,prefix)=>Number.isSafeInteger(p.observed_ts)&&p.observed_ts<cutoff&&Number.isSafeInteger(p.created_ts)&&p.created_ts<cutoff&&(p.valid_until_ts===null||p.valid_until_ts<cutoff)&&p.shadow_only===1&&p.canonical_state==='REJECTED'&&['UNASSESSED','INTERNAL_ONLY','REJECTED'].includes(p.actionability_status)&&!["ENTRY","HOLD","EXIT"].includes(p.lifecycle_event)&&typeof p.body_prefix==='string'&&!p.body_prefix.startsWith(prefix);
function protectedReference(p,rows){
 for(const [table,refs] of Object.entries(rows))for(const r of refs){
  if(['v3_dispatch_publication_binding_shadow','report2_publication_v2','report2_delivered_outcome_v2'].includes(table)&&r.publication_id===p.publication_id)return true;
  if(table==='v3_recheck_task_shadow'&&r.contract_code===p.contract_code&&(r.publication_id===p.publication_id||String(r.last_result??'').includes(p.publication_id)))return true;
  if(table==='v3_user_lifecycle_shadow'&&r.contract===p.contract_code&&r.direction===p.direction&&((r.wave_id!==null&&r.wave_id===p.wave_id)||r.observation_ts===p.observed_ts)&&['OBSERVE','WAIT','ENTRY','HOLD','EXIT'].includes(r.status))return true;
  if(table==='v3_telegram_dispatch_shadow'&&r.contract===p.contract_code&&r.direction===p.direction&&((r.wave_id!==null&&r.wave_id===p.wave_id)||(r.decision_id!==null&&r.decision_id===p.decision_id)))return true;
  if(table==='tz101_entry_area_calibration_signal'&&((r.decision_id!==null&&r.decision_id===p.decision_id)||r.snapshot_id===p.snapshot_id))return true;
  if(table==='report2_command_v2'&&r.result_snapshot_id===p.snapshot_id)return true;
 }
 return false;
}
export async function loadBoundedCanonicalCandidates({source_db,present_tables,cutoff,prefix,admit,source_cursor=0,max_rows=48}={}){
 const p=BOUNDED_CANONICAL_SELECTION;
 if(!Number.isSafeInteger(source_cursor)||source_cursor<0||!Number.isSafeInteger(max_rows)||max_rows<1||max_rows>48||typeof admit!=='function')throw Error('CANONICAL_BOUNDED_DISCOVERY_ARGUMENTS_REQUIRED');
 const names=present_tables.filter(t=>columns[t]);
 if(!admit({rows_read:2*p.discovery_rows+16,rows_written:0}).allowed)throw Error('CANONICAL_BOUNDED_METADATA_HEADROOM_REQUIRED');
 const metadata_result=await source_db.prepare(`SELECT rowid AS source_rowid,publication_id,contract_code,direction,run_id,snapshot_id,wave_id,decision_id,observed_ts,created_ts,valid_until_ts,shadow_only,canonical_state,actionability_status,lifecycle_event,substr(canonical_json,1,64) AS body_prefix FROM canonical_publication_shadow WHERE rowid>?1 ORDER BY rowid LIMIT ${p.discovery_rows}`).bind(source_cursor).all(),metadata=metadata_result?.results;
 if(!Array.isArray(metadata)||metadata.length>p.discovery_rows)throw Error('CANONICAL_BOUNDED_REFERENCE_ACK_REQUIRED');
 const candidates=metadata.filter(r=>basic(r,cutoff,prefix)).slice(0,max_rows),cursor_after=candidates.length===max_rows?candidates.at(-1).source_rowid:(metadata.length===p.discovery_rows?metadata.at(-1).source_rowid:0);
 if(!candidates.length)return{rows:[],bounds:{},receipt:{schema:'BOUNDED_CANONICAL_DISCOVERY_V1',source_cursor,metadata_rows:metadata.length,large_bodies_read:0,next_cursor:cursor_after,status:'NO_ELIGIBLE_ROWS_IN_BOUNDED_WINDOW'}};
 const reference_scope={schema:'EXACT_CANONICAL_REFERENCE_SCOPE_V1',contracts:[...new Set(candidates.map(r=>r.contract_code))],publication_ids:candidates.map(r=>r.publication_id)};
 const fits=n=>admit({rows_read:2*(p.discovery_rows+names.length*(n+1))+32,rows_written:0}).allowed;
 let bound=p.reference_rows;while(bound>0&&!fits(bound))bound--;
 if(!bound)throw Error('CANONICAL_BOUNDED_REFERENCE_HEADROOM_REQUIRED');
 const statements=names.map(t=>source_db.prepare(`SELECT ${columns[t].join(',')} FROM ${referenceSource(t,reference_scope)} LIMIT ${bound+1}`));
 const replies=await source_db.batch(statements);
 if(!Array.isArray(replies)||replies.length!==statements.length)throw Error('CANONICAL_BOUNDED_REFERENCE_ACK_REQUIRED');
 const refs={},bounds={},receipt={schema:'BOUNDED_CANONICAL_DISCOVERY_V1',source_cursor,metadata_rows:metadata.length,reference_row_bound:bound,reference_counts:{},complete_reference_census:true,reference_scope,large_bodies_read:0,selection_provider_HTTP:0,newer_witness_rows:p.newer_witness_rows,witness_is_conservative_subset:true,next_cursor:source_cursor};
 for(const [i,t] of names.entries()){
  const rows=replies[i]?.results;if(!Array.isArray(rows)||rows.length>bound+1)throw Error('CANONICAL_BOUNDED_REFERENCE_ACK_REQUIRED');refs[t]=rows;receipt.reference_counts[t]=rows.length;bounds[t]=rows.length+p.reference_growth_margin;
  if(rows.length>bound)receipt.complete_reference_census=false;
 }
 if(!receipt.complete_reference_census)return{rows:[],bounds:{},receipt:{...receipt,status:'REFERENCE_CENSUS_BOUND_REACHED_ORIGINALS_UNTOUCHED'}};
 const eligible=candidates.filter(r=>!protectedReference(r,refs)),ids=eligible.map(r=>r.publication_id);
 receipt.basic_candidates=candidates.length;receipt.reference_protected=candidates.length-eligible.length;
 receipt.reference_protection_counts=Object.fromEntries(Object.entries(refs).map(([table,rows])=>[table,candidates.filter(r=>protectedReference(r,{[table]:rows})).length]).filter(([,n])=>n>0));
 receipt.metadata_eligible=eligible.length;
 if(!ids.length){receipt.next_cursor=cursor_after;return{rows:[],bounds,reference_scope,receipt:{...receipt,status:'NO_ELIGIBLE_ROWS_IN_BOUNDED_WINDOW'}};}
 if(!admit({rows_read:ids.length*(2*p.newer_witness_rows+4)+16,rows_written:0}).allowed)throw Object.assign(Error('CANONICAL_BOUNDED_BODY_HEADROOM_REQUIRED'),{discovery_receipt:receipt});
 const witnesses={};
 const bodies=ids.map(id=>{
  const candidate=eligible.find(r=>r.publication_id===id),witness=metadata.find(r=>r.contract_code===candidate.contract_code&&(r.observed_ts>candidate.observed_ts||(r.observed_ts===candidate.observed_ts&&r.publication_id>candidate.publication_id)));
  witnesses[id]=witness?.publication_id??null;
  const predicate=witness?`EXISTS(SELECT 1 FROM canonical_publication_shadow newer WHERE newer.publication_id=?2 AND newer.contract_code=p.contract_code AND (newer.observed_ts>p.observed_ts OR (newer.observed_ts=p.observed_ts AND newer.publication_id>p.publication_id)))`:newerBounded;
  const q=source_db.prepare(`SELECT p.* FROM canonical_publication_shadow p WHERE p.publication_id=?1 AND ${predicate} LIMIT 1`);
  return witness?q.bind(id,witness.publication_id):q.bind(id);
 });
 const bodyReplies=await source_db.batch(bodies);
 if(!Array.isArray(bodyReplies)||bodyReplies.length!==ids.length||bodyReplies.some(r=>!Array.isArray(r.results)||r.results.length>1))throw Error('CANONICAL_BOUNDED_BODY_ACK_REQUIRED');
 const selected={results:bodyReplies.flatMap(r=>r.results)};
 receipt.large_bodies_read=selected.results.length;receipt.status='BOUNDED_REFERENCES_AND_BODY_CANDIDATES_READ';receipt.exact_newer_witness_count=Object.values(witnesses).filter(Boolean).length;
 receipt.cursor_after_complete_window=cursor_after;
 if(!selected.results.length){receipt.next_cursor=receipt.cursor_after_complete_window;receipt.status='NO_ELIGIBLE_ROWS_IN_BOUNDED_WINDOW';}
 return{rows:selected.results,bounds,witnesses,reference_scope,receipt,primary_database_bytes:bodyReplies.at(-1)?.meta?.size_after};
}

// A complete empty window is progress, not an entire maintenance run. Reuse
// its admission while looking ahead, keeping the 128-row query, all reference
// protections and the existing total row/HTTP/native limits unchanged.
export async function loadBoundedCanonicalWindowSequence(options={}){
 const max=options.max_windows??BOUNDED_CANONICAL_SELECTION.max_windows;
 if(!Number.isSafeInteger(max)||max<1||max>BOUNDED_CANONICAL_SELECTION.max_windows)throw Error('EXACT_CANONICAL_WINDOW_BOUND_REQUIRED');
 const headroom=options.discovery_headroom??(()=>true);if(typeof headroom!=='function')throw Error('CANONICAL_DISCOVERY_HEADROOM_REQUIRED');
 const windows=[];let cursor=options.source_cursor??0,last,refusal,stop='WINDOW_BOUND';
 for(let i=0;i<max;i++){
  if(i&&!headroom({max_bridge_requests:3,reserved_bridge_requests:3})){stop='SHARED_BRIDGE_HEADROOM';break;}
  let next;
  try{next=await loadBoundedCanonicalCandidates({...options,source_cursor:cursor});}
  catch(error){
   if(last&&['CANONICAL_BOUNDED_METADATA_HEADROOM_REQUIRED','CANONICAL_BOUNDED_REFERENCE_HEADROOM_REQUIRED','CANONICAL_BOUNDED_BODY_HEADROOM_REQUIRED'].includes(error.message)){stop=error.message;break;}
   throw error;
  }
  if(last&&!next.rows.length&&next.receipt.status!=='NO_ELIGIBLE_ROWS_IN_BOUNDED_WINDOW'){stop=next.receipt.status;refusal=next.receipt;break;}
  last=next;windows.push(next.receipt);
  if(next.rows.length){stop='BODY_CANDIDATES_FOUND';break;}
  if(next.receipt.status!=='NO_ELIGIBLE_ROWS_IN_BOUNDED_WINDOW'){stop=next.receipt.status;break;}
  const after=next.receipt.next_cursor;
  if(after===0){stop='END_OF_PASS';break;}
  if(!Number.isSafeInteger(after)||after<=cursor)throw Error('CANONICAL_WINDOW_CURSOR_NOT_FORWARD');
  cursor=after;
 }
 return{...last,receipt:{...last.receipt,scan_start_cursor:options.source_cursor??0,window_count:windows.length,window_stop:stop,...(refusal?{lookahead_refusal:refusal}:{}),windows}};
}
