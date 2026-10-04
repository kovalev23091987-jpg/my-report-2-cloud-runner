import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {normalizeHtxPublicRisk,collectHtxPublicRiskEvidence} from '../files/src/htx-public-risk-evidence.mjs';
import {auditCandidateBlocks} from '../files/src/candidate-evidence-v2-runtime.mjs';
import {createUnifiedHttpBudget} from '../files/src/unified-budget.mjs';
import {consumeEvidenceV2} from '../files/src/evidence-v2.mjs';
import fs from 'node:fs';

class Statement{constructor(db,sql,args=[]){this.db=db;this.sql=sql;this.args=args;}bind(...args){return new Statement(this.db,this.sql,args);}async run(){return this.db.sqlite.prepare(this.sql).run(...this.args);}async first(){return this.db.sqlite.prepare(this.sql).get(...this.args)||null;}}
class DB{constructor(){this.sqlite=new DatabaseSync(':memory:');}prepare(sql){return new Statement(this,sql);}async batch(rows){this.sqlite.exec('BEGIN');try{const out=[];for(const row of rows)out.push(await row.run());this.sqlite.exec('COMMIT');return out;}catch(error){this.sqlite.exec('ROLLBACK');throw error;}}}
const payload=(data,ts=1000)=>({status:'ok',ts,data});

test('K16 HTX risk: explicit opening restriction is adverse risk and never a Short direction vote',()=>{
 const out=normalizeHtxPublicRisk({contract:'SOL-USDT',state_payload:payload([{contract_code:'SOL-USDT',open:0}]),isolated_payload:payload([{contract_code:'SOL-USDT',lever_rate:20}]),cross_payload:payload([]),observed_ts:1100});
 assert.equal(out.status,'CLOSED');assert.equal(out.evidence[0].block_id,'N08');assert.equal(out.evidence[0].directional_strength,null);assert.equal(out.evidence[0].risk_strength,1);
 assert.ok(consumeEvidenceV2(out.evidence,{base_interest:70,decision_ts:1100}).adjustment<0);
});

test('K16 HTX risk: exact official response is cached and consumes only three rate-limited attempts',async()=>{
 const db=new DB(),calls=[];
 const fetch_impl=async url=>{calls.push(url);const body=url.includes('swap_api_state')?payload([{contract_code:'XLM-USDT',open:1}]):payload([{contract_code:'XLM-USDT',lever_rate:20}]);return{ok:true,status:200,json:async()=>body};};
 const params={db,fetch_impl,pause_impl:async()=>{},clock:()=>10_000,request_admit:()=>({allowed:true,status:'RESERVED'}),contract:'XLM-USDT',run_id:'R',now:10_000};
 const first=await collectHtxPublicRiskEvidence(params),second=await collectHtxPublicRiskEvidence({...params,run_id:'R2',now:10_001});
 assert.equal(first.status,'CLOSED');assert.equal(first.network_calls,3);assert.equal(first.evidence[0].risk_strength,null);assert.equal(first.evidence[0].directional_strength,null);
 assert.equal(second.cache_status,'HIT');assert.equal(second.network_calls,0);assert.equal(calls.length,3);
 const usage=db.sqlite.prepare(`SELECT attempts FROM report2_evidence_source_daily WHERE source='HTX_PUBLIC_RISK'`).get();assert.equal(usage.attempts,3);
});

test('K16 HTX risk: transport cannot start without the whole-job HTTP admission',async()=>{
 const db=new DB();let calls=0;
 const out=await collectHtxPublicRiskEvidence({db,fetch_impl:async()=>{calls++;throw new Error('must not fetch');},pause_impl:async()=>{},contract:'XLM-USDT',run_id:'R',now:10_000});
 assert.equal(out.status,'WHOLE_JOB_HTTP_ADMISSION_REQUIRED');assert.equal(out.network_calls,0);assert.equal(calls,0);
});

test('K16 HTX risk: wrong or absent contract state fails closed with zero score effect',()=>{
 const out=normalizeHtxPublicRisk({contract:'SOL-USDT',state_payload:payload([{contract_code:'BTC-USDT',open:0}]),isolated_payload:null,cross_payload:null,observed_ts:1100});
 assert.equal(out.status,'PARTIAL');assert.equal(out.evidence[0].validation_status,'ERROR');assert.equal(consumeEvidenceV2(out.evidence,{base_interest:70,decision_ts:1100}).adjustment,0);
});

