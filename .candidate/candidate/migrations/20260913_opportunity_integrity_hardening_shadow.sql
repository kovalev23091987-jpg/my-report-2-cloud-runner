-- My Report 2 / Stage 3.9.1
-- Additive, shadow-only integrity hardening for Opportunity Intelligence.
-- Local candidate validation only. No production migration is performed.

ALTER TABLE opportunity_shadow_event ADD COLUMN integrity_version TEXT NOT NULL
  DEFAULT 'LEGACY_STAGE39_UNASSESSED'
  CHECK (integrity_version IN (
    'LEGACY_STAGE39_UNASSESSED','3.9.1-opportunity-integrity-hardening-shadow'
  ));
ALTER TABLE opportunity_shadow_event ADD COLUMN integrity_rules_version TEXT NOT NULL
  DEFAULT 'LEGACY_STAGE39_UNASSESSED'
  CHECK (integrity_rules_version IN (
    'LEGACY_STAGE39_UNASSESSED','opportunity-integrity-v2'
  ));
ALTER TABLE opportunity_shadow_event ADD COLUMN episode_id TEXT;
ALTER TABLE opportunity_shadow_event ADD COLUMN episode_start_ts INTEGER;
ALTER TABLE opportunity_shadow_event ADD COLUMN episode_end_ts INTEGER;
ALTER TABLE opportunity_shadow_event ADD COLUMN independence_start_ts INTEGER;
ALTER TABLE opportunity_shadow_event ADD COLUMN independence_end_ts INTEGER;
ALTER TABLE opportunity_shadow_event ADD COLUMN independent_sample INTEGER NOT NULL
  DEFAULT 0 CHECK (independent_sample IN (0,1));
ALTER TABLE opportunity_shadow_event ADD COLUMN related_signal_count INTEGER NOT NULL
  DEFAULT 0 CHECK (related_signal_count >= 0);
ALTER TABLE opportunity_shadow_event ADD COLUMN related_timeframes_json TEXT NOT NULL
  DEFAULT '[]' CHECK (json_valid(related_timeframes_json));
ALTER TABLE opportunity_shadow_event ADD COLUMN direction_at_event TEXT NOT NULL
  DEFAULT 'NONE' CHECK (direction_at_event IN ('NONE','LONG','SHORT'));
ALTER TABLE opportunity_shadow_event ADD COLUMN direction_source TEXT;
ALTER TABLE opportunity_shadow_event ADD COLUMN direction_rules_version TEXT;
ALTER TABLE opportunity_shadow_event ADD COLUMN direction_locked_ts INTEGER;
ALTER TABLE opportunity_shadow_event ADD COLUMN directional_evaluation_eligible INTEGER NOT NULL
  DEFAULT 0 CHECK (directional_evaluation_eligible IN (0,1));
ALTER TABLE opportunity_shadow_event ADD COLUMN control_eligible INTEGER NOT NULL
  DEFAULT 0 CHECK (control_eligible IN (0,1));
ALTER TABLE opportunity_shadow_event ADD COLUMN control_maturity_ts INTEGER;
ALTER TABLE opportunity_shadow_event ADD COLUMN contamination_status TEXT NOT NULL
  DEFAULT 'LEGACY_UNASSESSED';
ALTER TABLE opportunity_shadow_event ADD COLUMN cvd_delta_quality TEXT NOT NULL
  DEFAULT 'UNVERIFIED';

ALTER TABLE opportunity_shadow_outcome ADD COLUMN next_attempt_ts INTEGER;
ALTER TABLE opportunity_shadow_outcome ADD COLUMN source_retention_deadline_ts INTEGER;
ALTER TABLE opportunity_shadow_outcome ADD COLUMN direction_at_event TEXT NOT NULL
  DEFAULT 'NONE' CHECK (direction_at_event IN ('NONE','LONG','SHORT'));
ALTER TABLE opportunity_shadow_outcome ADD COLUMN directional_evaluation_eligible INTEGER NOT NULL
  DEFAULT 0 CHECK (directional_evaluation_eligible IN (0,1));
ALTER TABLE opportunity_shadow_outcome ADD COLUMN trajectory_complete INTEGER NOT NULL
  DEFAULT 0 CHECK (trajectory_complete IN (0,1));
ALTER TABLE opportunity_shadow_outcome ADD COLUMN source_timeframe TEXT;
ALTER TABLE opportunity_shadow_outcome ADD COLUMN expected_bars INTEGER;
ALTER TABLE opportunity_shadow_outcome ADD COLUMN observed_bars INTEGER;
ALTER TABLE opportunity_shadow_outcome ADD COLUMN trajectory_coverage_pct REAL;
ALTER TABLE opportunity_shadow_outcome ADD COLUMN source_start_ts INTEGER;
ALTER TABLE opportunity_shadow_outcome ADD COLUMN source_end_ts INTEGER;
ALTER TABLE opportunity_shadow_outcome ADD COLUMN source_bar_duration_ms INTEGER;
ALTER TABLE opportunity_shadow_outcome ADD COLUMN max_up_excursion_pct REAL;
ALTER TABLE opportunity_shadow_outcome ADD COLUMN max_down_excursion_pct REAL;
ALTER TABLE opportunity_shadow_outcome ADD COLUMN directional_return_pct REAL;
ALTER TABLE opportunity_shadow_outcome ADD COLUMN closure_quality TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_opportunity_event_episode_unique
  ON opportunity_shadow_event(episode_id)
  WHERE episode_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_opportunity_event_independence
  ON opportunity_shadow_event(contract_code,independence_start_ts,independence_end_ts)
  WHERE independent_sample=1;
CREATE INDEX IF NOT EXISTS idx_opportunity_event_control_integrity
  ON opportunity_shadow_event(control_group,control_eligible,contamination_status,event_ts DESC);
CREATE INDEX IF NOT EXISTS idx_opportunity_outcome_retry_due
  ON opportunity_shadow_outcome(status,next_attempt_ts,target_ts,contract_code);

