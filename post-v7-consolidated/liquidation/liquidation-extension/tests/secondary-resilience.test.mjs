import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {createNativeAcquisition} from '../src/runtime-bridge.mjs';
import {createMultiVenueLiquidationExtension} from '../src/multi-runner-extension.mjs';
const load=n=>JSON.parse(fs.readFileSync(new URL('../evidence/'+n,import.meta.url),'utf8'));
const RAW=load('hl_account_0.raw'),T=RAW.time+1000;
function primary({empty=false,nullPrice=false,stale=false,wrongRun=false}={}){
 const state=structuredClone(RAW);state.time=stale?T-180000:T-100;
 if(nullPrice)for(const x of state.assetPositions)if(x.position.coin==='FIL')x.position.liquidationPx=null;
 const end=stale?T-179000:T-50,start=end-1000;
 return createNativeAcquisition({contract:'FIL-USDT',native_symbol:'FIL',run_id:wrongRun?'OTHER':'R',acquisition_id:'A',collection_started_ts:start,collection_completed_ts:end,
 accounts:empty?[]:[{address:load('hl_account_0.receipt.json').request_body.user,state,http_receipt:{http_status:200,started_ts:start,received_ts:end}}],provenance:{fixture:'CAPTURED_POSITION_SYNTHETIC_TEST_CLOCK'}});
}
const params=(q=65)=>({contract:'FIL-USDT',native_symbol:'FIL',run_id:'R',deep_started_ts:T-1000,max_deep_ms:45000,early_candidate_bridge:true,early_candidate_quality_0_100:q});
const allow=async r=>({allowed:true,new_reservation:true,reservation_id:r.reservation_id});
function service(p,g,admit=allow){return createMultiVenueLiquidationExtension({hyperliquid_extension:{collect:p},gtrade_collector:g,admit,clock:()=>T});}
test('empty primary acquisition is not a reason to suppress useful fallback',async()=>{let calls=0;const s=service(async()=>primary({empty:true}),async()=>{calls++;return{status:'NO_POSITIONS'};});await s.collect(params());assert.equal(calls,1);});
test('primary whose all liquidation prices are unknown still requests admitted fallback',async()=>{let calls=0;const s=service(async()=>primary({nullPrice:true}),async()=>{calls++;return{status:'NO_POSITIONS'};});await s.collect(params());assert.equal(calls,1);});
test('an old primary acquisition cannot count as a fresh usable map for routing',async()=>{let calls=0;await service(async()=>primary({stale:true}),async()=>{calls++;return{status:'NO_POSITIONS'};}).collect(params());assert.equal(calls,1);});
test('primary collector exception does not prevent a separately admitted fallback',async()=>{let calls=0;const s=service(async()=>{throw Error('INJECTED_PRIMARY_ERROR');},async()=>{calls++;return{status:'NO_POSITIONS'};});await assert.doesNotReject(()=>s.collect(params()));assert.equal(calls,1);});
test('secondary exception preserves a good primary acquisition byte-for-byte',async()=>{const p=primary(),saved=JSON.stringify(p);const s=service(async()=>p,async()=>{throw Error('INJECTED_SECONDARY_ERROR');});const r=await s.collect(params(80));assert.equal(JSON.stringify(r.hyperliquid),saved);assert.equal(r.gtrade,null);assert.equal(JSON.stringify(p),saved);});
test('secondary quota callback exception cannot discard already verified primary facts',async()=>{const p=primary();const s=service(async()=>p,async()=>{throw Error('MUST_NOT_CALL');},async()=>{throw Error('INJECTED_ADMISSION_ERROR');});const r=await s.collect(params(80));assert.equal(r.hyperliquid.acquisition_fingerprint,p.acquisition_fingerprint);assert.equal(r.gtrade,null);});
test('valid primary below proactive threshold still avoids unnecessary extra queries',async()=>{let calls=0;const r=await service(async()=>primary(),async()=>{calls++;throw Error('MUST_NOT_CALL');}).collect(params());assert(r.hyperliquid);assert.equal(calls,0);});
test('failed primary does not bypass original minimum early candidate quality',async()=>{let calls=0;await service(async()=>null,async()=>{calls++;return{};}).collect(params(59));assert.equal(calls,0);});
test('raw primary from another run is rejected instead of being called available',async()=>{let calls=0;const r=await service(async()=>primary({wrongRun:true}),async()=>{calls++;return{status:'NO_POSITIONS'};}).collect(params());assert.equal(calls,1);assert.equal(r,null);});
test('malformed secondary acquisition cannot poison a valid primary result',async()=>{const p=primary();const s=service(async()=>p,async()=>({status:'OK',acquisition:{schema:'GTRADE_LIQUIDATION_ACQUISITION_V1',run_id:'OTHER',above:[{native_price:1}]}}));const r=await s.collect(params(80));assert.equal(r.gtrade,null);assert.equal(r.hyperliquid.acquisition_fingerprint,p.acquisition_fingerprint);});
