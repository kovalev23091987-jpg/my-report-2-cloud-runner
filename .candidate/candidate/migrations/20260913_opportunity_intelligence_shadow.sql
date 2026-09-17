-- My Report 2 / Stage 3.9
-- Additive, shadow-only Opportunity Intelligence schema.
-- This migration does not alter existing tables and must be applied locally
-- during candidate validation only unless production approval is given later.

CREATE TABLE IF NOT EXISTS opportunity_shadow_event (
  event_id TEXT PRIMARY KEY NOT NULL,
  version TEXT NOT NULL DEFAULT '3.9-opportunity-intelligence-shadow'
    CHECK (version = '3.9-opportunity-intelligence-shadow'),
  rules_version TEXT NOT NULL DEFAULT 'opportunity-effort-result-v1'
    CHECK (rules_version = 'opportunity-effort-result-v1'),
  mode TEXT NOT NULL DEFAULT 'OPPORTUNITY_INTELLIGENCE_SHADOW_NO_EXECUTION'
    CHECK (mode = 'OPPORTUNITY_INTELLIGENCE_SHADOW_NO_EXECUTION'),
  contract_code TEXT NOT NULL,
  exchange TEXT NOT NULL,
  timeframe TEXT NOT NULL CHECK (timeframe IN ('15m','1h','4h','1d')),
  event_ts INTEGER NOT NULL CHECK (event_ts > 0),
  event_close_ts INTEGER NOT NULL CHECK (event_close_ts > event_ts),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'ANOMALOUS_EFFORT_VS_RESULT','CONTROL_NON_ANOMALOUS'
  )),
  open_price REAL NOT NULL CHECK (open_price > 0),
  high_price REAL NOT NULL CHECK (high_price > 0),
  low_price REAL NOT NULL CHECK (low_price > 0),
  close_price REAL NOT NULL CHECK (close_price > 0),
  event_volume REAL NOT NULL CHECK (event_volume >= 0),
  volume_ratio_median REAL,
  volume_ratio_mean REAL,
  volume_robust_zscore REAL,
  body_range_ratio REAL,
  upper_wick_ratio REAL,
  lower_wick_ratio REAL,
  close_location REAL,
  cross_exchange_confirmed INTEGER NOT NULL DEFAULT 0
    CHECK (cross_exchange_confirmed IN (0,1)),
  single_exchange_anomaly INTEGER NOT NULL DEFAULT 0
    CHECK (single_exchange_anomaly IN (0,1)),
  control_group INTEGER NOT NULL DEFAULT 0 CHECK (control_group IN (0,1)),
  control_population TEXT,
  funnel_stage TEXT NOT NULL CHECK (funnel_stage IN (
    'ANOMALOUS_EVENT','EARLY_WATCH','CONFIRMATION_PENDING',
    'ENTRY_TRIGGER_SHADOW','CHASE_RISK','CONTROL'
  )),
  data_quality TEXT NOT NULL CHECK (data_quality IN (
    'OK','PARTIAL','STALE','MISSING','CONFLICTING'
  )),
  missing_fields_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(missing_fields_json)),
  event_json TEXT NOT NULL CHECK (json_valid(event_json)),
  observed_ts INTEGER NOT NULL CHECK (observed_ts >= event_close_ts),
  persisted_ts INTEGER NOT NULL CHECK (persisted_ts >= event_close_ts),
  retention_days INTEGER NOT NULL DEFAULT 365 CHECK (retention_days = 365),
  shadow_only INTEGER NOT NULL DEFAULT 1 CHECK (shadow_only = 1),
  classification_is_probability INTEGER NOT NULL DEFAULT 0
    CHECK (classification_is_probability = 0),
  live_probability REAL CHECK (live_probability IS NULL),
  live_signal INTEGER NOT NULL DEFAULT 0 CHECK (live_signal = 0),
  validated_signal INTEGER NOT NULL DEFAULT 0 CHECK (validated_signal = 0),
  decision_layer_changed INTEGER NOT NULL DEFAULT 0 CHECK (decision_layer_changed = 0),
  strategy_weights_changed INTEGER NOT NULL DEFAULT 0 CHECK (strategy_weights_changed = 0),
  telegram_started INTEGER NOT NULL DEFAULT 0 CHECK (telegram_started = 0),
  trading_execution INTEGER NOT NULL DEFAULT 0 CHECK (trading_execution = 0),
  automatic_weight_tuning INTEGER NOT NULL DEFAULT 0 CHECK (automatic_weight_tuning = 0),
  UNIQUE(contract_code, exchange, timeframe, event_ts, event_type),
  CHECK (high_price >= MAX(open_price, close_price, low_price)),
  CHECK (low_price <= MIN(open_price, close_price, high_price))
);