CREATE TRIGGER IF NOT EXISTS trg_opportunity_event_integrity_insert
BEFORE INSERT ON opportunity_shadow_event
WHEN NEW.independent_sample=1
BEGIN
  SELECT CASE WHEN
    NEW.integrity_version<>'3.9.1-opportunity-integrity-hardening-shadow' OR
    NEW.integrity_rules_version<>'opportunity-integrity-v2' OR
    NEW.episode_id IS NULL OR
    NEW.episode_start_ts IS NULL OR NEW.episode_end_ts IS NULL OR
    NEW.independence_start_ts IS NULL OR NEW.independence_end_ts IS NULL OR
    NEW.episode_end_ts<=NEW.episode_start_ts OR
    NEW.independence_end_ts<=NEW.independence_start_ts OR
    NEW.episode_start_ts<NEW.independence_start_ts OR
    NEW.episode_end_ts>NEW.independence_end_ts OR
    NEW.event_ts<NEW.episode_start_ts OR NEW.event_close_ts>NEW.episode_end_ts
  THEN RAISE(ABORT,'OPPORTUNITY_INVALID_INDEPENDENCE_INTERVAL') END;
  SELECT CASE WHEN
    NEW.control_group=1 AND (
      NEW.event_type<>'CONTROL_NON_ANOMALOUS' OR NEW.control_eligible<>1 OR
      NEW.contamination_status<>'ISOLATED_FROM_KNOWN_SIGNAL_EPISODES' OR
      NEW.direction_at_event<>'NONE' OR NEW.directional_evaluation_eligible<>0 OR
      TRIM(COALESCE(NEW.control_population,''))='' OR NEW.funnel_stage<>'CONTROL' OR
      NEW.control_maturity_ts<NEW.event_close_ts+604800000 OR
      json_type(NEW.related_timeframes_json)<>'array' OR
      json_array_length(NEW.related_timeframes_json)<>0
    )
  THEN RAISE(ABORT,'OPPORTUNITY_CONTROL_INTEGRITY_VIOLATION') END;
  SELECT CASE WHEN
    NEW.control_group=0 AND (
      NEW.event_type<>'ANOMALOUS_EFFORT_VS_RESULT' OR NEW.control_eligible<>0 OR
      NEW.contamination_status<>'SIGNAL_EPISODE_NOT_CONTROL' OR
      NEW.control_maturity_ts IS NOT NULL OR NEW.funnel_stage='CONTROL' OR
      NEW.related_signal_count<1 OR
      json_type(NEW.related_timeframes_json)<>'array' OR
      json_array_length(NEW.related_timeframes_json)<1
    )
  THEN RAISE(ABORT,'OPPORTUNITY_SIGNAL_MARKED_AS_CONTROL') END;
  SELECT CASE WHEN
    (NEW.control_group=1 AND (
      NEW.control_maturity_ts IS NULL OR NEW.control_maturity_ts>NEW.observed_ts OR
      NEW.related_signal_count<>0
    )) OR
    (NEW.control_group=0 AND (
      NEW.control_maturity_ts IS NOT NULL OR NEW.related_signal_count<1
    ))
  THEN RAISE(ABORT,'OPPORTUNITY_INVALID_EVENT_ROLE_METADATA') END;
  SELECT CASE WHEN
    NEW.directional_evaluation_eligible=1 AND (
      NEW.direction_at_event NOT IN ('LONG','SHORT') OR
      NEW.direction_locked_ts IS NULL OR
      NEW.direction_locked_ts<>NEW.event_close_ts OR
      TRIM(COALESCE(NEW.direction_source,''))='' OR
      TRIM(COALESCE(NEW.direction_rules_version,''))=''
    )
  THEN RAISE(ABORT,'OPPORTUNITY_RETROSPECTIVE_DIRECTION_FORBIDDEN') END;
  SELECT CASE WHEN
    NEW.directional_evaluation_eligible=0 AND (
      NEW.direction_at_event<>'NONE' OR NEW.direction_locked_ts IS NOT NULL
    )
  THEN RAISE(ABORT,'OPPORTUNITY_UNSCORABLE_DIRECTION_METADATA_FORBIDDEN') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM opportunity_shadow_event prior
    WHERE prior.contract_code=NEW.contract_code
      AND prior.independent_sample=1
      AND prior.event_id<>NEW.event_id
      AND prior.independence_start_ts<NEW.independence_end_ts
      AND prior.independence_end_ts>NEW.independence_start_ts
  ) THEN RAISE(ABORT,'OPPORTUNITY_INDEPENDENCE_OVERLAP') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_opportunity_event_integrity_update
BEFORE UPDATE OF event_id,integrity_version,integrity_rules_version,contract_code,
  event_type,event_ts,event_close_ts,observed_ts,episode_id,episode_start_ts,episode_end_ts,
  independence_start_ts,independence_end_ts,independent_sample,
  control_group,control_eligible,contamination_status,direction_at_event,
  direction_source,direction_rules_version,direction_locked_ts,
  directional_evaluation_eligible,control_maturity_ts,related_signal_count
