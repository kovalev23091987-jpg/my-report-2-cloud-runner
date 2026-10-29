export const INPUT_SCHEMA = 'PUMP_REPORT_INPUT_V1';
export const ANALYSIS_SCHEMA = 'PUMP_REPORT_ANALYSIS_V1';
export const CONTRACT_VERSION = 'pump-report-contract-v1.3-price-structure';
export const TZ_SHA256 = '0674adf8bef087f63ddac8214b8e650ae14410f33970ed4f869c5ab2564975cc';
export const FACT_STATUSES = Object.freeze(['USABLE', 'INCOMPLETE', 'ABSENT', 'STALE', 'ERROR', 'NOT_CHECKED']);
export const MAP_STATUSES = Object.freeze(['USABLE', 'PARTIAL', 'ABSENT', 'STALE', 'ERROR', 'NOT_CHECKED', 'NOT_CHECKED_BUDGET', 'TIMEOUT']);
export const finite = value => typeof value === 'number' && Number.isFinite(value);
export const positive = value => finite(value) && value > 0;
export const validTime = value => Number.isSafeInteger(value) && value > 0;
export const CANDLE_NATIVE_RELATIVE_UNIT='OHLC_USDT_NATIVE_REPORTED_QUANTITY';
export const CANDLE_NATIVE_RELATIVE_KIND='SAME_NATIVE_REPORTED_QUANTITY';
export const CANDLE_CCXT_TIME_BASIS='CCXT_CONSUMER_OPEN_TIME';
export const CANDLE_SEMANTICS_OWNER_REF='checkpoints/pump-report-20261025/OWNER_CANDLE_SEMANTICS_ACCEPTED.json';
export const TRADE_BASE_QUANTITY_UNIT='USDT_PRICE_BASE_QUANTITY';
export const TRADE_QUOTE_NOTIONAL_UNIT='USDT_PRICE_QUOTE_NOTIONAL';
export const GROWTH_24H_UNIT='USDT_CLOSED_ROLLING_24H';
export const GROWTH_24H_WINDOW_MS=86400000;
// Optional price-only context from the existing exact day request. Quantity,
// wave qualification and cancellation retain their independent CORE basis.
export const PRICE_STRUCTURE_UNIT='USDT_OHLC_MINUTE_PRICE_ONLY';
export const PRICE_STRUCTURE_BOUNDS=Object.freeze({rows:1440,bytes:131072,interval_ms:60000,window_ms:86400000});
// Owner amendments on 25 October apply to every new publication, including
// previously queued cards. Identity qualification remains a separate concern.
export const OWNER_MIN_PLAN_POTENTIAL_PCT=10;
export const OWNER_DELIVERY_EXCLUDED_ASSETS=Object.freeze(['BTC','ETH']);
export function ownerInstrumentExcluded(value){
  const names=typeof value==='string'?[value]:[value?.base,value?.native_symbol,value?.asset_id?.split(':').at(-1),value?.instrument_id?.split(':').at(-1)];
  return names.some(name=>OWNER_DELIVERY_EXCLUDED_ASSETS.includes(String(name??'').trim().toUpperCase().replace(/(?:[-/]?USDT)$/,'')));
}
export const isBingxNativeSymbol=value=>typeof value==='string'&&/^[\p{L}\p{N}\p{So}][\p{L}\p{M}\p{N}\p{So}._-]{0,119}-USDT$/u.test(value);
export function ownerPublicationRefusal(analysis){
  if(ownerInstrumentExcluded(analysis?.instrument))return 'OWNER_ASSET_DELIVERY_EXCLUDED';
  // A previously queued immutable card must be recomputed if its saved text
  // relied on the comparison subsequently removed by the owner.
  if([...(analysis?.findings??[]),...(analysis?.user_narrative?.reasons??[])].some(f=>f?.code==='RELATIVE_RETURN')||analysis?.optional_context?.market_context||analysis?.relative_context_diagnostic?.valid===true)return 'OWNER_REMOVED_MARKET_COMPARISON';
  const potential=analysis?.plan?.potential_pct?.minimum;
  if(!finite(potential)||analysis.plan.potential_pct.basis!=='GROSS_ENTRY_TO_EXIT_NOT_EXECUTED_PROFIT')return 'PLAN_POTENTIAL_UNQUALIFIED';
  return potential<OWNER_MIN_PLAN_POTENTIAL_PCT?'PLAN_POTENTIAL_BELOW_OWNER_MINIMUM':null;
}
export function automaticWindowOpen(ts){const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Moscow',hour:'2-digit',hourCycle:'h23'}).format(ts));return hour>=10&&hour<20;}
export function candleNativeComparisonKey(instrument,interval_ms=60000){
  assertInstrument(instrument);
  if(interval_ms!==60000)throw Error('NATIVE_COMPARISON_REQUIRES_APPROVED_ONE_MINUTE_INTERVAL');
  return 'BINGX|USDT_M|'+instrument.instrument_id+'|/openApi/swap/v3/quote/klines|volume|'+interval_ms;
}

export function assertInstrument(instrument) {
  if (!instrument || !['instrument_id', 'asset_id', 'native_symbol', 'base'].every(key => typeof instrument[key] === 'string' && instrument[key].length > 0)) throw Error('INSTRUMENT_IDENTITY_REQUIRED');
  if (instrument.venue !== 'BINGX' || instrument.market_type !== 'PERPETUAL' || instrument.quote !== 'USDT' || instrument.settle !== 'USDT' || instrument.classification_status !== 'VERIFIED_CRYPTO') throw Error('VERIFIED_BINGX_USDT_CRYPTO_PERPETUAL_REQUIRED');
  return instrument;
}

export function createFact({fact_id, instrument_id, kind, value = null, unit = null, event_ts = null, received_ts, expires_ts = null, source, primary_provider = null, venue = 'BINGX', status = 'ABSENT', origin = 'OBSERVED', coverage = null, reason = null, evidence_ref = null, ...extra}) {
  if (![fact_id, instrument_id, kind, source].every(item => typeof item === 'string' && item.length > 0) || !FACT_STATUSES.includes(status) || !validTime(received_ts)) throw Error('INVALID_FACT_ENVELOPE');
  if (event_ts !== null && !validTime(event_ts)) throw Error('INVALID_SOURCE_CLOCK');
  if (expires_ts !== null && (!validTime(expires_ts) || event_ts === null || expires_ts < event_ts)) throw Error('INVALID_FACT_EXPIRY');
  if (!['OBSERVED', 'ESTIMATED'].includes(origin)) throw Error('INVALID_FACT_ORIGIN');
  if (status === 'USABLE' && value === null) throw Error('USABLE_FACT_HAS_NO_VALUE');
  return {...extra, fact_id, instrument_id, kind, value, unit, event_ts, received_ts, expires_ts, source, primary_provider, venue, status, origin, coverage, reason, evidence_ref};
}

export function factUsable(fact, at) {
  return Boolean(fact && fact.status === 'USABLE' && fact.value !== null && validTime(at) && validTime(fact.event_ts) && fact.event_ts <= at && validTime(fact.expires_ts) && fact.expires_ts >= at && validTime(fact.received_ts) && fact.received_ts <= at);
}

export function emptyMap(status = 'NOT_CHECKED', reason = 'OPTIONAL_MAP_NOT_REQUESTED') {
  if (!MAP_STATUSES.includes(status)) throw Error('INVALID_MAP_STATUS');
  return {status, reason, zones: [], checked_sources: [], coverage: null};
}

export function assertInput(input) {
  if (input?.schema_version !== INPUT_SCHEMA || typeof input.run_id !== 'string' || !input.run_id || !['AUTO', 'MANUAL'].includes(input.mode) || !validTime(input.analysis_ts)) throw Error('INVALID_ANALYSIS_INPUT');
  assertInstrument(input.instrument);
  if (!input.facts || typeof input.facts !== 'object') throw Error('FACTS_REQUIRED');
  if (input.liquidations && !MAP_STATUSES.includes(input.liquidations.status)) throw Error('INVALID_MAP_STATUS');
  for (const [kind, fact] of Object.entries(input.facts)) {
    // This supplementary dataset is validated by its plan-only consumer; a
    // rejected history never weakens or blocks the mandatory CORE facts.
    if (kind === 'price_structure') continue;
    if (fact != null && fact.instrument_id !== input.instrument.instrument_id) throw Error('CROSS_INSTRUMENT_FACT');
  }
  return input;
}
