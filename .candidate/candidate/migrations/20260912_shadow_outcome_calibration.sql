CREATE TABLE IF NOT EXISTS shadow_calibration_signal (
  shadow_id TEXT PRIMARY KEY,
  contract_code TEXT NOT NULL,
  observed_ts INTEGER NOT NULL,
  rules_version TEXT NOT NULL,
  source TEXT NOT NULL,
  mode TEXT NOT NULL,
  direction_hint TEXT NOT NULL CHECK (direction_hint IN ('LONG','SHORT')),
  dc_long REAL,
  dc_short REAL,
  eq_status TEXT,
  dq_status TEXT,
  stage TEXT,
  data_sufficiency TEXT,
  missing_chains_json TEXT NOT NULL DEFAULT '[]',
  evidence_flags_json TEXT NOT NULL DEFAULT '{}',
  calibration_only INTEGER NOT NULL DEFAULT 1 CHECK (calibration_only = 1),
  live_promotion_allowed INTEGER NOT NULL DEFAULT 0 CHECK (live_promotion_allowed = 0),
  archived_ts INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shadow_calibration_signal_observed
  ON shadow_calibration_signal(observed_ts DESC);

CREATE INDEX IF NOT EXISTS idx_shadow_calibration_signal_contract_ts
  ON shadow_calibration_signal(contract_code, observed_ts DESC);

CREATE TABLE IF NOT EXISTS shadow_outcome_log (
  shadow_id TEXT NOT NULL,
  contract_code TEXT NOT NULL,
  observed_ts INTEGER NOT NULL,
  rules_version TEXT,
  outcome_rules_version TEXT NOT NULL,
  direction_hint TEXT NOT NULL CHECK (direction_hint IN ('LONG','SHORT')),
  dc_long REAL,
  dc_short REAL,
  eq_status TEXT,
  dq_status TEXT,
  stage TEXT,
  horizon_hours INTEGER NOT NULL CHECK (horizon_hours IN (1,4,12,24)),
  target_ts INTEGER NOT NULL,
  reference_selection TEXT NOT NULL DEFAULT 'LATEST_AT_OR_BEFORE_SIGNAL',
  target_selection TEXT NOT NULL DEFAULT 'EARLIEST_AT_OR_AFTER_HORIZON',
  reference_scan_ts INTEGER,
  reference_price REAL,
  reference_offset_sec REAL,
  outcome_scan_ts INTEGER,
  outcome_price REAL,
  target_offset_sec REAL,
  raw_return_pct REAL,
  directional_return_pct REAL,
  mfe_directional_pct_snapshot REAL,
  mae_directional_pct_snapshot REAL,
  direction_correct INTEGER CHECK (direction_correct IS NULL OR direction_correct IN (0,1)),
  path_points INTEGER NOT NULL DEFAULT 0,
  expected_points INTEGER,
  path_coverage_pct REAL,
  status TEXT NOT NULL,
  reason TEXT,
  source TEXT NOT NULL DEFAULT 'STAGE0_COMPACT_FACTUAL_5M_SNAPSHOTS',
  interpolation_used INTEGER NOT NULL DEFAULT 0 CHECK (interpolation_used = 0),
  calibration_only INTEGER NOT NULL DEFAULT 1 CHECK (calibration_only = 1),
  live_promotion_allowed INTEGER NOT NULL DEFAULT 0 CHECK (live_promotion_allowed = 0),
  automatic_weight_tuning_enabled INTEGER NOT NULL DEFAULT 0 CHECK (automatic_weight_tuning_enabled = 0),
  computed_ts INTEGER NOT NULL,
  PRIMARY KEY (shadow_id, horizon_hours)
);

CREATE INDEX IF NOT EXISTS idx_shadow_outcome_observed_ts
  ON shadow_outcome_log(observed_ts DESC);

CREATE INDEX IF NOT EXISTS idx_shadow_outcome_contract_ts
  ON shadow_outcome_log(contract_code, observed_ts DESC);

CREATE INDEX IF NOT EXISTS idx_shadow_outcome_horizon_status
  ON shadow_outcome_log(horizon_hours, status, computed_ts DESC);

CREATE TABLE IF NOT EXISTS shadow_outcome_state (
  state_key TEXT PRIMARY KEY,
  last_sweep_ts INTEGER NOT NULL,
  source_signals_seen INTEGER NOT NULL DEFAULT 0,
  signals_archived INTEGER NOT NULL DEFAULT 0,
  candidates_seen INTEGER NOT NULL DEFAULT 0,
  tasks_due INTEGER NOT NULL DEFAULT 0,
  tasks_processed INTEGER NOT NULL DEFAULT 0,
  closed_written INTEGER NOT NULL DEFAULT 0,
  insufficient_written INTEGER NOT NULL DEFAULT 0,
  last_status TEXT NOT NULL,
  last_error TEXT
);