ON opportunity_shadow_event
WHEN NEW.independent_sample=1
BEGIN
  SELECT CASE WHEN
    NEW.integrity_version<>'3.9.1-opportunity-integrity-hardening-shadow' OR
    NEW.integrity_rules_version<>'opportunity-integrity-v2' OR
    NEW.episode_id IS NULL OR
    NEW.episode_start_ts IS NULL OR NEW.episode_end_ts IS NULL OR
    NEW.independence_start_ts IS NULL OR NEW.independence_end_ts IS NULL OR
    NEW.episode_end_ts<=NEW.episode_start_ts OR
    NEW.independence_end_ts<=NEW.independence_start_ts OR
    NEW.episode_start_ts<NEW.independence_start_ts OR
    NEW.episode_end_ts>NEW.independence_end_ts OR
    NEW.event_ts<NEW.episode_start_ts OR NEW.event_close_ts>NEW.episode_end_ts
  THEN RAISE(ABORT,'OPPORTUNITY_INVALID_INDEPENDENCE_INTERVAL') END;
  SELECT CASE WHEN
    NEW.control_group=1 AND (
      NEW.event_type<>'CONTROL_NON_ANOMALOUS' OR NEW.control_eligible<>1 OR
      NEW.contamination_status<>'ISOLATED_FROM_KNOWN_SIGNAL_EPISODES' OR
      NEW.direction_at_event<>'NONE' OR NEW.directional_evaluation_eligible<>0 OR
      TRIM(COALESCE(NEW.control_population,''))='' OR NEW.funnel_stage<>'CONTROL' OR
      NEW.control_maturity_ts<NEW.event_close_ts+604800000 OR
      json_type(NEW.related_timeframes_json)<>'array' OR
      json_array_length(NEW.related_timeframes_json)<>0
    )
  THEN RAISE(ABORT,'OPPORTUNITY_CONTROL_INTEGRITY_VIOLATION') END;
  SELECT CASE WHEN
    NEW.control_group=0 AND (
      NEW.event_type<>'ANOMALOUS_EFFORT_VS_RESULT' OR NEW.control_eligible<>0 OR
      NEW.contamination_status<>'SIGNAL_EPISODE_NOT_CONTROL' OR
      NEW.control_maturity_ts IS NOT NULL OR NEW.funnel_stage='CONTROL' OR
      NEW.related_signal_count<1 OR
      json_type(NEW.related_timeframes_json)<>'array' OR
      json_array_length(NEW.related_timeframes_json)<1
    )
  THEN RAISE(ABORT,'OPPORTUNITY_SIGNAL_MARKED_AS_CONTROL') END;
  SELECT CASE WHEN
    (NEW.control_group=1 AND (
      NEW.control_maturity_ts IS NULL OR NEW.control_maturity_ts>NEW.observed_ts OR
      NEW.related_signal_count<>0
    )) OR
    (NEW.control_group=0 AND (
      NEW.control_maturity_ts IS NOT NULL OR NEW.related_signal_count<1
    ))
  THEN RAISE(ABORT,'OPPORTUNITY_INVALID_EVENT_ROLE_METADATA') END;
  SELECT CASE WHEN
    NEW.directional_evaluation_eligible=1 AND (
      NEW.direction_at_event NOT IN ('LONG','SHORT') OR
      NEW.direction_locked_ts IS NULL OR
      NEW.direction_locked_ts<>NEW.event_close_ts OR
      TRIM(COALESCE(NEW.direction_source,''))='' OR
      TRIM(COALESCE(NEW.direction_rules_version,''))=''
    )
  THEN RAISE(ABORT,'OPPORTUNITY_RETROSPECTIVE_DIRECTION_FORBIDDEN') END;
  SELECT CASE WHEN
    NEW.directional_evaluation_eligible=0 AND (
      NEW.direction_at_event<>'NONE' OR NEW.direction_locked_ts IS NOT NULL
    )
  THEN RAISE(ABORT,'OPPORTUNITY_UNSCORABLE_DIRECTION_METADATA_FORBIDDEN') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM opportunity_shadow_event prior
    WHERE prior.contract_code=NEW.contract_code
      AND prior.independent_sample=1
      AND prior.event_id<>NEW.event_id
      AND prior.independence_start_ts<NEW.independence_end_ts
      AND prior.independence_end_ts>NEW.independence_start_ts
  ) THEN RAISE(ABORT,'OPPORTUNITY_INDEPENDENCE_OVERLAP') END;
END;

-- The JSON evidence is what the outcome engine reads. Its immutable factual
-- fields must agree with the normalized columns at admission time; otherwise a
-- caller could preserve valid scalar columns while substituting a different
-- historical candle or direction inside event_json.
CREATE TRIGGER IF NOT EXISTS trg_opportunity_event_json_integrity_insert
BEFORE INSERT ON opportunity_shadow_event
WHEN NEW.independent_sample=1
BEGIN
  SELECT CASE WHEN
    COALESCE(json_extract(NEW.event_json,'$.event_id'),'')<>NEW.event_id OR
    COALESCE(json_extract(NEW.event_json,'$.contract'),'')<>NEW.contract_code OR
    COALESCE(json_extract(NEW.event_json,'$.exchange'),'')<>NEW.exchange OR
    COALESCE(json_extract(NEW.event_json,'$.timeframe'),'')<>NEW.timeframe OR
    COALESCE(json_extract(NEW.event_json,'$.timestamp'),-1)<>NEW.event_ts OR
    COALESCE(json_extract(NEW.event_json,'$.event_close_ts'),-1)<>NEW.event_close_ts OR
    COALESCE(json_extract(NEW.event_json,'$.event_type'),'')<>NEW.event_type OR
    COALESCE(json_extract(NEW.event_json,'$.candle.open'),-1)<>NEW.open_price OR
    COALESCE(json_extract(NEW.event_json,'$.candle.high'),-1)<>NEW.high_price OR
    COALESCE(json_extract(NEW.event_json,'$.candle.low'),-1)<>NEW.low_price OR
    COALESCE(json_extract(NEW.event_json,'$.candle.close'),-1)<>NEW.close_price OR
    COALESCE(json_extract(NEW.event_json,'$.candle.volume'),-1)<>NEW.event_volume OR
    COALESCE(json_extract(NEW.event_json,'$.episode_id'),'')<>NEW.episode_id OR
    COALESCE(json_extract(NEW.event_json,'$.episode_start_ts'),-1)<>NEW.episode_start_ts OR
    COALESCE(json_extract(NEW.event_json,'$.episode_end_ts'),-1)<>NEW.episode_end_ts OR
    COALESCE(json_extract(NEW.event_json,'$.independence_start_ts'),-1)<>NEW.independence_start_ts OR
    COALESCE(json_extract(NEW.event_json,'$.independence_end_ts'),-1)<>NEW.independence_end_ts OR
    COALESCE(json_extract(NEW.event_json,'$.independent_sample'),0)<>1 OR
    COALESCE(json_extract(NEW.event_json,'$.related_signal_count'),-1)<>NEW.related_signal_count OR
    json_type(NEW.event_json,'$.related_timeframes')<>'array' OR
    json_array_length(NEW.event_json,'$.related_timeframes')<>
      json_array_length(NEW.related_timeframes_json) OR
    COALESCE(json_extract(NEW.event_json,'$.control_group'),0)<>NEW.control_group OR
    COALESCE(json_extract(NEW.event_json,'$.control_eligible'),0)<>NEW.control_eligible OR
    COALESCE(json_extract(NEW.event_json,'$.control_maturity_ts'),-1)<>
      COALESCE(NEW.control_maturity_ts,-1) OR
    COALESCE(json_extract(NEW.event_json,'$.contamination_status'),'')<>NEW.contamination_status OR
    COALESCE(json_extract(NEW.event_json,'$.direction_at_event'),'')<>NEW.direction_at_event OR
    COALESCE(json_extract(NEW.event_json,'$.direction_source'),'')<>
      COALESCE(NEW.direction_source,'') OR
    COALESCE(json_extract(NEW.event_json,'$.direction_rules_version'),'')<>
      COALESCE(NEW.direction_rules_version,'') OR
    COALESCE(json_extract(NEW.event_json,'$.direction_locked_ts'),-1)<>
      COALESCE(NEW.direction_locked_ts,-1) OR
    COALESCE(json_extract(NEW.event_json,'$.directional_evaluation_eligible'),0)<>
      NEW.directional_evaluation_eligible OR
    COALESCE(json_extract(NEW.event_json,'$.market_flow.cvd_delta_quality'),'UNVERIFIED')<>
      NEW.cvd_delta_quality
  THEN RAISE(ABORT,'OPPORTUNITY_EVENT_JSON_SCALAR_MISMATCH') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_opportunity_event_json_integrity_update
