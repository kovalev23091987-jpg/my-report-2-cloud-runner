const OUTCOME_RULES_VERSION = "shadow-outcome-v1";

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function round4(value) {
  return Number.isFinite(value) ? Math.round(value * 10000) / 10000 : null;
}

function upper(value) {
  return String(value ?? "").trim().toUpperCase();
}

function latestAtOrBefore(points, targetTs, toleranceMs) {
  let best = null;
  for (const point of points) {
    const ts = finite(point?.ts);
    const price = finite(point?.price);
    if (ts === null || price === null || price <= 0) continue;
    if (ts > targetTs) continue;
    if (targetTs - ts > toleranceMs) continue;
    if (!best || ts > best.ts) best = { ts, price, distance_ms: targetTs - ts };
  }
  return best;
}

function earliestAtOrAfter(points, targetTs, toleranceMs) {
  let best = null;
  for (const point of points) {
    const ts = finite(point?.ts);
    const price = finite(point?.price);
    if (ts === null || price === null || price <= 0) continue;
    if (ts < targetTs) continue;
    if (ts - targetTs > toleranceMs) continue;
    if (!best || ts < best.ts) best = { ts, price, distance_ms: ts - targetTs };
  }
  return best;
}

function pctFrom(referencePrice, price) {
  const a = finite(referencePrice);
  const b = finite(price);
  if (a === null || b === null || a <= 0) return null;
  return ((b / a) - 1) * 100;
}

export function buildShadowOutcomeRecord({
  candidate,
  horizon_hours,
  points,
  computed_ts = Date.now(),
  reference_tolerance_ms = 7.5 * 60 * 1000,
  target_tolerance_ms = 7.5 * 60 * 1000,
  expected_interval_ms = 5 * 60 * 1000,
} = {}) {
  const shadowId = String(candidate?.shadow_id || "").trim();
  const contract = String(candidate?.contract_code || candidate?.contract || "").trim();
  const observedTs = finite(candidate?.observed_ts);
  const direction = upper(candidate?.direction_hint);
  const horizonHours = finite(horizon_hours);
  const computedTs = finite(computed_ts) ?? Date.now();
  const safePoints = Array.isArray(points)
    ? points
        .map((p) => ({ ts: finite(p?.ts), price: finite(p?.price) }))
        .filter((p) => p.ts !== null && p.price !== null && p.price > 0)
        .sort((a, b) => a.ts - b.ts)
    : [];

  const base = {
    outcome_rules_version: OUTCOME_RULES_VERSION,
    shadow_id: shadowId || null,
    contract,
    observed_ts: observedTs,
    rules_version: String(candidate?.rules_version || "").slice(0, 120) || null,
    direction_hint: direction || null,
    dc_shadow_long: finite(candidate?.dc_long ?? candidate?.dc_shadow_long),
    dc_shadow_short: finite(candidate?.dc_short ?? candidate?.dc_shadow_short),
    eq_status: String(candidate?.eq_status || "").slice(0, 80) || null,
    dq_status: String(candidate?.dq_status || "").slice(0, 80) || null,
    stage: String(candidate?.stage || "").slice(0, 100) || null,
    horizon_hours: horizonHours,
    target_ts:
      observedTs !== null && horizonHours !== null
        ? observedTs + horizonHours * 60 * 60 * 1000
        : null,
    source: "STAGE0_COMPACT_FACTUAL_5M_SNAPSHOTS",
    reference_selection: "LATEST_AT_OR_BEFORE_SIGNAL",
    target_selection: "EARLIEST_AT_OR_AFTER_HORIZON",
    interpolation_used: false,
    calibration_only: true,
    live_promotion_allowed: false,
    automatic_weight_tuning_enabled: false,
    computed_ts: computedTs,
  };

  if (!shadowId || !contract || observedTs === null || horizonHours === null || horizonHours <= 0) {
    return {
      ...base,
      status: "INVALID_INPUT",
      reason: "shadow_id, contract, observed_ts and positive horizon_hours are required",
    };
  }

  if (direction !== "LONG" && direction !== "SHORT") {
    return {
      ...base,
      status: "SKIPPED_NON_DIRECTIONAL",
      reason: "Only LONG/SHORT shadow hints receive directional outcome calibration",
    };
  }

  const targetTs = base.target_ts;
  const reference = latestAtOrBefore(safePoints, observedTs, reference_tolerance_ms);
  const outcome = earliestAtOrAfter(safePoints, targetTs, target_tolerance_ms);

  if (!reference || !outcome) {
    return {
      ...base,
      status: "INSUFFICIENT_FACTUAL_HISTORY",
      reason: !reference && !outcome
        ? "reference_and_target_snapshots_missing"
        : !reference
          ? "reference_snapshot_missing"
          : "target_snapshot_missing",
      reference_scan_ts: reference?.ts ?? null,
      reference_price: reference?.price ?? null,
      reference_offset_sec: reference ? round4((reference.ts - observedTs) / 1000) : null,
      outcome_scan_ts: outcome?.ts ?? null,
      outcome_price: outcome?.price ?? null,
      target_offset_sec: outcome ? round4((outcome.ts - targetTs) / 1000) : null,
      path_points: 0,
      expected_points: null,
      path_coverage_pct: null,
      raw_return_pct: null,
      directional_return_pct: null,
      mfe_directional_pct_snapshot: null,
      mae_directional_pct_snapshot: null,
      direction_correct: null,
    };
  }

  const startTs = Math.min(reference.ts, outcome.ts);
  const endTs = Math.max(reference.ts, outcome.ts);
  const path = safePoints.filter((p) => p.ts >= startTs && p.ts <= endTs);
  const expectedPoints = Math.max(1, Math.floor((endTs - startTs) / expected_interval_ms) + 1);
  const coveragePct = Math.min(100, (path.length / expectedPoints) * 100);
  const factor = direction === "LONG" ? 1 : -1;
  const directionalPath = path
    .map((p) => pctFrom(reference.price, p.price))
    .filter((v) => v !== null)
    .map((v) => v * factor);
  const rawReturn = pctFrom(reference.price, outcome.price);
  const directionalReturn = rawReturn === null ? null : rawReturn * factor;

  const mfe = directionalPath.length ? Math.max(...directionalPath) : null;
  const mae = directionalPath.length ? Math.min(...directionalPath) : null;

  return {
    ...base,
    status: "CLOSED_FACTUAL",
    reason: null,
    reference_scan_ts: reference.ts,
    reference_price: round4(reference.price),
    reference_offset_sec: round4((reference.ts - observedTs) / 1000),
    outcome_scan_ts: outcome.ts,
    outcome_price: round4(outcome.price),
    target_offset_sec: round4((outcome.ts - targetTs) / 1000),
    path_points: path.length,
    expected_points: expectedPoints,
    path_coverage_pct: round4(coveragePct),
    raw_return_pct: round4(rawReturn),
    directional_return_pct: round4(directionalReturn),
    mfe_directional_pct_snapshot: round4(mfe),
    mae_directional_pct_snapshot: round4(mae),
    direction_correct:
      directionalReturn === null || directionalReturn === 0
        ? null
        : directionalReturn > 0,
    quality_note:
      "MFE/MAE are extrema of factual persisted ~5m Stage-0 snapshots, not intrabar candle highs/lows. Missing scans remain missing; no interpolation is used.",
  };
}

export const SHADOW_OUTCOME_RULES_VERSION = OUTCOME_RULES_VERSION;
