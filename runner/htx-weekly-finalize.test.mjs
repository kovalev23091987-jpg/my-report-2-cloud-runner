import test from 'node:test';import assert from 'node:assert/strict';
import {closeWeeklyQualification} from './htx-weekly-finalize.mjs';
test('a missing native finalization still releases only the own lease and retains the original collection failure',async()=>{
 let released=0;const out={sourceHTTP:6,reason:'WEEKLY_CONNECTED_CHECK_failure',source_reservations_reset:false};
 const r=await closeWeeklyQualification(out,{admitted:true,finalize_usage:async()=>{throw Error('CONTROLLED_UNKNOWN_ACK');},usage_snapshot:()=>({rows_read:1,rows_written:1,unknown_ops:0}),whole_summary:()=>({total:6}),has_own_lease:true,release_lease:async()=>{released++;return{status:'OWN_WEEKLY_LEASE_RELEASED'};},now:()=>123});
 assert.equal(released,1);assert.equal(r.exit_code,1);assert.equal(out.reason,'WEEKLY_CONNECTED_CHECK_failure');assert.equal(out.usage_finalization_failed,true);assert.equal(out.completed_ts,123);assert.equal(out.source_reservations_reset,false);assert.equal(out.production_scope_changed,false);
});
test('unknown or excess actual native usage is retained and blocks acceptance',async()=>{
 for(const usage of [{rows_read:4001,rows_written:13,unknown_ops:0},{rows_read:211,rows_written:161,unknown_ops:0},{rows_read:211,rows_written:13,unknown_ops:1}]){
  const out={sourceHTTP:6};const r=await closeWeeklyQualification(out,{admitted:true,finalize_usage:async()=>({status:'FINALIZED'}),usage_snapshot:()=>usage,whole_summary:()=>({total:6})});assert.equal(r.exit_code,1);assert.deepEqual(out.D1,usage);assert.equal(out.status,'WEEKLY_D1_ENVELOPE_NOT_CLOSED');
 }
});
test('a failed check produces a failed job, while disabled or foreign-owner preflight spends no source and remains a skipped result',async()=>{
 for(const [out,expected] of [[{sourceHTTP:6,reason:'CHECK_FAILED'},1],[{sourceHTTP:0,reason:'OWNER_OR_FENCE_BUSY'},0],[{sourceHTTP:0,reason:'ACTIONS_QUALIFIED_PROPOSAL_PERMISSION_REQUIRED'},0]]){const r=await closeWeeklyQualification(out,{whole_summary:()=>({total:out.sourceHTTP})});assert.equal(r.exit_code,expected);}
});
test('failed or foreign-owner release is never reported as an own confirmed release',async()=>{
 for(const release of [async()=>{throw Error('NETWORK');},async()=>({status:'FOREIGN_OWNER_NOT_RELEASED'})]){const out={sourceHTTP:6};const r=await closeWeeklyQualification(out,{whole_summary:()=>({total:6}),has_own_lease:true,release_lease:release});assert.equal(r.exit_code,1);assert.equal(out.own_lease_release_not_confirmed,true);}
});
