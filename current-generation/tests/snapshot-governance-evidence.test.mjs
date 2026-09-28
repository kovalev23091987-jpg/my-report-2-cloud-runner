import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {normalizeSnapshotGovernance,collectSnapshotGovernanceEvidence} from '../files/src/snapshot-governance-evidence.mjs';
import {consumeEvidenceV2} from '../files/src/evidence-v2.mjs';

class Statement{constructor(db,sql,args=[]){this.db=db;this.sql=sql;this.args=args;}bind(...args){return new Statement(this.db,this.sql,args);}async run(){return this.db.sqlite.prepare(this.sql).run(...this.args);}async first(){return this.db.sqlite.prepare(this.sql).get(...this.args)||null;}}
class DB{constructor(){this.sqlite=new DatabaseSync(':memory:');}prepare(sql){return new Statement(this,sql);}async batch(rows){this.sqlite.exec('BEGIN');try{const out=[];for(const row of rows)out.push(await row.run());this.sqlite.exec('COMMIT');return out;}catch(error){this.sqlite.exec('ROLLBACK');throw error;}}}
const NOW=Date.parse('2026-09-28T03:00:00Z'),proposal=(space='abc.eth',end=Math.floor(NOW/1000)+3600)=>({id:'0xproposal',title:'Treasury vote',start:Math.floor(NOW/1000)-3600,end,state:'active',created:Math.floor(NOW/1000)-7200,updated:Math.floor(NOW/1000)-60,choices:['For','Against'],space:{id:space,name:'ABC'}});

test('K16 Snapshot uses only the exact configured space and remains context-only',()=>{
 const out=normalizeSnapshotGovernance({contract:'ABC-USDT',asset_metadata:{snapshot_space:'abc.eth'},payload:{data:{proposals:[proposal()]}},observed_ts:NOW});
 assert.equal(out.status,'CLOSED');assert.equal(out.evidence.length,1);assert.equal(out.evidence[0].block_id,'N13');assert.equal(out.evidence[0].directional_strength,null);assert.equal(out.evidence[0].risk_strength,null);assert.equal(out.evidence[0].vote_result_not_execution,true);assert.equal(consumeEvidenceV2(out.evidence,{base_interest:70,decision_ts:NOW}).adjustment,0);
});
test('K16 Snapshot rejects wrong space, stale rows and empty responses',()=>{
 assert.equal(normalizeSnapshotGovernance({contract:'ABC-USDT',asset_metadata:{snapshot_space:'abc.eth'},payload:{data:{proposals:[proposal('other.eth')]}},observed_ts:NOW}).status,'SNAPSHOT_SPACE_IDENTITY_MISMATCH');
 assert.equal(normalizeSnapshotGovernance({contract:'ABC-USDT',asset_metadata:{snapshot_space:'abc.eth'},payload:{data:{proposals:[proposal('abc.eth',Math.floor(NOW/1000)-2*86400)]}},observed_ts:NOW}).status,'STALE_SOURCE');
 assert.equal(normalizeSnapshotGovernance({contract:'ABC-USDT',asset_metadata:{snapshot_space:'abc.eth'},payload:{data:{proposals:[]}},observed_ts:NOW}).status,'EMPTY');
 assert.equal(normalizeSnapshotGovernance({contract:'ABC-USDT',asset_metadata:{},payload:{data:{proposals:[proposal()]}},observed_ts:NOW}).status,'EXACT_SNAPSHOT_SPACE_REQUIRED');
});
test('K16 Snapshot performs one admitted request, binds variables and caches it',async()=>{
 const db=new DB(),bodies=[];const fetch_impl=async(_url,init)=>{bodies.push(JSON.parse(init.body));return{ok:true,status:200,json:async()=>({data:{proposals:[proposal()]}})};},base={db,fetch_impl,request_admit:()=>({allowed:true,status:'RESERVED'}),contract:'ABC-USDT',run_id:'R',asset_metadata:{snapshot_space:'abc.eth'},now:NOW};
 const first=await collectSnapshotGovernanceEvidence(base),second=await collectSnapshotGovernanceEvidence({...base,run_id:'R2',now:NOW+1});
 assert.equal(first.status,'CLOSED');assert.equal(first.network_calls,1);assert.equal(second.network_calls,0);assert.equal(second.cache_status,'HIT');assert.deepEqual(bodies[0].variables,{spaces:['abc.eth']});assert.equal(bodies.length,1);
});
test('K16 Snapshot fails closed on transport and before admission',async()=>{
 const db=new DB();let calls=0;const denied=await collectSnapshotGovernanceEvidence({db,fetch_impl:async()=>{calls++;throw Error('no');},contract:'ABC-USDT',run_id:'R',asset_metadata:{snapshot_space:'abc.eth'},now:NOW});assert.equal(denied.status,'WHOLE_JOB_HTTP_ADMISSION_REQUIRED');assert.equal(calls,0);
 const failed=await collectSnapshotGovernanceEvidence({db:new DB(),fetch_impl:async()=>({ok:false,status:503,json:async()=>({})}),request_admit:()=>({allowed:true,status:'RESERVED'}),contract:'ABC-USDT',run_id:'R2',asset_metadata:{snapshot_space:'abc.eth'},now:NOW});assert.equal(failed.status,'SOURCE_ERROR');assert.equal(failed.evidence.length,0);
});
