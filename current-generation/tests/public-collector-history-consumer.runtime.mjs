import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const runtime=path.resolve(process.argv[2]||'runtime');
const {loadStage0HistoryTargetsForTest,htxStage0HistoryForTest}=await import(`${pathToFileURL(path.join(runtime,'src/worker.js')).href}?history-test=${Date.now()}`);
const GENERATION='MY_REPORT_2_CURRENT_20260928_CANONICAL_RUNTIME_V11_20M';
const sha=value=>createHash('sha256').update(value).digest('hex');

class Statement{
  constructor(db,sql,args=[]){this.db=db;this.sql=sql;this.args=args;}
  bind(...args){return new Statement(this.db,this.sql,args);}
  all(){return this.db.all(this.sql,this.args);}
}
class HistoryDb{
  constructor(now){this.now=now;this.rows=[];for(let i=71;i>=0;i--){const bucket=now-i*5*60000,payload=JSON.stringify([{contract:'QNT-USDT',price:100+i/100,turnover_24h_usdt:1e6,oi_contracts:10,oi_value_usdt:1e3,funding_rate:.001,funding_interval_hours:8,observed_ts:bucket,source_status:'CLOSED'}]);this.rows.push({bucket,actor:'HUB_PUBLIC_COLLECTOR',generation:GENERATION,schema_version:'report2-market-snapshot-batch-v1',shard:0,source_timestamps_json:JSON.stringify({expected_shards:1,universe_total:1,market:bucket}),received_ts:bucket,status:'COMPLETE',payload_hash:sha(payload),payload,contract_count:1,payload_bytes:Buffer.byteLength(payload)});}}
  prepare(sql){return new Statement(this,sql);}
  async all(sql,args){
    if(!sql.includes('report2_market_snapshot_batch_v1'))return{results:[]};
    if(sql.includes('LIMIT ?6')){const [,start,end,cursorBucket,cursorShard,limit]=args;return{results:this.rows.filter(row=>row.bucket>=start&&row.bucket<=end&&(row.bucket>cursorBucket||(row.bucket===cursorBucket&&row.shard>cursorShard))).slice(0,limit)};}
    const [, ,start,end,target]=args,candidates=this.rows.filter(row=>row.bucket>=start&&row.bucket<=end).sort((a,b)=>Math.abs(a.bucket-target)-Math.abs(b.bucket-target));
    return{results:candidates.length?this.rows.filter(row=>row.bucket===candidates[0].bucket):[]};
  }
  async batch(statements){return Promise.all(statements.map(statement=>this.all(statement.sql,statement.args)));}
}

const now=Date.UTC(2026,8,28,12,0),db=new HistoryDb(now),env={DATA_DB:db,REPORT2_CURRENT_GENERATION:'MY_REPORT_2_CURRENT_20260929_CURRENT_CYCLE_V13_20M'};
const targets=await loadStage0HistoryTargetsForTest(env,now);
assert.equal(targets.populated,true);
assert.equal(targets.preferred_source,'REPORT2_MARKET_SNAPSHOT_BATCH_V1');
for(const label of ['5m','15m','1h','4h'])assert.equal(targets.targets[label].get('QNT-USDT')?.history_provenance,'REPORT2_MARKET_SNAPSHOT_BATCH_V1');

const realNow=Date.now;Date.now=()=>now;
try{
 const deep=await htxStage0HistoryForTest({contract:'QNT-USDT',hours:6},env);
 assert.equal(deep.status,'CLOSED');
 assert.equal(deep.source,'REPORT2_MARKET_SNAPSHOT_BATCH_V1');
 assert.equal(deep.series.length,72);
 assert.equal(deep.coverage.complete_5m_window,true);
 assert.deepEqual(deep.provenance.generations,[GENERATION]);
}finally{Date.now=realNow;}
console.log(JSON.stringify({status:'PUBLIC_COLLECTOR_HISTORY_CONSUMER_PASS',preselection_and_deep_share_reader:true,deep_points:72,cross_generation_compatible:true}));
