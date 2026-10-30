import test from 'node:test';
import assert from 'node:assert/strict';
import {D1Store} from '../../runtime/store.mjs';
const now=Date.parse('2026-10-25T15:10:00Z');
test('large-universe query loop stops before SQL and preserves both finalization statements',async()=>{
  let sql=0;const db={prepare(){sql++;return {bind(){return this;},async all(){return {success:true,results:[],meta:{rows_read:1,rows_written:0}};}};}};
  const store=new D1Store({db,clock:()=>now,admission:{evidence_ref:'ARTIFICIAL_ONLY',expires_ts:now+10000,max_rows_read:1000,max_rows_written:100,max_requests:5},initial_usage:{requests:2,rows_read:0,rows_written:0,unknown_ops:0},finalization_reserve:{requests:2,rows_read:2,rows_written:1}});
  await store.query('ARTIFICIAL');await assert.rejects(store.query('FORBIDDEN'),{code:'NATIVE_SQL_QUERY_COUNT_PROTECTED'});assert.equal(sql,1);assert.equal(store.usage().unknown_ops,0);
  store.beginFinalization();await store.query('FINALIZE');await store.query('READBACK');assert.equal(store.usage().requests,5);assert.equal(sql,3);await assert.rejects(store.query('FORBIDDEN'),{code:'NATIVE_SQL_QUERY_COUNT_PROTECTED'});assert.equal(sql,3);
});
test('caller cannot increase the verified-plan safety bound',()=>{
  for(const max_requests of [801,1000,1,1.5]){const admission={evidence_ref:'ARTIFICIAL_ONLY',expires_ts:now+10000,max_rows_read:100,max_rows_written:100,max_requests};assert.throws(()=>new D1Store({db:{prepare(){}},clock:()=>now,admission}),{code:'BOUNDED_NATIVE_QUERY_COUNT_REQUIRED'});}
});
