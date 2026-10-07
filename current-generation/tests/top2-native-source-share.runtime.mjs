import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {gunzipSync} from 'node:zlib';import {pathToFileURL} from 'node:url';
const root=path.resolve(process.env.REPORT2_TEST_RUNTIME||'current-generation/files');
const {createCombinedLiquidationService}=await import(pathToFileURL(path.join(root,'src/liquidation-extension/combined-runner-service.mjs')));
const original=path.resolve(process.env.REPORT2_GTRADE_SOURCE||'priority-source');
const source=JSON.parse(fs.readFileSync(path.join(original,'gtrade-one-batch-live-proof.json')));
const variables=JSON.parse(gunzipSync(fs.readFileSync(path.join(original,'rest-1.json.gz')))).payload,T=source.completed_ts;
const addresses=[1,2,3].map(n=>'0x'+String(n).repeat(40));
const proof={schema:'TOP2_NATIVE_SOURCE_SHARE_COMPONENT_REPLAY_V1',scope:'CONTROLLED_HL_ACCOUNT_PAYLOADS_WITH_RETAINED_ACTUAL_GTRADE_CATALOG_AT_ITS_ORIGINAL_CLOCK_NOT_ACTUAL_MARKET_LEVEL_ACCEPTANCE',original_source_head:source.head,original_catalog_clock:T,sourceHTTP:0,MAIN:0,production_D1:0,Telegram:0,cases:[]};
function service(candidate_slots=1,{denied=false}={}){
 const urls=[];let grants=0;
 const sdk={getLiquidationPrice(){throw Error('NO_SYNTHETIC_CALCULATED_PRICE')},buildLiquidationPriceContext(){throw Error('UNSUPPORTED_CATALOG_MUST_STOP_BEFORE_CALCULATION')}};
 const s=createCombinedLiquidationService({mode:'SHADOW_ONLY',candidate_slots,clock:()=>T,accounts_per_deep:3,max_http_per_run:5,sdk_loader:()=>({version:'1.8.10',sdk}),provider_admit:async p=>{grants++;return denied?{allowed:false,new_reservation:false,reservation_not_created:true,reason:'CONTROLLED_PROVIDER_DENIAL'}:{allowed:true,new_reservation:true};},fetch_impl:async(url,init={})=>{
  urls.push(String(url));let payload;
  if(String(url).includes('hyperliquid.xyz')){const body=JSON.parse(init.body);if(body.type==='metaAndAssetCtxs')payload=[{universe:[{name:'FIL',szDecimals:2}]},[{markPx:'1.1',oraclePx:'1.1',openInterest:'1000',funding:'0'}]];else{assert.equal(body.type,'clearinghouseState');const i=addresses.indexOf(body.user);assert(i>=0);payload={time:T,marginSummary:{accountValue:'100',totalNtlPos:'11',totalMarginUsed:'5'},assetPositions:[{position:{coin:'FIL',szi:i===1?'-10':'10',entryPx:'1',positionValue:'11',liquidationPx:i===1?'1.5':'.6',marginUsed:'5',unrealizedPnl:'1',leverage:{type:'cross',value:2}}}]};}}
  else if(String(url).includes('node.liqflow.app'))payload={coin:'FIL',total:3,page:1,positions:addresses.map((address,i)=>({address,size:i===1?-10:10,liq_price:i===1?1.5:.6}))};
  else if(String(url).endsWith('/trading-variables'))payload=variables;
  else throw Error('UNEXPECTED_OR_NEW_SOURCE_IN_OFFLINE_REPLAY');
  return new Response(JSON.stringify(payload));
 }});
 return{s,urls,get grants(){return grants;}};
}
const params=(contract,allowed_source_ids)=>({contract,native_symbol:contract.replace(/-USDT$/,''),run_id:'CONTROLLED_SEQUENTIAL_TOP2',deep_started_ts:T,max_http_for_candidate:5,allowed_source_ids});
test('reproduce the actual first-leader-five-calls starvation pattern without new market calls',async()=>{
 const {s,urls}=service();const first=await s.collect(params('FIL-USDT',['HYPERLIQUID_NATIVE']));assert(first);assert.equal(urls.length,5);
 const second=await s.collect(params('龙虾-USDT',['GTRADE_NATIVE']));assert.equal(second,null);assert.equal(urls.length,5);assert.equal(s.summary().routed.at(-1).status,'QUOTA_NOT_GRANTED:COMBINED_TOTAL_HTTP_BUDGET');
 proof.cases.push({case:'BASELINE_FIRST_NATIVE_FIVE_SECOND_CATALOG_DENIED',first_accounts:first.accounts.length,total_http:urls.length,second_status:s.summary().routed.at(-1).status});
});
test('two-slot policy preserves a complete native verification pair for the second candidate',async()=>{
 const {s,urls}=service(2);const first=await s.collect(params('FIL-USDT',['HYPERLIQUID_NATIVE']));assert(first);assert.equal(first.accounts.length,1);assert.equal(urls.length,3);
 const second=await s.collect(params('龙虾-USDT',['GTRADE_NATIVE']));assert.equal(second,null);assert.equal(urls.length,4);assert.equal(s.summary().shared_budget.actual_http,4);
 const route=s.summary().routed.at(-1);assert.equal(route.status,'GTRADE_SYMBOL_UNSUPPORTED');assert.equal(route.source_outcome.evaluated,true);assert.equal(route.source_outcome.coverage_status,'UNSUPPORTED');
 assert.equal(first.provenance.model_prices_used_as_evidence,undefined);assert.equal(first.provenance.raw_model_prices_used,false);
 proof.cases.push({case:'TWO_SLOT_COMPLETE_NATIVE_PAIR_RESERVED_AND_SECOND_REAL_CATALOG',first_accounts:1,total_http:4,second_status:route.status,retained_catalog_actual:true,first_account_payloads_controlled:true,new_second_levels:false,entry_authorized:false});
});
test('manual single-slot collection retains its existing three-account five-call sample',async()=>{
 const {s,urls}=service(1);const first=await s.collect(params('FIL-USDT',['HYPERLIQUID_NATIVE']));assert.equal(first.accounts.length,3);assert.equal(urls.length,5);
});
test('provider denial is preserved and cannot spend the protected source reserve',async()=>{
 const {s,urls}=service(2,{denied:true});assert.equal(await s.collect(params('FIL-USDT',['HYPERLIQUID_NATIVE'])),null);assert.equal(urls.length,0);assert.equal(s.summary().shared_budget.actual_http,0);
});
test('invalid slot counts cannot increase the source quota or fabricate coverage',()=>{
 for(const candidate_slots of [0,3,-1,1.5])assert.throws(()=>createCombinedLiquidationService({mode:'SHADOW_ONLY',candidate_slots}),/CANDIDATE_SLOTS_INVALID/);
});
test.after(()=>{fs.mkdirSync('audit-output',{recursive:true});fs.writeFileSync('audit-output/top2-source-share-proof.json',JSON.stringify(proof,null,2)+'\n');});
