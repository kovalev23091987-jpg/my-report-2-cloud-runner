import test from 'node:test';
import assert from 'node:assert/strict';
import {observeCollectorD1} from './native-cost-observer.mjs';

test('native first, writes and transactional batches count billed rows, including indexes',async()=>{
 const seen=[];const row={answer:17};
 const binding={prepare(sql){return{bind(...args){seen.push({sql,args});return this;},async all(){return{success:true,results:[row],meta:{rows_read:91,rows_written:0}};},async run(){return{success:true,meta:{changes:1,rows_read:3,rows_written:7}};}};},async batch(statements){return Promise.all(statements.map(s=>s.run()));}};
 const o=observeCollectorD1(binding);assert.equal(await o.db.prepare('SELECT answer').first('answer'),17);
 const ack=await o.db.prepare('UPDATE exact SET value=?1').bind(4).run();assert.equal(ack.meta.changes,1);
 const batch=await o.db.batch([o.db.prepare('INSERT exact').bind('a'),o.db.prepare('DELETE exact').bind('b')]);assert.equal(batch.length,2);
 assert.deepEqual(o.usageSnapshot(),{requests:4,rows_read:100,rows_written:21,unknown_ops:0});assert.deepEqual(seen.map(x=>x.args),[[4],['a'],['b']]);
});

test('missing native metadata remains unknown; original result and error are preserved',async()=>{
 const ack={meta:{changes:1}},error=Error('ORIGINAL_DB_FAILURE');
 const o=observeCollectorD1({prepare(sql){return{bind(){return this;},async run(){if(sql==='FAIL')throw error;return ack;}};},async batch(){return[];}});
 assert.equal(await o.db.prepare('OLD_ACK').run(),ack);await assert.rejects(o.db.prepare('FAIL').run(),e=>e===error);
 assert.deepEqual(o.usageSnapshot(),{requests:2,rows_read:0,rows_written:0,unknown_ops:2});
});

test('a truncated batch is unknown and foreign statements never reach the database',async()=>{
 let calls=0;const o=observeCollectorD1({prepare(){return{bind(){return this;}};},async batch(){calls++;return[{meta:{rows_read:2,rows_written:5}}];}});
 await o.db.batch([o.db.prepare('A'),o.db.prepare('B')]);assert.deepEqual(o.usageSnapshot(),{requests:2,rows_read:2,rows_written:5,unknown_ops:1});
 await assert.rejects(o.db.batch([{}]),/EXACT_NATIVE_BATCH/);assert.equal(calls,1);
});

test('a collector claim failure emits native unknown cost once before provider calls and preserves the original error',async()=>{
 const {readFileSync}=await import('node:fs');const {loadExactCollector}=await import('./github-backup.mjs');const source=readFileSync(new URL('./injected-worker-tail.js',import.meta.url),'utf8');
 const error=Error('EXACT_CLAIM_FAILURE'),logs=[];let sql=0,HTTP=0;
 const db={prepare(){return{async all(){sql++;throw error;},bind(){return this;}};},async batch(){throw Error('UNEXPECTED_BATCH');}};
 const collector=loadExactCollector(source,async()=>{HTTP++;throw Error('NO_SOURCE_CALL_ALLOWED');},{observeCollectorD1});
 const old=console.error;console.error=(...a)=>logs.push(a);try{await assert.rejects(collector({scheduledTime:Date.now()},{DATA_DB:db,PUBLIC_COLLECTOR_ENABLED:'1',ANALYTICS_ENABLED:'0',DELIVERY_ENABLED:'0',CALIBRATION_APPLY_ENABLED:'0',REPORT2_CURRENT_GENERATION:'MY_REPORT_2_CURRENT_20260928_CANONICAL_RUNTIME_V12_CONTRACT_INTEGRITY_20M'}),e=>e===error);}finally{console.error=old;}
 assert.equal(sql,1);assert.equal(HTTP,0);assert.equal(logs.length,1);assert.equal(logs[0][0],'REPORT2_PUBLIC_COLLECTOR_CLAIM_ERROR');const r=JSON.parse(logs[0][1]);assert.equal(r.native_D1.unknown_ops,1);assert.equal(r.native_totals_closed,false);assert.equal(r.native_cost_admission_changed,false);assert.equal(r.source_http,0);
});