BEFORE UPDATE ON opportunity_shadow_event
WHEN NEW.independent_sample=1 AND OLD.independent_sample=0
BEGIN
  SELECT CASE WHEN
    COALESCE(json_extract(NEW.event_json,'$.event_id'),'')<>NEW.event_id OR
    COALESCE(json_extract(NEW.event_json,'$.contract'),'')<>NEW.contract_code OR
    COALESCE(json_extract(NEW.event_json,'$.exchange'),'')<>NEW.exchange OR
    COALESCE(json_extract(NEW.event_json,'$.timeframe'),'')<>NEW.timeframe OR
    COALESCE(json_extract(NEW.event_json,'$.timestamp'),-1)<>NEW.event_ts OR
    COALESCE(json_extract(NEW.event_json,'$.event_close_ts'),-1)<>NEW.event_close_ts OR
    COALESCE(json_extract(NEW.event_json,'$.event_type'),'')<>NEW.event_type OR
    COALESCE(json_extract(NEW.event_json,'$.candle.open'),-1)<>NEW.open_price OR
    COALESCE(json_extract(NEW.event_json,'$.candle.high'),-1)<>NEW.high_price OR
    COALESCE(json_extract(NEW.event_json,'$.candle.low'),-1)<>NEW.low_price OR
    COALESCE(json_extract(NEW.event_json,'$.candle.close'),-1)<>NEW.close_price OR
    COALESCE(json_extract(NEW.event_json,'$.candle.volume'),-1)<>NEW.event_volume OR
    COALESCE(json_extract(NEW.event_json,'$.episode_id'),'')<>NEW.episode_id OR
    COALESCE(json_extract(NEW.event_json,'$.episode_start_ts'),-1)<>NEW.episode_start_ts OR
    COALESCE(json_extract(NEW.event_json,'$.episode_end_ts'),-1)<>NEW.episode_end_ts OR
    COALESCE(json_extract(NEW.event_json,'$.independence_start_ts'),-1)<>NEW.independence_start_ts OR
    COALESCE(json_extract(NEW.event_json,'$.independence_end_ts'),-1)<>NEW.independence_end_ts OR
    COALESCE(json_extract(NEW.event_json,'$.independent_sample'),0)<>1 OR
    COALESCE(json_extract(NEW.event_json,'$.related_signal_count'),-1)<>NEW.related_signal_count OR
    json_type(NEW.event_json,'$.related_timeframes')<>'array' OR
    json_array_length(NEW.event_json,'$.related_timeframes')<>
      json_array_length(NEW.related_timeframes_json) OR
    COALESCE(json_extract(NEW.event_json,'$.control_group'),0)<>NEW.control_group OR
    COALESCE(json_extract(NEW.event_json,'$.control_eligible'),0)<>NEW.control_eligible OR
    COALESCE(json_extract(NEW.event_json,'$.control_maturity_ts'),-1)<>
      COALESCE(NEW.control_maturity_ts,-1) OR
    COALESCE(json_extract(NEW.event_json,'$.contamination_status'),'')<>NEW.contamination_status OR
    COALESCE(json_extract(NEW.event_json,'$.direction_at_event'),'')<>NEW.direction_at_event OR
    COALESCE(json_extract(NEW.event_json,'$.direction_source'),'')<>
      COALESCE(NEW.direction_source,'') OR
    COALESCE(json_extract(NEW.event_json,'$.direction_rules_version'),'')<>
      COALESCE(NEW.direction_rules_version,'') OR
    COALESCE(json_extract(NEW.event_json,'$.direction_locked_ts'),-1)<>
      COALESCE(NEW.direction_locked_ts,-1) OR
    COALESCE(json_extract(NEW.event_json,'$.directional_evaluation_eligible'),0)<>
      NEW.directional_evaluation_eligible OR
    COALESCE(json_extract(NEW.event_json,'$.market_flow.cvd_delta_quality'),'UNVERIFIED')<>
      NEW.cvd_delta_quality
  THEN RAISE(ABORT,'OPPORTUNITY_EVENT_JSON_SCALAR_MISMATCH') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_opportunity_independent_event_immutable
