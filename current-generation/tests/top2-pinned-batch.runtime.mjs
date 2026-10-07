import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {test} from 'node:test';
const root=path.resolve(process.env.REPORT2_TEST_RUNTIME||'runtime'),load=f=>import(pathToFileURL(path.join(root,'src/liquidation-extension',f)));
const pin=await load('gtrade-pinned-position-snapshot.mjs'),{normalizeGTrade,resolveGTradeCryptoMarket}=await load('gtrade.mjs'),{createGTradeRuntimeCollector}=await load('gtrade-runtime-collector.mjs'),bridge=await load('gtrade-runtime-bridge.mjs'),{nativeLiquidationLines,validateNativeLiquidationContext}=await import(pathToFileURL(path.join(root,'src/native-liquidation-guard.mjs')));
const require=createRequire(path.join(root,'src/liquidation-extension/package.json')),sdk=require('@gainsnetwork/sdk'),{ethers}=require('ethers'),iface=new ethers.utils.Interface(JSON.parse(fs.readFileSync('tools/gtrade-chain-abi.json','utf8')));
const fixture=path.resolve('original-source'),read=f=>JSON.parse(gunzipSync(fs.readFileSync(path.join(fixture,f)))),raws=read('verified-pinned-trades.json.gz'),variables=read('rest-1.json.gz').payload,prices=read('rest-3.json.gz').payload,proof=JSON.parse(fs.readFileSync(path.join(fixture,'gtrade-pinned-source-proof.json')));
assert.equal(proof.status,'ACTUAL_PINNED_POSITION_CLOCK_AND_EXISTING_SDK_EVALUATION_COMPLETED');assert.equal(proof.head,'fdbdfe2e1945b21ef531a5398ddc8e77d70d28b0');
const T=1791273618880,hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex'),clone=v=>JSON.parse(JSON.stringify(v));
const components=name=>iface.getFunction(name).outputs[0].components;
const tuple=(raw,name)=>components(name).map(p=>raw[p.name]);
function responses(selected,{closed=false}={}){
 const make=(id,result)=>({jsonrpc:'2.0',id,result});
 const trades=selected.map(x=>({...x.trade,...(closed?{isOpen:false}:{})}));
 return [make(1,'0xa4b1'),make(2,{number:ethers.utils.hexValue(variables.currentBlock),timestamp:ethers.utils.hexValue(proof.source_clock.block_source_ts/1000),hash:proof.source_clock.block_hash}),
 make(3,iface.encodeFunctionResult('getAllTradesForTraders',[trades.map(x=>tuple(x,'getAllTradesForTraders'))])),
 make(4,iface.encodeFunctionResult('getAllTradeInfosForTraders',[selected.map(x=>tuple(x.tradeInfo,'getAllTradeInfosForTraders'))])),
 make(5,iface.encodeFunctionResult('getAllTradesLiquidationParamsForTraders',[selected.map(x=>tuple(x.liquidationParams,'getAllTradesLiquidationParamsForTraders'))])),
 make(6,iface.encodeFunctionResult('getTradeFeesDataArray',[selected.map(x=>tuple(x.tradeFeesData,'getTradeFeesDataArray'))])),
 ...selected.map((x,i)=>make(i+7,iface.encodeFunctionResult('getBorrowingInitialAccFees',[tuple(x.initialAccFees,'getBorrowingInitialAccFees')])))]
}
const receipts=[read('rest-1.json.gz').receipt,read('rest-2.json.gz').receipt,read('rest-3.json.gz').receipt];
function fixtureFor(symbol){
 const market=resolveGTradeCryptoMarket(variables,symbol),selected=raws.filter(x=>Number(x.trade.pairIndex)===market.pair_index),body=pin.buildGTradePinnedRpcBatch({current_block:variables.currentBlock,selected}),response=responses(selected),receipt={http_status:200,received_ts:T,sha256:hash(response)};
 return {market,selected,body,response,receipt,decoded:pin.decodeGTradePinnedRpcSnapshot({body,response,selected,current_block:variables.currentBlock,pair_index:market.pair_index,receipt,as_of_ms:T})};
}

const {createCombinedLiquidationService}=await load('combined-runner-service.mjs');

