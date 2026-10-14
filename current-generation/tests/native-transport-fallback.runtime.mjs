import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL,fileURLToPath} from 'node:url';
const load=name=>import(pathToFileURL(path.resolve(process.env.REPORT2_TEST_RUNTIME?path.join(process.env.REPORT2_TEST_RUNTIME,'src'):fileURLToPath(new URL('../files/src/',import.meta.url)),name)));
const [{createGTradeRuntimeCollector},{createCombinedLiquidationService,createGTradeTransportDiagnostic,classifyOperationalSourceOutcome},{buildLiquidationSourceAcquisitionAudit}]=await Promise.all([load('liquidation-extension/gtrade-runtime-collector.mjs'),load('liquidation-extension/combined-runner-service.mjs'),load('liquidation-source-acquisition-audit.mjs')]);
const T=1791971800000,contract='ZEC-USDT',run_id='CONTROLLED_NATIVE_TRANSPORT';
const sdk={getLiquidationPrice(){},buildLiquidationPriceContext(){}};
const json=(v,status=200)=>new Response(JSON.stringify(v),{status});
const args={contract,native_symbol:'ZEC',run_id,acquisition_id:'CONTROLLED_NO_LEVELS',deadline_ts:T+20000};
const receipt=(http_status,extra={})=>({url:'https://backend-arbitrum.gains.trade/trading-variables',method:'GET',started_ts:T-100,received_ts:T,http_status,sha256:'a'.repeat(64),...extra});
const diagnostic=(status=429,extra={})=>createGTradeTransportDiagnostic({contract,run_id,now:T,result:{requests:1,reasons:[status===429?'RATE_LIMITED':'HTTP_ERROR'],transport_receipts:[receipt(status)],...extra}});
const classify=d=>classifyOperationalSourceOutcome({status:'GTRADE_HTTP_NOT_CLOSED',contract,run_id,actual_http:1,transport_diagnostic:d,now:T});

test('the original gTrade 429 receipt survives a failed catalog and same-run reuse without another HTTP',async()=>{
 let calls=0;const collect=createGTradeRuntimeCollector({sdk,clock:()=>T,fetch_impl:async()=>{calls++;return json({error:'rate'},429);}});
 const first=await collect(args),second=await collect({...args,contract:'FIL-USDT',native_symbol:'FIL'});
 assert.equal(calls,1);assert.equal(first.requests,1);assert.equal(second.requests,0);
 assert.equal(first.transport_receipts[0].http_status,429);assert.deepEqual(second.transport_receipts,first.transport_receipts);
 const d=createGTradeTransportDiagnostic({contract,run_id,result:first,now:T});assert.equal(classify(d).failure_origin,'PROVIDER_QUOTA');
 assert.equal(d.source_clock_closed,false);assert.equal(d.entry_authorized,false);
});

test('parallel market snapshot failure retains each original endpoint, HTTP status and reason',async()=>{
 const original=fs.readFileSync(new URL('../../post-v7-consolidated/liquidation/liquidation-extension/evidence/gtrade_variables_v2.raw',import.meta.url)),originalClock=1790489990092,SHA='202c049a5e26b4c0332495cf94a2f92c32facc9c8619b7e42aa9c874291fb3d1';
 assert.equal(createHash('sha256').update(original).digest('hex'),SHA);
 const calls=[];const collect=createGTradeRuntimeCollector({sdk,clock:()=>originalClock,fetch_impl:async url=>{calls.push(url);if(url.endsWith('/trading-variables'))return new Response(original);if(url.endsWith('/open-trades'))return json([]);return json({error:'bad gateway'},503);}});
 const r=await collect({...args,deadline_ts:originalClock+20000});assert.equal(r.status,'GTRADE_HTTP_NOT_CLOSED');assert.equal(r.requests,3);assert.equal(calls.length,3);
 const d=createGTradeTransportDiagnostic({contract,run_id,result:r,now:originalClock});assert.deepEqual(d.entries.map(x=>[x.endpoint,x.http_status]),[['CATALOG',200],['OPEN_TRADES',200],['REFERENCE_PRICES',503]]);assert.equal(d.entries[0].response_sha256,SHA);
 const outcome=classifyOperationalSourceOutcome({status:r.status,contract,run_id,actual_http:3,transport_diagnostic:d,now:originalClock});assert.equal(outcome.failure_origin,'TRANSPORT');assert.equal(outcome.role_usable,false);
});

