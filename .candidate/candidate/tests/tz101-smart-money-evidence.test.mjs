import assert from 'node:assert/strict';
import {
  contractToByKaranteliSymbol,
  parseByKaranteliSmartMoney,
  parseByKaranteliWhaleSeries,
  fetchByKaranteliSmartMoneyRaw,
} from '../src/tz101-smart-money-evidence.mjs';

const NOW=Date.UTC(2026,8,17,12,30,0);
const smart={symbol:'BTCUSDT',fetchedAt:new Date(NOW-30_000).toISOString(),interpretation:'provider text only',takerBuySellRatio:0.9044,
  globalAccountLongPct:59.48,globalAccountShortPct:40.52,positioningDivergencePct:10.09,topTraderPositionLongPct:69.57,topTraderPositionShortPct:30.43};
assert.equal(contractToByKaranteliSymbol('BTC-USDT'),'BTCUSDT');
assert.equal(contractToByKaranteliSymbol('牛来-USDT'),null);
assert.equal(contractToByKaranteliSymbol('btc-usdt'),null);
const closed=parseByKaranteliSmartMoney({contract_code:'BTC-USDT',payload:smart,observed_ts:NOW});
assert.equal(closed.status,'CLOSED_RAW_UNCALIBRATED');
assert.equal(closed.score_eligible,false);
assert.equal(closed.directional_vote_eligible,false);
assert.equal(closed.factual_basis.top_trader_position_long_pct,69.57);
assert.equal(closed.factual_basis.provider_interpretation,'provider text only');
assert.equal(typeof closed.material_digest,'string');
assert.equal(parseByKaranteliSmartMoney({contract_code:'ETH-USDT',payload:smart,observed_ts:NOW}).reason,'PROVIDER_SYMBOL_MISMATCH');
assert.equal(parseByKaranteliSmartMoney({contract_code:'BTC-USDT',payload:{...smart,fetchedAt:new Date(NOW-11*60_000).toISOString()},observed_ts:NOW}).reason,'SOURCE_STALE');
assert.equal(parseByKaranteliSmartMoney({contract_code:'BTC-USDT',payload:{...smart,fetchedAt:new Date(NOW+2*60_000).toISOString()},observed_ts:NOW}).reason,'SOURCE_FROM_FUTURE');
assert.equal(parseByKaranteliSmartMoney({contract_code:'BTC-USDT',payload:{...smart,topTraderPositionShortPct:20},observed_ts:NOW}).reason,'TOP_TRADER_PERCENTAGES_INVALID');

const points=Array.from({length:24},(_,i)=>[NOW-(24-i)*60*60_000,(i%3===0?-1:1)*(1000+i)]);
const whale={metric:'whale_net',symbol:'BTCUSDT',period:'1h',unit:'usd',source:'Hyperliquid whale event recorder',as_of:new Date(NOW-10_000).toISOString(),points};
const series=parseByKaranteliWhaleSeries({contract_code:'BTC-USDT',payload:whale,observed_ts:NOW});
assert.equal(series.status,'CLOSED_RAW_UNCALIBRATED');
assert.equal(series.score_eligible,false);
assert.equal(series.directional_vote_eligible,false);
assert.equal(series.factual_basis.point_count,24);
assert.equal(series.factual_basis.positive_points+series.factual_basis.negative_points+series.factual_basis.zero_points,24);
assert.equal(parseByKaranteliWhaleSeries({contract_code:'BTC-USDT',payload:{...whale,metric:'hyperliquid_whale_net'},observed_ts:NOW}).reason,'WHALE_SERIES_IDENTITY_MISMATCH');
const duplicate=structuredClone(whale); duplicate.points[5][0]=duplicate.points[4][0];
assert.equal(parseByKaranteliWhaleSeries({contract_code:'BTC-USDT',payload:duplicate,observed_ts:NOW}).reason,'WHALE_SERIES_TIME_NOT_STRICTLY_INCREASING');
const future=structuredClone(whale); future.points.at(-1)[0]=NOW+120_000;
assert.equal(parseByKaranteliWhaleSeries({contract_code:'BTC-USDT',payload:future,observed_ts:NOW}).reason,'WHALE_SERIES_POINT_FROM_FUTURE');
assert.equal(parseByKaranteliWhaleSeries({contract_code:'BTC-USDT',payload:{...whale,points:points.slice(0,5)},observed_ts:NOW}).reason,'WHALE_SERIES_COVERAGE_INSUFFICIENT');

let called=null;
const fetched=await fetchByKaranteliSmartMoneyRaw({contract_code:'BTC-USDT',api_key:'k',observed_ts:NOW,fetch_impl:async(url,init)=>{called={url,init};return {ok:true,status:200,json:async()=>smart};}});
assert.equal(fetched.status,'CLOSED_RAW_UNCALIBRATED');
assert.equal(fetched.external_fetches,1);
assert.equal(called.url,'https://bykaranteli.com/api/public/smart-money/BTCUSDT');
assert.equal(called.init.headers.authorization,'Bearer k');
assert.equal((await fetchByKaranteliSmartMoneyRaw({contract_code:'BTC-USDT',api_key:'',observed_ts:NOW,fetch_impl:async()=>{throw new Error('should not call');}})).external_fetches??0,0);
console.log(JSON.stringify({ok:true,suite:'tz101-smart-money-evidence',assertions:'raw factual only; exact identity/freshness/percentages; series monotonicity; no score/directional vote; one-call fetch'}));
