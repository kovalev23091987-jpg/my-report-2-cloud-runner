// F616 OFFLINE PREPARATION ONLY. Not imported by the production runtime.
// The caller must pin the private capture bytes and all expected hashes first.
// No IO, engine, source replay, identity activation or execution-unit review.
import {stableCapturedJSON} from './captured-bulk-price-coverage.mjs';
import {isExactSavedNonTargetDecision} from './saved-nontarget-decisions.mjs';
import {ownerInstrumentExcluded} from '../contracts/index.mjs';
import {CATALOG_SNAPSHOT_BOUNDS, CATALOG_SNAPSHOT_SERIALIZATION} from '../runtime/catalog-snapshot.mjs';

const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const hash = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const time = x => Number.isSafeInteger(x) && x > 0;
const text = x => typeof x === 'string' && x.length > 0 && x.length <= 256 && !/[\u0000-\u001f\u007f]/.test(x);
const id = x => Number.isSafeInteger(x) && x >= 0 ? String(x)
  : typeof x === 'string' && /^\d{1,80}$/.test(x) ? x : null;
const tuple = r => object(r) && id(r.contractId) !== null && text(r.symbol) && text(r.asset) && text(r.currency) && Number.isInteger(r.status)
  ? {native_contract_id: id(r.contractId), symbol: r.symbol, asset: r.asset, currency: r.currency, status: r.status} : null;
const key = t => JSON.stringify([t.native_contract_id, t.symbol, t.asset, t.currency, t.status]);
const bytes = s => new TextEncoder().encode(s).byteLength;
const require = (ok, reason) => {if (!ok) throw Error(reason);};

