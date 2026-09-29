import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {normalizeHtxPublicRisk,collectHtxPublicRiskEvidence} from '../files/src/htx-public-risk-evidence.mjs';
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
 const params={db,fetch_impl,pause_impl:async()=>{},request_admit:()=>({allowed:true,status:'RESERVED'}),contract:'XLM-USDT',run_id:'R',now:10_000};
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
 assert.match(runner,/REPORT2_EVIDENCE_V2_COLLECT=params=>collectCandidateEvidenceV2/);
 assert.match(worker,/await env\.REPORT2_EVIDENCE_V2_COLLECT/);
 assert.match(worker,/evidence_v2:candidateEvidenceV2\?\.block_coverage\?candidateEvidenceV2/);
 assert.match(worker,/EVIDENCE_V2_CANDIDATE_RECEIPT/);
 assert.doesNotMatch(worker,/EVIDENCE_V2_CANDIDATE_RECEIPT[^\n]+payload_json/);
});
