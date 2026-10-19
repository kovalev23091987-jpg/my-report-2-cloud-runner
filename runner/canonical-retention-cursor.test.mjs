import test from 'node:test';import assert from 'node:assert/strict';
import {selectCanonicalRetentionCursor,persistCanonicalRetentionCursor} from './canonical-retention-cursor.mjs';
import {gitFixture,NOW as now,HEAD as H,DB} from './fixtures/github-four-mirror-git-fixture.mjs';
const NEXT='b'.repeat(40);
function fixture(change={}){const f=gitFixture({owned:true,...change}),owner=f.lease.owner;
 const outcome={execute:true,status:'NO_ELIGIBLE_ROWS_IN_BOUNDED_WINDOW',bounded_discovery:{next_cursor:128},finalized_usage:{status:'FINALIZED',unknown_ops:0},D1:{rows_read:150,rows_written:2,unknown_ops:0}};
 return{...f,control:f.control,calls:f.calls,outcome,run:extra=>persistCanonicalRetentionCursor(f.control,{expected_main:H,owner,selection:selectCanonicalRetentionCursor('auto',f.active.canonical_retention_cursor),outcome,run_id:'100',now,...extra}),saved:()=>f.at()[0]};
}
test('auto resumes the exact durable cursor, wraps to zero, and never promotes manual override',async()=>{
 const prior={schema:'PROTECTED_CANONICAL_CURSOR_V1',database_id:DB,cursor:128};assert.equal(selectCanonicalRetentionCursor('auto',prior).cursor,128);
 for(const row of [{...prior,database_id:'foreign'},{...prior,cursor:-1},{...prior,schema:'other'}])assert.throws(()=>selectCanonicalRetentionCursor('auto',row));
 for(const input of ['-1','1.1','01','NaN','9007199254740992'])assert.throws(()=>selectCanonicalRetentionCursor(input));
 const f=fixture(),r=await f.run({selection:selectCanonicalRetentionCursor('256',prior)});assert.equal(r.status,'MANUAL_CURSOR_OVERRIDE_NOT_PROMOTED');assert.equal(f.calls.length,0);
});
test('an admitted closed empty window saves exact phase continuation while preserving lease and other raw root values',async()=>{
 const f=fixture(),r=await f.run();assert.equal(r.status,'CANONICAL_CURSOR_EXACT_FOUR_MIRROR_CAS_VERIFIED');assert.equal(r.cursor,128);assert.equal(f.calls.length,5);assert.equal(f.calls.filter(c=>c.path.endsWith('/git/trees')).length,1);assert(f.saved().includes('"history" : { "padding" : "preserve whitespace" }'));assert.deepEqual(JSON.parse(f.saved()).lease,f.phase.lease);assert.equal(JSON.parse(f.saved()).active_working_state.canonical_retention_cursor.run_id,'100');assert.equal(r.quotas_reset,false);
});
test('unknown cost, unfinalized, partial/refused and preparation results cannot advance metadata or consume calls',async()=>{
 for(const change of [{D1:{unknown_ops:1}},{D1:{rows_read:5001,rows_written:1,unknown_ops:0}},{D1:{rows_read:10,rows_written:401,unknown_ops:0}},{D1:{unknown_ops:0}},{execute:false},{status:'CANONICAL_COMPACTION_PARTIAL_OR_REFUSED_ORIGINALS_PRESERVED'},{finalized_usage:{status:'NOT_ACKNOWLEDGED'}}]){
  const f=fixture();Object.assign(f.outcome,change);assert.equal((await f.run()).status,'CURSOR_NOT_ADVANCED_UNCLOSED_NATIVE_RESULT');assert.equal(f.calls.length,0);
 }
});
test('foreign owner, expired lease, newer cursor and moved main stop before mutation',async()=>{
 for(const kind of ['FOREIGN','EXPIRED','CURSOR','MAIN']){
  const f=fixture(kind==='EXPIRED'?{phase_changes:{lease:{owner:'foreign',expires_ts:now-1}}}:{});
  const extra=kind==='FOREIGN'?{owner:'foreign'}:kind==='MAIN'?{expected_main:NEXT}:kind==='CURSOR'?{selection:{cursor:0,previous_cursor:256,explicit_override:false}}:{};
  await assert.rejects(f.run(extra));assert(!f.calls.some(c=>c.path.endsWith('/git/trees')));
 }
});