BEFORE UPDATE ON opportunity_shadow_event
WHEN OLD.independent_sample=1 AND NEW.independent_sample=1
BEGIN
  SELECT RAISE(ABORT,'OPPORTUNITY_INDEPENDENT_EVENT_IMMUTABLE');
END;

-- The only allowed transition out of the independent population is the
-- atomic invalidation of a previously eligible control. All factual evidence
-- and all safety metadata remain immutable during that transition.
CREATE TRIGGER IF NOT EXISTS trg_opportunity_event_invalidation_guard
BEFORE UPDATE ON opportunity_shadow_event
WHEN OLD.independent_sample=1 AND NEW.independent_sample=0
BEGIN
  SELECT CASE WHEN
    OLD.control_group<>1 OR OLD.control_eligible<>1 OR
    NEW.control_group<>1 OR NEW.control_eligible<>0 OR
    NEW.contamination_status<>'CONTAMINATED_BY_LATER_DISCOVERED_SIGNAL' OR
    NEW.event_id IS NOT OLD.event_id OR NEW.version IS NOT OLD.version OR
    NEW.rules_version IS NOT OLD.rules_version OR NEW.mode IS NOT OLD.mode OR
    NEW.contract_code IS NOT OLD.contract_code OR NEW.exchange IS NOT OLD.exchange OR
    NEW.timeframe IS NOT OLD.timeframe OR NEW.event_ts IS NOT OLD.event_ts OR
    NEW.event_close_ts IS NOT OLD.event_close_ts OR NEW.event_type IS NOT OLD.event_type OR
    NEW.open_price IS NOT OLD.open_price OR NEW.high_price IS NOT OLD.high_price OR
    NEW.low_price IS NOT OLD.low_price OR NEW.close_price IS NOT OLD.close_price OR
    NEW.event_volume IS NOT OLD.event_volume OR
    NEW.volume_ratio_median IS NOT OLD.volume_ratio_median OR
    NEW.volume_ratio_mean IS NOT OLD.volume_ratio_mean OR
    NEW.volume_robust_zscore IS NOT OLD.volume_robust_zscore OR
    NEW.body_range_ratio IS NOT OLD.body_range_ratio OR
    NEW.upper_wick_ratio IS NOT OLD.upper_wick_ratio OR
    NEW.lower_wick_ratio IS NOT OLD.lower_wick_ratio OR
    NEW.close_location IS NOT OLD.close_location OR
    NEW.cross_exchange_confirmed IS NOT OLD.cross_exchange_confirmed OR
    NEW.single_exchange_anomaly IS NOT OLD.single_exchange_anomaly OR
    NEW.control_population IS NOT OLD.control_population OR
    NEW.funnel_stage IS NOT OLD.funnel_stage OR NEW.data_quality IS NOT OLD.data_quality OR
    NEW.missing_fields_json IS NOT OLD.missing_fields_json OR
    NEW.event_json IS NOT OLD.event_json OR NEW.observed_ts IS NOT OLD.observed_ts OR
    NEW.persisted_ts IS NOT OLD.persisted_ts OR NEW.retention_days IS NOT OLD.retention_days OR
    NEW.shadow_only IS NOT OLD.shadow_only OR
    NEW.classification_is_probability IS NOT OLD.classification_is_probability OR
    NEW.live_probability IS NOT OLD.live_probability OR NEW.live_signal IS NOT OLD.live_signal OR
    NEW.validated_signal IS NOT OLD.validated_signal OR
    NEW.decision_layer_changed IS NOT OLD.decision_layer_changed OR
    NEW.strategy_weights_changed IS NOT OLD.strategy_weights_changed OR
    NEW.telegram_started IS NOT OLD.telegram_started OR
    NEW.trading_execution IS NOT OLD.trading_execution OR
    NEW.automatic_weight_tuning IS NOT OLD.automatic_weight_tuning OR
    NEW.integrity_version IS NOT OLD.integrity_version OR
    NEW.integrity_rules_version IS NOT OLD.integrity_rules_version OR
    NEW.episode_id IS NOT OLD.episode_id OR
    NEW.episode_start_ts IS NOT OLD.episode_start_ts OR
    NEW.episode_end_ts IS NOT OLD.episode_end_ts OR
    NEW.independence_start_ts IS NOT OLD.independence_start_ts OR
    NEW.independence_end_ts IS NOT OLD.independence_end_ts OR
    NEW.related_signal_count IS NOT OLD.related_signal_count OR
    NEW.related_timeframes_json IS NOT OLD.related_timeframes_json OR
    NEW.direction_at_event IS NOT OLD.direction_at_event OR
    NEW.direction_source IS NOT OLD.direction_source OR
    NEW.direction_rules_version IS NOT OLD.direction_rules_version OR
    NEW.direction_locked_ts IS NOT OLD.direction_locked_ts OR
    NEW.directional_evaluation_eligible IS NOT OLD.directional_evaluation_eligible OR
    NEW.control_maturity_ts IS NOT OLD.control_maturity_ts OR
    NEW.cvd_delta_quality IS NOT OLD.cvd_delta_quality
  THEN RAISE(ABORT,'OPPORTUNITY_INVALIDATION_MUTATED_FACTUAL_EVENT') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_opportunity_outcome_schedule_insert
