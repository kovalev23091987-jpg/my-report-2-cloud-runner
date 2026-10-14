import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';

export const CANONICAL_COLD_ARCHIVE_VERSION='private-canonical-lossless-gzip-v1';
export const CANONICAL_COLD_ARCHIVE_LIMITS=Object.freeze({raw_bytes:4000000,gzip_bytes:400000,wire_bytes:900000,database_soft_bytes:400000000});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const positive=v=>Number.isSafeInteger(v)&&v>0;
const HEX=/^[a-f0-9]{64}$/;
function identity(row){
 if(!row||typeof row!=='object'||Array.isArray(row)||!/^PUB:[a-f0-9]{40,64}$/.test(row.publication_id||'')||!row.run_id||!row.snapshot_id||!row.contract_code||!positive(row.observed_ts)||!HEX.test(row.analytical_fingerprint||''))throw Error('ARCHIVE_EXACT_PUBLICATION_IDENTITY_REQUIRED');
 for(const key of ['canonical_json','presentation_inputs_json']){if(typeof row[key]!=='string')throw Error('ARCHIVE_ORIGINAL_JSON_STRING_REQUIRED');const body=JSON.parse(row[key]);if(!body||typeof body!=='object'||Array.isArray(body))throw Error('ARCHIVE_JSON_OBJECT_REQUIRED');}
 const c=JSON.parse(row.canonical_json),contract=c.metadata?.contract??c.contract??c.candidates?.[0]?.contract??c.candidates?.[0]?.ticker??c.universe?.[0]?.contract;
 if(contract!==row.contract_code||(c.contract!==undefined&&c.contract!==row.contract_code)||c.run_id!==row.run_id||c.snapshot_id!==row.snapshot_id||c.analytical_fingerprint!==row.analytical_fingerprint||c.observed_ts!==row.observed_ts)throw Error('ARCHIVE_CANONICAL_BINDING_MISMATCH');
 return{publication_id:row.publication_id,run_id:row.run_id,snapshot_id:row.snapshot_id,contract_code:row.contract_code,observed_ts:row.observed_ts,analytical_fingerprint:row.analytical_fingerprint};
}
export function encodeCanonicalPublicationRow(row){
 const binding=identity(row),raw=Buffer.from(JSON.stringify(row));if(raw.length>CANONICAL_COLD_ARCHIVE_LIMITS.raw_bytes)throw Error('ARCHIVE_RAW_BOUND');
 const gzip=gzipSync(raw,{level:6});if(gzip.length>CANONICAL_COLD_ARCHIVE_LIMITS.gzip_bytes)throw Error('ARCHIVE_COMPRESSED_BOUND');
 const record={version:CANONICAL_COLD_ARCHIVE_VERSION,...binding,raw_sha256:hash(raw),gzip_sha256:hash(gzip),raw_bytes:raw.length,gzip_bytes:gzip.length,payload_gzip_base64:gzip.toString('base64')};
 if(Buffer.byteLength(JSON.stringify(record))>CANONICAL_COLD_ARCHIVE_LIMITS.wire_bytes)throw Error('ARCHIVE_WIRE_BOUND');
 const decoded=decodeCanonicalPublicationRow(record);if(JSON.stringify(decoded)!==raw.toString())throw Error('ARCHIVE_LOCAL_READBACK_MISMATCH');return record;
}
export function decodeCanonicalPublicationRow(record){
 if(record?.version!==CANONICAL_COLD_ARCHIVE_VERSION||!HEX.test(record.raw_sha256||'')||!HEX.test(record.gzip_sha256||'')||!positive(record.raw_bytes)||record.raw_bytes>CANONICAL_COLD_ARCHIVE_LIMITS.raw_bytes||!positive(record.gzip_bytes)||record.gzip_bytes>CANONICAL_COLD_ARCHIVE_LIMITS.gzip_bytes||typeof record.payload_gzip_base64!=='string'||record.payload_gzip_base64.length>4*Math.ceil(CANONICAL_COLD_ARCHIVE_LIMITS.gzip_bytes/3))throw Error('ARCHIVE_MANIFEST_INVALID');
 const gzip=Buffer.from(record.payload_gzip_base64,'base64');if(gzip.toString('base64')!==record.payload_gzip_base64||gzip.length!==record.gzip_bytes||hash(gzip)!==record.gzip_sha256)throw Error('ARCHIVE_COMPRESSED_INTEGRITY_FAILED');
 const raw=gunzipSync(gzip,{maxOutputLength:CANONICAL_COLD_ARCHIVE_LIMITS.raw_bytes});if(raw.length!==record.raw_bytes||hash(raw)!==record.raw_sha256)throw Error('ARCHIVE_ORIGINAL_INTEGRITY_FAILED');
 const row=JSON.parse(raw.toString()),binding=identity(row);for(const [key,value] of Object.entries(binding))if(record[key]!==value)throw Error('ARCHIVE_MANIFEST_BINDING_MISMATCH');return row;
}
// This module has no timer, HTTP, provider calls, source deletion or score path.
// A private D1 writer must supply its measured storage and shared account budget.
export async function retainCanonicalPublicationRow(db,record,{db_admit,storage_bytes,now=Date.now(),include_verified_record=false}={}){
 decodeCanonicalPublicationRow(record);
 if(!db?.prepare||!Number.isSafeInteger(storage_bytes)||storage_bytes<0||!positive(now)||typeof db_admit!=='function')return{status:'ARCHIVE_MEASURED_ADMISSION_REQUIRED',retained:false};
 if(db_admit({rows_read:3,rows_written:24})?.allowed!==true)return{status:'ARCHIVE_SHARED_D1_BUDGET_DENIED',retained:false};
 const existing=await db.prepare('SELECT record_json FROM report2_canonical_cold_archive_v1 WHERE publication_id=?1 AND raw_sha256=?2 LIMIT 1').bind(record.publication_id,record.raw_sha256).first();
 if(existing){const stored=JSON.parse(existing.record_json);decodeCanonicalPublicationRow(stored);if(stored.raw_sha256!==record.raw_sha256||stored.raw_bytes!==record.raw_bytes)throw Error('ARCHIVE_IMMUTABLE_COLLISION');return{status:'ARCHIVE_IDENTICAL_RETAINED',retained:true,publication_id:record.publication_id,raw_sha256:record.raw_sha256,stored_gzip_sha256:stored.gzip_sha256,...(include_verified_record?{verified_record:stored}:{})};}
 const wire=JSON.stringify(record),projected=storage_bytes+Buffer.byteLength(wire)+16384;
 if(projected>CANONICAL_COLD_ARCHIVE_LIMITS.database_soft_bytes)return{status:'ARCHIVE_STORAGE_GUARD_REACHED',retained:false,projected_bytes:projected};
 await db.prepare('INSERT INTO report2_canonical_cold_archive_v1(publication_id,raw_sha256,run_id,snapshot_id,contract_code,observed_ts,record_json,created_ts) VALUES(?1,?2,?3,?4,?5,?6,?7,?8) ON CONFLICT(publication_id,raw_sha256) DO NOTHING').bind(record.publication_id,record.raw_sha256,record.run_id,record.snapshot_id,record.contract_code,record.observed_ts,wire,now).run();
 const readback=await db.prepare('SELECT record_json FROM report2_canonical_cold_archive_v1 WHERE publication_id=?1 AND raw_sha256=?2 LIMIT 1').bind(record.publication_id,record.raw_sha256).first();
 if(!readback)throw Error('ARCHIVE_DURABLE_READBACK_MISSING');const stored=JSON.parse(readback.record_json);decodeCanonicalPublicationRow(stored);if(stored.raw_sha256!==record.raw_sha256||stored.raw_bytes!==record.raw_bytes)throw Error('ARCHIVE_DURABLE_READBACK_MISMATCH');
 return{status:'ARCHIVE_DURABLE_ORIGINAL_BYTES_CONFIRMED',retained:true,publication_id:record.publication_id,raw_sha256:stored.raw_sha256,gzip_sha256:stored.gzip_sha256,raw_bytes:stored.raw_bytes,gzip_bytes:stored.gzip_bytes,original_observed_ts:stored.observed_ts,archived_ts:now,main_deletion_authorized:false,report_or_score_effect:false,...(include_verified_record?{verified_record:stored}:{})};
}
export async function readCanonicalPublicationArchive(db,{publication_id,raw_sha256,db_admit}={}){
 if(!db?.prepare||typeof db_admit!=='function'||db_admit({rows_read:1,rows_written:0})?.allowed!==true)return{status:'ARCHIVE_READ_ADMISSION_REQUIRED',row:null};
 if(!/^PUB:[a-f0-9]{40,64}$/.test(publication_id||'')||!HEX.test(raw_sha256||''))return{status:'ARCHIVE_EXACT_REVISION_REQUIRED',row:null};
 const found=await db.prepare('SELECT record_json FROM report2_canonical_cold_archive_v1 WHERE publication_id=?1 AND raw_sha256=?2 LIMIT 1').bind(publication_id,raw_sha256).first();if(!found)return{status:'ARCHIVE_EXACT_REVISION_NOT_FOUND',row:null};
 const record=JSON.parse(found.record_json);if(record.publication_id!==publication_id||record.raw_sha256!==raw_sha256)throw Error('ARCHIVE_REQUEST_BINDING_MISMATCH');return{status:'ARCHIVE_ORIGINAL_REVISION_READ',row:decodeCanonicalPublicationRow(record),source_clocks_refreshed:false,live_decision_eligible:false};
}
