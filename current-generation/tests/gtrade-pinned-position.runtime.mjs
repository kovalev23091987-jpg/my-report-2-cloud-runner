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
test('actual pinned positions and actual margin/fee inputs reach labelled bounded context without becoming HTX prices or votes',()=>{
 const counts={ADA:1,BTC:2,QNT:4,ZEC:1};const rows=[];
 for(const [symbol,count]of Object.entries(counts)){
  const f=fixtureFor(symbol),c={symbol,route_symbol:symbol,run_id:'ORIGINAL_COMPONENT_REPLAY',snapshot_id:symbol,as_of_ms:T,received_at_ms:T,max_age_ms:300000};
  const n=normalizeGTrade({variables,trades:f.decoded.trades,prices,receipts:[...receipts,f.receipt],pinned_positions:f.decoded.evidence},c,sdk);
  assert.equal(n.usable_for_context,true);assert.equal(n.source_clock_closed,true);assert.equal(n.zones.length,count);assert.equal(n.positions_source_ts,1791273469000);assert.equal(n.source_ts,1791273420464);assert.equal(n.same_block_atomic,false);assert.equal(n.complete_position_census,false);assert.equal(n.evidence_class,'NATIVE_POSITION_FEE_AWARE_ESTIMATES');
  assert.ok(n.zones.every(x=>x.native_price>0&&x.notional>0&&x.price_semantics==='OFFICIAL_SDK_ESTIMATE_INDEX_TRIGGER'));assert.equal(n.execution_target_eligible,false);assert.equal(n.automatic_execution,false);
  const acq=bridge.createGTradeAcquisition({contract:symbol+'-USDT',native_symbol:symbol,run_id:c.run_id,acquisition_id:symbol,collection_started_ts:T-100,collection_completed_ts:T,normalized_receipt:n,transport_receipts:[...receipts,f.receipt]});
  assert.equal(acq.schema,'SCOPED_PROVIDER_LIQUIDATION_ACQUISITION_V1');const context=bridge.bindGTradeAcquisition(acq,{contract:symbol+'-USDT',run_id:c.run_id,snapshot_id:symbol,observed_ts:T});
  assert.equal(context.source_clock_closed,true);assert.equal(context.entry_eligible,false);assert.equal(context.independent_vote_added,false);assert.equal(context.prices_converted_to_htx,false);
  const liquidations={independent_extensions:[context]};assert.equal(validateNativeLiquidationContext({metadata:{contract:symbol+'-USDT'},run_id:c.run_id,snapshot_id:symbol,observed_ts:T,direction:null,liquidations}).ok,true);
  const rendered=nativeLiquidationLines(liquidations,{manual:true})||[];assert.ok(rendered.length>0);
  rows.push({symbol,received_actual_positions:count,estimated_levels:n.zones.length,source_clock_known:true,whole_state_atomic:false,entry_eligible:false,context_source_ts:n.source_ts,rendered});
 }
 fs.writeFileSync('audit-output/pinned-actual-component-replay.json',JSON.stringify({scope:'ORIGINAL_SAME_BLOCK_ACTUAL_INPUT_COMPONENT_REPLAY_NOT_FRESH_MAIN',sourceHTTP:0,MAIN:0,Telegram:0,rows},null,2));
});
test('unproved backend clocks remain unknown; future/stale/corrupt or different-market pinned proofs fail closed',()=>{
 const f=fixtureFor('QNT'),c={symbol:'QNT',run_id:'R',snapshot_id:'S',as_of_ms:T,received_at_ms:T,max_age_ms:300000};
 const args={variables,trades:f.decoded.trades,prices,receipts:[...receipts,f.receipt],pinned_positions:f.decoded.evidence};
 for(const evidence of [{...f.decoded.evidence,positions_source_ts:T+1},{...f.decoded.evidence,pair_index:f.market.pair_index+1},{...f.decoded.evidence,trades_fingerprint:'0'.repeat(64)}]){
  const n=normalizeGTrade({...args,pinned_positions:evidence},c,sdk);assert.equal(n.usable_for_context,false);
 }
 const late=normalizeGTrade(args,{...c,as_of_ms:T+300001,received_at_ms:T+300001},sdk);assert.equal(late.usable_for_context,false);
 const unknown=normalizeGTrade({...args,receipts,pinned_positions:null},c,sdk);assert.equal(unknown.source_clock_closed,false);assert.equal(unknown.positions_source_ts,null);
 const duplicate=clone(f.response);duplicate[1].id=1;assert.throws(()=>pin.decodeGTradePinnedRpcSnapshot({...f,response:duplicate,current_block:variables.currentBlock,pair_index:f.market.pair_index,as_of_ms:T}),/RESPONSE|ID/);
 const closed=pin.decodeGTradePinnedRpcSnapshot({...f,response:responses(f.selected,{closed:true}),current_block:variables.currentBlock,pair_index:f.market.pair_index,as_of_ms:T});
 assert.equal(closed.trades.length,0);assert.equal(closed.evidence.excluded_positions.length,4);
});
test('one additional admitted batch preserves source budget, cached original clocks and denial fallback',async()=>{
 let gets=0,posts=0,admissions=0;
 const f=fixtureFor('QNT'),fake=async(url,init={})=>{
  if(String(url)===pin.GTRADE_RPC){posts++;assert.equal(init.method,'POST');const body=JSON.parse(init.body);assert.ok(pin.permittedGTradePinnedRpcBatch(body));assert.ok(body.length<=10);return new Response(JSON.stringify(f.response),{status:200});}
  gets++;const value=String(url).endsWith('/trading-variables')?variables:String(url).endsWith('/charts')?prices:raws;
  return new Response(JSON.stringify(value),{status:200});
 };
 const collect=createGTradeRuntimeCollector({sdk,fetch_impl:fake,clock:()=>T});
 const params={contract:'QNT-USDT',native_symbol:'QNT',run_id:'R',acquisition_id:'A',deadline_ts:T+20000,snapshot_admitted:true,admit_position_snapshot:async()=>{admissions++;return{allowed:true,new_reservation:true};}};
 const a=await collect(params);assert.equal(a.position_source_clock_known,true);assert.equal(a.requests,4);assert.equal(gets,3);assert.equal(posts,1);assert.equal(admissions,1);
 const b=await collect({...params,acquisition_id:'A2'});assert.equal(b.requests,0);assert.equal(gets,3);assert.equal(posts,1);assert.equal(b.acquisition.source_ts,a.acquisition.source_ts);
 const denied=createGTradeRuntimeCollector({sdk,fetch_impl:fake,clock:()=>T});const d=await denied({...params,run_id:'DENIED',admit_position_snapshot:async()=>({allowed:false,new_reservation:false,reason:'COMBINED_TOTAL_HTTP_BUDGET'})});
 assert.equal(d.position_source_clock_known,false);assert.equal(d.requests,3);assert.equal(posts,1);assert.equal(d.pinned_position_status,'SKIPPED_GTRADE_PINNED_POSITION_BUDGET');
});
test('new public RPC transport only permits bounded calls to the verified diamond at one explicit block',()=>{
 const f=fixtureFor('QNT');assert.ok(pin.permittedGTradePinnedRpcBatch(f.body));assert.equal(f.body.length,10);
 for(const mutate of [b=>{b[0].method='eth_sendRawTransaction';},b=>{b[2].params[1]='latest';},b=>{b[2].params[0].to='0x'+'1'.repeat(40);},b=>{b[2].params[0].value='0x1';},b=>{b[2].params[1]='0x123';},b=>{b.push(b[0]);}]){
  const body=clone(f.body);mutate(body);assert.equal(pin.permittedGTradePinnedRpcBatch(body),false);
 }
});
