import assert from "node:assert/strict";
import {
  candidateVenueAliases,
  parseBybitInstrumentVerification,
  parseOkxInstrumentVerification,
  parseBinanceEchoVerification,
  parseBybitFunding,
  parseOkxFunding,
  parseBinanceFunding,
  parseBybitOi,
  oiWindowChange,
  candleWindowChange,
  parseBybitHourlyCandles,
  parseOkxHourlyCandles,
  parseBinanceHourlyCandles,
  synchronizedReturns,
  downMarketRelativeObservations,
  collectPublicFullEvidence,
  buildCrossVenueAssetIdentityProof,
} from "../src/public-evidence-adapters.mjs";

const H=3600000, NOW=1800000000000;
assert.equal(candidateVenueAliases("ETHFI-USDT").bybit,"ETHFIUSDT");
assert.equal(candidateVenueAliases("ETHFI-USDT").okx_swap,"ETHFI-USDT-SWAP");
assert.equal(candidateVenueAliases("龙虾-USDT").alias_candidate_safe,false);
assert.equal(candidateVenueAliases("龙虾-USDT").bybit,null);

assert.equal(parseBybitInstrumentVerification({retCode:0,result:{list:[{symbol:"ETHFIUSDT",baseCoin:"ETHFI",quoteCoin:"USDT",settleCoin:"USDT",contractType:"LinearPerpetual",status:"Trading",isPreListing:false,fundingInterval:"60"}]}},"ETHFIUSDT").verified,true);
assert.equal(parseBybitInstrumentVerification({retCode:0,result:{list:[{symbol:"ETHFIUSDT",baseCoin:"ETHFI",quoteCoin:"USDT",settleCoin:"USDT",contractType:"LinearPerpetual",status:"PreLaunch",isPreListing:true,fundingInterval:"60"}]}},"ETHFIUSDT").verified,false);
assert.equal(parseOkxInstrumentVerification({code:"0",data:[{instId:"ETHFI-USDT-SWAP",instType:"SWAP",ctValCcy:"ETHFI",settleCcy:"USDT",state:"live"}]},"ETHFI-USDT-SWAP","SWAP").verified,true);
assert.equal(parseOkxInstrumentVerification({code:"0",data:[{instId:"ETHFI-USDT-SWAP",instType:"SWAP",ctValCcy:"ETHFI",settleCcy:"USDT",state:"suspend"}]},"ETHFI-USDT-SWAP","SWAP").verified,false);
const binanceInfo={symbols:[{symbol:"ETHFIUSDT",baseAsset:"ETHFI",quoteAsset:"USDT",marginAsset:"USDT",contractType:"PERPETUAL",status:"TRADING"}]};
assert.equal(parseBinanceEchoVerification(binanceInfo,"ETHFIUSDT").verified,true);
assert.equal(parseBinanceEchoVerification({symbols:[{symbol:"ETHFIUSDT",baseAsset:"ETHFI",quoteAsset:"USDT",marginAsset:"USDT",contractType:"CURRENT_QUARTER",status:"TRADING"}]},"ETHFIUSDT").verified,false);

const identityClosed=buildCrossVenueAssetIdentityProof("ETHFI-USDT",{
  okx_swap:{verified:true,base_coin:"ETHFI"},
  okx_spot:{verified:true,base_coin:"ETHFI"},
  bybit:{verified:false},binance_futures:{verified:false}
});
assert.equal(identityClosed.verified,true);
const identityOpen=buildCrossVenueAssetIdentityProof("ETHFI-USDT",{
  okx_swap:{verified:true,base_coin:"ETHFI"},
  okx_spot:{verified:false,base_coin:null},
  bybit:{verified:false},binance_futures:{verified:false}
});
assert.equal(identityOpen.verified,false);
assert.equal(buildCrossVenueAssetIdentityProof("龙虾-USDT",{}).verified,false);

