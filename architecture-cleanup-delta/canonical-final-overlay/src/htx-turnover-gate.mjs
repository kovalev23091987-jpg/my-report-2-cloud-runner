export const HTX_TURNOVER_GATE_VERSION = 'htx-futures-turnover-gate-v1-20260924';
export const HTX_TURNOVER_MIN_USD = 100000;

const finite = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function evaluateHtxFuturesTurnoverGate(row, { minimum_usd = HTX_TURNOVER_MIN_USD } = {}) {
  const min = finite(minimum_usd);
  const contract = String(row?.contract_code || row?.contract || '').trim();
  const turnover = finite(row?.turnover_24h_usdt);
  const exact = row?.symbol_fingerprint?.resolution_status === 'RESOLVED_HTX_EXACT';
  const tradable = row?.quality?.market_present === true &&
    row?.instrument_scope?.classification === 'CRYPTO_CONFIRMED';
  const current = row?.freshness?.stale === false &&
    finite(row?.freshness?.market_age_sec) !== null &&
    finite(row?.freshness?.market_age_sec) <= 300;

  const base = {
    version: HTX_TURNOVER_GATE_VERSION,
    contract: contract || null,
    venue: 'HTX',
    market_type: 'FUTURES',
    metric: 'rolling_24h_monetary_turnover_usd_equivalent',
    minimum_usd: min,
    turnover_usd_equivalent: turnover,
    inclusive_boundary: true,
    external_turnover_can_substitute: false,
    htx_spot_required: false,
  };

  if (!(min !== null && min > 0)) return { ...base, status: 'NOT_CLOSED', allowed: false, reason: 'TURNOVER_THRESHOLD_INVALID' };
  if (!contract || !exact || !tradable) return { ...base, status: 'NOT_CLOSED', allowed: false, reason: 'HTX_FUTURES_IDENTITY_OR_TRADABLE_NOT_CLOSED' };
  if (!current) return { ...base, status: 'NOT_CLOSED', allowed: false, reason: 'HTX_FUTURES_24H_TURNOVER_STALE_OR_UNCONFIRMED' };
  if (turnover === null) return { ...base, status: 'NOT_CLOSED', allowed: false, reason: 'HTX_FUTURES_24H_TURNOVER_MISSING' };
  if (turnover < min) return { ...base, status: 'CLOSED', allowed: false, reason: 'HTX_FUTURES_24H_TURNOVER_BELOW_100K' };
  return { ...base, status: 'CLOSED', allowed: true, reason: 'HTX_FUTURES_24H_TURNOVER_GATE_PASS' };
}

export default { HTX_TURNOVER_GATE_VERSION, HTX_TURNOVER_MIN_USD, evaluateHtxFuturesTurnoverGate };
