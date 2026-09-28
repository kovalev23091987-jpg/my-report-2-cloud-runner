import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const runtime=path.resolve(process.argv[2]||'runtime');
const {loadProspectiveFactualPathForTest}=await import(`${pathToFileURL(path.join(runtime,'r8-20-prospective-validation-sidecar.mjs')).href}?batch-history-test=${Date.now()}`);

class Statement{
  constructor(db,sql,args=[]){this.db=db;this.sql=sql;this.args=args;}
  bind(...args){return new Statement(this.db,this.sql,args);}
  async all(){return this.db.all(this.sql,this.args);}
}

let fallbackQueried=false;
const db={
  prepare(sql){return new Statement(this,sql);},
  async all(sql){
    if(sql.includes('report2_market_snapshot_batch_v1'))return{results:[
      {snapshot_bucket:1_000_000,received_ts:1_000_100,observed_ts:1_000_000,price:100},
      {snapshot_bucket:1_300_000,received_ts:1_300_100,observed_ts:1_300_000,price:106},
    ]};
    fallbackQueried=true;return{results:[]};
  },
};
const result=await loadProspectiveFactualPathForTest(db,{contract:'QNT-USDT',startTs:1_000_000,endTs:1_300_000});
assert.equal(result.status,'CLOSED');
assert.equal(result.history_source,'REPORT2_MARKET_SNAPSHOT_BATCH_V1');
assert.deepEqual(result.points.map(row=>row.price),[100,106]);
assert.equal(fallbackQueried,false);
console.log(JSON.stringify({status:'PROSPECTIVE_PUBLIC_HISTORY_PASS',history_source:result.history_source,points:result.points.length}));
