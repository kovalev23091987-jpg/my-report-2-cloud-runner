-- Private lossless copy only. Installation does not authorize source deletion.
-- Each revision is immutable and must be read by publication AND content hash.
CREATE TABLE IF NOT EXISTS report2_canonical_cold_archive_v1 (
  publication_id TEXT NOT NULL,
  raw_sha256 TEXT NOT NULL,
  run_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  contract_code TEXT NOT NULL,
  observed_ts INTEGER NOT NULL,
  record_json TEXT NOT NULL,
  created_ts INTEGER NOT NULL,
  PRIMARY KEY(publication_id,raw_sha256)
);
CREATE INDEX IF NOT EXISTS report2_canonical_cold_archive_clock_v1
  ON report2_canonical_cold_archive_v1(observed_ts,publication_id);
