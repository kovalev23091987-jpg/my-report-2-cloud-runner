-- Candidate-only migration. Not executed on production. No existing table altered.
-- No allowance rows are auto-created: authoritative quota configuration is required.
CREATE TABLE IF NOT EXISTS report2_liq_source_allowance_shadow (
  scope_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  unit TEXT NOT NULL CHECK(unit IN ('REQUEST','CREDIT','WEIGHT')),
  window_start_ts INTEGER NOT NULL,
  window_end_ts INTEGER NOT NULL CHECK(window_end_ts>window_start_ts),
  allowance_units INTEGER NOT NULL CHECK(allowance_units>=0),
  used_units INTEGER NOT NULL DEFAULT 0 CHECK(used_units>=0 AND used_units<=allowance_units),
  version INTEGER NOT NULL DEFAULT 0 CHECK(version>=0),
  last_reservation_id TEXT,
  config_fingerprint TEXT NOT NULL,
  shared_quota_reviewed INTEGER NOT NULL CHECK(shared_quota_reviewed=1),
  active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0,1)),
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK(schema_version=1)
);
CREATE TABLE IF NOT EXISTS report2_liq_source_reservation_shadow (
  reservation_id TEXT PRIMARY KEY,
  scope_id TEXT NOT NULL REFERENCES report2_liq_source_allowance_shadow(scope_id),
  provider TEXT NOT NULL,
  contract_code TEXT NOT NULL,
  run_id TEXT NOT NULL,
  reserved_units INTEGER NOT NULL CHECK(reserved_units>0),
  expected_version INTEGER NOT NULL CHECK(expected_version>=0),
  committed_version INTEGER NOT NULL CHECK(committed_version=expected_version+1),
  created_ts INTEGER NOT NULL,
  reservation_fingerprint TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'RESERVED_NOT_REFUNDED' CHECK(status='RESERVED_NOT_REFUNDED')
);
CREATE INDEX IF NOT EXISTS idx_report2_liq_reservation_scope
ON report2_liq_source_reservation_shadow(scope_id,created_ts);
