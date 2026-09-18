-- MY_REPORT_2 V3 Early Discovery / first-seen shadow storage.
-- Additive only. No final decision weights, probability, live signal or execution fields.

CREATE TABLE IF NOT EXISTS v3_early_feature_snapshot (
  contract_code TEXT NOT NULL,
  ts_bucket INTEGER NOT NULL,
  observed_ts INTEGER NOT NULL,
  rules_version TEXT NOT NULL,
  direction_hint TEXT,
  direction_state TEXT NOT NULL,
  long_evidence_domain_count INTEGER NOT NULL CHECK(long_evidence_domain_count >= 0),
  short_evidence_domain_count INTEGER NOT NULL CHECK(short_evidence_domain_count >= 0),
  early_detection_quality_0_100 INTEGER NOT NULL CHECK(early_detection_quality_0_100 BETWEEN 0 AND 100),
  feature_json TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  shadow_only INTEGER NOT NULL DEFAULT 1 CHECK(shadow_only = 1),
  PRIMARY KEY(contract_code, ts_bucket)
);
CREATE INDEX IF NOT EXISTS idx_v3_early_feature_ts
  ON v3_early_feature_snapshot(ts_bucket DESC);

CREATE TABLE IF NOT EXISTS v3_early_candidate_wave (
  wave_id TEXT PRIMARY KEY,
  contract_code TEXT NOT NULL,
  generation INTEGER NOT NULL CHECK(generation >= 1),
  first_seen_ts INTEGER NOT NULL,
  first_seen_price REAL,
  first_seen_oi REAL,
  first_seen_funding REAL,
  first_seen_detectors_json TEXT NOT NULL,
  first_seen_relative_strength_json TEXT NOT NULL DEFAULT 'null',
  first_seen_volume_json TEXT NOT NULL DEFAULT 'null',
  first_seen_liquidation_json TEXT NOT NULL DEFAULT 'null',
  first_seen_orderflow_json TEXT NOT NULL DEFAULT 'null',
  first_seen_execution_state TEXT NOT NULL DEFAULT 'NOT_EVALUATED',
  move_before_first_seen REAL,
  lifecycle_stage TEXT NOT NULL CHECK(lifecycle_stage IN (
    'DISCOVERY','PRE_IMPULSE_WATCH','ENTRY_CANDIDATE','ENTRY_TRIGGER','IMPULSE',
    'RELOAD_BASE','RELOAD_WATCH','EXIT_CANDIDATE','EXIT','EDGE_SPENT','EXCLUDE'
  )),
  direction_hint TEXT CHECK(direction_hint IS NULL OR direction_hint IN ('LONG','SHORT')),
  direction_state TEXT NOT NULL DEFAULT 'DIRECTION_NOT_CLOSED',
  support_streak INTEGER NOT NULL DEFAULT 0 CHECK(support_streak >= 0),
  move_since_first_seen REAL,
  oi_change_since_first_seen REAL,
  elapsed_since_first_seen_sec REAL,
  early_detection_quality_0_100 INTEGER NOT NULL CHECK(early_detection_quality_0_100 BETWEEN 0 AND 100),
  remaining_edge_json TEXT NOT NULL,
  evidence_refs_json TEXT NOT NULL,
  last_seen_ts INTEGER NOT NULL,
  shadow_only INTEGER NOT NULL DEFAULT 1 CHECK(shadow_only = 1),
  UNIQUE(contract_code, generation)
);
CREATE INDEX IF NOT EXISTS idx_v3_early_candidate_contract_seen
  ON v3_early_candidate_wave(contract_code, last_seen_ts DESC);

CREATE TABLE IF NOT EXISTS v3_early_outcome_journal (
  outcome_id TEXT PRIMARY KEY,
  wave_id TEXT NOT NULL,
  contract_code TEXT NOT NULL,
  direction_hint TEXT CHECK(direction_hint IS NULL OR direction_hint IN ('LONG','SHORT')),
  first_seen_ts INTEGER NOT NULL,
  horizon_hours INTEGER NOT NULL CHECK(horizon_hours IN (1,4,12,24)),
  target_ts INTEGER NOT NULL,
  outcome_status TEXT NOT NULL,
  rules_version TEXT NOT NULL DEFAULT 'v3-early-discovery-shadow-v1',
  decision_without_filter_json TEXT,
  decision_with_filter_json TEXT,
  first_seen_context_json TEXT,
  entry_condition_json TEXT,
  invalidation_json TEXT,
  regime TEXT,
  liquidity_bucket TEXT,
  raw_return_pct REAL,
  directional_return_pct REAL,
  mfe_pct REAL,
  mae_pct REAL,
  realized_r REAL,
  model_r REAL,
  lost_rr REAL,
  prevented_bad_entry INTEGER CHECK(prevented_bad_entry IS NULL OR prevented_bad_entry IN (0,1)),
  missed_good_entry INTEGER CHECK(missed_good_entry IS NULL OR missed_good_entry IN (0,1)),
  late_entry_avoided INTEGER CHECK(late_entry_avoided IS NULL OR late_entry_avoided IN (0,1)),
  early_alert_useful INTEGER CHECK(early_alert_useful IS NULL OR early_alert_useful IN (0,1)),
  computed_ts INTEGER,
  shadow_only INTEGER NOT NULL DEFAULT 1 CHECK(shadow_only = 1)
);
CREATE INDEX IF NOT EXISTS idx_v3_early_outcome_due
  ON v3_early_outcome_journal(target_ts, computed_ts);
