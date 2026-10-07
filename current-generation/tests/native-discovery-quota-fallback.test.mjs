import test from 'node:test';import assert from 'node:assert/strict';
import {chooseExpandedNativeAccountDiscovery,nextNativeDiscoveryAfterUnspentQuota} from '../files/src/liquidation-extension/official-trade-account-discovery.mjs';
import {createCombinedLiquidationService} from '../files/src/liquidation-extension/combined-runner-service.mjs';
import {createWeeklyNativeCoverageSession} from '../../runner/weekly-native-coverage-session.mjs';
import {normalizeNativeHL} from '../files/src/liquidation-extension/providers.mjs';
const a='0x'+'1'.repeat(40),b='0x'+'2'.repeat(40),sha='a'.repeat(64),base=Date.parse('2026-10-07T09:00:00Z'),late=Date.parse('2026-10-28T00:00:00Z');
const options={symbol:'NEAR',swole_enabled:true,official_trades_enabled:true};
const window=(provider,start=base,selection_key)=>{for(let i=0;i<4;i++){const now=start+i*2400000;if(chooseExpandedNativeAccountDiscovery({...options,now,selection_key})===provider)return now;}throw Error('NO_AVAILABLE_WINDOW');};
const payload=now=>({time:now,assetPositions:[{position:{coin:'NEAR',szi:'10',positionValue:'10',liquidationPx:'.7',leverage:{type:'cross',value:2}}}]});
const trades=now=>[{coin:'NEAR',side:'A',px:'1',sz:'1',hash:'0x'+'0'.repeat(64),tid:3,time:now-10,users:[a,b]}];
function fixture({initial='SWOLE_DISCOVERY',start=base,unknown=false,transport_fail=false,native_denied=false}={}){
 const now=window(initial,start),calls=[],grants=[];
 const s=createCombinedLiquidationService({mode:'SHADOW_ONLY',official_trades_discovery_enabled:true,swole_discovery_enabled:true,secondary_enabled:false,candidate_slots:2,max_http_per_run:5,clock:()=>now,provider_admit:async r=>{
  grants.push(r);const discovery=r.reservation_id.includes('DISCOVERY');
  if(discovery&&(native_denied||!Object.hasOwn(r.requests,'HYPERLIQUID'))&&!transport_fail)return{allowed:false,new_reservation:false,...(!unknown?{reservation_not_created:true}:{}) ,reason:'FREE_QUOTA_EXHAUSTED'};
  return{allowed:true,new_reservation:true};
 },fetch_impl:async(url,o)=>{const body=o.body?JSON.parse(o.body):null;calls.push({url:String(url),body});if(body?.type==='metaAndAssetCtxs')return new Response(JSON.stringify([{universe:[{name:'NEAR'}]},[{markPx:'1'}]]));if(body?.type==='recentTrades')return new Response(JSON.stringify(trades(now)));if(body?.type==='clearinghouseState')return new Response(JSON.stringify(payload(now)));return new Response('unavailable',{status:503});}});
 return{now,s,calls,grants,collect:()=>s.collect({contract:'NEAR-USDT',native_symbol:'NEAR',run_id:'quota-fallback',deep_started_ts:now,allowed_source_ids:['HYPERLIQUID_NATIVE']})};
}
test('two acknowledged unspent external quota denials reach the admitted official discovery with three actualHTTP and unchanged five-request capacity',async()=>{
 const f=fixture(),r=await f.collect();assert.ok(r);assert.equal(f.calls.length,3);assert.equal(r.provenance.discovery_source_id,'OFFICIAL_RECENT_TRADES');assert.deepEqual(f.grants.filter(x=>x.reservation_id.includes('DISCOVERY')).map(x=>Object.keys(x.requests)[0]),['SWOLE_DISCOVERY','LIQFLOW','HYPERLIQUID']);assert.equal(f.s.summary().shared_budget.actual_http,3);assert.equal(f.s.summary().shared_budget.reserved_http,3);
});
test('after the LiqFlow key deadline an exhausted Swole pool reaches official discovery without an unauthorized LiqFlow request or grant',async()=>{
 const f=fixture({start:late}),r=await f.collect();assert.ok(r);assert.equal(f.calls.length,3);assert.equal(f.grants.some(x=>Object.hasOwn(x.requests,'LIQFLOW')),false);assert.equal(f.calls.some(x=>x.url.includes('liqflow')),false);
});
test('a known LiqFlow denial can use the admitted native path; an unknown write acknowledgement cannot fall through',async()=>{
 const known=fixture({initial:'LIQFLOW'});assert.ok(await known.collect());assert.equal(known.calls.length,3);
 const unknown=fixture({unknown:true});assert.equal(await unknown.collect(),null);assert.equal(unknown.calls.length,1);assert.equal(unknown.grants.length,2);assert.equal(unknown.s.summary().shared_budget.reserved_http,2);
});
test('an admitted HTTP failure is spent and cannot trigger discovery retry; denied native pool cannot be repaired by another address service',async()=>{
 const spent=fixture({transport_fail:true});assert.equal(await spent.collect(),null);assert.equal(spent.calls.length,2);assert.equal(spent.grants.length,2);
 const native=fixture({initial:'HYPERLIQUID',native_denied:true});assert.equal(await native.collect(),null);assert.equal(native.calls.length,1);assert.equal(native.grants.length,2);
 assert.equal(nextNativeDiscoveryAfterUnspentQuota({current:'HYPERLIQUID',now:base,official_trades_enabled:true}),null);
});
test('weekly exact-contract dispersion uses all three discovery paths in one epoch instead of repeating one path every seven days',()=>{
 const symbols=['NEAR','FIL','ATOM','ADA','SOL','DOT','AVAX','LTC','DOGE','XRP','LINK','UNI'],at=window('HYPERLIQUID');
 const choose=(symbol,now)=>chooseExpandedNativeAccountDiscovery({...options,symbol,now,selection_key:symbol+'-USDT'});assert.deepEqual(new Set(symbols.map(s=>choose(s,at))),new Set(['HYPERLIQUID','SWOLE_DISCOVERY','LIQFLOW']));
 for(const symbol of symbols)assert.equal(choose(symbol,at),choose(symbol,at+7*86400000));
 assert.ok(new Set(symbols.map(s=>choose(s,at+2400000))).size===3);
});
test('weekly post-deadline quota fallback retains one combined two-request native reservation,72weight, and original clock without another discovery HTTP',async()=>{
 const now=window('SWOLE_DISCOVERY',late,'NEAR-USDT'),calls=[],grants=[];let available=3;
 const session=createWeeklyNativeCoverageSession({run_id:'weekly-unspent',official_trades_enabled:true,clock:()=>now,available_requests:()=>available,on_request:p=>{available--;calls.push(p);},read_swole:async()=>{throw Error('DENIED_SOURCE_MUST_NOT_BE_CALLED');},source_admit:async r=>{grants.push(r);return r.requests.SWOLE_DISCOVERY?{allowed:false,new_reservation:false,reservation_not_created:true,reason:'FREE_QUOTA_EXHAUSTED'}:{allowed:true,new_reservation:true};},select_accounts:()=>{throw Error('NOT_POSITION_DISCOVERY');},normalize_native:normalizeNativeHL,read_json:async(url,o)=>({ok:true,receipt:{http_status:200,received_ts:now,sha256:sha},payload:o.body.type==='metaAndAssetCtxs'?[{universe:[{name:'NEAR'}]},[]]:o.body.type==='recentTrades'?trades(now):payload(now)})});
 await session.ensureCatalog();const r=await session.collect({contract:'NEAR-USDT',symbol:'NEAR'});assert.equal(r.status,'NATIVE_SAMPLE_NORMALIZED');assert.equal(calls.length,3);assert.deepEqual(grants.at(-1).requests,{HYPERLIQUID:2});assert.deepEqual(grants.at(-1).weights,{HYPERLIQUID:72});assert.equal(r.receipt.source_ts,now);assert.equal(grants.some(x=>x.requests.LIQFLOW),false);
});
