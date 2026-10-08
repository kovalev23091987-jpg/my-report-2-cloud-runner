import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {buildNativeWalletRouting,selectNativeWalletRouting,validateNativeWalletRouting,saveNativeWalletRouting} from '../files/src/liquidation-extension/native-wallet-routing.mjs';
import {createCombinedLiquidationService} from '../files/src/liquidation-extension/combined-runner-service.mjs';
import {bindNativeAcquisition} from '../files/src/liquidation-extension/runtime-bridge.mjs';
import {loadLiquidationVenueCatalog} from '../files/src/liquidation-extension/venue-catalog-cache.mjs';
const T=Date.parse('2026-10-07T09:00:00Z'),addr='0x'+'1'.repeat(40),sha='a'.repeat(64);
const state=time=>({time,assetPositions:['NEAR','FIL'].map(coin=>({position:{coin,szi:'10',positionValue:'10',liquidationPx:'.7',leverage:{type:'cross',value:2}}}))});
const account={address:addr,state:state(T),http_receipt:{http_status:200,received_ts:T,sha256:sha}};
const routing=buildNativeWalletRouting({accounts:[account],run_id:'original',now:T});
test('durable hints contain only exact addresses, coin capability and original proof metadata, never prices or state',()=>{
 assert.ok(validateNativeWalletRouting(routing,{now:T+86400000}));assert.deepEqual(selectNativeWalletRouting(routing,{symbol:'NEAR',now:T+86400000}),[{address:addr}]);
 assert.deepEqual(Object.keys(routing.accounts[0]).sort(),['address','coins','original_response_sha256','verified_receipt_ts','verified_source_ts']);assert.equal(JSON.stringify(routing).includes('liquidationPx'),false);assert.equal(JSON.stringify(routing).includes('positionValue'),false);
 const bad=structuredClone(routing);bad.accounts[0].coins.push('NOTPROVEN');assert.equal(validateNativeWalletRouting(bad,{now:T}),null);
 assert.deepEqual(selectNativeWalletRouting(routing,{symbol:'BTC',now:T}),[]);assert.deepEqual(selectNativeWalletRouting(routing,{symbol:'NEAR',now:T+7*86400000+1}),[]);
});
test('no unknown-clock, wrong-sided or future-after-receipt account can create a durable wallet hint',()=>{
 for(const mutate of [a=>{delete a.state.time;},a=>{a.state.time=T+1;},a=>{a.state.assetPositions.forEach(x=>x.position.liquidationPx='1.3');},a=>{a.http_receipt.sha256='missing';}]){const bad=structuredClone(account);mutate(bad);assert.equal(buildNativeWalletRouting({accounts:[bad],run_id:'bad',now:T}),null);}
 assert.equal(buildNativeWalletRouting({accounts:[account],run_id:'expired',now:T+120001}),null);
});
function service({invalid=false,max=5,unsupported=false,denied=false}={}){
 const now=T+86400000,calls=[],grants=[],saved=[];
 const s=createCombinedLiquidationService({mode:'SHADOW_ONLY',secondary_enabled:false,candidate_slots:1,max_http_per_run:max,clock:()=>now,native_wallet_routing:routing,on_native_accounts:async payload=>saved.push(payload),provider_admit:async r=>{grants.push(r);return denied&&r.reservation_id.includes('ROUTING_HINT')?{allowed:false,new_reservation:false,reservation_not_created:true,reason:'FREE_QUOTA_EXHAUSTED'}:{allowed:true,new_reservation:true};},fetch_impl:async(url,init={})=>{
  const body=init.body?JSON.parse(init.body):null;calls.push({url:String(url),body});
  if(body?.type==='metaAndAssetCtxs')return new Response(JSON.stringify([{universe:unsupported?[]:[{name:'NEAR'},{name:'FIL'}]},[{markPx:'1'},{markPx:'1'}]]));
  if(body?.type==='clearinghouseState'){const value=state(invalid?T:now);if(unsupported)value.assetPositions=[];return new Response(JSON.stringify(value));}
  return new Response(JSON.stringify({coin:'NEAR',positions:[]}));
 }});
 return{s,calls,grants,saved,collect:()=>s.collect({contract:'NEAR-USDT',native_symbol:'NEAR',run_id:'new',deep_started_ts:now,max_http_for_candidate:max,allowed_source_ids:['HYPERLIQUID_NATIVE']})};
}
test('a day-old structural hint yields only a newly read official liquidation level with one admitted call',async()=>{
 const f=service(),raw=await f.collect();assert.ok(raw);assert.equal(f.calls.length,1);assert.equal(f.calls[0].body.type,'clearinghouseState');assert.equal(f.calls.some(x=>/liqflow|swole/.test(x.url)),false);assert.equal(f.grants.length,1);assert.equal(f.saved.length,1);
 const bound=bindNativeAcquisition(raw,{contract:'NEAR-USDT',run_id:'new',snapshot_id:'S:new',observed_ts:T+86400000,direction:null});assert.equal(bound.status,'USABLE_NATIVE_SAMPLE');assert.equal(bound.source_ts,T+86400000);assert.equal(bound.entry_eligible,false);assert.equal(f.s.summary().shared_budget.actual_http,1);
 assert.equal(raw.provenance.optional_discovery_status,'CURRENT_NATIVE_REREAD_FROM_STRUCTURAL_WALLET_HINT');
});
test('an expired current state or absent exact position never promotes stored capability to fresh levels',async()=>{
 const bad=service({invalid:true,max:2});assert.equal(await bad.collect(),null);assert.equal(bad.calls.length,1);assert.equal(bad.saved.length,1);assert.equal(buildNativeWalletRouting(bad.saved[0]),null);
 const unsupported=service({unsupported:true});const empty=await unsupported.collect();assert.equal(bindNativeAcquisition(empty,{contract:'NEAR-USDT',run_id:'new',snapshot_id:'S:new',observed_ts:T+86400000,direction:null}).status,'NOT_CLOSED');assert.equal(unsupported.calls.length,2);
 const denied=service({denied:true,max:2});const d=await denied.collect();assert.equal(bindNativeAcquisition(d,{contract:'NEAR-USDT',run_id:'new',snapshot_id:'S:new',observed_ts:T+86400000,direction:null}).status,'NOT_CLOSED');assert.equal(denied.calls.length,1);assert.equal(denied.calls[0].body,null);
});
test('wallet hint storage is one guarded D1 write, and structural rows cannot pollute venue market identities',async()=>{
 let writes=0;const db={prepare:sql=>({bind:()=>({run:async()=>{writes++;return{success:true,meta:{changes:1}};},all:async()=>({results:[{source:'HYPERLIQUID_WALLET_ROUTING',observed_ts:T,expires_ts:T+7*86400000,payload_json:JSON.stringify(routing)},{source:'LIGHTER',observed_ts:T,expires_ts:T+86400000,payload_json:JSON.stringify({NEAR:{lighter_market_id:1}})},{source:'GMX',observed_ts:T,expires_ts:T+86400000,payload_json:'{}'}]})}),run:async()=>{},all:async()=>({results:[]})})};
 assert.equal((await saveNativeWalletRouting({db,accounts:[account],run_id:'store',now:T,db_admit:async()=>({allowed:false})})).status,'D1_WRITE_NOT_ADMITTED');assert.equal(writes,0);
 const saved=await saveNativeWalletRouting({db,accounts:[account],run_id:'store',now:T,db_admit:async extra=>{assert.deepEqual(extra,{rows_read:2,rows_written:1});return{allowed:true};}});assert.equal(saved.future_levels_accepted,false);assert.equal(writes,1);
 const loaded=await loadLiquidationVenueCatalog({db,now:T,fetch_impl:async()=>{throw Error('NO_NEW_CATALOG_REQUEST');}});assert.deepEqual(Object.keys(loaded.entries),['NEAR']);assert.ok(loaded.native_wallet_routing);assert.equal(loaded.network_calls,0);
});
test('retained original real wallet response creates broad exact capability without any new source request',()=>{
 const root=new URL('../../checkpoints/source-inputs/',import.meta.url),raw=JSON.parse(fs.readFileSync(new URL('swole-native-sample-37596747832.json',root))),proof=JSON.parse(fs.readFileSync(new URL('swole-native-sample-37596747832.proof.json',root)));
 const retained=raw.raw[0],payload=retained.payload,clock=retained.receipt.received_ts;
 const a={address:retained.address,state:payload,http_receipt:retained.receipt};
 if(!a.address||!a.http_receipt)throw Error('EXACT_RETAINED_FIXTURE_FIELDS_REQUIRED');
 const h=buildNativeWalletRouting({accounts:[a],run_id:proof.run_id,now:clock});assert.ok(h);assert.ok(h.accounts[0].coins.length>=36);assert.equal(h.accounts[0].verified_source_ts,payload.time);assert.equal(JSON.stringify(h).includes('liquidationPx'),false);
});

