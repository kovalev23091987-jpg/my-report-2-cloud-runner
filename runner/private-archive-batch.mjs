import {decodeCanonicalPublicationRow,CANONICAL_COLD_ARCHIVE_LIMITS} from './canonical-cold-archive.mjs';

// Transport batching does not reduce native D1 reservations. A group still
// reserves the sum of the existing 32R/24W copy allowances for every member.
export const PRIVATE_COPY_GROUP_LIMITS=Object.freeze({rows:8,parameters:100,sql_bytes:100000,wire_bytes:1400000,reads_per_row:32,writes_per_row:24});
const key=r=>r.publication_id+':'+r.raw_sha256;
const bytes=v=>Buffer.byteLength(typeof v==='string'?v:JSON.stringify(v));
const recordCap=n=>Math.floor((PRIVATE_COPY_GROUP_LIMITS.wire_bytes-16384-1024*n)/(2*n));
// The native SELECT itself bounds returned bodies. A different valid gzip
// encoding of the same raw revision cannot enlarge the response unnoticed.
function lookup(records,cap=recordCap(records.length)){return{sql:`SELECT publication_id,raw_sha256,CASE WHEN LENGTH(CAST(record_json AS BLOB))<=${cap} THEN record_json ELSE NULL END AS record_json FROM report2_canonical_cold_archive_v1 WHERE `+records.map((_,i)=>`(publication_id=?${i*2+1} AND raw_sha256=?${i*2+2})`).join(' OR ')+` LIMIT ${records.length}`,params:records.flatMap(r=>[r.publication_id,r.raw_sha256])};}
function insert(records,now){const params=records.flatMap(r=>[r.publication_id,r.raw_sha256,r.run_id,r.snapshot_id,r.contract_code,r.observed_ts,JSON.stringify(r),now]);return{sql:'INSERT INTO report2_canonical_cold_archive_v1(publication_id,raw_sha256,run_id,snapshot_id,contract_code,observed_ts,record_json,created_ts) VALUES'+records.map((_,i)=>'('+Array.from({length:8},(_,j)=>'?'+(i*8+j+1)).join(',')+')').join(',')+' ON CONFLICT(publication_id,raw_sha256) DO NOTHING',params};}
export function privateArchiveCopyGroupFits(records,now=Date.now()){
 const p=PRIVATE_COPY_GROUP_LIMITS;
 if(!Array.isArray(records)||!records.length||records.length>p.rows||new Set(records.map(key)).size!==records.length||!Number.isSafeInteger(now)||now<=0)return false;
 const queries=[lookup(records),insert(records,now)];
 return records.every(r=>bytes(r)<=Math.min(recordCap(records.length),CANONICAL_COLD_ARCHIVE_LIMITS.wire_bytes))&&queries.every(q=>q.params.length<=p.parameters&&bytes(q.sql)<=p.sql_bytes&&bytes(q)<=p.wire_bytes);
}
function verify(stored,wanted){
 decodeCanonicalPublicationRow(stored);
 if(stored.publication_id!==wanted.publication_id||stored.raw_sha256!==wanted.raw_sha256||stored.raw_bytes!==wanted.raw_bytes)throw Error('ARCHIVE_GROUP_EXACT_BINDING_REQUIRED');
 return stored;
}
export async function retainCanonicalBatchInPool(pool,records,{db_admit,request_headroom,now=Date.now()}={}){
 for(const r of records??[])decodeCanonicalPublicationRow(r);
 if(!privateArchiveCopyGroupFits(records,now))return{status:'ARCHIVE_GROUP_WIRE_OR_ROW_BOUND',retained:false};
 if(!pool?.locations?.length||pool.locations.length>5||typeof db_admit!=='function'||typeof request_headroom!=='function')throw Error('ARCHIVE_GROUP_MEASURED_POOL_REQUIRED');
 const p=PRIVATE_COPY_GROUP_LIMITS,n=records.length,cap=recordCap(n),found=new Map(),wanted=new Map(records.map(r=>[key(r),r]));
 const admitted=()=>db_admit({rows_read:p.reads_per_row*n,rows_written:p.writes_per_row*n})?.allowed===true;
 for(const r of records){const hit=pool.findVerified?.(r);if(hit){if(!pool.locations.includes(hit.location))throw Error('ARCHIVE_GROUP_LOCATION_REQUIRED');if(bytes(hit.wire)>cap)throw Error('ARCHIVE_GROUP_RESPONSE_WIRE_BOUND');found.set(key(r),{location:hit.location,verified_record:verify(JSON.parse(hit.wire),r)});}}
 const result=()=>({status:'ARCHIVE_GROUP_ALL_EXACT_ORIGINALS_VERIFIED',retained:true,records:records.map(r=>found.get(key(r))),native_production_cost_qualified:false,reserves_lowered:false});
 if(found.size===n)return result();
 if(request_headroom({max_requests:pool.locations.length+2})?.allowed!==true)return{status:'ARCHIVE_GROUP_HTTP_HEADROOM_DENIED',retained:false};
 if(!admitted())return{status:'ARCHIVE_GROUP_SHARED_D1_DENIED',retained:false};
 const read=async(location,queryRecords)=>{
  if(!admitted())return false;
  const q=lookup(queryRecords,cap),reply=await pool.get(location).prepare(q.sql).bind(...q.params).all();
  if(!Array.isArray(reply?.results)||reply.results.length>queryRecords.length)throw Error('ARCHIVE_GROUP_BOUNDED_ACK_REQUIRED');
  const requested=new Set(queryRecords.map(key)),seen=new Set();
  for(const row of reply.results){const k=key(row);if(!requested.has(k)||seen.has(k))throw Error('ARCHIVE_GROUP_FOREIGN_OR_DUPLICATE_ACK');if(typeof row.record_json!=='string'||bytes(row.record_json)>cap)throw Error('ARCHIVE_GROUP_RESPONSE_WIRE_BOUND');const stored=JSON.parse(row.record_json);if(key(stored)!==k)throw Error('ARCHIVE_GROUP_EXACT_BINDING_REQUIRED');seen.add(k);found.set(k,{location,verified_record:verify(stored,wanted.get(k))});}
  return true;
 };
 for(const location of pool.locations){if(!await read(location,records.filter(r=>!found.has(key(r)))))return{status:'ARCHIVE_GROUP_SHARED_D1_DENIED',retained:false};if(found.size===n)return result();}
 const missing=records.filter(r=>!found.has(key(r))),projected=missing.reduce((s,r)=>s+bytes(r)+16384,0);
 let target=null;
 for(const location of pool.locations){const size=pool.get(location).storage_bytes;if(!Number.isSafeInteger(size)||size<0)throw Error('ARCHIVE_GROUP_NATIVE_SIZE_REQUIRED');if(target===null&&size+projected<=CANONICAL_COLD_ARCHIVE_LIMITS.database_soft_bytes)target=location;}
 if(target===null)return{status:'ARCHIVE_GROUP_STORAGE_GUARD_REACHED',retained:false};
 if(!admitted())return{status:'ARCHIVE_GROUP_SHARED_D1_DENIED',retained:false};
 const q=insert(missing,now);await pool.get(target).prepare(q.sql).bind(...q.params).run();
 if(!await read(target,missing))return{status:'ARCHIVE_GROUP_SHARED_D1_DENIED_AFTER_COPY',retained:false};
 if(found.size!==n)throw Error('ARCHIVE_GROUP_DURABLE_READBACK_MISSING');
 return result();
}
