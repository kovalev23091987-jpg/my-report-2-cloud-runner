import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeDeribitMarketContext,normalizeCoinLobsterContext,contextForContract,fetchCoinLobsterLiquidations,COINLOBSTER_TTL_MS} from '../files/src/global-market-context.mjs';
const dvol=(a,b)=>({result:{data:[[1,a,a,a,a],[2,b,b,b,b]]}});
const options=(currency)=>({result:[
 {instrument_name:`${currency}-27SEP26-100-C`,open_interest:100,volume:20},
 {instrument_name:`${currency}-27SEP26-100-P`,open_interest:140,volume:30},
]});
test('Deribit closes BTC and ETH background without becoming a directional vote',()=>{
 const out=normalizeDeribitMarketContext({btc_dvol:dvol(60,72),eth_dvol:dvol(70,82),btc_options:options('BTC'),eth_options:options('ETH'),observed_ts:3});
 assert.equal(out.status,'CLOSED');assert.equal(out.market_regime,'RISK_OFF_ELEVATED');assert.equal(out.directional_vote,false);assert.equal(out.internal_only,true);assert.equal(out.btc.options.put_call_oi_ratio,1.4);
});
test('CoinLobster candidate slicing prevents a different symbol from leaking into analysis',()=>{
 const c=normalizeCoinLobsterContext({whale_radar:{data:[{coin:'FIL',multiple:5},{coin:'SOL',multiple:9}]},liquidations:{top_coins:[{symbol:'FILUSDT',total:10},{symbol:'BTCUSDT',total:99}]},observed_ts:4});
 const out=contextForContract({observed_ts:4,deribit:{status:'CLOSED'},coinlobster:c},'FIL-USDT');
 assert.equal(out.coinlobster.whale_radar.length,1);assert.equal(out.coinlobster.realized_liquidations.length,1);assert.equal(out.coinlobster.whale_radar[0].coin,'FIL');
});
test('CoinLobster accepts current nested rows while retaining only harmless schema diagnostics',()=>{
 const out=normalizeCoinLobsterContext({whale_radar:{ok:true,data:{rows:[{coin:'ABC',unusual:true,direction:'BUY'}]}},liquidations:{ok:true,data:{topCoins:[{symbol:'ABC',long_usd:2,short_usd:3}]}},observed_ts:5});
 assert.equal(out.status,'CLOSED');assert.equal(out.radar_array_path,'data.rows');assert.equal(out.liquidations_array_path,'data.topCoins');assert.equal(out.whale_radar.length,1);assert.deepEqual(out.response_shapes.whale_radar_keys,['ok','data']);
});
test('CoinLobster has a 30 minute shared cache because its public IP quota is unpublished',()=>{
 assert.equal(COINLOBSTER_TTL_MS,30*60*1000);
});
test('liquidation-only CoinLobster request never fetches the whale radar',async()=>{
 const urls=[];const result=await fetchCoinLobsterLiquidations({fetch_impl:async url=>{urls.push(String(url));return new Response(JSON.stringify({top_coins:[{symbol:'FILUSDT',total:10}]}),{status:200});},now:1_800_000_000_000});
 assert.deepEqual(urls,['https://coinlobster.com/api/public/liquidations']);
 assert.equal(result.realized_liquidations.length,1);assert.deepEqual(result.whale_radar,[]);
});
test('CoinLobster current nested perp totals and named events remain distinct and exact-coin scoped',()=>{
 const payload={available:true,stale:false,perp_liquidations:{top_coins:[{base:'FIL',usd:900,longUsd:600,shortUsd:300},{base:'BTC',usd:9900}]},named_liquidations:[{base:'FIL',usd:300,side:'long'},{base:'BTC',usd:700,side:'short'}]};
 const context=normalizeCoinLobsterContext({liquidations:payload,observed_ts:6});
 assert.equal(context.status,'CLOSED');assert.equal(context.liquidations_array_path,'perp_liquidations.top_coins');assert.equal(context.realized_liquidations.length,2);assert.equal(context.named_liquidations.length,2);
 const scoped=contextForContract({observed_ts:6,coinlobster:context},'FIL-USDT').coinlobster;
 assert.equal(scoped.realized_liquidations.length,1);assert.equal(scoped.named_liquidations.length,1);
 assert.equal(scoped.realized_liquidations[0].usd,900);
});
test('CoinLobster stale liquidation response cannot provide current liquidation rows',()=>{
 const context=normalizeCoinLobsterContext({liquidations:{available:true,stale:true,perp_liquidations:{top_coins:[{base:'FIL',usd:900}]},named_liquidations:[{base:'FIL',usd:300}]},observed_ts:7});
 assert.equal(context.status,'NOT_CLOSED');assert.deepEqual(context.realized_liquidations,[]);assert.deepEqual(context.named_liquidations,[]);
});
