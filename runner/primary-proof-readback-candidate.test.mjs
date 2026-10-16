import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {proofSqlContract} from './primary-proof-storage-candidate.mjs';
import {preparePrimaryProofReadbackCandidate as prepare,restorePrimaryProofCandidateColumn as column,restorePrimaryProofCandidateRow as restore,verifyPrimaryProofCandidateReadback as verify} from './primary-proof-readback-candidate.mjs';
const contract=proofSqlContract(fs.readFileSync(new URL('../current-generation/migrations/011_stage392_post_decision_ack_guard.sql',import.meta.url),'utf8'));
function source(){const id={full_evidence_id:'CONTROLLED:龙虾:1',contract_code:'龙虾-USDT',observed_ts:1792150000000};return{...id,shadow_id:'shadow',persisted_ts:id.observed_ts+1,zero:0,unknown:null,negative:-2.5,empty:'',stage392_proof_bundle_json:JSON.stringify({...id,full_evidence:{...id},source_clocks:{original:id.observed_ts-100,missing:null},opaque:Array.from({length:100},(_,i)=>['原始',i])},null,2)+'\n'};}
const clone=v=>JSON.parse(JSON.stringify(v));
const reply=(p,changes=1)=>({expectation:p.expectation,contract,insert_result:{success:true,meta:{changes,rows_read:0,rows_written:1}},readback_result:{success:true,meta:{rows_read:1,rows_written:0},results:[p.stored_row]},clocks:{insert_started_ts:1792150000010,insert_completed_ts:1792150000020,readback_started_ts:1792150000021,readback_completed_ts:1792150000030}});
test('full row and partial context projection restore exact scalar types and original proof bytes',async()=>{
 const original=source(),p=await prepare(original,{contract});assert.deepEqual(await restore(p.stored_row,{...p,contract,require_full_row:true}),original);
 const partial=Object.fromEntries(['full_evidence_id','contract_code','observed_ts','persisted_ts','stage392_proof_bundle_json'].map(k=>[k,p.stored_row[k]]));const got=await restore(partial,{...p,contract});assert.equal(got.stage392_proof_bundle_json,original.stage392_proof_bundle_json);assert.equal(Object.keys(got).length,5);assert.equal(p.production_enabled,false);
});
test('scalar proof export needs independent exact row identity and does not reserialize legacy strings',async()=>{
 const row=source(),p=await prepare(row,{contract}),args={...p,contract,row_identity:row};assert.equal(await column(p.stored_row.stage392_proof_bundle_json,args),row.stage392_proof_bundle_json);assert.equal(await column(row.stage392_proof_bundle_json,args),row.stage392_proof_bundle_json);
 await assert.rejects(column(p.stored_row.stage392_proof_bundle_json,{...args,row_identity:{...row,contract_code:'FIL-USDT'}}),/IDENTITY/);await assert.rejects(column(p.stored_row.stage392_proof_bundle_json,{...args,row_identity:null}),/IDENTITY/);
});
test('independent prepared expectation plus exact stored readback verifies candidate only, never production ACK',async()=>{
 const p=await prepare(source(),{contract}),r=await verify(reply(p));assert.equal(r.candidate_readback_verified,true);assert.equal(r.columns_verified,10);assert.equal(r.production_ACK_authorized,false);assert.equal(r.native_receipt_accepted,false);assert.equal(r.new_primary_format_enabled,false);assert.equal(r.additional_native_SQL,0);
});
test('zero duplicate/partial/failed insert acknowledgement never becomes a factual candidate ACK',async()=>{
 const p=await prepare(source(),{contract});for(const mutate of [r=>r.insert_result.meta.changes=0,r=>r.insert_result.meta.changes=2,r=>r.insert_result.success=false,r=>delete r.insert_result.meta.rows_read,r=>r.insert_result.meta.rows_written=0]){const r=reply(p);mutate(r);await assert.rejects(verify(r),/INSERT/);}
});
test('missing/duplicate/partial/failed readbacks and unmeasured costs cannot verify',async()=>{
 const p=await prepare(source(),{contract});for(const mutate of [r=>r.readback_result.results=[],r=>r.readback_result.results=[p.stored_row,p.stored_row],r=>r.readback_result.success=false,r=>delete r.readback_result.meta.rows_read,r=>r.readback_result.meta.rows_written=1]){const r=reply(p);mutate(r);await assert.rejects(verify(r),/READBACK/);}
});
test('pre-insert/overlapping/backward or missing clocks refuse causal qualification',async()=>{
 const p=await prepare(source(),{contract});for(const mutate of [r=>r.clocks.insert_started_ts=1,r=>r.clocks.insert_completed_ts=r.clocks.insert_started_ts-1,r=>r.clocks.readback_started_ts=r.clocks.insert_completed_ts-1,r=>r.clocks.readback_completed_ts=r.clocks.readback_started_ts-1,r=>delete r.clocks]){const r=reply(p);mutate(r);await assert.rejects(verify(r),/CLOCK/);}
});
test('each non-proof scalar and unknown extra/missing columns remain bound before ACK',async()=>{
 const p=await prepare(source(),{contract});for(const mutate of [row=>row.unknown=0,row=>row.zero='0',row=>row.negative=-3,row=>row.persisted_ts++,row=>row.extra='foreign',row=>delete row.empty]){const r=reply(p);r.readback_result.results=[clone(p.stored_row)];mutate(r.readback_result.results[0]);await assert.rejects(verify(r),/STORED_ROW/);await assert.rejects(restore(r.readback_result.results[0],{...p,contract,require_full_row:true}));}
});
test('wrong original/projection/contract or corrupt compressed payload cannot use a matching id to pass',async()=>{
 const p=await prepare(source(),{contract});for(const mutate of [j=>j.__report2_primary_proof_gzip_v1.payload_b64+='AA',j=>j.__report2_primary_proof_gzip_v1.raw_sha256='0'.repeat(64),j=>j.full_evidence.contract_code='FIL-USDT']){const row=clone(p.stored_row),j=JSON.parse(row.stage392_proof_bundle_json);mutate(j);row.stage392_proof_bundle_json=JSON.stringify(j);await assert.rejects(restore(row,{...p,contract,require_full_row:true}));}
 await assert.rejects(restore(p.stored_row,{...p,contract:{...contract,requests:contract.requests.slice(1)}}),/CONTRACT/);
});
test('mutated or readback-derived expectation cannot replace the independent pre-insert digest',async()=>{
 const row=source(),p=await prepare(row,{contract}),bad=clone(p.expectation);bad.columns[0].sha256='0'.repeat(64);await assert.rejects(restore(p.stored_row,{expectation:bad,contract}),/EXPECTATION/);
 const altered={...row,unknown:0},other=await prepare(altered,{contract}),r=reply(p);r.readback_result.results=[other.stored_row];await assert.rejects(verify(r),/STORED_ROW/);
});
test('unsupported native types and getters cannot hide changed values in a row expectation',async()=>{
 for(const value of [undefined,true,{},[],NaN,Infinity])await assert.rejects(prepare({...source(),extra:value},{contract}),/SCALAR/);
 const row=source();Object.defineProperty(row,'hidden',{enumerable:true,get(){throw Error('getter ran');}});await assert.rejects(prepare(row,{contract}),/ACCESSOR/);
});
test('candidate helpers remain absent from production imports, writers and runtime overlay',()=>{
 const files=['../current-generation/files/src/worker.js','../current-generation/files/src/execution-report-context.mjs','../current-generation/apply-runtime-overlay.mjs','./report2-d1-adapter.mjs','../tools/recover-lossless-retained-history-20261014.mjs'];
 for(const file of files){const source=fs.readFileSync(new URL(file,import.meta.url),'utf8');assert(!/from\s*['"][^'"]*primary-proof-(?:storage|readback)-candidate/.test(source),file);assert(!/copy[^\n]*primary-proof-(?:storage|readback)-candidate/.test(source),file);}
 const worker=fs.readFileSync(new URL('../current-generation/files/src/worker.js',import.meta.url),'utf8');const begin=worker.indexOf('async function persistFullEvidenceShadowRecord('),end=worker.indexOf('async function runStage392FullEvidenceMaintenance(',begin),producer=worker.slice(begin,end);
 assert(producer.includes('env.DATA_DB.batch([insert])'));assert(producer.includes('if (insertChanges !== 1)'));assert(!producer.includes('verifyPrimaryProofCandidateReadback'));assert(!producer.includes('SELECT'));
});
test('one exact insert/read batch uses one existing bridge HTTP transport and preserves full decoded material',async()=>{
 const {DatabaseSync}=await import('node:sqlite'),{RemoteD1Database}=await import('./report2-d1-adapter.mjs'),{compilePrimaryProofBatchCandidate:compile,verifyPrimaryProofCandidateBatchReadback:verifyBatch}=await import('./primary-proof-readback-candidate.mjs');
 const original=source(),prepared=await prepare(original,{contract}),plan=await compile(prepared),sqlite=new DatabaseSync(':memory:');let HTTP=0;
 sqlite.exec('CREATE TABLE full_evidence_shadow_log('+Object.keys(original).map(k=>'"'+k+'" '+(k==='full_evidence_id'?'TEXT PRIMARY KEY':typeof original[k]==='number'?'NUMERIC':'TEXT')).join(',')+')');
 const db=new RemoteD1Database('https://controlled.invalid','CONTROLLED',{fetchImpl:async(_u,o)=>{HTTP++;const request=JSON.parse(o.body);assert.equal(request.op,'batch');assert.equal(request.statements.length,2);sqlite.exec('BEGIN');try{const results=request.statements.map((s,i)=>{const q=sqlite.prepare(s.sql);return i===0?{success:true,results:[],meta:{changes:Number(q.run(...s.params).changes),rows_read:0,rows_written:1}}:{success:true,results:q.all(...s.params).map(r=>({...r})),meta:{rows_read:1,rows_written:0}};});sqlite.exec('COMMIT');return new Response(JSON.stringify({ok:true,result:results,usage:{statements:results.map(r=>({measured:true,rows_read:r.meta.rows_read,rows_written:r.meta.rows_written}))}}));}catch(e){sqlite.exec('ROLLBACK');throw e;}}});
 try{const result=await db.batch(plan.statements.map(s=>db.prepare(s.sql).bind(...s.params))),verified=await verifyBatch({...prepared,contract,plan,batch_result:result,transport_interval:{started_ts:original.observed_ts+10,completed_ts:original.observed_ts+20}});assert.equal(HTTP,1);assert.equal(db.usageSnapshot().requests,2);assert.equal(verified.candidate_readback_verified,true);assert.equal(verified.production_ACK_authorized,false);assert.equal(verified.per_statement_timestamps_invented,false);assert.equal(verified.SQL_statements,2);assert(plan.wire_bytes<plan.max_wire_bytes);}finally{sqlite.close();}
});
test('ordered batch refuses reordered/changed SQL or parameters, wrong result order, unknown costs and unbounded wire',async()=>{
 const {compilePrimaryProofBatchCandidate:compile,verifyPrimaryProofCandidateBatchReadback:verifyBatch}=await import('./primary-proof-readback-candidate.mjs'),p=await prepare(source(),{contract}),plan=await compile(p),r=reply(p),args={...p,contract,plan,batch_result:[r.insert_result,r.readback_result],transport_interval:{started_ts:source().observed_ts+10,completed_ts:source().observed_ts+30}};
 for(const mutate of [x=>x.plan.statements.reverse(),x=>x.plan.statements[1].sql+=' ',x=>x.plan.statements[1].params[0]='foreign',x=>x.batch_result.reverse(),x=>delete x.batch_result[0].meta.rows_read,x=>x.batch_result[0].meta.changes=0,x=>x.transport_interval.completed_ts=0]){const value=clone(args);mutate(value);await assert.rejects(verifyBatch(value));}
 const huge={...source(),evidence_compact_json:'x'.repeat(1_400_000)},prepared=await prepare(huge,{contract});await assert.rejects(compile(prepared),/WIRE_BOUND/);
});
