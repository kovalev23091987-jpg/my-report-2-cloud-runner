// Private history is an exact, immutable revision. Restoring it does not refresh
// source clocks, grant an entry, or consult a provider. Works in Node and Workers.
export const PRIVATE_CANONICAL_PREFIX='R2PRIVATE_CANONICAL_V1:';
export const PRIVATE_CANONICAL_LIMITS=Object.freeze({raw_bytes:4_000_000,gzip_bytes:400_000,wire_bytes:900_000,max_rows:4});
const HEX=/^[a-f0-9]{64}$/,PUB=/^PUB:[a-f0-9]{40,64}$/;
const marker=/^R2PRIVATE_CANONICAL_V1:(PUB:[a-f0-9]{40,64}):([a-f0-9]{64}):([a-zA-Z_][a-zA-Z0-9_]*)$/;
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
const positive=v=>Number.isSafeInteger(v)&&v>0;
const bindingKeys=['publication_id','run_id','snapshot_id','contract_code','observed_ts','analytical_fingerprint'];

function exactBinding(row,record){
 if(!row||typeof row!=='object'||Array.isArray(row)||!PUB.test(row.publication_id||'')||!row.run_id||!row.snapshot_id||!row.contract_code||!positive(row.observed_ts)||!HEX.test(row.analytical_fingerprint||''))throw Error('PRIVATE_HISTORY_IDENTITY_INVALID');
 for(const key of bindingKeys)if(record[key]!==row[key])throw Error('PRIVATE_HISTORY_MANIFEST_BINDING_MISMATCH');
 if(typeof row.canonical_json!=='string'||typeof row.presentation_inputs_json!=='string')throw Error('PRIVATE_HISTORY_ORIGINAL_JSON_REQUIRED');
 const canonical=JSON.parse(row.canonical_json),presentation=JSON.parse(row.presentation_inputs_json);
 if(!canonical||typeof canonical!=='object'||Array.isArray(canonical)||!presentation||typeof presentation!=='object'||Array.isArray(presentation))throw Error('PRIVATE_HISTORY_JSON_OBJECT_REQUIRED');
 const contract=canonical.metadata?.contract??canonical.contract??canonical.candidates?.[0]?.contract??canonical.candidates?.[0]?.ticker??canonical.universe?.[0]?.contract;
 if(contract!==row.contract_code||(canonical.contract!==undefined&&canonical.contract!==contract)||canonical.run_id!==row.run_id||canonical.snapshot_id!==row.snapshot_id||canonical.observed_ts!==row.observed_ts||canonical.analytical_fingerprint!==row.analytical_fingerprint)throw Error('PRIVATE_HISTORY_CANONICAL_BINDING_MISMATCH');
 return row;
}

async function boundedGunzip(bytes,limit){
 const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
 const chunks=[];let length=0;
 try{
  while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>limit)throw Error('PRIVATE_HISTORY_DECOMPRESSION_BOUND');chunks.push(value);}
 }catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
 const out=new Uint8Array(length);let offset=0;for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.length;}return out;
}

export async function decodePrivateCanonicalRecord(record){
 const p=PRIVATE_CANONICAL_LIMITS;
 if(record?.version!=='private-canonical-lossless-gzip-v1'||!HEX.test(record.raw_sha256||'')||!HEX.test(record.gzip_sha256||'')||!positive(record.raw_bytes)||record.raw_bytes>p.raw_bytes||!positive(record.gzip_bytes)||record.gzip_bytes>p.gzip_bytes||typeof record.payload_gzip_base64!=='string'||record.payload_gzip_base64.length>4*Math.ceil(p.gzip_bytes/3))throw Error('PRIVATE_HISTORY_MANIFEST_INVALID');
 if(encoder.encode(JSON.stringify(record)).length>p.wire_bytes)throw Error('PRIVATE_HISTORY_WIRE_BOUND');
 const binary=atob(record.payload_gzip_base64);if(btoa(binary)!==record.payload_gzip_base64||binary.length!==record.gzip_bytes)throw Error('PRIVATE_HISTORY_BASE64_INVALID');
 const gzip=Uint8Array.from(binary,c=>c.charCodeAt(0));if(await hash(gzip)!==record.gzip_sha256)throw Error('PRIVATE_HISTORY_COMPRESSED_HASH_MISMATCH');
 const raw=await boundedGunzip(gzip,Math.min(p.raw_bytes,record.raw_bytes));
 if(raw.length!==record.raw_bytes||await hash(raw)!==record.raw_sha256)throw Error('PRIVATE_HISTORY_ORIGINAL_HASH_MISMATCH');
 return exactBinding(JSON.parse(decoder.decode(raw)),record);
}

