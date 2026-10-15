// Private history is an exact, immutable revision. Restoring it does not refresh
// source clocks, grant an entry, or consult a provider. Works in Node and Workers.
export const PRIVATE_CANONICAL_PREFIX='R2PRIVATE_CANONICAL_V1:';
export const PRIVATE_CANONICAL_LIMITS=Object.freeze({raw_bytes:4_000_000,gzip_bytes:400_000,wire_bytes:900_000,max_rows:4,maximum_reader_rows:8});
const HEX=/^[a-f0-9]{64}$/,PUB=/^PUB:[a-f0-9]{40,64}$/;
const marker=/^R2PRIVATE_CANONICAL_V1:(PUB:[a-f0-9]{40,64}):([a-f0-9]{64}):([a-zA-Z_][a-zA-Z0-9_]*)(?::(A[1-8]))?$/;
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

export async function privateCanonicalHeader(row,record,{archive_slot=null}={}){
 exactBinding(row,record);
 if(archive_slot!==null&&!/^A[1-8]$/.test(archive_slot))throw Error('PRIVATE_HISTORY_ARCHIVE_SLOT_INVALID');
 if(!HEX.test(record.raw_sha256||'')||!positive(record.raw_bytes)||record.raw_bytes>PRIVATE_CANONICAL_LIMITS.raw_bytes)throw Error('PRIVATE_HISTORY_REVISION_REQUIRED');
 const raw=encoder.encode(JSON.stringify(row));if(raw.length!==record.raw_bytes||await hash(raw)!==record.raw_sha256)throw Error('PRIVATE_HISTORY_HEADER_REVISION_MISMATCH');
 return Object.fromEntries(Object.entries(row).map(([column,value])=>{
  if(!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(column))throw Error('PRIVATE_HISTORY_COLUMN_INVALID');
  return[column,typeof value==='string'&&(column.endsWith('_json')||column==='manual_text'||column==='telegram_text')&&encoder.encode(value).length>256?`${PRIVATE_CANONICAL_PREFIX}${row.publication_id}:${record.raw_sha256}:${column}${archive_slot===null?'':':'+archive_slot}`:value];
 }));
}

export function privateCanonicalArchivePool(archive_db,archive_dbs={}){
 if(typeof archive_db?.prepare!=='function')throw Error('PRIVATE_HISTORY_MEASURED_READER_REQUIRED');
 if(!archive_dbs||typeof archive_dbs!=='object'||Array.isArray(archive_dbs)||Object.keys(archive_dbs).some(slot=>!/^A[1-8]$/.test(slot)||typeof archive_dbs[slot]?.prepare!=='function'))throw Error('PRIVATE_HISTORY_ARCHIVE_POOL_INVALID');
 const entries=[['LEGACY',archive_db],...Object.entries(archive_dbs)];
 if(new Set(entries.map(([,db])=>db)).size!==entries.length)throw Error('PRIVATE_HISTORY_DUPLICATE_ARCHIVE_BINDING');
 return new Map(entries);
}

