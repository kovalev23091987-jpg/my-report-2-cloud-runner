import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {recordEvidenceSourceHealth} from '../files/src/evidence-source-store.mjs';
import {classifyEvidenceSourceHealth} from '../files/src/candidate-evidence-v2-runtime.mjs';
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
test('N17 distinguishes quota, access, code failure and invalid content without predictive penalties',async()=>{
 const cases=[
  [{status:'RATE_LIMITED_429',network_calls:1},'PROVIDER_RATE_LIMITED'],
  [{status:'SOURCE_ERROR',network_calls:1,receipts:[{http_status:429}]},'PROVIDER_RATE_LIMITED'],
  [{status:'RATE_LIMITED_429',network_calls:0},'SKIPPED_QUOTA'],
  [{status:'DAILY_CAP_OR_DUPLICATE',network_calls:0},'SKIPPED_QUOTA'],
  [{status:'ACCESS_BLOCKED_403',network_calls:1},'ACCESS_BLOCKED'],
  [{status:'ACCESS_BLOCKED_403',network_calls:0},'SKIPPED_ACCESS_BACKOFF'],
  [{status:'CODE_OR_STORE_ERROR',network_calls:1},'INTERNAL_FAILURE'],
  [{status:'INVALID_RESPONSE',network_calls:1},'INVALID_RESPONSE'],
  [{status:'EXACT_ASSET_IDENTITY_REQUIRED',network_calls:0},'NOT_EVALUATED'],
  [{status:'CLOSED',network_calls:1},'VALID_RESPONSE_NO_EVENT'],
  [{status:'SOURCE_ERROR',network_calls:1,receipts:[{http_status:500}]},'EXTERNAL_FAILURE'],
 ];
 const d=db();let out;
 for(let i=0;i<cases.length;i++){const [r,expected]=cases[i],operational_class=classifyEvidenceSourceHealth(r);assert.equal(operational_class,expected);out=await recordEvidenceSourceHealth(d,{contract:'LINK-USDT',run_id:'CLASS:'+i,now:i,admit:()=>({allowed:true}),observations:[{...row,status:r.status,actual_http:r.network_calls,operational_class}]});if(r.network_calls===0)assert.equal(out.status,'NO_NEW_TRANSPORT_OBSERVATION');}
 const counts=out.observations[0];assert.equal(counts.recent_observations,7);assert.equal(counts.rate_limited_count,2);assert.equal(counts.access_blocked_count,1);assert.equal(counts.internal_failure_count,1);assert.equal(counts.external_failure_count,1);assert.equal(counts.invalid_response_count,1);assert.equal(out.predictive_weight_changed,false);assert.equal(out.quarantine_activated,false);d.sqlite.close();
});
