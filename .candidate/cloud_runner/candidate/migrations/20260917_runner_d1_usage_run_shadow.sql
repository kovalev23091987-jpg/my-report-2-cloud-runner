CREATE TABLE IF NOT EXISTS report2_runner_budget_ledger_shadow (
  reservation_id TEXT PRIMARY KEY NOT NULL,
  day_utc TEXT NOT NULL,
  reserve_rows_read INTEGER NOT NULL CHECK(reserve_rows_read > 0),
  reserve_rows_written INTEGER NOT NULL CHECK(reserve_rows_written > 0),
  measured_rows_read INTEGER,
  measured_rows_written INTEGER,
  measured_requests INTEGER,
  unknown_ops INTEGER,
  state TEXT NOT NULL CHECK(state IN ('RESERVED','FINALIZED')),
  started_ts INTEGER NOT NULL,
  completed_ts INTEGER,
  source_run_id TEXT,
  CHECK(
    (state='RESERVED' AND completed_ts IS NULL)
    OR
    (state='FINALIZED' AND completed_ts IS NOT NULL AND measured_rows_read IS NOT NULL AND measured_rows_written IS NOT NULL AND measured_requests IS NOT NULL AND unknown_ops IS NOT NULL AND source_run_id IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_report2_runner_budget_day ON report2_runner_budget_ledger_shadow(day_utc, started_ts);
