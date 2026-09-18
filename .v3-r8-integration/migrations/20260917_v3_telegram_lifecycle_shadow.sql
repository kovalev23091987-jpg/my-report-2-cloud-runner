-- V3 Telegram lifecycle and pipeline health. Additive/shadow until controlled production closure.
CREATE TABLE IF NOT EXISTS v3_user_lifecycle_shadow (
  contract TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('LONG','SHORT')),
  wave_id TEXT NOT NULL,
  rules_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('OBSERVE','WAIT','ENTRY','IDEA_REMOVED','HOLD','EXIT')),
  reason TEXT NOT NULL,
  observation_ts INTEGER NOT NULL,
  valid_until_ts INTEGER,
  updated_ts INTEGER NOT NULL,
  shadow_only INTEGER NOT NULL DEFAULT 1 CHECK(shadow_only=1),
  PRIMARY KEY(contract,direction,wave_id,rules_version)
);

CREATE TABLE IF NOT EXISTS v3_telegram_dispatch_shadow (
  dispatch_id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  contract TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('LONG','SHORT')),
  wave_id TEXT NOT NULL,
  lifecycle_event TEXT NOT NULL CHECK(lifecycle_event IN ('OBSERVE','WAIT','ENTRY','IDEA_REMOVED','HOLD','EXIT')),
  rules_version TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('PENDING','SENDING','SENT','FAILED_RETRYABLE','FAILED_FINAL','EXPIRED_NOT_SENT','SUPPRESSED_DEDUP')),
  decision_id TEXT,
  message_hash TEXT,
  telegram_message_id TEXT,
  last_error TEXT,
  created_ts INTEGER NOT NULL,
  updated_ts INTEGER NOT NULL,
  sent_ts INTEGER,
  shadow_only INTEGER NOT NULL DEFAULT 1 CHECK(shadow_only=1)
);
CREATE INDEX IF NOT EXISTS idx_v3_dispatch_state_ts ON v3_telegram_dispatch_shadow(state,updated_ts);
CREATE INDEX IF NOT EXISTS idx_v3_dispatch_wave ON v3_telegram_dispatch_shadow(contract,direction,wave_id,created_ts);

CREATE TABLE IF NOT EXISTS v3_pipeline_health_shadow (
  namespace TEXT NOT NULL DEFAULT 'PIPELINE',
  status TEXT NOT NULL CHECK(status IN ('HEALTHY_NO_IDEA','DEGRADED_PIPELINE')),
  reasons_json TEXT NOT NULL,
  changed_ts INTEGER NOT NULL,
  last_checked_ts INTEGER NOT NULL,
  shadow_only INTEGER NOT NULL DEFAULT 1 CHECK(shadow_only=1),
  PRIMARY KEY(namespace)
);

CREATE TABLE IF NOT EXISTS v3_pipeline_health_event_shadow (
  event_id TEXT PRIMARY KEY,
  transition TEXT NOT NULL CHECK(transition IN ('DEGRADED','RECOVERED')),
  from_status TEXT NOT NULL CHECK(from_status IN ('HEALTHY_NO_IDEA','DEGRADED_PIPELINE')),
  to_status TEXT NOT NULL CHECK(to_status IN ('HEALTHY_NO_IDEA','DEGRADED_PIPELINE')),
  reasons_json TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('PENDING','SENDING','SENT','FAILED_RETRYABLE','FAILED_FINAL')),
  telegram_message_id TEXT,
  last_error TEXT,
  created_ts INTEGER NOT NULL,
  updated_ts INTEGER NOT NULL,
  sent_ts INTEGER,
  shadow_only INTEGER NOT NULL DEFAULT 1 CHECK(shadow_only=1)
);
CREATE INDEX IF NOT EXISTS idx_v3_pipeline_health_event_state
  ON v3_pipeline_health_event_shadow(state, updated_ts);
