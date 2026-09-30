// Bind an already verified, closed 15m trajectory window to the same deep
// check's snapshot. The unwindowed raw sample remains diagnostic. This is a
// coverage receipt, not a second directional vote or a claim about 24h.
const MINUTE = 60_000;
const SOURCE = 'HTX official public API';
const MARKET = 'HTX USDT-M Futures';
const finite = value => typeof value === 'number' && Number.isFinite(value);
const count = value => Number.isSafeInteger(value) && value >= 0;

export function bindVerifiedFuturesFlow(snapshot, trajectory, now) {
  if (!snapshot || !trajectory || !finite(now)) return snapshot;
  if (snapshot.source !== SOURCE || trajectory.source !== SOURCE ||
      snapshot.market !== MARKET || trajectory.market !== MARKET ||
      !snapshot.contract || snapshot.contract !== trajectory.contract ||
      snapshot.contract_info?.contract_code !== snapshot.contract ||
      trajectory.contract_info?.contract_code !== snapshot.contract) return snapshot;
  const size = snapshot.contract_info?.contract_size;
  if (!finite(size) || size <= 0 || trajectory.contract_info?.contract_size !== size) return snapshot;
  if (![snapshot.timestamp, trajectory.timestamp].every(ts =>
    finite(ts) && ts <= now && now - ts <= 120_000)) return snapshot;

  const window = trajectory.windows?.['15m'];
  const flow = window?.order_flow;
  const price = window?.price;
  const start = flow?.window_start_ts, end = flow?.window_end_ts;
  if (trajectory.coverage?.flow_15m !== 'closed' || window?.label !== '15m' ||
      !finite(start) || !finite(end) || start % MINUTE !== 0 || end % MINUTE !== 0 ||
      end - start !== 15 * MINUTE || end > now || now - end > 120_000 ||
      window.synchronized_window_start_ts !== start || window.synchronized_window_end_ts !== end ||
      price?.window_start_ts !== start || price?.window_end_ts !== end ||
      price?.usable !== true || price?.exact_1m_bars !== true || price?.trade_count_complete !== true ||
      price?.expected_1m_bars !== 15 || price?.received_1m_bars !== 15) return snapshot;

  const quality = flow?.cvd_delta_quality;
  const factual = quality?.factual_coverage;
  const integrity = quality?.record_integrity;
  const total = flow?.sample_trades;
  if (flow?.usable !== true || flow?.cvd_delta_usable !== true || flow?.cvd_delta_reliable !== true ||
      flow?.raw_delta_is_diagnostic_only !== false ||
      quality?.status !== 'COMPLETE' || quality?.reliable !== true ||
      quality?.trade_count_exact_match !== true || quality?.raw_record_integrity_complete !== true ||
      integrity?.status !== 'COMPLETE' || integrity?.complete !== true ||
      integrity?.source_truncated !== false ||
      ['missing_trade_id_count', 'duplicate_trade_id_count', 'invalid_payload_count', 'source_rows_dropped']
        .some(key => integrity[key] !== 0) ||
      factual?.status !== 'COMPLETE' || factual?.exact_1m_bars !== true ||
      factual?.trade_count_fields_complete !== true ||
      factual?.expected_1m_bars !== 15 || factual?.received_1m_bars !== 15 ||
      !count(total) || total <= 0 ||
      [quality.raw_trade_count, quality.factual_1m_trade_count, factual.factual_1m_trade_count,
       integrity.raw_records, integrity.unique_trade_ids, price.trade_count].some(value => value !== total)) return snapshot;

  const binding = {
    schema: 'VERIFIED_HTX_FUTURES_FLOW_BINDING_V1', contract: snapshot.contract,
    window: '15m', window_start_ts: start, window_end_ts: end,
    raw_trade_count: total, factual_1m_trade_count: total,
    source: SOURCE, market: MARKET, available_ts: now,
    basis: 'EXISTING_TRAJECTORY_EXACT_FACTUAL_COUNT_AND_UNIQUE_PAYLOAD',
    full_24h_coverage_claimed: false, additional_http_requests: 0, additional_directional_votes: 0,
  };
  return {
    ...snapshot,
    coverage: { ...snapshot.coverage, htx_futures_order_flow: 'closed' },
    verified_order_flow: { binding, order_flow: flow },
  };
}
