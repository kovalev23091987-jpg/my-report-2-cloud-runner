CREATE TABLE IF NOT EXISTS report2_liq_forecast_archive_v1 (
  publication_id TEXT NOT NULL PRIMARY KEY,
  run_id TEXT NOT NULL,
  contract_code TEXT NOT NULL,
  observed_ts INTEGER NOT NULL,
  status TEXT NOT NULL,
  reason TEXT,
  payload_sha256 TEXT,
  payload_json TEXT,
  created_ts INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS report2_liq_forecast_archive_clock_v1
  ON report2_liq_forecast_archive_v1(observed_ts, publication_id);