const bf=parseBybitFunding({result:{list:[{fundingRateTimestamp:String(NOW-2*H),fundingRate:"-0.001"},{fundingRateTimestamp:String(NOW-H),fundingRate:"-0.0008"}]}});
assert.equal(bf.latest.rate,-0.0008); assert.equal(bf.inferred_interval_hours,1);
const of=parseOkxFunding({data:[{fundingTime:String(NOW-8*H),realizedRate:"0.0001"},{fundingTime:String(NOW),realizedRate:"0.0002"}]});
assert.equal(of.inferred_interval_hours,8);
const ofFallback=parseOkxFunding({data:[{fundingTime:String(NOW-H),realizedRate:"",fundingRate:"-0.00031"}]});
assert.equal(ofFallback.latest,null);
const bnf=parseBinanceFunding([{fundingTime:NOW-8*H,fundingRate:"0.001"},{fundingTime:NOW,fundingRate:"0.002"}]);
assert.equal(bnf.latest.rate,0.002);
const mismatch=parseBinanceFunding([{fundingTime:NOW-12*H,fundingRate:"0.001"},{fundingTime:NOW-8*H,fundingRate:"0.001"},{fundingTime:NOW,fundingRate:"0.002"}]);
assert.equal(mismatch.interval_consistent,false);

const oi=parseBybitOi({result:{list:[{timestamp:String(NOW-2*H),openInterest:"100"},{timestamp:String(NOW-H),openInterest:"110"},{timestamp:String(NOW),openInterest:"121"}]}});
assert.equal(Math.round(oiWindowChange(oi.series,1).change_pct),10);

const mk=(base=100)=>Array.from({length:26},(_,i)=>({ts:NOW-(25-i)*H,close:base+i,closed:true}));
const cand=mk(100), btc=mk(200), eth=mk(300);
const sync=synchronizedReturns(cand,btc,eth,[1,4,24]);
assert.equal(sync.common_points,26);
assert.equal(sync.windows["24h"].status,"CLOSED");
assert.ok(Number.isFinite(sync.windows["4h"].vs_btc_pp));

// Missing target timestamps must NOT silently stretch a nominal window.
const gapTs=NOW-H;
const gapCand=cand.filter(r=>r.ts!==gapTs);
const gapBtc=btc.filter(r=>r.ts!==gapTs);
const gapEth=eth.filter(r=>r.ts!==gapTs);
const gapSync=synchronizedReturns(gapCand,gapBtc,gapEth,[1,4]);
assert.equal(gapSync.windows["1h"].status,"NOT_CLOSED");
assert.equal(gapSync.windows["1h"].actual_window_hours,2);
assert.equal(gapSync.windows["1h"].window_target_closed,false);

const gapOi=oiWindowChange([{ts:NOW-2*H,oi:100},{ts:NOW,oi:120}],1);
assert.equal(gapOi.actual_window_hours,2);
const gapPrice=candleWindowChange([{ts:NOW-5*H,close:100},{ts:NOW,close:110}],4);
assert.equal(gapPrice.actual_window_hours,5);
const internalGap=cand.filter(r=>r.ts!==NOW-2*H);
assert.equal(candleWindowChange(internalGap,4).window_target_closed,false);
const internalGapSync=synchronizedReturns(internalGap,btc,eth,[4]);
assert.equal(internalGapSync.windows["4h"].status,"NOT_CLOSED");
assert.equal(internalGapSync.windows["4h"].received_points,4);
const unsynchronizedBtc=synchronizedReturns(cand,btc.filter(r=>r.ts!==NOW-2*H),eth,[4]);
assert.equal(unsynchronizedBtc.windows["4h"].status,"NOT_CLOSED");
const unsynchronizedEth=synchronizedReturns(cand,btc,eth.filter(r=>r.ts!==NOW-3*H),[4]);
assert.equal(unsynchronizedEth.windows["4h"].status,"NOT_CLOSED");