test('K16 HTX risk: authoritative runner and worker consume the live candidate evidence path',()=>{
 const runner=fs.readFileSync(new URL('../files/runner-main.mjs',import.meta.url),'utf8');
 const worker=fs.readFileSync(new URL('../files/src/worker.js',import.meta.url),'utf8');
 assert.match(runner,/REPORT2_EVIDENCE_V2_COLLECT=async params=>\{const result=await collectCandidateEvidenceV2/);
 assert.match(runner,/EVIDENCE_SOURCE_HEALTH_RECEIPT/);
 assert.match(worker,/await env\.REPORT2_EVIDENCE_V2_COLLECT/);
 assert.match(worker,/evidence_v2:candidateEvidenceV2\?\.block_coverage\?candidateEvidenceV2/);
 assert.match(worker,/EVIDENCE_V2_CANDIDATE_RECEIPT/);
 assert.doesNotMatch(worker,/EVIDENCE_V2_CANDIDATE_RECEIPT[^\n]+payload_json/);
});

test('HTX risk preserves source time and rejects missing identity or stale source clocks',()=>{
 const good=normalizeHtxPublicRisk({contract:'TAO-USDT',state_payload:payload([{contract_code:'TAO-USDT',open:1}],1000),observed_ts:1100});
 assert.equal(good.evidence[0].source_ts,1000);assert.equal(good.evidence[0].execution_open_allowed,true);
 for(const state_payload of [payload([{open:0}],1000),payload([{contract_code:'TAO-USDT',open:0}],1),payload([{contract_code:'TAO-USDT',open:0}],5000000)]){
  const out=normalizeHtxPublicRisk({contract:'TAO-USDT',state_payload,observed_ts:4000000});
  assert.equal(out.status,'PARTIAL');assert.equal(out.evidence[0].validation_status,'ERROR');
  assert.equal(out.evidence[0].execution_open_allowed,null);
  assert.equal(consumeEvidenceV2(out.evidence,{base_interest:70,decision_ts:4000000}).adjustment,0);
 }
});


test('HTX shared all-contract cache serves the second exact asset without another reservation',async()=>{
 const db=new DB();let calls=0;
 const fetch_impl=async url=>{calls++;assert.equal(new URL(url).searchParams.has('contract_code'),false);return{ok:true,status:200,json:async()=>payload([{contract_code:'TAO-USDT',open:1},{contract_code:'XLM-USDT',open:0}],1000)};};
 const params={db,fetch_impl,pause_impl:async()=>{},clock:()=>1100,request_admit:()=>({allowed:true,status:'RESERVED'}),contract:'TAO-USDT',run_id:'R',now:1100};
 const a=await collectHtxPublicRiskEvidence(params),b=await collectHtxPublicRiskEvidence({...params,contract:'XLM-USDT',run_id:'R2',now:1200});
 assert.equal(a.network_calls,3);assert.equal(b.network_calls,0);assert.equal(b.cache_status,'SHARED_HIT');
 assert.equal(b.evidence[0].htx_contract,'XLM-USDT');assert.equal(b.evidence[0].source_ts,1000);assert.equal(b.evidence[0].risk_strength,1);
 assert.equal(calls,3);assert.equal(db.sqlite.prepare("SELECT attempts FROM report2_evidence_source_daily").get().attempts,3);
 const absent=await collectHtxPublicRiskEvidence({...params,contract:'MISSING-USDT',run_id:'R3',now:1200});
 assert.equal(absent.status,'PARTIAL');assert.equal(absent.network_calls,0);assert.equal(absent.evidence[0].execution_open_allowed,null);
});

test('strict manual two-candidate cycle reuses newly fetched HTX rows with separate exact-market audits',async()=>{
 const db=new DB(),budget=createUnifiedHttpBudget();let calls=0;
 const fetch_impl=async()=>{calls++;return{ok:true,status:200,json:async()=>payload([{contract_code:'FIRST-USDT',open:1},{contract_code:'SECOND-USDT',open:0}],1000)};};
 const params={db,fetch_impl,pause_impl:async()=>{},clock:()=>1100,request_admit:budget.reserve,run_id:'FRESH_MANUAL',now:1100,strict_fresh_manual:true};
 const first=await collectHtxPublicRiskEvidence({...params,contract:'FIRST-USDT'});
 const second=await collectHtxPublicRiskEvidence({...params,contract:'SECOND-USDT',now:1200});
 assert.equal(first.network_calls,3);assert.equal(second.network_calls,0);assert.equal(calls,3);
 assert.equal(budget.summary().total,3);assert.equal(second.cache_status,'CURRENT_RUN_SHARED_HIT');
 assert.equal(second.check_completed,true);assert.equal(second.evidence[0].htx_contract,'SECOND-USDT');
 assert.equal(second.evidence[0].source_ts,1000);assert.equal(second.evidence[0].risk_strength,1);
 assert.equal(first.evidence[0].risk_strength,null);
 const audit=auditCandidateBlocks({sources:{HTX_PUBLIC_RISK:second},evidence:second.evidence,decision_ts:1200,strict_fresh:true});
 assert.equal(audit.blocks.N08.checked,true);assert.equal(audit.blocks.N09.checked,true);
 // A later manual command must fetch again even though the shared TTL is live.
 const third=await collectHtxPublicRiskEvidence({...params,contract:'SECOND-USDT',run_id:'NEW_MANUAL',now:1300});
 assert.equal(third.network_calls,3);assert.equal(calls,6);assert.equal(budget.summary().total,6);
});
test('same-run shared response never borrows another market opening permission',async()=>{
 const db=new DB(),params={db,pause_impl:async()=>{},clock:()=>1100,request_admit:createUnifiedHttpBudget().reserve,run_id:'ONE_RUN',now:1100,strict_fresh_manual:true,fetch_impl:async()=>({ok:true,status:200,json:async()=>payload([{contract_code:'FIRST-USDT',open:1}],1000)})};
 await collectHtxPublicRiskEvidence({...params,contract:'FIRST-USDT'});
 const missing=await collectHtxPublicRiskEvidence({...params,contract:'MISSING-USDT',now:1200});
 assert.equal(missing.status,'PARTIAL');assert.equal(missing.check_completed,false);assert.equal(missing.evidence[0].validation_status,'ERROR');assert.equal(missing.evidence[0].execution_open_allowed,null);
 assert.equal(consumeEvidenceV2(missing.evidence,{base_interest:70,decision_ts:1200}).adjustment,0);
});
