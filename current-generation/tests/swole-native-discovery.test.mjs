import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSwoleAccountDiscovery,chooseNativeAccountDiscovery,readSwoleAccountDiscovery} from '../files/src/liquidation-extension/swole-account-discovery.mjs';
import {selectNativeAccountSample} from '../files/src/liquidation-extension/select-native-account-sample.mjs';
import {createCombinedLiquidationService,acquisitionHasFreshLevels} from '../files/src/liquidation-extension/combined-runner-service.mjs';
import {bindNativeAcquisition} from '../files/src/liquidation-extension/runtime-bridge.mjs';
import {nativeLiquidationLines,validateNativeLiquidationContext} from '../files/src/native-liquidation-guard.mjs';
import {normalizeNativeHL} from '../files/src/liquidation-extension/providers.mjs';
import {qualifyNumericFutureReceipt} from '../files/src/liquidation-futures-coverage.mjs';
import {createWeeklyNativeCoverageSession} from '../../runner/weekly-native-coverage-session.mjs';
const html=fs.readFileSync('checkpoints/source-inputs/swole-native-discovery-FIL-37596250906.html','utf8'),pageReceipt=JSON.parse(fs.readFileSync('checkpoints/source-inputs/swole-native-discovery-FIL-37596250906.receipt.json')),actual=JSON.parse(fs.readFileSync('checkpoints/source-inputs/swole-native-sample-37596747832.json')),row=actual.raw.find(x=>x.provider==='HYPERLIQUID'),T=row.receipt.received_ts;
assert.equal(createHash('sha256').update(html).digest('hex'),pageReceipt.sha256);
const mark=coin=>{const p=row.payload.assetPositions.find(x=>x.position.coin===coin)?.position;return Number(p?.positionValue)/Math.abs(Number(p?.szi));};
test('actual FIL native table yields seventeen bounded hints and selects the freshly proven nearest wallet',()=>{
 const d=parseSwoleAccountDiscovery(html,{symbol:'FIL'});assert.equal(d.ok,true);assert.equal(d.payload.positions.length,17);assert.equal(d.payload.positions.some(x=>x.address==='0xeadc152ac1014ace57c6b353f89adf5faffe9d55'),false);
 assert.equal(selectNativeAccountSample(d.payload.positions,{mark_price:mark('FIL'),max_accounts:1}).selected[0].address,row.address);
 assert.equal(d.payload.native_reread_required,true);assert.equal(d.payload.model_prices_used_as_evidence,false);assert.equal(parseSwoleAccountDiscovery(html,{symbol:'NEAR'}).ok,false);
 const footer=html+'<a href="/hyperliquid/wallet/0x'+ '1'.repeat(40)+'">tip</a>';assert.equal(parseSwoleAccountDiscovery(footer,{symbol:'FIL'}).payload.positions.length,17);
 assert.equal(parseSwoleAccountDiscovery(html.replace('>Liq. price</th>','>Unknown</th>'),{symbol:'FIL'}).ok,false);
});
test('eligible keyless discovery alternates and remains available after LiqFlow public-pilot expiry',()=>{
 assert.equal(chooseNativeAccountDiscovery({now:T,symbol:'FIL',swole_enabled:true}),'SWOLE_DISCOVERY');assert.equal(chooseNativeAccountDiscovery({now:T+4800000,symbol:'FIL',swole_enabled:true}),'LIQFLOW');
 assert.equal(chooseNativeAccountDiscovery({now:Date.parse('2026-11-01T00:00:00Z'),symbol:'FIL',swole_enabled:true}),'SWOLE_DISCOVERY');assert.equal(chooseNativeAccountDiscovery({now:T,symbol:'FIL',swole_enabled:false}),'LIQFLOW');
});
function fixture({missingClock=false,denied=false,exhausted=false}={}){
 let now=T;const calls=[],grants=[];
 const service=createCombinedLiquidationService({mode:'SHADOW_ONLY',swole_discovery_enabled:true,secondary_enabled:false,candidate_slots:2,max_http_per_run:5,clock:()=>now,provider_admit:async request=>{grants.push(request);if(request.requests.SWOLE_DISCOVERY&&(denied||exhausted))return{allowed:false,new_reservation:false,reservation_not_created:true,reason:exhausted?'FREE_QUOTA_EXHAUSTED':'CONTROLLED_DENIAL'};return{allowed:true,new_reservation:true};},fetch_impl:async(url,init={})=>{
  calls.push(String(url));if(String(url).includes('swolecharts'))return new Response(String(url).endsWith('/FIL')?html:'<html>No native table</html>',{status:String(url).endsWith('/FIL')?200:404});
  if(String(url).includes('liqflow'))return new Response(JSON.stringify(parseSwoleAccountDiscovery(html,{symbol:'FIL'}).payload));
  const body=JSON.parse(init.body);if(body.type==='metaAndAssetCtxs')return new Response(JSON.stringify([{universe:[{name:'FIL'},{name:'NEAR'}]},[{markPx:mark('FIL')},{markPx:mark('NEAR')}]]));
  assert.equal(body.user,row.address);const payload=structuredClone(row.payload);if(missingClock)delete payload.time;return new Response(JSON.stringify(payload));
 }});
 const collect=symbol=>service.collect({contract:symbol+'-USDT',native_symbol:symbol,run_id:actual.run_id,deep_started_ts:now,max_http_for_candidate:5,allowed_source_ids:['HYPERLIQUID_NATIVE']});
 return{service,calls,grants,collect,advance:ms=>{now+=ms;},now:()=>now};
}
test('retained actual discovery → original native FIL level → bound consumer/report; failed NEAR discovery preserves fresh same-run position',async()=>{
 const f=fixture(),first=await f.collect('FIL');assert.equal(first.provenance.discovery_source_id,'SWOLE_DISCOVERY');assert.equal(f.calls.length,3);assert.equal(acquisitionHasFreshLevels(first,{contract:'FIL-USDT',run_id:actual.run_id,observed_ts:T}),true);
 const b=bindNativeAcquisition(first,{contract:'FIL-USDT',run_id:actual.run_id,snapshot_id:'TEST:FIL:'+T,observed_ts:T,direction:'LONG'}),canonical={metadata:{contract:'FIL-USDT'},direction:'LONG',run_id:actual.run_id,snapshot_id:'TEST:FIL:'+T,observed_ts:T,liquidations:{native_extension:b}};
 assert.equal(validateNativeLiquidationContext(canonical,{check_freshness:true}).ok,true);assert.equal(nativeLiquidationLines(canonical.liquidations,{compact:true}).some(x=>x.includes('Hyperliquid')),true);assert.equal(b.entry_eligible,false);assert.equal(b.source_ts,row.payload.time);
 f.advance(1000);const next=await f.collect('NEAR');assert.equal(next.provenance.reused_native_accounts,1);assert.equal(next.provenance.discovery_status,'HTTP_404');assert.equal(f.calls.length,4);assert.equal(next.accounts[0].state.time,row.payload.time);assert.equal(acquisitionHasFreshLevels(next,{contract:'NEAR-USDT',run_id:actual.run_id,observed_ts:f.now()}),true);
});
test('unknown native time and denied discovery scope do not count as useful new levels',async()=>{
 const bad=fixture({missingClock:true}),raw=await bad.collect('FIL');assert.equal(acquisitionHasFreshLevels(raw,{contract:'FIL-USDT',run_id:actual.run_id,observed_ts:T}),false);
 const denied=fixture({denied:true});assert.equal(await denied.collect('FIL'),null);assert.equal(denied.calls.length,1);assert.equal(denied.calls.some(x=>x.includes('swolecharts')),false);
});
test('confirmed exhausted discovery scope uses an admitted alternative without another source HTTP or raising five-request cap',async()=>{
 const f=fixture({exhausted:true}),raw=await f.collect('FIL');assert.equal(raw.provenance.discovery_source_id,'LIQFLOW');assert.equal(f.calls.length,3);assert.equal(f.calls.some(x=>x.includes('swolecharts')),false);assert.ok(f.service.summary().shared_budget.reserved_http<=5);
});
test('one retained multi-asset account can qualify another earlier weekly market without discovery or budget',async()=>{
 let count=0;const session=createWeeklyNativeCoverageSession({run_id:actual.run_id,clock:()=>T,available_requests:()=>Math.max(0,3-count),on_request:()=>{count++;},source_admit:async()=>({allowed:true,new_reservation:true}),select_accounts:selectNativeAccountSample,normalize_native:normalizeNativeHL,read_swole:(symbol,opts)=>readSwoleAccountDiscovery(symbol,{...opts,fetch_impl:async()=>new Response(html)}),read_json:async(_url,opts)=>opts.body?.type==='metaAndAssetCtxs'?{ok:true,payload:[],receipt:{received_ts:T}}:{ok:true,payload:row.payload,receipt:row.receipt}});
 await session.ensureCatalog();assert.equal((await session.collect({contract:'FIL-USDT',symbol:'FIL',mark_price:mark('FIL')})).receipt.usable_for_context,true);
 const old=await session.collect({contract:'NEAR-USDT',symbol:'NEAR',allow_discovery:false});assert.equal(old.network_calls,0);assert.equal(count,3);assert.equal(qualifyNumericFutureReceipt({source_id:'HYPERLIQUID_NATIVE',receipt:old.receipt,contract:'NEAR-USDT',now:T}).status,'REAL_NUMERIC_LEVELS');assert.equal(old.receipt.source_ts,row.payload.time);
});

