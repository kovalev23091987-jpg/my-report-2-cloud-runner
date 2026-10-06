import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {gunzipSync} from 'node:zlib';import {pathToFileURL} from 'node:url';import {createRequire} from 'node:module';
const root=path.resolve(process.env.REPORT2_TEST_RUNTIME||'runtime');
const {createCombinedLiquidationService}=await import(pathToFileURL(path.join(root,'src/liquidation-extension/combined-runner-service.mjs')));
const require=createRequire(path.join(root,'src/liquidation-extension/package.json')),sdk=require('@gainsnetwork/sdk');
const original=path.resolve('priority-source'),read=n=>JSON.parse(gunzipSync(fs.readFileSync(path.join(original,n))));
const source=JSON.parse(fs.readFileSync(path.join(original,'gtrade-one-batch-live-proof.json'))),variables=read('rest-1.json.gz').payload,trades=read('rest-2.json.gz').payload,prices=read('rest-3.json.gz').payload,rpc=read('actual-single-pinned-rpc.json.gz');
assert.equal(source.head,'f726ed08575bedd4240f7c98f566e5cee678c3a3');assert.equal(source.selection.symbol,'AAVE');assert.equal(source.source_clock_closed,true);
const T=source.completed_ts,rows=[{source_id:'GMX_NATIVE',attempts:78,reliability:1},{source_id:'GTRADE_NATIVE',attempts:100,reliability:.2}];
const params={contract:'AAVE-USDT',native_symbol:'AAVE',run_id:'ORIGINAL_CLOCK_COMPOSED_SOURCE_REPLAY',deep_started_ts:T,max_deep_ms:45000,max_http_for_candidate:5,allowed_source_ids:['GMX_NATIVE','GTRADE_NATIVE'],source_identity:{gmx_market_address:'0x'+'1'.repeat(40)}};
function service({unsupported=false,denied=false,rpcAllowed=true}={}){
 const urls=[],grants=[];const s=createCombinedLiquidationService({mode:'SHADOW_ONLY',clock:()=>T,max_http_per_run:5,provider_admit:async grant=>{grants.push(grant);if(denied&&Object.hasOwn(grant.requests||{},'GTRADE'))return{allowed:false,new_reservation:false,reservation_not_created:true,reason:'CONTROLLED_PROVIDER_ADMISSION_DENIED'};return{allowed:true,new_reservation:true};},sdk_loader:()=>({version:'1.8.10',sdk}),source_weight_store:{load:async()=>rows,record:async()=>({recorded:true}),recordRole:async()=>({recorded:true})},fetch_impl:async(url,init={})=>{
  urls.push(String(url));let payload;
  if(String(url).endsWith('/trading-variables'))payload=unsupported?{...variables,pairs:[{from:'OTHER',to:'USD',groupIndex:'0'}]}:variables;
  else if(String(url).endsWith('/open-trades'))payload=trades;
  else if(String(url).endsWith('/charts'))payload=prices;
  else if(String(url)==='https://arb1.arbitrum.io/rpc'){if(!rpcAllowed)return new Response('{}',{status:429});assert.deepEqual(JSON.parse(init.body),rpc.receipt.request_body);payload=rpc.payload;}
  else if(String(url).includes('gmx.squids.live'))payload={data:{positions:[]}};
  else throw Error('UNEXPECTED_SOURCE_IN_OFFLINE_REPLAY');
  return new Response(JSON.stringify(payload),{status:200});
 }});return{s,urls,grants};
}
test('actual saved AAVE market, position, margin and fee inputs receive the existing five-request envelope before receipt-only GMX',async()=>{
 const {s,urls}=service(),out=await s.collect(params),summary=s.summary();
 assert.equal(summary.routed[0].lane,'GTRADE_NATIVE');assert.equal(summary.routed[0].status,'GTRADE_ACQUIRED_SCOPED_CONTEXT',JSON.stringify(summary.routed));assert.equal(urls.length,4);assert.ok(urls.every(u=>u.includes('gains.trade')||u==='https://arb1.arbitrum.io/rpc'));
 assert.equal(out.gtrade.source_clock_closed,true);assert.equal(out.gtrade.above.length+out.gtrade.below.length,4);assert.equal(out.gtrade.complete_position_census,false);assert.equal(out.gtrade.entry_eligible,false);
 assert.equal(summary.shared_budget.actual_http,4);assert.ok(summary.shared_budget.reserved_http<=5);assert.equal(summary.routed.find(r=>r.lane==='GMX_NATIVE').status,'SKIPPED_CANDIDATE_HTTP_ENVELOPE');
 fs.mkdirSync('audit-output',{recursive:true});fs.writeFileSync('audit-output/position-clock-source-priority-proof.json',JSON.stringify({scope:'ACTUAL_RETAINED_AAVE_INPUTS_ORIGINAL_CLOCK_WITH_CONTROLLED_GMX_PRIORITY_ENVIRONMENT_NOT_FRESH_TOP2',source_cloud_run:37435081885,source_head:source.head,sourceHTTP:0,MAIN:0,Telegram:0,production_D1:0,injected_source_responses:urls.length,positions:4,known_position_clock:true,sdk_estimates_labelled:true,new_htx_target:false,total_http_cap:5,routed:summary.routed,shared_budget:summary.shared_budget},null,2));
});
test('unsupported exact gTrade market falls through to GMX without creating a position clock or burning the whole envelope',async()=>{
 const {s,urls}=service({unsupported:true}),out=await s.collect(params);assert.equal(out,null);assert.equal(s.summary().routed[0].status,'GTRADE_SYMBOL_UNSUPPORTED');assert.equal(urls.length,2);assert.ok(urls[1].includes('gmx.squids.live'));assert.ok(s.summary().shared_budget.reserved_http<=5);
});
test('provider denial makes no unadmitted gTrade request and keeps the existing fallback',async()=>{
 const {s,urls}=service({denied:true});await s.collect(params);assert.ok(s.summary().routed[0].status.startsWith('QUOTA_NOT_GRANTED'));assert.equal(urls.length,1);assert.ok(urls[0].includes('gmx.squids.live'));assert.equal(s.summary().shared_budget.outside_shared_budget_http,undefined);
});
test('rate-limited position proof cannot become a fresh map or new HTX target',async()=>{
 const {s,urls}=service({rpcAllowed:false}),out=await s.collect(params);assert.equal(urls.length,4);assert.ok(out===null||out.gtrade.source_clock_closed===false);assert.ok(s.summary().shared_budget.actual_http<=5);if(out?.gtrade)assert.equal(out.gtrade.entry_eligible,false);
});
