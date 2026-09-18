-- MY_REPORT_2 V3 / Stage 2 / FREE-FIRST DATA PLANE
-- Additive shadow-only compact storage. No raw high-frequency tape is stored here.

CREATE TABLE IF NOT EXISTS v3_source_health_1m (
  source_id TEXT NOT NULL,
  venue TEXT NOT NULL,
  bucket_ts INTEGER NOT NULL CHECK(bucket_ts > 0),
  connected INTEGER NOT NULL DEFAULT 0 CHECK(connected IN (0,1)),
  health_state TEXT NOT NULL,
  last_event_ts INTEGER,
  event_gap_sec REAL,
  venue_latency_ms REAL,
  reconnect_count INTEGER NOT NULL DEFAULT 0 CHECK(reconnect_count >= 0),
  dropped_count INTEGER NOT NULL DEFAULT 0 CHECK(dropped_count >= 0),
  parse_error_count INTEGER NOT NULL DEFAULT 0 CHECK(parse_error_count >= 0),
  rate_limit_state TEXT NOT NULL DEFAULT 'UNKNOWN',
  symbol_coverage_pct REAL,
  coverage_class TEXT,
  last_error TEXT,
  persisted_ts INTEGER NOT NULL CHECK(persisted_ts > 0),
  shadow_only INTEGER NOT NULL DEFAULT 1 CHECK(shadow_only = 1),
  PRIMARY KEY(source_id, bucket_ts)
);
CREATE INDEX IF NOT EXISTS idx_v3_source_health_venue_ts
  ON v3_source_health_1m(venue, bucket_ts DESC);

CREATE TABLE IF NOT EXISTS v3_realized_liquidation_aggregate (
  contract_code TEXT NOT NULL,
  window_name TEXT NOT NULL CHECK(window_name IN ('1m','5m','15m','1h','4h','12h','24h')),
  end_ts INTEGER NOT NULL CHECK(end_ts > 0),
  event_count_observed INTEGER NOT NULL DEFAULT 0 CHECK(event_count_observed >= 0),
  known_side_count INTEGER NOT NULL DEFAULT 0 CHECK(known_side_count >= 0),
  unknown_side_count INTEGER NOT NULL DEFAULT 0 CHECK(unknown_side_count >= 0),
  long_liquidation_count INTEGER,
  short_liquidation_count INTEGER,
  known_long_liquidation_count INTEGER NOT NULL DEFAULT 0 CHECK(known_long_liquidation_count >= 0),
  known_short_liquidation_count INTEGER NOT NULL DEFAULT 0 CHECK(known_short_liquidation_count >= 0),
  total_notional_usdt REAL,
  known_notional_usdt REAL NOT NULL DEFAULT 0 CHECK(known_notional_usdt >= 0),
  long_notional_usdt REAL,
  short_notional_usdt REAL,
  max_single_event_usdt REAL,
  liquidation_side_imbalance REAL,
  venue_breadth INTEGER NOT NULL DEFAULT 0 CHECK(venue_breadth >= 0),
  venue_concentration REAL,
  burst_velocity_events_per_min REAL,
  burst_acceleration_events_per_min REAL,
  consecutive_burst_minutes INTEGER,
  liquidation_to_volume_ratio REAL,
  price_response_pct REAL,
  oi_response_pct REAL,
  flow_response_delta_usdt REAL,
  side_coverage_closed INTEGER NOT NULL DEFAULT 0 CHECK(side_coverage_closed IN (0,1)),
  notional_coverage_closed INTEGER NOT NULL DEFAULT 0 CHECK(notional_coverage_closed IN (0,1)),
  coverage_classes_json TEXT NOT NULL DEFAULT '[]',
  venues_json TEXT NOT NULL DEFAULT '[]',
  persisted_ts INTEGER NOT NULL CHECK(persisted_ts > 0),
  shadow_only INTEGER NOT NULL DEFAULT 1 CHECK(shadow_only = 1),
  PRIMARY KEY(contract_code, window_name, end_ts)
);
CREATE INDEX IF NOT EXISTS idx_v3_realized_liq_contract_ts
  ON v3_realized_liquidation_aggregate(contract_code, end_ts DESC);

