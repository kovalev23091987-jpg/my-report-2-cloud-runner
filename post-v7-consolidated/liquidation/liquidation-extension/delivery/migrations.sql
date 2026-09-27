-- POST_V7 unified remediation additive/shadow migration.
-- No existing table is altered or relaxed.
CREATE TABLE IF NOT EXISTS canonical_publication_shadow (
  publication_id TEXT PRIMARY KEY,
  contract_code TEXT NOT NULL,
  direction TEXT CHECK(direction IN ('LONG','SHORT') OR direction IS NULL),
  run_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  wave_id TEXT,
  decision_id TEXT,
  observed_ts INTEGER NOT NULL,
  valid_until_ts INTEGER,
  lifecycle_event TEXT CHECK(lifecycle_event IN ('OBSERVE','WAIT','ENTRY','IDEA_REMOVED','HOLD','EXIT') OR lifecycle_event IS NULL),
  canonical_state TEXT NOT NULL,
  analytical_fingerprint TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  presentation_inputs_json TEXT NOT NULL DEFAULT '{}',
  manual_text TEXT,
  telegram_text TEXT,
  presentation_hash TEXT,
  actionability_status TEXT NOT NULL DEFAULT 'UNASSESSED',
  actionability_reason TEXT,
  created_ts INTEGER NOT NULL,
  bound_ts INTEGER,
  shadow_only INTEGER NOT NULL DEFAULT 1 CHECK(shadow_only=1),
  UNIQUE(contract_code,run_id,snapshot_id,observed_ts,analytical_fingerprint)
);
CREATE INDEX IF NOT EXISTS idx_canonical_publication_identity
  ON canonical_publication_shadow(contract_code,run_id,snapshot_id,observed_ts);
CREATE INDEX IF NOT EXISTS idx_canonical_publication_actionable
  ON canonical_publication_shadow(actionability_status,lifecycle_event,bound_ts);

CREATE TABLE IF NOT EXISTS v3_dispatch_publication_binding_shadow (
  idempotency_key TEXT PRIMARY KEY,
  publication_id TEXT NOT NULL,
  contract_code TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('LONG','SHORT')),
  wave_id TEXT NOT NULL,
  lifecycle_event TEXT NOT NULL CHECK(lifecycle_event IN ('OBSERVE','WAIT','ENTRY','IDEA_REMOVED','HOLD','EXIT')),
  rules_version TEXT NOT NULL,
  decision_id TEXT,
  snapshot_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  observed_ts INTEGER NOT NULL,
  analytical_fingerprint TEXT NOT NULL,
  presentation_hash TEXT NOT NULL,
  created_ts INTEGER NOT NULL,
  shadow_only INTEGER NOT NULL DEFAULT 1 CHECK(shadow_only=1)
);
CREATE INDEX IF NOT EXISTS idx_dispatch_publication_id
  ON v3_dispatch_publication_binding_shadow(publication_id);

CREATE TABLE IF NOT EXISTS v3_recheck_task_shadow (
  task_id TEXT PRIMARY KEY,
  publication_id TEXT NOT NULL,
  contract_code TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('LONG','SHORT')),
  wave_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  due_ts INTEGER NOT NULL,
  expires_ts INTEGER NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('PENDING','CLAIMED','DONE','CANCELLED','EXPIRED')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  lease_owner TEXT,
  lease_started_ts INTEGER,
  lease_expires_ts INTEGER,
  last_result TEXT,
  created_ts INTEGER NOT NULL,
  updated_ts INTEGER NOT NULL,
  shadow_only INTEGER NOT NULL DEFAULT 1 CHECK(shadow_only=1)
);
CREATE INDEX IF NOT EXISTS idx_v3_recheck_due
  ON v3_recheck_task_shadow(state,due_ts,expires_ts);
CREATE UNIQUE INDEX IF NOT EXISTS idx_v3_recheck_wave_active
  ON v3_recheck_task_shadow(contract_code,direction,wave_id,publication_id);

CREATE TABLE IF NOT EXISTS v3_maintenance_cadence_shadow (
  job_key TEXT PRIMARY KEY,
  interval_ms INTEGER NOT NULL CHECK(interval_ms>=60000),
  last_success_ts INTEGER,
  lease_owner TEXT,
  lease_started_ts INTEGER,
  lease_expires_ts INTEGER,
  updated_ts INTEGER NOT NULL,
  last_result TEXT,
  shadow_only INTEGER NOT NULL DEFAULT 1 CHECK(shadow_only=1)
);
CREATE INDEX IF NOT EXISTS idx_v3_maintenance_due
  ON v3_maintenance_cadence_shadow(last_success_ts,lease_expires_ts);

CREATE TABLE IF NOT EXISTS v3_scheduler_job_ownership_shadow (
  job_key TEXT PRIMARY KEY,
  owner TEXT NOT NULL CHECK(owner IN ('GITHUB_ACTIONS','CLOUDFLARE_HUB')),
  updated_ts INTEGER NOT NULL,
  shadow_only INTEGER NOT NULL DEFAULT 1 CHECK(shadow_only=1)
);
INSERT INTO v3_scheduler_job_ownership_shadow(job_key,owner,updated_ts,shadow_only)
VALUES('PERIODIC_ANALYTICS','GITHUB_ACTIONS',1790448000000,1)
ON CONFLICT(job_key) DO NOTHING;
