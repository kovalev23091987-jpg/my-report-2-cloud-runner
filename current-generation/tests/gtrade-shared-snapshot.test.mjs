import test from 'node:test';
import assert from 'node:assert/strict';
import {createGTradeRuntimeCollector} from '../files/src/liquidation-extension/gtrade-runtime-collector.mjs';

const T=1_800_000_000_000;
const response=value=>new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
const sdk={getLiquidationPrice(){},buildLiquidationPriceContext(){}};

test('K25 ten unsupported gTrade consumers share one catalog request and keep contract bindings separate',async()=>{
 let calls=0;
 const collect=createGTradeRuntimeCollector({sdk,clock:()=>T,fetch_impl:async url=>{calls++;if(String(url).endsWith('trading-variables'))return response({pairs:[{from:'OTHER',to:'USD'}],lastRefreshed:T,currentBlock:1});if(String(url).endsWith('open-trades'))return response([]);return response({indexPrices:[],time:T});}});
 const rows=await Promise.all(Array.from({length:10},(_,i)=>collect({contract:`X${i}-USDT`,native_symbol:`X${i}`,run_id:'RUN-1',acquisition_id:`A-${i}`,deadline_ts:T+20000})));
 assert.equal(calls,1);assert.equal(collect.snapshotCount(),0);assert.equal(collect.catalogCount(),1);assert.equal(rows[0].requests,1);assert.ok(rows.slice(1).every(row=>row.requests===0&&row.reused_catalog===true));assert.ok(rows.every(row=>row.status==='GTRADE_SYMBOL_UNSUPPORTED'));
});

test('K26 gTrade cache is run-scoped and a failed shared fetch is not retried per consumer',async()=>{
 let calls=0;
 const collect=createGTradeRuntimeCollector({sdk,clock:()=>T,fetch_impl:async()=>{calls++;return new Response('bad',{status:500});}});
 const first=await collect({contract:'A-USDT',native_symbol:'A',run_id:'RUN-X',acquisition_id:'A',deadline_ts:T+20000});
 const second=await collect({contract:'B-USDT',native_symbol:'B',run_id:'RUN-X',acquisition_id:'B',deadline_ts:T+20000});
 assert.equal(calls,1);assert.equal(first.status,'GTRADE_HTTP_NOT_CLOSED');assert.equal(second.status,'GTRADE_HTTP_NOT_CLOSED');assert.equal(second.requests,0);
 await collect({contract:'C-USDT',native_symbol:'C',run_id:'RUN-Y',acquisition_id:'C',deadline_ts:T+20000});assert.equal(calls,2);
});
