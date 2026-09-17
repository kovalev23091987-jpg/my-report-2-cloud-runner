-- My Report 2 / Stage 3.9.1 Multi-Wave Campaign Shadow
-- Additive, shadow-only schema. No live signal, Telegram, execution or weight changes.

CREATE TABLE IF NOT EXISTS multi_wave_campaign_shadow (
  campaign_id TEXT PRIMARY KEY NOT NULL CHECK (length(campaign_id)<=640),
  version TEXT NOT NULL DEFAULT '3.9.1-multi-wave-campaign-shadow'
    CHECK (version='3.9.1-multi-wave-campaign-shadow'),
  rules_version TEXT NOT NULL DEFAULT 'multi-wave-campaign-v1'
    CHECK (rules_version='multi-wave-campaign-v1'),
  mode TEXT NOT NULL DEFAULT 'MULTI_WAVE_CAMPAIGN_SHADOW_NO_EXECUTION'
    CHECK (mode='MULTI_WAVE_CAMPAIGN_SHADOW_NO_EXECUTION'),
  contract_code TEXT NOT NULL CHECK (length(contract_code)>=1 AND length(contract_code)<=100),
  campaign_start INTEGER NOT NULL CHECK (campaign_start>0),
  campaign_end INTEGER CHECK (campaign_end IS NULL OR campaign_end>=campaign_start),
  current_phase TEXT NOT NULL CHECK (current_phase IN (
    'DISCOVERY','PRE_IMPULSE_WATCH','ENTRY_CANDIDATE','ENTRY_TRIGGER','IMPULSE',
    'RELOAD_BASE','NEXT_IMPULSE_WATCH','NEXT_IMPULSE_ENTRY','EXHAUSTION_WARNING','EDGE_SPENT','CLOSED'
  )),
  direction TEXT NOT NULL CHECK (direction IN ('LONG','SHORT','DIRECTIONLESS_EVENT')),
  direction_at_detection TEXT NOT NULL DEFAULT 'DIRECTIONLESS_EVENT'
    CHECK (direction_at_detection IN ('LONG','SHORT','DIRECTIONLESS_EVENT'))
    CHECK (direction_at_detection='DIRECTIONLESS_EVENT' OR direction=direction_at_detection),
  direction_confidence_at_detection REAL
    CHECK (direction_confidence_at_detection IS NULL OR (direction_confidence_at_detection>=0 AND direction_confidence_at_detection<=1)),
  wave_index INTEGER NOT NULL DEFAULT 0 CHECK (wave_index>=0),
  completed_wave_count INTEGER NOT NULL DEFAULT 0 CHECK (completed_wave_count>=0 AND completed_wave_count<=wave_index),
  base_start INTEGER,
  base_low REAL CHECK (base_low IS NULL OR base_low>0),
  base_high REAL CHECK (base_high IS NULL OR base_high>0),
  entry_trigger_time INTEGER CHECK (entry_trigger_time IS NULL OR entry_trigger_time>=campaign_start),
  entry_trigger_price REAL CHECK (entry_trigger_price IS NULL OR entry_trigger_price>0),
  impulse_start INTEGER CHECK (impulse_start IS NULL OR (entry_trigger_time IS NOT NULL AND impulse_start>=entry_trigger_time)),
  impulse_start_price REAL CHECK (impulse_start_price IS NULL OR impulse_start_price>0),
  impulse_peak_price REAL CHECK (impulse_peak_price IS NULL OR impulse_peak_price>0),
  impulse_peak_ts INTEGER CHECK (impulse_peak_ts IS NULL OR (impulse_start IS NOT NULL AND impulse_peak_ts>=impulse_start)),
  last_event_id TEXT CHECK (last_event_id IS NULL OR length(last_event_id)<=512),
  last_event_ts INTEGER,
  last_observed_ts INTEGER NOT NULL CHECK (last_observed_ts>=campaign_start),
  last_data_quality TEXT NOT NULL CHECK (last_data_quality IN ('OK','PARTIAL','STALE','MISSING','CONFLICTING')),
  campaign_json TEXT NOT NULL CHECK (json_valid(campaign_json) AND length(campaign_json)<=1000000),
  persisted_ts INTEGER NOT NULL CHECK (persisted_ts>=campaign_start),
  shadow_only INTEGER NOT NULL DEFAULT 1 CHECK (shadow_only=1),
  live_probability REAL CHECK (live_probability IS NULL),
  live_signal INTEGER NOT NULL DEFAULT 0 CHECK (live_signal=0),
  validated_signal INTEGER NOT NULL DEFAULT 0 CHECK (validated_signal=0),
  decision_layer_changed INTEGER NOT NULL DEFAULT 0 CHECK (decision_layer_changed=0),
  strategy_weights_changed INTEGER NOT NULL DEFAULT 0 CHECK (strategy_weights_changed=0),
  telegram_started INTEGER NOT NULL DEFAULT 0 CHECK (telegram_started=0),
  trading_execution INTEGER NOT NULL DEFAULT 0 CHECK (trading_execution=0),
  automatic_weight_tuning INTEGER NOT NULL DEFAULT 0 CHECK (automatic_weight_tuning=0)
  ,CHECK (base_low IS NULL OR base_high IS NULL OR base_low<=base_high)
  ,CHECK ((entry_trigger_time IS NULL)=(entry_trigger_price IS NULL))
  ,CHECK ((impulse_start IS NULL)=(impulse_start_price IS NULL))
  ,CHECK ((impulse_peak_price IS NULL)=(impulse_peak_ts IS NULL))
  ,CHECK (entry_trigger_time IS NULL OR entry_trigger_time<=last_observed_ts)
  ,CHECK (impulse_start IS NULL OR impulse_start<=last_observed_ts)
  ,CHECK (impulse_peak_ts IS NULL OR impulse_peak_ts<=last_observed_ts)
  ,CHECK (last_event_ts IS NULL OR last_event_ts<=last_observed_ts)
  ,CHECK ((current_phase='CLOSED')=(campaign_end IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS multi_wave_campaign_wave_shadow (
  wave_id TEXT PRIMARY KEY NOT NULL CHECK (length(wave_id)<=680),
  campaign_id TEXT NOT NULL CHECK (length(campaign_id)<=640),
  contract_code TEXT NOT NULL CHECK (length(contract_code)>=1 AND length(contract_code)<=100),
  wave_index INTEGER NOT NULL CHECK (wave_index>=1),
  direction TEXT NOT NULL CHECK (direction IN ('LONG','SHORT')),
  base_start INTEGER,
  base_low REAL CHECK (base_low IS NULL OR base_low>0),
  base_high REAL CHECK (base_high IS NULL OR base_high>0),
  entry_trigger_time INTEGER,
  entry_trigger_price REAL CHECK (entry_trigger_price IS NULL OR entry_trigger_price>0),
  impulse_start INTEGER CHECK (impulse_start IS NULL OR (entry_trigger_time IS NOT NULL AND impulse_start>=entry_trigger_time)),
  impulse_start_price REAL CHECK (impulse_start_price IS NULL OR impulse_start_price>0),
  impulse_peak REAL CHECK (impulse_peak IS NULL OR impulse_peak>0),
  impulse_peak_ts INTEGER,
  impulse_end INTEGER CHECK (impulse_end IS NULL OR (impulse_start IS NOT NULL AND impulse_end>=impulse_start)),
  oi_before REAL,
  funding_before REAL,
  basis_before REAL,
  flow_before REAL,
  move_before_entry_pct REAL,
  move_after_entry_pct REAL,
  lead_time_minutes REAL,
  wave_json TEXT NOT NULL CHECK (json_valid(wave_json) AND length(wave_json)<=1000000),
  persisted_ts INTEGER NOT NULL CHECK (persisted_ts>0),
  shadow_only INTEGER NOT NULL DEFAULT 1 CHECK (shadow_only=1),
  independent_sample INTEGER NOT NULL DEFAULT 0 CHECK (independent_sample=0),
  sample_unit TEXT NOT NULL DEFAULT 'CAMPAIGN_NESTED_WAVE' CHECK (sample_unit='CAMPAIGN_NESTED_WAVE'),
  FOREIGN KEY(campaign_id) REFERENCES multi_wave_campaign_shadow(campaign_id) ON DELETE RESTRICT,
  UNIQUE(campaign_id,wave_index),
  CHECK (base_low IS NULL OR base_high IS NULL OR base_low<=base_high),
  CHECK ((entry_trigger_time IS NULL)=(entry_trigger_price IS NULL)),
  CHECK ((impulse_start IS NULL)=(impulse_start_price IS NULL)),
  CHECK ((impulse_peak IS NULL)=(impulse_peak_ts IS NULL)),
  CHECK (impulse_peak_ts IS NULL OR impulse_peak_ts>=impulse_start)
);

CREATE INDEX IF NOT EXISTS idx_multi_wave_campaign_contract_observed
  ON multi_wave_campaign_shadow(contract_code,last_observed_ts DESC);
CREATE INDEX IF NOT EXISTS idx_multi_wave_campaign_phase_observed
  ON multi_wave_campaign_shadow(current_phase,last_observed_ts DESC);
CREATE INDEX IF NOT EXISTS idx_multi_wave_wave_campaign_index
  ON multi_wave_campaign_wave_shadow(campaign_id,wave_index);
CREATE UNIQUE INDEX IF NOT EXISTS uq_multi_wave_active_contract
  ON multi_wave_campaign_shadow(contract_code)
  WHERE current_phase!='CLOSED';

-- Guard-only triggers: they reject corruption and never create or mutate rows.
CREATE TRIGGER IF NOT EXISTS trg_multi_wave_campaign_json_insert_guard
BEFORE INSERT ON multi_wave_campaign_shadow
BEGIN
  SELECT CASE WHEN
    json_extract(NEW.campaign_json,'$.campaign_id') IS NOT NEW.campaign_id OR
    json_extract(NEW.campaign_json,'$.contract_code') IS NOT NEW.contract_code OR
    json_extract(NEW.campaign_json,'$.campaign_start') IS NOT NEW.campaign_start OR
    json_extract(NEW.campaign_json,'$.first_detected_time') IS NOT NEW.campaign_start OR
    json_extract(NEW.campaign_json,'$.current_phase') IS NOT NEW.current_phase OR
    json_extract(NEW.campaign_json,'$.direction') IS NOT NEW.direction OR
    json_extract(NEW.campaign_json,'$.direction_at_detection') IS NOT NEW.direction_at_detection OR
    json_extract(NEW.campaign_json,'$.direction_confidence_at_detection') IS NOT NEW.direction_confidence_at_detection OR
    json_extract(NEW.campaign_json,'$.wave_index') IS NOT NEW.wave_index OR
    json_extract(NEW.campaign_json,'$.completed_wave_count') IS NOT NEW.completed_wave_count OR
    json_extract(NEW.campaign_json,'$.last_event_id') IS NOT NEW.last_event_id OR
    json_extract(NEW.campaign_json,'$.last_event_ts') IS NOT NEW.last_event_ts OR
    json_extract(NEW.campaign_json,'$.last_observed_ts') IS NOT NEW.last_observed_ts OR
    json_type(NEW.campaign_json,'$.transition_history') IS NOT 'array' OR
    json_array_length(json_extract(NEW.campaign_json,'$.transition_history'))>64 OR
    json_type(NEW.campaign_json,'$.reclaim_failure_event_ids') IS NOT 'array' OR
    json_array_length(json_extract(NEW.campaign_json,'$.reclaim_failure_event_ids'))>16
  THEN RAISE(ABORT,'multi-wave campaign JSON/scalar mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_multi_wave_campaign_update_guard
BEFORE UPDATE ON multi_wave_campaign_shadow
BEGIN
  SELECT CASE WHEN
    NEW.campaign_id IS NOT OLD.campaign_id OR
    NEW.contract_code IS NOT OLD.contract_code OR
    NEW.campaign_start IS NOT OLD.campaign_start OR
    NEW.direction_at_detection IS NOT OLD.direction_at_detection OR
    NEW.direction_confidence_at_detection IS NOT OLD.direction_confidence_at_detection OR
    json_extract(NEW.campaign_json,'$.first_detected_time') IS NOT json_extract(OLD.campaign_json,'$.first_detected_time') OR
    json_extract(NEW.campaign_json,'$.first_detected_price') IS NOT json_extract(OLD.campaign_json,'$.first_detected_price') OR
    (NEW.last_event_id IS OLD.last_event_id AND json_extract(NEW.campaign_json,'$.last_event_core_signature') IS NOT json_extract(OLD.campaign_json,'$.last_event_core_signature')) OR
    (OLD.direction IN ('LONG','SHORT') AND NEW.direction IS NOT OLD.direction) OR
    NEW.wave_index<OLD.wave_index OR
    NEW.completed_wave_count<OLD.completed_wave_count OR
    NEW.last_observed_ts<OLD.last_observed_ts OR
    NEW.persisted_ts<OLD.persisted_ts OR
    json_extract(NEW.campaign_json,'$.campaign_id') IS NOT NEW.campaign_id OR
    json_extract(NEW.campaign_json,'$.contract_code') IS NOT NEW.contract_code OR
    json_extract(NEW.campaign_json,'$.campaign_start') IS NOT NEW.campaign_start OR
    json_extract(NEW.campaign_json,'$.first_detected_time') IS NOT NEW.campaign_start OR
    json_extract(NEW.campaign_json,'$.current_phase') IS NOT NEW.current_phase OR
    json_extract(NEW.campaign_json,'$.direction') IS NOT NEW.direction OR
    json_extract(NEW.campaign_json,'$.direction_at_detection') IS NOT NEW.direction_at_detection OR
    json_extract(NEW.campaign_json,'$.direction_confidence_at_detection') IS NOT NEW.direction_confidence_at_detection OR
    json_extract(NEW.campaign_json,'$.wave_index') IS NOT NEW.wave_index OR
    json_extract(NEW.campaign_json,'$.completed_wave_count') IS NOT NEW.completed_wave_count OR
    json_extract(NEW.campaign_json,'$.last_event_id') IS NOT NEW.last_event_id OR
    json_extract(NEW.campaign_json,'$.last_event_ts') IS NOT NEW.last_event_ts OR
    json_extract(NEW.campaign_json,'$.last_observed_ts') IS NOT NEW.last_observed_ts OR
    json_type(NEW.campaign_json,'$.transition_history') IS NOT 'array' OR
    json_array_length(json_extract(NEW.campaign_json,'$.transition_history'))>64 OR
    json_type(NEW.campaign_json,'$.reclaim_failure_event_ids') IS NOT 'array' OR
    json_array_length(json_extract(NEW.campaign_json,'$.reclaim_failure_event_ids'))>16
  THEN RAISE(ABORT,'multi-wave campaign immutable/history guard') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_multi_wave_wave_json_insert_guard
BEFORE INSERT ON multi_wave_campaign_wave_shadow
BEGIN
  SELECT CASE WHEN
    json_extract(NEW.wave_json,'$.campaign.campaign_id') IS NOT NEW.campaign_id OR
    json_extract(NEW.wave_json,'$.campaign.contract_code') IS NOT NEW.contract_code OR
    json_extract(NEW.wave_json,'$.campaign.wave_index') IS NOT NEW.wave_index OR
    json_extract(NEW.wave_json,'$.campaign.direction') IS NOT NEW.direction
  THEN RAISE(ABORT,'multi-wave wave JSON/scalar mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_multi_wave_wave_update_guard
BEFORE UPDATE ON multi_wave_campaign_wave_shadow
BEGIN
  SELECT CASE WHEN
    NEW.wave_id IS NOT OLD.wave_id OR
    NEW.campaign_id IS NOT OLD.campaign_id OR
    NEW.contract_code IS NOT OLD.contract_code OR
    NEW.wave_index IS NOT OLD.wave_index OR
    NEW.direction IS NOT OLD.direction OR
    NEW.independent_sample!=0 OR
    NEW.sample_unit!='CAMPAIGN_NESTED_WAVE' OR
    json_extract(NEW.wave_json,'$.campaign.campaign_id') IS NOT NEW.campaign_id OR
    json_extract(NEW.wave_json,'$.campaign.contract_code') IS NOT NEW.contract_code OR
    json_extract(NEW.wave_json,'$.campaign.wave_index') IS NOT NEW.wave_index OR
    json_extract(NEW.wave_json,'$.campaign.direction') IS NOT NEW.direction
  THEN RAISE(ABORT,'multi-wave wave immutable/sample guard') END;
END;
