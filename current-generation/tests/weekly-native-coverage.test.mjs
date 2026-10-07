import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createWeeklyNativeCoverageSession} from '../../runner/weekly-native-coverage-session.mjs';
import {normalizeNativeHL} from '../files/src/liquidation-extension/providers.mjs';
import {qualifyNumericFutureReceipt} from '../files/src/liquidation-futures-coverage.mjs';
const raw=JSON.parse(gunzipSync(fs.readFileSync('checkpoints/native-pair-actual-37584872997.json.gz'))),near=raw.acquisitions.find(x=>x.native_symbol==='NEAR'),account=near.accounts[0],T=near.collection_completed_ts;
function fixture({denied=false,missingClock=false}={}){
 let now=T,remaining=3;const calls=[],grants=[];
 const session=createWeeklyNativeCoverageSession({run_id:raw.run_id,clock:()=>now,available_requests:()=>remaining,on_request:p=>{remaining--;calls.push(p);},source_admit:async r=>{grants.push(r);return{allowed:!denied,new_reservation:!denied};},select_accounts:()=>({selected:[{address:account.address}]}),normalize_native:normalizeNativeHL,read_json:async(url,options)=>{
  if(options.body?.type==='metaAndAssetCtxs')return{ok:true,payload:[{universe:[{name:'NEAR'},{name:'BTC'}]},[]],receipt:{received_ts:T,sha256:'a'.repeat(64)}};
  if(String(url).includes('liqflow'))return{ok:true,payload:{coin:'NEAR',positions:[{}]},receipt:{received_ts:T,sha256:'b'.repeat(64)}};
  const state=structuredClone(account.state);if(missingClock)delete state.time;
  return{ok:true,payload:state,receipt:structuredClone(account.http_receipt)};
 }});
 return{session,calls,grants,advance:ms=>{now+=ms;},now:()=>now};
}
test('retained real NEAR account supplies exact BTC capability with zero new HTTP and original native clock',async()=>{
 const f=fixture();await f.session.ensureCatalog();const a=await f.session.collect({contract:'NEAR-USDT',symbol:'NEAR'});f.advance(2500);const b=await f.session.collect({contract:'BTC-USDT',symbol:'BTC'});
 assert.equal(f.calls.length,3);assert.equal(b.network_calls,0);assert.equal(b.reused_accounts,1);assert.equal(b.receipt.source_ts,account.state.time);assert.equal(b.receipt.received_at_ms,account.http_receipt.received_ts);
 const qualified=qualifyNumericFutureReceipt({source_id:'HYPERLIQUID_NATIVE',receipt:b.receipt,contract:'BTC-USDT',now:f.now()});assert.equal(qualified.status,'REAL_NUMERIC_LEVELS');assert.equal(qualified.historical_capability_only,true);assert.equal(qualified.live_signal_generated,false);
 assert.equal(b.receipt.execution_target_eligible,false);assert.equal(b.receipt.whole_book_coverage_pct,null);assert.deepEqual(b.original_transport_sha256,[account.http_receipt.sha256]);
 a.receipt.zones[0].native_price=0;assert.ok(b.receipt.zones[0].native_price>0);
});
test('no native source clock or expired original account cannot become zero-request coverage',async()=>{
 const bad=fixture({missingClock:true});await bad.session.ensureCatalog();await bad.session.collect({contract:'NEAR-USDT',symbol:'NEAR'});const b=await bad.session.collect({contract:'BTC-USDT',symbol:'BTC'});assert.equal(b.status,'QUOTA_DEFERRED');assert.equal(b.reused_accounts,0);
 const old=fixture();await old.session.ensureCatalog();await old.session.collect({contract:'NEAR-USDT',symbol:'NEAR'});old.advance(300001);const expired=await old.session.collect({contract:'BTC-USDT',symbol:'BTC'});assert.equal(expired.status,'QUOTA_DEFERRED');assert.equal(expired.reused_accounts,0);
});
test('native catalog has durable source admission and denied scope makes no transport call',async()=>{
 const f=fixture({denied:true});assert.equal((await f.session.ensureCatalog()).ok,false);assert.equal(f.calls.length,0);assert.deepEqual(f.grants[0].requests,{HYPERLIQUID:1});assert.equal(f.grants[0].weights.HYPERLIQUID,22);
 assert.equal((await f.session.collect({contract:'NEAR-USDT',symbol:'NEAR'})).status,'QUOTA_DEFERRED');assert.equal(f.calls.length,0);
});
