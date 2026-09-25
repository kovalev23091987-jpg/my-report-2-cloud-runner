export const MARKET_MEASUREMENT_ADAPTERS_VERSION='market-measurement-adapters-v1-20260925';
const finite=v=>{const n=Number(v);return Number.isFinite(n)?n:null;};const clean=v=>String(v??'').trim();
export function bitgetPublicProbePlan(symbol='BTCUSDT'){
  const s=clean(symbol).toUpperCase();
  const enc=encodeURIComponent(s);
  return {
    status:'CANDIDATE',
    measurement_only:true,
    documented_public_read_only:true,
    categories:['SPOT','USDT-FUTURES'],
    calls:[
      {metric:'spot_instruments',url:`https://api.bitget.com/api/v3/market/instruments?category=SPOT&symbol=${enc}`},
      {metric:'futures_instruments',url:`https://api.bitget.com/api/v3/market/instruments?category=USDT-FUTURES&symbol=${enc}`},
      {metric:'futures_ticker_mark_index',url:`https://api.bitget.com/api/v2/mix/market/ticker?symbol=${enc}&productType=USDT-FUTURES`},
      {metric:'futures_symbol_price_mark_index',url:`https://api.bitget.com/api/v2/mix/market/symbol-price?symbol=${enc}&productType=USDT-FUTURES`},
      {metric:'futures_open_interest',url:`https://api.bitget.com/api/v2/mix/market/open-interest?symbol=${enc}&productType=USDT-FUTURES`},
      {metric:'futures_funding',url:`https://api.bitget.com/api/v2/mix/market/current-fund-rate?symbol=${enc}&productType=USDT-FUTURES`},
      {metric:'futures_recent_trades',url:`https://api.bitget.com/api/v3/market/fills?category=USDT-FUTURES&symbol=${enc}&limit=100`},
      {metric:'futures_book',url:`https://api.bitget.com/api/v3/market/orderbook?category=USDT-FUTURES&symbol=${enc}&limit=100`},
      {metric:'futures_candles_1m',url:`https://api.bitget.com/api/v3/market/candles?category=USDT-FUTURES&symbol=${enc}&interval=1m&limit=60`},
      {metric:'futures_candles_3m',url:`https://api.bitget.com/api/v3/market/candles?category=USDT-FUTURES&symbol=${enc}&interval=3m&limit=60`},
      {metric:'futures_candles_5m',url:`https://api.bitget.com/api/v3/market/candles?category=USDT-FUTURES&symbol=${enc}&interval=5m&limit=60`},
      {metric:'spot_recent_trades',url:`https://api.bitget.com/api/v3/market/fills?category=SPOT&symbol=${enc}&limit=100`},
      {metric:'spot_book',url:`https://api.bitget.com/api/v3/market/orderbook?category=SPOT&symbol=${enc}&limit=100`},
      {metric:'spot_candles_1m',url:`https://api.bitget.com/api/v3/market/candles?category=SPOT&symbol=${enc}&interval=1m&limit=60`},
    ],
    rule:'MEASURE_INCREMENTAL_COVERAGE_BEFORE_ENABLE_NO_AUTOMATIC_VOTING',
  };
}
export function coinbasePublicProbePlan(product='BTC-USDT'){
  const p=clean(product).toUpperCase();return {status:'CANDIDATE',measurement_only:true,quote_currency:p.split('-')[1]||null,quotes_are_not_equivalent:true,calls:[
    {metric:'product',url:`https://api.exchange.coinbase.com/products/${encodeURIComponent(p)}`},
    {metric:'ticker',url:`https://api.exchange.coinbase.com/products/${encodeURIComponent(p)}/ticker`},
    {metric:'book',url:`https://api.exchange.coinbase.com/products/${encodeURIComponent(p)}/book?level=2`},
    {metric:'trades',url:`https://api.exchange.coinbase.com/products/${encodeURIComponent(p)}/trades`},
  ],websocket_channels:['matches','level2','ticker','heartbeat']};
}
export function trackCoinbaseSequence({last_sequence=null,sequence}={}){
  const prev=finite(last_sequence),cur=finite(sequence);if(cur===null)return {status:'NOT_CLOSED',reason:'SEQUENCE_INVALID'};if(prev===null)return {status:'CLOSED',sequence:cur,gap:false,duplicate:false};if(cur===prev)return {status:'DUPLICATE',sequence:cur,gap:false,duplicate:true};if(cur!==prev+1)return {status:'SEQUENCE_GAP',sequence:cur,previous:prev,gap:true,duplicate:false,recovery_required:true};return {status:'CLOSED',sequence:cur,previous:prev,gap:false,duplicate:false};
}
export function hyperliquidPublicProbePlan(coin='BTC',address=null){
  const calls=[{metric:'metaAndAssetCtxs',body:{type:'metaAndAssetCtxs'}},{metric:'fundingHistory',body:{type:'fundingHistory',coin:clean(coin),startTime:0}},{metric:'l2Book',body:{type:'l2Book',coin:clean(coin)}}];
  if(clean(address))calls.push({metric:'clearinghouseState',body:{type:'clearinghouseState',user:clean(address)}});
  return {status:'CANDIDATE',endpoint:'https://api.hyperliquid.xyz/info',calls,known_addresses_are_sample_only:true,not_htx_liquidation_map:true};
}
export function deribitPublicProbePlan(currency='BTC'){
  const c=clean(currency).toUpperCase();return {status:'SHADOW',second_priority:true,market_background_only:true,production_endpoint:'https://www.deribit.com/api/v2/public/get_book_summary_by_currency',query:{currency:c,kind:'option'},testnet_forbidden_for_evidence:true};
}
export function normalizeOiObservation({venue,contracts=null,usd_value=null,price=null,ts}={}){
  return {status:(finite(contracts)!==null||finite(usd_value)!==null)?'CLOSED':'NOT_CLOSED',venue:clean(venue),contracts:finite(contracts),usd_value:finite(usd_value),price:finite(price),ts:finite(ts),do_not_average_across_venues:true,usd_change_may_include_price_effect:true};
}
