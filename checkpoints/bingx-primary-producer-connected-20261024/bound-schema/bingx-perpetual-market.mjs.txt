// OFFLINE PROPOSAL. Pure functions only. No fetch, clock acquisition, storage or admission.
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const text=x=>typeof x==='string'&&x.length>0&&x.length<=256?x:null;
const ms=x=>typeof x==='number'&&Number.isSafeInteger(x)&&x>0?x:null;
const wireMs=x=>ms(x)??(typeof x==='string'&&/^\d{1,16}$/.test(x)?ms(Number(x)):null);
const decimal=x=>{
  if(typeof x!=='string'&&typeof x!=='number')return null;
  const s=String(x);
  return s.length<=96&&/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(s)&&Number.isFinite(Number(s))?s:null;
};
const positive=x=>{const s=decimal(x);return s!==null&&Number(s)>0?s:null;};
const fail=reason=>{throw new Error(reason);};
const family=x=>['USDT_M','COIN_M'].includes(x)?x:fail('BINGX_FAMILY_REQUIRED');
// USDT_M identifies the existing swap API route family, never a settlement default.
const symbol=(x,f)=>text(x)&&!/[\s&=?#\u0000-\u001f]/.test(x)&&(f==='USDT_M'?/-(?:USDT|USDC)$/.test(x):x.endsWith('-USD'))?x:fail('EXACT_NATIVE_SYMBOL_REQUIRED');
const nativeQuote=(s,f)=>{symbol(s,f);return s.slice(s.lastIndexOf('-')+1);};
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const NO_GRANT=Object.freeze({native_admission:false,primary_qualified:false,consumer_ready:false,score_allowed:false,entry_allowed:false});
const ROUTES={
  USDT_M:{catalog:['/openApi/swap/v2/quote/contracts',true],ticker:['/openApi/swap/v2/quote/ticker',true],last:['/openApi/swap/v1/ticker/price',true],premium:['/openApi/swap/v2/quote/premiumIndex',true],book:['/openApi/swap/v2/quote/bookTicker',false],depth:['/openApi/swap/v2/quote/depth',false],oi:['/openApi/swap/v2/quote/openInterest',false],candles:['/openApi/swap/v3/quote/klines',false],funding_history:['/openApi/swap/v2/quote/fundingRate',false]},
  COIN_M:{catalog:['/openApi/cswap/v1/market/contracts',true],ticker:['/openApi/cswap/v1/market/ticker',true],premium:['/openApi/cswap/v1/market/premiumIndex',true],depth:['/openApi/cswap/v1/market/depth',false],oi:['/openApi/cswap/v1/market/openInterest',false],candles:['/openApi/cswap/v1/market/klines',false]},
};
const INTERVALS=Object.freeze({'1m':60000,'3m':180000,'5m':300000,'15m':900000,'30m':1800000,'1h':3600000,'2h':7200000,'4h':14400000,'6h':21600000,'8h':28800000,'12h':43200000,'1d':86400000});

export function buildBingxPublicRequest({family:f,kind,native_symbol=null,request_ts,interval=null,startTime=null,endTime=null,limit=null}={}){
  family(f);const route=ROUTES[f][kind];if(!route)fail('UNDOCUMENTED_ROUTE');
  if(ms(request_ts)===null)fail('REQUEST_TIMESTAMP_REQUIRED');
  if(!route[1]||native_symbol!==null)symbol(native_symbol,f);
  const params={timestamp:String(request_ts)};
  if(native_symbol!==null)params.symbol=native_symbol;
  if(kind==='candles'){
    if(!Object.hasOwn(INTERVALS,interval))fail('FIXED_UTC_INTERVAL_REQUIRED');
    params.interval=interval;
    if(!Number.isInteger(limit)||limit<1||limit>(f==='USDT_M'?1440:1000))fail('DOCUMENTED_CANDLE_LIMIT');
    params.limit=String(limit);
  }else if(kind==='funding_history'){
    if(!Number.isInteger(limit)||limit<1||limit>1000)fail('DOCUMENTED_FUNDING_LIMIT');
    params.limit=String(limit);
  }else if(limit!==null||interval!==null)fail('PARAMETER_NOT_IN_SELECTED_ROUTE');
  for(const [key,value] of [['startTime',startTime],['endTime',endTime]]){
    if(value!==null){if(!['candles','funding_history'].includes(kind)||ms(value)===null)fail('EXACT_WINDOW_PARAMETER_REQUIRED');params[key]=String(value);}
  }
  if(startTime!==null&&endTime!==null&&startTime>=endTime)fail('INVALID_UTC_WINDOW');
  if(kind==='candles'&&f==='COIN_M'&&startTime!==null&&startTime<request_ts-30*86400000)fail('COIN_M_DOCUMENTED_30_DAY_HISTORY_LIMIT');
  const url=new URL('https://open-api.bingx.com'+route[0]);
  for(const key of Object.keys(params).sort())url.searchParams.set(key,params[key]);
  return {schema:'BINGX_PUBLIC_REQUEST_PROPOSAL_V1',venue:'BINGX',family:f,kind,native_symbol,method:'GET',url:String(url),endpoint:route[0],params,
    scope:native_symbol===null?'BULK':'ONE_CONTRACT',max_http_attempts:1,retry:false,automatic_domain_fallback:false,
    provider_pool:'BINGX_SHARED_ALL_FAMILIES',provider_weight_units:null,documented_aggregate_limit:{requests:500,window_ms:10000,scope:'IP_SPOT_AND_FUTURES'},
    body_bytes_measured:null,body_cap_proposed_only:1048576,api_key_required:false,signature_required:false,...NO_GRANT};
}

function receiptFor(body,r,f,kind,nativeSymbol=null){
  family(f);if(!ROUTES[f][kind])fail('UNDOCUMENTED_ROUTE');if(!object(body)||body.code!==0)fail('KNOWN_SUCCESS_ENVELOPE_REQUIRED');
  if(!object(r)||r.family!==f||r.endpoint!==ROUTES[f][kind]?.[0]||r.http_status!==200||r.body_complete!==true||r.usage_state!=='KNOWN'||ms(r.received_ts)===null||!hash(r.payload_sha256))fail('COMPLETE_BOUND_RECEIPT_REQUIRED');
  if(nativeSymbol!==null&&r.native_symbol!==null&&r.native_symbol!==nativeSymbol)fail('REQUEST_SYMBOL_MISMATCH');
  if(!ROUTES[f][kind][1]&&r.native_symbol!==nativeSymbol)fail('EXACT_ONE_CONTRACT_REQUEST_REQUIRED');
  return {endpoint:r.endpoint,payload_sha256:r.payload_sha256,received_ts:r.received_ts,source_ts:null,source_clock_kind:'ABSENT',receipt_authentication:'ROOT_MUST_AUTHENTICATE_ORIGINAL_WIRE_AND_USAGE',...NO_GRANT};
}
function selected(data,nativeSymbol){
  const rows=Array.isArray(data)?data:[data];
  if(rows.length>20000||rows.some(x=>!object(x)))fail('DOCUMENTED_OBJECT_ROWS_REQUIRED');
  const matches=rows.filter(x=>x.symbol===nativeSymbol);
  if(matches.length!==1)fail('EXACT_UNIQUE_RESPONSE_SYMBOL_REQUIRED');
  return matches[0];
}
function instrument(i){
  if(!object(i)||i.schema!=='BINGX_CRYPTO_PERPETUAL_INSTRUMENT_V1'||i.venue!=='BINGX'||i.product!=='PERPETUAL'||i.market!=='FUTURES')fail('BINGX_PERPETUAL_IDENTITY_REQUIRED');
  symbol(i.native_symbol,family(i.family));
  if(i.quote!==nativeQuote(i.native_symbol,i.family)||(i.family==='USDT_M'&&i.settle!==i.quote))fail('NATIVE_QUOTE_SETTLEMENT_IDENTITY_MISMATCH');
  if(i.contract!==i.native_symbol||i.crypto_eligibility!=='VERIFIED_CRYPTO_PERPETUAL'||i.underlying_class!=='CRYPTO_ASSET'||!text(i.crypto_eligibility_proof_ref)||!text(i.identity_revision)||!hash(i.catalog_payload_sha256)||!text(i.base)||!text(i.quote)||!text(i.settle)||!text(i.margin))fail('QUALIFIED_CRYPTO_MAPPING_REQUIRED');
  if(['PAXG','XAUT'].includes(i.base.toUpperCase()))fail('OWNER_EXCLUDES_GOLD_BACKED_TOKENS');
  return i;
}

export function normalizeBingxCatalog({family:f,body,receipt,bindings=[]}={}){
  const provenance=receiptFor(body,receipt,f,'catalog');
  if(!Array.isArray(body.data)||body.data.length>20000||!Array.isArray(bindings))fail('BOUNDED_CATALOG_ARRAY_REQUIRED');
  const seen=new Set();const identities=body.data.map((row,rowIndex)=>{
    if(!object(row))fail('CATALOG_OBJECT_REQUIRED');
    const s=symbol(row.symbol,f);if(seen.has(s))fail('DUPLICATE_CATALOG_SYMBOL');seen.add(s);
    const matches=bindings.filter(b=>b?.family===f&&b?.native_symbol===s);
    if(matches.length>1)fail('DUPLICATE_IDENTITY_BINDING');
    const b=matches[0]??null;
    const nativeId=f==='USDT_M'?(text(row.contractId)??null):null;
    const nativeBase=f==='USDT_M'?text(row.asset):null;
    const settle=f==='USDT_M'?text(row.currency):null;
    const quote=nativeQuote(s,f);
    if(f==='USDT_M'&&(settle===null||settle!==quote))fail('NATIVE_SYMBOL_CURRENCY_MISMATCH');
    if(b&&(b.native_contract_id!==nativeId||b.quote!==quote||(nativeBase!==null&&b.base!==nativeBase)||(settle!==null&&b.settle!==settle)))fail('CATALOG_IDENTITY_BINDING_MISMATCH');
    let eligibility=b?.crypto_eligibility??'UNKNOWN';
    const underlyingClass=text(b?.underlying_class);
    if(underlyingClass!==null&&underlyingClass!=='CRYPTO_ASSET')eligibility='EXCLUDED_NON_CRYPTO';
    if(!['UNKNOWN','EXCLUDED_NON_CRYPTO','VERIFIED_CRYPTO_PERPETUAL'].includes(eligibility))fail('CRYPTO_CLASSIFICATION_INVALID');
    const base=nativeBase??text(b?.base);const resolvedSettle=settle??text(b?.settle);
    if(['PAXG','XAUT'].includes(String(base).toUpperCase()))eligibility='EXCLUDED_NON_CRYPTO';
    const proof=text(b?.crypto_eligibility_proof_ref),revision=text(b?.identity_revision);
    if(eligibility==='VERIFIED_CRYPTO_PERPETUAL'&&(!proof||!revision||!base||!resolvedSettle||!text(b?.margin)||underlyingClass!=='CRYPTO_ASSET'||(f==='USDT_M'&&nativeId===null)))fail('CLASSIFICATION_WITHOUT_BOUND_MAPPING');
    const hasSize=positive(b?.contract_size_decimal)!==null&&['BASE_PER_CONTRACT','QUOTE_PER_CONTRACT'].includes(b?.contract_size_unit)&&text(b?.unit_proof_ref)!==null;
    const i={schema:'BINGX_CRYPTO_PERPETUAL_INSTRUMENT_V1',venue:'BINGX',market:'FUTURES',product:'PERPETUAL',family:f,
      contract:s,native_symbol:s,native_contract_id:nativeId,base,quote,settle:resolvedSettle,margin:text(b?.margin),linear_inverse:f==='USDT_M'?'LINEAR':'INVERSE',
      quantity_unit:text(b?.unit_proof_ref)&&['BASE_ASSET','CONTRACTS'].includes(b?.quantity_unit)?b.quantity_unit:null,
      contract_size_decimal:hasSize?positive(b.contract_size_decimal):null,contract_size_unit:hasSize?b.contract_size_unit:null,
      price_unit:'QUOTE_PER_NATIVE_BASE',crypto_eligibility:eligibility,underlying_class:underlyingClass,crypto_eligibility_proof_ref:proof,identity_revision:revision,
      asset_binding:{status:b?.asset_binding?.status==='VERIFIED_TOKEN'&&text(b?.asset_binding?.proof_ref)?'VERIFIED_TOKEN':'VENUE_SCOPED',canonical_asset_id:b?.asset_binding?.status==='VERIFIED_TOKEN'&&text(b?.asset_binding?.proof_ref)?text(b.asset_binding.canonical_asset_id):null,chain_id:b?.asset_binding?.status==='VERIFIED_TOKEN'&&text(b?.asset_binding?.proof_ref)?text(b.asset_binding.chain_id):null,token_address:b?.asset_binding?.status==='VERIFIED_TOKEN'&&text(b?.asset_binding?.proof_ref)?text(b.asset_binding.token_address):null,token_epoch:b?.asset_binding?.status==='VERIFIED_TOKEN'&&text(b?.asset_binding?.proof_ref)?text(b.asset_binding.token_epoch):null,proof_ref:text(b?.asset_binding?.proof_ref)},
      token_multiplier_decimal:b?.asset_binding?.status==='VERIFIED_TOKEN'&&text(b?.asset_binding?.proof_ref)?positive(b?.token_multiplier_decimal):null,
      catalog_payload_sha256:provenance.payload_sha256,catalog_row_index:rowIndex,native_launch_ts:wireMs(row.launchTime??row.timeOnline),source_ts:null,received_ts:provenance.received_ts,
      native_status:row.status??null,online:row.status===1,native_size_raw:row.size??null,eligible_for_migration:row.status===1&&eligibility==='VERIFIED_CRYPTO_PERPETUAL',...NO_GRANT};
    return i;
  });
  return {status:'CATALOG_OBSERVATION',family:f,identities,provenance,actual_crypto_contract_count:null,current_coverage:null,...NO_GRANT};
}

export function normalizeBingxMetric({kind,body,receipt,instrument_identity:i}={}){
  instrument(i);const provenance=receiptFor(body,receipt,i.family,kind,i.native_symbol);
  if(!['ticker','last','premium','book','oi','depth'].includes(kind))fail('METRIC_KIND_REQUIRED');
  let row;
  if(kind==='book'){
    if(!object(body.data?.book_ticker))fail('NATIVE_BOOK_TICKER_NESTING_REQUIRED');
    row=selected(body.data.book_ticker,i.native_symbol);
  }else if(kind==='depth'){
    if(!object(body.data))fail('DEPTH_OBJECT_REQUIRED');row=body.data;
  }else row=selected(body.data,i.native_symbol);
  const result={status:'OBSERVED_UNQUALIFIED',kind,instrument_identity:i,provenance,source_ts:null,received_ts:provenance.received_ts,value_decimal:null,unit:null,raw_time_fields:{time:row.time??null,timestamp:row.timestamp??null,closeTime:row.closeTime??null,T:row.T??null,updateTime:row.updateTime??null},...NO_GRANT};
  if(kind==='last'||kind==='ticker'){
    result.value_decimal=positive(kind==='last'?row.price:row.lastPrice);if(result.value_decimal===null)fail('LAST_PRICE_REQUIRED');
    result.unit='QUOTE_PER_NATIVE_BASE';result.source_ts=kind==='last'?wireMs(row.time):wireMs(row.closeTime);
    if(kind==='ticker')result.ticker={bid_decimal:positive(row.bidPrice),ask_decimal:positive(row.askPrice),book_source_ts:null,volume_decimal:decimal(row.volume),volume_unit:null,quote_volume_decimal:decimal(row.quoteVolume),quote_volume_unit:i.family==='USDT_M'&&i.quote==='USDT'?'USDT':null};
  }else if(kind==='book'){
    const bid=positive(row.bid_price),ask=positive(row.ask_price);if(bid===null||ask===null||Number(ask)<Number(bid))fail('NATIVE_BBO_REQUIRED');
    result.bbo={best_bid:Number(bid),best_ask:Number(ask),bid_decimal:bid,ask_decimal:ask,bid_qty_decimal:decimal(row.bid_qty),ask_qty_decimal:decimal(row.ask_qty),quantity_unit:null,source_ts:null};
    result.source_clock_reason='NATIVE_SAMPLE_HAS_NO_BOOK_CLOCK';
  }else if(kind==='premium'){
    result.mark_price_decimal=positive(row.markPrice);result.index_price_decimal=positive(row.indexPrice);result.last_funding_rate_decimal=decimal(row.lastFundingRate);result.next_funding_time=wireMs(row.nextFundingTime);result.funding_period_ms=null;
    // New actual swap/v2 capture: explicit hours is period metadata, not a price clock.
    result.funding_interval_hours_raw=row.fundingIntervalHours??null;
    result.funding_update_time=i.family==='USDT_M'?wireMs(row.updateTime):null;
    if(result.funding_update_time!==null&&result.funding_update_time>result.received_ts)fail('FUTURE_FUNDING_METADATA_CLOCK');
    const hours=row.fundingIntervalHours;
    if(i.family==='USDT_M'&&typeof hours==='number'&&Number.isInteger(hours)&&hours>0&&hours<=24){result.funding_period_ms=hours*3600000;result.funding_period_origin='NATIVE_EXPLICIT_FUNDING_INTERVAL_HOURS';}
    else result.funding_period_origin=null;
    result.mark_price_source_ts=null;result.index_price_source_ts=null;result.funding_rate_source_ts=null;
    result.funding_update_clock_scope='NATIVE_METADATA_UPDATE_TIME_NOT_PRICE_OR_RATE_FRESHNESS';
    result.source_clock_reason='MARK_INDEX_RATE_CLOCK_UNQUALIFIED_UPDATE_TIME_SEPARATE';
  }else if(kind==='oi'){
    result.value_decimal=decimal(row.openInterest);if(result.value_decimal===null||Number(result.value_decimal)<0)fail('OPEN_INTEREST_VALUE_REQUIRED');
    result.source_ts=i.family==='USDT_M'?wireMs(row.time):null;
    result.oi={native_value_decimal:result.value_decimal,unit:null,contracts:null,amount_base:null,value_quote:null,unit_reason:'NATIVE_DOC_UNIT_UNRESOLVED'};
    if(i.family==='COIN_M')result.source_clock_reason='NATIVE_EXAMPLE_TIME_VERSUS_TABLE_TIMESTAMP_UNRESOLVED';
  }else if(kind==='depth'){
    for(const key of ['bids','asks'])if(!Array.isArray(row[key])||row[key].length>1000||row[key].some(x=>!Array.isArray(x)||x.length!==2||positive(x[0])===null||decimal(x[1])===null||Number(x[1])<0))fail('DEPTH_PAIR_SHAPE_REQUIRED');
    const hasCoinFields=row.bidsCoin!==undefined||row.asksCoin!==undefined;
    if(hasCoinFields){
      if(i.family!=='USDT_M')fail('COIN_FIELDS_NOT_IN_SELECTED_COIN_M_SPEC');
      for(const key of ['bidsCoin','asksCoin'])if(!Array.isArray(row[key])||row[key].length>1000||row[key].some(x=>!Array.isArray(x)||x.length!==2||positive(x[0])===null||decimal(x[1])===null||Number(x[1])<0))fail('NATIVE_COIN_DEPTH_PAIR_SHAPE_REQUIRED');
    }
    result.depth={bids:row.bids.map(x=>[String(x[0]),String(x[1])]),asks:row.asks.map(x=>[String(x[0]),String(x[1])]),quantity_unit:i.family==='COIN_M'?'CONTRACTS':null,
      native_coin_fields:hasCoinFields?{bidsCoin:row.bidsCoin.map(x=>[String(x[0]),String(x[1])]),asksCoin:row.asksCoin.map(x=>[String(x[0]),String(x[1])]),quantity_unit:'NATIVE_BASE_ASSET'}:null};
    result.source_ts=wireMs(row.T);
  }
  if(result.source_ts!==null&&result.source_ts>result.received_ts)fail('FUTURE_SOURCE_CLOCK');
  result.provenance={...provenance,source_ts:result.source_ts,source_clock_kind:result.source_ts===null?'ABSENT_OR_UNQUALIFIED':'NATIVE_FIELD'};
  return result;
}

export function normalizeBingxCandles({body,receipt,instrument_identity:i,interval,window_start,window_end}={}){
  instrument(i);const provenance=receiptFor(body,receipt,i.family,'candles',i.native_symbol);const step=INTERVALS[interval];
  if(!step||ms(window_start)===null||ms(window_end)===null||window_start%step!==0||window_end%step!==0||window_start>=window_end||window_end>provenance.received_ts)fail('CLOSED_UTC_WINDOW_REQUIRED');
  const cap=i.family==='USDT_M'?1440:1000;if(!Array.isArray(body.data)||body.data.length>cap)fail('BOUNDED_OBJECT_CANDLE_ARRAY_REQUIRED');
  const rows=body.data.map(row=>{
    if(!object(row))fail('BINANCE_ARRAY_CANDLE_NOT_ACCEPTED');
    const t=wireMs(row.time),o=positive(row.open),h=positive(row.high),l=positive(row.low),c=positive(row.close),v=decimal(row.volume);
    if(t===null||t>provenance.received_ts||t%step!==0||o===null||h===null||l===null||c===null||v===null||Number(v)<0||Number(l)>Math.min(Number(o),Number(c))||Number(h)<Math.max(Number(o),Number(c))||Number(l)>Number(h))fail('CANDLE_FIELDS_OR_ALIGNMENT_INVALID');
    return {native_time:t,open_decimal:o,high_decimal:h,low_decimal:l,close_decimal:c,volume_decimal:v,volume_unit:i.family==='COIN_M'?'CONTRACTS':null,candidate_open_ts:t,candidate_end_ts:t+step,close_ts_origin:'DERIVED_IF_TIME_IS_OPEN_TIME',payload_sha256:provenance.payload_sha256};
  }).sort((a,b)=>a.native_time-b.native_time);
  if(new Set(rows.map(x=>x.native_time)).size!==rows.length)fail('DUPLICATE_CANDLE_TIME');
  const closed=rows.filter(x=>x.candidate_open_ts>=window_start&&x.candidate_end_ts<=window_end);
  const expected=(window_end-window_start)/step;
  const contiguous=closed.length===expected&&closed.every((x,n)=>x.native_time===window_start+n*step);
  return {status:contiguous?'CANDIDATE_UTC_WINDOW_COMPLETE':'CANDIDATE_UTC_WINDOW_INCOMPLETE',instrument_identity:i,interval,window_start,window_end,rows:closed,omitted_rows:rows.length-closed.length,contiguous,
    time_semantics:'NATIVE_KLINE_TIME_OPEN_TIME_REQUIRES_ORIGINAL_CAPTURE_QUALIFICATION',closed_ohlcv_qualified:false,volume_unit_qualified:i.family==='COIN_M',provenance,...NO_GRANT};
}

export function normalizeBingxFundingHistory({body,receipt,instrument_identity:i}={}){
  instrument(i);if(i.family!=='USDT_M')fail('COIN_M_FUNDING_HISTORY_NOT_DOCUMENTED_IN_SELECTED_CONTRACT');
  const provenance=receiptFor(body,receipt,i.family,'funding_history',i.native_symbol);
  if(!Array.isArray(body.data)||body.data.length>1000)fail('FUNDING_HISTORY_ARRAY_REQUIRED');
  const rows=body.data.map(row=>{
    if(!object(row)||row.symbol!==i.native_symbol||wireMs(row.fundingTime)===null||decimal(row.fundingRate)===null||wireMs(row.fundingTime)>provenance.received_ts)fail('EXACT_SETTLED_FUNDING_EVENT_REQUIRED');
    return {funding_time:wireMs(row.fundingTime),rate_decimal:decimal(row.fundingRate),unit:'RATE_FRACTION',actual_period_ms:null,observed_previous_event_gap_ms:null,payload_sha256:provenance.payload_sha256};
  }).sort((a,b)=>a.funding_time-b.funding_time);
  if(new Set(rows.map(x=>x.funding_time)).size!==rows.length)fail('DUPLICATE_FUNDING_EVENT');
  for(let n=1;n<rows.length;n++)rows[n].observed_previous_event_gap_ms=rows[n].funding_time-rows[n-1].funding_time;
  return {status:'HISTORICAL_FUNDING_OBSERVATION',instrument_identity:i,rows,provenance,actual_current_period_ms:null,ranking_adjustment_allowed:false,...NO_GRANT};
}


// Existing futuresSnapshot-shaped carrier for ROOT's explicit three-call migration.
// The venue marker remains BINGX even when identity or source time is unqualified.
export function assembleBingxFuturesObservation({instrument_identity:i=null,last=null,book=null,depth=null,premium=null,oi=null}={}){
  const empty={venue:'BINGX',source:'BINGX official public API',instrument_identity:null,contract:null,timestamp:null,bbo:{best_bid:null,best_ask:null,source_ts:null},liquidity:{depth_timestamp:null},open_interest:{contracts:null,amount_base:null,value_usdt:null},funding:{funding_rate:null,period_ms:null},...NO_GRANT};
  try{instrument(i);}catch(error){return {execution_status:'PARTIAL',reason:String(error.message),available_ts:null,data:empty};}
  const items=[last,book,depth,premium,oi].filter(x=>x!==null);
  for(const x of items){
    if(JSON.stringify(x?.instrument_identity)!==JSON.stringify(i))fail('AGGREGATE_EXACT_IDENTITY_MISMATCH');
  }
  if((last&&last.kind!=='last')||(book&&book.kind!=='book')||(depth&&depth.kind!=='depth')||(premium&&premium.kind!=='premium')||(oi&&oi.kind!=='oi'))fail('AGGREGATE_METRIC_KIND_MISMATCH');
  let bid=book?.bbo?.bid_decimal??null,ask=book?.bbo?.ask_decimal??null,sourceTs=null;
  if(depth?.source_ts!==null&&depth?.source_ts!==undefined&&depth?.depth?.bids?.length&&depth?.depth?.asks?.length){
    const bids=depth.depth.bids.filter(x=>Number(x[1])>0).slice().sort((a,b)=>Number(b[0])-Number(a[0]));
    const asks=depth.depth.asks.filter(x=>Number(x[1])>0).slice().sort((a,b)=>Number(a[0])-Number(b[0]));
    bid=bids.length?positive(bids[0][0]):null;ask=asks.length?positive(asks[0][0]):null;sourceTs=bid!==null&&ask!==null?depth.source_ts:null;
  }
  if(bid!==null&&ask!==null&&Number(ask)<Number(bid))fail('CROSSED_NATIVE_BOOK');
  const received=items.map(x=>x.received_ts).filter(x=>ms(x)!==null);
  const available=received.length?Math.max(...received):null;
  return {execution_status:'PARTIAL',reason:'PROPOSAL_REQUIRES_ROOT_NATIVE_QUALIFICATION_AND_EXPLICIT_CONSUMER_BRIDGE',available_ts:available,
    data:{...empty,instrument_identity:i,contract:i.native_symbol,timestamp:sourceTs,received_ts:available,
      bbo:{best_bid:bid===null?null:Number(bid),best_ask:ask===null?null:Number(ask),source_ts:sourceTs},
      liquidity:{depth_timestamp:sourceTs===null?null:new Date(sourceTs).toISOString(),quantity_unit:depth?.depth?.quantity_unit??null,capacity_units_known:false},
      last_price:last?.value_decimal??null,last_price_source_ts:last?.source_ts??null,
      mark_price:premium?.mark_price_decimal??null,mark_price_source_ts:premium?.source_ts??null,
      open_interest:{native_value_decimal:oi?.oi?.native_value_decimal??null,source_ts:oi?.source_ts??null,unit:null,contracts:null,amount_base:null,value_usdt:null},
      funding:{funding_rate:premium?.last_funding_rate_decimal??null,period_ms:premium?.funding_period_ms??null,period_origin:premium?.funding_period_origin??null,period_received_ts:premium?.received_ts??null,source_ts:null,native_update_time:premium?.funding_update_time??null,native_update_clock_scope:premium?.funding_update_clock_scope??null,next_funding_time:premium?.next_funding_time??null},
      component_origins:items.map(x=>({kind:x.kind,endpoint:x.provenance.endpoint,payload_sha256:x.provenance.payload_sha256,source_ts:x.source_ts,received_ts:x.received_ts}))}};
}