export async function privateCanonicalHeader(row,record){
 exactBinding(row,record);
 if(!HEX.test(record.raw_sha256||'')||!positive(record.raw_bytes)||record.raw_bytes>PRIVATE_CANONICAL_LIMITS.raw_bytes)throw Error('PRIVATE_HISTORY_REVISION_REQUIRED');
 const raw=encoder.encode(JSON.stringify(row));if(raw.length!==record.raw_bytes||await hash(raw)!==record.raw_sha256)throw Error('PRIVATE_HISTORY_HEADER_REVISION_MISMATCH');
 return Object.fromEntries(Object.entries(row).map(([column,value])=>{
  if(!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(column))throw Error('PRIVATE_HISTORY_COLUMN_INVALID');
  return[column,typeof value==='string'&&(column.endsWith('_json')||column==='manual_text'||column==='telegram_text')&&encoder.encode(value).length>256?`${PRIVATE_CANONICAL_PREFIX}${row.publication_id}:${record.raw_sha256}:${column}`:value];
 }));
}

export function createPrivateCanonicalRestorer({archive_db,db_admit,max_rows=PRIVATE_CANONICAL_LIMITS.max_rows}={}){
 if(!archive_db?.prepare||typeof db_admit!=='function'||!Number.isSafeInteger(max_rows)||max_rows<1||max_rows>PRIVATE_CANONICAL_LIMITS.max_rows)throw Error('PRIVATE_HISTORY_MEASURED_READER_REQUIRED');
 const cache=new Map();let reads=0;
 const load=async(publication_id,raw_sha256)=>{
  const key=`${publication_id}:${raw_sha256}`;
  if(!cache.has(key)){
   if(reads>=max_rows)throw Error('PRIVATE_HISTORY_READER_ROW_BOUND');
   if(db_admit({rows_read:3,rows_written:0})?.allowed!==true)throw Error('PRIVATE_HISTORY_SHARED_D1_ADMISSION_REQUIRED');
   reads++;
   cache.set(key,(async()=>{
    const saved=await archive_db.prepare('SELECT record_json FROM report2_canonical_cold_archive_v1 WHERE publication_id=?1 AND raw_sha256=?2 LIMIT 1').bind(publication_id,raw_sha256).first();
    if(!saved||typeof saved.record_json!=='string')throw Error('PRIVATE_HISTORY_EXACT_REVISION_MISSING');
    if(encoder.encode(saved.record_json).length>PRIVATE_CANONICAL_LIMITS.wire_bytes)throw Error('PRIVATE_HISTORY_WIRE_BOUND');
    const record=JSON.parse(saved.record_json);if(record.publication_id!==publication_id||record.raw_sha256!==raw_sha256)throw Error('PRIVATE_HISTORY_REQUEST_BINDING_MISMATCH');
    return decodePrivateCanonicalRecord(record);
   })());
  }
  return cache.get(key);
 };
 const restore=async value=>{
  if(Array.isArray(value)){const out=[];for(const item of value)out.push(await restore(item));return out;}
  if(value&&typeof value==='object'){
   const entries=[];let revision=null;
   for(const [key,part] of Object.entries(value)){
    if(typeof part==='string'&&part.startsWith(PRIVATE_CANONICAL_PREFIX)){
     const m=part.match(marker);if(!m||m[3]!==key)throw Error('PRIVATE_HISTORY_COLUMN_LOCATOR_INVALID');
     const selected=`${m[1]}:${m[2]}`;if(revision!==null&&revision!==selected)throw Error('PRIVATE_HISTORY_MIXED_REVISIONS');revision=selected;
     const original=await load(m[1],m[2]);
     for(const binding of bindingKeys)if(Object.hasOwn(value,binding)&&value[binding]!==original[binding])throw Error('PRIVATE_HISTORY_QUERY_BINDING_MISMATCH');
     if(!Object.hasOwn(original,key)||typeof original[key]!=='string')throw Error('PRIVATE_HISTORY_ORIGINAL_COLUMN_MISSING');
     entries.push([key,original[key]]);
    }else entries.push([key,await restore(part)]);
   }
   return Object.fromEntries(entries);
  }
  if(typeof value==='string'&&value.startsWith(PRIVATE_CANONICAL_PREFIX))throw Error('PRIVATE_HISTORY_COLUMN_CONTEXT_REQUIRED');
  return value;
 };
 return {restore,usage:()=>({private_revision_reads:reads,cached_rows:cache.size,sourceHTTP:0,source_clocks_refreshed:false})};
}
