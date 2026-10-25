export const INPUT_SCHEMA = 'PUMP_REPORT_INPUT_V1';
export const ANALYSIS_SCHEMA = 'PUMP_REPORT_ANALYSIS_V1';
export const CONTRACT_VERSION = 'pump-report-contract-v1';
export const TZ_SHA256 = '0674adf8bef087f63ddac8214b8e650ae14410f33970ed4f869c5ab2564975cc';
export const FACT_STATUSES = Object.freeze(['USABLE', 'INCOMPLETE', 'ABSENT', 'STALE', 'ERROR', 'NOT_CHECKED']);
export const MAP_STATUSES = Object.freeze(['USABLE', 'PARTIAL', 'ABSENT', 'STALE', 'ERROR', 'NOT_CHECKED', 'NOT_CHECKED_BUDGET', 'TIMEOUT']);
export const finite = value => typeof value === 'number' && Number.isFinite(value);
export const positive = value => finite(value) && value > 0;
export const validTime = value => Number.isSafeInteger(value) && value > 0;

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
  for (const fact of Object.values(input.facts)) {
    if (fact != null && fact.instrument_id !== input.instrument.instrument_id) throw Error('CROSS_INSTRUMENT_FACT');
  }
  return input;
}
