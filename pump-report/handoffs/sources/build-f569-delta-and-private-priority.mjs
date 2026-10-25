// New F569 projection only; the frozen F568 reader is never invoked here.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {START_PROFILE} from '../../profile/start-v1.mjs';
import {NATIVE_COIN_REVIEWED_ROWS} from '../../sources/native-coin-unit-reviewed-data.mjs';
const hash = x => crypto.createHash('sha256').update(x).digest('hex');
const here = new URL('./', import.meta.url);
const publicPath = n => new URL(n, here);
const load = (path, digest) => {const bytes = fs.readFileSync(path); if (hash(bytes) !== digest) throw Error('EXACT_SAVED_INPUT_SHA_MISMATCH'); return JSON.parse(bytes);};
const key = r => JSON.stringify([String(r.contractId ?? ''), r.symbol, r.asset, r.currency]);
const histogram = values => {const o = {}; for (const value of values) o[value] = (o[value] ?? 0) + 1; return o;};
const writeNew = (path, value, privateFile = false) => {
  const bytes = JSON.stringify(value, null, 2) + '\n'; fs.writeFileSync(path, bytes, {flag: 'wx', mode: privateFile ? 0o600 : 0o644});
  return {sha256: hash(bytes), bytes: Buffer.byteLength(bytes)};
};
const deltaPath = publicPath('F568_53_ACTIVE_DELTA_RECONCILIATION_V1.json');
const deltaBytes = fs.readFileSync(deltaPath), delta = JSON.parse(deltaBytes);
if (delta.actual_capture_sha256 !== '47966d50f21c4a51ffc664fa5537629d4cee955c5159f8d516514a1f5baa1df2' || delta.active_USDT_unresolved_count !== 53) throw Error('F568_53_ACTUAL_DELTA_REQUIRED');
const native = load('/private/tmp/pump-report-native-catalog-corrected.json', '7b683509fea9d5b3aa1d2612ddb8ad259680a3bc33cc4df5cc97f23b4555e9f5').body.response.data.data;
const metadata = load('/private/tmp/pump-corrected-metadata-actual.json', '66c3afe4e3f2d967050fdfbb34fb09741b4612780f1ba264cf504410dc0a3cf9').body.response.data.data.result;
const explicitReview = load('/private/tmp/pump-f569-explicit-carrier-review-private.json', 'b40936f9b43a1f0d2e3ec9650e961554516bb7ab59cebe29cbf64e48d2bb918d');
const reviewedCarriers = new Map(explicitReview.rows.map(r => [r.native_contract_id, r]));
if (reviewedCarriers.size !== 53 || !explicitReview.ROOT_F552_policy_reused) throw Error('FINITE53_PRIMARY_CARRIER_REVIEW_REQUIRED');
const wanted = new Set(delta.rows_hash_status_reasons_only.map(r => r.native_tuple_sha256));
const old = native.filter(r => wanted.has(hash(key(r))));
if (old.length !== 53 || new Set(old.map(r => hash(key(r)))).size !== 53) throw Error('EXACT53_SAVED_TUPLES_REQUIRED');
// One separately authorized F569 bounded field projection of the same file.
// It supplies current53 subset + historical prequeue hints, not a F568 replay.
const inputPath = '/private/tmp/pump-production-manual-one-reply.json', stat = fs.statSync(inputPath);
if (stat.size !== 1362021) throw Error('EXACT_ACTUAL_CAPTURE_BYTES_REQUIRED');
const bytes = fs.readFileSync(inputPath);
if (hash(bytes) !== delta.actual_capture_sha256) throw Error('EXACT_ACTUAL_CAPTURE_SHA_REQUIRED');
const outer = JSON.parse(bytes), body = typeof outer.body === 'string' ? JSON.parse(outer.body) : outer.body;
const captures = [outer.launch_capture, body?.launch_capture, body?.result?.launch_capture].filter(x => x && typeof x === 'object');
if (captures.length !== 1 || captures[0].schema !== 'PUMP_LAUNCH_READINESS_ACTUAL_V1' || captures[0].raw_responses.length > 24
  || captures[0].implementation_sha256 !== 'b784243c8865ff1567e84bc4d5be2bb4517eb0776ed8f11383095844af693b5e') throw Error('EXACT_PRODUCTION_CAPTURE_REQUIRED');
