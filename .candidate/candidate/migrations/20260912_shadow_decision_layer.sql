CREATE TABLE IF NOT EXISTS shadow_decision_log (
  shadow_id TEXT PRIMARY KEY,
  contract_code TEXT NOT NULL,
  observed_ts INTEGER NOT NULL,
  rules_version TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'DEEP_CHECK_INPUT',
  mode TEXT NOT NULL,
  direction_hint TEXT NOT NULL,
  dc_long REAL,
  dc_short REAL,
  eq_status TEXT NOT NULL,
  dq_status TEXT NOT NULL,
  stage TEXT NOT NULL,
  data_sufficiency TEXT,
  missing_chains_json TEXT NOT NULL DEFAULT '[]',
  evidence_flags_json TEXT NOT NULL DEFAULT '{}',
  calibrated INTEGER NOT NULL DEFAULT 0,
  full_decision_eligible INTEGER NOT NULL DEFAULT 0,
  actual_decision_generated INTEGER NOT NULL DEFAULT 0,
  validated INTEGER NOT NULL DEFAULT 0,
  telegram_started INTEGER NOT NULL DEFAULT 0,
  created_ts INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shadow_decision_log_observed_ts
  ON shadow_decision_log(observed_ts);

CREATE INDEX IF NOT EXISTS idx_shadow_decision_log_contract_ts
  ON shadow_decision_log(contract_code, observed_ts DESC);
