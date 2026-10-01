import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTrackedBands,collectTrackedBands} from './prepared-byk-tracked-future-map.mjs';
import {buildPumpLiquidationZones} from '../../current-generation/files/src/pump-liquidation-zones.mjs';
const T=1800000000000;
// Synthetic schema controls; these are not live market evidence or BTW levels.
const data=()=>({coin:'SOL',mark:100,bucket_pct:0.25,generatedAt:new Date(T).toISOString(),coverage:{scanned:850,universe:1000,scanned_at:new Date(T).toISOString()},totals:{without_liq_px:7},long:[{price:99.75,notional_usd:2000000,positions:2,distance_pct:-0.25}],short:[{price:1100,notional_usd:4000000,positions:3,distance_pct:1000}],model_comparison:{nearest_short:{price:102,notional_usd:90000000}},history:[{price:88,notional_usd:99999999}]});
const args={contract:'SOL-USDT',run_id:'PREPARED-COLLECT',observed_ts:T};
test('native sample bands retain huge nearby and far positions with USD source reference and conditional bucket semantics',()=>{
 const r=normalizeTrackedBands(data(),args);assert.equal(r.zone_count,2);assert.equal(r.coverage.full_market_census,false);assert.equal(r.coverage.provider_totals.without_liq_px,7);assert.equal(r.independent_of_other_hl_sources,false);
 const view=buildPumpLiquidationZones({contract:'SOL-USDT',current_price:200,observed_ts:T,provider_maps:r.maps});assert.equal(view.all_zones.length,2);assert.equal(view.below[0].distance_pct,-0.24999999999999467);assert.equal(view.above[0].distance_pct,1000);assert.equal(view.above[0].strength_label_ru,'огромная');assert.equal(view.above[0].notional,4000000);assert.equal(view.above[0].estimated,true);assert.equal(view.above[0].decision_target_eligible,false);assert.equal(view.above[0].price_quote,'USD');assert.equal(view.above[0].conditional_cross,true);
});
test('neither a wrong asset, missing source clock, future clock nor old source is accepted as fresh positions',()=>{
 assert.equal(normalizeTrackedBands({...data(),coin:'BTC'},args).status,'EXACT_SYMBOL_MISMATCH');
 assert.equal(normalizeTrackedBands({...data(),coverage:{scanned:850,universe:1000}},args).status,'SOURCE_TIMESTAMP_MISSING');
 assert.equal(normalizeTrackedBands({...data(),coverage:{scanned:850,universe:1000,scanned_at:new Date(T+1).toISOString()}},args).status,'FUTURE_SOURCE_TIMESTAMP');
 assert.equal(normalizeTrackedBands({...data(),coverage:{scanned:850,universe:1000,scanned_at:new Date(T-300001).toISOString()}},args).status,'STALE_SOURCE');
});
test('invalid band geometry and no-liquidation-price positions do not become future zones or a whole-market zero',()=>{
 const p=data();p.long=[{price:101,notional_usd:2000000,positions:1}];p.short=[];const r=normalizeTrackedBands(p,args);assert.equal(r.maps.length,0);assert.equal(r.status,'NO_VALID_BANDS_IN_TRACKED_SAMPLE');assert.equal(r.coverage.rejected_bands,1);assert.equal(r.coverage.full_market_census,false);
});
test('source lists larger than the bounded sample envelope fail without inventing a partial complete map',()=>{
 const p=data();p.short=Array.from({length:2001},()=>p.short[0]);assert.equal(normalizeTrackedBands(p,args).status,'SOURCE_ROWS_SIZE_LIMIT');
});
test('new read-only source reuses a granted monthly reservation and one admitted HTTP attempt',async()=>{
 let calls=0;const opts={contract:'SOL-USDT',run_id:'PREPARED-COLLECT',request_admit:()=>({allowed:true,duplicate:false}),fetch_impl:async(url,init)=>{calls++;assert.equal(url,'https://bykaranteli.com/api/public/hyperliquid-positions?coin=SOL&hours=1');assert.equal(init.method,'GET');return new Response(JSON.stringify({...data(),coverage:{scanned:850,universe:1000,scanned_at:new Date().toISOString()}}));}};
 await collectTrackedBands({...opts,byk_admission:{allowed:true,reserved_units:3}});assert.equal(calls,0);
 await collectTrackedBands({...opts,byk_admission:{allowed:true,reserved_units:5},request_admit:()=>({allowed:true,duplicate:true})});assert.equal(calls,0);
 const r=await collectTrackedBands({...opts,byk_admission:{allowed:true,reserved_units:5}});assert.equal(calls,1);assert.equal(r.network_calls,1);assert.equal(r.zone_count,2);
});
test('a proxy allowlist refusal is retained as a connection error and cannot become an empty liquidation map',async()=>{
 const r=await collectTrackedBands({contract:'BTW-USDT',run_id:'PREPARED-REFUSAL',byk_admission:{allowed:true,reserved_units:4},request_admit:()=>({allowed:true,duplicate:false}),fetch_impl:async()=>new Response(JSON.stringify({error:'URL_NOT_ALLOWED'}),{status:403})});assert.equal(r.status,'CLOUD_PROXY_ROUTE_NOT_ALLOWED');assert.equal(r.network_calls,1);assert.equal(r.data_available,false);assert.deepEqual(r.maps,[]);
});