export function prepareCatalogSnapshotReview({observer, expected, selected_scope, negative_decisions,
  sha256, evidence_mode = 'OBSERVED'} = {}) {
  require(typeof sha256 === 'function' && object(expected) && ['OBSERVED', 'ARTIFICIAL_PREPARATION'].includes(evidence_mode), 'F616_EXPLICIT_REVIEW_CONTEXT_REQUIRED');
  const digest = value => {const h = sha256(value); require(hash(h), 'F616_SYNCHRONOUS_SHA256_REQUIRED'); return h;};
  require(['implementation_sha256', 'snapshot_json_sha256', 'body_sha256', 'selected_scope_canonical_sha256',
    'negative_decisions_canonical_sha256'].every(k => hash(expected[k])) && time(expected.as_of_ts)
    && time(expected.observed_ts) && time(expected.received_ts) && text(expected.receipt_id), 'F616_PINNED_EXPECTATIONS_REQUIRED');
  require(Array.isArray(selected_scope) && selected_scope.length === 550 && Array.isArray(negative_decisions)
    && negative_decisions.length <= 2000, 'F616_FROZEN_SAVED_SCOPE_REQUIRED');
  require(digest(stableCapturedJSON(selected_scope)) === expected.selected_scope_canonical_sha256
    && digest(stableCapturedJSON(negative_decisions)) === expected.negative_decisions_canonical_sha256, 'F616_SAVED_SCOPE_DIGEST_MISMATCH');
  const observation = observer?.catalog_snapshot, snapshot = observation?.private_evidence?.snapshot;
  require(observation?.schema === 'PUMP_SAVED_CATALOG_SNAPSHOT_OBSERVATION_V1' && object(snapshot), 'F616_EXACT_SNAPSHOT_BRANCH_REQUIRED');
  let bodyJSON, snapshotJSON;
  try {bodyJSON = JSON.stringify(snapshot.body); snapshotJSON = JSON.stringify(snapshot);}
  catch {throw Error('F616_SNAPSHOT_NOT_JSON_NO_RAW_OUTPUT');}
  require(typeof bodyJSON === 'string' && bytes(bodyJSON) <= CATALOG_SNAPSHOT_BOUNDS.body_utf8_bytes
    && bytes(snapshotJSON) <= CATALOG_SNAPSHOT_BOUNDS.record_utf8_bytes, 'F616_SNAPSHOT_BYTE_BOUND');
  require(snapshot.schema === 'PUMP_RETAINED_CATALOG_SNAPSHOT_V1' && snapshot.provider === 'BINGX' && snapshot.family === 'USDT_M'
    && snapshot.route === '/openApi/swap/v2/quote/contracts' && snapshot.serialization_basis === CATALOG_SNAPSHOT_SERIALIZATION
    && snapshot.source_event_ts === null && snapshot.implementation_sha256 === expected.implementation_sha256,
  'F616_PRODUCER_SCHEMA_ROUTE_PIN_MISMATCH');
  require(snapshot.body?.code === 0 && Array.isArray(snapshot.body.data) && snapshot.body.data.length > 0
    && snapshot.body.data.length <= CATALOG_SNAPSHOT_BOUNDS.rows && snapshot.row_count === snapshot.body.data.length
    && snapshot.body_utf8_bytes === bytes(bodyJSON) && digest(bodyJSON) === snapshot.body_sha256
    && snapshot.body_sha256 === expected.body_sha256 && digest(snapshotJSON) === expected.snapshot_json_sha256,
  'F616_IMMUTABLE_BODY_BINDING_MISMATCH');
  require(time(snapshot.received_ts) && time(snapshot.saved_ts) && snapshot.received_ts <= snapshot.saved_ts
    && snapshot.saved_ts <= observation.observed_ts && observation.observed_ts <= expected.as_of_ts
    && observation.observed_ts === expected.observed_ts && snapshot.received_ts === expected.received_ts
    && snapshot.receipt_id === expected.receipt_id && /^[A-Za-z0-9:._-]{1,160}$/.test(snapshot.receipt_id),
  'F616_ORIGINAL_RECEIPT_CLOCK_MISMATCH');
  const observed = evidence_mode === 'OBSERVED';
  require(observation.snapshot_bytes_clocks_bound === true && observation.implementation_bound === true
    && snapshot.evidence_class === (observed ? 'OBSERVED' : 'ARTIFICIAL')
    && observation.native_source_response_bound === observed && observation.status === (observed
      ? 'BOUND_SAVED_NATIVE_CATALOG_AT_ORIGINAL_RECEIPT' : 'BOUND_CATALOG_NON_OBSERVED_NOT_NATIVE'), 'F616_EVIDENCE_CLASS_MISMATCH');

  // Reuse the saved F552/F568 tuple seam; this matches saved scope, not new crypto identity.
  const selected = new Map(), negatives = new Map(), selectedSymbols = new Set(), selectedIds = new Set();
  for (const p of selected_scope) {
    const t = tuple({contractId: p.native_contract_id, symbol: p.tuple?.native_symbol, asset: p.tuple?.base,
      currency: p.tuple?.quote, status: p.native_status_at_capture});
    require(t && t.currency === 'USDT' && t.status === 1 && p.tuple?.venue === 'BINGX'
      && p.tuple?.market_type === 'PERPETUAL' && p.tuple?.settle === 'USDT' && p.tuple?.margin === 'USDT'
      && p.tuple?.instrument_id === `BINGX:USDT_M:${t.native_contract_id}:${t.symbol}`
      && !ownerInstrumentExcluded(t.asset) && !['PAXG', 'XAUT'].includes(t.asset.toUpperCase())
      && !selected.has(key(t)) && !selectedSymbols.has(t.symbol) && !selectedIds.has(t.native_contract_id), 'F616_SAVED_SELECTED_TUPLE_INVALID');
    selected.set(key(t), p.tuple.instrument_id); selectedSymbols.add(t.symbol); selectedIds.add(t.native_contract_id);
  }
  for (const d of negative_decisions) {
    const t = d?.native_tuple, row = {contractId: t?.native_contract_id, symbol: t?.symbol, asset: t?.asset, currency: t?.currency, status: t?.status};
    require(isExactSavedNonTargetDecision(d, row) && !negatives.has(key(t)) && !selected.has(key(t)), 'F616_EXACT_NEGATIVE_DECISION_INVALID');
    negatives.set(key(t), d.decision_id);
  }
  const raw = snapshot.body.data, symbols = new Map(), ids = new Map(), counts = {}, rows = [];
  for (const r of raw) {const t = tuple(r); if (t) {symbols.set(t.symbol, (symbols.get(t.symbol) ?? 0) + 1); ids.set(t.native_contract_id, (ids.get(t.native_contract_id) ?? 0) + 1);}}
  for (let index = 0; index < raw.length; index++) {
    const t = tuple(raw[index]); let disposition, decision_ref = null;
    if (!t) disposition = 'INVALID_NATIVE_ROW';
    else if (symbols.get(t.symbol) !== 1 || ids.get(t.native_contract_id) !== 1) disposition = 'DUPLICATE_NATIVE_IDENTITY_REVIEW_BLOCKED';
    else if (t.currency !== 'USDT' || !t.symbol.endsWith('-USDT')) disposition = 'NON_USDT_SETTLEMENT';
    else if (t.status !== 1) disposition = 'INACTIVE_AT_CAPTURE';
    else if (ownerInstrumentExcluded(t.asset) || ownerInstrumentExcluded(t.symbol)) disposition = 'OWNER_EXCLUDED_BTC_ETH';
    else if (['PAXG', 'XAUT'].includes(t.asset.toUpperCase()) || ['PAXG-USDT', 'XAUT-USDT'].includes(t.symbol)) disposition = 'OWNER_EXCLUDED_GOLD';
    else if (selected.has(key(t))) {disposition = 'SAVED_SELECTED_SCOPE_EXACT_TUPLE'; decision_ref = selected.get(key(t));}
    else if (negatives.has(key(t))) {disposition = 'KNOWN_EXACT_SAVED_NON_TARGET_TUPLE'; decision_ref = negatives.get(key(t));}
    else disposition = 'ACTIVE_USDT_IDENTITY_PROPOSAL_NOT_CHECKED';
    counts[disposition] = (counts[disposition] ?? 0) + 1;
    rows.push({row_index: index, native_tuple: t, native_tuple_sha256: t ? digest(stableCapturedJSON(t)) : null,
      disposition, saved_decision_ref: decision_ref,
      new_identity_status: disposition === 'ACTIVE_USDT_IDENTITY_PROPOSAL_NOT_CHECKED' ? 'PROPOSAL' : 'NO_NEW_DECISION',
      economic_classification: 'NOT_CHECKED_BY_THIS_CONSUMER', CORE_units_maps_qualified: false});
  }
  return {schema: 'F616_CATALOG_FINITE_REVIEW_INPUT_V1', evidence_class: observed ? 'OBSERVED_CAPTURE_REVIEW_METADATA_ONLY' : 'ARTIFICIAL_PREPARATION_ONLY',
    producer_pin: snapshot.implementation_sha256, producer_received_ts: snapshot.received_ts, producer_receipt_id: snapshot.receipt_id,
    saved_ts: snapshot.saved_ts, observed_ts: observation.observed_ts, as_of_ts: expected.as_of_ts,
    body_sha256: snapshot.body_sha256, snapshot_json_sha256: expected.snapshot_json_sha256,
    saved_scope_canonical_sha256: expected.selected_scope_canonical_sha256,
    negative_decisions_canonical_sha256: expected.negative_decisions_canonical_sha256,
    counts, rows, saved_selected_scope_size: selected_scope.length, raw_catalog_rows: raw.length,
    source_event_ts: null, parsed_JSON_not_wire_bytes: true, all_languages_in_scope: true,
    current_global_crypto_N: null, current_global_N_proven: false, native_or_IO_admission_created: false,
    new_registry_decisions: 0, prices_volumes_raw_body_exported: false, provider_SQL_engine_Telegram_IO: 0};
}
