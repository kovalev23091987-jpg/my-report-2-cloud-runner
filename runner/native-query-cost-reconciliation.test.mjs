import test from 'node:test';import assert from 'node:assert/strict';
import {NativeQueryCostJournal} from './native-query-cost-journal.mjs';
import {reconcileNativeQueryCosts} from './native-query-cost-reconciliation.mjs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const {RemoteD1Database}=await import(process.env.REPORT2_TEST_RUNTIME?pathToFileURL(path.resolve(process.env.REPORT2_TEST_RUNTIME,'report2-d1-adapter.mjs')):new URL('./report2-d1-adapter.mjs',import.meta.url));
import {PrivateArchiveD1API} from './private-archive-d1-api.mjs';
const t=Date.UTC(2026,9,16,23,59,59),clock=times=>()=>times.shift();
const bridgeReply=(usage,result=null,status=200)=>new Response(JSON.stringify({ok:status===200,usage,result}),{status});
const measured=(rr,rw)=>({measured:true,rows_read:rr,rows_written:rw});
const native=(rr,rw)=>({success:true,results:[],meta:{rows_read:rr,rows_written:rw}});
const clone=v=>JSON.parse(JSON.stringify(v));
function one({start=t-100,end=t,usage=measured(7,1)}={}){const j=new NativeQueryCostJournal({binding:'D1_BRIDGE',clock:clock([start,end])}),s=j.beginTransport();j.record({operation:'run',sql:'UPDATE alpha SET x=?1',usage,transport:j.endTransport(s)});return j.snapshot();}
test('one qualification matches all binding subtotals without adding nested private usage twice',()=>{
 const j=one(),p=clone(j);p.binding='PRIVATE_ARCHIVE:A1';p.receipts[0].binding=p.binding;p.receipts[0].rows_read=2;p.receipts[0].rows_written=3;
 const out=reconcileNativeQueryCosts({journals:[j,p],usage:{requests:2,rows_read:9,rows_written:4,unknown_ops:0}});
 assert.equal(out.aggregate_usage_matches,true);assert.equal(out.client_day_attribution_closed,true);assert.equal(out.observed_client_UTC_days['2026-10-16'].rows_read,9);assert.equal(out.native_billing_day_verified,false);assert.equal(out.whole_day_closed,false);assert.equal(out.daily_total,null);assert.equal(out.admission_authorized,false);
 const duplicated=reconcileNativeQueryCosts({journals:[j,j],usage:{requests:2,rows_read:14,rows_written:2,unknown_ops:0}});assert(duplicated.issues.includes('MISSING_OR_DUPLICATE_BINDING'));assert.equal(duplicated.client_day_attribution_closed,false);
});
test('a request crossing UTC midnight keeps known costs unallocated rather than assigning its completion day',()=>{
 const j=one({start:t,end:t+2000}),out=reconcileNativeQueryCosts({journals:[j],usage:{requests:1,rows_read:7,rows_written:1,unknown_ops:0}});
 assert.equal(j.receipts[0].client_utc_day,null);assert.equal(out.statement_costs_closed,true);assert.equal(out.client_day_attribution_closed,false);assert.equal(Object.keys(out.observed_client_UTC_days).length,0);assert.equal(out.unallocated_statements[0].reason,'UTC_BOUNDARY_SPANNING');assert.equal(out.known_statement_subtotal.rows_read,7);
});
test('partial native counters remain known individually, unknown never becomes a closed day',()=>{
 const j=one({usage:{measured:false,rows_read:11}}),out=reconcileNativeQueryCosts({journals:[j],usage:{requests:1,rows_read:11,rows_written:0,unknown_ops:1}});
 assert.deepEqual(out.known_statement_subtotal,{requests:1,rows_read:11,rows_written:0,unknown_ops:1});assert.equal(out.aggregate_usage_matches,true);assert.equal(out.statement_costs_closed,false);assert.equal(out.client_day_attribution_closed,false);
});
test('overflow, malformed sequence, conflicting batch clocks, unsafe counters and aggregate mismatch refuse qualification',()=>{
 const j=one();for(const mutate of [x=>x.overflow=true,x=>x.attempted_statements++,x=>x.receipts[0].sequence=2,x=>x.receipts[0].rows_read=-1,x=>x.receipts[0].client_utc_day='2026-10-17']){
  const changed=clone(j);mutate(changed);assert.equal(reconcileNativeQueryCosts({journals:[changed],usage:{requests:1,rows_read:7,rows_written:1,unknown_ops:0}}).client_day_attribution_closed,false);
 }
 const x=clone(j);x.receipts.push({...x.receipts[0],sequence:2,transport_completed_ts:t+1});x.attempted_statements=x.recorded_statements=2;
 assert(reconcileNativeQueryCosts({journals:[x],usage:{requests:2,rows_read:14,rows_written:2,unknown_ops:0}}).issues.includes('INVALID_OR_CONFLICTING_TRANSPORT_CLOCK'));
 const mismatched=reconcileNativeQueryCosts({journals:[j],usage:{requests:1,rows_read:8,rows_written:1,unknown_ops:0}});assert.equal(mismatched.aggregate_usage_matches,false);
});
test('missing historical clocks, rollback and invalid clocks preserve counters without new UTC claims',()=>{
 for(const [start,end] of [[t,t-1],[null,t],[NaN,t]]){const j=one({start,end}),out=reconcileNativeQueryCosts({journals:[j],usage:{requests:1,rows_read:7,rows_written:1,unknown_ops:0}});assert.equal(out.client_day_attribution_closed,false);assert.equal(out.known_statement_subtotal.rows_read,7);}
 const j=one();for(const k of ['transport_sequence','transport_started_ts','transport_completed_ts','transport_clock_closed','client_utc_day'])delete j.receipts[0][k];assert.equal(reconcileNativeQueryCosts({journals:[j],usage:{requests:1,rows_read:7,rows_written:1,unknown_ops:0}}).client_day_attribution_closed,false);
});
test('bridge clocks cover transport and response parsing, excluding local admission and later archive restoration',async()=>{
 let now=t-10000,calls=0;const db=new RemoteD1Database('https://controlled.invalid','CONTROLLED',{nativeQueryReceipts:true,nativeQueryClock:()=>now,beforeRequest:()=>{now=t-100;return{allowed:true};},fetchImpl:async()=>{calls++;now=t-50;return{ok:true,status:200,text:async()=>{now=t;return JSON.stringify({ok:true,usage:measured(3,0),result:null});}};}});
 db._retainedHistory={restore:async r=>{now=t+5000;return r;}};await db.prepare('SELECT * FROM alpha').first();const r=db.nativeQueryCostReceipts().receipts[0];assert.equal(r.transport_started_ts,t-100);assert.equal(r.transport_completed_ts,t);assert.equal(r.client_utc_day,'2026-10-16');assert.equal(calls,1);assert.equal(db.usageSnapshot().requests,1);
});
test('bridge failed multi-statement reply binds every member to one interval with no double charge',async()=>{
 const db=new RemoteD1Database('https://controlled.invalid','CONTROLLED',{nativeQueryReceipts:true,nativeQueryClock:clock([t,t+2000]),fetchImpl:async()=>bridgeReply({statements:[{rows_read:4},{rows_written:2}]},null,500)});
 await assert.rejects(db.batch([db.prepare('SELECT * FROM alpha'),db.prepare('UPDATE beta SET x=1')]));const j=db.nativeQueryCostReceipts(),out=reconcileNativeQueryCosts({journals:[j],usage:db.usageSnapshot()});assert.equal(j.receipts.length,2);assert(j.receipts.every(r=>r.transport_sequence===1&&r.client_utc_day===null));assert.equal(out.known_statement_subtotal.rows_read,4);assert.equal(out.known_statement_subtotal.rows_written,2);assert.equal(out.known_statement_subtotal.unknown_ops,2);assert.equal(out.aggregate_usage_matches,true);
});
test('transport failures and bad JSON keep elapsed bounds while local refusal and explicit private denial remain zero SQL',async()=>{
 for(const fetchImpl of [async()=>{throw new TypeError('controlled');},async()=>new Response('broken',{status:502})]){
  const db=new RemoteD1Database('https://controlled.invalid','CONTROLLED',{nativeQueryReceipts:true,nativeQueryClock:clock([t-100,t]),fetchImpl});await assert.rejects(db.prepare('SELECT 1').first());const j=db.nativeQueryCostReceipts();assert.equal(j.receipts[0].transport_started_ts,t-100);assert.equal(j.receipts[0].transport_completed_ts,t);assert.equal(j.receipts[0].unknown,true);
 }
 let sent=0;const denied=new RemoteD1Database('https://controlled.invalid','CONTROLLED',{nativeQueryReceipts:true,beforeRequest:()=>({allowed:false}),fetchImpl:async()=>{sent++;}});await assert.rejects(denied.prepare('SELECT 1').first());assert.equal(denied.nativeQueryCostReceipts().attempted_statements,0);assert.equal(sent,0);
 const p=new PrivateArchiveD1API({token:'CONTROLLED',nativeQueryReceipts:true,fetch_impl:async()=>new Response('{}',{status:403})});await assert.rejects(p.query('SELECT 1'));assert.equal(p.nativeQueryCostReceipts().attempted_statements,0);
});
test('private short/failed batches and successful replies retain native counts and exact shared interval',async()=>{
 for(const [result,status,expected] of [[[native(2,0),native(3,1)],200,0],[[native(2,0)],200,2],[[native(2,0),native(3,1)],500,2]]){
  const p=new PrivateArchiveD1API({token:'CONTROLLED',nativeQueryReceipts:true,nativeQueryClock:clock([t-100,t]),fetch_impl:async()=>new Response(JSON.stringify({success:status===200,result}),{status})});
  if(expected)await assert.rejects(p.query('SELECT 1; SELECT 1'));else await p.query('SELECT 1; SELECT 1');
  const j=p.nativeQueryCostReceipts(),out=reconcileNativeQueryCosts({journals:[j],usage:p.usageSnapshot()});assert.equal(out.aggregate_usage_matches,true);assert.equal(out.known_statement_subtotal.unknown_ops,expected);assert(j.receipts.every(r=>r.transport_started_ts===t-100&&r.transport_completed_ts===t&&r.transport_sequence===1));
 }
});
test('two concurrent bridge requests use start order and do not deduplicate repeated identical SQL',async()=>{
 let now=t-100,complete=[];const db=new RemoteD1Database('https://controlled.invalid','CONTROLLED',{nativeQueryReceipts:true,nativeQueryClock:()=>now,fetchImpl:()=>new Promise(resolve=>complete.push(resolve))});
 const a=db.prepare('SELECT 1').first();now=t-80;const b=db.prepare('SELECT 1').first();now=t-60;complete[1](bridgeReply(measured(2,0)));await b;now=t-40;complete[0](bridgeReply(measured(3,0)));await a;
 const j=db.nativeQueryCostReceipts();assert.deepEqual(j.receipts.map(r=>r.transport_sequence),[2,1]);assert.equal(reconcileNativeQueryCosts({journals:[j],usage:db.usageSnapshot()}).known_statement_subtotal.rows_read,5);
});
test('exact client SQL hashes distinguish literal whitespace and bind the sent retained rewrite rather than the logical query',async()=>{
 const {createHash}=await import('node:crypto'),hash=s=>createHash('sha256').update(s).digest('hex');
 const j=new NativeQueryCostJournal({binding:'D1_BRIDGE'});for(const sql of ["SELECT 'a b'","SELECT 'a  b'"])j.record({sql,usage:measured(1,0)});
 const rows=j.snapshot().receipts;assert.equal(rows[0].sql_sha256,rows[1].sql_sha256);assert.notEqual(rows[0].wire_sql_sha256,rows[1].wire_sql_sha256);
 let wire;const db=new RemoteD1Database('https://controlled.invalid','CONTROLLED',{nativeQueryReceipts:true,fetchImpl:async(_url,options)=>{wire=JSON.parse(options.body);return bridgeReply(measured(1,0),[]);}});
 db._retainedHistory={restore:async r=>r};const logical='SELECT * FROM full_evidence_shadow_log WHERE contract_code=?1 LIMIT 1';await db.prepare(logical).bind('PRIVATE_VALUE').all();
 const receipt=db.nativeQueryCostReceipts().receipts[0];assert.notEqual(wire.sql,logical);assert.equal(receipt.wire_sql_sha256,hash(wire.sql));assert(!JSON.stringify(receipt).includes('PRIVATE_VALUE'));assert(!JSON.stringify(receipt).includes('SELECT'));
});
test('unsafe sum cannot abort final proof cleanup or become a closed zero-cost qualification',()=>{
 const a=one({usage:measured(Number.MAX_SAFE_INTEGER,0)}),b=clone(a);b.binding='PRIVATE_ARCHIVE:A1';b.receipts[0].binding=b.binding;
 const out=reconcileNativeQueryCosts({journals:[a,b],usage:{requests:2,rows_read:0,rows_written:0,unknown_ops:0}});assert(out.issues.includes('NATIVE_JOURNAL_SUM_OVERFLOW'));assert.equal(out.statement_costs_closed,false);
});
