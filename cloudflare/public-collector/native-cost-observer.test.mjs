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