const downCand=[{ts:NOW-2*H,close:100},{ts:NOW-H,close:101},{ts:NOW,close:102}];
const downBtc=[{ts:NOW-2*H,close:100},{ts:NOW-H,close:98},{ts:NOW,close:99}];
const down=downMarketRelativeObservations(downCand,downBtc);
assert.equal(down.negative_benchmark_hours,1);
assert.equal(down.candidate_better_hours,1);

// Explicitly reject current/unclosed candles in all three parsers.
assert.equal(parseBybitHourlyCandles({result:{list:[[String(NOW),"1","2","0.5","1.5","1"]]}},NOW).length,0);
assert.equal(parseOkxHourlyCandles({data:[[String(NOW-H),"1","2","0.5","1.5","1","","","0"]]}).length,0);
assert.equal(parseBinanceHourlyCandles([[NOW,"1","2","0.5","1.5","1",NOW+H-1]],NOW).length,0);

// Mocked end-to-end: Unicode must make zero external fetches and remain non-live.
let unicodeCalls=0;
const unicodeResult=await collectPublicFullEvidence({contract_code:"龙虾-USDT",now_ts:NOW,fetch_impl:async()=>{unicodeCalls++;throw new Error("must not fetch");}});
assert.equal(unicodeCalls,0);
assert.ok(unicodeResult.evidence.some(x=>x.status==="SOURCE_INCOMPATIBLE"));
assert.equal(unicodeResult.safety.live_promotion,false);
assert.equal(unicodeResult.safety.telegram,false);

