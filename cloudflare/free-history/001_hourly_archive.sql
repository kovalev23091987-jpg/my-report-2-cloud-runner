CREATE TABLE IF NOT EXISTS report2_hourly_market_archive_v1 (
  hour_bucket INTEGER NOT NULL PRIMARY KEY,
  source_bucket INTEGER NOT NULL,
  source_generation TEXT NOT NULL,
  source_market_ts INTEGER NOT NULL,
  received_ts INTEGER NOT NULL,
  manifest_sha256 TEXT NOT NULL,
  target_count INTEGER NOT NULL,
  present_count INTEGER NOT NULL,
  qualified_count INTEGER NOT NULL,
  payload_sha256 TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_ts INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS report2_hourly_spot_archive_v1 (
  hour_bucket INTEGER NOT NULL,
  venue TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_ts INTEGER,
  received_ts INTEGER NOT NULL,
  identity_scope TEXT NOT NULL,
  target_count INTEGER NOT NULL,
  present_count INTEGER NOT NULL,
  quote_checked_count INTEGER NOT NULL,
  payload_sha256 TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_ts INTEGER NOT NULL,
  PRIMARY KEY(hour_bucket,venue)
);

CREATE TABLE IF NOT EXISTS report2_spot_archive_attempt_v1 (
  hour_bucket INTEGER NOT NULL,
  venue TEXT NOT NULL,
  claimed_ts INTEGER NOT NULL,
  status TEXT NOT NULL,
  PRIMARY KEY(hour_bucket,venue)
);

CREATE TABLE IF NOT EXISTS report2_archive_run_v1 (
  scheduled_ts INTEGER NOT NULL PRIMARY KEY,
  status TEXT NOT NULL,
  outcomes_json TEXT NOT NULL,
  created_ts INTEGER NOT NULL
);
