import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {recordEvidenceSourceHealth} from '../files/src/evidence-source-store.mjs';
function db(){const sqlite=new DatabaseSync(':memory:');return{sqlite,prepare(sql){return{args:[],bind(...a){this.args=a;return this;},async run(){return sqlite.prepare(sql).run(...this.args);},async all(){return{results:sqlite.prepare(sql).all(...this.args)};}};},async batch(rows){return Promise.all(rows.map(r=>r.run()));}};}
const row={source_id:'CHAIN_RPC',actual_http:2,status:'CLOSED',operational_class:'VALID_RESPONSE_NO_EVENT',evidence_rows:0,valid_rows:0,decision_usable_rows:0};
test('N17 transport journal is idempotent, market-scoped and does not count empty valid windows as failures',async()=>{
 const d=db(),p={contract:'LINK-USDT',run_id:'A',observations:[row],admit:()=>({allowed:true}),now:1000};
 const a=await recordEvidenceSourceHealth(d,p),b=await recordEvidenceSourceHealth(d,p);assert.equal(a.status,'CLOSED_OPERATIONAL_JOURNAL');assert.equal(b.observations[0].recent_observations,1);assert.equal(b.observations[0].valid_empty_count,1);assert.equal(b.observations[0].external_failure_count,0);
 const c=await recordEvidenceSourceHealth(d,{...p,run_id:'B',now:2000,observations:[{...row,status:'SOURCE_ERROR',operational_class:'EXTERNAL_FAILURE'}]});assert.equal(c.observations[0].recent_observations,2);assert.equal(c.observations[0].external_failure_count,1);assert.equal(c.predictive_weight_changed,false);
 const other=await recordEvidenceSourceHealth(d,{...p,contract:'JUP-USDT'});assert.equal(other.observations[0].recent_observations,1);d.sqlite.close();
});
test('N17 cannot spend missing DB admission or turn cached reuse into a new transport success',async()=>{
 const fail={batch(){throw Error('DB_MUST_NOT_BE_TOUCHED');}};
 assert.equal((await recordEvidenceSourceHealth(fail,{contract:'LINK-USDT',run_id:'R',observations:[row]})).status,'HEALTH_DB_ADMISSION_REQUIRED');
 assert.equal((await recordEvidenceSourceHealth(fail,{observations:[{...row,actual_http:0}]})).status,'NO_NEW_TRANSPORT_OBSERVATION');
 assert.equal((await recordEvidenceSourceHealth(fail,{contract:'LINK-USDT',run_id:'R',observations:[row],admit:()=>({allowed:false,status:'D1_BUDGET_DENIED'})})).status,'D1_BUDGET_DENIED');
});
test('N17 history read is bounded and keeps invalid responses separate from source outages',async()=>{
 const d=db();let out;
 for(let i=0;i<12;i++)out=await recordEvidenceSourceHealth(d,{contract:'LINK-USDT',run_id:String(i),now:i,admit:()=>({allowed:true}),observations:[{...row,operational_class:'INVALID_RESPONSE'}]});
 assert.equal(out.observations[0].recent_observations,10);assert.equal(out.observations[0].invalid_response_count,10);assert.equal(out.observations[0].external_failure_count,0);assert.equal(out.quarantine_activated,false);d.sqlite.close();
});
