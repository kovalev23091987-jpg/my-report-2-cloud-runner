import { digest } from './upstream-proof-utils.mjs';

/**
 * Reimplemented from the verified R1 base. Not the missing earlier candidate.
 * Only the existing 5m price/verified-aggressor confirmation is forwarded.
 * One PRICE_ACTION domain is NOT a complete direction/entry decision.
 * No funding/OI votes, absorption promotion, new thresholds, IO or trade calls.
 */
export const TZ101_PRODUCER_VERSION = 'tz101-price-flow-relative-producer-r4.0';
export const TZ101_PRICE_FLOW_PROFILE = Object.freeze({
  id: 'existing-htx-price-flow-confirmation-5m', window: '5m', window_ms: 300_000,
  max_age_ms: 300_000, causal_domain: 'PRICE_ACTION',
});
export const TZ101_RELATIVE_STRENGTH_PROFILE = Object.freeze({
  id: 'okx-spot-rs-btc-eth-1h-strict-fresh', window: '1h',
  min_abs_pp: 0.75, max_age_ms: 300_000, causal_domain: 'RELATIVE_MARKET',
});
const obj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const finite = v => typeof v === 'number' && Number.isFinite(v);
const ts = v => Number.isSafeInteger(v) && v >= 1_000_000_000_000;
const id = (v, max = 256) => typeof v === 'string' && v.length > 0 && v.length <= max && v === v.trim() && !/[\u0000-\u0020\u007f]/u.test(v);
const near = (a, b) => finite(a) && finite(b) && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

function reject(reason, check = 'UNKNOWN', facts = null) {
  return { version: TZ101_PRODUCER_VERSION, status: 'NO_USABLE_EVIDENCE', check,
    reasons: [reason], rows: [], facts, independent_domains: [], complete_direction: false,
    persistence: 'UNACKNOWLEDGED', profile_id: TZ101_PRICE_FLOW_PROFILE.id };
}
function receiptValid(proof, now) {
  if (!obj(proof) || !obj(proof.persistence)) return false;
  const p = proof.persistence;
  if (p.status !== 'CLOSED' || p.immutable !== true || p.verification_method !== 'D1_IMMUTABLE_RECEIPT' || !id(p.receipt_id) || !ts(p.committed_ts) || p.committed_ts > now) return false;
  const material = { ...proof }; delete material.persistence;
  return p.content_digest === digest(material);
}
function rawEnvelopeDigest(row) {
  // Existing engine's scalar envelope contract. This is NOT a provider signature.
  return digest([row.contract_code, row.snapshot_id, row.source, row.venue, row.metric,
    row.source_ts, row.available_ts, row.valid_until_ts, row.max_age_ms, row.value,
    row.unit, row.episode_id, row.episode_revision]);
}

