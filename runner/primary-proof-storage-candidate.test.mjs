import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {PROOF_STORAGE_CANDIDATE as P,proofSqlContract,proofSqlProjection,encodePrimaryProofCandidate,decodePrimaryProofCandidate} from './primary-proof-storage-candidate.mjs';
const sql=fs.readFileSync(new URL('../current-generation/migrations/011_stage392_post_decision_ack_guard.sql',import.meta.url),'utf8');
const contract=proofSqlContract(sql),row={full_evidence_id:'native:龙虾:1',contract_code:'龙虾-USDT',observed_ts:1792150000000};
function fixture(){
 const persistence=id=>({status:'PREPARED_UNACKNOWLEDGED',committed_ts:null,timeline_contract:'DECISION_THEN_EXACT_D1_ACK_V1',immutable:true,verification_method:'D1_IMMUTABLE_RECEIPT',receipt_id:id,content_digest:'0123456789abcdef'});
 const registry={status:'CLOSED',authoritative:true,receipt_id:'source-receipt',persistence:persistence('source-receipt'),rules_version:'causal-lineage-registry-v3-full-envelope'};
 return {mode:'SHADOW_ONLY_NO_EXECUTION',contract_code:row.contract_code,observed_ts:row.observed_ts,full_evidence:{schema_version:'full-evidence-shadow-v1',...row,fixed_decision_weights:{CROSS_EXCHANGE_DERIVATIVES:35,MARKET_STRENGTH_SPOT:30,SMART_MONEY_ONCHAIN:20,SUPPORTING_RISK:15},persistence:persistence('full-receipt'),source_registry:registry},evidence_registry:registry,safety_gate_receipt:{...registry,persistence:persistence('source-receipt')},source_clocks:{original:1792149900000,unknown:null,valid:true,zero:0},opaque_history:Array.from({length:500},(_,i)=>({i,raw:'История 币安人生 '+i,empty:[],missing:null,negative:-2.1})),arbitrary_future_field:{retained:'原始'}};
}
const options={row,contract};
const decode=(stored,encoded,opts={})=>decodePrimaryProofCandidate(stored,{...options,expected_raw_sha256:encoded.descriptor.raw_sha256,...opts});
const mutate=(stored,fn)=>{const j=JSON.parse(stored);fn(j,j[P.marker]);return JSON.stringify(j);};
test('exact whitespace, Unicode, source clocks and unknown future fields survive compression',async()=>{
 const raw=JSON.stringify(fixture(),null,3)+'\n',encoded=await encodePrimaryProofCandidate(raw,options);
 assert.equal(await decode(encoded.stored,encoded),raw);assert.ok(encoded.stored_bytes<encoded.raw_bytes/2);
 assert.equal(encoded.production_enabled,false);assert.equal(encoded.activation_authorized,false);assert.equal(P.production_enabled,false);
});
test('all48 declared native JSON expressions preserve value, type and absent/null distinction',async()=>{
 const original=fixture(),raw=JSON.stringify(original),encoded=await encodePrimaryProofCandidate(raw,options),db=new DatabaseSync(':memory:');
 try{
  for(const r of contract.requests){const q=db.prepare(`SELECT json_${r.operation}(?1,?2) AS v`);assert.deepEqual(q.get(raw,r.path),q.get(encoded.stored,r.path),r.path);}
  const missing=JSON.stringify({...original,full_evidence:{...original.full_evidence,persistence:{...original.full_evidence.persistence,committed_ts:undefined}}});
  const p=proofSqlProjection(missing,contract);assert.equal(Object.hasOwn(p.full_evidence.persistence,'committed_ts'),false);
  assert.equal(Object.hasOwn(proofSqlProjection(raw,contract).full_evidence.persistence,'committed_ts'),true);
 }finally{db.close();}
});
test('unchanged SQLite INSERT guard accepts projected contract and still rejects changed weight',async()=>{
 const raw=JSON.stringify(fixture()),encoded=await encodePrimaryProofCandidate(raw,options),db=new DatabaseSync(':memory:');
 try{
  db.exec('CREATE TABLE full_evidence_shadow_log(full_evidence_id TEXT,contract_code TEXT,observed_ts INTEGER,weight_derivatives INTEGER,weight_market_strength_spot INTEGER,weight_smart_money_onchain INTEGER,weight_supporting_risk INTEGER,stage392_proof_bundle_json TEXT);');for(const part of sql.split('-- report2:statement-break'))db.exec(part);
  const insert=db.prepare('INSERT INTO full_evidence_shadow_log VALUES(?,?,?,?,?,?,?,?)');
  for(const body of [raw,encoded.stored])insert.run(row.full_evidence_id,row.contract_code,row.observed_ts,35,30,20,15,body);
  const bad=mutate(encoded.stored,j=>j.full_evidence.fixed_decision_weights.CROSS_EXCHANGE_DERIVATIVES=34);
  assert.throws(()=>insert.run(row.full_evidence_id,row.contract_code,row.observed_ts,35,30,20,15,bad),/proof contract invalid/);
  await assert.rejects(decode(bad,encoded),/PROOF_SQL_PROJECTION_MISMATCH/);
 }finally{db.close();}
});
test('foreign coin/id/time/column and unknown schema never hydrate a candidate proof',async()=>{
 const encoded=await encodePrimaryProofCandidate(JSON.stringify(fixture()),options);
 for(const [key,value] of [['contract_code','FIL-USDT'],['full_evidence_id','foreign'],['observed_ts',row.observed_ts+1],['column','canonical_json'],['schema','future']])await assert.rejects(decode(mutate(encoded.stored,(_,d)=>d[key]=value),encoded),/PROOF_DESCRIPTOR_OR_IDENTITY_MISMATCH/);
 await assert.rejects(decode(encoded.stored,encoded,{row:{...row,contract_code:'FIL-USDT'}}),/PROOF_DESCRIPTOR_OR_IDENTITY_MISMATCH/);
});
test('corrupt, truncated, noncanonical base64 and altered expected raw hash are rejected',async()=>{
 const encoded=await encodePrimaryProofCandidate(JSON.stringify(fixture()),options);
 for(const change of [d=>d.payload_b64=d.payload_b64.slice(4),d=>d.payload_b64+='\n',d=>d.gzip_sha256='0'.repeat(64),d=>d.raw_bytes++])await assert.rejects(decode(mutate(encoded.stored,(_,d)=>change(d)),encoded));
 await assert.rejects(decode(encoded.stored,encoded,{expected_raw_sha256:'0'.repeat(64)}),/PROOF_DESCRIPTOR_OR_IDENTITY_MISMATCH/);
});
test('stream expansion is bounded by declared bytes and cannot hide a gzip bomb',async()=>{
 const encoded=await encodePrimaryProofCandidate(JSON.stringify(fixture()),options);
 await assert.rejects(decode(mutate(encoded.stored,(_,d)=>d.raw_bytes=10),encoded),/PROOF_STREAM_SIZE_LIMIT/);
 await assert.rejects(decode(mutate(encoded.stored,(_,d)=>d.raw_bytes=P.max_raw_bytes+1),encoded),/PROOF_DESCRIPTOR_OR_IDENTITY_MISMATCH/);
});
test('projection contract change, reserved marker and unbound original fail before use',async()=>{
 const body=fixture(),encoded=await encodePrimaryProofCandidate(JSON.stringify(body),options);
 await assert.rejects(decode(encoded.stored,encoded,{contract:{...contract,requests:contract.requests.slice(1)}}),/PROOF_PROJECTION_CONTRACT_MISMATCH/);
 await assert.rejects(encodePrimaryProofCandidate(JSON.stringify({...body,[P.marker]:{}}),options),/PROOF_ORIGINAL_OBJECT_REQUIRED/);
 await assert.rejects(encodePrimaryProofCandidate(JSON.stringify({...body,contract_code:'FIL-USDT'}),options),/PROOF_ORIGINAL_ROW_IDENTITY_MISMATCH/);
 assert.throws(()=>proofSqlContract(sql.replace("$.mode","$[0]")),/PROOF_PROJECTION_PATH_UNSUPPORTED/);
 assert.throws(()=>proofSqlContract(sql.replace('json_type','other_type')),/PROOF_NATIVE_TRIGGER_CONTRACT_CHANGED/);
});
test('duplicate and escape-equivalent keys cannot change native first-key JSON semantics',async()=>{
 const raw=JSON.stringify(fixture()),duplicate=raw.replace('"mode":','"mode":"INVALID","mode":');
 await assert.rejects(encodePrimaryProofCandidate(duplicate,options),/PROOF_DUPLICATE_JSON_KEY/);
 const escaped=raw.replace('"mode":','"mo\\u0064e":"INVALID","mode":');
 await assert.rejects(encodePrimaryProofCandidate(escaped,options),/PROOF_DUPLICATE_JSON_KEY/);
 const encoded=await encodePrimaryProofCandidate(raw,options);
 await assert.rejects(decode(encoded.stored.replace('"mode":','"mode":"INVALID","mode":'),encoded),/PROOF_DUPLICATE_JSON_KEY/);
});
test('special object names are ordinary data and cannot pollute prototypes',async()=>{
 const raw=JSON.stringify(fixture()).replace('"arbitrary_future_field":','"__proto__":{"polluted":true},"arbitrary_future_field":');
 const encoded=await encodePrimaryProofCandidate(raw,options);assert.equal(await decode(encoded.stored,encoded),raw);assert.equal({}.polluted,undefined);
});
