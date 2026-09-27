CREATE TABLE IF NOT EXISTS report2_byk_monthly_usage(
  month_key TEXT PRIMARY KEY,
  official_quota INTEGER NOT NULL CHECK(official_quota=15000),
  operational_cap INTEGER NOT NULL CHECK(operational_cap=13500),
  scheduled_cap INTEGER NOT NULL CHECK(scheduled_cap=12900),
  used_total INTEGER NOT NULL DEFAULT 0 CHECK(used_total>=0),
  used_scheduled INTEGER NOT NULL DEFAULT 0 CHECK(used_scheduled>=0),
  used_manual INTEGER NOT NULL DEFAULT 0 CHECK(used_manual>=0),
  version INTEGER NOT NULL DEFAULT 0 CHECK(version>=0),
  last_reservation_id TEXT,
  updated_ts INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS report2_byk_reservations(
  reservation_id TEXT PRIMARY KEY,
  month_key TEXT NOT NULL,
  run_source TEXT NOT NULL CHECK(run_source IN ('schedule','manual')),
  contract_code TEXT NOT NULL,
  reserved_units INTEGER NOT NULL CHECK(reserved_units>0 AND reserved_units<=5),
  created_ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_report2_byk_reservations_month
ON report2_byk_reservations(month_key,created_ts);