test('serialized, foreign, stale or wrong-cost diagnostic cannot change operational classification',()=>{
 const d=diagnostic();assert.equal(classify(d).failure_origin,'PROVIDER_QUOTA');
 for(const wrong of [JSON.parse(JSON.stringify(d)),{...d,contract:'FIL-USDT'},null])assert.equal(classify(wrong).failure_origin,'TRANSPORT');
 assert.equal(classifyOperationalSourceOutcome({status:'GTRADE_HTTP_NOT_CLOSED',contract,run_id,actual_http:0,transport_diagnostic:d,now:T}).failure_origin,'TRANSPORT');
 assert.equal(classifyOperationalSourceOutcome({status:'GTRADE_HTTP_NOT_CLOSED',contract,run_id,actual_http:1,transport_diagnostic:d,now:T+300001}).failure_origin,'TRANSPORT');
 assert.equal(classifyOperationalSourceOutcome({status:'SKIPPED_CANDIDATE_HTTP_ENVELOPE',contract,run_id,actual_http:1,transport_diagnostic:d,now:T}).evaluated,false);
 assert.throws(()=>{d.contract='FIL-USDT';},TypeError);assert.throws(()=>{d.entries[0].http_status=200;},TypeError);
 for(const requests of [null,undefined,-1,5])assert.equal(diagnostic(429,{requests}),null);
});

test('HTTP500 mixed with429 stays a transport failure; invalid JSON at200 stays a schema failure',()=>{
 const mixed=diagnostic(429,{requests:2,reasons:['RATE_LIMITED','HTTP_ERROR'],transport_receipts:[receipt(429),receipt(500,{url:'https://backend-pricing.eu.gains.trade/charts'})]});
 assert.equal(mixed.provider_rate_limited,false);assert.equal(classifyOperationalSourceOutcome({status:'GTRADE_HTTP_NOT_CLOSED',contract,run_id,actual_http:2,transport_diagnostic:mixed,now:T}).failure_origin,'TRANSPORT');
 const invalid=diagnostic(200,{reasons:['JSON_INVALID']});assert.equal(classify(invalid).failure_origin,'SCHEMA');
 const fake=diagnostic(200,{reasons:['RATE_LIMITED']});assert.equal(classify(fake).failure_origin,'TRANSPORT');
});

test('diagnostics expose only bounded operational fields and reject unsafe URL or clocks',()=>{
 const d=diagnostic(429,{payload:'DO_NOT_EXPORT',transport_receipts:[receipt(429,{request_body:{secret:'DO_NOT_EXPORT'},provider_error:{message:'DO_NOT_EXPORT'}})]});
 assert.ok(!JSON.stringify(d).includes('DO_NOT_EXPORT'));assert.ok(!JSON.stringify(d).includes('https:'));assert.ok(JSON.stringify(d).length<2048);
 for(const extra of [{url:'https://backend-arbitrum.gains.trade/trading-variables?key=DO_NOT_EXPORT'},{received_ts:T+1},{started_ts:T+1},{received_ts:T-300001,started_ts:T-300002}])assert.equal(diagnostic(429,{transport_receipts:[receipt(429,extra)]}),null);
 assert.equal(diagnostic(429,{transport_receipts:Array(5).fill(receipt(429))}),null);
});