const capture = captures[0], currentPackets = capture.raw_responses.filter(e => e.request?.url === 'https://open-api.bingx.com/openApi/swap/v2/quote/contracts');
if (currentPackets.length !== 1) throw Error('EXACT_CURRENT_CATALOG_PACKET_REQUIRED');
const current = currentPackets[0].response.data.data;
const proposals = old.map(r => {
  const actual = current.filter(x => hash(key(x)) === hash(key(r)));
  if (actual.length !== 1 || actual[0].status !== 1 || actual[0].currency !== 'USDT') throw Error('ACTUAL_CURRENT53_TUPLE_REQUIRED');
  const hits = metadata.filter(m => m.coinName === r.asset), m = hits.length === 1 ? hits[0] : null;
  // Reuse the accepted ROOT_F552 bounded economic inference on a finite,
  // individually reviewed table. No general prefix, ticker, language or
  // numeric coinType classifier is installed, including raw-type0 FX cases.
  const c = reviewedCarriers.get(String(r.contractId));
  const reviewed = hits.length === 1 && c && c.expected_exact_native_asset === r.asset && c.expected_exact_symbol === r.symbol
    && c.expected_exact_native_display === r.displayName && c.expected_exact_metadata_display === m.coinDisplayName
    && c.native_tuple_sha256 === hash(key(r));
  const reasons = reviewed ? ['EXPLICIT_EXACT_OFFICIAL_UNDERLYING_ECONOMIC_CARRIER', 'ROOT_F552_BOUNDED_INFERENCE_REUSED', c.scope_reason]
    : ['EXACT_PRIMARY_CARRIER_REVIEW_MISSING_OR_CHANGED'];
  return {native_tuple_sha256: hash(key(r)), native_tuple: {native_contract_id: String(r.contractId), symbol: r.symbol, asset: r.asset,
      currency: r.currency, family: 'USDT_M', current_status: 1},
    current_membership_evidence_sha256: delta.actual_capture_sha256, saved_previous_status: r.status,
    proposal: reviewed ? 'KNOWN_NON_TARGET' : 'UNKNOWN', economic_exposure: reviewed ? c.economic_exposure : null,
    scope_reason: reviewed ? c.scope_reason : null, proposed_registry_activation: false, reason_codes: reasons,
    primarycarrier: reviewed ? {kind: c.primarycarrier, official_underlying_display: c.reviewed_official_underlying,
      native_product_display: r.displayName, metadata_official_display: m.coinDisplayName,
      exact_review_sha256: 'b40936f9b43a1f0d2e3ec9650e961554516bb7ab59cebe29cbf64e48d2bb918d'} : null,
    economic_inference_explicit: reviewed, ROOT_review_required: true,
    limitation: 'Exact53 economic exposure only; no universal coinType enum, new crypto, native-unit, cross-venue identity or IO grant.',
    primary_evidence: {native_saved_sha256: '7b683509fea9d5b3aa1d2612ddb8ad259680a3bc33cc4df5cc97f23b4555e9f5',
      display_info_sha256: '66c3afe4e3f2d967050fdfbb34fb09741b4612780f1ba264cf504410dc0a3cf9',
      metadata_endpoint: 'https://api-app.acc-de.com/api/coin/v1/display-info/list',
      unique_same_label_match: hits.length === 1, metadata_row_sha256: m ? hash(JSON.stringify(m)) : null,
      raw_coinType: m?.coinType ?? null, coinId_is_native_contractId_namespace: false,
      explicit_semantic_enum_present: false, direct_category_membership_20_or_22_present: false},
    minimum_primary_input: reviewed ? null : 'New explicit exact underlying/economic primary carrier or vendor category membership with proved native join; separate IO admission required.'};
});
const proposalFile = '/private/tmp/pump-f569-classification53-private.json';
const privateProof = writeNew(proposalFile, {schema: 'F569_EXACT53_PRIVATE_PROPOSALS_V1', proposals,
  source: 'SAVED_PRIMARY_METADATA_AND_HASH_VERIFIED_ACTUAL_CURRENT_TUPLES', formal_classification_inference_used: true,
  no_name_or_language_classifier: true, no_registry_mutation: true}, true);
