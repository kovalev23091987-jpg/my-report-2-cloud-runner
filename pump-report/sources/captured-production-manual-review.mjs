// Offline inspection of an already acquired production original. No fetch,
// SQL, analysis engine, plan construction, text rendering or delivery.
import {createPumpSources} from './index.mjs';
import {object, positive, timestamp} from './bingx.mjs';
import {stableCapturedJSON} from './captured-bulk-price-coverage.mjs';
import {factUsable} from '../contracts/index.mjs';
import {START_PROFILE} from '../profile/start-v1.mjs';

const safe = x => typeof x === 'string' && /^[A-Z0-9_:.-]{1,160}$/.test(x) ? x : 'UNSPECIFIED_OR_PRIVATE_REASON';
const add = (o, k, n = 1) => {o[k] = (o[k] ?? 0) + n;};
const tuple = r => [String(r?.contractId ?? ''), r?.symbol, r?.asset, r?.currency];
const key = r => JSON.stringify(tuple(r));
const fullKey = r => JSON.stringify([...tuple(r), r?.status]);
const good = r => object(r) && r.ok === true && r.status === 200 && r.semantic_status === 'SUCCESS'
  && timestamp(r.received_ts) !== null && typeof r.receipt_id === 'string';

function envelope(capture) {
  const body = typeof capture?.body === 'string' ? JSON.parse(capture.body) : capture?.body;
  const candidates = [capture?.launch_capture, body?.launch_capture, body?.result?.launch_capture].filter(object);
  if (candidates.length !== 1) throw Error('EXACT_SINGLE_LAUNCH_CAPTURE_BRANCH_REQUIRED');
  const c = candidates[0];
  if (c.schema !== 'PUMP_LAUNCH_READINESS_ACTUAL_V1' || !Array.isArray(c.raw_responses) || c.raw_responses.length > 24
    || !object(c.raw_capture) || c.raw_capture.entries !== c.raw_responses.length || c.raw_capture.bytes > 8388608) throw Error('BOUNDED_ACTUAL_LAUNCH_CAPTURE_REQUIRED');
  return {capture: c, result: body?.launch_capture === c ? body : body?.result?.launch_capture === c ? body.result : capture};
}
function route(entry) {
  try {
    const u = new URL(entry?.request?.url);
    if (u.protocol !== 'https:' || u.hostname !== 'open-api.bingx.com' || u.username || u.password || u.port
      || entry.request.method !== 'GET' || entry.request.provider !== 'BINGX') return null;
    return {path: u.pathname, query: entry.request.query ?? Object.fromEntries(u.searchParams)};
  } catch {return null;}
}

