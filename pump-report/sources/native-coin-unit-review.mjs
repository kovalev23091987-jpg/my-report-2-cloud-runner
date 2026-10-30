// Exact same-venue semantic overlay proposed to ROOT. It grants no IO,
// current membership, received book, multiplier or cross-venue identity.
import {NATIVE_COIN_REVIEWED_ROWS, NATIVE_COIN_REVIEW_REF, NATIVE_COIN_REVIEW_SHA256} from './native-coin-unit-reviewed-data.mjs';

const byId = new Map(NATIVE_COIN_REVIEWED_ROWS.map(row => [row[3], row]));
const tupleKeys = ['instrument_id', 'asset_id', 'venue', 'native_symbol', 'market_type', 'base', 'quote', 'settle', 'margin'];

export function reviewedNativeCoinOrderbook(entry) {
  // Preserve independently accepted old qualifications byte for byte.
  if (entry?.qualifications?.orderbook) return entry;
  const i = entry?.instrument, row = byId.get(i?.instrument_id);
  if (!row || i.classification_status !== 'VERIFIED_CRYPTO' || typeof i.identity_evidence_ref !== 'string' || !i.identity_evidence_ref.trim()) return entry;
  const [native_contract_id, base, native_symbol, instrument_id, asset_id, decision_sha256] = row;
  const expected = {instrument_id, asset_id, venue: 'BINGX', native_symbol, market_type: 'PERPETUAL', base, quote: 'USDT', settle: 'USDT', margin: 'USDT'};
  if (entry.family !== 'USDT_M' || entry.native_base !== base || String(entry.native_contract_id) !== native_contract_id || tupleKeys.some(k => i[k] !== expected[k])) return entry;
  return {...entry, qualifications: {...entry.qualifications, orderbook: {
    fields: 'COIN', unit: 'BASE_ASSET', native_base_unit: base,
    evidence_ref: NATIVE_COIN_REVIEW_REF + '#' + decision_sha256,
    primary_source_review_sha256: NATIVE_COIN_REVIEW_SHA256,
    qualification_scope: 'EXACT_REVIEWED_BINGX_USDT_M_NATIVE_ASSET_COIN_ONLY;ACTUAL_COIN_ARRAYS_T_FRESHNESS_REQUIRED'
  }}, execution_review: {scope: 'EXACT_ORDINARY_NATIVE_COIN_DENOMINATION', review_ref: NATIVE_COIN_REVIEW_REF,
    review_sha256: NATIVE_COIN_REVIEW_SHA256, actual_native_book_qualified: false},
  limitations: [...(entry.limitations ?? []), 'NATIVE_COIN_UNIT_REVIEW_IS_NOT_CURRENT_BOOK_OR_FULL_CORE_COVERAGE']};
}
