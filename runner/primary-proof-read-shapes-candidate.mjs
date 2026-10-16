// Offline only: explicit read shapes can use independent pre-insert manifests
// or an explicit read-only stored-descriptor integrity mode. Neither grants
// persistence ACK. No SQL, network, activation or native receipt is produced.
import {PROOF_STORAGE_CANDIDATE as P,decodePrimaryProofCandidate} from './primary-proof-storage-candidate.mjs';
import {restorePrimaryProofCandidateColumn} from './primary-proof-readback-candidate.mjs';
const enc=new TextEncoder(),plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const count=v=>Number.isSafeInteger(v)&&v>=0,identity=x=>({full_evidence_id:x.full_evidence_id,contract_code:x.contract_code,observed_ts:x.observed_ts});
const proofKey=P.column;
function hint(raw){
 if(typeof raw!=='string')throw Error('PROOF_READ_STRING_REQUIRED');let body;try{body=JSON.parse(raw);}catch{throw Error('PROOF_READ_JSON_REQUIRED');}
 const d=body?.[P.marker],id=d?identity(d):{full_evidence_id:body?.full_evidence?.full_evidence_id,contract_code:body?.contract_code,observed_ts:body?.observed_ts};
 if(!id.full_evidence_id||typeof id.full_evidence_id!=='string'||typeof id.contract_code!=='string'||!count(id.observed_ts))throw Error('PROOF_READ_IDENTITY_REQUIRED');
 const bytes=d?.raw_bytes??enc.encode(raw).length;if(!Number.isSafeInteger(bytes)||bytes<=0||bytes>P.max_raw_bytes)throw Error('PROOF_READ_BYTES_REQUIRED');
 return{id,bytes,descriptor:d??null};
}
export function createPrimaryProofReadShapesCandidate({contract,expectations=[],descriptor_only_reads=false,max_values=8,max_decoded_bytes=12_000_000,max_result_rows=256}={}){
 if(!plain(contract)||!Array.isArray(expectations)||expectations.length>105||!expectations.length&&descriptor_only_reads!==true||typeof descriptor_only_reads!=='boolean'||!Number.isInteger(max_values)||max_values<1||max_values>8||!Number.isSafeInteger(max_decoded_bytes)||max_decoded_bytes<1||max_decoded_bytes>12_000_000||!Number.isInteger(max_result_rows)||max_result_rows<1||max_result_rows>256)throw Error('PROOF_READ_BOUNDED_INDEPENDENT_MANIFEST_REQUIRED');
 const fixedContract=JSON.parse(JSON.stringify(contract)),manifests=new Map();for(const original of expectations){const e=JSON.parse(JSON.stringify(original));const id=e?.identity?.full_evidence_id;if(!id||manifests.has(id))throw Error('PROOF_READ_UNIQUE_EXPECTATION_REQUIRED');manifests.set(id,e);}
 let values=0,decoded_bytes=0;
 const restore=async(value,spec)=>{
  const work=[],patches=[];let result_rows=0;const rows=n=>{result_rows+=n;if(result_rows>max_result_rows)throw Error('PROOF_READ_RESULT_ROW_BOUND');};
  function scalar(raw,bind,set){
   if(raw===null){set(null);return;}
   if(bind!==undefined&&(!plain(bind)||Object.keys(bind).some(k=>!['full_evidence_id','contract_code','observed_ts'].includes(k))))throw Error('PROOF_READ_EXPLICIT_IDENTITY_INVALID');
   const h=hint(raw),expectation=manifests.get(h.id.full_evidence_id);
   if(bind&&Object.keys(bind).some(k=>Object.hasOwn(h.id,k)&&bind[k]!==h.id[k])||expectation&&JSON.stringify(identity(expectation.identity))!==JSON.stringify(h.id)||!expectation&&!descriptor_only_reads)throw Error('PROOF_READ_INDEPENDENT_IDENTITY_MISMATCH');
   work.push({raw,expectation,descriptor:h.descriptor,row_identity:h.id,bytes:h.bytes,set});
  }
  function columns(s){if(!Array.isArray(s.columns)||!s.columns.length||s.columns.length>95||s.columns.some(c=>!plain(c)||typeof c.output!=='string'||typeof c.source!=='string')||new Set(s.columns.map(c=>c.output)).size!==s.columns.length)throw Error('PROOF_READ_EXPLICIT_COLUMNS_REQUIRED');return s.columns;}
  function row(input,s,set){
   if(!plain(input)||Object.values(Object.getOwnPropertyDescriptors(input)).some(d=>!Object.hasOwn(d,'value')))throw Error('PROOF_READ_ROW_REQUIRED');rows(1);const cols=columns(s);if(cols.some(c=>!Object.hasOwn(input,c.output)))throw Error('PROOF_READ_SELECTED_COLUMN_MISSING');const out={...input};
   const bind={};for(const c of cols)if(['full_evidence_id','contract_code','observed_ts'].includes(c.source)&&Object.hasOwn(input,c.output))bind[c.source]=input[c.output];
   for(const c of cols)if(c.source===proofKey&&Object.hasOwn(input,c.output))scalar(input[c.output],bind,v=>out[c.output]=v);
   patches.push(()=>set(out));
  }
  function visit(input,s,set){
   if(!plain(s)||!['all','first','raw','batch','run','exec'].includes(s.operation))throw Error('PROOF_READ_EXPLICIT_OPERATION_REQUIRED');
   if(s.operation==='run'||s.operation==='exec'){if(!plain(input))throw Error('PROOF_READ_WRITE_ENVELOPE_REQUIRED');patches.push(()=>set(input));return;}
   if(s.operation==='batch'){
    if(!Array.isArray(input)||!Array.isArray(s.members)||input.length!==s.members.length||input.length>100)throw Error('PROOF_READ_EXACT_BATCH_REQUIRED');
    const out=[...input];for(let i=0;i<input.length;i++)visit(input[i],s.members[i],v=>out[i]=v);patches.push(()=>set(out));return;
   }
   const cols=columns(s);
   if(s.operation==='first'){
    if(input===null){patches.push(()=>set(null));return;}
    if(s.column!==undefined){const selected=cols.find(c=>c.output===s.column);if(!selected)throw Error('PROOF_READ_EXACT_SCALAR_COLUMN_REQUIRED');if(selected.source===proofKey)scalar(input,s.identity,v=>set(v));else patches.push(()=>set(input));return;}
    row(input,s,set);return;
   }
   if(s.operation==='all'){
    if(!plain(input)||input.success===false||!Array.isArray(input.results))throw Error('PROOF_READ_SUCCESSFUL_ROWS_REQUIRED');if(input.results.length>max_result_rows-result_rows)throw Error('PROOF_READ_RESULT_ROW_BOUND');const out={...input,results:[...input.results]};input.results.forEach((r,i)=>row(r,s,v=>out.results[i]=v));patches.push(()=>set(out));return;
   }
   if(!Array.isArray(input))throw Error('PROOF_READ_RAW_ARRAY_REQUIRED');const offset=s.columnNames===true?1:0;rows(Math.max(0,input.length-offset));const out=input.map(r=>Array.isArray(r)?[...r]:r);
   if(offset&&(!Array.isArray(input[0])||JSON.stringify(input[0])!==JSON.stringify(cols.map(c=>c.output))))throw Error('PROOF_READ_RAW_HEADER_REQUIRED');
   for(let i=offset;i<input.length;i++){
    if(!Array.isArray(input[i])||input[i].length!==cols.length)throw Error('PROOF_READ_RAW_COLUMN_COUNT_REQUIRED');const bind={};cols.forEach((c,k)=>{if(['full_evidence_id','contract_code','observed_ts'].includes(c.source))bind[c.source]=input[i][k];});cols.forEach((c,k)=>{if(c.source===proofKey)scalar(input[i][k],bind,v=>out[i][k]=v);});
   }
   patches.push(()=>set(out));
  }
  let output;visit(value,spec,v=>output=v);
  const bytes=work.reduce((n,w)=>n+w.bytes,0);if(work.length>max_values-values||bytes>max_decoded_bytes-decoded_bytes)throw Error('PROOF_READ_GROUP_DECOMPRESSION_BOUND');
  // Reserve the whole response before decoding its first member. A later
  // corruption never returns a partly restored result or refunds attempted work.
  values+=work.length;decoded_bytes+=bytes;
  for(const w of work){
   const restored=w.expectation?await restorePrimaryProofCandidateColumn(w.raw,{expectation:w.expectation,contract:fixedContract,row_identity:w.row_identity}):w.descriptor?await decodePrimaryProofCandidate(w.raw,{row:w.row_identity,contract:fixedContract,expected_raw_sha256:w.descriptor.raw_sha256}):w.raw;
   w.set(restored);
  }
  for(const patch of patches)patch();
  return output;
 };
 return{restore,usage:()=>({values,decoded_bytes,max_values,max_decoded_bytes,max_result_rows,SQL:0,HTTP:0,read_trust_basis:descriptor_only_reads?'STORED_DESCRIPTOR_INTEGRITY_AND_CALLER_IDENTITY_NOT_INDEPENDENT_ACK':'INDEPENDENT_PREINSERT_EXPECTATION',production_enabled:false,production_ACK_authorized:false,native_receipt_accepted:false})};
}