CREATE TABLE IF NOT EXISTS opportunity_shadow_outcome (
  event_id TEXT NOT NULL,
  contract_code TEXT NOT NULL,
  horizon TEXT NOT NULL CHECK (horizon IN ('1h','4h','12h','24h','3d','7d')),
  target_ts INTEGER NOT NULL CHECK (target_ts > 0),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING','CLOSED_FACTUAL','NO_CONFIRMED_HISTORICAL_DATA'
  )),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_attempt_ts INTEGER,
  closed_ts INTEGER,
  price REAL,
  return_pct REAL,
  mfe_pct REAL,
  mae_pct REAL,
  event_high_broken INTEGER CHECK (event_high_broken IS NULL OR event_high_broken IN (0,1)),
  event_low_broken INTEGER CHECK (event_low_broken IS NULL OR event_low_broken IN (0,1)),
  reclaim_detected INTEGER CHECK (reclaim_detected IS NULL OR reclaim_detected IN (0,1)),
  btc_relative_strength_pp REAL,
  eth_relative_strength_pp REAL,
  ease_of_movement_after REAL,
  supply_exhaustion_candidate INTEGER CHECK (supply_exhaustion_candidate IS NULL OR supply_exhaustion_candidate IN (0,1)),
  missed_opportunity_detected INTEGER CHECK (missed_opportunity_detected IS NULL OR missed_opportunity_detected IN (0,1)),
  false_rejection_candidate INTEGER CHECK (false_rejection_candidate IS NULL OR false_rejection_candidate IN (0,1)),
  late_entry_candidate INTEGER CHECK (late_entry_candidate IS NULL OR late_entry_candidate IN (0,1)),
  outcome_json TEXT CHECK (outcome_json IS NULL OR json_valid(outcome_json)),
  shadow_only INTEGER NOT NULL DEFAULT 1 CHECK (shadow_only = 1),
  classification_is_probability INTEGER NOT NULL DEFAULT 0
    CHECK (classification_is_probability = 0),
  live_probability REAL CHECK (live_probability IS NULL),
  live_signal INTEGER NOT NULL DEFAULT 0 CHECK (live_signal = 0),
  validated_signal INTEGER NOT NULL DEFAULT 0 CHECK (validated_signal = 0),
  decision_layer_changed INTEGER NOT NULL DEFAULT 0 CHECK (decision_layer_changed = 0),
  strategy_weights_changed INTEGER NOT NULL DEFAULT 0 CHECK (strategy_weights_changed = 0),
  telegram_started INTEGER NOT NULL DEFAULT 0 CHECK (telegram_started = 0),
  trading_execution INTEGER NOT NULL DEFAULT 0 CHECK (trading_execution = 0),
  automatic_weight_tuning INTEGER NOT NULL DEFAULT 0 CHECK (automatic_weight_tuning = 0),
  PRIMARY KEY(event_id, horizon),
  FOREIGN KEY(event_id) REFERENCES opportunity_shadow_event(event_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS opportunity_shadow_funnel (
  funnel_id TEXT PRIMARY KEY NOT NULL,
  run_id TEXT NOT NULL,
  contract_code TEXT NOT NULL,
  observed_ts INTEGER NOT NULL CHECK (observed_ts > 0),
  anomaly_count INTEGER NOT NULL DEFAULT 0 CHECK (anomaly_count >= 0),
  control_count INTEGER NOT NULL DEFAULT 0 CHECK (control_count >= 0),
  newest_stage TEXT CHECK (newest_stage IS NULL OR newest_stage IN (
    'ANOMALOUS_EVENT','EARLY_WATCH','CONFIRMATION_PENDING',
    'ENTRY_TRIGGER_SHADOW','CHASE_RISK','CONTROL'
  )),
  cross_exchange_confirmed_count INTEGER NOT NULL DEFAULT 0 CHECK (cross_exchange_confirmed_count >= 0),
  single_exchange_count INTEGER NOT NULL DEFAULT 0 CHECK (single_exchange_count >= 0),
  missed_opportunity_count INTEGER NOT NULL DEFAULT 0 CHECK (missed_opportunity_count >= 0),
  false_rejection_count INTEGER NOT NULL DEFAULT 0 CHECK (false_rejection_count >= 0),
  late_entry_count INTEGER NOT NULL DEFAULT 0 CHECK (late_entry_count >= 0),
  capacity_drop_count INTEGER NOT NULL DEFAULT 0 CHECK (capacity_drop_count >= 0),
  queue_starvation INTEGER NOT NULL DEFAULT 0 CHECK (queue_starvation IN (0,1)),
  drop_reasons_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(drop_reasons_json)),
  funnel_json TEXT NOT NULL CHECK (json_valid(funnel_json)),
  shadow_only INTEGER NOT NULL DEFAULT 1 CHECK (shadow_only = 1),
  classification_is_probability INTEGER NOT NULL DEFAULT 0
    CHECK (classification_is_probability = 0),
  live_probability REAL CHECK (live_probability IS NULL),
  live_signal INTEGER NOT NULL DEFAULT 0 CHECK (live_signal = 0),
  validated_signal INTEGER NOT NULL DEFAULT 0 CHECK (validated_signal = 0),
  decision_layer_changed INTEGER NOT NULL DEFAULT 0 CHECK (decision_layer_changed = 0),
  strategy_weights_changed INTEGER NOT NULL DEFAULT 0 CHECK (strategy_weights_changed = 0),
  telegram_started INTEGER NOT NULL DEFAULT 0 CHECK (telegram_started = 0),
  trading_execution INTEGER NOT NULL DEFAULT 0 CHECK (trading_execution = 0),
  automatic_weight_tuning INTEGER NOT NULL DEFAULT 0 CHECK (automatic_weight_tuning = 0)
);

CREATE INDEX IF NOT EXISTS idx_opportunity_event_contract_ts
  ON opportunity_shadow_event(contract_code, event_ts DESC);
CREATE INDEX IF NOT EXISTS idx_opportunity_event_type_ts
  ON opportunity_shadow_event(event_type, event_ts DESC);
CREATE INDEX IF NOT EXISTS idx_opportunity_event_stage_ts
  ON opportunity_shadow_event(funnel_stage, event_ts DESC);
CREATE INDEX IF NOT EXISTS idx_opportunity_outcome_due
  ON opportunity_shadow_outcome(status, target_ts);
CREATE INDEX IF NOT EXISTS idx_opportunity_outcome_contract_horizon
  ON opportunity_shadow_outcome(contract_code, horizon, status);
CREATE INDEX IF NOT EXISTS idx_opportunity_funnel_observed
  ON opportunity_shadow_funnel(observed_ts DESC);