test('the one retained official account qualifies36 exact linear assets at its original clock without ticker aliases or current-market activation',()=>{
 const universe=JSON.parse(gunzipSync(fs.readFileSync('checkpoints/htx-all-modes-crypto-futures-universe-20261004.json.gz'))),out=[];
 for(const asset of universe.assets.filter(a=>a.contracts.some(c=>c.family==='linear'&&c.contract_code===a.symbol+'-USDT'))){
  const contract=asset.symbol+'-USDT',receipt=normalizeNativeHL({accounts:[{address:row.address,state:row.payload}],selection_bias:'ONE_RETAINED_ORIGINAL_CLOCK_NATIVE_ACCOUNT'},{symbol:asset.symbol,route_symbol:asset.symbol,run_id:actual.run_id,snapshot_id:'ORIGINAL:'+contract,as_of_ms:T,received_at_ms:T,max_age_ms:120000});
  if(receipt.zones.some(z=>z.notional>0&&((z.liquidated_side==='LONG'&&z.distance_pct<0)||(z.liquidated_side==='SHORT'&&z.distance_pct>0)))&&qualifyNumericFutureReceipt({source_id:'HYPERLIQUID_NATIVE',receipt,contract,now:T}))out.push({contract,source_ts:receipt.source_ts});
 }
 assert.equal(out.length,36);assert.equal(out.every(x=>x.source_ts===row.payload.time),true);assert.equal(out.some(x=>x.contract==='FIL-USDT'),true);assert.equal(out.some(x=>x.contract==='NEAR-USDT'),true);assert.equal(out.some(x=>x.contract==='PEPE-USDT'),false);
});
