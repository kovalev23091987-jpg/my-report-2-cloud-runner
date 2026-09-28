import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const runtime=path.resolve(process.argv[2]||'runtime');
const worker=await import(`${pathToFileURL(path.join(runtime,'src/worker.js')).href}?timeline=${Date.now()}`);
const {prepareHtxExecutionFacts,checkExecutionHandoff}=await import(pathToFileURL(path.join(runtime,'src/tz101-execution-facts.mjs')).href);
const EARLY=1790604862614,LATE=1790604878385,CONTRACT='BOME-USDT';
const response=(received,book)=>({contract_code:CONTRACT,requested_notional_usdt:1000,received_ts:received,info_response:{ok:true,data:{status:'ok',ts:EARLY-1000,data:[{contract_code:CONTRACT,contract_size:1,price_tick:.000001,contract_status:1}]}},depth_response:{ok:true,data:{status:'ok',ch:`market.${CONTRACT}.depth.step0`,ts:book+10,tick:{ts:book,bids:[[.01,200000]],asks:[[.010001,200000]]}}}});

const earlyUsingLateData=prepareHtxExecutionFacts(response(EARLY,LATE-100));
assert.equal(earlyUsingLateData.status,'NOT_CLOSED');
assert.ok(earlyUsingLateData.reasons.includes('BOOK_TIMESTAMP_MISSING_STALE_OR_FUTURE'));

const stale=prepareHtxExecutionFacts(response(EARLY,EARLY-100));assert.ok(stale.facts);
let calls=0;const realNow=Date.now;Date.now=()=>LATE;
try{
 const refreshed=await worker.refreshHtxExecutionQuoteIfNeededForTest({contract:CONTRACT,notional_usdt:1000,current_quote:stale,now_ts:LATE,request_json:async url=>{calls++;assert.match(url,/\/market\/depth/);return response(LATE,LATE-100).depth_response;}});
 assert.equal(calls,1);assert.equal(refreshed.status,'REFRESHED');assert.equal(refreshed.quote.facts.received_ts,LATE);
 const gate={contract_code:CONTRACT,factual_basis:refreshed.quote};assert.equal(checkExecutionHandoff(gate,{contract_code:CONTRACT,checked_ts:LATE}).ok,true);assert.equal(checkExecutionHandoff(gate,{contract_code:CONTRACT,checked_ts:LATE+15001}).ok,false);
}finally{Date.now=realNow;}

let network=0;const cache=worker.createPerDeepCheckFetchCacheForTest(async url=>{network++;return{ok:true,url};},39,2);
await Promise.all(Array.from({length:37},(_,i)=>cache.fetch(`https://example.test/${i}`)));
assert.equal((await cache.fetch('https://example.test/blocked')).ok,false);
await cache.refresh('https://example.test/depth');await cache.refresh('https://example.test/info');
assert.equal(network,39);assert.equal(cache.stats().unique_external_requests,39);assert.equal(cache.stats().execution_refresh_reserve,2);
console.log(JSON.stringify({status:'DECISION_TIMELINE_PASS',bome_false_future_removed_by_late_bundle:true,stale_handoff_rejected:true,execution_refresh_reserved:2}));
