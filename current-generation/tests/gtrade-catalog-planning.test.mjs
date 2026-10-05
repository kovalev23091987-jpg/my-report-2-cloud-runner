import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {createGTradeRuntimeCollector} from '../files/src/liquidation-extension/gtrade-runtime-collector.mjs';
import {planLiquidationSourceOrder} from '../files/src/liquidation-source-weighting.mjs';
import {createCombinedLiquidationService} from '../files/src/liquidation-extension/combined-runner-service.mjs';
const raw=fs.readFileSync(new URL('../../post-v7-consolidated/liquidation/liquidation-extension/evidence/gtrade_variables_v2.raw',import.meta.url));
const SHA='202c049a5e26b4c0332495cf94a2f92c32facc9c8619b7e42aa9c874291fb3d1',T=1790489990092;
const variables=JSON.parse(raw),sdk={getLiquidationPrice(){throw Error('NO_POSITION_SDK_CALL_IN_CATALOG_PROOF');},buildLiquidationPriceContext(){throw Error('NO_POSITION_SDK_CALL_IN_CATALOG_PROOF');}};
function collector(payload=raw){let calls=0,now=T;const collect=createGTradeRuntimeCollector({sdk,clock:()=>now,fetch_impl:async url=>{calls++;assert.ok(String(url).endsWith('/trading-variables'));return new Response(payload,{status:200,headers:{'content-type':'application/json'}});}});return{collect,calls:()=>calls,clock:v=>now=v};}
const query=symbol=>({contract:symbol+'-USDT',native_symbol:symbol,run_id:'ACTUAL-CATALOG-ORIGINAL-CUTOFF',acquisition_id:'PROOF-'+symbol,deadline_ts:T+20000});
test('exact actual shared gTrade catalog makes next supported market eligible without another source request',async()=>{
 assert.equal(createHash('sha256').update(raw).digest('hex'),SHA);assert.equal(variables.pairs.length,493);
 const c=collector();assert.equal(c.collect.nativeMarketCoverage(query('FIL')).status,'CATALOG_DISCOVERY_REQUIRED');
 const first=await c.collect(query('BR'));assert.equal(first.status,'GTRADE_SYMBOL_UNSUPPORTED');assert.equal(c.calls(),1);
 assert.equal(c.collect.nativeMarketCoverage(query('BR')).status,'UNSUPPORTED');assert.equal(c.collect.nativeMarketCoverage(query('FIL')).status,'SUPPORTED');assert.equal(c.collect.estimateHttpCost(query('FIL')),2);assert.equal(c.collect.hasRunSnapshot(query('FIL').run_id),false);assert.equal(c.calls(),1);
 const order=planLiquidationSourceOrder({lanes:['GMX_NATIVE','GTRADE_NATIVE'],costs:{GMX_NATIVE:4,GTRADE_NATIVE:2},exact:['GMX_NATIVE',...(c.collect.nativeMarketCoverage(query('FIL')).status==='SUPPORTED'?['GTRADE_NATIVE']:[])]});
 assert.equal(order.ordered[0],'GTRADE_NATIVE');assert.equal(order.profile[0].coverage,'EXACT_ROUTE_PROVEN');assert.equal(order.profile[0].cached_snapshot,false);assert.equal(order.profile[0].priority,2);assert.equal(c.calls(),1);
});
test('catalog freshness and run identity cannot be replaced by an old exact match',async()=>{
 const c=collector();await c.collect(query('BR'));c.clock(T+300001);assert.equal(c.collect.nativeMarketCoverage(query('FIL')).status,'CATALOG_NOT_CLOSED');assert.equal(c.collect.nativeMarketCoverage({...query('FIL'),run_id:'OTHER-RUN'}).status,'CATALOG_DISCOVERY_REQUIRED');assert.equal(c.calls(),1);
});
test('combined service reuses actual catalog across candidates and reserves the exact gTrade route before a four-request GMX route',async()=>{
 const urls=[];const service=createCombinedLiquidationService({mode:'SHADOW_ONLY',clock:()=>T,max_http_per_run:5,provider_admit:async()=>({allowed:true,new_reservation:true}),sdk_loader:()=>({version:'1.8.10',sdk}),fetch_impl:async url=>{urls.push(String(url));if(String(url).endsWith('/trading-variables'))return new Response(raw,{status:200});if(String(url).endsWith('/open-trades'))return new Response('[]',{status:200});if(String(url).endsWith('/charts'))return new Response(JSON.stringify({indexPrices:[],time:T}),{status:200});throw Error('UNEXPECTED_GMX_OR_OTHER_PROVIDER_DISPATCH');}});
 const first={...query('BR'),deep_started_ts:T,max_deep_ms:45000,max_http_for_candidate:5,allowed_source_ids:['GTRADE_NATIVE']};
 await service.collect(first);await service.collect({...first,...query('FIL'),allowed_source_ids:['GMX_NATIVE','GTRADE_NATIVE'],source_identity:{gmx_market_address:'0x'+'1'.repeat(40)}});
 assert.equal(urls.length,3);assert.ok(urls.every(u=>u.includes('gains.trade')));assert.equal(urls.filter(u=>u.endsWith('/trading-variables')).length,1);
 const summary=service.summary();assert.equal(summary.source_weighting.profile[0].source_id,'GTRADE_NATIVE');
});
test('actual stock/forex routes, ambiguous crypto and future catalog clocks remain ineligible',async()=>{
 const nonCrypto=variables.pairs.find(p=>p.to==='USD'&&!['crypto','altcoins','crypto-degen'].includes(variables.groups[Number(p.groupIndex)]?.name));assert.ok(nonCrypto);
 const c=collector();await c.collect(query('BR'));assert.notEqual(c.collect.nativeMarketCoverage(query(nonCrypto.from)).status,'SUPPORTED');
 const duplicate=structuredClone(variables);duplicate.pairs.push(structuredClone(variables.pairs.find(p=>p.from==='FIL'&&p.to==='USD')));
 const a=collector(JSON.stringify(duplicate));await a.collect(query('BR'));assert.equal(a.collect.nativeMarketCoverage(query('FIL')).status,'IDENTITY_NOT_CLOSED');
 const future=structuredClone(variables);future.lastRefreshed=T+1;const f=collector(JSON.stringify(future));await f.collect(query('BR'));assert.equal(f.collect.nativeMarketCoverage(query('FIL')).status,'CATALOG_NOT_CLOSED');
});