// Mocked ASCII path verifies exact venue symbols and creates factual evidence rows.
const jsonResponse=(data)=>({ok:true,status:200,async json(){return data;}});
let urls=[];
async function mockFetch(url){
  urls.push(url);
  if(url.includes("bybit.com/v5/market/instruments-info")) return jsonResponse({retCode:0,retMsg:"OK",result:{list:[{symbol:"ETHFIUSDT",baseCoin:"ETHFI",quoteCoin:"USDT",settleCoin:"USDT",contractType:"LinearPerpetual",status:"Trading",isPreListing:false,fundingInterval:"60"}]}});
  if(url.includes("okx.com/api/v5/public/instruments") && url.includes("SWAP")) return jsonResponse({code:"0",msg:"",data:[{instId:"ETHFI-USDT-SWAP",instType:"SWAP",ctValCcy:"ETHFI",settleCcy:"USDT",state:"live"}]});
  if(url.includes("okx.com/api/v5/public/instruments") && url.includes("SPOT")) return jsonResponse({code:"0",msg:"",data:[{instId:"ETHFI-USDT",instType:"SPOT",baseCcy:"ETHFI",quoteCcy:"USDT",state:"live"}]});
  if(url.includes("fapi.binance.com/fapi/v1/exchangeInfo")) return jsonResponse(binanceInfo);
  if(url.includes("bybit.com/v5/market/funding/history")) return jsonResponse({retCode:0,result:{list:[{fundingRateTimestamp:String(NOW-H),fundingRate:"-0.001"},{fundingRateTimestamp:String(NOW-2*H),fundingRate:"-0.0011"}]}});
  if(url.includes("bybit.com/v5/market/open-interest")) return jsonResponse({retCode:0,result:{list:[{timestamp:String(NOW),openInterest:"121"},{timestamp:String(NOW-H),openInterest:"110"},{timestamp:String(NOW-2*H),openInterest:"100"}]}});
  if(url.includes("bybit.com/v5/market/kline")) return jsonResponse({retCode:0,result:{list:Array.from({length:26},(_,i)=>[String(NOW-(i+1)*H),String(100+i),String(101+i),String(99+i),String(100+i),"1"])}});
  if(url.includes("okx.com/api/v5/public/funding-rate-history")) return jsonResponse({code:"0",data:[{fundingTime:String(NOW-H),realizedRate:"-0.0009"},{fundingTime:String(NOW-2*H),realizedRate:"-0.0010"}]});
  if(url.includes("okx.com/api/v5/public/open-interest")) return jsonResponse({code:"0",data:[{ts:String(NOW),oi:"1000",oiUsd:"500000"}]});
  if(url.includes("okx.com/api/v5/market/candles")) {
    const base=url.includes("BTC-USDT")?200:url.includes("ETH-USDT")?300:100;
    return jsonResponse({code:"0",data:Array.from({length:26},(_,i)=>[String(NOW-(i+1)*H),String(base+i),String(base+i+1),String(base+i-1),String(base+i),"1","","","1"])});
  }
  if(url.includes("fapi.binance.com/fapi/v1/fundingRate")) return jsonResponse([{fundingTime:NOW-2*H,fundingRate:"-0.0007"},{fundingTime:NOW-H,fundingRate:"-0.0008"}]);
  if(url.includes("fapi.binance.com/futures/data/openInterestHist")) return jsonResponse([{timestamp:NOW-2*H,sumOpenInterest:"100",sumOpenInterestValue:"1000"},{timestamp:NOW-H,sumOpenInterest:"110",sumOpenInterestValue:"1100"}]);
  if(url.includes("fapi.binance.com/fapi/v1/klines")) return jsonResponse(Array.from({length:26},(_,i)=>{const ts=NOW-(i+1)*H;return [ts,"1","2","0.5",String(1+i/100),"1",ts+H-1];}));
  throw new Error(`unmocked ${url}`);
}
const ascii=await collectPublicFullEvidence({contract_code:"ETHFI-USDT",now_ts:NOW,fetch_impl:mockFetch});
assert.ok(urls.length>=10);
assert.equal(ascii.alias_verification.asset_identity.verified,true);
assert.match(ascii.alias_verification.asset_identity.method,/EXACT_BASE/);
assert.ok(ascii.evidence.some(x=>x.metric==="funding_rate" && x.venue==="BYBIT" && x.status==="CLOSED" && x.venue_observation_status==="CLOSED" && x.asset_identity_verified===true));
assert.ok(ascii.evidence.filter(x=>x.alias_required && x.venue_observation_status==="CLOSED" && !x.error).every(x=>x.alias_verification_scope.includes("EXACT_BASE") && x.asset_identity_verified===true));
assert.ok(ascii.evidence.some(x=>x.metric==="rs_vs_btc_4h" && x.status==="CLOSED" && x.asset_identity_verified===true));
assert.ok(ascii.evidence.some(x=>x.metric==="spot_turnover_24h" && x.status==="CLOSED" && x.value>0 && x.asset_identity_verified===true));
assert.ok(ascii.evidence.filter(x=>x.venue_observation_status==="CLOSED" && x.source_ts).every(x=>x.max_age_sec!==null));
assert.ok(ascii.cross_venue_derivatives_detail.funding.comparable_venues>=2);
assert.ok(Number.isFinite(ascii.cross_venue_derivatives_detail.funding.spread_per_hour));
assert.ok(ascii.evidence.some(x=>x.chain==="SMART_MONEY_ONCHAIN" && x.status==="NOT_CLOSED"));
assert.equal(ascii.safety.strategy_weights_changed,false);
assert.equal(ascii.safety.missing_data_directional_penalty,false);
assert.ok(ascii._opportunity_hourly_candles.BYBIT_PERP.length >= 20);
assert.ok(ascii._opportunity_hourly_candles.OKX_PERP.length >= 20);
assert.ok(ascii._opportunity_hourly_candles.BINANCE_PERP.length >= 20);
assert.ok(ascii._opportunity_hourly_candles.OKX_SPOT.length >= 20);
assert.ok(ascii._opportunity_hourly_candles.BTC_SPOT.length >= 20);
assert.ok(ascii._opportunity_hourly_candles.ETH_SPOT.length >= 20);
assert.equal(Object.prototype.propertyIsEnumerable.call(ascii,"_opportunity_hourly_candles"),false);
assert.equal(JSON.stringify(ascii).includes("_opportunity_hourly_candles"),false);

