CREATE TABLE IF NOT EXISTS liquidation_shadow_observation (
  observation_id TEXT PRIMARY KEY,
  contract_code TEXT NOT NULL,
  observed_ts INTEGER NOT NULL CHECK(observed_ts > 0),
  rules_version TEXT NOT NULL CHECK(rules_version = 'cross-venue-liquidation-shadow-v1'),
  contract_version TEXT NOT NULL CHECK(contract_version = 'liquidation-evidence-v1'),
  mode TEXT NOT NULL CHECK(mode = 'LIQUIDATION_INTELLIGENCE_SHADOW_NO_EXECUTION'),
  provider TEXT NOT NULL,
  provider_symbol TEXT,
  alias_verified INTEGER NOT NULL DEFAULT 0 CHECK(alias_verified IN (0,1)),
  alias_verification_scope TEXT,
  asset_identity_verified INTEGER NOT NULL DEFAULT 0 CHECK(asset_identity_verified IN (0,1)),
  projected_map_status TEXT NOT NULL,
  realized_status TEXT NOT NULL,
  dq_status TEXT NOT NULL,
  source_ts INTEGER,
  source_age_sec REAL,
  freshness_status TEXT,
  projected_clusters_json TEXT NOT NULL DEFAULT '[]',
  realized_json TEXT NOT NULL DEFAULT '{}',
  coverage_json TEXT NOT NULL DEFAULT '{}',
  derived_json TEXT NOT NULL DEFAULT '{}',
  source_health_json TEXT NOT NULL DEFAULT '{}',
  errors_json TEXT NOT NULL DEFAULT '[]',
  live_probability REAL DEFAULT NULL CHECK(live_probability IS NULL),
  live_signal INTEGER NOT NULL DEFAULT 0 CHECK(live_signal = 0),
  validated_signal INTEGER NOT NULL DEFAULT 0 CHECK(validated_signal = 0),
  telegram_started INTEGER NOT NULL DEFAULT 0 CHECK(telegram_started = 0),
  trading_execution INTEGER NOT NULL DEFAULT 0 CHECK(trading_execution = 0),
  strategy_weights_changed INTEGER NOT NULL DEFAULT 0 CHECK(strategy_weights_changed = 0),
  automatic_weight_tuning_enabled INTEGER NOT NULL DEFAULT 0 CHECK(automatic_weight_tuning_enabled = 0),
  guaranteed_tp_generated INTEGER NOT NULL DEFAULT 0 CHECK(guaranteed_tp_generated = 0),
  synthetic_leverage_heatmap_generated INTEGER NOT NULL DEFAULT 0 CHECK(synthetic_leverage_heatmap_generated = 0),
  shadow_only INTEGER NOT NULL DEFAULT 1 CHECK(shadow_only = 1),
  persisted_ts INTEGER NOT NULL CHECK(persisted_ts > 0)
);

CREATE INDEX IF NOT EXISTS idx_liq_shadow_observed_ts
  ON liquidation_shadow_observation(observed_ts DESC);
CREATE INDEX IF NOT EXISTS idx_liq_shadow_contract_ts
  ON liquidation_shadow_observation(contract_code, observed_ts DESC);
CREATE INDEX IF NOT EXISTS idx_liq_shadow_status_ts
  ON liquidation_shadow_observation(projected_map_status, observed_ts DESC);

CREATE TABLE IF NOT EXISTS liquidation_cluster_state (
  cluster_key TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  contract_code TEXT NOT NULL,
  side TEXT NOT NULL,
  level_price REAL NOT NULL CHECK(level_price > 0),
  price_low REAL,
  price_high REAL,
  source_unit TEXT,
  first_seen_ts INTEGER NOT NULL CHECK(first_seen_ts > 0),
  last_seen_ts INTEGER NOT NULL CHECK(last_seen_ts >= first_seen_ts),
  persistence_observations INTEGER NOT NULL DEFAULT 1 CHECK(persistence_observations >= 1),
  lifecycle TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(lifecycle IN ('ACTIVE','APPROACHING','TOUCHED','SWEPT','EXPIRED','INVALIDATED')),
  last_distance_pct REAL,
  explicit_major INTEGER NOT NULL DEFAULT 0 CHECK(explicit_major IN (0,1)),
  last_raw_size REAL,
  last_strength REAL,
  source_model_version TEXT NOT NULL,
  last_observation_id TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_liq_cluster_contract_state
  ON liquidation_cluster_state(contract_code, lifecycle, last_seen_ts DESC);
CREATE INDEX IF NOT EXISTS idx_liq_cluster_last_seen
  ON liquidation_cluster_state(last_seen_ts DESC);
