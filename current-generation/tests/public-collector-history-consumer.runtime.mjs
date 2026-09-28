import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const runtime=path.resolve(process.argv[2]||'runtime');
const {loadStage0HistoryTargetsForTest}=await import(`${pathToFileURL(path.join(runtime,'src/worker.js')).href}?history-test=${Date.now()}`);

class Statement{
  constructor(db,sql,args=[]){this.db=db;this.sql=sql;this.args=args;}
  bind(...args){return new Statement(this.db,this.sql,args);}
}
class HistoryDb{
  constructor({offset_by_label={}}={}){this.offset_by_label=offset_by_label;}
  prepare(sql){return new Statement(this,sql);}
  async batch(statements){
    return statements.map(statement=>{
      if(statement.sql.includes('report2_market_snapshot_batch_v1')){
        const target=Number(statement.args[4]),minutes=Math.round((this.now-target)/60000),label=minutes===5?'5m':minutes===15?'15m':minutes===60?'1h':minutes===240?'4h':'24h',actual=target+Number(this.offset_by_label[label]||0);
        const payload=JSON.stringify([{contract:'QNT-USDT',price:100,turnover_24h_usdt:1e6,oi_contracts:10,oi_value_usdt:1e3,funding_rate:.001,funding_interval_hours:8,observed_ts:actual,source_status:'CLOSED'}]);
        return{results:[{bucket:target,shard:0,source_timestamps_json:JSON.stringify({expected_shards:1,universe_total:1,market:actual}),received_ts:actual,status:'COMPLETE',payload}]};
      }
      return{results:[]};
    });
  }
}

const now=Date.UTC(2026,8,28,12,0),minutes={"5m":5,"15m":15,"1h":60,"4h":240,"24h":1440};
{
  const db=new HistoryDb();db.now=now;
  const result=await loadStage0HistoryTargetsForTest({DATA_DB:db,REPORT2_CURRENT_GENERATION:'MY_REPORT_2_CURRENT_20260928_CANONICAL_RUNTIME_V11_20M'},now);
  assert.equal(result.populated,true);
  assert.equal(result.preferred_source,'REPORT2_MARKET_SNAPSHOT_BATCH_V1');
  for(const label of Object.keys(minutes)){
    const row=result.targets[label].get('QNT-USDT');
    assert.ok(row,`${label} missing`);
    assert.equal(row.history_provenance,'REPORT2_MARKET_SNAPSHOT_BATCH_V1');
    assert.equal(row.ts,now-minutes[label]*60000);
  }
}
{
  const db=new HistoryDb({offset_by_label:{'15m':3*60000}});db.now=now;
  const result=await loadStage0HistoryTargetsForTest({DATA_DB:db,REPORT2_CURRENT_GENERATION:'MY_REPORT_2_CURRENT_20260928_CANONICAL_RUNTIME_V11_20M'},now);
  assert.equal(result.targets['15m'].size,0);
  assert.equal(result.targets['5m'].size,1);
}
console.log(JSON.stringify({status:'PUBLIC_COLLECTOR_HISTORY_CONSUMER_PASS',windows:Object.keys(minutes),outside_short_tolerance_rejected:true}));
