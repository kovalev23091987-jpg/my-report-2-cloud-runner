CREATE TABLE IF NOT EXISTS deep_check_scheduler_state (
  contract_code TEXT PRIMARY KEY,
  last_started_ts INTEGER,
  last_completed_ts INTEGER,
  last_status TEXT NOT NULL DEFAULT 'NEVER',
  last_run_id TEXT,
  last_sufficiency TEXT,
  last_error TEXT,
  updated_ts INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS
  idx_deep_check_scheduler_state_updated_ts
ON deep_check_scheduler_state(updated_ts);