const allowed = new Map(NATIVE_COIN_REVIEWED_ROWS.map(r => [r[2], r]));
if (allowed.size !== 541) throw Error('FROZEN541_SEMANTIC_SCOPE_REQUIRED');
const tickerPackets = capture.raw_responses.filter(e => e.request?.url === 'https://open-api.bingx.com/openApi/swap/v2/quote/ticker' && !e.request.query?.symbol);
if (tickerPackets.length !== 1 || tickerPackets[0].response?.data?.code !== 0) throw Error('ONE_EXISTING_BULK_TICKER_REQUIRED');
const ticker = tickerPackets[0].response, tickerRows = ticker.data.data;
if (!Array.isArray(tickerRows) || tickerRows.length > 20000) throw Error('BOUNDED_EXISTING_TICKER_REQUIRED');
const bySymbol = new Map(); for (const r of tickerRows) {const list = bySymbol.get(r.symbol) ?? []; list.push(r); bySymbol.set(r.symbol, list);}
const checkedInstrument = capture.analyses[0]?.original?.input?.instrument?.instrument_id;
const threshold = START_PROFILE.automatic_growth.day_pct * START_PROFILE.prequeue_threshold_fraction;
const now = Date.now(), seeds = [], rejected = {};
for (const [symbol, review] of allowed) {
  const rows = bySymbol.get(symbol) ?? [], r = rows.length === 1 ? rows[0] : null;
  if (!r) {rejected.MISSING_OR_DUPLICATE_TICKER = (rejected.MISSING_OR_DUPLICATE_TICKER ?? 0) + 1; continue;}
  const change = typeof r.priceChangePercent === 'number' || typeof r.priceChangePercent === 'string' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(r.priceChangePercent) ? Number(r.priceChangePercent) : null;
  const event = typeof r.closeTime === 'string' && /^\d{13}$/.test(r.closeTime) ? Number(r.closeTime) : r.closeTime;
  if (!Number.isFinite(change) || !Number.isSafeInteger(event) || event > ticker.received_ts) {rejected.INVALID_REPORTED_HINT_OR_CLOCK = (rejected.INVALID_REPORTED_HINT_OR_CLOCK ?? 0) + 1; continue;}
  if (change < threshold) continue;
  seeds.push({instrument_id: review[3], native_symbol: symbol, native_contract_id: review[0], reported_change_pct: change,
    threshold_basis: 'EXISTING_REPORTED_DAY_PREQUEUE_HINT_ONLY', prequeue_threshold_pct: threshold,
    original_event_ts: event, original_received_ts: ticker.received_ts, original_receipt_sha256: hash(ticker.receipt_id),
    fresh_at_original_receive: ticker.received_ts <= event + START_PROFILE.freshness_ms.price,
    fresh_now: now <= event + START_PROFILE.freshness_ms.price, mandatory_schema_and_Coin_unit_reviewed: true,
    already_analyzed_in_this_capture: review[3] === checkedInstrument, core_ready_claim: false, new_source_recheck_required: true,
    closed_day_growth_not_qualified_by_reported_hint: true, short_window_growth: null,
    cross_asset_quote_volume_or_BASE_rank_used: false});
}
seeds.sort((a, b) => Number(a.already_analyzed_in_this_capture) - Number(b.already_analyzed_in_this_capture)
  || b.reported_change_pct - a.reported_change_pct || a.instrument_id.localeCompare(b.instrument_id));
const priorityPath = '/private/tmp/pump-f569-historical-manual-priority-private.json';
const priorityProof = writeNew(priorityPath, {schema: 'F569_HISTORICAL_REPORTED_PREQUEUE_HINTS_PRIVATE_V1', actual_capture_sha256: delta.actual_capture_sha256,
  semantic_scope: 541, current_snapshot_is_historical: true, seeds, rejected_counts: rejected,
  priority_basis: 'ONLY_EXISTING_REPORTED_CHANGE_PREQUEUE_HINT; NO_VOLUME_RANK; NOT_READY_OR_CURRENT_FRESH_QUALIFICATION',
  new_manual_or_market_IO_authorized: false, analytics_recomputed: false}, true);
