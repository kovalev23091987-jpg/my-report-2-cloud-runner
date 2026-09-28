CREATE TABLE IF NOT EXISTS report2_public_collector_usage_v1(
  actor TEXT NOT NULL,
  generation TEXT NOT NULL,
  bucket INTEGER NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('STARTED','CLOSED','ERROR')),
  claim_token TEXT NOT NULL,
  lease_until INTEGER NOT NULL,
  started_ts INTEGER NOT NULL,
  completed_ts INTEGER,
  external_requests INTEGER NOT NULL DEFAULT 0,
  rows_read INTEGER NOT NULL DEFAULT 0,
  rows_written INTEGER NOT NULL DEFAULT 0,
  payload_bytes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  error_text TEXT,
  PRIMARY KEY(actor,generation,bucket)
);
CREATE INDEX IF NOT EXISTS idx_report2_public_collector_usage_v1_day
  ON report2_public_collector_usage_v1(actor,generation,bucket,state);
CREATE TABLE IF NOT EXISTS report2_public_collector_health_v1(
  actor TEXT NOT NULL,
  generation TEXT NOT NULL,
  last_bucket INTEGER NOT NULL,
  last_started_ts INTEGER NOT NULL,
  last_completed_ts INTEGER NOT NULL,
  status TEXT NOT NULL,
  contract_count INTEGER NOT NULL,
  shard_count INTEGER NOT NULL,
  external_requests INTEGER NOT NULL,
  rows_read INTEGER NOT NULL,
  rows_written INTEGER NOT NULL,
  payload_bytes INTEGER NOT NULL,
  error_text TEXT,
  updated_ts INTEGER NOT NULL,
  PRIMARY KEY(actor,generation)
);
