import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=path.resolve(process.env.REPORT2_TEST_RUNTIME||'runtime');
const {APPROVED_HTX_ANALYSIS_CONTRACTS:base}=await import(pathToFileURL(path.join(root,'src/approved-htx-analysis-scope.mjs')));
const {loadApprovedStage0ScanForTest:scan}=await import(pathToFileURL(path.join(root,'src/worker.js')));
const native=x=>({contract_code:x.contract_code,symbol:x.asset_symbol,contract_status:1,business_type:'swap',contract_type:'swap',trade_partition:'USDT',labels:[],tradfi_labels:[],contract_size:1,price_tick:.0001});
async function run(catalog){
 const fetchBefore=globalThis.fetch,calls=[],env={};
 globalThis.fetch=async url=>{calls.push(String(url));const ts=Date.now()-1000;let data;
 if(String(url).includes('swap_contract_info'))data={status:'ok',ts,data:catalog};
 else if(String(url).includes('batch_merged'))data={status:'ok',ts,ticks:catalog.map(x=>({contract_code:x.contract_code,open:10,close:11,high:12,low:9,trade_turnover:1e6,vol:1e6,ts}))};
 else if(String(url).includes('swap_open_interest'))data={status:'ok',ts,data:catalog.map(x=>({contract_code:x.contract_code,volume:1000}))};
 else if(String(url).includes('swap_batch_funding_rate'))data={status:'ok',ts,data:catalog.map(x=>({contract_code:x.contract_code,funding_rate:.0001,funding_time:ts+3600000}))};
 else throw Error('UNEXPECTED_SOURCE');return new Response(JSON.stringify(data),{status:200});};
 try{return{result:await scan({freshness_sec:300},env,{persist:false}),env,calls};}finally{globalThis.fetch=fetchBefore;}
}
test('actual assembled four-endpoint scan excludes new crypto before history and every discovery consumer',async()=>{
 const catalog=[...base.map(native),native({contract_code:'CT-USDT',asset_symbol:'CT'})],{result,env,calls}=await run(catalog);
 assert.equal(calls.length,4);assert.equal(result.counts.universe_total,102);assert.equal(result.counts.scanned,102);assert.equal(result.counts.missing,0);assert.equal(result.coverage.stage0_coverage_pct,100);assert.equal(result.health.contracts,true);assert.equal(result.contracts.length,102);assert.ok(result.contracts.every(x=>x.contract_code!=='CT-USDT'));assert.equal(result.scope_audit.lost_contracts,0);assert.deepEqual(env.REPORT2_CURRENT_CYCLE_UNIVERSE_AUDIT,result.scope_audit.approved_generation);assert.deepEqual(result.scope_audit.approved_generation.outside_approved_crypto_contracts,[{contract:'CT-USDT',reason:'NOT_IN_APPROVED_GENERATION_UNIVERSE'}]);
 for(const x of result.contracts){assert.equal(x.price,11);assert.equal(x.market_24h.close,11);assert.equal(x.freshness.market_age_sec,Math.max(0,result.timestamp-x.market_24h.source_ts)/1000);assert.ok(x.market_24h.source_ts<result.timestamp);}
});
test('actual assembled incomplete catalog cannot claim 100 percent approved coverage',async()=>{
 const {result,calls}=await run(base.slice(1).map(native));assert.equal(calls.length,4);assert.equal(result.counts.universe_total,102);assert.equal(result.counts.scanned,101);assert.equal(result.counts.missing,1);assert.ok(result.coverage.stage0_coverage_pct<100);assert.equal(result.health.contracts,false);assert.equal(result.scope_audit.approved_generation.status,'NOT_CLOSED');assert.equal(result.contracts.length,101);
});
test('actual assembled wrong asset and duplicate catalog rows leave approved identities unavailable',async()=>{
 for(const catalog of [base.map((x,i)=>({...native(x),symbol:i?x.asset_symbol:'WRONG'})),[...base.map(native),native(base[0])]]){const {result}=await run(catalog);assert.equal(result.counts.scanned,101);assert.equal(result.health.contracts,false);assert.equal(result.scope_audit.lost_contracts,0);assert.ok(result.scope_audit.approved_generation.missing_approved_analysis_contracts.includes(base[0].contract_code));}
});
test('actual assembled conflict across native crypto and stock rows cannot inherit a approved identity',async()=>{
 const {result}=await run([...base.map(native),{...native(base[0]),labels:['stock'],tradfi_labels:['stock']}]);assert.equal(result.counts.scanned,101);assert.equal(result.health.contracts,false);assert.equal(result.scope_audit.lost_contracts,0);assert.ok(result.scope_audit.approved_generation.missing_approved_analysis_contracts.includes(base[0].contract_code));assert.ok(!result.contracts.some(x=>x.contract_code===base[0].contract_code));
});
