import test from 'node:test';import assert from 'node:assert/strict';
import {buildPipelineHealth,persistPipelineHealth,renderPipelineHealthMessage,classifyHealthDelivery} from '../src/v3-pipeline-health-runtime.mjs';
class St{constructor(sql,db){this.sql=sql;this.db=db;this.args=[];}bind(...a){this.args=a;return this;}async first(){return this.db.previous;}}
class Db{constructor(previous){this.previous=previous;this.sql=[];}prepare(sql){this.sql.push(sql);return new St(sql,this);}async batch(s){return s.map(()=>({meta:{changes:1}}));}}
test('health degrades on silent live drop and journals one system event',async()=>{
 const h=buildPipelineHealth({stage0_closed:true,discovery_closed:true,eligible_live_count:2,live_deep_check_count:0,live_zero_reason:null});
 assert.equal(h.status,'DEGRADED_PIPELINE');
 const db=new Db({status:'HEALTHY_NO_IDEA',reasons_json:'[]',changed_ts:1,last_checked_ts:1});
 const p=await persistPipelineHealth(db,{health:h,now_ts:100});
 assert.equal(p.status,'CLOSED');assert.equal(p.event.transition,'DEGRADED');
 const msg=renderPipelineHealthMessage({...p.event,reasons:h.reasons});
 assert.equal(msg.ok,true);assert.match(msg.message,/не торговый сигнал/i);
 assert.equal(classifyHealthDelivery({network_result:'TIMEOUT'}),'FAILED_RETRYABLE');
});
test('same health state creates no duplicate event',async()=>{
 const h=buildPipelineHealth({stage0_closed:true,discovery_closed:true,eligible_live_count:0,live_deep_check_count:0});
 const db=new Db({status:'HEALTHY_NO_IDEA',reasons_json:'[]',changed_ts:1,last_checked_ts:1});
 const p=await persistPipelineHealth(db,{health:h,now_ts:200});assert.equal(p.event,null);assert.equal(p.changed,false);
});
