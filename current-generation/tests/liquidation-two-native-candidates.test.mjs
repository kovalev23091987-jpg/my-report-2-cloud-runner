import test from 'node:test';
import assert from 'node:assert/strict';
import {createCombinedLiquidationService} from '../files/src/liquidation-extension/combined-runner-service.mjs';
import {bindNativeAcquisition} from '../files/src/liquidation-extension/runtime-bridge.mjs';
const T=Date.parse('2026-10-07T06:30:00Z'),address='0x'+'1'.repeat(40);
// Controlled transport reproduces the retained09:30 FIL→NEAR budget shape.
// Prices are test values, never advertised as real market levels.
function service({firstUnsupported=false,denied=false,slots=2}={}){
 const calls=[],grants=[],s=createCombinedLiquidationService({mode:'SHADOW_ONLY',candidate_slots:slots,clock:()=>T,secondary_enabled:false,provider_admit:async r=>{grants.push(r);return denied?{allowed:false,new_reservation:false,reservation_not_created:true}:{allowed:true,new_reservation:true};},fetch_impl:async(url,init={})=>{
  calls.push({url:String(url),body:init.body?JSON.parse(init.body):null});let body;
  if(String(url).includes('node.liqflow.app')){const coin=String(url).includes('/NEAR/')?'NEAR':'FIL';body={coin,positions:[{address,size:10,liq_price:.7}]};}
  else if(JSON.parse(init.body).type==='metaAndAssetCtxs')body=[{universe:[...(firstUnsupported?[]:[{name:'FIL'}]),{name:'NEAR'}]},[{markPx:'1'},{markPx:'1'}]];
  else body={time:T,marginSummary:{accountValue:'10',totalNtlPos:'10',totalMarginUsed:'5'},assetPositions:['FIL','NEAR'].map(coin=>({position:{coin,szi:'10',entryPx:'1',positionValue:'10',liquidationPx:'.7',marginUsed:'5',unrealizedPnl:'0',leverage:{type:'cross',value:2}}}))};
  return new Response(JSON.stringify(body));
 }});return{s,calls,grants};
}
const params=contract=>({contract,native_symbol:contract.split('-')[0],run_id:'CONTROLLED_RETAINED_0930_SHAPE',deep_started_ts:T,max_http_for_candidate:5,allowed_source_ids:['HYPERLIQUID_NATIVE']});
test('both selected native markets obtain a verified sample within five total source requests',async()=>{
 const f=service(),first=await f.s.collect(params('FIL-USDT')),second=await f.s.collect(params('NEAR-USDT'));
 assert.equal(first.accounts.length,1);assert.equal(second.accounts.length,1);assert.equal(f.calls.length,4);assert.equal(f.calls.filter(c=>c.body?.type==='metaAndAssetCtxs').length,1);assert.equal(f.calls.filter(c=>c.body?.type==='clearinghouseState').length,1);assert.equal(second.provenance.reused_native_accounts,1);
 for(const [raw,contract] of [[first,'FIL-USDT'],[second,'NEAR-USDT']]){const c=bindNativeAcquisition(raw,{contract,run_id:raw.run_id,snapshot_id:'S:'+contract,observed_ts:T,direction:'LONG'});assert.equal(c.status,'USABLE_NATIVE_SAMPLE',JSON.stringify(c));assert.equal(c.returned_positive_levels,1);assert.equal(c.coverage,'BOUNDED_ACCOUNT_SAMPLE_NOT_FULL_MARKET');assert.equal(c.entry_eligible,false);}
 assert.equal(f.s.summary().shared_budget.actual_http,4);assert.equal(f.s.summary().following_candidate_minimum_http,2);
});
test('unsupported first market does not reserve imaginary account transport and leaves second market usable',async()=>{
 const f=service({firstUnsupported:true});assert.equal(await f.s.collect(params('FIL-USDT')),null);const second=await f.s.collect(params('NEAR-USDT'));assert.ok(second);assert.ok(f.calls.length<=5);
});
test('provider refusal performs no transport and cannot reset or increase caps',async()=>{
 const f=service({denied:true});assert.equal(await f.s.collect(params('FIL-USDT')),null);assert.equal(await f.s.collect(params('NEAR-USDT')),null);assert.equal(f.calls.length,0);assert.equal(f.s.summary().shared_budget.actual_http,0);
});