export async function reviewCapturedProductionManual({capture: rawCapture, registry, expected, saved_native_rows, negative_decisions,
  as_of_ts, sha256, expected_pin, expected_capture_id, file_sha256, file_bytes}) {
  if (typeof sha256 !== 'function' || timestamp(as_of_ts) === null || expected.length !== 550) throw Error('EXACT_OFFLINE_REVIEW_DEPENDENCIES_REQUIRED');
  const {capture, result} = envelope(rawCapture);
  if (capture.implementation_sha256 !== expected_pin || capture.capture_id !== expected_capture_id || capture.run_id !== expected_capture_id
    || capture.publication_allowed !== false) throw Error('EXACT_PINNED_NONPUBLISHING_CAPTURE_REQUIRED');
  const responses = capture.raw_responses, catalogs = responses.filter(e => route(e)?.path === '/openApi/swap/v2/quote/contracts');
  if (catalogs.length !== 1 || !good(catalogs[0].response) || catalogs[0].response.data?.code !== 0
    || !Array.isArray(catalogs[0].response.data.data) || catalogs[0].response.data.data.length > 20000) throw Error('ONE_SUCCESSFUL_CAPTURED_CATALOG_REQUIRED');
  const native = catalogs[0].response.data.data, received = catalogs[0].response.received_ts;
  // Execute only the frozen catalog producer against this exact original
  // response. Any second request is refused; getCore/analyzePump are not run.
  let offlineCatalogRequests = 0;
  const sources = createPumpSources({identityRegistry: registry, clock: () => received, broker: {request: async args => {
    if (args.url !== 'https://open-api.bingx.com/openApi/swap/v2/quote/contracts' || ++offlineCatalogRequests !== 1) throw Error('OFFLINE_CAPTURE_CATALOG_ONLY');
    return catalogs[0].response;
  }}});
  const catalog = await sources.getCatalog(), reasons = {}, statuses = {}, dispositions = {}, unresolvedSplits = {};
  for (const r of catalog.unqualified) add(reasons, safe(r.reason));
  const saved = new Map(saved_native_rows.map(r => [key(r), r])), negatives = new Map(negative_decisions.map(d => {
    const t = d.native_tuple; return [JSON.stringify([t.native_contract_id, t.symbol, t.asset, t.currency, t.status]), d];
  }));
  const symbolRows = new Map(), rowDisposition = new Map(), currentUnresolved = [];
  for (const r of native) {
    if (!object(r)) {add(dispositions, 'INVALID_ROW'); continue;}
    add(statuses, Number.isInteger(r.status) ? 'STATUS_' + r.status : 'INVALID_STATUS_TYPE');
    const bucket = symbolRows.get(r.symbol) ?? []; bucket.push(r); symbolRows.set(r.symbol, bucket);
    let disposition;
    if (typeof r.symbol !== 'string' || !r.symbol) disposition = 'INVALID_ROW';
    else if (!r.symbol.endsWith('-USDT') || r.currency !== 'USDT') disposition = 'NON_USDT_SETTLEMENT';
    else if (r.status !== 1) disposition = 'CURRENT_INACTIVE_NOT_ACTIVE_IDENTITY_UNKNOWN';
    else if (['PAXG', 'XAUT'].includes(String(r.asset).toUpperCase()) || ['PAXG-USDT', 'XAUT-USDT'].includes(r.symbol)) disposition = 'OWNER_GOLD_EXCLUSION';
    else {
      const e = registry.resolve({native_symbol: r.symbol, native_contract_id: String(r.contractId), family: 'USDT_M'});
      if (e && e.native_base === r.asset) disposition = ['BTC', 'ETH'].includes(e.instrument.base) ? 'VERIFIED_CRYPTO_OWNER_EXCLUDED_BTC_ETH' : 'VERIFIED_SELECTED_CRYPTO';
      else if (negatives.has(fullKey(r))) disposition = 'KNOWN_NON_TARGET_EXACT_SAVED_TUPLE';
      else {
        disposition = 'ACTIVE_USDT_IDENTITY_UNRESOLVED';
        const old = saved.get(key(r));
        const reason = old ? old.status === 1 ? 'SAME_SAVED_ACTIVE_TUPLE_UNREVIEWED' : 'PREVIOUSLY_INACTIVE_SAME_TUPLE_NOW_ONLINE' : 'NEW_OR_CHANGED_NATIVE_TUPLE';
        add(unresolvedSplits, reason); currentUnresolved.push({native_tuple_sha256: sha256(key(r)), reason});
      }
    }
    rowDisposition.set(r, disposition); add(dispositions, disposition);
  }
  const duplicateGroups = [...symbolRows.values()].filter(rows => rows.length > 1).map(rows => {
    const types = {}; rows.forEach(r => add(types, rowDisposition.get(r))); return {native_symbol_sha256: sha256(String(rows[0].symbol)), rows: rows.length, dispositions: types};
  });
  const unresolvedReasons = new Set(['CRYPTO_ASSET_IDENTITY_UNQUALIFIED', 'CATALOG_REGISTRY_IDENTITY_MISMATCH', 'MISSING_OR_DUPLICATE_NATIVE_SYMBOL', 'INVALID_CATALOG_ROW']);
  const unresolvedReasonDisposition = {};
  for (const r of catalog.unqualified.filter(r => unresolvedReasons.has(r.reason))) {
    const hits = symbolRows.get(r.native_symbol) ?? [], categories = [...new Set(hits.map(x => rowDisposition.get(x)))];
    const reason = safe(r.reason), bucket = unresolvedReasonDisposition[reason] ??= {source_reason_rows: 0, exact_single_row_dispositions: {}, multirow_symbol_attribution_unknown: 0, candidate_disposition_sets: {}};
    bucket.source_reason_rows++;
    if (hits.length === 1) add(bucket.exact_single_row_dispositions, categories[0]);
    else {bucket.multirow_symbol_attribution_unknown++; add(bucket.candidate_disposition_sets, categories.sort().join('|') || 'NO_MATCHING_NATIVE_ROW');}
  }
  const perScope = expected.map(p => {
    const t = p.tuple, hits = (symbolRows.get(t.native_symbol) ?? []).filter(r => String(r.contractId) === p.native_contract_id && r.asset === t.base && r.currency === 'USDT');
    const status = hits.length === 1 && hits[0].status === 1 && catalog.instruments.some(i => i.instrument_id === t.instrument_id)
      ? 'CURRENT_EXACT_ONLINE_MEMBER' : hits.length > 1 ? 'AMBIGUOUS' : hits.length === 1 ? 'CURRENT_NOT_QUALIFIED' : 'MISSING_OR_CHANGED';
    return {scope_tuple_sha256: sha256(stableCapturedJSON(t)), current_membership_status: status};
  });
  const priceObservations = new Map(), responseErrors = {};
  let pricePackets = 0, bulkPackets = 0;
  for (const e of responses) {
    const r = route(e); if (!r || !['/openApi/swap/v2/quote/ticker', '/openApi/swap/v1/ticker/price'].includes(r.path)) continue;
    pricePackets++; const bulk = r.path.endsWith('/ticker') && !r.query.symbol; if (bulk) bulkPackets++;
    const response = e.response, data = response?.data;
    if (!good(response) || data?.code !== 0) {add(responseErrors, safe(e.error ?? 'PRICE_PACKET_NOT_SUCCESSFUL')); continue;}
    const rows = Array.isArray(data.data) ? data.data : object(data.data) ? [data.data] : [];
    if (rows.length > 20000) throw Error('CAPTURED_PRICE_ROWS_BOUND');
    const seen = new Map();
    for (const x of rows) if (object(x) && typeof x.symbol === 'string') {const a = seen.get(x.symbol) ?? []; a.push(x); seen.set(x.symbol, a);}
    for (const [symbol, values] of seen) {
      const x = values.length === 1 ? values[0] : null, isPrice = r.path.endsWith('/price'), event = timestamp(isPrice ? x?.time : x?.closeTime);
      const valid = x && positive(isPrice ? x.price : x.lastPrice) !== null && event !== null && event <= response.received_ts && event <= as_of_ts;
      const status = values.length !== 1 ? 'AMBIGUOUS_PRICE' : !valid ? 'INVALID_PRICE_OR_SOURCE_CLOCK'
        : response.received_ts <= event + START_PROFILE.freshness_ms.price ? 'FRESH_AT_ORIGINAL_RECEIVE' : 'STALE_AT_ORIGINAL_RECEIVE';
      const entry = {status, event, received: response.received_ts, fresh_now: valid && as_of_ts <= event + START_PROFILE.freshness_ms.price,
        evidence_hash: sha256(stableCapturedJSON([symbol, event, response.received_ts, response.receipt_id]))};
      const prior = priceObservations.get(symbol);
      if (!prior || (entry.event ?? -1) > (prior.event ?? -1)) priceObservations.set(symbol, entry);
    }
  }
  const priceCounts = {}, currentPriceCounts = {};
  expected.forEach((p, index) => {
    const observation = priceObservations.get(p.tuple.native_symbol);
    const status = observation?.status ?? 'NOT_CHECKED_NO_CAPTURED_PRICE'; add(priceCounts, status);
    add(currentPriceCounts, observation ? observation.fresh_now ? 'FRESH_AT_OFFLINE_REVIEW' : 'NOT_FRESH_AT_OFFLINE_REVIEW' : 'NOT_CHECKED_NO_CAPTURED_PRICE');
    Object.assign(perScope[index], {price_status: status, current_price_status: observation ? observation.fresh_now ? 'FRESH' : 'NOT_FRESH' : 'NOT_CHECKED',
      price_clock_evidence_sha256: observation?.evidence_hash ?? null});
  });
  if (!Array.isArray(capture.analyses) || capture.analyses.length > 1) throw Error('ONE_SELECTED_ORIGINAL_MAX');
  const original = capture.analyses[0]?.original, input = original?.input, facts = input?.facts, selected = input?.instrument;
  const selectedReview = {original_present: Boolean(input), facts: {}, price_or_raw_values_exported: false, source_CORE_recomputed: false, analysis_plan_or_text_recomputed: false};
  if (input) {
    if (input.run_purpose !== 'PRODUCTION' || input.mode !== 'MANUAL' || input.run_id !== capture.run_id || !object(facts)
      || original.implementation_sha256 !== expected_pin || timestamp(input.analysis_ts) === null) throw Error('PINNED_PRODUCTION_ORIGINAL_INPUT_REQUIRED');
    const entry = registry.resolve({instrument_id: selected?.instrument_id});
    selectedReview.exact_independent_registry_tuple = Boolean(entry && stableCapturedJSON(entry.instrument) === stableCapturedJSON(selected));
    selectedReview.instrument_tuple_sha256 = sha256(stableCapturedJSON(selected));
    for (const [kind, f] of Object.entries(facts)) {
      if (!object(f)) continue;
      const matching = responses.filter(e => e.response?.receipt_id === f.evidence_ref), response = matching.length === 1 ? matching[0].response : null;
      const summary = {saved_status: safe(f.status), saved_reason: f.reason == null ? null : safe(f.reason), unit: typeof f.unit === 'string' && /^[A-Z0-9_:.-]{1,100}$/.test(f.unit) ? f.unit : null,
        usable_at_saved_analysis: factUsable(f, input.analysis_ts), usable_at_offline_review: factUsable(f, as_of_ts),
        original_source_clock_valid: timestamp(f.event_ts) !== null && f.event_ts <= f.received_ts && f.received_ts <= input.analysis_ts,
        captured_receipt_match_count: matching.length, original_received_clock_matches: response ? response.received_ts === f.received_ts : null,
        source_clock_evidence_sha256: sha256(stableCapturedJSON([f.event_ts, f.received_ts, f.expires_ts, f.evidence_ref]))};
      if (kind === 'orderbook') Object.assign(summary, {Coin_arrays_present: Boolean(Array.isArray(response?.data?.data?.bidsCoin) && Array.isArray(response?.data?.data?.asksCoin)),
        original_T_matches_fact_clock: response ? timestamp(response.data?.data?.T) === f.event_ts : false,
        exact_native_Coin_unit_review: Boolean(entry?.qualifications?.orderbook?.fields === 'COIN' && entry.qualifications.orderbook.unit === 'BASE_ASSET'
          && entry.qualifications.orderbook.native_base_unit === selected.base), complete_book_claim: f.coverage?.complete_book ?? null});
      if (kind === 'candles') Object.assign(summary, {saved_closed_rows: Array.isArray(f.value) ? f.value.length : null,
        all_saved_rows_closed: Array.isArray(f.value) && f.value.every(c => c.closed === true && c.close_ts <= f.received_ts),
        absolute_BASE_volume_qualified: entry?.qualifications?.candles?.volume?.absolute_amounts_qualified === true,
        native_relative_quantity_unit: entry?.qualifications?.candles?.volume?.native_quantity_unit ?? null});
      selectedReview.facts[safe(kind.toUpperCase())] = summary;
    }
  }
  const runReasons = {}; for (const e of result.errors ?? []) add(runReasons, safe(typeof e === 'string' ? e : e?.reason));
  return {schema: 'F568_PRODUCTION_PRIVATE_SOURCE_REVIEW_V1', evidence_class: 'ACTUAL_CAPTURE_OFFLINE_REVIEW', file_sha256, file_bytes,
    implementation_sha256: expected_pin, raw_capture_complete: capture.raw_capture.complete === true, raw_capture_redacted: capture.raw_capture.redacted === true,
    capture_response_count: responses.length, offline_original_reads: 1, offline_catalog_source_calls: offlineCatalogRequests,
    catalog: {raw_rows: native.length, source_qualified_crypto: catalog.instruments.length, source_unqualified_count: catalog.unqualified.length,
      source_unqualified_reason_counts: reasons, current_raw_status_counts: statuses, current_disposition_counts: dispositions,
      active_USDT_identity_unresolved_count: currentUnresolved.length, unresolved_current_tuple_splits: unresolvedSplits,
      unresolved_current_tuple_hashes_and_reasons: currentUnresolved, additional_active_crypto_confirmed: 0,
      additional_active_crypto_classification_status: currentUnresolved.length ? 'UNKNOWN_NOT_INFERRED_FROM_STATUS_OR_NAME' : 'NO_UNRESOLVED_ACTIVE_USDT_TUPLE',
      runner_unresolved_reason_current_dispositions: unresolvedReasonDisposition, duplicate_native_symbol_groups: duplicateGroups,
      selected_scope_denominator: 550, current_exact_online_selected_members: perScope.filter(r => r.current_membership_status === 'CURRENT_EXACT_ONLINE_MEMBER').length,
      catalog_clock_evidence_sha256: sha256(stableCapturedJSON([received, catalogs[0].response.receipt_id])),
      original_runner_catalog_counts_match: result.catalog_coverage?.total === native.length && result.catalog_coverage?.verified_crypto_count === catalog.instruments.length},
    prices: {denominator: 550, captured_price_or_ticker_packets: pricePackets, captured_bulk_ticker_packets: bulkPackets,
      at_original_receive_counts: priceCounts, at_offline_review_counts: currentPriceCounts, packet_error_counts: responseErrors,
      all550_prices_does_not_mean_all550_CORE: true, prices_or_raw_source_times_exported: false},
    selected_source_CORE: selectedReview, run_status: safe(result.status), run_error_reason_counts: runReasons,
    scope_rows_hash_status_reasons_only: perScope, all550_CORE_proven: false, future_map_coverage_proven: false,
    new_provider_HTTP_SQL_Telegram_deploy: 0, raw_or_prices_exported: false};
}
