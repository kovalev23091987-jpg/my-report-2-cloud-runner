CREATE TABLE IF NOT EXISTS report2_provider_minute_ledger_v1(
  provider TEXT NOT NULL,
  minute_bucket INTEGER NOT NULL,
  reservation_id TEXT NOT NULL,
  units INTEGER NOT NULL CHECK(units>0),
  created_ts INTEGER NOT NULL,
  PRIMARY KEY(provider,minute_bucket,reservation_id)
);
CREATE INDEX IF NOT EXISTS idx_report2_provider_minute_ledger_v1_window
  ON report2_provider_minute_ledger_v1(provider,created_ts);
CREATE UNIQUE INDEX IF NOT EXISTS idx_report2_provider_minute_ledger_v1_reservation
  ON report2_provider_minute_ledger_v1(provider,reservation_id);