// End-to-end OI gap: two points 2h apart cannot close a nominal 1h OI trajectory.
async function gapMockFetch(url){
  if(url.includes("bybit.com/v5/market/open-interest")) return jsonResponse({retCode:0,result:{list:[{timestamp:String(NOW),openInterest:"121"},{timestamp:String(NOW-2*H),openInterest:"100"}]}});
  return mockFetch(url);
}
const gapped=await collectPublicFullEvidence({contract_code:"ETHFI-USDT",now_ts:NOW,fetch_impl:gapMockFetch});
const gappedBybitOi=gapped.evidence.find(x=>x.venue==="BYBIT" && x.metric==="oi_change_1h");
assert.equal(gappedBybitOi.status,"NOT_CLOSED");
assert.match(gappedBybitOi.note,/actual_window_hours=2/);

async function fundingMismatchMock(url){
  if(url.includes("bybit.com/v5/market/funding/history")) return jsonResponse({retCode:0,result:{list:[{fundingRateTimestamp:String(NOW-16*H),fundingRate:"-0.001"},{fundingRateTimestamp:String(NOW-8*H),fundingRate:"-0.0008"}]}});
  return mockFetch(url);
}
const fundingMismatch=await collectPublicFullEvidence({contract_code:"ETHFI-USDT",now_ts:NOW,fetch_impl:fundingMismatchMock});
const bybitFundingMismatch=fundingMismatch.evidence.find(x=>x.venue==="BYBIT"&&x.metric==="funding_rate");
assert.equal(bybitFundingMismatch.status,"NOT_CLOSED");
assert.match(bybitFundingMismatch.note,/period_matches_instrument=false/);

// HTTP 200 with API-level error, HTTP rate limit, and timeout remain explicit and fail closed.
async function apiErrorMock(url){
  if(url.includes("bybit.com/v5/market/instruments-info")) return jsonResponse({retCode:10001,retMsg:"bad request",result:{list:[]}});
  return mockFetch(url);
}
const apiErrorResult=await collectPublicFullEvidence({contract_code:"ETHFI-USDT",now_ts:NOW,fetch_impl:apiErrorMock});
assert.equal(apiErrorResult.alias_verification.bybit.status,"NOT_CLOSED");
assert.match(apiErrorResult.alias_verification.bybit.fetch_error,/BYBIT_API_10001/);

const rateLimitResponse={ok:false,status:429,async json(){return {code:-1003,msg:"rate limited"};}};
async function rateLimitMock(url){
  if(url.includes("fapi.binance.com/fapi/v1/exchangeInfo")) return rateLimitResponse;
  return mockFetch(url);
}
const rateLimited=await collectPublicFullEvidence({contract_code:"ETHFI-USDT",now_ts:NOW,fetch_impl:rateLimitMock});
assert.equal(rateLimited.alias_verification.binance_futures.status,"NOT_CLOSED");
assert.equal(rateLimited.alias_verification.binance_futures.http_status,429);

async function timeoutMock(url){
  if(url.includes("okx.com/api/v5/public/instruments")) { const e=new Error("aborted"); e.name="AbortError"; throw e; }
  return mockFetch(url);
}
const timedOut=await collectPublicFullEvidence({contract_code:"ETHFI-USDT",now_ts:NOW,fetch_impl:timeoutMock});
assert.equal(timedOut.alias_verification.okx_swap.fetch_error,"TIMEOUT");
assert.equal(timedOut.alias_verification.okx_spot.fetch_error,"TIMEOUT");

console.log(JSON.stringify({ok:true,suite:"public-evidence-adapters",assertions:"active perpetual verification, Unicode fail-closed zero fetch, realized funding only, funding-period consistency, exact-window internal-gap guards, synchronized RS, closed-candle checks, API-level errors, rate limits, timeouts, external Chain4/5 not_closed, zero live promotion"},null,2));
