CREATE TABLE IF NOT EXISTS report2_runtime_lease_v1(
  lease_name TEXT PRIMARY KEY CHECK(lease_name='ANALYTICS'),
  actor TEXT NOT NULL,
  generation TEXT NOT NULL,
  owner_run_id TEXT NOT NULL,
  fencing_token INTEGER NOT NULL CHECK(fencing_token>0),
  claimed_ts INTEGER NOT NULL,
  renewed_ts INTEGER NOT NULL,
  expires_ts INTEGER NOT NULL,
  terminal_state TEXT NOT NULL CHECK(terminal_state IN ('ACTIVE','RELEASED'))
);

CREATE TABLE IF NOT EXISTS report2_immutable_snapshot_v1(
  actor TEXT NOT NULL,
  generation TEXT NOT NULL,
  bucket INTEGER NOT NULL,
  shard INTEGER NOT NULL CHECK(shard>=0),
  payload_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_ts INTEGER NOT NULL,
  PRIMARY KEY(actor,generation,bucket,shard)
);
