import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LIQ_NATIVE_HTTP_ALLOCATION,LIQ_SHARED_HTTP_CAP,COINBOSS_RECENT_NUMERIC,SWOLE_CATALOG_ROUTE,liquidationModelOrder,liquidationSupplementAllowance} from '../files/src/liquidation-source-http-plan.mjs';
import {normalizeSwolechartsLiquidationLevels,collectSwolechartsLiquidationLevels} from '../files/src/swolecharts-liquidation-levels.mjs';
import {buildPumpLiquidationZones} from '../files/src/pump-liquidation-zones.mjs';
import {selectLiquidationDisplayZones,displayFutureLiquidations,displayBriefTelegramLiquidations} from '../files/src/canonical-display.mjs';

const runner=readFileSync('current-generation/files/runner-main.mjs','utf8');
const worker=readFileSync('current-generation/files/src/worker.js','utf8');
const research=JSON.parse(readFileSync('checkpoints/source-inputs/swolecharts-liq-levels-bounded-20261013.json','utf8'));
const sample=coin=>research.rows.find(row=>row.coin===coin)?.raw;

const allowance=({native=4,coinboss=0,swole=0,orderly=0,candidate=native,source='SWOLE'}={})=>liquidationSupplementAllowance({source,native_http:native,coinboss_http:coinboss,swole_http:swole,orderly_http:orderly,candidate_http:candidate});

test('source order uses exact numeric evidence before catalog-only routes',()=>{
 assert.equal(COINBOSS_RECENT_NUMERIC.size,56);
 assert.equal(SWOLE_CATALOG_ROUTE.size,40);
 assert.deepEqual(liquidationModelOrder('FIL-USDT'),['SWOLE','COINBOSS']);
 assert.deepEqual(liquidationModelOrder('STRK-USDT'),['SWOLE','COINBOSS']);
 assert.deepEqual(liquidationModelOrder('ADA-USDT'),['COINBOSS','SWOLE']);
 assert.deepEqual(liquidationModelOrder('GRAM-USDT'),['SWOLE','COINBOSS']);
 assert.deepEqual(liquidationModelOrder('BTR-USDT'),['COINBOSS']);
 assert.deepEqual(liquidationModelOrder('BTC-USDT'),[]);
});

test('actual scheduled wrappers reserve one model opportunity within the unchanged five call cap',()=>{
 assert.equal(LIQ_SHARED_HTTP_CAP,5);assert.equal(LIQ_NATIVE_HTTP_ALLOCATION,4);
 assert.match(runner,/candidate_slots:env\.REPORT2_DEEP_RUNTIME_OPTIONS\?\.max_per_run\|\|1,[^\n]*max_http_per_run:LIQ_NATIVE_HTTP_ALLOCATION/);
 assert.ok(worker.indexOf('for(const source of modelOrder)')<worker.indexOf('REPORT2_ORDERLY_PUBLIC_POSITIONS_COLLECT(sourceParams())'));
 assert.equal(allowance({native:4}),1);
 assert.equal(allowance({native:4,swole:1,source:'ORDERLY',candidate:5}),0);
 assert.equal(allowance({native:3,coinboss:1,source:'ORDERLY',candidate:4}),1);
 assert.equal(allowance({native:5}),0);
 assert.equal(allowance({native:3,swole:1,coinboss:1,source:'ORDERLY',candidate:5}),0);
 assert.match(runner,/futureHttpByContract\.set\(params\.contract,perCandidate\+result\.network_calls\)/);
});

test('saved FIL and STRK payloads yield provider supplied levels on both sides, never factual positions',()=>{
 for(const coin of ['FIL','STRK']){
  const raw=sample(coin),contract=`${coin}-USDT`,observed=raw.as_of+1000;
  const result=normalizeSwolechartsLiquidationLevels(raw,{contract,reference_price:raw.price,observed_ts:observed});
  assert.equal(result.status,'CLOSED');assert.equal(result.scenarios.length,20);
  assert.equal(result.independent_primary_source,false);
  assert.ok(result.scenarios.every(row=>row.scenario_only&&row.estimated&&row.decision_target_eligible===false));
  const view=buildPumpLiquidationZones({contract,current_price:raw.price,observed_ts:observed,external_calculated_scenarios:result.scenarios});
  assert.equal(view.future_levels_status,'CALCULATED_SCENARIOS_ONLY');
  assert.ok(selectLiquidationDisplayZones(view,'ABOVE',{policy:'ORIGINAL'}).length>0);
  assert.ok(selectLiquidationDisplayZones(view,'BELOW',{policy:'ORIGINAL'}).length>0);
  assert.ok(view.calculated_scenarios.every(row=>row.notional===null&&row.exact_amount_available===false));
  const manual=displayFutureLiquidations(view,{compact:false,policy:'ORIGINAL'}).join('\n');
  const telegram=displayBriefTelegramLiquidations(view,value=>String(value),{policy:'ORIGINAL'}).join('\n');
  assert.match(manual,/Swolecharts https:\/\/swolecharts\.com/);
  assert.match(manual,/расчётный уровень/);
  assert.match(telegram,/расчётный/);
 }
});

test('Swolecharts rejects stale, wrong coin, wrong reference and no-data payloads',()=>{
 const raw=sample('FIL'),input={contract:'FIL-USDT',reference_price:raw.price,observed_ts:raw.as_of+1000};
 assert.equal(normalizeSwolechartsLiquidationLevels(raw,{...input,observed_ts:raw.as_of+300001}).status,'SOURCE_CLOCK_NOT_CURRENT');
 assert.equal(normalizeSwolechartsLiquidationLevels({...raw,coin:'ETH'},input).status,'IDENTITY_OR_MODEL_NOT_CLOSED');
 assert.equal(normalizeSwolechartsLiquidationLevels(raw,{...input,reference_price:raw.price*1.2}).status,'PRICE_NOT_CLOSED');
 assert.equal(normalizeSwolechartsLiquidationLevels({...raw,has_data:false},input).status,'IDENTITY_OR_MODEL_NOT_CLOSED');
 assert.equal(normalizeSwolechartsLiquidationLevels(raw,{...input,contract:'BTC-USDT'}).status,'EXCLUDED_BY_USER_POLICY');
});

test('collector makes one admitted exact request and skips noncatalog assets',async()=>{
 const raw=sample('STRK');let calls=0,admits=0;
 const result=await collectSwolechartsLiquidationLevels({contract:'STRK-USDT',reference_price:raw.price,run_id:'saved-replay',fetch_impl:async url=>{calls++;assert.equal(url,'https://swolecharts.com/api/liquidation-levels/STRK');return{ok:true,status:200,text:async()=>JSON.stringify(raw)};},request_admit:()=>{admits++;return{allowed:true,duplicate:false}}});
 // The archived sample's source clock may expire; the HTTP accounting remains exact.
 assert.equal(result.network_calls,1);assert.equal(calls,1);assert.equal(admits,1);
 const absent=await collectSwolechartsLiquidationLevels({contract:'BTR-USDT',reference_price:1,run_id:'saved-replay',fetch_impl:async()=>{throw Error('must not fetch')}});
 assert.equal(absent.status,'EXACT_ROUTE_UNVERIFIED');assert.equal(absent.network_calls,0);
});
