import test from 'node:test';
import assert from 'node:assert/strict';
import {createSharedSourceBudget} from '../files/src/liquidation-extension/run-source-budget.mjs';
import {readJson} from '../files/src/liquidation-extension/io.mjs';
import {GTRADE_RPC,GTRADE_RESERVE_RPC,permittedGTradeRpcUrl} from '../files/src/liquidation-extension/gtrade-pinned-position-snapshot.mjs';
const T=1800000000000,body=[{jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]},{jsonrpc:'2.0',id:2,method:'eth_getBlockByNumber',params:['0x1234',false]}];
test('both exact RPC routes consume the same admitted GTRADE pool with no extra provider vote',async()=>{
 let calls=0;const budget=createSharedSourceBudget({max_requests:2,clock:()=>T,provider_admit:async()=>({allowed:true,new_reservation:true}),fetch_impl:async()=>{calls++;return new Response('[]');}});
 await budget.admit({reservation_id:'rpc',requests:{GTRADE:2},max_requests:2,deadline_ts:T+10000});
 for(const url of [GTRADE_RPC,GTRADE_RESERVE_RPC])assert.equal((await readJson(url,{method:'POST',body,fetch_impl:budget.fetch,clock:()=>T})).ok,true);
 assert.equal(calls,2);assert.equal(budget.summary().actual_http,2);assert.equal(budget.summary().max_http,2);
 const denied=await readJson(GTRADE_RESERVE_RPC,{method:'POST',body,fetch_impl:budget.fetch,clock:()=>T});assert.equal(denied.ok,false);assert.equal(calls,2);
});
test('research latest block, mutable calls and altered reserve routes cannot reach production transport',async()=>{
 let calls=0;const opts={method:'POST',body,fetch_impl:async()=>{calls++;return new Response('[]');}};
 for(const url of ['https://arbitrum-one-rpc.publicnode.com/?x=1','https://arbitrum-one-rpc.publicnode.com/other','https://arbitrum-one-rpc.publicnode.com:8443/','https://user@arbitrum-one-rpc.publicnode.com/']){assert.equal(permittedGTradeRpcUrl(url),false);await assert.rejects(readJson(url,opts));}
 await assert.rejects(readJson(GTRADE_RESERVE_RPC,{...opts,method:'GET'}));
 for(const mutation of [b=>{b[1].params[0]='latest';},b=>{b[0].method='eth_sendRawTransaction';}]){const bad=structuredClone(body);mutation(bad);await assert.rejects(readJson(GTRADE_RESERVE_RPC,{...opts,body:bad}),/UNAPPROVED_POST/);}
 assert.equal(calls,0);
});
