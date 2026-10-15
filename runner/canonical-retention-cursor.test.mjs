import test from 'node:test';import assert from 'node:assert/strict';
import {selectCanonicalRetentionCursor,persistCanonicalRetentionCursor} from './canonical-retention-cursor.mjs';
const H='a'.repeat(40),NEXT='b'.repeat(40),owner='CODEX:ACTIVE105_SOURCE_RELIABILITY:1',now=1000,DB='057a2847-2cc4-4e52-8534-1be1596d21d5';
function fixture(){
 const phase={lease:{owner,expires_ts:2000},latest_own_bounded_continuation_lease:{owner},active_working_state:{owned_lease:owner},history:{padding:'preserve whitespace'}},raw='{\n "history" : { "padding" : "preserve whitespace" },\n "lease":'+JSON.stringify(phase.lease)+',\n "latest_own_bounded_continuation_lease":'+JSON.stringify(phase.latest_own_bounded_continuation_lease)+',\n "active_working_state":'+JSON.stringify(phase.active_working_state)+'\n}\n';
 const calls=[];let saved=null;const control={async call(path,method='GET',body){calls.push({path,method});if(path==='git/ref/heads/main')return{object:{sha:H}};assert.equal(method,'PUT');assert.equal(body.sha,'phase-blob');saved=Buffer.from(body.content,'base64').toString();return{commit:{sha:NEXT}};},async read(path,ref){calls.push({path,ref});if(path.includes('execution-lock'))return{value:{active:false}};return saved?{raw:saved,value:JSON.parse(saved)}:{sha:'phase-blob',raw,value:structuredClone(phase)};}};
 const outcome={execute:true,status:'NO_ELIGIBLE_ROWS_IN_BOUNDED_WINDOW',bounded_discovery:{next_cursor:128},finalized_usage:{status:'FINALIZED',unknown_ops:0},D1:{rows_read:150,rows_written:2,unknown_ops:0}};
 return{phase,raw,control,calls,outcome,run:extra=>persistCanonicalRetentionCursor(control,{expected_main:H,owner,selection:selectCanonicalRetentionCursor(),outcome,run_id:'100',now,...extra}),saved:()=>saved};
}
test('auto resumes the exact durable cursor, wraps to zero, and never promotes manual override',async()=>{
 const prior={schema:'PROTECTED_CANONICAL_CURSOR_V1',database_id:DB,cursor:128};assert.equal(selectCanonicalRetentionCursor('auto',prior).cursor,128);
 for(const row of [{...prior,database_id:'foreign'},{...prior,cursor:-1},{...prior,schema:'other'}])assert.throws(()=>selectCanonicalRetentionCursor('auto',row));
 for(const input of ['-1','1.1','01','NaN','9007199254740992'])assert.throws(()=>selectCanonicalRetentionCursor(input));
 const f=fixture(),r=await f.run({selection:selectCanonicalRetentionCursor('256',prior)});assert.equal(r.status,'MANUAL_CURSOR_OVERRIDE_NOT_PROMOTED');assert.equal(f.calls.length,0);
});
test('an admitted closed empty window saves exact phase continuation while preserving lease and other raw root values',async()=>{
 const f=fixture(),r=await f.run();assert.equal(r.status,'CANONICAL_CURSOR_EXACT_PHASE_CAS_VERIFIED');assert.equal(r.cursor,128);assert.equal(f.calls.length,5);assert.equal(f.calls.filter(c=>c.method==='PUT').length,1);assert(f.saved().includes('"history" : { "padding" : "preserve whitespace" }'));assert.deepEqual(JSON.parse(f.saved()).lease,f.phase.lease);assert.equal(JSON.parse(f.saved()).active_working_state.canonical_retention_cursor.run_id,'100');assert.equal(r.quotas_reset,false);
});
test('unknown cost, unfinalized, partial/refused and preparation results cannot advance metadata or consume calls',async()=>{
 for(const change of [{D1:{unknown_ops:1}},{D1:{rows_read:5001,rows_written:1,unknown_ops:0}},{D1:{rows_read:10,rows_written:401,unknown_ops:0}},{D1:{unknown_ops:0}},{execute:false},{status:'CANONICAL_COMPACTION_PARTIAL_OR_REFUSED_ORIGINALS_PRESERVED'},{finalized_usage:{status:'NOT_ACKNOWLEDGED'}}]){
  const f=fixture();Object.assign(f.outcome,change);assert.equal((await f.run()).status,'CURSOR_NOT_ADVANCED_UNCLOSED_NATIVE_RESULT');assert.equal(f.calls.length,0);
 }
});
test('foreign owner, expired lease, newer cursor and moved main stop before a phase write',async()=>{
 for(const kind of ['FOREIGN','EXPIRED','CURSOR','MAIN']){
  const f=fixture();if(kind==='FOREIGN')f.phase.lease.owner='foreign';if(kind==='EXPIRED')f.phase.lease.expires_ts=999;if(kind==='CURSOR')f.phase.active_working_state.canonical_retention_cursor={schema:'PROTECTED_CANONICAL_CURSOR_V1',database_id:DB,cursor:256};
  await assert.rejects(f.run(kind==='MAIN'?{expected_main:NEXT}:{}));assert(!f.calls.some(c=>c.method==='PUT'));
 }
});
