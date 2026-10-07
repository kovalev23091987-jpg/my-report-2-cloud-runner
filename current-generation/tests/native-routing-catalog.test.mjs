import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGTradeRoutingCatalog,verifiedNativeRotation,saveGTradeRoutingCatalog} from '../files/src/liquidation-extension/native-routing-catalog.mjs';
import {planLiquidationSourceOrder} from '../files/src/liquidation-source-weighting.mjs';
const T=1791360000000,raw={ok:true,receipt:{http_status:200,received_ts:T,sha256:'a'.repeat(64)},payload:{lastRefreshed:new Date(T-1000).toISOString(),groups:[{name:'crypto'},{name:'forex'}],pairs:[{from:'ZEC',to:'USD',groupIndex:0},{from:'QNT',to:'USD',groupIndex:0},{from:'EUR',to:'USD',groupIndex:1}]}},contracts=['ZEC-USDT','QNT-USDT'];
test('two proven crypto-market hints alternate collection priority, retain original clocks and contain no levels',()=>{
 const catalog=buildGTradeRoutingCatalog(raw,{now:T}),a=verifiedNativeRotation({catalog,contracts,now:T}),b=verifiedNativeRotation({catalog,contracts,now:T+2400000});
 assert.equal(a.eligible,true);assert.equal(b.eligible,true);assert.notEqual(a.preferred,b.preferred);assert.equal(catalog.markets.length,2);assert.equal(catalog.source_ts,T-1000);assert.equal(catalog.usable_as_liquidation_levels,false);
 const p=planLiquidationSourceOrder({lanes:['GTRADE_NATIVE','HYPERLIQUID_NATIVE','OXARCHIVE_HL_BUCKETS'],clock_capable:['GTRADE_NATIVE','HYPERLIQUID_NATIVE'],preferred:'GTRADE_NATIVE',costs:{GTRADE_NATIVE:1,HYPERLIQUID_NATIVE:1,OXARCHIVE_HL_BUCKETS:0},rows:[{source_id:'HYPERLIQUID_NATIVE',attempts:20,reliability:1}]});assert.equal(p.ordered[0],'GTRADE_NATIVE');
 const cached=planLiquidationSourceOrder({lanes:['GTRADE_NATIVE','HYPERLIQUID_NATIVE'],clock_capable:['GTRADE_NATIVE','HYPERLIQUID_NATIVE'],preferred:'HYPERLIQUID_NATIVE',cached:['GTRADE_NATIVE']});assert.equal(cached.ordered[0],'GTRADE_NATIVE');
});
test('unsupported, ambiguous, duplicate, expired, future and altered identities do not trigger rotation',()=>{
 const catalog=buildGTradeRoutingCatalog(raw,{now:T});
 for(const options of [{contracts:['EUR-USDT','QNT-USDT']},{contracts:['ZEC-USDT','ZEC-USDT']},{now:T+7*86400000+1},{now:T-1},{catalog:{...catalog,received_ts:T+100}}])assert.equal(verifiedNativeRotation({catalog,contracts,now:T,...options}).eligible,false);
 const invalid=structuredClone(raw);invalid.payload.pairs.push(invalid.payload.pairs[0]);assert.equal(buildGTradeRoutingCatalog(invalid,{now:T}).markets.some(x=>x.contract==='ZEC-USDT'),false);
 const missing=structuredClone(raw);delete missing.payload.lastRefreshed;assert.equal(buildGTradeRoutingCatalog(missing,{now:T}),null);
});
test('routing catalog uses existing cache only after D1 write admission, with no HTTP',async()=>{
 let writes=0;const db={prepare:()=>({bind:()=>({run:async()=>{writes++;}})})};
 const denied=await saveGTradeRoutingCatalog({db,raw,now:T,db_admit:()=>({allowed:false})});assert.equal(denied.saved,false);assert.equal(writes,0);
 const saved=await saveGTradeRoutingCatalog({db,raw,now:T,db_admit:cost=>({allowed:cost.rows_written===1&&cost.rows_read===0})});assert.equal(saved.saved,true);assert.equal(writes,1);
});
