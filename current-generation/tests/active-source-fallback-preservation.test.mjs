import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import {pathToFileURL} from 'node:url';
import {activeSourceSamples,sampleParams} from './n10-full-cache-inputs.mjs';
const moduleURL=n=>process.env.REPORT2_TEST_RUNTIME?pathToFileURL(`${process.env.REPORT2_TEST_RUNTIME}/src/${n}`):new URL(`../files/src/${n}`,import.meta.url);
const {collectN05VenueRoutes}=await import(moduleURL('external-n05-flow-collector.mjs'));
const {collectEvidenceRouteBlock}=await import(moduleURL('candidate-evidence-v2-runtime.mjs'));
const {nativeSourceUsageUnclosed}=await import(moduleURL('evidence-source-store.mjs'));
const {loadN10ReusedVenuePaths,verifyN10ReusedVenuePathEvidence}=await import(moduleURL('htx-technical-structure.mjs'));
const {consumeBlockResultContext}=await import(moduleURL('block-result-context.mjs'));
const {APPROVED_HTX_ANALYSIS_CONTRACTS}=await import(moduleURL('approved-htx-analysis-scope.mjs'));
const good={venue:'BACKPACK',market:'SPOT',contract:'TEST-USDT',check_completed:true,observed_ts:1234,window_end_ts:1200};
const cache=async()=>({status:'CLOSED',components:[good],network_calls:0});
const wire=async()=>new Response('{}');
async function request(p,id,n=1){const g=p.request_admit({logical_request_id:id,attempts:n});if(g?.allowed)for(let i=0;i<n;i++)await p.fetch_impl('https://controlled.invalid/'+id);return g;}
const params=extra=>({request_admit:()=>({allowed:true}),fetch_impl:wire,...extra});
test('late adapter exception preserves earlier exact object and still visits a later independent fallback',async()=>{
 let next=0;const fact={block_id:'N12',htx_contract:'TEST-USDT',original_clock:123};
 const out=await collectN05VenueRoutes(params(),[['BACKPACK',cache],['BITGET',async()=>{throw Error('sensitive URL must not be exported');}],['KUCOIN_N12_EXACT_TOKEN',async p=>{next++;await request(p,'n12');return{status:'CLOSED',network_calls:1,evidence:[fact]};}]]);
 assert.equal(next,1);assert.equal(out.check_completed,true);assert.equal(out.components[0],good);assert.equal(out.components[0].observed_ts,1234);assert.equal(out.evidence[0],fact);assert.equal(out.adapter_results[1].status,'CODE_OR_STORE_ERROR');assert(!JSON.stringify(out).includes('sensitive URL'));assert.equal(out.network_calls,1);
});
test('transport attempts before a throw remain counted and declared counters cannot invent or erase requests',async()=>{
 let actual=0;const out=await collectN05VenueRoutes(params({fetch_impl:async()=>{actual++;return wire();}}),[['GATE',async p=>{await request(p,'failed',2);throw Error('failure');}],['BITGET',async p=>{await request(p,'fallback');return{status:'CLOSED',components:[good],network_calls:999};}]]);
 assert.equal(actual,3);assert.equal(out.network_calls,3);assert.equal(out.observed_transport_HTTP,3);assert.deepEqual(out.adapter_results.map(r=>r.network_calls),[2,1]);assert.equal(out.adapter_results[1].adapter_reported_network_calls,999);
});
test('optional turnover exception retains flow and consumes only its already admitted attempt',async()=>{
 const c={...good,venue:'BINANCE'},out=await collectN05VenueRoutes(params(),[['BINANCE',async p=>{await request(p,'flow');return{components:[c],network_calls:1};}]],async p=>{await request(p,'turnover');throw Error('late optional failure');});
 assert.equal(out.check_completed,true);assert.equal(out.components[0].observed_ts,c.observed_ts);assert.equal(out.components[0].turnover_baseline.status,'CODE_OR_STORE_ERROR');assert.equal(out.network_calls,2);assert.equal(out.flow_network_calls,1);assert.equal(out.caller_reserved_requests,2);
});
test('unused grants after a failure are not refunded and cached facts survive a full five-request envelope',async()=>{
 let denied;const out=await collectN05VenueRoutes(params(),[['GATE',async p=>{assert.equal(p.request_admit({attempts:5}).allowed,true);await p.fetch_impl('https://controlled.invalid/one');throw Error('after one of five reserved');}],['BITGET',async p=>{denied=p.request_admit({attempts:1});return{components:[],network_calls:0};}],['BACKPACK',cache]]);
 assert.equal(denied.allowed,false);assert.equal(denied.status,'CALLER_FIVE_REQUEST_CAP');assert.equal(out.caller_reserved_requests,5);assert.equal(out.network_calls,1);assert.equal(out.components[0],good);
});
test('duplicate logical admission cannot redispatch using another source spare grant',async()=>{
 let duplicate,actual=0;const out=await collectN05VenueRoutes(params({fetch_impl:async()=>{actual++;return wire();},request_admit:r=>r.logical_request_id==='dup'?{allowed:true,duplicate:true}:{allowed:true}}),[['GATE',async p=>{p.request_admit({attempts:3,logical_request_id:'real'});duplicate=await request(p,'dup',1);return{network_calls:0};}]]);
 assert.equal(duplicate.allowed,false);assert.equal(duplicate.status,'ALREADY_RESERVED_NO_REDISPATCH');assert.equal(actual,0);assert.equal(out.caller_reserved_requests,3);assert.equal(out.network_calls,0);
});
test('a later adapter cannot use an earlier venue unused grant without its own admission',async()=>{
 let actual=0;const out=await collectN05VenueRoutes(params({fetch_impl:async()=>{actual++;return wire();}}),[['GATE',async p=>{p.request_admit({attempts:3});return{network_calls:0};}],['BITGET',async p=>{await p.fetch_impl('https://controlled.invalid/no-own-grant');}],['BACKPACK',cache]]);
 assert.equal(actual,0);assert.equal(out.caller_reserved_requests,3);assert.equal(out.adapter_results[1].status,'CODE_OR_STORE_ERROR');assert.equal(out.components[0],good);
});
test('unadmitted transport fails before fetch and does not suppress the next admitted source',async()=>{
 let actual=0;const out=await collectN05VenueRoutes(params({fetch_impl:async()=>{actual++;return wire();}}),[['GATE',async p=>{await p.fetch_impl('https://controlled.invalid/unadmitted');}],['BITGET',async p=>{await request(p,'next');return{network_calls:1,components:[good]};}]]);
 assert.equal(actual,1);assert.equal(out.adapter_results[0].network_calls,0);assert.equal(out.network_calls,1);assert.equal(out.components[0],good);
});
test('unknown native usage retains earlier facts and stops all later adapters, including optional cache DB work',async()=>{
 const db={unknown:0,usageSnapshot(){return{unknown_ops:this.unknown};}};let late=0;
 const out=await collectN05VenueRoutes(params({db}),[['BACKPACK',cache],['BITGET',async()=>{db.unknown=1;throw Error('native DB failure');}],['POLONIEX',async()=>{late++;return cache();}]]);
 assert.equal(out.components[0],good);assert.equal(late,0);assert.equal(out.source_chain_native_cost_unclosed,true);assert.equal(out.adapter_results[2].status,'SOURCE_CHAIN_STOPPED_UNCLOSED_NATIVE_USAGE');assert.equal(db.unknown,1);
});
test('unknown cost arising during durable provider admission denies fetch and future source grants',async()=>{
 const db={unknown:0,usageSnapshot(){return{unknown_ops:this.unknown};}};let actual=0,late=0;
 const out=await collectN05VenueRoutes(params({db,fetch_impl:async()=>{actual++;return wire();}}),[['GATE',async p=>{p.request_admit({attempts:1});db.unknown=1;await p.fetch_impl('https://controlled.invalid/forbidden');}],['BITGET',async()=>{late++;return cache();}]]);
 assert.equal(actual,0);assert.equal(late,0);assert.equal(out.network_calls,0);assert.equal(out.caller_reserved_requests,1);assert.equal(db.unknown,1);
});
test('invalid native counters or instrumentation exception cannot be interpreted as measured zero',()=>{
 for(const unknown_ops of [1,-1,undefined,null,1.5,'0'])assert.equal(nativeSourceUsageUnclosed({usageSnapshot:()=>({unknown_ops})}),true);
 assert.equal(nativeSourceUsageUnclosed({usageSnapshot:()=>{throw Error('unavailable');}}),true);assert.equal(nativeSourceUsageUnclosed({usageSnapshot:()=>({unknown_ops:0})}),false);assert.equal(nativeSourceUsageUnclosed({}),false); // not a native receipt or extra authority
});
test('the same failure-preservation policy applies to all105 approved exact contracts without needing finalist selection',async()=>{
 assert.equal(APPROVED_HTX_ANALYSIS_CONTRACTS.length,105);
 for(const {contract_code:contract}of APPROVED_HTX_ANALYSIS_CONTRACTS){const c={...good,contract},out=await collectN05VenueRoutes(params({contract}),[['BACKPACK',async()=>({components:[c],network_calls:0})],['BITGET',async()=>{throw Error('controlled');}]]);assert.equal(out.components[0],c);assert.equal(out.components[0].contract,contract);assert.equal(out.network_calls,0);}
});
test('common N04/N15 role dispatcher retains earlier rows on a later failure and visits a known-cost fallback',async()=>{
 const fact={block_id:'N04',htx_contract:'TEST-USDT',source_ts:123};let fallback=0;
 const r=await collectEvidenceRouteBlock({routes:[{name:'CHAIN_EVENTS'},{name:'SECTOR'},{name:'SECTOR_COINGECKO'}],collectors:{CHAIN_EVENTS:async()=>({status:'CLOSED',evidence:[fact],network_calls:0}),SECTOR:async p=>{await request(p,'sector');throw Error('controlled source error');},SECTOR_COINGECKO:async p=>{fallback++;await request(p,'fallback');return{status:'CLOSED',evidence:[]};}},params:params({contract:'TEST-USDT'}),max_requests:5});
 assert.equal(r.results.CHAIN_EVENTS.evidence[0],fact);assert.equal(r.network_calls,2);assert.equal(fallback,1);
});
test('common dispatcher stops cross-block transport after unknown native usage and preserves owner pauses',async()=>{
 const db={unknown:0,usageSnapshot(){return{unknown_ops:this.unknown};}},fact={block_id:'N04',htx_contract:'TEST-USDT'};let late=0;
 const r=await collectEvidenceRouteBlock({routes:[{name:'CHAIN_EVENTS'},{name:'SECTOR'},{name:'SECTOR_COINGECKO'},{name:'BLUESKY'}],collectors:{CHAIN_EVENTS:async()=>({status:'CLOSED',evidence:[fact]}),SECTOR:async()=>{db.unknown++;return{status:'CODE_OR_STORE_ERROR'};},SECTOR_COINGECKO:async()=>{late++;},BLUESKY:async()=>{throw Error('paused source');}},params:params({contract:'TEST-USDT',db}),max_requests:5});
 assert.equal(r.results.CHAIN_EVENTS.evidence[0],fact);assert.equal(late,0);assert.equal(r.results.SECTOR_COINGECKO.status,'SOURCE_CHAIN_STOPPED_UNCLOSED_NATIVE_USAGE');assert.equal(r.results.BLUESKY.status,'BLOCK_PAUSED_BY_OWNER');assert.equal(db.unknown,1);assert.equal(r.network_calls,0);
});
test('N10 real existing candle reader and report consumer retain original same-window fact after later N05 adapter throws',async()=>{
 const full=activeSourceSamples.find(s=>s.venue==='BINANCE'),x=sampleParams(full),sample={...full,now:x.now,cache_observed_ts:x.cache.observed_ts,cache_expires_ts:x.cache.expires_ts},h=x.htx_window,c=x.component;
 const result=await collectN05VenueRoutes(params({contract:sample.contract}),[['BINANCE',async()=>({status:'CLOSED',components:[c],network_calls:0})],['BITGET',async()=>{throw Error('late failure');}]],async()=>({network_calls:0,status:'NO_BASELINE'}));let reads=0;
 const db={prepare(){return{bind(){return{first:async()=>{reads++;return{observed_ts:sample.cache_observed_ts,expires_ts:sample.cache_expires_ts,payload_json:JSON.stringify(x.cache.payload)};}};}};}};
 const out=await loadN10ReusedVenuePaths({db,contract:sample.contract,flow_result:result,primary_receipt:{check_completed:true,receipts:[{actual_price_windows:[{...h,label:'15m'}]}]},now:sample.now});
 assert.equal(out.evidence.length,1);assert.equal(reads,1);assert.equal(out.provider_http,0);assert.equal(verifyN10ReusedVenuePathEvidence(out.evidence[0],{now:sample.now}),true);assert.equal(out.evidence[0].source_ts,h.window_end_ts);assert.equal(out.evidence[0].source_cache_observed_ts,sample.cache_observed_ts);assert.equal(consumeBlockResultContext({contract:sample.contract,evidence:out.evidence,now:sample.now}).facts.length,1);assert.equal(out.evidence[0].coverage_fraction,0);assert.equal(out.evidence[0].entry_authorized_by_context,false);
});
test('N10 does not query its optional candle cache after native usage is already unknown',async()=>{
 const s=JSON.parse(fs.readFileSync(new URL('./fixtures/n10-reused-original-15m-samples.json',import.meta.url))).find(r=>r.venue==='BINANCE');let reads=0;
 const db={usageSnapshot:()=>({unknown_ops:1}),prepare(){reads++;throw Error('READ_FORBIDDEN');}};
 const out=await loadN10ReusedVenuePaths({db,contract:s.contract,flow_result:{components:[s.component]},primary_receipt:{check_completed:true,receipts:[{actual_price_windows:[{...s.htx_window,label:'15m'}]}]},now:s.now});
 assert.equal(reads,0);assert.equal(out.cache_reads,0);assert.equal(out.status,'SOURCE_CHAIN_STOPPED_UNCLOSED_NATIVE_USAGE');assert.equal(out.evidence.length,0);
});
test('N10 optional read failure retains native unknown and stops before the next pending component',async()=>{
 const s=JSON.parse(fs.readFileSync(new URL('./fixtures/n10-reused-original-15m-samples.json',import.meta.url))).find(r=>r.venue==='BINANCE');let reads=0,unknown=0;
 const db={usageSnapshot:()=>({unknown_ops:unknown}),prepare(){reads++;return{bind(){return{first:async()=>{unknown++;throw Error('UNMEASURED_READ');}};}};}};
 const out=await loadN10ReusedVenuePaths({db,contract:s.contract,flow_result:{components:[s.component,s.component]},primary_receipt:{check_completed:true,receipts:[{actual_price_windows:[{...s.htx_window,label:'15m'}]}]},now:s.now});
 assert.equal(reads,1);assert.equal(unknown,1);assert.equal(out.cache_reads,1);assert.equal(out.status,'SOURCE_CHAIN_STOPPED_UNCLOSED_NATIVE_USAGE');assert.equal(out.evidence.length,0);assert.equal(out.provider_http,0);
});
