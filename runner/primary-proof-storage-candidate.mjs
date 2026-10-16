// Offline candidate only. No production writer or reader imports this module.
// Preserve every original byte; the SQL projection is never a replacement for
// the full proof and cannot authorize activation or acknowledge persistence.
export const PROOF_STORAGE_CANDIDATE = Object.freeze({
  schema:'REPORT2_PRIMARY_PROOF_GZIP_CANDIDATE_V1',
  marker:'__report2_primary_proof_gzip_v1',
  column:'stage392_proof_bundle_json',
  max_raw_bytes:6_000_000,
  max_stored_bytes:1_400_000,
  production_enabled:false
});
const P=PROOF_STORAGE_CANDIDATE,encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
export const proofBytesHash=async bytes=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)));
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const size=v=>Number.isSafeInteger(v)&&v>0;
function uniqueJson(raw){
  const parsed=JSON.parse(raw),stack=[];
  for(let i=0;i<raw.length;i++){
    const c=raw[i],top=stack.at(-1);
    if(c==='"'){
      const start=i;let escaped=false;
      while(++i<raw.length){if(escaped)escaped=false;else if(raw[i]==='\\')escaped=true;else if(raw[i]==='"')break;}
      if(top?.object&&top.key){const key=JSON.parse(raw.slice(start,i+1));if(top.keys.has(key))throw Error('PROOF_DUPLICATE_JSON_KEY');top.keys.add(key);top.key=false;}
    }else if(c==='{')stack.push({object:true,key:true,keys:new Set()});
    else if(c==='[')stack.push({object:false});
    else if(c==='}'||c===']')stack.pop();
    else if(c===','&&top?.object)top.key=true;
  }
  return parsed;
}
function keyParts(path){
  if(typeof path!=='string'||!/^\$(?:\.[A-Za-z_][A-Za-z_0-9]*)+$/.test(path))throw Error('PROOF_PROJECTION_PATH_UNSUPPORTED');
  return path.slice(2).split('.');
}
function valueAt(root,parts){
  let v=root;
  for(const part of parts){if(!object(v)||!Object.hasOwn(v,part))return{present:false};v=v[part];}
  return{present:true,value:v};
}
function assign(root,parts,value){
  let out=root;
  for(const part of parts.slice(0,-1)){
    if(!Object.hasOwn(out,part))Object.defineProperty(out,part,{value:Object.create(null),enumerable:true,writable:true,configurable:true});
    if(!object(out[part]))throw Error('PROOF_PROJECTION_CONTAINER_CONFLICT');
    out=out[part];
  }
  Object.defineProperty(out,parts.at(-1),{value,enumerable:true,writable:true,configurable:true});
}
const clone=v=>JSON.parse(JSON.stringify(v));
const stable=v=>Array.isArray(v)?v.map(stable):object(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
export function proofSqlContract(trigger_sql){
  if(typeof trigger_sql!=='string'||!trigger_sql.includes('trg_stage392_full_evidence_proof_insert_guard'))throw Error('PROOF_NATIVE_TRIGGER_REQUIRED');
  const occurrences=[...trigger_sql.matchAll(/json_(extract|type)\(NEW\.stage392_proof_bundle_json,'([^']+)'\)/g)].map(([,operation,path])=>({operation,path}));
  // Pin the complete declared contract, including object/null type checks.
  if(occurrences.length!==48||occurrences.filter(x=>x.operation==='extract').length!==43||occurrences.filter(x=>x.operation==='type').length!==5)throw Error('PROOF_NATIVE_TRIGGER_CONTRACT_CHANGED');
  for(const r of occurrences)keyParts(r.path);
  const requests=[...new Map(occurrences.map(r=>[r.operation+':'+r.path,r])).values()].sort((a,b)=>a.path.localeCompare(b.path)||a.operation.localeCompare(b.operation));
  return {schema:'DECLARED_STAGE392_TRIGGER_PROJECTION_V1',requests,occurrences:48,native_trigger_presence_rechecked:false};
}
export function proofSqlProjection(raw,contract){
  if(contract?.schema!=='DECLARED_STAGE392_TRIGGER_PROJECTION_V1'||!Array.isArray(contract.requests)||!contract.requests.length)throw Error('PROOF_PROJECTION_CONTRACT_REQUIRED');
  const full=uniqueJson(raw);
  if(!object(full)||Object.hasOwn(full,P.marker))throw Error('PROOF_ORIGINAL_OBJECT_REQUIRED');
  const projection=Object.create(null);
  // Type-only containers may be empty. Extracted leaves retain their exact
  // JSON values; every unprojected value remains in the compressed original.
  if(contract.requests.some(x=>!['extract','type'].includes(x.operation)))throw Error('PROOF_PROJECTION_OPERATION_UNSUPPORTED');
  for(const {path} of contract.requests.filter(x=>x.operation==='type')){
    const parts=keyParts(path),found=valueAt(full,parts);if(!found.present)continue;
    assign(projection,parts,object(found.value)?Object.create(null):Array.isArray(found.value)?[]:found.value);
  }
  for(const {operation,path} of contract.requests.filter(x=>x.operation==='extract')){
    if(operation!=='extract')throw Error('PROOF_PROJECTION_OPERATION_UNSUPPORTED');
    const parts=keyParts(path),found=valueAt(full,parts);if(found.present)assign(projection,parts,clone(found.value));
  }
  return projection;
}
async function boundedStream(stream,max){
  const reader=stream.getReader(),parts=[];let total=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>max)throw Error('PROOF_STREAM_SIZE_LIMIT');parts.push(value);}}
  finally{await reader.cancel().catch(()=>{});}
  const out=new Uint8Array(total);let offset=0;for(const p of parts){out.set(p,offset);offset+=p.length;}return out;
}
function toBase64(bytes){let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);}
function fromBase64(value){
  if(typeof value!=='string'||value.length>Math.ceil(P.max_stored_bytes/3)*4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))throw Error('PROOF_BASE64_INVALID');
  const out=Uint8Array.from(atob(value),c=>c.charCodeAt(0));if(toBase64(out)!==value)throw Error('PROOF_BASE64_NONCANONICAL');return out;
}
function identity(value){
  if(!object(value)||typeof value.full_evidence_id!=='string'||!value.full_evidence_id||typeof value.contract_code!=='string'||!value.contract_code.endsWith('-USDT')||!Number.isSafeInteger(value.observed_ts)||value.observed_ts<1_000_000_000_000)throw Error('PROOF_EXACT_ROW_IDENTITY_REQUIRED');
  return {full_evidence_id:value.full_evidence_id,contract_code:value.contract_code,observed_ts:value.observed_ts};
}
function bindProof(full,row){
  if(full?.full_evidence?.full_evidence_id!==row.full_evidence_id||full.contract_code!==row.contract_code||full.observed_ts!==row.observed_ts||full.full_evidence.contract_code!==row.contract_code||full.full_evidence.observed_ts!==row.observed_ts)throw Error('PROOF_ORIGINAL_ROW_IDENTITY_MISMATCH');
}
export async function encodePrimaryProofCandidate(raw,{row,contract}={}){
  const id=identity(row);
  if(typeof raw!=='string')throw Error('PROOF_ORIGINAL_STRING_REQUIRED');
  const bytes=encoder.encode(raw);if(!size(bytes.length)||bytes.length>P.max_raw_bytes||decoder.decode(bytes)!==raw)throw Error('PROOF_ORIGINAL_SIZE_OR_UTF8_INVALID');
  bindProof(uniqueJson(raw),id);
  const projection=proofSqlProjection(raw,contract),contract_sha256=await proofBytesHash(encoder.encode(JSON.stringify(contract)));
  const gz=await boundedStream(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip')),P.max_stored_bytes);
  const descriptor={schema:P.schema,column:P.column,...id,raw_bytes:bytes.length,raw_sha256:await proofBytesHash(bytes),gzip_bytes:gz.length,gzip_sha256:await proofBytesHash(gz),contract_sha256,payload_b64:toBase64(gz)};
  const stored=JSON.stringify({...projection,[P.marker]:descriptor});
  if(encoder.encode(stored).length>P.max_stored_bytes)throw Error('PROOF_STORED_SIZE_LIMIT');
  return {stored,descriptor:{...descriptor,payload_b64:undefined},raw_bytes:bytes.length,stored_bytes:encoder.encode(stored).length,production_enabled:false,activation_authorized:false};
}
export async function decodePrimaryProofCandidate(stored,{row,contract,expected_raw_sha256}={}){
  if(typeof stored!=='string'||encoder.encode(stored).length>P.max_stored_bytes)throw Error('PROOF_STORED_SIZE_LIMIT');
  const id=identity(row),body=uniqueJson(stored),d=body?.[P.marker];
  if(!object(d)||d.schema!==P.schema||d.column!==P.column||JSON.stringify(identity(d))!==JSON.stringify(id)||!size(d.raw_bytes)||d.raw_bytes>P.max_raw_bytes||!size(d.gzip_bytes)||d.gzip_bytes>P.max_stored_bytes||!hash(d.raw_sha256)||!hash(d.gzip_sha256)||!hash(expected_raw_sha256)||d.raw_sha256!==expected_raw_sha256)throw Error('PROOF_DESCRIPTOR_OR_IDENTITY_MISMATCH');
  if(d.contract_sha256!==await proofBytesHash(encoder.encode(JSON.stringify(contract))))throw Error('PROOF_PROJECTION_CONTRACT_MISMATCH');
  const gz=fromBase64(d.payload_b64);if(gz.length!==d.gzip_bytes||await proofBytesHash(gz)!==d.gzip_sha256)throw Error('PROOF_GZIP_HASH_MISMATCH');
  const bytes=await boundedStream(new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip')),d.raw_bytes);
  if(bytes.length!==d.raw_bytes||await proofBytesHash(bytes)!==d.raw_sha256)throw Error('PROOF_ORIGINAL_HASH_MISMATCH');
  const raw=decoder.decode(bytes);bindProof(uniqueJson(raw),id);
  delete body[P.marker];
  if(JSON.stringify(stable(body))!==JSON.stringify(stable(proofSqlProjection(raw,contract))))throw Error('PROOF_SQL_PROJECTION_MISMATCH');
  return raw;
}