CREATE TABLE IF NOT EXISTS v3_realized_liquidation_density_5m (
  contract_code TEXT NOT NULL,
  venue TEXT NOT NULL,
  liquidated_side TEXT NOT NULL CHECK(liquidated_side IN ('LONG','SHORT','UNKNOWN')),
  bucket_ts INTEGER NOT NULL CHECK(bucket_ts > 0),
  price_bucket_center REAL NOT NULL CHECK(price_bucket_center > 0),
  bucket_size_pct REAL NOT NULL CHECK(bucket_size_pct > 0),
  event_count INTEGER NOT NULL DEFAULT 0 CHECK(event_count >= 0),
  known_notional_usdt REAL NOT NULL DEFAULT 0 CHECK(known_notional_usdt >= 0),
  unknown_notional_count INTEGER NOT NULL DEFAULT 0 CHECK(unknown_notional_count >= 0),
  first_event_ts INTEGER,
  last_event_ts INTEGER,
  persisted_ts INTEGER NOT NULL CHECK(persisted_ts > 0),
  shadow_only INTEGER NOT NULL DEFAULT 1 CHECK(shadow_only = 1),
  PRIMARY KEY(contract_code, venue, liquidated_side, bucket_ts, price_bucket_center)
);
CREATE INDEX IF NOT EXISTS idx_v3_realized_density_contract_ts
  ON v3_realized_liquidation_density_5m(contract_code, bucket_ts DESC);

CREATE TABLE IF NOT EXISTS v3_projected_cluster_lifecycle_shadow (
  cluster_key TEXT PRIMARY KEY,
  contract_code TEXT NOT NULL,
  provider TEXT NOT NULL,
  cluster_type TEXT NOT NULL CHECK(cluster_type='PROJECTED_PROVIDER_MAP'),
  side TEXT NOT NULL,
  level_price REAL NOT NULL CHECK(level_price>0),
  price_low REAL,
  price_high REAL,
  strength REAL,
  strength_unit TEXT,
  distance_pct REAL,
  significance TEXT,
  first_seen_ts INTEGER NOT NULL,
  last_seen_ts INTEGER NOT NULL,
  strengthened INTEGER CHECK(strengthened IS NULL OR strengthened IN (0,1)),
  weakened INTEGER CHECK(weakened IS NULL OR weakened IN (0,1)),
  touched INTEGER NOT NULL DEFAULT 0 CHECK(touched IN (0,1)),
  swept INTEGER NOT NULL DEFAULT 0 CHECK(swept IN (0,1)),
  partially_swept INTEGER NOT NULL DEFAULT 0 CHECK(partially_swept IN (0,1)),
  invalidated INTEGER NOT NULL DEFAULT 0 CHECK(invalidated IN (0,1)),
  lifecycle TEXT NOT NULL,
  price_reaction_pct REAL,
  oi_reaction_pct REAL,
  provider_source_ts INTEGER,
  provider_identity_method TEXT NOT NULL DEFAULT 'EXACT_LEVEL_PRICE',
  guaranteed_tp INTEGER NOT NULL DEFAULT 0 CHECK(guaranteed_tp=0),
  shadow_only INTEGER NOT NULL DEFAULT 1 CHECK(shadow_only=1)
);
CREATE INDEX IF NOT EXISTS idx_v3_projected_cluster_contract_seen
  ON v3_projected_cluster_lifecycle_shadow(contract_code,last_seen_ts DESC);

CREATE TABLE IF NOT EXISTS v3_market_microstructure_1m (
  contract_code TEXT NOT NULL,
  venue TEXT NOT NULL,
  bucket_ts INTEGER NOT NULL CHECK(bucket_ts > 0),
  price REAL,
  mark REAL,
  index_price REAL,
  oi REAL,
  oi_value_usdt REAL,
  funding_rate REAL,
  funding_interval_hours REAL,
  bid REAL,
  ask REAL,
  top1_bid_usdt REAL,
  top1_ask_usdt REAL,
  top20_bid_usdt REAL,
  top20_ask_usdt REAL,
  imbalance REAL,
  trade_count INTEGER NOT NULL DEFAULT 0 CHECK(trade_count >= 0),
  taker_buy_usdt REAL,
  taker_sell_usdt REAL,
  delta_usdt REAL,
  trade_notional_coverage_closed INTEGER NOT NULL DEFAULT 0 CHECK(trade_notional_coverage_closed IN (0,1)),
  top_account_ratio REAL,
  top_position_ratio REAL,
  book_gap_detected INTEGER NOT NULL DEFAULT 0 CHECK(book_gap_detected IN (0,1)),
  coverage_json TEXT NOT NULL DEFAULT '{}',
  observed_ts INTEGER NOT NULL CHECK(observed_ts > 0),
  persisted_ts INTEGER NOT NULL CHECK(persisted_ts > 0),
  shadow_only INTEGER NOT NULL DEFAULT 1 CHECK(shadow_only=1),
  PRIMARY KEY(contract_code,venue,bucket_ts)
);
CREATE INDEX IF NOT EXISTS idx_v3_market_micro_contract_ts
  ON v3_market_microstructure_1m(contract_code,bucket_ts DESC);
