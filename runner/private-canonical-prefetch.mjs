import {decodeCanonicalPublicationRow,CANONICAL_COLD_ARCHIVE_LIMITS} from './canonical-cold-archive.mjs';

const TABLE='report2_canonical_cold_archive_v1',LOOKUP='SELECT record_json FROM '+TABLE+' WHERE publication_id=?1 AND raw_sha256=?2 LIMIT 1';
const key=r=>r.publication_id+':'+r.raw_sha256;
const valid=r=>/^PUB:[a-f0-9]{40,64}$/.test(r?.publication_id||'')&&/^[a-f0-9]{64}$/.test(r?.raw_sha256||'');
const bytes=s=>Buffer.byteLength(s,'utf8');
export const PRIVATE_PREFETCH_LIMITS=Object.freeze({max_rows:48,max_rows_per_query:8,response_wire_bytes:1400000});
const predicate=rows=>rows.map((_,i)=>`(publication_id=?${i*2+1} AND raw_sha256=?${i*2+2})`).join(' OR ');
const args=rows=>rows.flatMap(r=>[r.publication_id,r.raw_sha256]);

// Preparatory read path only. It never writes, removes rows or refreshes clocks.
// The caller supplies the existing measured native adapter and admission; a
// metadata read precedes size-bounded body groups, each selected by exact hash.
export async function prefetchExactCanonicalRevisions({archive_db,revisions,db_admit}={}){
 const p=PRIVATE_PREFETCH_LIMITS;
 if(!archive_db?.prepare||typeof archive_db.usageSnapshot!=='function'||typeof db_admit!=='function'||!Array.isArray(revisions)||revisions.length>p.max_rows||revisions.some(r=>!valid(r)))throw Error('PRIVATE_PREFETCH_EXACT_INPUT_REQUIRED');
 const wanted=new Map(revisions.map(r=>[key(r),r]));if(wanted.size!==revisions.length)throw Error('PRIVATE_PREFETCH_DUPLICATE_REVISION');
 const cached=new Map(),missing=[],unprefetched=[];let metadata_queries=0,body_queries=0;
 const admit=rows=>{if(db_admit({rows_read:rows*3,rows_written:0})?.allowed!==true)throw Error('PRIVATE_PREFETCH_SHARED_D1_DENIED');};
 if(revisions.length){
  admit(revisions.length);
  const sql=`SELECT publication_id,raw_sha256,LENGTH(CAST(record_json AS BLOB)) AS record_bytes FROM ${TABLE} WHERE ${predicate(revisions)} LIMIT ${revisions.length}`;
  metadata_queries++;
  const meta=(await archive_db.prepare(sql).bind(...args(revisions)).all()).results;
  if(!Array.isArray(meta)||meta.length>revisions.length)throw Error('PRIVATE_PREFETCH_METADATA_INVALID');
  const seen=new Set(),ready=[];
  for(const row of meta){
   const k=key(row);if(!wanted.has(k)||seen.has(k)||!Number.isSafeInteger(row.record_bytes)||row.record_bytes<=0||row.record_bytes>CANONICAL_COLD_ARCHIVE_LIMITS.wire_bytes)throw Error('PRIVATE_PREFETCH_METADATA_BINDING');seen.add(k);
   // Escaping in the outer REST JSON cannot exceed twice the original bytes.
   if(2*row.record_bytes+256>p.response_wire_bytes)unprefetched.push(k);else ready.push(row);
  }
  // Missing revisions are not negatively cached: a concurrent writer or the
  // existing retain path may create them after this metadata snapshot.
  for(const k of wanted.keys())if(!seen.has(k))missing.push(k);
  let cursor=0;
  while(cursor<ready.length){
   const group=[];let wire=128;
   while(cursor+group.length<ready.length&&group.length<p.max_rows_per_query){const row=ready[cursor+group.length],cost=2*row.record_bytes+256;if(wire+cost>p.response_wire_bytes)break;group.push(row);wire+=cost;}
   if(!group.length)throw Error('PRIVATE_PREFETCH_SINGLE_ROW_BOUND');
   admit(group.length);body_queries++;
   const rows=(await archive_db.prepare(`SELECT record_json FROM ${TABLE} WHERE ${predicate(group)} LIMIT ${group.length}`).bind(...args(group)).all()).results;
   if(!Array.isArray(rows)||rows.length!==group.length||bytes(JSON.stringify(rows))+128>p.response_wire_bytes)throw Error('PRIVATE_PREFETCH_BODY_BOUND_OR_MISSING');
   const expected=new Map(group.map(r=>[key(r),r])),verified=new Map();
   for(const row of rows){
    if(typeof row.record_json!=='string')throw Error('PRIVATE_PREFETCH_ORIGINAL_RECORD_REQUIRED');
    const record=JSON.parse(row.record_json),k=key(record),manifest=expected.get(k);
    if(!manifest||verified.has(k)||bytes(row.record_json)!==manifest.record_bytes)throw Error('PRIVATE_PREFETCH_RESPONSE_BINDING');
    decodeCanonicalPublicationRow(record);verified.set(k,row.record_json);
   }
   // Publish no partial result from a corrupt or incomplete group.
   for(const [k,wire] of verified)cached.set(k,wire);
   cursor+=group.length;
  }
 }
 const db={prepare(sql){
  if(sql!==LOOKUP)return archive_db.prepare(sql);
  let params=[];return{bind(...a){params=a;return this;},async first(){const k=params[0]+':'+params[1];if(params.length===2&&cached.has(k))return{record_json:cached.get(k)};return archive_db.prepare(sql).bind(...params).first();}};
 },usageSnapshot:()=>archive_db.usageSnapshot(),get storage_bytes(){return archive_db.storage_bytes;}};
 return{archive_db:db,receipt:{status:'EXACT_PRIVATE_REVISION_GROUPS_VERIFIED',requested:revisions.length,cached:cached.size,missing,unprefetched,metadata_queries,body_queries,provider_HTTP:0,primary_rows_modified:0,source_clocks_refreshed:false,native_production_cost_qualified:false}};
}