BEFORE INSERT ON opportunity_shadow_outcome
WHEN EXISTS (
  SELECT 1 FROM opportunity_shadow_event e
  WHERE e.event_id=NEW.event_id AND e.independent_sample=1
)
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM opportunity_shadow_event e
    WHERE e.event_id=NEW.event_id
      AND e.contract_code=NEW.contract_code
      AND e.direction_at_event=NEW.direction_at_event
      AND e.directional_evaluation_eligible=NEW.directional_evaluation_eligible
      AND NEW.source_retention_deadline_ts=e.event_close_ts+
        CASE e.timeframe WHEN '15m' THEN 1728000000 ELSE 6912000000 END
      AND NEW.target_ts=e.event_close_ts+CASE NEW.horizon
        WHEN '1h' THEN 3600000 WHEN '4h' THEN 14400000
        WHEN '12h' THEN 43200000 WHEN '24h' THEN 86400000
        WHEN '3d' THEN 259200000 WHEN '7d' THEN 604800000 END
  ) THEN RAISE(ABORT,'OPPORTUNITY_OUTCOME_EVENT_LINK_MISMATCH') END;
  SELECT CASE WHEN
    NEW.source_retention_deadline_ts IS NULL OR
    NEW.source_retention_deadline_ts<=NEW.target_ts
  THEN RAISE(ABORT,'OPPORTUNITY_INVALID_OUTCOME_RETENTION') END;
  SELECT CASE WHEN
    NEW.status='PENDING' AND (
      NEW.closed_ts IS NOT NULL OR NEW.next_attempt_ts IS NULL OR
      NEW.next_attempt_ts<NEW.target_ts
    )
  THEN RAISE(ABORT,'OPPORTUNITY_INVALID_PENDING_OUTCOME_SCHEDULE') END;
  -- SQLite evaluates BEFORE INSERT triggers before resolving an UPSERT conflict.
  -- A terminal candidate is therefore accepted only when it is updating an
  -- already scheduled PENDING row; an unscheduled terminal insert fails closed.
  SELECT CASE WHEN NEW.status<>'PENDING' AND NOT EXISTS (
    SELECT 1 FROM opportunity_shadow_outcome prior
    WHERE prior.event_id=NEW.event_id AND prior.horizon=NEW.horizon
      AND prior.status='PENDING'
  ) THEN RAISE(ABORT,'OPPORTUNITY_UNSCHEDULED_TERMINAL_OUTCOME') END;
  SELECT CASE WHEN
    NEW.status<>'PENDING' AND NEW.next_attempt_ts IS NOT NULL
  THEN RAISE(ABORT,'OPPORTUNITY_INVALID_TERMINAL_OUTCOME_SCHEDULE') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_opportunity_outcome_schedule_update
BEFORE UPDATE OF event_id,contract_code,horizon,target_ts,status,next_attempt_ts,
  closed_ts,direction_at_event,directional_evaluation_eligible,
  source_retention_deadline_ts
ON opportunity_shadow_outcome
WHEN EXISTS (
  SELECT 1 FROM opportunity_shadow_event e
  WHERE e.event_id=NEW.event_id AND e.independent_sample=1
)
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM opportunity_shadow_event e
    WHERE e.event_id=NEW.event_id
      AND e.contract_code=NEW.contract_code
      AND e.direction_at_event=NEW.direction_at_event
      AND e.directional_evaluation_eligible=NEW.directional_evaluation_eligible
      AND NEW.source_retention_deadline_ts=e.event_close_ts+
        CASE e.timeframe WHEN '15m' THEN 1728000000 ELSE 6912000000 END
      AND NEW.target_ts=e.event_close_ts+CASE NEW.horizon
        WHEN '1h' THEN 3600000 WHEN '4h' THEN 14400000
        WHEN '12h' THEN 43200000 WHEN '24h' THEN 86400000
        WHEN '3d' THEN 259200000 WHEN '7d' THEN 604800000 END
  ) THEN RAISE(ABORT,'OPPORTUNITY_OUTCOME_EVENT_LINK_MISMATCH') END;
  SELECT CASE WHEN
    NEW.source_retention_deadline_ts IS NULL OR
    NEW.source_retention_deadline_ts<=NEW.target_ts
  THEN RAISE(ABORT,'OPPORTUNITY_INVALID_OUTCOME_RETENTION') END;
  SELECT CASE WHEN NEW.status='PENDING' AND (
    NEW.closed_ts IS NOT NULL OR NEW.next_attempt_ts IS NULL OR
    NEW.next_attempt_ts<NEW.target_ts
  ) THEN RAISE(ABORT,'OPPORTUNITY_INVALID_PENDING_OUTCOME_SCHEDULE') END;
  SELECT CASE WHEN
    NEW.status<>'PENDING' AND NEW.next_attempt_ts IS NOT NULL
  THEN RAISE(ABORT,'OPPORTUNITY_INVALID_TERMINAL_OUTCOME_SCHEDULE') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_opportunity_outcome_complete_insert
