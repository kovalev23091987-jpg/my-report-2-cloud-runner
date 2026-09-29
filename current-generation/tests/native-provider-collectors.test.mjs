import test from 'node:test';
import assert from 'node:assert/strict';
import {createLighterRuntimeCollector} from '../files/src/liquidation-extension/lighter-runtime-collector.mjs';
import {createGmxRuntimeCollector} from '../files/src/liquidation-extension/gmx-runtime-collector.mjs';
import {verifyScopedProviderAcquisition,bindScopedProviderAcquisition} from '../files/src/liquidation-extension/scoped-provider-runtime-bridge.mjs';
import {createMultiLiquidationAcquisition} from '../files/src/liquidation-extension/gtrade-runtime-bridge.mjs';
import {attachNativeContext} from '../files/src/liquidation-extension/runtime-bridge.mjs';
import {nativeLiquidationLines} from '../files/src/native-liquidation-guard.mjs';
const T=1_800_000_000_000,response=x=>new Response(JSON.stringify(x),{status:200,headers:{'content-type':'application/json'}});

test('Lighter discovers active accounts then accepts only native account liquidation prices',async()=>{
 const trades={code:200,trades:[{market_id:103,ask_account_id:1,bid_account_id:2,is_maker_ask:false,taker_position_size_before:'-100',maker_position_size_before:'200'},{market_id:103,ask_account_id:3,bid_account_id:4,is_maker_ask:true,taker_position_size_before:'-300',maker_position_size_before:'400'}]};
 const fetch_impl=async url=>{if(String(url).includes('recentTrades'))return response(trades);const id=Number(new URL(String(url)).searchParams.get('value')),isLong=id%2===0;return response({code:200,accounts:[{account_index:id,transaction_time:T*1000,positions:[{market_id:103,symbol:'FIL',position:'1000',position_value:'1000',sign:isLong?1:-1,margin_mode:id===2?0:1,liquidation_price:isLong?'0.8':'1.2'}]}]});};
 const collect=createLighterRuntimeCollector({fetch_impl,clock:()=>T});const out=await collect({contract:'FIL-USDT',native_symbol:'FIL',run_id:'r',acquisition_id:'a',market_id:103,deadline_ts:T+30000});
 assert.equal(out.status,'LIGHTER_ACQUIRED_SCOPED_CONTEXT');assert.ok(out.requests<=4);assert.equal(verifyScopedProviderAcquisition(out.acquisition),true);assert.ok(out.acquisition.above.length+out.acquisition.below.length>0);
 assert.equal(out.acquisition.source_ts,null);assert.equal(out.acquisition.source_clock_closed,false);
 assert.ok([...out.acquisition.above,...out.acquisition.below].every(row=>row.source_ts===null&&row.source_clock_closed===false));
 const scoped=bindScopedProviderAcquisition(out.acquisition,{contract:'FIL-USDT',run_id:'r',snapshot_id:'s',observed_ts:T});assert.equal(scoped.source_age_ms,null);assert.equal(scoped.receipt_age_ms,0);assert.equal(scoped.freshness_basis,'CURRENT_ENDPOINT_RECEIPT_ONLY_SOURCE_AGE_UNKNOWN');
 const multi=createMultiLiquidationAcquisition({contract:'FIL-USDT',run_id:'r',scoped:[out.acquisition]});
 const context=attachNativeContext({},multi,{contract:'FIL-USDT',run_id:'r',snapshot_id:'s',observed_ts:T,direction:null});
 const lines=nativeLiquidationLines(context,{manual:true});assert.ok(lines.some(line=>line.includes('Lighter FIL')));
});

test('GMX uses exact market discovery and fee-aware account position endpoint',async()=>{
 const market='0x1111111111111111111111111111111111111111',accounts=['0x2222222222222222222222222222222222222222','0x3333333333333333333333333333333333333333'];
 let discoveryBody=null;const fetch_impl=async(url,init)=>{if(String(url).includes('squids.live')){discoveryBody=JSON.parse(init.body);return response({data:{positions:accounts.map((account,i)=>({id:String(i),positionKey:`0x${String(i+1).padStart(64,'0')}`,account,market,isLong:i===0,sizeInUsd:`${1000-i}000000000000000000000000000000`}))}});}const account=new URL(String(url)).searchParams.get('address'),isLong=account===accounts[0];return response([{account,contractKey:`0x${isLong?'1':'2'.repeat(64)}`.padEnd(66,'1'),marketAddress:market,indexName:'FIL/USD',sizeInUsd:'1000000000000000000000000000000000',liquidationPrice:isLong?'800000000000000000000000000000':'1200000000000000000000000000000',markPrice:'1000000000000000000000000000000',isLong}]);};
 const collect=createGmxRuntimeCollector({fetch_impl,clock:()=>T});const out=await collect({contract:'FIL-USDT',native_symbol:'FIL',run_id:'r',acquisition_id:'g',market_address:market,deadline_ts:T+30000});
 assert.match(discoveryBody.query,/market_containsInsensitive/);assert.equal(discoveryBody.variables.market,market);assert.equal(out.status,'GMX_ACQUIRED_SCOPED_CONTEXT');assert.ok(out.requests<=4);assert.equal(verifyScopedProviderAcquisition(out.acquisition),true);assert.ok(out.acquisition.above.length+out.acquisition.below.length>0);
});

test('GMX empty exact market exposes bounded diagnostics without inventing zones',async()=>{
 const market='0x1111111111111111111111111111111111111111',fetch_impl=async()=>response({data:{positions:[]}}),collect=createGmxRuntimeCollector({fetch_impl,clock:()=>T}),out=await collect({contract:'FIL-USDT',native_symbol:'FIL',run_id:'r-empty',acquisition_id:'g-empty',market_address:market,deadline_ts:T+30000});
 assert.equal(out.status,'GMX_NATIVE_SAMPLE_NOT_CLOSED');assert.equal(out.requests,1);assert.equal(out.discovery_positions,0);assert.equal(out.selected_accounts,0);assert.equal(out.account_http_closed,0);assert.deepEqual(out.normalization_statuses,[]);
});