test('native429 does not penalize source reliability and falls through inside the unchanged four-call envelope',async()=>{
 const calls=[],updates=[],roles=[];
 const history={source_id:'GTRADE_NATIVE',role_prior_contract:contract,role_prior_role:'NATIVE_POSITION_CONTEXT',role_prior_json:JSON.stringify([{contract,role:'NATIVE_POSITION_CONTEXT',source_id:'GTRADE_NATIVE',run_id:'EARLIER_CONTROL',observed_ts:T-1000,status:'ACQUISITION_RETURNED',role_usable:1,actual_http:3}]),attempts:3,reliability:1};
 const service=createCombinedLiquidationService({mode:'SHADOW_ONLY',clock:()=>T,max_http_per_run:4,candidate_slots:1,sdk_loader:()=>({version:'1.8.10',sdk}),provider_admit:async()=>({allowed:true,new_reservation:true}),source_weight_store:{load:async()=>[history],record:async row=>{updates.push(row);return{recorded:true};},recordRole:async row=>{roles.push(row);return{recorded:true};}},fetch_impl:async(url,init)=>{calls.push(url);if(url.endsWith('/trading-variables'))return json({error:'rate'},429);assert.equal(url,'https://api.hyperliquid.xyz/info');assert.equal(JSON.parse(init.body).type,'metaAndAssetCtxs');return json([{universe:[{name:'OTHER'}]},[]]);}});
 assert.equal(await service.collect({...args,deep_started_ts:T,max_http_for_candidate:4,allowed_source_ids:['GTRADE_NATIVE','HYPERLIQUID_NATIVE']}),null);
 const s=service.summary();assert.deepEqual(s.routed.map(x=>x.lane),['GTRADE_NATIVE','HYPERLIQUID_NATIVE']);assert.equal(s.routed[0].source_outcome.failure_origin,'PROVIDER_QUOTA');assert.equal(s.routed[1].fallback,true);
 assert.equal(updates.some(x=>x.source_id==='GTRADE_NATIVE'),false);assert.equal(roles.find(x=>x.source_id==='GTRADE_NATIVE').role_usable,false);
 assert.equal(calls.length,2);assert.equal(s.shared_budget.actual_http,2);assert.equal(s.shared_budget.reserved_http,2);assert.equal(s.total_http_cap,4);
 const a=buildLiquidationSourceAcquisitionAudit({summary:s,run_id,candidates:[contract],evaluated_ts:T});assert.equal(a.routes[0].transport_diagnostic.entries[0].http_status,429);assert.equal(a.network_calls,0);assert.equal(a.entry_authorized,false);
 assert.ok(s.source_weighting.profile.every(x=>x.predictive_weight_factor===1));assert.equal(s.source_weighting.core_decision_weights_changed,false);
});

test('audit detail cannot leak payloads, mix runs or evict an otherwise bounded original audit',()=>{
 const d=JSON.parse(JSON.stringify(diagnostic()));d.secret='DO_NOT_EXPORT';d.entries[0].secret='DO_NOT_EXPORT';
 const row={contract,run_id,lane:'GTRADE_NATIVE',status:'GTRADE_HTTP_NOT_CLOSED',transport_diagnostic:d,source_outcome:{attempted_http_count:1,evaluated:true,failure_origin:'PROVIDER_QUOTA'}};
 const build=routed=>buildLiquidationSourceAcquisitionAudit({summary:{routed,total_http_cap:4,shared_budget:{reserved_http:1,actual_http:1}},run_id,candidates:[contract],evaluated_ts:T});
 const a=build([row]);assert.ok(!JSON.stringify(a).includes('DO_NOT_EXPORT'));assert.equal(a.routes[0].transport_diagnostic.source_clock_closed,false);
 const wrong=build([{...row,transport_diagnostic:{...d,run_id:'FOREIGN'}}]);assert.equal(wrong.routes[0].transport_diagnostic,undefined);
 const many=build(Array.from({length:24},()=>({...row,transport_diagnostic:{...d,entries:Array(4).fill(d.entries[0])}})));
 assert.ok(many);assert.ok(Buffer.byteLength(JSON.stringify(many))<=16384);assert.equal(many.routes.length,24);assert.equal(many.routes[0].transport_diagnostic,undefined);
});