export function createPrivateCanonicalRestorer({archive_db,archive_dbs={},db_admit,max_rows=PRIVATE_CANONICAL_LIMITS.max_rows}={}){
 if(typeof db_admit!=='function'||!Number.isSafeInteger(max_rows)||max_rows<1||max_rows>PRIVATE_CANONICAL_LIMITS.maximum_reader_rows)throw Error('PRIVATE_HISTORY_MEASURED_READER_REQUIRED');
 // Snapshot explicitly installed bindings. A locator cannot select a URL or a
 // database UUID, and an absent shard never falls back to a different original.
 const pool=privateCanonicalArchivePool(archive_db,archive_dbs);
 const selectedDB=slot=>{if(!pool.has(slot||'LEGACY'))throw Error('PRIVATE_HISTORY_ARCHIVE_SLOT_NOT_INSTALLED');return pool.get(slot||'LEGACY');};
 const revisionKey=m=>`${m[4]||'LEGACY'}:${m[1]}:${m[2]}`;
 const cache=new Map();let reads=0;
 const load=async(publication_id,raw_sha256,slot)=>{
  const key=`${slot||'LEGACY'}:${publication_id}:${raw_sha256}`;
  if(!cache.has(key)){
   if(reads>=max_rows)throw Error('PRIVATE_HISTORY_READER_ROW_BOUND');
   if(db_admit({rows_read:3,rows_written:0})?.allowed!==true)throw Error('PRIVATE_HISTORY_SHARED_D1_ADMISSION_REQUIRED');
   reads++;
   cache.set(key,(async()=>{
    const saved=await selectedDB(slot).prepare('SELECT record_json FROM report2_canonical_cold_archive_v1 WHERE publication_id=?1 AND raw_sha256=?2 LIMIT 1').bind(publication_id,raw_sha256).first();
    if(!saved||typeof saved.record_json!=='string')throw Error('PRIVATE_HISTORY_EXACT_REVISION_MISSING');
    if(encoder.encode(saved.record_json).length>PRIVATE_CANONICAL_LIMITS.wire_bytes)throw Error('PRIVATE_HISTORY_WIRE_BOUND');
    const record=JSON.parse(saved.record_json);if(record.publication_id!==publication_id||record.raw_sha256!==raw_sha256)throw Error('PRIVATE_HISTORY_REQUEST_BINDING_MISMATCH');
    return decodePrivateCanonicalRecord(record);
   })());
  }
  return cache.get(key);
 };
 const preflight=value=>{
  const needed=new Set();
  const scan=part=>{
   if(Array.isArray(part)){part.forEach(scan);return;}
   if(part&&typeof part==='object'){
    let revision=null;
    for(const [key,item] of Object.entries(part)){
     if(typeof item==='string'&&item.startsWith(PRIVATE_CANONICAL_PREFIX)){
      const m=item.match(marker);if(!m||m[3]!==key)throw Error('PRIVATE_HISTORY_COLUMN_LOCATOR_INVALID');
      selectedDB(m[4]);
      const selected=revisionKey(m);
      if(revision!==null&&revision!==selected)throw Error('PRIVATE_HISTORY_MIXED_REVISIONS');revision=selected;
      if(Object.hasOwn(part,'publication_id')&&part.publication_id!==m[1])throw Error('PRIVATE_HISTORY_QUERY_BINDING_MISMATCH');
      if(!cache.has(selected))needed.add(selected);
     }else scan(item);
    }
   }else if(typeof part==='string'&&part.startsWith(PRIVATE_CANONICAL_PREFIX))throw Error('PRIVATE_HISTORY_COLUMN_CONTEXT_REQUIRED');
  };
  scan(value);
  // Refuse the whole result before reading its first four revisions. Existing
  // global load/admission guards still handle concurrent callers and failures.
  if(needed.size>max_rows-reads)throw Error('PRIVATE_HISTORY_READER_ROW_BOUND');
 };
 const restoreValue=async value=>{
  if(Array.isArray(value)){const out=[];for(const item of value)out.push(await restoreValue(item));return out;}
  if(value&&typeof value==='object'){
   const entries=[];let revision=null;
   for(const [key,part] of Object.entries(value)){
    if(typeof part==='string'&&part.startsWith(PRIVATE_CANONICAL_PREFIX)){
     const m=part.match(marker);if(!m||m[3]!==key)throw Error('PRIVATE_HISTORY_COLUMN_LOCATOR_INVALID');
     const selected=revisionKey(m);if(revision!==null&&revision!==selected)throw Error('PRIVATE_HISTORY_MIXED_REVISIONS');revision=selected;
     const original=await load(m[1],m[2],m[4]);
     for(const binding of bindingKeys)if(Object.hasOwn(value,binding)&&value[binding]!==original[binding])throw Error('PRIVATE_HISTORY_QUERY_BINDING_MISMATCH');
     if(!Object.hasOwn(original,key)||typeof original[key]!=='string')throw Error('PRIVATE_HISTORY_ORIGINAL_COLUMN_MISSING');
     entries.push([key,original[key]]);
    }else entries.push([key,await restoreValue(part)]);
   }
   return Object.fromEntries(entries);
  }
  if(typeof value==='string'&&value.startsWith(PRIVATE_CANONICAL_PREFIX))throw Error('PRIVATE_HISTORY_COLUMN_CONTEXT_REQUIRED');
  return value;
 };
 return {restore:async value=>{preflight(value);return restoreValue(value);},usage:()=>({private_revision_reads:reads,cached_rows:cache.size,sourceHTTP:0,source_clocks_refreshed:false})};
}
