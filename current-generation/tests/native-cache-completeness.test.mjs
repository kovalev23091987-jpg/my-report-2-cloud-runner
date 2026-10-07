import test from 'node:test';
import assert from 'node:assert/strict';
import {selectVerifiedNativeAccounts} from '../files/src/liquidation-extension/verified-native-account-cache.mjs';
import {createCombinedLiquidationService,acquisitionHasFreshLevels} from '../files/src/liquidation-extension/combined-runner-service.mjs';
import {createWeeklyNativeCoverageSession} from '../../runner/weekly-native-coverage-session.mjs';
import {normalizeNativeHL} from '../files/src/liquidation-extension/providers.mjs';
import {bindNativeAcquisition} from '../files/src/liquidation-extension/runtime-bridge.mjs';
const T=Date.parse('2026-10-07T09:00:00Z'),a='0x'+'1'.repeat(40),b='0x'+'2'.repeat(40);
const position=(coin,{short=false,price=short?'1.3':'.7'}={})=>({position:{coin,szi:short?'-10':'10',positionValue:'10',liquidationPx:price,leverage:{type:'cross',value:2}}});
const state=(address,{missingNear=false}={})=>({time:T,assetPositions:[position('FIL',{short:address===b}),position('NEAR',{short:address===b,price:address===a&&missingNear?null:address===b?'1.3':'.7'})]});
function fixture({denied=false,missingNear=false,invalidSecond=false}={}){
 let now=T;const calls=[],grants=[];
 const service=createCombinedLiquidationService({mode:'SHADOW_ONLY',secondary_enabled:false,candidate_slots:2,accounts_per_deep:3,max_http_per_run:5,clock:()=>now,provider_admit:async r=>{grants.push(r);return r.contract==='NEAR-USDT'&&r.requests.LIQFLOW&&denied?{allowed:false,new_reservation:false,reservation_not_created:true,reason:'FREE_QUOTA_EXHAUSTED'}:{allowed:true,new_reservation:true};},fetch_impl:async(url,init={})=>{
  const body=init.body?JSON.parse(init.body):null;calls.push({url:String(url),body});
  if(body?.type==='metaAndAssetCtxs')return new Response(JSON.stringify([{universe:[{name:'FIL'},{name:'NEAR'}]},[{markPx:'1'},{markPx:'1'}]]));
  if(String(url).includes('liqflow')){const symbol=String(url).includes('/NEAR/')?'NEAR':'FIL';return new Response(JSON.stringify({coin:symbol,positions:[{address:symbol==='FIL'?a:b,size:symbol==='FIL'?10:-10,liq_price:symbol==='FIL'?.7:1.3}]}));}
  const payload=state(body.user,{missingNear});if(invalidSecond&&body.user===b)delete payload.time;return new Response(JSON.stringify(payload));
 }});
 const collect=(symbol,cap=5)=>service.collect({contract:symbol+'-USDT',native_symbol:symbol,run_id:'same',deep_started_ts:now,max_http_for_candidate:cap,allowed_source_ids:['HYPERLIQUID_NATIVE']});
 return{service,calls,grants,collect,advance:ms=>{now+=ms;},clock:()=>now};
}
test('a denied optional discovery cannot erase fresh original native levels or cause another HTTP call',async()=>{
 const f=fixture({denied:true});await f.collect('FIL');const next=await f.collect('NEAR');assert.equal(f.calls.length,3);assert.equal(next.accounts.length,1);assert.equal(next.accounts[0].state.time,T);assert.equal(next.provenance.optional_discovery_status,'UPSTREAM_QUOTA_NOT_GRANTED:FREE_QUOTA_EXHAUSTED');
 assert.equal(acquisitionHasFreshLevels(next,{contract:'NEAR-USDT',run_id:'same',observed_ts:T}),true);assert.equal(f.service.summary().shared_budget.actual_http,3);
});
test('zero remaining candidate capacity still admits an exact fresh cache binding with no reservation or source request',async()=>{
 const f=fixture();await f.collect('FIL');const before=f.grants.length,next=await f.collect('NEAR',0);assert.ok(next);assert.equal(f.calls.length,3);assert.equal(f.grants.length,before);assert.equal(next.provenance.transport_count,0);
 const bound=bindNativeAcquisition(next,{contract:'NEAR-USDT',run_id:'same',snapshot_id:'S:NEAR',observed_ts:T,direction:null});assert.equal(bound.status,'USABLE_NATIVE_SAMPLE');assert.equal(bound.source_ts,T);assert.equal(bound.entry_eligible,false);
});
test('fresh native levels can be reused after the transport deadline, but expire at their original120s clock',async()=>{
 const f=fixture();await f.collect('FIL');f.advance(70000);const before=f.grants.length,next=await f.collect('NEAR',0);assert.ok(next);assert.equal(f.calls.length,3);assert.equal(f.grants.length,before);assert.equal(next.provenance.optional_discovery_status,'OPTIONAL_ENRICHMENT_PHASE_DEADLINE');assert.equal(next.accounts[0].http_receipt.received_ts,T);assert.equal(next.accounts[0].state.time,T);
 const bound=bindNativeAcquisition(next,{contract:'NEAR-USDT',run_id:'same',snapshot_id:'S:NEAR',observed_ts:f.clock(),direction:null});assert.equal(bound.status,'USABLE_NATIVE_SAMPLE');assert.equal(bound.source_ts,T);assert.equal(bound.source_age_ms,70000);assert.equal(bound.entry_eligible,false);
 f.advance(50001);assert.equal(acquisitionHasFreshLevels(next,{contract:'NEAR-USDT',run_id:'same',observed_ts:f.clock()}),false);assert.equal(f.calls.length,3);
});
test('a cached position with null liquidation price cannot suppress discovery of a usable second native account',async()=>{
 const f=fixture({missingNear:true});await f.collect('FIL');const next=await f.collect('NEAR');assert.equal(f.calls.length,5);assert.equal(next.provenance.reused_native_accounts,0);assert.deepEqual(next.accounts.map(x=>x.address),[b]);assert.equal(acquisitionHasFreshLevels(next,{contract:'NEAR-USDT',run_id:'same',observed_ts:T}),true);
});
test('an invalid optional new account cannot poison the already verified original account',async()=>{
 const f=fixture({invalidSecond:true});await f.collect('FIL');const next=await f.collect('NEAR');assert.equal(f.calls.length,5);assert.deepEqual(next.accounts.map(x=>x.address),[a]);assert.deepEqual(next.provenance.excluded_unusable_native_accounts,[b]);assert.equal(acquisitionHasFreshLevels(next,{contract:'NEAR-USDT',run_id:'same',observed_ts:T}),true);
});
test('weekly coverage combines multiple fresh native wallets and rejects an unusable cache hit before spending discovery capacity',async()=>{
 let requests=0;const session=createWeeklyNativeCoverageSession({run_id:'weekly',clock:()=>T,available_requests:()=>20-requests,on_request:()=>requests++,source_admit:async()=>({allowed:true,new_reservation:true}),select_accounts:rows=>({selected:rows}),normalize_native:normalizeNativeHL,read_json:async(url,opts)=>{
  if(String(url).includes('liqflow')){const symbol=String(url).includes('/NEAR/')?'NEAR':'FIL';return{ok:true,payload:{coin:symbol,positions:[{address:symbol==='FIL'?a:b}]},receipt:{received_ts:T}};}
  return{ok:true,payload:state(opts.body.user,{missingNear:true}),receipt:{received_ts:T,sha256:opts.body.user}};
 }});
 await session.collect({contract:'FIL-USDT',symbol:'FIL'});await session.collect({contract:'NEAR-USDT',symbol:'NEAR'});assert.equal(requests,4);
 const combined=await session.collect({contract:'FIL-USDT',symbol:'FIL',allow_discovery:false});assert.equal(combined.reused_accounts,2);assert.equal(combined.network_calls,0);assert.equal(requests,4);assert.equal(combined.receipt.zones.length,2);assert.deepEqual(new Set(combined.receipt.zones.map(z=>z.liquidated_side)),new Set(['LONG','SHORT']));assert.equal(combined.receipt.source_ts,T);assert.equal(combined.receipt.whole_book_coverage_pct,null);
});
test('cache selection isolates malformed duplicate positions, wrong-side prices, unknown clocks and expired clocks without changing valid originals',()=>{
 const valid={address:b,state:state(b),receipt:{received_ts:T}},bad={address:a,state:state(a),receipt:{received_ts:T}};
 for(const mutate of [x=>{x.state.time=undefined;},x=>{x.receipt.received_ts=T-1;},x=>{x.state.assetPositions[0].position.liquidationPx='1.3';},x=>{x.state.assetPositions.push(structuredClone(x.state.assetPositions[0]));}]){
  const invalid=structuredClone(bad);mutate(invalid);assert.deepEqual(selectVerifiedNativeAccounts([invalid,valid,valid],{symbol:'FIL',run_id:'same',now:T}).map(x=>x.address),[b]);
 }
 assert.equal(selectVerifiedNativeAccounts([valid],{symbol:'FIL',run_id:'same',now:T+120001}).length,0);assert.equal(valid.state.time,T);
});
test('a later account receipt or collection completion cannot hide a source clock after its own original receipt',()=>{
 const account={address:a,state:state(a),received_at_ms:T};account.state.time=T+1;
 const receipt=normalizeNativeHL({accounts:[account,{address:b,state:{...state(b),time:T+10},received_at_ms:T+10}]},{symbol:'FIL',route_symbol:'FIL',run_id:'same',snapshot_id:'S:FIL',as_of_ms:T+20,received_at_ms:T+20,max_age_ms:120000});
 assert.equal(receipt.usable_for_context,false);assert.equal(receipt.status,'SOURCE_AFTER_RECEIPT');assert.equal(receipt.zones.length,0);
 const f={schema:'NATIVE_LIQUIDATION_ACQUISITION_V1'};assert.equal(acquisitionHasFreshLevels(f,{contract:'FIL-USDT',run_id:'same',observed_ts:T+20}),false);
});
