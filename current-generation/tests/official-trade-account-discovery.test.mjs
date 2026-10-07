import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
import {parseOfficialTradeAccountDiscovery,selectOfficialTradeAccountSample,chooseExpandedNativeAccountDiscovery,OFFICIAL_TRADE_DISCOVERY_WEIGHT} from '../files/src/liquidation-extension/official-trade-account-discovery.mjs';
import {createCombinedLiquidationService} from '../files/src/liquidation-extension/combined-runner-service.mjs';
import {bindNativeAcquisition} from '../files/src/liquidation-extension/runtime-bridge.mjs';
import {createWeeklyNativeCoverageSession} from '../../runner/weekly-native-coverage-session.mjs';
import {normalizeNativeHL} from '../files/src/liquidation-extension/providers.mjs';
import {buildNativeWalletRouting} from '../files/src/liquidation-extension/native-wallet-routing.mjs';
const T=Date.parse('2026-10-07T09:20:00Z'),a='0x'+'1'.repeat(40),b='0x'+'2'.repeat(40),hash='0x'+'0'.repeat(64),sha='a'.repeat(64);
const receipt={http_status:200,received_ts:T,sha256:sha},trade={coin:'NEAR',side:'A',px:'1',sz:'100',time:T-100,tid:42,hash,users:[a,b]};
const parse=(trades=[trade],options={})=>parseOfficialTradeAccountDiscovery(trades,{symbol:'NEAR',receipt,now:T,...options});
const state=(time=T)=>({time,assetPositions:['NEAR','FIL'].map(coin=>({position:{coin,szi:'10',positionValue:'10',liquidationPx:'.7',leverage:{type:'cross',value:2}}}))});
test('official trades discover both exact public participants without inventing position side, leverage or liquidation prices',()=>{
 const p=parse();assert.equal(p.ok,true);assert.equal(p.payload.accounts.length,2);assert.equal(p.payload.trade_side_is_not_position_side,true);assert.equal(p.payload.whole_book_coverage_pct,null);
 for(const row of selectOfficialTradeAccountSample(p.payload,{now:T,max_accounts:2}).selected){assert.equal(Object.hasOwn(row,'size'),false);assert.equal(Object.hasOwn(row,'liq_price'),false);assert.equal(Object.hasOwn(row,'direction'),false);}
});
test('deduplicate by original time, exact coin and trade id; do not count duplicate users or repeated rows',()=>{
 const p=parse([trade,trade,{...trade,tid:43,users:[a,a]}]);assert.equal(p.payload.fresh_unique_trade_ids,2);assert.equal(p.payload.accounts.length,2);
});
test('wrong symbols, spot routes, malformed ids, unknown/future/expired original clocks and invalid numeric trades cannot discover accounts',()=>{
 for(const change of [{coin:'FIL'},{time:T+1},{time:T-300001},{time:null},{tid:-1},{tid:2**54},{px:'Infinity'},{px:'1e3'},{sz:0},{px:'1e308',sz:'1e308'},{users:[a,'0x'+'0'.repeat(40)]},{hash:'bad'},{side:'LONG'}])assert.equal(parse([{...trade,...change}]).payload.accounts.length,0);
 for(const options of [{symbol:'@1'},{symbol:'xyz:NVDA'},{receipt:{...receipt,received_ts:T+1}},{receipt:{...receipt,received_ts:T-300001}},{receipt:{...receipt,sha256:null}},{receipt:{...receipt,http_status:429}}])assert.equal(parse([trade],options).ok,false);
 assert.equal(parse(Array(1001).fill(trade)).ok,false);assert.equal(parse([trade],{symbol:'NEAR '}).ok,false);
});
test('empty native trade response is an empty bounded sample, not an invented level',()=>{assert.equal(parse([]).ok,true);assert.deepEqual(selectOfficialTradeAccountSample(parse([]).payload,{now:T}).selected,[]);});
test('rotate the bounded participant pool across analytical windows so one no-level wallet does not monopolize discovery',()=>{
 const p=parse().payload,x=selectOfficialTradeAccountSample(p,{now:T}),y=selectOfficialTradeAccountSample(p,{now:T+2400000});assert.notEqual(x.selected[0].address,y.selected[0].address);
 assert.deepEqual(selectOfficialTradeAccountSample(p,{now:T,exclude_addresses:[a,b]}).selected,[]);assert.deepEqual(selectOfficialTradeAccountSample(p,{now:T,max_accounts:9}).selected,[]);
});
test('rotate admitted discovery paths every40 minutes, preserve disabled legacy path and never use unconfigured LiqFlow after its key deadline',()=>{
 const choose=now=>chooseExpandedNativeAccountDiscovery({now,symbol:'NEAR',swole_enabled:true,official_trades_enabled:true});assert.deepEqual(new Set([0,1,2].map(i=>choose(T+i*2400000))),new Set(['HYPERLIQUID','SWOLE_DISCOVERY','LIQFLOW']));
 const late=Date.parse('2026-10-28T00:00:00Z');for(let i=0;i<3;i++)assert.notEqual(choose(late+i*2400000),'LIQFLOW');
 assert.equal(chooseExpandedNativeAccountDiscovery({now:late,symbol:'kBONK',official_trades_enabled:true,swole_enabled:true}),'HYPERLIQUID');assert.equal(chooseExpandedNativeAccountDiscovery({now:T,symbol:'NEAR'}),'LIQFLOW');assert.equal(OFFICIAL_TRADE_DISCOVERY_WEIGHT,70);
});
function fixture({denied=false,unknown=false,expired=false,unsupported=false,max=5,slots=2,off=false}={}){
 // Before key deadline, official + LiqFlow alternate. Pick an official window.
 const now=Math.floor(T/4800000)*4800000,calls=[],grants=[],saved=[];
 const s=createCombinedLiquidationService({mode:off?'OFF':'SHADOW_ONLY',secondary_enabled:false,official_trades_discovery_enabled:true,accounts_per_deep:3,candidate_slots:slots,max_http_per_run:max,clock:()=>now,on_native_accounts:async p=>saved.push(p),provider_admit:async r=>{grants.push(r);return r.reservation_id.includes('DISCOVERY')&&(denied||unknown)?{allowed:false,new_reservation:false,...(!unknown?{reservation_not_created:true}:{}) ,reason:'FREE_QUOTA_EXHAUSTED'}:{allowed:true,new_reservation:true};},fetch_impl:async(url,init)=>{
  const body=JSON.parse(init.body);calls.push(body);
  if(body.type==='metaAndAssetCtxs')return new Response(JSON.stringify([{universe:unsupported?[]:[{name:'NEAR'},{name:'FIL'}]},[{markPx:'1'},{markPx:'1'}]]));
  if(body.type==='recentTrades')return new Response(JSON.stringify([{...trade,coin:body.coin,time:now-100}]));
  return new Response(JSON.stringify(state(expired?now-120001:now)));
 }});
 return{now,s,calls,grants,saved,collect:()=>s?.collect({contract:'NEAR-USDT',native_symbol:'NEAR',run_id:'official-current',deep_started_ts:now,allowed_source_ids:['HYPERLIQUID_NATIVE']})};
}
test('current official account acquisition closes source→clock→native consumer in three calls; another asset reuses it with zeroHTTP within the unchanged5-call envelope',async()=>{
 const f=fixture(),raw=await f.collect();assert.ok(raw);assert.equal(f.calls.length,3);assert.equal(f.calls[1].type,'recentTrades');assert.equal(raw.provenance.discovery_source_id,'OFFICIAL_RECENT_TRADES');assert.equal(raw.provenance.discovery_upstream,'HYPERLIQUID');assert.equal(f.grants[1].weights.HYPERLIQUID,70);assert.equal(f.saved.length,1);
 const bound=bindNativeAcquisition(raw,{contract:'NEAR-USDT',run_id:'official-current',snapshot_id:'EXACT',observed_ts:f.now,direction:null});assert.equal(bound.status,'USABLE_NATIVE_SAMPLE');assert.equal(bound.source_ts,f.now);assert.equal(bound.entry_eligible,false);
 const second=await f.s.collect({contract:'FIL-USDT',native_symbol:'FIL',run_id:'official-current',deep_started_ts:f.now,max_http_for_candidate:0,allowed_source_ids:['HYPERLIQUID_NATIVE']});assert.ok(second);assert.equal(f.calls.length,3);assert.equal(second.provenance.reused_native_accounts,1);assert.ok(f.s.summary().shared_budget.actual_http<=5);
});
test('denied or ambiguous official discovery admission cannot send requests or try another upstream reservation',async()=>{
 for(const unknown of [false,true]){const f=fixture({denied:true,unknown});assert.equal(await f.collect(),null);assert.equal(f.calls.length,1);assert.equal(f.grants.length,2);assert.equal(f.s.summary().shared_budget.reserved_http,unknown?2:1);}
});
test('no current catalog or expired native state can convert discovery hints to usable levels',async()=>{
 const f=fixture({unsupported:true});assert.equal(await f.collect(),null);assert.equal(f.calls.length,1);
 const bad=fixture({expired:true}),raw=await bad.collect();assert.ok(raw);const bound=bindNativeAcquisition(raw,{contract:'NEAR-USDT',run_id:'official-current',snapshot_id:'BAD',observed_ts:bad.now,direction:null});assert.notEqual(bound.status,'USABLE_NATIVE_SAMPLE');assert.equal(buildNativeWalletRouting(bad.saved[0]),null);
});
test('OFF is zero work, and one remaining candidate request cannot be wasted on discovery without room for a native reread',async()=>{
 const off=fixture({off:true});assert.equal(await off.collect(),undefined);assert.equal(off.calls.length,0);const f=fixture({max:2,slots:1});assert.equal(await f.collect(),null);assert.equal(f.calls.length,1);
});
test('weekly official discovery reserves two real requests in the same native pool with72 weight units, not an overwritten one-request object',async()=>{
 const now=[T,T+2400000].find(now=>chooseExpandedNativeAccountDiscovery({now,symbol:'NEAR',selection_key:'NEAR-USDT',official_trades_enabled:true})==='HYPERLIQUID'),calls=[],grants=[];let available=3;
 const session=createWeeklyNativeCoverageSession({run_id:'weekly-official',clock:()=>now,official_trades_enabled:true,available_requests:()=>available,on_request:p=>{available--;calls.push(p);},source_admit:async r=>{grants.push(r);return{allowed:true,new_reservation:true};},select_accounts:()=>{throw Error('TRADE_SIDE_MUST_NOT_ENTER_POSITION_SELECTOR');},normalize_native:normalizeNativeHL,read_json:async(url,o)=>({ok:true,receipt:{...receipt,received_ts:now},payload:o.body.type==='metaAndAssetCtxs'?[{universe:[{name:'NEAR'},{name:'FIL'}]},[]]:o.body.type==='recentTrades'?[{...trade,time:now-100}]:state(now)})});
 assert.equal((await session.collect({contract:'NEAR-USDT',symbol:'NEAR'})).network_calls,0);await session.ensureCatalog();const first=await session.collect({contract:'NEAR-USDT',symbol:'NEAR'});assert.equal(first.status,'NATIVE_SAMPLE_NORMALIZED');assert.deepEqual(grants[1].requests,{HYPERLIQUID:2});assert.deepEqual(grants[1].weights,{HYPERLIQUID:72});assert.equal(calls.length,3);const next=await session.collect({contract:'FIL-USDT',symbol:'FIL'});assert.equal(next.network_calls,0);assert.equal(next.receipt.source_ts,now);
});
test('retained real official trades and both original current native responses prove discovery diversity and one actual PENGU level with zero new source calls',()=>{
 const gz=fs.readFileSync('checkpoints/source-inputs/official-trade-native-37607475099.json.gz');assert.equal(createHash('sha256').update(gz).digest('hex'),'e6d67166e9c6612f9e78debd82555fe494d92cdb8c0d7af874b28cfd305cd5b7');
 const raw=JSON.parse(gunzipSync(gz));assert.equal(raw.head,'eb237286a78ada33b7eedd780e6c1c1302a415a9');assert.equal(raw.run_id,'OFFICIAL_TRADE_DISCOVERY:37607475099:1791368836564');
 const discovery=raw.raw[0],p=parseOfficialTradeAccountDiscovery(discovery.payload,{symbol:'PENGU',receipt:discovery.receipt,now:discovery.receipt.received_ts});assert.equal(p.ok,true);assert.equal(p.payload.fresh_unique_trade_ids,10);assert.equal(p.payload.accounts.length,11);
 const observed=Math.max(...raw.raw.map(x=>x.receipt.received_ts)),levels=[];
 for(const a of raw.raw.slice(1)){assert.ok(p.payload.accounts.some(x=>x.address===a.address));const result=normalizeNativeHL({accounts:[{address:a.address,state:a.payload,received_at_ms:a.receipt.received_ts}]},{symbol:'PENGU',route_symbol:'PENGU',run_id:raw.run_id,snapshot_id:'RETAINED_ORIGINAL',as_of_ms:observed,received_at_ms:a.receipt.received_ts,max_age_ms:120000});levels.push(result.usable_for_context?result.zones.length:0);const h=buildNativeWalletRouting({accounts:[{address:a.address,state:a.payload,http_receipt:a.receipt}],run_id:raw.run_id,now:observed});assert.ok(h.accounts[0].coins.length>=16);}
 assert.deepEqual(levels,[0,1]);
});