function batchService({denied=false,invalid=false,batchContracts=['ZEC-USDT','QNT-USDT']}={}){
 let now=T;const calls=[],grants=[];
 const s=createCombinedLiquidationService({mode:'SHADOW_ONLY',candidate_slots:2,max_http_per_run:5,max_total_ms:45000,clock:()=>now,sdk_loader:()=>({version:'1.8.10',sdk}),provider_admit:async request=>{grants.push(request);return denied&&request.reservation_id.includes('PINNED_POSITION')?{allowed:false,new_reservation:false,reservation_not_created:true,reason:'CONTROLLED_PROVIDER_DENIAL'}:{allowed:true,new_reservation:true};},fetch_impl:async(url,init={})=>{
  calls.push(String(url));let payload;
  if(String(url).includes('api.hyperliquid.xyz'))payload=[{universe:[]},[]];
  else if(String(url)===pin.GTRADE_RPC){const body=JSON.parse(init.body),selected=[...pin.selectGTradePinnedPositionSample(raws,resolveGTradeCryptoMarket(variables,'ZEC').pair_index).selected,...pin.selectGTradePinnedPositionSample(raws,resolveGTradeCryptoMarket(variables,'QNT').pair_index).selected];assert.deepEqual(body,pin.buildGTradePinnedRpcBatch({current_block:variables.currentBlock,selected}));payload=responses(selected);if(invalid)payload[1].result.hash='0xBAD';}
  else payload=String(url).endsWith('/trading-variables')?variables:String(url).endsWith('/charts')?prices:raws;
  return new Response(JSON.stringify(payload),{status:200});
 }});
 const collect=symbol=>s.collect({contract:symbol+'-USDT',native_symbol:symbol,run_id:'BATCH',deep_started_ts:now,max_deep_ms:45000,max_http_for_candidate:5,allowed_source_ids:['GTRADE_NATIVE'],position_batch_contracts:batchContracts});
 return{s,calls,grants,collect,advance:ms=>{now+=ms;}};
}
test('retained exact ZEC and QNT positions verified together survive a later deep check after the shared source deadline',async()=>{
 const f=batchService(),a=await f.collect('ZEC');assert.equal(a.gtrade.source_clock_closed,true);assert.equal(a.gtrade.above.length+a.gtrade.below.length,1);assert.equal(f.calls.length,4);
 f.advance(70000);const b=await f.collect('QNT');assert.equal(b.gtrade.source_clock_closed,true);assert.equal(b.gtrade.above.length+b.gtrade.below.length,4);assert.equal(f.calls.length,4);assert.equal(f.grants.length,3);
 assert.equal(a.gtrade.positions_source_ts,b.gtrade.positions_source_ts);assert.equal(a.gtrade.positions_block_hash,b.gtrade.positions_block_hash);assert.notEqual(a.gtrade.acquisition_fingerprint,b.gtrade.acquisition_fingerprint);assert.equal(b.gtrade.contract,'QNT-USDT');assert.equal(a.gtrade.contract,'ZEC-USDT');
 assert.equal(b.gtrade.complete_position_census,false);assert.equal(b.gtrade.entry_eligible,false);assert.equal(f.s.summary().shared_budget.actual_http,4);assert.ok(f.s.summary().shared_budget.reserved_http<=5);
 assert.deepEqual(f.s.summary().routed.map(x=>x.position_proof.status),['GTRADE_PINNED_OPEN_POSITIONS_CLOSED','GTRADE_PINNED_OPEN_POSITIONS_CLOSED']);
 fs.writeFileSync('audit-output/top2-pinned-batch-proof.json',JSON.stringify({scope:'RETAINED_ACTUAL_POSITIONS_AND_INPUTS_AT_ORIGINAL_CLOCK; COMPOSED_TRANSPORT_REPLY; CONTROLLED_70_SECOND_DEEP_GAP; NOT_FRESH_PRODUCTION',sourceHTTP:0,MAIN:0,production_D1:0,Telegram:0,source_clock_closed:true,markets:['ZEC','QNT'],verified_positions:[1,4],injected_calls:f.calls.length,HTTP_cap:5,max_source_phase_ms:45000,source_timestamps_preserved:true,old_unknown_clock_not_upgraded:true,summary:f.s.summary()},null,2));
});
test('one unsupported native catalog plus the real shared calculated pair fits all five requests',async()=>{
 const f=batchService();
 const unsupported=await f.s.collect({contract:'ZEC-USDT',native_symbol:'ZEC',run_id:'BATCH',deep_started_ts:T,max_http_for_candidate:5,allowed_source_ids:['HYPERLIQUID_NATIVE']});
 assert.equal(unsupported,null);assert.equal(f.calls.length,1);
 const a=await f.collect('ZEC'),b=await f.collect('QNT');
 assert.equal(a.gtrade.source_clock_closed,true);assert.equal(b.gtrade.source_clock_closed,true);
 assert.equal(f.calls.length,5);assert.equal(f.s.summary().shared_budget.actual_http,5);
});
test('an unsupported second calculated market cannot borrow the following native pair reserve',async()=>{
 const f=batchService({batchContracts:['ZEC-USDT','NOTREAL-USDT']}),a=await f.collect('ZEC');
 assert.equal(a.gtrade.source_clock_closed,false);assert.equal(f.calls.length,3);
 assert.equal(f.s.summary().following_candidate_minimum_http,2);
});
test('batch denial and invalid source proof never upgrade either market; no unadmitted retry for the second',async()=>{
 for(const options of [{denied:true},{invalid:true}]){const f=batchService(options),a=await f.collect('ZEC');f.advance(70000);const b=await f.collect('QNT');assert.equal(a.gtrade.source_clock_closed,false);assert.equal(b.gtrade.source_clock_closed,false);assert.equal(f.calls.length,options.denied?3:4);assert.ok(f.s.summary().routed.every(x=>x.position_proof.source_clock_closed===false));if(options.denied)assert.equal(f.s.summary().routed[1].position_proof.reason,'UPSTREAM_QUOTA_NOT_GRANTED:CONTROLLED_PROVIDER_DENIAL');}
});
test('batch receipt reused at its original clock becomes unusable when original inputs expire',async()=>{
 const f=batchService();await f.collect('ZEC');f.advance(300001);const b=await f.collect('QNT');assert.equal(b,null);assert.equal(f.calls.length,4);
});
test('mixed-market decoder binds only the requested market and rejects third markets, duplicates and larger samples',()=>{
 const selected=raws.filter(x=>['QNT','ZEC'].some(symbol=>Number(x.trade.pairIndex)===resolveGTradeCryptoMarket(variables,symbol).pair_index)),body=pin.buildGTradePinnedRpcBatch({current_block:variables.currentBlock,selected}),response=responses(selected),receipt={http_status:200,received_ts:T,sha256:hash(response)};
 assert.equal(selected.length,5);assert.equal(body.length,11);assert.ok(pin.permittedGTradePinnedRpcBatch(body));
 const q=pin.decodeGTradePinnedRpcSnapshot({body,response,selected,current_block:variables.currentBlock,pair_index:resolveGTradeCryptoMarket(variables,'QNT').pair_index,receipt,as_of_ms:T});assert.equal(q.trades.length,4);assert.equal(q.evidence.selected_discovery_positions,4);assert.equal(q.evidence.shared_batch_selected_positions,5);assert.ok(q.trades.every(x=>Number(x.trade.pairIndex)===q.evidence.pair_index));
 assert.throws(()=>pin.decodeGTradePinnedRpcSnapshot({body,response,selected,current_block:variables.currentBlock,pair_index:9999,receipt,as_of_ms:T}),/REQUESTED_MARKET_NOT_SELECTED/);
 assert.throws(()=>pin.buildGTradePinnedRpcBatch({current_block:variables.currentBlock,selected:[...selected,selected[0]]}),/SELECTION_INVALID/);
 const third=raws.find(x=>Number(x.trade.pairIndex)===resolveGTradeCryptoMarket(variables,'ADA').pair_index);assert.throws(()=>pin.buildGTradePinnedRpcBatch({current_block:variables.currentBlock,selected:[...selected,third]}),/MARKET_SAMPLE_BOUND/);
 const extra=clone(selected[1]);extra.trade.index=9999;assert.throws(()=>pin.buildGTradePinnedRpcBatch({current_block:variables.currentBlock,selected:[...selected,extra]}),/MARKET_SAMPLE_BOUND/);
 for(const mutate of [b=>{b[0].method='eth_sendRawTransaction';},b=>{b[2].params[1]='latest';},b=>{b[2].params[0].value='0x1';},b=>{b[2].params[0].to='0x'+'1'.repeat(40);},b=>{b.push(...clone(b));}]){const b=clone(body);mutate(b);assert.equal(pin.permittedGTradePinnedRpcBatch(b),false);}
});
