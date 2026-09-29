import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readMarketHistoryForContract,readMarketHistoryTargets,HISTORY_COMPATIBILITY} from '../files/src/market-history-reader.mjs';

const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const bytes=value=>Buffer.byteLength(value);
const NOW=1_800_000_000_000,SLOT=300_000,LATEST=Math.floor(NOW/SLOT)*SLOT-SLOT;
function shard(bucket,{generation=HISTORY_COMPATIBILITY.generations[0],badHash=false,contract='QNT-USDT',observedTs=bucket}={}){
 const payload=JSON.stringify([{contract,observed_ts:observedTs,price:100,turnover_24h_usdt:1e6,oi_contracts:10,oi_value_usdt:1000,funding_rate:.001,funding_interval_hours:8,market_age_sec:1,source_status:'CLOSED'}]);
 return{bucket,actor:'HUB_PUBLIC_COLLECTOR',generation,schema_version:HISTORY_COMPATIBILITY.schema_version,shard:0,source_timestamps_json:JSON.stringify({expected_shards:1,universe_total:1}),received_ts:bucket+1,status:'COMPLETE',payload_hash:badHash?'bad':hash(payload),payload,contract_count:1,payload_bytes:bytes(payload)};
}
class Statement{constructor(db,sql,args=[]){this.db=db;this.sql=sql;this.args=args;}bind(...args){return new Statement(this.db,this.sql,args);}async all(){if(this.sql.includes('report2_market_snapshot_batch_v1')){if(this.sql.includes('bucket=(SELECT bucket')){const [,schema,...rest]=this.args,[start,end,target]=rest.slice(-3),generations=rest.slice(0,-3),eligible=this.db.collector.filter(row=>generations.includes(row.generation)&&row.schema_version===schema&&row.status==='COMPLETE'&&row.bucket>=start&&row.bucket<=end),buckets=[...new Set(eligible.map(row=>row.bucket))].sort((a,b)=>Math.abs(a-target)-Math.abs(b-target)||a-b),chosen=buckets[0];return{results:eligible.filter(row=>row.bucket===chosen).sort((a,b)=>b.generation.localeCompare(a.generation)||a.shard-b.shard)};}const [generation,,start,end,cursorBucket,cursorShard,limit]=this.args;const rows=this.db.collector.filter(row=>row.generation===generation&&row.bucket>=start&&row.bucket<=end&&(row.bucket>cursorBucket||(row.bucket===cursorBucket&&row.shard>cursorShard))).sort((a,b)=>a.bucket-b.bucket||a.shard-b.shard).slice(0,limit);return{results:rows};}if(this.sql.includes('FROM scan_runs'))return{results:this.db.scans};return{results:[]};}}
class Db{constructor(collector=[],scans=[]){this.collector=collector;this.scans=scans;}prepare(sql){return new Statement(this,sql);}async batch(statements){return Promise.all(statements.map(row=>row.all()));}}
const makeRows=count=>Array.from({length:count},(_,i)=>shard(LATEST-(count-1-i)*SLOT,{generation:HISTORY_COMPATIBILITY.generations[i%HISTORY_COMPATIBILITY.generations.length]}));

test('K04/K06 collector 72 of 72 closes across explicitly compatible generations',async()=>{
 const out=await readMarketHistoryForContract({db:new Db(makeRows(72)),contract:'QNT-USDT',now_ts:NOW,hours:6,preferred_generation:HISTORY_COMPATIBILITY.generations[1]});
 assert.equal(out.status,'CLOSED');assert.equal(out.coverage.received_points,72);assert.equal(out.coverage.complete_5m_window,true);assert.deepEqual(out.provenance.generations.sort(),[...HISTORY_COMPATIBILITY.generations].sort());
});
test('K05 missing or corrupt collector buckets cannot become a complete window',async()=>{
 const partial=await readMarketHistoryForContract({db:new Db(makeRows(41)),contract:'QNT-USDT',now_ts:NOW,hours:6});assert.equal(partial.status,'PARTIAL');assert.equal(partial.coverage.complete_5m_window,false);
 const corrupt=makeRows(72);corrupt[20]=shard(corrupt[20].bucket,{badHash:true});const bad=await readMarketHistoryForContract({db:new Db(corrupt),contract:'QNT-USDT',now_ts:NOW,hours:6});assert.equal(bad.status,'PARTIAL');assert.equal(bad.coverage.received_points,71);assert.ok(bad.provenance.validation_rejections.some(row=>row.reason==='PAYLOAD_HASH_MISMATCH'));
});
test('K07 twenty-minute fallback remains partial and is never promoted to five-minute coverage',async()=>{
 const payload=JSON.stringify({contracts:[['QNT-USDT',100,1e6,10,1000,.001,8,1,'CLOSED']]});const scans=Array.from({length:18},(_,i)=>({ts:LATEST-i*20*60_000,ts_bucket:LATEST-i*20*60_000,stage0_coverage_pct:100,payload_json:payload}));
 const out=await readMarketHistoryForContract({db:new Db([],scans),contract:'QNT-USDT',now_ts:NOW,hours:6});assert.equal(out.status,'PARTIAL');assert.equal(out.source,'SCAN_RUNS_COMPACT_V2');assert.equal(out.coverage.actual_cadence_minutes,20);assert.equal(out.coverage.complete_5m_window,false);assert.equal(out.coverage.approximate_5m_coverage_pct,null);
});
for(const minute of [0,1,2,3,4])test(`K04 history targets remain aligned at minute phase ${minute}`,async()=>{
 const now=NOW+minute*60_000,offsets=[5,15,60,240,1440].map(value=>value*60_000),rows=offsets.map(offset=>shard(Math.floor((now-offset)/SLOT)*SLOT,{observedTs:now-offset}));
 const out=await readMarketHistoryTargets({db:new Db(rows),now_ts:now});assert.equal(out.available,true);assert.equal(out.snapshots_found,5,JSON.stringify(Object.fromEntries(Object.entries(out.targets).map(([key,value])=>[key,value.size]))));for(const key of ['5m','15m','1h','4h','24h'])assert.equal(out.targets[key].get('QNT-USDT')?.contract_code,'QNT-USDT');
});
test('an incompatible generation cannot displace the nearest compatible snapshot',async()=>{
 const target=NOW-60*60_000,bucket=Math.floor(target/SLOT)*SLOT;
 const compatible=shard(bucket-SLOT,{generation:HISTORY_COMPATIBILITY.generations[1]});
 const unrelated=shard(bucket,{generation:'UNRELATED_GENERATION'});
 const out=await readMarketHistoryTargets({db:new Db([unrelated,compatible]),now_ts:NOW});
 assert.equal(out.targets['1h'].get('QNT-USDT')?.ts_bucket,compatible.bucket);
});
