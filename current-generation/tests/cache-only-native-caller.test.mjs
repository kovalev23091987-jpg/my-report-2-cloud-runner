import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {collectSelectedNativeBatch} from '../files/src/liquidation-extension/selected-native-batch.mjs';
const root=path.resolve(process.env.REPORT2_TEST_RUNTIME||'current-generation/files');
const load=n=>import(pathToFileURL(path.join(root,'src',n)));
const [{createCombinedLiquidationService},{createDydxRuntimeCollector,verifyDydxSourceState},{decodeDydxPinnedSnapshot,calculateDydxConditionalLevels},{nativeLiquidationCollectionMode,remainingLiquidationHttpCap},{buildLiquidationSourceAcquisitionAudit}]=await Promise.all([load('liquidation-extension/combined-runner-service.mjs'),load('liquidation-extension/dydx-runtime-collector.mjs'),load('liquidation-extension/dydx-pinned-conditional-levels.mjs'),load('candidate-source-routing.mjs'),load('liquidation-source-acquisition-audit.mjs')]);
const bytes=fs.readFileSync('checkpoints/source-inputs/dydx-native-dense-37625020734.json.gz'),raw=JSON.parse(gunzipSync(bytes)),T=Math.max(...raw.raw.map(r=>r.receipt.received_ts)),snapshot=decodeDydxPinnedSnapshot({raw,now:T});
const universe=JSON.parse(gunzipSync(fs.readFileSync('checkpoints/htx-all-modes-crypto-futures-universe-20261004.json.gz'))),assets=new Set(universe.assets.map(a=>a.symbol)),levels=calculateDydxConditionalLevels(snapshot,{crypto_assets:assets}).levels,selected=[...new Set(levels.map(l=>l.asset))].sort().slice(0,2).map(a=>a+'-USDT'),run='CONTROLLED_CACHE_ONLY_CALLER';
const lastBytes=fs.readFileSync('checkpoints/source-inputs/post-pr227-natural-37663457675.json.gz'),last=JSON.parse(gunzipSync(lastBytes));
const params=contract=>({contract,native_symbol:contract.replace(/-USDT$/,''),run_id:run,deep_started_ts:T,max_http_for_candidate:5,allowed_source_ids:['DYDX_PINNED_NATIVE'],dydx_position_batch_contracts:selected});
function replay({on_snapshot=null}={}){
 let now=T,forbidden=false;const calls=[],grants=[],db=[];
 const service=createCombinedLiquidationService({mode:'SHADOW_ONLY',secondary_enabled:false,dydx_enabled:true,dydx_automatic_discovery_enabled:true,dydx_crypto_assets:assets,candidate_slots:2,max_http_per_run:5,on_dydx_snapshot:on_snapshot,clock:()=>now,provider_admit:async r=>{assert.equal(forbidden,false,'cache-only must never reserve');grants.push(r);return{allowed:true,new_reservation:true};},source_weight_store:Object.fromEntries(['load','record','recordRole'].map(k=>[k,async()=>{assert.equal(forbidden,false,'cache-only must never access D1');db.push(k);return k==='load'?[]:{recorded:true};}])),fetch_impl:async(url,init)=>{assert.equal(forbidden,false,'cache-only must never dispatch');assert.equal(String(url),'https://dydx-rpc.publicnode.com/');const q=JSON.parse(init.body);calls.push(q);return new Response((q.method==='status'?raw.raw[0]:q.method==='abci_query'?raw.raw[1]:raw.raw[2]).raw_body_utf8);}});
 return{service,calls,grants,db,setNow:v=>now=v,forbid:()=>forbidden=true};
}
// Execute the actual frozen worker caller block and actual runner wiring. Other
// runner operations are absent, so this cannot launch a report or send Telegram.
export function workerCaller(env,{contract,cap=0,reserved=false,run_id=run}={}){
 const worker=fs.readFileSync(path.join(root,'src/worker.js'),'utf8'),start=worker.indexOf('  // Owner contract: open-position liquidation levels'),end=worker.indexOf('\n  if(typeof env?.REPORT2_FUTURE_PROVIDER_MODEL_COLLECT',start);
 assert.ok(start>=0&&end>start);
 return new (Object.getPrototypeOf(async function(){}).constructor)('env','contract','params','supplementalCandidateContext','sourceRoutingPlan','futureProviderModels','cycleStartedTs','remainingLiquidationHttpCap','nativeLiquidationCollectionMode',worker.slice(start,end)+'\nreturn {acquisition:nativeLiquidationAcquisition,mode:nativeLiquidationMode,error:nativeLiquidationCollectionError};')(env,contract,{run_id}, {liquidation_lane_reserved:reserved},{reserve_liquidation_lane:cap>0,total_http_envelope:cap||5,run_cross_exchange:false},null,T,remainingLiquidationHttpCap,nativeLiquidationCollectionMode);
}
export function wire(service,contracts=selected,selectedRun=run){
 const env={REPORT2_LIQUIDATION_SELECTED_CONTRACTS:{run_id:selectedRun,contracts}},runner=fs.readFileSync(path.join(root,'runner-main.mjs'),'utf8'),start=runner.indexOf('    env.REPORT2_LIQUIDATION_NATIVE_COLLECT=async params=>'),end=runner.indexOf('\n',start);
 assert.ok(start>=0&&end>start);
 new Function('env','liquidationCoverageFor','liquidationSources','futureHttpByContract','liquidationRiskByContract','console','collectSelectedNativeBatch',runner.slice(start,end))(env,()=>({eligible:true,source_ids:['DYDX_PINNED_NATIVE'],proven_level_source_ids:[]}),service,new Map(),new Map(),{log(){}},opts=>collectSelectedNativeBatch({...opts,clock:()=>T+44000}));
 return env;
}
export {replay,params,selected,run,T,snapshot,levels,last,bytes,lastBytes,assets};
test('actual worker and runner route second exact selected asset at cap0 and no reserved lane to fresh same-run snapshot without HTTP, D1 or reservations',async()=>{
 const f=replay(),env=wire(f.service);const first=await workerCaller(env,{contract:selected[0],cap:5,reserved:true});assert.ok(first.acquisition);assert.equal(first.mode,'SOURCE_HTTP');
 const before=structuredClone(f.service.summary().shared_budget),counts=[f.calls.length,f.grants.length,f.db.length];f.setNow(T+44000);f.forbid();
 const second=await workerCaller(env,{contract:selected[1]});assert.equal(second.mode,'CACHE_ONLY');assert.equal(second.error,null);assert.ok(second.acquisition);assert.deepEqual(f.service.summary().shared_budget,before);assert.deepEqual([f.calls.length,f.grants.length,f.db.length],counts);
 const r=f.service.summary().routed.at(-1);assert.equal(r.cache_only,true);assert.equal(r.source_outcome.attempted_http_count,0);assert.equal(r.position_proof.source_ts,snapshot.source_ts);assert.equal(r.position_proof.observed_ts,T);assert.equal(r.position_proof.height,snapshot.height);assert.equal(verifyDydxSourceState(r.position_proof,{contract:selected[1],run_id:run,now:T+44000}),true);
 assert.deepEqual([...second.acquisition.scoped[0].above,...second.acquisition.scoped[0].below].map(z=>z.native_price).sort((a,b)=>a-b),levels.filter(l=>l.asset===selected[1].slice(0,-5)).slice(0,8).map(l=>l.price).sort((a,b)=>a-b));
});
test('zero-cap cold, foreign run, foreign selected pair, duplicate, absent source permission and unsupported identities never trigger fallback transport or mutate budgets',async()=>{
 const f=replay();await f.service.collect(params(selected[0]));f.forbid();const before=structuredClone(f.service.summary().shared_budget);
 for(const change of [{run_id:'FOREIGN'},{contract:'NOT_FROZEN-USDT',native_symbol:'NOT_FROZEN'},{native_symbol:'WRONG'},{dydx_position_batch_contracts:[selected[0],selected[0]]},{dydx_position_batch_contracts:[selected[0]]},{allowed_source_ids:[]},{dydx_position_batch_contracts:['BTC-USD',selected[1]]}])assert.equal(await f.service.collect({...params(selected[1]),max_http_for_candidate:0,cache_only:true,...change}),null);
 const cold=replay();cold.forbid();assert.equal(await cold.service.collect({...params(selected[1]),max_http_for_candidate:0,cache_only:true}),null);assert.equal(cold.calls.length,0);assert.equal(cold.grants.length,0);assert.equal(cold.db.length,0);
 const foreign=await workerCaller(wire(f.service,selected,'FOREIGN'),{contract:selected[1]});assert.equal(foreign.acquisition,null);assert.deepEqual(f.service.summary().shared_budget,before);
});
test('stale, future, changed or serialized snapshots fail closed and cache-only expiry does not consume an attempt needed by a later admitted acquisition',async()=>{
 const f=replay();await f.service.collect(params(selected[0]));f.forbid();for(const now of [snapshot.source_ts+120001,snapshot.source_ts-1,T-1]){f.setNow(now);assert.equal(await f.service.collect({...params(selected[1]),max_http_for_candidate:0,cache_only:true}),null);assert.equal(f.service.summary().routed.at(-1).source_outcome.operational_success,undefined);}
 for(const mutate of [s=>s.source_ts++,s=>s.run_id='OTHER',s=>s.receipts[0].received_ts++,s=>s.subaccounts[0].number++]){let saved;const g=replay({on_snapshot:({snapshot:s})=>{saved=s;}});await g.service.collect(params(selected[0]));mutate(saved);g.forbid();assert.equal(await g.service.collect({...params(selected[1]),cache_only:true}),null);}
 const calls=[];const collector=createDydxRuntimeCollector({clock:()=>T,crypto_assets:assets,automatic_discovery_enabled:true,fetch_impl:async(url,init)=>{const q=JSON.parse(init.body);calls.push(q);return new Response((q.method==='status'?raw.raw[0]:q.method==='abci_query'?raw.raw[1]:raw.raw[2]).raw_body_utf8);}});
 assert.equal((await collector({...params(selected[0]),cache_only:true,snapshot:structuredClone(snapshot)})).requests,0);assert.equal((await collector({...params(selected[0]),position_batch_contracts:selected})).requests,3);assert.equal(calls.length,3);
});
test('last real bounded empty proof remains absence, cannot be rehydrated into a trusted current snapshot, and exact retained caller conditions enter cache-only',async()=>{
 const audit=last.liquidation_source_acquisition_audit,r=audit.routes.find(r=>r.lane==='DYDX_PINNED_NATIVE'),q=last.candidates.find(c=>c.contract==='QNT-USDT');assert.equal(r.status,'DYDX_NO_ELIGIBLE_SAMPLE_LEVEL');assert.equal(r.position_proof.position_search.complete_accounts_read,200);assert.equal(r.source_outcome.coverage_status,'EMPTY_BOUNDED_SAMPLE');assert.equal(r.role_usable,false);assert.ok(q.observed_ts-r.position_proof.source_ts<120000);assert.equal(verifyDydxSourceState(r.position_proof,{now:q.observed_ts}),false,'serialized audit is not native raw or trusted source state');
 const f=replay();f.forbid();const outcome=await workerCaller(wire(f.service,audit.candidates,audit.run_id),{contract:q.contract,run_id:audit.run_id});assert.equal(outcome.mode,'CACHE_ONLY');assert.equal(outcome.acquisition,null);assert.equal(f.calls.length,0);assert.equal(q.canonical.state,'REJECTED');assert.equal(q.canonical.direction,null);
 const g=replay();const pair=audit.candidates;await g.service.collect({...params(pair[0]),dydx_position_batch_contracts:pair});g.setNow(T+44000);g.forbid();assert.equal((await workerCaller(wire(g.service,pair),{contract:pair[1]})).acquisition,null);const row=g.service.summary().routed.at(-1);assert.equal(row.source_outcome.operational_success,true);assert.equal(row.source_outcome.coverage_status,'EMPTY_BOUNDED_SAMPLE');assert.equal(row.usable,false);
 const proof=buildLiquidationSourceAcquisitionAudit({summary:g.service.summary(),run_id:run,candidates:pair,evaluated_ts:T+44000});assert.equal(proof.routes.at(-1).source_outcome.actual_http,0);
 fs.mkdirSync('audit-output',{recursive:true});fs.writeFileSync('audit-output/cache-only-retained-caller-proof.json',JSON.stringify({schema:'CACHE_ONLY_RETAINED_CALLER_PROOF_V1',scope:'ORIGINAL_CLOCK_DENSE_RAW_REPLAY_AND_LAST_NATURAL_EMPTY_ARTIFACT_READ; NOT_LAST_EMPTY_RAW_REPLAY_OR_FRESH_MAIN',dense_gzip_sha256:createHash('sha256').update(bytes).digest('hex'),last_natural_gzip_sha256:createHash('sha256').update(lastBytes).digest('hex'),last_empty_native_raw_available:false,last_empty_artifact:audit,controlled_original_dense_empty_reuse:proof,sourceHTTP:0,D1:0,MAIN:0,Telegram:0,source_clocks_refreshed:false,new_SENT:false},null,2)+'\n');
});
