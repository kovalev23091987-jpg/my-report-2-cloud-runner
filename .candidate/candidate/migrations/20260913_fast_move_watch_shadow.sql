-- My Report 2 / Stage 3.8
-- Additive shadow-only schema. Predeploy package runs this locally only.

CREATE TABLE IF NOT EXISTS fast_move_watch_state (
  contract TEXT PRIMARY KEY NOT NULL,
  generation INTEGER NOT NULL DEFAULT 1 CHECK (generation >= 1),
  engine_version TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'FAST_MOVE_WATCH_SHADOW_NO_EXECUTION'
    CHECK (mode = 'FAST_MOVE_WATCH_SHADOW_NO_EXECUTION'),
  lifecycle_state TEXT NOT NULL CHECK (lifecycle_state IN (
    'PRE_SQUEEZE','SQUEEZE_ACTIVE','MOMENTUM_CONTINUATION',
    'LIQUIDATION_MAGNET_ACTIVE','EXHAUSTION_WARNING','EDGE_SPENT',
    'STALE','EXPIRED','CLOSED'
  )),
  state_before_stale TEXT CHECK (state_before_stale IS NULL OR state_before_stale IN (
    'PRE_SQUEEZE','SQUEEZE_ACTIVE','MOMENTUM_CONTINUATION',
    'LIQUIDATION_MAGNET_ACTIVE','EXHAUSTION_WARNING','EDGE_SPENT'
  )),
  state_entered_ts INTEGER NOT NULL CHECK (state_entered_ts > 0),
  created_ts INTEGER NOT NULL CHECK (created_ts > 0),
  updated_ts INTEGER NOT NULL CHECK (updated_ts >= created_ts),
  last_recheck_ts INTEGER,
  next_recheck_ts INTEGER,
  expiry_ts INTEGER NOT NULL CHECK (expiry_ts > created_ts),
  last_evidence_ts INTEGER,
  last_event_id TEXT NOT NULL,
  last_reason_code TEXT NOT NULL,
  cadence_class TEXT NOT NULL CHECK (cadence_class IN ('FAST','ACTIVE','WATCH')),
  priority_class TEXT NOT NULL CHECK (priority_class IN ('FAST','ACTIVE','WATCH')),
  freshness_state TEXT NOT NULL CHECK (freshness_state IN (
    'CURRENT','STALE','FUTURE','UNKNOWN','NOT_CLOSED','SOURCE_UNSUPPORTED','SOURCE_INCOMPATIBLE'
  )),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  deferral_count INTEGER NOT NULL DEFAULT 0 CHECK (deferral_count >= 0),
  missed_due_count INTEGER NOT NULL DEFAULT 0 CHECK (missed_due_count >= 0),
  counters_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(counters_json)),
  cluster_lifecycle TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (cluster_lifecycle IN (
    'UNKNOWN','ACTIVE','APPROACHING','TOUCHED','SWEPT','INVALIDATED','EXPIRED'
  )),
  cluster_lifecycle_source TEXT NOT NULL DEFAULT 'NONE' CHECK (cluster_lifecycle_source IN (
    'NONE','PROJECTED','REALIZED'
  )),
  discovery_rank INTEGER,
  discovery_flags_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(discovery_flags_json)),
  closure_reason TEXT,
  lease_owner TEXT,
  lease_expires_ts INTEGER,
  shadow_only INTEGER NOT NULL DEFAULT 1 CHECK (shadow_only = 1),
  scheduler_priority_is_probability INTEGER NOT NULL DEFAULT 0 CHECK (scheduler_priority_is_probability = 0),
  changes_strategy_weights INTEGER NOT NULL DEFAULT 0 CHECK (changes_strategy_weights = 0),
  new_percentage_weight INTEGER NOT NULL DEFAULT 0 CHECK (new_percentage_weight = 0),
  live_probability REAL CHECK (live_probability IS NULL),
  live_signal INTEGER NOT NULL DEFAULT 0 CHECK (live_signal = 0),
  validated_signal INTEGER NOT NULL DEFAULT 0 CHECK (validated_signal = 0),
  telegram_started INTEGER NOT NULL DEFAULT 0 CHECK (telegram_started = 0),
  trading_execution INTEGER NOT NULL DEFAULT 0 CHECK (trading_execution = 0),
  automatic_weight_tuning_enabled INTEGER NOT NULL DEFAULT 0 CHECK (automatic_weight_tuning_enabled = 0),
  guaranteed_tp_generated INTEGER NOT NULL DEFAULT 0 CHECK (guaranteed_tp_generated = 0),
  synthetic_liquidation_levels_generated INTEGER NOT NULL DEFAULT 0 CHECK (synthetic_liquidation_levels_generated = 0),
  UNIQUE(contract, generation)
);

