CREATE TABLE IF NOT EXISTS full_evidence_shadow_log (
  full_evidence_id TEXT PRIMARY KEY,
  shadow_id TEXT NOT NULL,
  contract_code TEXT NOT NULL,
  observed_ts INTEGER NOT NULL,
  rules_version TEXT NOT NULL,
  contract_version TEXT,
  adapters_version TEXT,
  mode TEXT NOT NULL CHECK (mode = 'FULL_EVIDENCE_SHADOW_NO_EXECUTION'),

  fixed_weights_json TEXT NOT NULL,
  weight_derivatives INTEGER NOT NULL DEFAULT 35 CHECK (weight_derivatives = 35),
  weight_market_strength_spot INTEGER NOT NULL DEFAULT 30 CHECK (weight_market_strength_spot = 30),
  weight_smart_money_onchain INTEGER NOT NULL DEFAULT 20 CHECK (weight_smart_money_onchain = 20),
  weight_supporting_risk INTEGER NOT NULL DEFAULT 15 CHECK (weight_supporting_risk = 15),
  strategy_weights_changed INTEGER NOT NULL DEFAULT 0 CHECK (strategy_weights_changed = 0),
  automatic_weight_tuning_enabled INTEGER NOT NULL DEFAULT 0 CHECK (automatic_weight_tuning_enabled = 0),

  htx_execution_gate_closed INTEGER NOT NULL CHECK (htx_execution_gate_closed IN (0,1)),
  dq_status TEXT NOT NULL,
  dq_usable_items INTEGER,
  dq_total_items INTEGER,
  dq_independent_groups INTEGER,
  dq_observed_weight_pct REAL,
  uncertainty_count INTEGER NOT NULL DEFAULT 0,

  missing_weighted_chains_json TEXT NOT NULL DEFAULT '[]',
  chain_status_json TEXT NOT NULL DEFAULT '{}',
  conflicts_json TEXT NOT NULL DEFAULT '[]',
  alias_verification_json TEXT NOT NULL DEFAULT '{}',
  evidence_compact_json TEXT NOT NULL DEFAULT '[]',
  relative_strength_json TEXT,
  prior_htx_shadow_json TEXT NOT NULL DEFAULT '{}',

  full_dc_long REAL CHECK (full_dc_long IS NULL),
  full_dc_short REAL CHECK (full_dc_short IS NULL),
  live_probability REAL CHECK (live_probability IS NULL),
  full_decision_eligible INTEGER NOT NULL DEFAULT 0 CHECK (full_decision_eligible = 0),
  live_signal INTEGER NOT NULL DEFAULT 0 CHECK (live_signal = 0),
  validated INTEGER NOT NULL DEFAULT 0 CHECK (validated = 0),
  telegram_started INTEGER NOT NULL DEFAULT 0 CHECK (telegram_started = 0),
  trading_execution INTEGER NOT NULL DEFAULT 0 CHECK (trading_execution = 0),

  missing_data_coerced_to_zero INTEGER NOT NULL DEFAULT 0 CHECK (missing_data_coerced_to_zero = 0),
  cross_venue_dispersion_called_conflict INTEGER NOT NULL DEFAULT 0 CHECK (cross_venue_dispersion_called_conflict = 0),
  shadow_only INTEGER NOT NULL DEFAULT 1 CHECK (shadow_only = 1),
  retention_days INTEGER NOT NULL DEFAULT 180 CHECK (retention_days = 180),

  persisted_ts INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_full_evidence_shadow_observed_ts
  ON full_evidence_shadow_log(observed_ts DESC);

CREATE INDEX IF NOT EXISTS idx_full_evidence_shadow_contract_ts
  ON full_evidence_shadow_log(contract_code, observed_ts DESC);

CREATE INDEX IF NOT EXISTS idx_full_evidence_shadow_dq_ts
  ON full_evidence_shadow_log(dq_status, observed_ts DESC);