BEFORE INSERT ON opportunity_shadow_outcome
WHEN NEW.status='CLOSED_FACTUAL'
BEGIN
  SELECT CASE WHEN
    NEW.trajectory_complete<>1 OR NEW.source_timeframe IS NULL OR
    NEW.expected_bars IS NULL OR NEW.observed_bars IS NULL OR
    NEW.expected_bars<>NEW.observed_bars OR
    NEW.trajectory_coverage_pct<>100 OR NEW.price IS NULL OR
    NEW.closed_ts IS NULL OR NEW.closed_ts<NEW.target_ts OR
    NEW.source_start_ts IS NULL OR NEW.source_end_ts IS NULL OR
    NEW.source_bar_duration_ms IS NULL OR
    NEW.source_timeframe NOT IN ('1m','15m','1h','4h','1d') OR
    (CASE NEW.horizon
      WHEN '1h' THEN 3600000 WHEN '4h' THEN 14400000
      WHEN '12h' THEN 43200000 WHEN '24h' THEN 86400000
      WHEN '3d' THEN 259200000 WHEN '7d' THEN 604800000 END) %
      (CASE NEW.source_timeframe
        WHEN '1m' THEN 60000 WHEN '15m' THEN 900000
        WHEN '1h' THEN 3600000 WHEN '4h' THEN 14400000
        WHEN '1d' THEN 86400000 END)<>0 OR
    NEW.expected_bars<>(CASE NEW.horizon
      WHEN '1h' THEN 3600000 WHEN '4h' THEN 14400000
      WHEN '12h' THEN 43200000 WHEN '24h' THEN 86400000
      WHEN '3d' THEN 259200000 WHEN '7d' THEN 604800000 END)/
      (CASE NEW.source_timeframe
        WHEN '1m' THEN 60000 WHEN '15m' THEN 900000
        WHEN '1h' THEN 3600000 WHEN '4h' THEN 14400000
        WHEN '1d' THEN 86400000 END) OR
    NEW.source_bar_duration_ms<>(CASE NEW.source_timeframe
      WHEN '1m' THEN 60000 WHEN '15m' THEN 900000
      WHEN '1h' THEN 3600000 WHEN '4h' THEN 14400000
      WHEN '1d' THEN 86400000 END) OR
    NOT EXISTS (
      SELECT 1 FROM opportunity_shadow_event e
      WHERE e.event_id=NEW.event_id
        AND NEW.source_start_ts=e.event_close_ts
        AND NEW.source_end_ts=NEW.target_ts
    ) OR
    NEW.outcome_json IS NULL OR
    COALESCE(json_extract(NEW.outcome_json,'$.trajectory_complete'),0)<>1 OR
    COALESCE(json_extract(NEW.outcome_json,'$.target_ts'),-1)<>NEW.target_ts OR
    COALESCE(json_extract(NEW.outcome_json,'$.source_timeframe'),'')<>NEW.source_timeframe OR
    COALESCE(json_extract(NEW.outcome_json,'$.source_start_ts'),-1)<>NEW.source_start_ts OR
    COALESCE(json_extract(NEW.outcome_json,'$.source_end_ts'),-1)<>NEW.source_end_ts OR
    COALESCE(json_extract(NEW.outcome_json,'$.source_bar_duration_ms'),-1)<>NEW.source_bar_duration_ms OR
    COALESCE(json_extract(NEW.outcome_json,'$.expected_bars'),-1)<>NEW.expected_bars OR
    COALESCE(json_extract(NEW.outcome_json,'$.observed_bars'),-1)<>NEW.observed_bars
  THEN RAISE(ABORT,'OPPORTUNITY_INCOMPLETE_OUTCOME_CANNOT_CLOSE') END;
  SELECT CASE WHEN
    NEW.directional_evaluation_eligible=1 AND NEW.direction_at_event NOT IN ('LONG','SHORT')
  THEN RAISE(ABORT,'OPPORTUNITY_INVALID_OUTCOME_DIRECTION') END;
  SELECT CASE WHEN
    NEW.directional_evaluation_eligible=0 AND (
      NEW.direction_at_event<>'NONE' OR NEW.directional_return_pct IS NOT NULL OR
      NEW.mfe_pct IS NOT NULL OR NEW.mae_pct IS NOT NULL OR
      NEW.missed_opportunity_detected IS NOT NULL OR
      NEW.false_rejection_candidate IS NOT NULL OR
      NEW.late_entry_candidate IS NOT NULL
    )
  THEN RAISE(ABORT,'OPPORTUNITY_DIRECTIONLESS_RETROSPECTIVE_SCORE_FORBIDDEN') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_opportunity_outcome_complete_update
BEFORE UPDATE OF status,trajectory_complete,source_timeframe,expected_bars,
  observed_bars,trajectory_coverage_pct,source_start_ts,source_end_ts,
  source_bar_duration_ms,event_id,contract_code,horizon,target_ts,closed_ts,price,
  return_pct,direction_at_event,directional_evaluation_eligible,
  directional_return_pct,mfe_pct,mae_pct,missed_opportunity_detected,
  false_rejection_candidate,late_entry_candidate,outcome_json
ON opportunity_shadow_outcome
WHEN NEW.status='CLOSED_FACTUAL'
BEGIN
  SELECT CASE WHEN
    NEW.trajectory_complete<>1 OR NEW.source_timeframe IS NULL OR
    NEW.expected_bars IS NULL OR NEW.observed_bars IS NULL OR
    NEW.expected_bars<>NEW.observed_bars OR
    NEW.trajectory_coverage_pct<>100 OR NEW.price IS NULL OR
    NEW.closed_ts IS NULL OR NEW.closed_ts<NEW.target_ts OR
    NEW.source_start_ts IS NULL OR NEW.source_end_ts IS NULL OR
    NEW.source_bar_duration_ms IS NULL OR
    NEW.source_timeframe NOT IN ('1m','15m','1h','4h','1d') OR
    (CASE NEW.horizon
      WHEN '1h' THEN 3600000 WHEN '4h' THEN 14400000
      WHEN '12h' THEN 43200000 WHEN '24h' THEN 86400000
      WHEN '3d' THEN 259200000 WHEN '7d' THEN 604800000 END) %
      (CASE NEW.source_timeframe
        WHEN '1m' THEN 60000 WHEN '15m' THEN 900000
        WHEN '1h' THEN 3600000 WHEN '4h' THEN 14400000
        WHEN '1d' THEN 86400000 END)<>0 OR
    NEW.expected_bars<>(CASE NEW.horizon
      WHEN '1h' THEN 3600000 WHEN '4h' THEN 14400000
      WHEN '12h' THEN 43200000 WHEN '24h' THEN 86400000
      WHEN '3d' THEN 259200000 WHEN '7d' THEN 604800000 END)/
      (CASE NEW.source_timeframe
        WHEN '1m' THEN 60000 WHEN '15m' THEN 900000
        WHEN '1h' THEN 3600000 WHEN '4h' THEN 14400000
        WHEN '1d' THEN 86400000 END) OR
    NEW.source_bar_duration_ms<>(CASE NEW.source_timeframe
      WHEN '1m' THEN 60000 WHEN '15m' THEN 900000
      WHEN '1h' THEN 3600000 WHEN '4h' THEN 14400000
      WHEN '1d' THEN 86400000 END) OR
    NOT EXISTS (
      SELECT 1 FROM opportunity_shadow_event e
      WHERE e.event_id=NEW.event_id
        AND NEW.source_start_ts=e.event_close_ts
        AND NEW.source_end_ts=NEW.target_ts
    ) OR
    NEW.outcome_json IS NULL OR
    COALESCE(json_extract(NEW.outcome_json,'$.trajectory_complete'),0)<>1 OR
    COALESCE(json_extract(NEW.outcome_json,'$.target_ts'),-1)<>NEW.target_ts OR
    COALESCE(json_extract(NEW.outcome_json,'$.source_timeframe'),'')<>NEW.source_timeframe OR
    COALESCE(json_extract(NEW.outcome_json,'$.source_start_ts'),-1)<>NEW.source_start_ts OR
    COALESCE(json_extract(NEW.outcome_json,'$.source_end_ts'),-1)<>NEW.source_end_ts OR
    COALESCE(json_extract(NEW.outcome_json,'$.source_bar_duration_ms'),-1)<>NEW.source_bar_duration_ms OR
    COALESCE(json_extract(NEW.outcome_json,'$.expected_bars'),-1)<>NEW.expected_bars OR
    COALESCE(json_extract(NEW.outcome_json,'$.observed_bars'),-1)<>NEW.observed_bars
  THEN RAISE(ABORT,'OPPORTUNITY_INCOMPLETE_OUTCOME_CANNOT_CLOSE') END;
  SELECT CASE WHEN
    NEW.directional_evaluation_eligible=1 AND NEW.direction_at_event NOT IN ('LONG','SHORT')
  THEN RAISE(ABORT,'OPPORTUNITY_INVALID_OUTCOME_DIRECTION') END;
  SELECT CASE WHEN
    NEW.directional_evaluation_eligible=0 AND (
      NEW.direction_at_event<>'NONE' OR NEW.directional_return_pct IS NOT NULL OR
      NEW.mfe_pct IS NOT NULL OR NEW.mae_pct IS NOT NULL OR
      NEW.missed_opportunity_detected IS NOT NULL OR
      NEW.false_rejection_candidate IS NOT NULL OR
      NEW.late_entry_candidate IS NOT NULL
    )
  THEN RAISE(ABORT,'OPPORTUNITY_DIRECTIONLESS_RETROSPECTIVE_SCORE_FORBIDDEN') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_opportunity_outcome_no_history_insert