function prepareRelativeStrengthEvidence({ contract, snapshot, now, available, opportunity, publicEvidence } = {}) {
  if (!obj(publicEvidence) || publicEvidence.contract_code !== contract || !Array.isArray(publicEvidence.evidence)) {
    return { row:null, status:'MISSING', reason:'RELATIVE_STRENGTH_PUBLIC_EVIDENCE_MISSING', facts:null };
  }
  if (!ts(available) || available > now) {
    return { row:null, status:'UNKNOWN', reason:'RELATIVE_STRENGTH_AVAILABILITY_NOT_PROVEN', facts:null };
  }
  const e = opportunity?.newest_event;
  if (!obj(e) || !ts(e.direction_locked_ts) || available < e.direction_locked_ts) {
    return { row:null, status:'UNKNOWN', reason:'RELATIVE_STRENGTH_NOT_AVAILABLE_AFTER_DIRECTION_LOCK', facts:null };
  }
  const pick = metric => publicEvidence.evidence.find(row =>
    row?.chain === 'MARKET_STRENGTH_SPOT' && row?.venue === 'OKX' && row?.market_type === 'SPOT' &&
    row?.metric === metric && row?.window === TZ101_RELATIVE_STRENGTH_PROFILE.window
  ) || null;
  const btc = pick('rs_vs_btc_1h'), eth = pick('rs_vs_eth_1h');
  const valid = row => obj(row) && row.contract_code === contract && row.source === 'OKX Spot Public V5' &&
    row.status === 'CLOSED' && row.venue_observation_status === 'CLOSED' && row.eligible_for_chain_closure === true &&
    row.alias_required === true && row.alias_verified === true && row.asset_identity_verified === true &&
    row.source_compatible === true && !row.error && finite(row.value) && row.unit === 'percentage_points' &&
    ts(row.source_ts) && row.source_ts <= available && row.source_ts <= now;
  if (!valid(btc) || !valid(eth)) {
    return { row:null, status:'UNKNOWN', reason:'RELATIVE_STRENGTH_REQUIRED_ROWS_NOT_CLOSED', facts:null };
  }
  const sourceTs = Math.max(btc.source_ts, eth.source_ts);
  if (now - sourceTs > TZ101_RELATIVE_STRENGTH_PROFILE.max_age_ms) {
    return { row:null, status:'STALE', reason:'RELATIVE_STRENGTH_STALE', facts:{btc_pp:btc.value,eth_pp:eth.value,source_ts:sourceTs} };
  }
  const min = TZ101_RELATIVE_STRENGTH_PROFILE.min_abs_pp;
  const stance = btc.value >= min && eth.value >= min ? 'LONG' : btc.value <= -min && eth.value <= -min ? 'SHORT' : null;
  const facts = {
    schema:'tz101-relative-strength-facts-r4.0', profile_id:TZ101_RELATIVE_STRENGTH_PROFILE.id,
    contract_code:contract, source:'OKX Spot Public V5', venue:'OKX', window:'1h',
    btc_pp:btc.value, eth_pp:eth.value, btc_source_ts:btc.source_ts, eth_source_ts:eth.source_ts,
    source_ts:sourceTs, available_ts:available, direction_locked_ts:e.direction_locked_ts,
    asset_identity_verified:true,
  };
  if (!stance) return { row:null, status:'REFUTED', reason:'RELATIVE_STRENGTH_NOT_DIRECTIONALLY_CONFIRMED', facts };
  if (stance !== e.direction_at_event) return { row:null, status:'REFUTED', reason:'RELATIVE_STRENGTH_OPPOSES_LOCKED_SCENARIO', facts };
  const sourceKey = [contract,'OKX','SPOT','1h',btc.source_ts,eth.source_ts,btc.value,eth.value,'RS_VS_BTC_ETH'];
  const row = {
    evidence_id:`RS:${digest([sourceKey,e.episode_id,e.episode_revision])}`,
    snapshot_id:snapshot, contract_code:contract, causal_family:'RELATIVE_STRENGTH',
    metric_semantics:'RS_VS_BTC_ETH', correlation_group:`OKX-RS:${digest([contract,e.episode_id,'1h'])}`,
    episode_id:e.episode_id, episode_revision:e.episode_revision,
    source:'OKX_SPOT_PUBLIC_V5', venue:'OKX', metric:'rs_vs_btc_eth_1h_strict_fresh',
    source_observation_id:`RAWRS:${digest(sourceKey)}`, source_payload_digest:null, registry_receipt_id:null,
    value:stance === 'LONG' ? 1 : -1, unit:'direction_state', status:'CLOSED', stance, effect:'SUPPORT',
    source_ts:sourceTs, available_ts:available, max_age_ms:TZ101_RELATIVE_STRENGTH_PROFILE.max_age_ms,
    valid_until_ts:sourceTs + TZ101_RELATIVE_STRENGTH_PROFILE.max_age_ms,
    eligible_for_decision:true, symbol_verified:true, source_compatible:true, fact_complete:true,
    independence_basis:'STRUCTURAL_RULE_V1',
    producer_rules_version:'decision-evidence-producer-v1', derivation_rules_version:'decision-evidence-derivation-v1',
    fact_ids:[`FACTRSBTC:${digest([contract,btc.source_ts,btc.value])}`,`FACTRSETH:${digest([contract,eth.source_ts,eth.value])}`],
    lineage_derivation_id:`RSD:${digest(sourceKey)}`,
  };
  row.source_payload_digest = rawEnvelopeDigest(row);
  return { row, status:'CONFIRMED', reason:null, facts };
}
function core({ contract_code: contract, snapshot_id: snapshot, observed_ts: now,
  trajectory, available_ts: available, opportunity_proof: opportunity,
  public_evidence: publicEvidence = null, public_evidence_available_ts: publicEvidenceAvailable = null } = {}) {
  if (!id(contract) || !id(snapshot) || !ts(now)) return reject('IDENTITY_OR_OBSERVATION_TIME_INVALID');
  if (!ts(available) || available > now) return reject('SOURCE_AVAILABILITY_NOT_PROVEN');
  if (!receiptValid(opportunity, now) || opportunity.contract !== contract || opportunity.snapshot_id !== snapshot || opportunity.observed_ts !== now) return reject('OPPORTUNITY_RECEIPT_NOT_CLOSED');
  const e = opportunity.newest_event;
  if (!obj(e) || e.contract !== contract || !id(e.episode_id) || !Number.isSafeInteger(e.episode_revision) || e.episode_revision < 1 || !id(e.event_id)) return reject('EPISODE_IDENTITY_INVALID');
  if (e.control_group !== false || e.control_group_membership_verified !== true || e.admission_eligible !== true || e.independent_sample !== true) return reject('ADMISSION_NOT_PROVEN');
  if (!['LONG','SHORT'].includes(e.direction_at_event) || e.directional_evaluation_eligible !== true ||
      e.direction_source !== 'OPPORTUNITY_PRECOMMITTED_DIRECTION_V1' ||
      !ts(e.direction_locked_ts) || e.direction_locked_ts !== e.event_close_ts ||
      e.direction_available_ts !== e.direction_locked_ts || e.direction_locked_ts > now) return reject('DIRECTION_NOT_PRECOMMITTED');
  const dr = opportunity.direction_receipt, cr = opportunity.control_group_receipt;
  if (!obj(dr) || !obj(cr) || dr.status !== 'CLOSED' || cr.status !== 'CLOSED' || dr.authoritative !== true || cr.authoritative !== true ||
      dr.event_id !== e.event_id || cr.event_id !== e.event_id || dr.episode_id !== e.episode_id || cr.episode_id !== e.episode_id ||
      dr.episode_revision !== e.episode_revision || cr.episode_revision !== e.episode_revision ||
      dr.direction !== e.direction_at_event || dr.direction_locked_ts !== e.direction_locked_ts ||
      dr.raw_event_digest !== e.raw_event_digest || cr.raw_event_digest !== e.raw_event_digest || cr.control_group !== false ||
      dr.persistence?.immutable !== true || cr.persistence?.immutable !== true ||
      dr.persistence?.status !== 'CLOSED' || cr.persistence?.status !== 'CLOSED' ||
      !ts(dr.persistence?.committed_ts) || !ts(cr.persistence?.committed_ts) ||
      dr.persistence.committed_ts > now || cr.persistence.committed_ts > now) return reject('ADMISSION_SUBRECEIPT_MISMATCH');
  const d = trajectory;
  if (!obj(d) || d.contract !== contract || d.market !== 'HTX USDT-M Futures' || d.tool !== 'htx_futures_trajectory' ||
      d.source !== 'HTX official public API' || d.contract_info?.contract_code !== contract ||
      ![1,'1'].includes(d.contract_info?.contract_status) || !finite(d.contract_info?.contract_size) || d.contract_info.contract_size <= 0) return reject('HTX_INSTRUMENT_NOT_VERIFIED');
  const w = d.windows?.[TZ101_PRICE_FLOW_PROFILE.window], p = w?.price, f = w?.order_flow;
  if (!obj(w) || !obj(p) || !obj(f)) return reject('PLANNED_WINDOW_MISSING');
  const start = w.synchronized_window_start_ts, end = w.synchronized_window_end_ts;
  if (!ts(start) || !ts(end) || end - start !== TZ101_PRICE_FLOW_PROFILE.window_ms || start % 60_000 !== 0 || end % 60_000 !== 0 ||
      p.window_start_ts !== start || f.window_start_ts !== start || p.window_end_ts !== end || f.window_end_ts !== end) return reject('WINDOW_BOUNDARIES_MISMATCH');
  // Must be a subsequent, completely observed confirmation, not a relabelled
  // portion of the observation that initially selected the episode's direction.
  if (start < e.direction_locked_ts) return reject('WINDOW_PRECEDES_DIRECTION_LOCK');
  if (end > available || end > now || now - end > TZ101_PRICE_FLOW_PROFILE.max_age_ms) return reject('WINDOW_STALE_OR_FUTURE');
  if (p.usable !== true || p.exact_1m_bars !== true || p.trade_count_complete !== true || p.expected_1m_bars !== 5 || p.received_1m_bars !== 5 ||
      !Number.isSafeInteger(p.trade_count) || p.trade_count <= 0) return reject('PRICE_WINDOW_NOT_COMPLETE');
  if (![p.open,p.high,p.low,p.close,p.change_pct].every(finite) || p.open <= 0 || p.close <= 0 || p.low <= 0 || p.high < Math.max(p.open,p.close) || p.low > Math.min(p.open,p.close) ||
      !near(p.change_pct, (p.close / p.open - 1) * 100)) return reject('PRICE_VALUES_INCONSISTENT');
  const q = f.cvd_delta_quality, fc = q?.factual_coverage, ri = q?.record_integrity;
  if (f.usable !== true || f.cvd_delta_reliable !== true || f.cvd_delta_usable !== true ||
      q?.status !== 'COMPLETE' || q?.reliable !== true || q?.trade_count_exact_match !== true ||
      q?.raw_record_integrity_complete !== true || ri?.complete !== true || ri?.status !== 'COMPLETE' ||
      ri?.raw_records !== p.trade_count || ri?.unique_trade_ids !== p.trade_count ||
      ri?.missing_trade_id_count !== 0 || ri?.duplicate_trade_id_count !== 0 || ri?.invalid_payload_count !== 0 ||
      ri?.source_truncated !== false || ri?.source_rows_dropped !== 0 || q?.completeness_ratio !== 1 ||
      fc?.status !== 'COMPLETE' || fc?.exact_1m_bars !== true || fc?.trade_count_fields_complete !== true ||
      fc?.expected_1m_bars !== 5 || fc?.received_1m_bars !== 5 ||
      q?.raw_trade_count !== p.trade_count || q?.factual_1m_trade_count !== p.trade_count ||
      fc?.factual_1m_trade_count !== p.trade_count || f.sample_trades !== p.trade_count) return reject('CVD_INTEGRITY_NOT_COMPLETE');
  const buy = f.taker_buy_usdt, sell = f.taker_sell_usdt;
  if (![buy,sell,f.delta_usdt,f.total_turnover_usdt,f.delta_pct_of_turnover].every(finite) || buy < 0 || sell < 0 || buy + sell <= 0 ||
      !near(f.delta_usdt, buy - sell) || !near(f.total_turnover_usdt, buy + sell) ||
      !near(f.delta_pct_of_turnover, (buy - sell) / (buy + sell) * 100)) return reject('FLOW_VALUES_INCONSISTENT');
  const facts = {
    schema: 'tz101-price-flow-facts-r2.1', contract_code: contract, market: d.market,
    profile_id: TZ101_PRICE_FLOW_PROFILE.id, window_start_ts: start, window_end_ts: end,
    available_ts: available, availability_semantics: 'LOCAL_COMPONENTS_COMPLETED_NOT_SOURCE_TIME',
    price: { open:p.open, high:p.high, low:p.low, close:p.close, change_pct:p.change_pct,
      expected_1m_bars:p.expected_1m_bars, received_1m_bars:p.received_1m_bars, trade_count:p.trade_count },
    flow: { taker_buy_usdt:buy, taker_sell_usdt:sell, delta_usdt:f.delta_usdt,
      total_turnover_usdt:f.total_turnover_usdt, raw_trade_count:q.raw_trade_count,
      factual_1m_trade_count:q.factual_1m_trade_count, cvd_delta_quality:structuredClone(q) },
    episode_id:e.episode_id, episode_revision:e.episode_revision, direction_at_event:e.direction_at_event,
    direction_locked_ts:e.direction_locked_ts, admission_receipt_id:opportunity.persistence.receipt_id,
  };
  const stance = f.delta_usdt > 0 && p.change_pct > 0 ? 'LONG' : f.delta_usdt < 0 && p.change_pct < 0 ? 'SHORT' : null;
  if (!stance) return reject('NO_EXISTING_PRICE_FLOW_CONFIRMATION', 'REFUTED', facts);
  const alignment = stance === 'LONG' ? 'buying_confirms_price_up' : 'selling_confirms_price_down';
  if (w.derived?.price_flow_alignment !== alignment) return reject('DETECTOR_RESULT_MISMATCH', 'UNKNOWN', facts);
  // A contrary fact is reported as contrary to the locked scenario; it is not
  // silently reassigned to a new profitable-looking scenario.
  if (stance !== e.direction_at_event) return reject('CONFIRMATION_OPPOSES_LOCKED_SCENARIO', 'REFUTED', facts);
  const sourceKey = [contract, 'HTX', 'USDT_M_PERPETUAL', start, end, 'PRICE_AND_AGGRESSOR_FLOW'];
  const rawId = `RAWPF:${digest(sourceKey)}`;
  const row = {
    evidence_id:`PF:${digest([sourceKey,e.episode_id,e.episode_revision])}`,
    snapshot_id:snapshot, contract_code:contract, causal_family:'PRICE_RESPONSE',
    metric_semantics:'DIRECTIONAL_PRICE_RESPONSE', correlation_group:`HTX-PF:${digest([contract,e.episode_id])}`,
    episode_id:e.episode_id, episode_revision:e.episode_revision,
    source:'HTX_OFFICIAL', venue:'HTX', metric:'price_response_after_verified_aggressor_flow_5m',
    source_observation_id:rawId, source_payload_digest:null,
    registry_receipt_id:null, // Only the existing registry builder assigns it.
    value:stance === 'LONG' ? 1 : -1, unit:'direction_state', status:'CLOSED', stance, effect:'SUPPORT',
    source_ts:end, available_ts:available, max_age_ms:TZ101_PRICE_FLOW_PROFILE.max_age_ms,
    valid_until_ts:end + TZ101_PRICE_FLOW_PROFILE.max_age_ms,
    eligible_for_decision:true, symbol_verified:true, source_compatible:true, fact_complete:true,
    independence_basis:'STRUCTURAL_RULE_V1',
    producer_rules_version:'decision-evidence-producer-v1', derivation_rules_version:'decision-evidence-derivation-v1',
    fact_ids:[`FACTPF:${digest(sourceKey)}`], lineage_derivation_id:`PFD:${digest(sourceKey)}`,
  };
  row.source_payload_digest = rawEnvelopeDigest(row);
  const relative = prepareRelativeStrengthEvidence({
    contract, snapshot, now, available:publicEvidenceAvailable, opportunity, publicEvidence,
  });
  const rows = relative.row ? [row, relative.row] : [row];
  const domains = relative.row ? ['PRICE_ACTION','RELATIVE_MARKET'] : ['PRICE_ACTION'];
  return { version:TZ101_PRODUCER_VERSION, status:'PREPARED_UNACKNOWLEDGED', check:'CONFIRMED',
    reasons:[], rows, facts:{price_flow:facts,relative_strength:relative.facts},
    independent_domains:domains, complete_direction:rows.length >= 2,
    secondary_evidence:{status:relative.status,reason:relative.reason,profile_id:TZ101_RELATIVE_STRENGTH_PROFILE.id},
    persistence:'UNACKNOWLEDGED', profile_id:TZ101_PRICE_FLOW_PROFILE.id };
}
export function prepareTz101DecisionEvidence(input = {}) {
  try { return core(input); }
  catch { return reject('MALFORMED_PRODUCER_INPUT'); }
}