CREATE TABLE IF NOT EXISTS fast_move_watch_event (
  event_id TEXT PRIMARY KEY NOT NULL,
  contract TEXT NOT NULL,
  generation INTEGER NOT NULL CHECK (generation >= 1),
  engine_version TEXT NOT NULL,
  observed_ts INTEGER NOT NULL CHECK (observed_ts > 0),
  source_evidence_ts INTEGER,
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  evidence_ids_json TEXT NOT NULL CHECK (json_valid(evidence_ids_json)),
  evidence_status TEXT NOT NULL CHECK (evidence_status IN (
    'CLOSED','NOT_CLOSED','STALE','FUTURE','UNKNOWN','SOURCE_UNSUPPORTED','SOURCE_INCOMPATIBLE'
  )),
  projected_liquidation_status TEXT NOT NULL,
  realized_liquidation_status TEXT NOT NULL,
  projected_realized_separated INTEGER NOT NULL DEFAULT 1 CHECK (projected_realized_separated = 1),
  single_provider_consensus INTEGER NOT NULL DEFAULT 0 CHECK (single_provider_consensus = 0),
  scheduler_priority_is_probability INTEGER NOT NULL DEFAULT 0 CHECK (scheduler_priority_is_probability = 0),
  live_probability REAL CHECK (live_probability IS NULL),
  live_signal INTEGER NOT NULL DEFAULT 0 CHECK (live_signal = 0),
  validated_signal INTEGER NOT NULL DEFAULT 0 CHECK (validated_signal = 0),
  telegram_started INTEGER NOT NULL DEFAULT 0 CHECK (telegram_started = 0),
  trading_execution INTEGER NOT NULL DEFAULT 0 CHECK (trading_execution = 0),
  shadow_only INTEGER NOT NULL DEFAULT 1 CHECK (shadow_only = 1),
  retention_days INTEGER NOT NULL DEFAULT 180 CHECK (retention_days = 180)
);

CREATE TABLE IF NOT EXISTS fast_move_recheck_queue (
  contract TEXT NOT NULL,
  generation INTEGER NOT NULL CHECK (generation >= 1),
  due_ts INTEGER NOT NULL CHECK (due_ts > 0),
  priority_class TEXT NOT NULL CHECK (priority_class IN ('FAST','ACTIVE','WATCH')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  deferral_count INTEGER NOT NULL DEFAULT 0 CHECK (deferral_count >= 0),
  external_call_estimate INTEGER NOT NULL DEFAULT 0 CHECK (external_call_estimate >= 0),
  d1_write_estimate INTEGER NOT NULL DEFAULT 1 CHECK (d1_write_estimate >= 1),
  requires_deep_check INTEGER NOT NULL DEFAULT 0 CHECK (requires_deep_check IN (0,1)),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','LEASED','COMPLETED','CANCELLED','EXPIRED')),
  lease_owner TEXT,
  lease_expires_ts INTEGER,
  dedupe_token TEXT NOT NULL UNIQUE,
  created_ts INTEGER NOT NULL CHECK (created_ts > 0),
  updated_ts INTEGER NOT NULL CHECK (updated_ts >= created_ts),
  shadow_only INTEGER NOT NULL DEFAULT 1 CHECK (shadow_only = 1),
  PRIMARY KEY(contract, generation)
);

CREATE INDEX IF NOT EXISTS idx_fast_move_watch_next_due
  ON fast_move_watch_state(next_recheck_ts, priority_class);
CREATE INDEX IF NOT EXISTS idx_fast_move_watch_expiry
  ON fast_move_watch_state(expiry_ts, lifecycle_state);
CREATE INDEX IF NOT EXISTS idx_fast_move_watch_event_contract_ts
  ON fast_move_watch_event(contract, observed_ts DESC);
CREATE INDEX IF NOT EXISTS idx_fast_move_watch_event_retention
  ON fast_move_watch_event(observed_ts);
CREATE INDEX IF NOT EXISTS idx_fast_move_queue_due
  ON fast_move_recheck_queue(status, due_ts, priority_class);
CREATE INDEX IF NOT EXISTS idx_fast_move_queue_lease
  ON fast_move_recheck_queue(lease_expires_ts);
