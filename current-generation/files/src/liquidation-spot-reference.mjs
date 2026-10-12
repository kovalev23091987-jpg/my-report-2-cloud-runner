const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value):null;
const kinds=new Set(['NATIVE_FUTURE_LEVEL','PROVIDER_ESTIMATE','PROJECTED']);

// Spot has no forced futures liquidations. This is a price cross-check for an
// already available futures-level view, reusing the exact HTX depth snapshot.
export function buildLiquidationSpotReference({contract,market_context,liquidations,observed_ts}={}){
 const now=finite(observed_ts),market=market_context;
 const base={schema:'liquidation-spot-price-reference-v1',status:'NOT_CLOSED',contract:String(contract??'').toUpperCase(),source:'HTX',physical_root_key:'HTX_OFFICIAL_PUBLIC_MARKET',independent_liquidation_source_count_added:0,network_calls:0,score_contribution:0,entry_authorized:false};
 if(!Number.isSafeInteger(now)||market?.status!=='CLOSED_COMPARABLE_PRICE_AND_SPREAD'||market?.contract!==base.contract||market?.observed_ts!==now||!market.spot||!market.futures||!liquidations||liquidations.status!=='CLOSED')return base;
 const spotTs=finite(market.spot.source_ts),futuresTs=finite(market.futures.source_ts),spot=finite(market.spot.mid),futures=finite(market.futures.mid);
 if(!Number.isSafeInteger(spotTs)||!Number.isSafeInteger(futuresTs)||spotTs>now||futuresTs>now||now-spotTs>300000||now-futuresTs>300000||Math.abs(spotTs-futuresTs)>30000||spot<=0||futures<=0)return base;
 const zones=[...(Array.isArray(liquidations.above)?liquidations.above:[]),...(Array.isArray(liquidations.below)?liquidations.below:[])];
 if(!zones.some(z=>kinds.has(z?.kind)&&finite(z?.price)>0&&Number.isSafeInteger(finite(z?.source_ts))&&z.source_ts<=now&&now-z.source_ts<=300000))return base;
 const basis=(futures/spot-1)*100;
 return {...base,status:'CLOSED',observed_ts:now,source_ts:Math.min(spotTs,futuresTs),spot_source_ts:spotTs,futures_source_ts:futuresTs,source_skew_ms:Math.abs(spotTs-futuresTs),spot_mid_usdt:spot,futures_mid_usdt:futures,futures_over_spot_pct:basis,scope:'PRICE_CONTEXT_ONLY_NOT_A_SPOT_LIQUIDATION_OR_INDEPENDENT_LEVEL_SOURCE'};
}

export function liquidationSpotReferenceLine(liquidations){
 const r=liquidations?.spot_reference,now=finite(liquidations?.observed_ts),spot=finite(r?.spot_mid_usdt),futures=finite(r?.futures_mid_usdt),basis=finite(r?.futures_over_spot_pct);
 const zones=[...(Array.isArray(liquidations?.above)?liquidations.above:[]),...(Array.isArray(liquidations?.below)?liquidations.below:[])];
 if(r?.schema!=='liquidation-spot-price-reference-v1'||r.status!=='CLOSED'||r.contract!==liquidations?.contract||r.independent_liquidation_source_count_added!==0||r.network_calls!==0||r.score_contribution!==0||r.entry_authorized!==false||!Number.isSafeInteger(now)||r.observed_ts!==now||!Number.isSafeInteger(r.source_ts)||r.source_ts>now||now-r.source_ts>300000||!Number.isSafeInteger(r.spot_source_ts)||!Number.isSafeInteger(r.futures_source_ts)||r.source_ts!==Math.min(r.spot_source_ts,r.futures_source_ts)||r.source_skew_ms!==Math.abs(r.spot_source_ts-r.futures_source_ts)||r.source_skew_ms>30000||spot<=0||futures<=0||basis===null||Math.abs((futures/spot-1)*100-basis)>1e-8||!zones.some(z=>kinds.has(z?.kind)&&finite(z?.price)>0&&Number.isSafeInteger(finite(z?.source_ts))&&z.source_ts<=now&&now-z.source_ts<=300000))return null;
 const price=value=>Number(value.toPrecision(8)).toString().replace('.',',');
 return `Спот ХТХ: ${price(spot)} USDT; фьючерсы ХТХ: ${price(futures)} USDT (разница ${basis>=0?'+':''}${basis.toFixed(2).replace('.',',')}%). Спот — ориентир цены, не источник уровней ликвидации.`;
}