BEFORE INSERT ON opportunity_shadow_outcome
WHEN NEW.status='NO_CONFIRMED_HISTORICAL_DATA'
BEGIN
  SELECT CASE WHEN
    NEW.source_retention_deadline_ts IS NULL OR NEW.closed_ts IS NULL OR
    NEW.closed_ts<NEW.source_retention_deadline_ts OR
    NEW.trajectory_complete<>0 OR NEW.source_timeframe IS NOT NULL OR
    NEW.expected_bars IS NOT NULL OR NEW.observed_bars IS NOT NULL OR
    NEW.source_start_ts IS NOT NULL OR NEW.source_end_ts IS NOT NULL OR
    NEW.source_bar_duration_ms IS NOT NULL OR
    NEW.trajectory_coverage_pct IS NOT NULL OR NEW.price IS NOT NULL OR
    NEW.return_pct IS NOT NULL OR NEW.directional_return_pct IS NOT NULL OR
    NEW.mfe_pct IS NOT NULL OR NEW.mae_pct IS NOT NULL OR
    NEW.missed_opportunity_detected IS NOT NULL OR
    NEW.false_rejection_candidate IS NOT NULL OR NEW.late_entry_candidate IS NOT NULL OR
    NEW.outcome_json IS NULL OR
    COALESCE(json_extract(NEW.outcome_json,'$.no_confirmed_historical_data'),0)<>1 OR
    COALESCE(json_extract(NEW.outcome_json,'$.report_phrase_ru'),'')<>'нет подтверждённых исторических данных'
  THEN RAISE(ABORT,'OPPORTUNITY_PREMATURE_NO_HISTORY_CLOSURE') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_opportunity_outcome_no_history_update
BEFORE UPDATE OF status,closed_ts,source_retention_deadline_ts,trajectory_complete,
  source_timeframe,expected_bars,observed_bars,source_start_ts,source_end_ts,
  source_bar_duration_ms,trajectory_coverage_pct,price,
  return_pct,directional_return_pct,mfe_pct,mae_pct,missed_opportunity_detected,
  false_rejection_candidate,late_entry_candidate,outcome_json
ON opportunity_shadow_outcome
WHEN NEW.status='NO_CONFIRMED_HISTORICAL_DATA'
BEGIN
  SELECT CASE WHEN
    NEW.source_retention_deadline_ts IS NULL OR NEW.closed_ts IS NULL OR
    NEW.closed_ts<NEW.source_retention_deadline_ts OR
    NEW.trajectory_complete<>0 OR NEW.source_timeframe IS NOT NULL OR
    NEW.expected_bars IS NOT NULL OR NEW.observed_bars IS NOT NULL OR
    NEW.source_start_ts IS NOT NULL OR NEW.source_end_ts IS NOT NULL OR
    NEW.source_bar_duration_ms IS NOT NULL OR
    NEW.trajectory_coverage_pct IS NOT NULL OR NEW.price IS NOT NULL OR
    NEW.return_pct IS NOT NULL OR NEW.directional_return_pct IS NOT NULL OR
    NEW.mfe_pct IS NOT NULL OR NEW.mae_pct IS NOT NULL OR
    NEW.missed_opportunity_detected IS NOT NULL OR
    NEW.false_rejection_candidate IS NOT NULL OR NEW.late_entry_candidate IS NOT NULL OR
    NEW.outcome_json IS NULL OR
    COALESCE(json_extract(NEW.outcome_json,'$.no_confirmed_historical_data'),0)<>1 OR
    COALESCE(json_extract(NEW.outcome_json,'$.report_phrase_ru'),'')<>'нет подтверждённых исторических данных'
  THEN RAISE(ABORT,'OPPORTUNITY_PREMATURE_NO_HISTORY_CLOSURE') END;
END;
