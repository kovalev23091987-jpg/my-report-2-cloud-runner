// OFFLINE qualification only. No production caller imports this module.
// These helpers cannot issue SQL, acknowledge D1 persistence, enable a format,
// or replace the producer's causal receipt. Expectations come from original
// pre-insert data; a readback may never manufacture its own expected digest.
import {PROOF_STORAGE_CANDIDATE as P,proofBytesHash,encodePrimaryProofCandidate,decodePrimaryProofCandidate} from './primary-proof-storage-candidate.mjs';
const enc=new TextEncoder(),hash=s=>proofBytesHash(enc.encode(s));
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&[null,Object.prototype].includes(Object.getPrototypeOf(v));
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const count=v=>Number.isSafeInteger(v)&&v>=0;
function cell(value){
 if(value===null)return ['null',null];
 if(typeof value==='string')return ['string',value];
 if(typeof value==='number'&&Number.isFinite(value))return ['number',Object.is(value,-0)?'-0':String(value)];
 throw Error('CANDIDATE_NATIVE_SCALAR_REQUIRED');
}
function fields(row){
 if(!plain(row))throw Error('CANDIDATE_PLAIN_ROW_REQUIRED');
 const keys=Object.keys(row).sort();if(!keys.length||keys.length>95)throw Error('CANDIDATE_ROW_COLUMN_BOUND');
 return keys.map(key=>{const d=Object.getOwnPropertyDescriptor(row,key);if(!Object.hasOwn(d,'value'))throw Error('CANDIDATE_ROW_ACCESSOR_DENIED');return [key,...cell(d.value)];});
}
const cloneRow=row=>{fields(row);return Object.fromEntries(Object.keys(row).map(key=>[key,row[key]]));};
const rowDigest=row=>hash(JSON.stringify(fields(row)));
const identity=row=>({full_evidence_id:row.full_evidence_id,contract_code:row.contract_code,observed_ts:row.observed_ts});
const expectationBody=e=>({schema:e.schema,identity:e.identity,column:e.column,columns:e.columns,original_row_sha256:e.original_row_sha256,stored_row_sha256:e.stored_row_sha256,raw_proof_sha256:e.raw_proof_sha256,contract_sha256:e.contract_sha256});
async function requireExpectation(e){
 if(!plain(e)||e.schema!=='OFFLINE_PRIMARY_PROOF_READBACK_EXPECTATION_V1'||e.column!==P.column||!plain(e.identity)||!Array.isArray(e.columns)||e.columns.length<4||e.columns.length>95||!hex(e.original_row_sha256)||!hex(e.stored_row_sha256)||!hex(e.raw_proof_sha256)||!hex(e.contract_sha256)||!hex(e.expectation_sha256)||await hash(JSON.stringify(expectationBody(e)))!==e.expectation_sha256)throw Error('INDEPENDENT_PREINSERT_EXPECTATION_REQUIRED');
 const names=e.columns.map(c=>c.name);if(new Set(names).size!==names.length||JSON.stringify(names)!==JSON.stringify([...names].sort())||!names.includes(P.column)||!['full_evidence_id','contract_code','observed_ts'].every(k=>names.includes(k))||e.columns.some(c=>!plain(c)||typeof c.name!=='string'||!['null','number','string'].includes(c.type)||!hex(c.sha256)))throw Error('CANDIDATE_EXPECTATION_COLUMNS_INVALID');
 return e;
}
export async function preparePrimaryProofReadbackCandidate(original,{contract}={}){
 const originalRow=cloneRow(original),raw=originalRow[P.column];
 const encoded=await encodePrimaryProofCandidate(raw,{row:originalRow,contract});
 const storedRow={...originalRow,[P.column]:encoded.stored},columns=[];
 for(const [name,type,value] of fields(originalRow))columns.push({name,type,sha256:await hash(JSON.stringify([type,value]))});
 const body={schema:'OFFLINE_PRIMARY_PROOF_READBACK_EXPECTATION_V1',identity:identity(originalRow),column:P.column,columns,original_row_sha256:await rowDigest(originalRow),stored_row_sha256:await rowDigest(storedRow),raw_proof_sha256:encoded.descriptor.raw_sha256,contract_sha256:encoded.descriptor.contract_sha256};
 const expectation={...body,expectation_sha256:await hash(JSON.stringify(body))};
 return {stored_row:storedRow,expectation,production_enabled:false,activation_authorized:false};
}
export async function restorePrimaryProofCandidateColumn(stored,{expectation,contract,row_identity}={}){
 const e=await requireExpectation(expectation);
 if(JSON.stringify(identity(row_identity||{}))!==JSON.stringify(e.identity))throw Error('CANDIDATE_READ_IDENTITY_MISMATCH');
 if(typeof stored!=='string'||await hash(JSON.stringify(contract))!==e.contract_sha256)throw Error('CANDIDATE_READ_CONTRACT_MISMATCH');
 // An exact legacy raw value is accepted without parsing or reserializing it.
 if(await hash(stored)===e.raw_proof_sha256)return stored;
 return decodePrimaryProofCandidate(stored,{row:e.identity,contract,expected_raw_sha256:e.raw_proof_sha256});
}
export async function restorePrimaryProofCandidateRow(storedRow,{expectation,contract,require_full_row=false}={}){
 const e=await requireExpectation(expectation),actual=fields(storedRow),names=actual.map(([k])=>k),expected=new Map(e.columns.map(c=>[c.name,c]));
 if(!['full_evidence_id','contract_code','observed_ts'].every(k=>Object.hasOwn(storedRow,k))||JSON.stringify(identity(storedRow))!==JSON.stringify(e.identity))throw Error('CANDIDATE_READ_IDENTITY_MISMATCH');
 if(require_full_row&&JSON.stringify(names)!==JSON.stringify(e.columns.map(c=>c.name)))throw Error('CANDIDATE_EXACT_FULL_ROW_REQUIRED');
 const hydrated=cloneRow(storedRow);
 if(Object.hasOwn(hydrated,P.column))hydrated[P.column]=await restorePrimaryProofCandidateColumn(hydrated[P.column],{expectation:e,contract,row_identity:storedRow});
 for(const [name,type,value] of fields(hydrated)){
  const wanted=expected.get(name);if(!wanted||wanted.type!==type||wanted.sha256!==await hash(JSON.stringify([type,value])))throw Error('CANDIDATE_ORIGINAL_COLUMN_MISMATCH');
 }
 if(require_full_row&&await rowDigest(hydrated)!==e.original_row_sha256)throw Error('CANDIDATE_ORIGINAL_FULL_ROW_MISMATCH');
 return hydrated;
}
export async function verifyPrimaryProofCandidateReadback({expectation,contract,insert_result,readback_result,clocks}={}){
 const e=await requireExpectation(expectation),ins=insert_result?.meta,read=readback_result?.meta;
 if(insert_result?.success!==true||ins?.changes!==1||!count(ins.rows_read)||!count(ins.rows_written)||ins.rows_written<1)throw Error('CANDIDATE_EXACT_INSERT_AND_NATIVE_COUNTERS_REQUIRED');
 if(readback_result?.success!==true||!count(read?.rows_read)||read.rows_read<1||read.rows_written!==0||!Array.isArray(readback_result.results)||readback_result.results.length!==1)throw Error('CANDIDATE_EXACT_READBACK_AND_NATIVE_COUNTERS_REQUIRED');
 const keys=['insert_started_ts','insert_completed_ts','readback_started_ts','readback_completed_ts'];
 if(!plain(clocks)||keys.some(k=>!count(clocks[k]))||clocks.insert_started_ts<e.identity.observed_ts||clocks.insert_completed_ts<clocks.insert_started_ts||clocks.readback_started_ts<clocks.insert_completed_ts||clocks.readback_completed_ts<clocks.readback_started_ts)throw Error('CANDIDATE_CAUSAL_READBACK_CLOCKS_REQUIRED');
 const stored=readback_result.results[0];
 if(await rowDigest(stored)!==e.stored_row_sha256)throw Error('CANDIDATE_EXACT_STORED_ROW_MISMATCH');
 const hydrated=await restorePrimaryProofCandidateRow(stored,{expectation:e,contract,require_full_row:true});
 return {schema:'OFFLINE_PRIMARY_PROOF_READBACK_VERIFIED_V1',candidate_readback_verified:true,expectation_sha256:e.expectation_sha256,original_row_sha256:await rowDigest(hydrated),stored_row_sha256:e.stored_row_sha256,columns_verified:e.columns.length,insert_native_usage:{rows_read:ins.rows_read,rows_written:ins.rows_written},readback_native_usage:{rows_read:read.rows_read,rows_written:read.rows_written},clocks:Object.fromEntries(keys.map(k=>[k,clocks[k]])),production_ACK_authorized:false,native_receipt_accepted:false,new_primary_format_enabled:false,activation_authorized:false,additional_native_SQL:0};
}
