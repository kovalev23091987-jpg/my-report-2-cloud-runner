import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const root=process.env.REPORT2_TEST_RUNTIME;
const {RemoteD1Database}=await import(root?pathToFileURL(path.resolve(root,'report2-d1-adapter.mjs')):new URL('../../runner/report2-d1-adapter.mjs',import.meta.url));
const {evaluateWithinRunReservation}=await import('../../runner/d1-preaction-budget-guard.mjs');
const {actorOwnsPeriodicAnalytics}=await import(root?pathToFileURL(path.resolve(root,'src/scheduler-control.mjs')):new URL('../../post-v7-consolidated/final-reconciliation/files/src/scheduler-control.mjs',import.meta.url));
const {enforcePeriodicOwnership}=await import(root?pathToFileURL(path.resolve(root,'src/pre-analysis-failure-receipt.mjs')):new URL('../files/src/pre-analysis-failure-receipt.mjs',import.meta.url));
const dbWith=fetchImpl=>new RemoteD1Database('https://controlled.invalid/d1','CONTROLLED_ONLY',{fetchImpl});
const ok=(result,usage={measured:true,rows_read:1,rows_written:0})=>new Response(JSON.stringify({ok:true,result,usage}));
test('transport, timeout, bad JSON and HTTP rejection retain one unknown attempt',async()=>{
 const cases=[async()=>{throw new TypeError('CONTROLLED_TRANSPORT');},async()=>{throw Object.assign(new Error('CONTROLLED_ABORT'),{name:'AbortError'});},async()=>new Response('not JSON',{status:502}),async()=>new Response(JSON.stringify({ok:false,error:'HTTP_503'}),{status:503})];
 for(const fetchImpl of cases){let calls=0;const db=dbWith(async(...args)=>{calls++;return fetchImpl(...args);});await assert.rejects(db.prepare('SELECT owner FROM v3_scheduler_job_ownership_shadow LIMIT 1').first());const u=db.usageSnapshot();assert.equal(calls,1);assert.equal(u.requests,1);assert.equal(u.unknown_ops,1);assert.equal(u.rows_read,0);assert.equal(u.rows_written,0);assert.equal(u.targets['first:v3_scheduler_job_ownership_shadow'].unknown_ops,1);assert.equal(evaluateWithinRunReservation({reservation:{rows_read:100,rows_written:100},currentUsage:u,extraRowsRead:1,extraRowsWritten:0}).allowed,false);}
});
test('a failed write remains unknown rather than being declared unexecuted',async()=>{
 const db=dbWith(async()=>{throw new TypeError('CONTROLLED_RESPONSE_LOST');});await assert.rejects(db.prepare('UPDATE v3_recheck_task_shadow SET state=?1 WHERE task_id=?2').bind('DONE','CONTROLLED').run());const u=db.usageSnapshot();assert.equal(u.requests,1);assert.equal(u.unknown_ops,1);assert.equal(u.targets['run:v3_recheck_task_shadow'].unknown_ops,1);
});
test('failed batch retains all three potentially executed statements and no invented native rows',async()=>{
 const db=dbWith(async()=>new Response(JSON.stringify({ok:false,error:'HTTP_503'}),{status:503}));await assert.rejects(db.batch([db.prepare('SELECT * FROM alpha'),db.prepare('UPDATE beta SET x=1'),db.prepare('DELETE FROM gamma')]));const u=db.usageSnapshot();assert.equal(u.requests,3);assert.equal(u.unknown_ops,3);assert.equal(u.rows_read,0);assert.equal(u.rows_written,0);assert.equal(Object.keys(u.targets).length,3);
});
test('repeated failed attempts are never deduplicated or refunded',async()=>{
 const db=dbWith(async()=>{throw new TypeError('CONTROLLED_TRANSPORT');});for(let i=0;i<2;i++)await assert.rejects(db.prepare('SELECT * FROM alpha LIMIT 1').first());const u=db.usageSnapshot();assert.equal(u.requests,2);assert.equal(u.unknown_ops,2);
});
test('successful measured reply preserves exact native usage and result',async()=>{
 const db=dbWith(async()=>ok({owner:'GITHUB_ACTIONS'},{measured:true,rows_read:7,rows_written:0}));assert.deepEqual(await db.prepare('SELECT owner FROM alpha').first(),{owner:'GITHUB_ACTIONS'});const u=db.usageSnapshot();assert.equal(u.requests,1);assert.equal(u.rows_read,7);assert.equal(u.rows_written,0);assert.equal(u.unknown_ops,0);
});
test('missing negative fractional and string native counters are unknown, never healthy zero',async()=>{
 for(const usage of [{measured:true},{measured:true,rows_read:-1,rows_written:0},{measured:true,rows_read:0.5,rows_written:0},{measured:true,rows_read:'7',rows_written:0}]){const db=dbWith(async()=>ok(null,usage));await db.prepare('SELECT * FROM alpha LIMIT 1').first();const u=db.usageSnapshot();assert.equal(u.requests,1);assert.equal(u.unknown_ops,1);assert.equal(u.rows_read,0);}
});
test('retained-history restore failure after measured native reply does not charge SQL twice',async()=>{
 const db=dbWith(async()=>ok(null,{measured:true,rows_read:3,rows_written:0}));db._retainedHistory={restore:async()=>{throw Error('CONTROLLED_RESTORE_FAILED');}};await assert.rejects(db.prepare('SELECT * FROM alpha LIMIT 1').first(),/CONTROLLED_RESTORE_FAILED/);const u=db.usageSnapshot();assert.equal(u.requests,1);assert.equal(u.rows_read,3);assert.equal(u.unknown_ops,0);
});
test('actual scheduler consumer keeps failed ownership read and bound pre-analysis refusal',async()=>{
 const db=dbWith(async()=>new Response(JSON.stringify({ok:false,error:'HTTP_503'}),{status:503}));const ownership=await actorOwnsPeriodicAnalytics(db,{actor:'GITHUB_ACTIONS'});assert.equal(ownership.status,'READ_FAILED');assert.equal(ownership.allowed,false);let output;await assert.rejects(enforcePeriodicOwnership({ownership,context:{source_run_id:'37931650060',head:'a'.repeat(40),task_id:'RCHK:'+'b'.repeat(40),trigger_only:true,started_ts:1791549660000,failed_ts:1791549661000},write_result:async r=>{output=r;}}),/READ_FAILED/);assert.equal(output.pre_analysis_failure.read_failure.http_status,503);assert.equal(output.pre_analysis_failure.market_conditions_evaluated,false);assert.equal(output.pre_analysis_failure.entry_authorized,false);assert.equal(db.usageSnapshot().unknown_ops,1);
});