const publicRows = proposals.map(r => ({native_tuple_sha256: r.native_tuple_sha256, current_status: 1, proposal: r.proposal,
  economicdecision: r.proposal, economic_exposure: r.economic_exposure, scope_reason: r.scope_reason,
  primarycarrier: r.primarycarrier ? {kind: r.primarycarrier.kind, exact_review_sha256: r.primarycarrier.exact_review_sha256} : null,
  evidenceSHA: r.primary_evidence.metadata_row_sha256, limitation: r.limitation, economic_inference_explicit: r.economic_inference_explicit,
  reason_codes: r.reason_codes, metadata_row_sha256: r.primary_evidence.metadata_row_sha256,
  unique_metadata_match: r.primary_evidence.unique_same_label_match}));
const summary = {schema: 'F569_EXACT53_PROPOSAL_AND_PRIVATE_PRIORITY_SUMMARY_V1', status: 'EXPLICIT53_ECONOMIC_PROPOSALS_READY_FOR_ROOT_REVIEW_NO_RUNTIME_PROMOTION',
  actual_capture_sha256: delta.actual_capture_sha256, F568_delta_sha256: hash(deltaBytes), proposals: 53,
  proposal_counts: histogram(proposals.map(r => r.proposal)), raw_coin_type_counts_not_decoded: histogram(proposals.map(r => 'RAW_TYPE_' + r.primary_evidence.raw_coinType)),
  economic_exposure_counts: histogram(proposals.map(r => r.economic_exposure)),
  ROOT_F552_bounded_inference_reused: true, new_generic_name_language_or_raw_enum_classifier: false,
  type0_non_target_FX_counterexamples: proposals.filter(r => r.primary_evidence.raw_coinType === 0 && r.proposal === 'KNOWN_NON_TARGET').length,
  metadata_unique_matches: proposals.filter(r => r.primary_evidence.unique_same_label_match).length,
  metadata_official_underlying_carriers_reviewed: proposals.filter(r => r.primarycarrier).length,
  metadata_explicit_semantic_enum_count: 0, actual_category20_or22_membership_count: 0,
  private53_proposals: {path: proposalFile, ...privateProof}, private_priority: {path: priorityPath, ...priorityProof,
    semantic_scope: 541, historical_seed_count: seeds.length, already_analyzed_seed_count: seeds.filter(r => r.already_analyzed_in_this_capture).length,
    fresh_now_seed_count: seeds.filter(r => r.fresh_now).length, READY_claims: 0, volume_rank_used: false, analytics_recomputed: false},
  rows_hash_reason_only: publicRows, frozen_runtime_or_registry_changes: 0, F568_reader_reexecuted: false,
  F569_private_capture_field_projection_reads: 1, new_provider_metadata_HTTP_SQL_TG_deploy: 0};
// One new proposal/priority consistency check, using the actual tuple hashes.
if (proposals.length !== 53 || proposals.some(r => !wanted.has(r.native_tuple_sha256) || r.native_tuple.current_status !== 1 || r.proposed_registry_activation || r.proposal !== 'KNOWN_NON_TARGET')
  || seeds.some(r => !allowed.has(r.native_symbol) || r.core_ready_claim || !r.new_source_recheck_required)
  || fs.statSync(proposalFile).mode % 512 !== 384 || fs.statSync(priorityPath).mode % 512 !== 384) throw Error('F569_NEW_PROPOSAL_CONSISTENCY_FAILED');
summary.new_proposal_consistency_check = 'VERIFIED_ONCE';
const publicProof = writeNew(publicPath('F569_EXACT53_PROPOSAL_AND_PRIVATE_PRIORITY_SUMMARY_V1.json'), summary);
console.log(JSON.stringify({public_summary_sha256: publicProof.sha256, proposal_counts: summary.proposal_counts,
  unique_metadata_matches: summary.metadata_unique_matches, raw_coin_type_counts_not_decoded: summary.raw_coin_type_counts_not_decoded,
  private53_sha256: privateProof.sha256, private_priority_sha256: priorityProof.sha256,
  historical_seed_count: seeds.length, fresh_seed_count: summary.private_priority.fresh_now_seed_count,
  READY_claims: 0, public_prices_or_growth_values: 0, new_HTTP_SQL_TG: 0, consistency: 'VERIFIED_ONCE'}));
