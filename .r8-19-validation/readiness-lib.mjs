export const ENTRY_AREA_MIN_TRAIN = 80;
export const ENTRY_AREA_MIN_HOLDOUT = 40;
export const ENTRY_AREA_REQUIRED = ENTRY_AREA_MIN_TRAIN + ENTRY_AREA_MIN_HOLDOUT;

export function finiteNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function wilson95(successes, total) {
  const n = Number(total);
  const x = Number(successes);
  if (!Number.isInteger(n) || n <= 0 || !Number.isInteger(x) || x < 0 || x > n) return null;
  const z = 1.959963984540054;
  const p = x / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p) / n) + z2 / (4 * n * n))) / denom;
  return {
    p: Number(p.toFixed(6)),
    lower: Number(Math.max(0, center - half).toFixed(6)),
    upper: Number(Math.min(1, center + half).toFixed(6)),
  };
}

export function entryAreaReadiness(rows, { minTrain = ENTRY_AREA_MIN_TRAIN, minHoldout = ENTRY_AREA_MIN_HOLDOUT } = {}) {
  const input = Array.isArray(rows) ? rows : [];
  const seen = new Set();
  const valid = [];
  for (const row of input) {
    const id = String(row?.sample_id || "");
    const observed = Number(row?.observed_ts);
    const outcomeTs = Number(row?.outcome_scan_ts);
    if (!id || !Number.isFinite(observed) || !Number.isFinite(outcomeTs) || outcomeTs <= observed) continue;
    if (seen.has(id)) return { status: "NOT_VALIDATED_DUPLICATE_SAMPLE", reason: "DUPLICATE_SAMPLE", closed_samples: valid.length };
    seen.add(id);
    valid.push({ id, observed_ts: observed, outcome_scan_ts: outcomeTs });
  }
  valid.sort((a, b) => a.observed_ts - b.observed_ts);
  const required = minTrain + minHoldout;
  if (valid.length < required) {
    return {
      status: "NOT_VALIDATED_INSUFFICIENT_PROSPECTIVE_SAMPLE",
      reason: "INSUFFICIENT_PROSPECTIVE_SAMPLE",
      closed_samples: valid.length,
      required_samples: required,
      min_train: minTrain,
      min_holdout: minHoldout,
    };
  }
  const split = valid.length - minHoldout;
  const train = valid.slice(0, split);
  const holdout = valid.slice(split);
  if (!(train.at(-1).observed_ts < holdout[0].observed_ts)) {
    return {
      status: "NOT_VALIDATED_CHRONOLOGICAL_SPLIT_INVALID",
      reason: "CHRONOLOGICAL_OOS_SPLIT_INVALID",
      closed_samples: valid.length,
    };
  }
  return {
    status: "CALIBRATION_DATA_READY_NOT_VALIDATED",
    reason: null,
    closed_samples: valid.length,
    train_samples: train.length,
    holdout_samples: holdout.length,
    train_max_observed_ts: train.at(-1).observed_ts,
    holdout_min_observed_ts: holdout[0].observed_ts,
    validated_out_of_sample: false,
  };
}

export function pct(v) {
  const n = finiteNumber(v);
  return n === null ? null : Number((n * 100).toFixed(3));
}