test('collector native split subtracts nested private-price source exactly and keeps every unknown operation',async()=>{
 const {readFileSync}=await import('node:fs');const source=readFileSync(new URL('./injected-worker-tail.js',import.meta.url),'utf8');const split=Function('worker_default',source+';return __report2CollectorNativeCostSplit;')({});
 const total={requests:20,rows_read:1000,rows_written:40,unknown_ops:3},before={requests:10,rows_read:500,rows_written:20,unknown_ops:1},after={requests:15,rows_read:700,rows_written:30,unknown_ops:2},r=split(total,before,after,true);
 assert.deepEqual(r.private_price_source_D1,{requests:5,rows_read:200,rows_written:10,unknown_ops:1});assert.deepEqual(r.collector_excluding_private_price_source_D1,{requests:15,rows_read:800,rows_written:30,unknown_ops:2});assert.equal(r.native_totals_closed,false);
 const none=split({...total,unknown_ops:0},null,null,false);assert.equal(none.native_totals_closed,true);assert.equal(none.private_price_source_D1.requests,0);assert.equal(none.collector_excluding_private_price_source_D1.rows_read,1000);
 assert.equal(split(total,after,before,true).collector_excluding_private_price_source_D1,null);assert.equal(split(null,null,null,false).native_D1,null);
});

test('a late collector finalization failure still emits one final invocation receipt with native unknown cost',async()=>{
 const {readFileSync}=await import('node:fs');const {loadExactCollector}=await import('./github-backup.mjs');const source=readFileSync(new URL('./injected-worker-tail.js',import.meta.url),'utf8'),error=Error('EXACT_FINALIZATION_FAILURE'),logs=[];let claim=null,finalizations=0;
 const ack=results=>({success:true,results,meta:{rows_read:2,rows_written:0}}),db={prepare(sql){let args=[];return{bind(...a){args=a;return this;},async all(){if(sql.includes('COUNT(*) AS slots'))return ack([{slots:0,rows_written:0}]);if(sql.includes('FROM report2_public_collector_usage_v1'))return ack(claim?[claim]:[]);if(sql.includes('FROM report2_market_snapshot_batch_v1'))return ack([]);throw Error('UNEXPECTED_SQL');},async run(){if(sql.includes('UPDATE report2_public_collector_usage_v1 SET state=')){finalizations++;throw error;}if(sql.includes('INSERT OR IGNORE INTO report2_public_collector_usage_v1'))claim={state:'STARTED',claim_token:args[3],lease_until:args[4]};return{success:true,meta:{changes:1,rows_read:1,rows_written:3}};}};},async batch(){throw Error('NO_BATCH_EXPECTED');}};
 const collector=loadExactCollector(source,async()=>{throw Error('CONTROLLED_PROVIDER_FAILURE');},{observeCollectorD1}),old=console.log;console.log=(...a)=>logs.push(a);try{await assert.rejects(collector({scheduledTime:Date.now()},{DATA_DB:db,PUBLIC_COLLECTOR_ENABLED:'1',ANALYTICS_ENABLED:'0',DELIVERY_ENABLED:'0',CALIBRATION_APPLY_ENABLED:'0',REPORT2_CURRENT_GENERATION:'MY_REPORT_2_CURRENT_20260928_CANONICAL_RUNTIME_V12_CONTRACT_INTEGRITY_20M'}),e=>e===error);}finally{console.log=old;}
 assert.equal(finalizations,1);const rows=logs.filter(r=>r[0]==='REPORT2_PUBLIC_COLLECTOR_NATIVE_D1');assert.equal(rows.length,1);const r=JSON.parse(rows[0][1]);assert.equal(r.native_D1.unknown_ops,1);assert(r.native_D1.rows_written>0);assert.equal(r.native_totals_closed,false);assert.equal(r.additional_SQL,0);assert.equal(r.private_price_source_D1.requests,0);
});