test('one fresh hinted account serves another exact asset in the same run without spending another discovery or native request',async()=>{
 const f=service();await f.collect();const before=f.grants.length;
 const second=await f.s.collect({contract:'FIL-USDT',native_symbol:'FIL',run_id:'new',deep_started_ts:T+86400000,max_http_for_candidate:0,allowed_source_ids:['HYPERLIQUID_NATIVE']});
 assert.ok(second);assert.equal(f.calls.length,1);assert.equal(f.grants.length,before);assert.equal(second.accounts[0].state.time,T+86400000);assert.equal(second.provenance.transport_count,0);assert.equal(second.provenance.reused_native_accounts,1);
});

test('unknown write acknowledgements and a newer competing routing row cannot be declared saved or retried',async()=>{
 for(const result of [undefined,{success:true,meta:{changes:0}}]){
  let writes=0;const db={prepare:()=>({bind:()=>({run:async()=>{writes++;return result;}})})};
  const saved=await saveNativeWalletRouting({db,previous:routing,accounts:[{...account,state:state(T+10),http_receipt:{...account.http_receipt,received_ts:T+10}}],run_id:'store',now:T+10,db_admit:async()=>({allowed:true})});
  assert.equal(saved.routing,routing);assert.equal(writes,1);assert.notEqual(saved.status,'STRUCTURAL_WALLET_HINTS_SAVED');
 }
});

test('a fresh native reread removes closed or no-price capability instead of repeating a stale address hint',()=>{
 const a=structuredClone(account);a.state.time=T+10;a.http_receipt.received_ts=T+10;a.state.assetPositions=[];
 const updated=buildNativeWalletRouting({previous:routing,accounts:[a],run_id:'new',now:T+10});assert.ok(updated);assert.equal(updated.accounts.length,0);assert.equal(updated.last_updated_source_ts,T+10);assert.deepEqual(selectNativeWalletRouting(updated,{symbol:'NEAR',now:T+10}),[]);
 assert.equal(buildNativeWalletRouting({previous:routing,accounts:[account],run_id:'same',now:T}),null);
});
