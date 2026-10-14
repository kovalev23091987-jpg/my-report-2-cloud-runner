import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.env.REPORT2_TEST_RUNTIME?pathToFileURL(path.resolve(process.env.REPORT2_TEST_RUNTIME)+'/src/'):new URL('../files/src/',import.meta.url);
const load=name=>import(new URL(name,root));
const {selectedFinalistSourceCheck,buildCandidateSourceRoutingPlan,nativeLiquidationCollectionMode}=await load('candidate-source-routing.mjs');
const {nativeLiquidationHeadroom}=await load('liquidation-source-http-plan.mjs');
const report=JSON.parse(gunzipSync(fs.readFileSync('checkpoints/active-source-package-natural-38504926420/report2-run-result.json.gz')));
const selection={run_id:report.run_id,contracts:report.candidates.map(c=>c.contract)};

test('actual two selected finalists with native0/4 get source-check priority regardless of provisional interest; entry rules unchanged',()=>{
 assert.equal(report.liquidation_source_acquisition_audit.shared_budget.reserved_http,0);
 for(const c of report.candidates){
  assert.equal(c.canonical.state,'REJECTED');
  assert.equal(selectedFinalistSourceCheck({selection,contract:c.contract,run_id:report.run_id}),true);
  for(const interest of [null,0,30,69]){
   const plan=buildCandidateSourceRoutingPlan({selected_finalist:true,discovery_row:{early_candidate_quality_0_100:interest,move_pct:1},cross_exchange_turn:true});
   assert.equal(plan.reserve_liquidation_lane,true);assert.equal(plan.total_http_envelope,5);
   assert.equal(plan.weights_changed,false);assert.equal(plan.entry_rules_changed,false);
   assert.equal(nativeLiquidationCollectionMode({contract:c.contract,http_cap:4,lane_reserved:plan.selected_finalist_source_check,collector:()=>{}}),'SOURCE_HTTP');
  }
 }
});
test('foreign runs, unselected, malformed pairs and BTC/ETH never acquire the extra selected source priority',()=>{
 for(const patch of [{run_id:'FOREIGN'},{contract:'FIL-USDT'},{selection:{...selection,contracts:[selection.contracts[0]]}},{selection:{...selection,contracts:[selection.contracts[0],selection.contracts[0]]}},{selection:{...selection,contracts:[selection.contracts[0],null]}}])assert.equal(selectedFinalistSourceCheck({selection,contract:selection.contracts[0],run_id:selection.run_id,...patch}),false);
 for(const contract of ['BTC-USDT','ETH-USDT'])assert.equal(selectedFinalistSourceCheck({selection:{run_id:'R',contracts:[contract,'ZEC-USDT']},contract,run_id:'R'}),false);
 assert.equal(buildCandidateSourceRoutingPlan({discovery_row:{early_candidate_quality_0_100:0,move_pct:1},cross_exchange_turn:true}).reserve_liquidation_lane,false);
});
test('external levels retain their slots and native pool fits eight including earlier sources; unknown/partial headroom stays cache-only',()=>{
 for(const external of [0,1,2,3,4])assert.equal(nativeLiquidationHeadroom({native_http:0,total_future_http:external}),4);
 assert.equal(nativeLiquidationHeadroom({native_http:2,total_future_http:6}),2);
 for(const params of [{native_http:0,total_future_http:5},{native_http:2,total_future_http:7},{native_http:4,total_future_http:8},{native_http:0,total_future_http:null},{native_http:2,total_future_http:1},{native_http:5,total_future_http:5}])assert.equal(nativeLiquidationHeadroom(params),0);
});
test('actual worker wiring binds the selected pair and does not make primary-chain discovery prerequisite to native futures checks',()=>{
 const worker=fs.readFileSync(new URL('worker.js',root),'utf8');
 assert.match(worker,/selected_finalist:selectedFinalistSourceCheck\(\{selection:env\?\.REPORT2_LIQUIDATION_SELECTED_CONTRACTS,contract,run_id:/);
 assert.match(worker,/lane_reserved:sourceRoutingPlan.selected_finalist_source_check===true\|\|supplementalCandidateContext\?\.liquidation_lane_reserved/);
});
