CREATE TABLE IF NOT EXISTS deep_check_run_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  contract_code TEXT NOT NULL,
  started_ts INTEGER,
  completed_ts INTEGER NOT NULL,
  execution_status TEXT NOT NULL,
  data_sufficiency TEXT,
  gaps_json TEXT NOT NULL DEFAULT '[]',
  fulfilled_components INTEGER,
  failed_components_json TEXT NOT NULL DEFAULT '[]',
  decision_generated INTEGER NOT NULL DEFAULT 0,
  validated INTEGER NOT NULL DEFAULT 0,
  telegram_started INTEGER NOT NULL DEFAULT 0,
  error_text TEXT,
  created_ts INTEGER NOT NULL,
  UNIQUE(run_id, contract_code)
);

CREATE INDEX IF NOT EXISTS
  idx_deep_check_run_log_completed_ts
ON deep_check_run_log(completed_ts);

CREATE INDEX IF NOT EXISTS
  idx_deep_check_run_log_contract_completed
ON deep_check_run_log(contract_code, completed_ts);
