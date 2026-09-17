CREATE TABLE IF NOT EXISTS tz101_entry_area_calibration_signal (
  sample_id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  contract_code TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('LONG','SHORT')),
  campaign_receipt_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  observed_ts INTEGER NOT NULL,
  anchor_committed_ts INTEGER NOT NULL,
  entry_trigger_time INTEGER NOT NULL,
  entry_trigger_price REAL NOT NULL,
  base_low REAL NOT NULL,
  base_high REAL NOT NULL,
  invalidation_price REAL NOT NULL,
  target_price REAL NOT NULL,
  scenario_type TEXT NOT NULL,
  sample_json TEXT NOT NULL,
  material_digest TEXT NOT NULL,
  calibration_only INTEGER NOT NULL DEFAULT 1 CHECK(calibration_only=1),
  live_promotion_allowed INTEGER NOT NULL DEFAULT 0 CHECK(live_promotion_allowed=0),
  automatic_rule_promotion INTEGER NOT NULL DEFAULT 0 CHECK(automatic_rule_promotion=0),
  created_ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tz101_entry_area_signal_contract_ts ON tz101_entry_area_calibration_signal(contract_code,observed_ts DESC);
CREATE INDEX IF NOT EXISTS idx_tz101_entry_area_signal_campaign ON tz101_entry_area_calibration_signal(campaign_id,observed_ts DESC);

CREATE TABLE IF NOT EXISTS tz101_entry_area_calibration_outcome (
  sample_id TEXT NOT NULL,
  horizon_hours INTEGER NOT NULL CHECK(horizon_hours IN (1,4,12,24)),
  contract_code TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('LONG','SHORT')),
  observed_ts INTEGER NOT NULL,
  target_ts INTEGER NOT NULL,
  outcome_scan_ts INTEGER NOT NULL,
  outcome_json TEXT NOT NULL,
  material_digest TEXT NOT NULL,
  path_order_status TEXT NOT NULL,
  calibration_only INTEGER NOT NULL DEFAULT 1 CHECK(calibration_only=1),
  live_promotion_allowed INTEGER NOT NULL DEFAULT 0 CHECK(live_promotion_allowed=0),
  computed_ts INTEGER NOT NULL,
  PRIMARY KEY(sample_id,horizon_hours),
  FOREIGN KEY(sample_id) REFERENCES tz101_entry_area_calibration_signal(sample_id)
);
CREATE INDEX IF NOT EXISTS idx_tz101_entry_area_outcome_ts ON tz101_entry_area_calibration_outcome(outcome_scan_ts DESC);

CREATE TABLE IF NOT EXISTS tz101_entry_area_calibration_state (
  state_key TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  closed_samples INTEGER NOT NULL DEFAULT 0,
  train_samples INTEGER NOT NULL DEFAULT 0,
  holdout_samples INTEGER NOT NULL DEFAULT 0,
  validated_out_of_sample INTEGER NOT NULL DEFAULT 0 CHECK(validated_out_of_sample=0),
  live_promotion_allowed INTEGER NOT NULL DEFAULT 0 CHECK(live_promotion_allowed=0),
  automatic_rule_promotion INTEGER NOT NULL DEFAULT 0 CHECK(automatic_rule_promotion=0),
  updated_ts INTEGER NOT NULL
);
