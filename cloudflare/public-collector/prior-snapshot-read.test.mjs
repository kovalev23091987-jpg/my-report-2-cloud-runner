import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {CURRENT_PRIOR_SNAPSHOT_SQL,LEGACY_PRIOR_SNAPSHOT_SQL,readCollectorPriorRows} from './prior-snapshot-read.mjs';

function fixture(){
 const raw=new DatabaseSync(':memory:');raw.exec(`CREATE TABLE report2_market_snapshot_batch_v1(actor TEXT,generation TEXT,bucket INTEGER,shard INTEGER,schema_version TEXT,status TEXT,source_timestamps_json TEXT,payload TEXT,PRIMARY KEY(actor,generation,bucket,shard));`);
 const put=raw.prepare('INSERT INTO report2_market_snapshot_batch_v1 VALUES(?,?,?,?,?,?,?,?)');
 raw.exec('BEGIN');for(const generation of ['old','current'])for(let bucket=0;bucket<1000;bucket++)for(let shard=0;shard<6;shard++)put.run('HUB',generation,bucket,shard,'report2-market-snapshot-batch-v1','COMPLETE','{"expected_shards":6}',JSON.stringify({bucket,shard,generation}));raw.exec('COMMIT');
 const calls=[];const db={prepare(sql){let args=[];return{bind(...v){args=v;return this;},async all(){calls.push(sql);return{results:raw.prepare(sql).all(...args)};}};}};return{raw,db,calls};
}
test('the warm collector returns the exact original latest current shards with one indexed query',async()=>{
 const {raw,db,calls}=fixture();const prior=raw.prepare(LEGACY_PRIOR_SNAPSHOT_SQL).all('HUB'),actual=await readCollectorPriorRows(db,{actor:'HUB',generation:'current'});
 assert.deepEqual(actual.results,prior.filter(x=>x.generation==='current'));assert.equal(calls.length,1);assert.equal(actual.results.length,6);
 const plan=raw.prepare('EXPLAIN QUERY PLAN '+CURRENT_PRIOR_SNAPSHOT_SQL).all('HUB','current').map(r=>r.detail).join('\n');
 assert.match(plan,/SEARCH .*\(actor=\? AND generation=\?/);assert.doesNotMatch(plan,/USE TEMP B-TREE/);
});
test('first boot retains the exact legacy fallback and empty history remains empty',async()=>{
 const {raw,db,calls}=fixture();const expected=raw.prepare(LEGACY_PRIOR_SNAPSHOT_SQL).all('HUB');
 assert.deepEqual((await readCollectorPriorRows(db,{actor:'HUB',generation:'new'})).results,expected);assert.equal(calls.length,2);
 assert.deepEqual((await readCollectorPriorRows(db,{actor:'OTHER',generation:'new'})).results,[]);
});
test('a failed current query never masquerades as an empty history or silently falls back',async()=>{
 let calls=0;const error=Error('ORIGINAL_READ_FAILURE');await assert.rejects(readCollectorPriorRows({prepare(){calls++;return{bind(){return this;},async all(){throw error;}};}},{actor:'HUB',generation:'current'}),e=>e===error);assert.equal(calls,1);
});
