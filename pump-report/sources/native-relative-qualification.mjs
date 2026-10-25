import {assertInstrument, candleNativeComparisonKey, CANDLE_NATIVE_RELATIVE_KIND,
  CANDLE_CCXT_TIME_BASIS, CANDLE_SEMANTICS_OWNER_REF} from '../contracts/index.mjs';

export const NATIVE_RELATIVE_MODE = 'OWNER_APPROVED_NATIVE_RELATIVE_V1';
export const CCXT_PINNED_COMMIT = 'd3159f7036f93db086cd0414642132fba5401710';
export const CCXT_CANDLE_EVIDENCE = 'pump-report/handoffs/sources/CCXT_PINNED_NATIVE_CANDLE_REVIEW_V1.json';
export const OWNER_ACCEPTANCE_GIT_BLOB = '8004c6b4b8b646558b8fa0f774cdf985667324a1';
const ROUTE = '/openApi/swap/v3/quote/klines';

// This factory records the owner's specific consumer-time/relative-quantity
// choice. It does not establish a native base unit or a vendor time guarantee.
export function createNativeRelativeCandleQualification(instrument, interval_ms = 60000) {
  assertInstrument(instrument);
  if (typeof instrument.identity_evidence_ref !== 'string' || !instrument.identity_evidence_ref.trim()
    || instrument.native_symbol !== instrument.base + '-USDT'
    || instrument.margin !== undefined && instrument.margin !== 'USDT'
    || ['PAXG', 'XAUT'].includes(instrument.base.toUpperCase())) throw Error('NATIVE_RELATIVE_IDENTITY_UNQUALIFIED');
  return {mode: NATIVE_RELATIVE_MODE, owner_decision_ref: CANDLE_SEMANTICS_OWNER_REF,
    owner_decision_git_blob: OWNER_ACCEPTANCE_GIT_BLOB,
    time: {semantics: 'OPEN_TIME', basis: CANDLE_CCXT_TIME_BASIS,
      evidence_ref: CCXT_CANDLE_EVIDENCE, pinned_commit: CCXT_PINNED_COMMIT,
      independent_vendor_guarantee_claimed: false},
    volume: {unit: 'NATIVE_REPORTED_QUANTITY', native_quantity_unit: 'UNKNOWN',
      comparison_kind: CANDLE_NATIVE_RELATIVE_KIND,
      comparison_key: candleNativeComparisonKey(instrument, interval_ms),
      instrument_id: instrument.instrument_id, asset_id: instrument.asset_id,
      identity_evidence_ref: instrument.identity_evidence_ref, native_symbol: instrument.native_symbol,
      venue: 'BINGX', family: 'USDT_M', route: ROUTE, field: 'volume', interval_ms,
      evidence_ref: CANDLE_SEMANTICS_OWNER_REF, absolute_amounts_qualified: false}};
}

export function nativeRelativeRequested(qualification) {
  return qualification?.mode !== undefined
    || qualification?.owner_decision_ref !== undefined
    || qualification?.owner_decision_git_blob !== undefined
    || qualification?.volume?.comparison_key !== undefined
    || qualification?.volume?.native_quantity_unit !== undefined
    || qualification?.time?.basis === CANDLE_CCXT_TIME_BASIS
    || qualification?.volume?.unit === 'NATIVE_REPORTED_QUANTITY'
    || qualification?.volume?.comparison_kind === CANDLE_NATIVE_RELATIVE_KIND;
}

export function nativeRelativeCandleQualified(qualification, instrument, interval_ms) {
  try {
    const expected = createNativeRelativeCandleQualification(instrument, interval_ms);
    return ['mode', 'owner_decision_ref', 'owner_decision_git_blob'].every(k => qualification?.[k] === expected[k])
      && ['time', 'volume'].every(section => Object.entries(expected[section])
        .every(([key, value]) => qualification?.[section]?.[key] === value));
  } catch { return false; }
}
