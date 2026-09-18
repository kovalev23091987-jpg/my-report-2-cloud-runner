-- MY_REPORT_2 V3 / Guaranteed Discovery -> Deep Check handoff journal.
-- Additive, shadow-only. Ensures logical exactly-once handoff and restart/retry observability.

CREATE TABLE IF NOT EXISTS v3_discovery_deep_handoff_shadow (
  handoff_id TEXT PRIMARY KEY,
  logical_key TEXT NOT NULL UNIQUE,
  source_run_id TEXT NOT NULL,
  scan_ts INTEGER NOT NULL CHECK(scan_ts > 0),
  contract_code TEXT NOT NULL,
  base_ticker TEXT NOT NULL,
  discovery_rank INTEGER,
  detectors_json TEXT NOT NULL DEFAULT '[]',
  evidence_ids_json TEXT NOT NULL DEFAULT '[]',
  first_seen_state_json TEXT,
  current_state_json TEXT,
  direction TEXT CHECK(direction IS NULL OR direction IN ('LONG','SHORT')),
  wave_id TEXT,
  dedup_reentry_key TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('PENDING','CLAIMED','COMPLETED','BLOCKED_FINAL','FAILED_RETRYABLE','EXPIRED')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count >= 0),
  lease_owner TEXT,
  lease_started_ts INTEGER,
  lease_expires_ts INTEGER,
  zero_reason TEXT,
  deep_check_run_id TEXT,
  last_error TEXT,
  created_ts INTEGER NOT NULL CHECK(created_ts > 0),
  updated_ts INTEGER NOT NULL CHECK(updated_ts > 0),
  completed_ts INTEGER,
  shadow_only INTEGER NOT NULL DEFAULT 1 CHECK(shadow_only = 1),
  UNIQUE(source_run_id, contract_code, dedup_reentry_key)
);

CREATE INDEX IF NOT EXISTS idx_v3_handoff_pending
  ON v3_discovery_deep_handoff_shadow(state, updated_ts);
CREATE INDEX IF NOT EXISTS idx_v3_handoff_contract
  ON v3_discovery_deep_handoff_shadow(contract_code, scan_ts DESC);
CREATE INDEX IF NOT EXISTS idx_v3_handoff_wave
  ON v3_discovery_deep_handoff_shadow(wave_id, state, updated_ts);
