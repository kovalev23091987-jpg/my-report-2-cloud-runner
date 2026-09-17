-- My Report 2 / Stage 3.9.2 upstream immutable-receipt wiring (SHADOW ONLY)
-- Additive only. No Telegram/live signal/trading/weight changes.
-- Apply AFTER 20260914_final_decision_integration_shadow.sql.


-- Opportunity receipt identity is prospective only. Existing rows remain NULL
-- and therefore LEGACY_UNPROVEN; Stage 3.9.2 never backfills a revision/digest.
ALTER TABLE opportunity_shadow_event
  ADD COLUMN stage392_episode_revision INTEGER
    CHECK (stage392_episode_revision IS NULL OR stage392_episode_revision=1);

ALTER TABLE opportunity_shadow_event
  ADD COLUMN stage392_raw_event_digest TEXT
    CHECK (stage392_raw_event_digest IS NULL OR (
      length(stage392_raw_event_digest)=16 AND
      stage392_raw_event_digest NOT GLOB '*[^0-9a-f]*'
    ));

CREATE TRIGGER trg_stage392_opportunity_proof_identity_immutable
BEFORE UPDATE ON opportunity_shadow_event
WHEN NEW.stage392_episode_revision IS NOT OLD.stage392_episode_revision OR
     NEW.stage392_raw_event_digest IS NOT OLD.stage392_raw_event_digest
BEGIN
  SELECT RAISE(ABORT,'stage392 immutable opportunity proof identity');
END;

ALTER TABLE multi_wave_campaign_shadow
  ADD COLUMN stage392_proof_bundle_json TEXT
    CHECK (stage392_proof_bundle_json IS NULL OR (
      json_valid(stage392_proof_bundle_json) AND
      json_type(stage392_proof_bundle_json)='object' AND
      length(CAST(stage392_proof_bundle_json AS BLOB))<=262144
    ));

ALTER TABLE full_evidence_shadow_log
  ADD COLUMN stage392_proof_bundle_json TEXT
    CHECK (stage392_proof_bundle_json IS NULL OR (
      json_valid(stage392_proof_bundle_json) AND
      json_type(stage392_proof_bundle_json)='object' AND
      length(CAST(stage392_proof_bundle_json AS BLOB))<=262144
    ));

-- A Full Evidence proof bundle becomes authoritative only by being inserted in
-- the same factual D1 row whose ACK seals it. Storage therefore rejects a
-- proof-shaped payload whose core row identity/receipt envelope does not match
-- that D1 row, and proof-bearing rows are append-only for their retention life.
CREATE TRIGGER trg_stage392_full_evidence_proof_insert_guard
BEFORE INSERT ON full_evidence_shadow_log
WHEN NEW.stage392_proof_bundle_json IS NOT NULL
BEGIN
  SELECT CASE WHEN (
    json_extract(NEW.stage392_proof_bundle_json,'$.mode') IS NOT 'SHADOW_ONLY_NO_EXECUTION' OR
    json_extract(NEW.stage392_proof_bundle_json,'$.contract_code') IS NOT NEW.contract_code OR
    json_extract(NEW.stage392_proof_bundle_json,'$.observed_ts') IS NOT NEW.observed_ts OR
    json_type(NEW.stage392_proof_bundle_json,'$.full_evidence') IS NOT 'object' OR
    json_extract(NEW.stage392_proof_bundle_json,'$.full_evidence.schema_version') IS NOT 'full-evidence-shadow-v1' OR
    json_extract(NEW.stage392_proof_bundle_json,'$.full_evidence.contract_code') IS NOT NEW.contract_code OR
    json_extract(NEW.stage392_proof_bundle_json,'$.full_evidence.observed_ts') IS NOT NEW.observed_ts OR
    json_extract(NEW.stage392_proof_bundle_json,'$.full_evidence.persistence.status') IS NOT 'CLOSED' OR
    json_extract(NEW.stage392_proof_bundle_json,'$.full_evidence.persistence.immutable') IS NOT 1 OR
    json_extract(NEW.stage392_proof_bundle_json,'$.full_evidence.persistence.verification_method') IS NOT 'D1_IMMUTABLE_RECEIPT' OR
    COALESCE(json_extract(NEW.stage392_proof_bundle_json,'$.full_evidence.persistence.receipt_id'),'')='' OR
    length(COALESCE(json_extract(NEW.stage392_proof_bundle_json,'$.full_evidence.persistence.content_digest'),''))!=16 OR
    json_extract(NEW.stage392_proof_bundle_json,'$.full_evidence.persistence.content_digest') GLOB '*[^0-9a-f]*' OR
    json_extract(NEW.stage392_proof_bundle_json,'$.full_evidence.source_registry.status') IS NOT 'CLOSED' OR
    json_extract(NEW.stage392_proof_bundle_json,'$.full_evidence.source_registry.authoritative') IS NOT 1 OR
    json_extract(NEW.stage392_proof_bundle_json,'$.full_evidence.source_registry.persistence.status') IS NOT 'CLOSED' OR
    json_extract(NEW.stage392_proof_bundle_json,'$.full_evidence.source_registry.persistence.immutable') IS NOT 1 OR
    json_extract(NEW.stage392_proof_bundle_json,'$.full_evidence.source_registry.persistence.verification_method') IS NOT 'D1_IMMUTABLE_RECEIPT' OR
    json_extract(NEW.stage392_proof_bundle_json,'$.full_evidence.source_registry.receipt_id') IS NOT json_extract(NEW.stage392_proof_bundle_json,'$.full_evidence.source_registry.persistence.receipt_id') OR
    json_extract(NEW.stage392_proof_bundle_json,'$.evidence_registry.status') IS NOT 'CLOSED' OR
    json_extract(NEW.stage392_proof_bundle_json,'$.evidence_registry.authoritative') IS NOT 1 OR
    json_extract(NEW.stage392_proof_bundle_json,'$.evidence_registry.rules_version') IS NOT 'causal-lineage-registry-v3-full-envelope' OR
    json_extract(NEW.stage392_proof_bundle_json,'$.evidence_registry.persistence.status') IS NOT 'CLOSED' OR
    json_extract(NEW.stage392_proof_bundle_json,'$.evidence_registry.persistence.immutable') IS NOT 1 OR
    json_extract(NEW.stage392_proof_bundle_json,'$.evidence_registry.persistence.verification_method') IS NOT 'D1_IMMUTABLE_RECEIPT' OR
    json_extract(NEW.stage392_proof_bundle_json,'$.evidence_registry.receipt_id') IS NOT json_extract(NEW.stage392_proof_bundle_json,'$.evidence_registry.persistence.receipt_id') OR
    json_extract(NEW.stage392_proof_bundle_json,'$.safety_gate_receipt.status') IS NOT 'CLOSED' OR
    json_extract(NEW.stage392_proof_bundle_json,'$.safety_gate_receipt.authoritative') IS NOT 1 OR
    json_extract(NEW.stage392_proof_bundle_json,'$.safety_gate_receipt.persistence.status') IS NOT 'CLOSED' OR
    json_extract(NEW.stage392_proof_bundle_json,'$.safety_gate_receipt.persistence.immutable') IS NOT 1 OR
    json_extract(NEW.stage392_proof_bundle_json,'$.safety_gate_receipt.persistence.verification_method') IS NOT 'D1_IMMUTABLE_RECEIPT' OR
    json_extract(NEW.stage392_proof_bundle_json,'$.safety_gate_receipt.receipt_id') IS NOT json_extract(NEW.stage392_proof_bundle_json,'$.safety_gate_receipt.persistence.receipt_id')
  ) THEN RAISE(ABORT,'stage392 full evidence proof contract invalid') END;
END;

CREATE TRIGGER trg_stage392_full_evidence_proof_immutable
BEFORE UPDATE ON full_evidence_shadow_log
WHEN OLD.stage392_proof_bundle_json IS NOT NULL OR
     NEW.stage392_proof_bundle_json IS NOT OLD.stage392_proof_bundle_json
BEGIN
  SELECT RAISE(ABORT,'stage392 full evidence proof row immutable');
END;


-- Multi-Wave campaign rows are mutable current-state projections, so the
-- receipt itself also needs an append-only home. D1 triggers journal the exact
-- campaign_bridge in the SAME CAS-backed Worker write; no peak-path query is
-- added. Receipt-id collisions with different content abort the parent write.
CREATE TABLE stage392_multi_wave_receipt_journal (
  receipt_id TEXT PRIMARY KEY NOT NULL,
  campaign_id TEXT NOT NULL,
  contract_code TEXT NOT NULL,
  state_revision INTEGER NOT NULL CHECK (state_revision>=1),
  observation_id TEXT NOT NULL,
  content_digest TEXT NOT NULL
    CHECK (length(content_digest)=16 AND content_digest NOT GLOB '*[^0-9a-f]*'),
  committed_ts INTEGER NOT NULL CHECK (committed_ts>0),
  receipt_json TEXT NOT NULL
    CHECK (json_valid(receipt_json) AND json_type(receipt_json)='object'
      AND length(CAST(receipt_json AS BLOB))<=262144),
  shadow_only INTEGER NOT NULL DEFAULT 1 CHECK (shadow_only=1),
  live_probability REAL CHECK (live_probability IS NULL),
  live_signal INTEGER NOT NULL DEFAULT 0 CHECK (live_signal=0),
  validated_signal INTEGER NOT NULL DEFAULT 0 CHECK (validated_signal=0),
  telegram_started INTEGER NOT NULL DEFAULT 0 CHECK (telegram_started=0),
  trading_execution INTEGER NOT NULL DEFAULT 0 CHECK (trading_execution=0),
  automatic_weight_tuning INTEGER NOT NULL DEFAULT 0 CHECK (automatic_weight_tuning=0),
  strategy_weights_changed INTEGER NOT NULL DEFAULT 0 CHECK (strategy_weights_changed=0)
) WITHOUT ROWID, STRICT;

CREATE INDEX idx_stage392_multi_wave_receipt_campaign_revision
  ON stage392_multi_wave_receipt_journal(campaign_id,state_revision,committed_ts DESC);

CREATE TRIGGER trg_stage392_campaign_receipt_journal_immutable_update
BEFORE UPDATE ON stage392_multi_wave_receipt_journal
BEGIN
  SELECT RAISE(ABORT,'stage392 campaign receipt journal immutable');
END;

CREATE TRIGGER trg_stage392_campaign_receipt_journal_immutable_delete
BEFORE DELETE ON stage392_multi_wave_receipt_journal
BEGIN
  SELECT RAISE(ABORT,'stage392 campaign receipt journal append-only');
END;

CREATE TABLE shadow_virtual_position_ledger (
  contract_code TEXT PRIMARY KEY NOT NULL
    CHECK (length(contract_code) BETWEEN 1 AND 80)
    CHECK (contract_code GLOB '[A-Z0-9]*')
    CHECK (contract_code NOT GLOB '*[^A-Z0-9._:-]*'),
  state TEXT NOT NULL CHECK (state IN ('FLAT','OPEN_LONG','OPEN_SHORT')),
  state_revision INTEGER NOT NULL CHECK (state_revision>=1),
  position_id TEXT,
  entry_ts INTEGER,
  direction TEXT CHECK (direction IS NULL OR direction IN ('LONG','SHORT')),
  campaign_id TEXT,
  entry_wave_id TEXT,
  entry_decision_observation_ts INTEGER,
  entry_decision_material_digest TEXT,
  entry_decision_id TEXT,
  entry_action_id TEXT,
  origin_entry_trigger_price REAL,
  origin_entry_observation_id TEXT,
  origin_campaign_state_revision INTEGER,
  origin_source_campaign_receipt_id TEXT,
  origin_source_campaign_content_digest TEXT,
  origin_source_campaign_committed_ts INTEGER,
  last_observed_ts INTEGER NOT NULL CHECK (last_observed_ts>0),
  persisted_ts INTEGER NOT NULL CHECK (persisted_ts>0),
  shadow_only INTEGER NOT NULL DEFAULT 1 CHECK (shadow_only=1),
  live_probability REAL CHECK (live_probability IS NULL),
  live_signal INTEGER NOT NULL DEFAULT 0 CHECK (live_signal=0),
  validated_signal INTEGER NOT NULL DEFAULT 0 CHECK (validated_signal=0),
  telegram_started INTEGER NOT NULL DEFAULT 0 CHECK (telegram_started=0),
  trading_execution INTEGER NOT NULL DEFAULT 0 CHECK (trading_execution=0),
  automatic_weight_tuning INTEGER NOT NULL DEFAULT 0 CHECK (automatic_weight_tuning=0),
  strategy_weights_changed INTEGER NOT NULL DEFAULT 0 CHECK (strategy_weights_changed=0),
  CHECK (
    (state='FLAT' AND position_id IS NULL AND entry_ts IS NULL AND direction IS NULL AND
      campaign_id IS NULL AND entry_wave_id IS NULL AND entry_decision_observation_ts IS NULL AND
      entry_decision_material_digest IS NULL AND entry_decision_id IS NULL AND entry_action_id IS NULL) OR
    (state IN ('OPEN_LONG','OPEN_SHORT') AND position_id IS NOT NULL AND entry_ts IS NOT NULL AND
      direction IS NOT NULL AND campaign_id IS NOT NULL AND entry_wave_id IS NOT NULL AND
      entry_decision_observation_ts IS NOT NULL AND entry_decision_material_digest IS NOT NULL AND
      entry_decision_id IS NOT NULL AND entry_action_id IS NOT NULL AND
      origin_entry_trigger_price IS NOT NULL AND origin_entry_observation_id IS NOT NULL AND
      origin_campaign_state_revision IS NOT NULL AND origin_source_campaign_receipt_id IS NOT NULL AND
      origin_source_campaign_content_digest IS NOT NULL AND origin_source_campaign_committed_ts IS NOT NULL)
  ),
  CHECK (state!='OPEN_LONG' OR direction='LONG'),
  CHECK (state!='OPEN_SHORT' OR direction='SHORT')
) WITHOUT ROWID, STRICT;

CREATE INDEX idx_shadow_virtual_position_state_ts
  ON shadow_virtual_position_ledger(state,last_observed_ts DESC);

-- Authoritative virtual-position rows must never retain stale origin identity
-- while FLAT. OPEN rows already have table-level non-null checks; this storage
-- guard closes the inverse shape so a direct SQL writer cannot hide a stale
-- origin beneath a FLAT state.
CREATE TRIGGER trg_stage392_virtual_position_shape_guard_insert
BEFORE INSERT ON shadow_virtual_position_ledger
WHEN NEW.state='FLAT' AND (
  NEW.origin_entry_trigger_price IS NOT NULL OR NEW.origin_entry_observation_id IS NOT NULL OR
  NEW.origin_campaign_state_revision IS NOT NULL OR NEW.origin_source_campaign_receipt_id IS NOT NULL OR
  NEW.origin_source_campaign_content_digest IS NOT NULL OR NEW.origin_source_campaign_committed_ts IS NOT NULL
)
BEGIN
  SELECT RAISE(ABORT,'stage392 flat virtual position origin must be empty');
END;

CREATE TRIGGER trg_stage392_virtual_position_shape_guard_update
BEFORE UPDATE ON shadow_virtual_position_ledger
WHEN NEW.state='FLAT' AND (
  NEW.origin_entry_trigger_price IS NOT NULL OR NEW.origin_entry_observation_id IS NOT NULL OR
  NEW.origin_campaign_state_revision IS NOT NULL OR NEW.origin_source_campaign_receipt_id IS NOT NULL OR
  NEW.origin_source_campaign_content_digest IS NOT NULL OR NEW.origin_source_campaign_committed_ts IS NOT NULL
)
BEGIN
  SELECT RAISE(ABORT,'stage392 flat virtual position origin must be empty');
END;

-- Authoritative virtual-position identity is CAS-monotonic. Campaign refreshes
-- may only advance timestamps at the same revision; an actual position state
-- transition must advance revision by exactly one and can only be FLAT->OPEN or
-- OPEN->FLAT. This prevents direct D1 identity drift from bypassing Worker CAS.
CREATE TRIGGER trg_stage392_virtual_position_transition_guard
BEFORE UPDATE ON shadow_virtual_position_ledger
BEGIN
  SELECT CASE WHEN NEW.state_revision < OLD.state_revision OR NEW.state_revision > OLD.state_revision + 1
    THEN RAISE(ABORT,'stage392 virtual position revision invalid') END;
  SELECT CASE WHEN NEW.last_observed_ts < OLD.last_observed_ts OR NEW.persisted_ts < OLD.persisted_ts
    THEN RAISE(ABORT,'stage392 virtual position time regression') END;
  SELECT CASE WHEN NEW.state_revision = OLD.state_revision AND (
    NEW.state IS NOT OLD.state OR
    NEW.position_id IS NOT OLD.position_id OR NEW.entry_ts IS NOT OLD.entry_ts OR
    NEW.direction IS NOT OLD.direction OR NEW.campaign_id IS NOT OLD.campaign_id OR
    NEW.entry_wave_id IS NOT OLD.entry_wave_id OR
    NEW.entry_decision_observation_ts IS NOT OLD.entry_decision_observation_ts OR
    NEW.entry_decision_material_digest IS NOT OLD.entry_decision_material_digest OR
    NEW.entry_decision_id IS NOT OLD.entry_decision_id OR NEW.entry_action_id IS NOT OLD.entry_action_id OR
    NEW.origin_entry_trigger_price IS NOT OLD.origin_entry_trigger_price OR
    NEW.origin_entry_observation_id IS NOT OLD.origin_entry_observation_id OR
    NEW.origin_campaign_state_revision IS NOT OLD.origin_campaign_state_revision OR
    NEW.origin_source_campaign_receipt_id IS NOT OLD.origin_source_campaign_receipt_id OR
    NEW.origin_source_campaign_content_digest IS NOT OLD.origin_source_campaign_content_digest OR
    NEW.origin_source_campaign_committed_ts IS NOT OLD.origin_source_campaign_committed_ts
  ) THEN RAISE(ABORT,'stage392 virtual position identity drift') END;
  SELECT CASE WHEN NEW.state_revision = OLD.state_revision + 1 AND NOT (
    (OLD.state='FLAT' AND NEW.state IN ('OPEN_LONG','OPEN_SHORT')) OR
    (OLD.state IN ('OPEN_LONG','OPEN_SHORT') AND NEW.state='FLAT')
  ) THEN RAISE(ABORT,'stage392 virtual position transition invalid') END;
END;

-- Storage-level proof contract. Runtime verification remains authoritative for
-- the cryptographic content digest, while these guards prevent a malformed or
-- identity-drifting proof envelope from ever becoming the D1 current-state row.
CREATE TRIGGER trg_stage392_campaign_proof_insert_guard
BEFORE INSERT ON multi_wave_campaign_shadow
WHEN json_type(NEW.stage392_proof_bundle_json,'$.campaign_bridge')='object'
BEGIN
  SELECT CASE WHEN (
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.schema_version') IS NOT 'multi-wave-decision-bridge-v1' OR
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.status') IS NOT 'SHADOW_CAMPAIGN_EVALUATED' OR
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.schema_version') IS NOT 'multi-wave-decision-state-v1' OR
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.rules_version') IS NOT 'multi-wave-decision-state-rules-v1' OR
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.campaign_id') IS NOT NEW.campaign_id OR
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.contract_code') IS NOT NEW.contract_code OR
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.campaign_start') IS NOT NEW.campaign_start OR
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.current_phase') IS NOT NEW.current_phase OR
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.direction') IS NOT NEW.direction OR
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.direction_at_detection') IS NOT NEW.direction_at_detection OR
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.wave_index') IS NOT NEW.wave_index OR
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.completed_wave_count') IS NOT NEW.completed_wave_count OR
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.last_observed_ts') IS NOT NEW.last_observed_ts OR
    json_type(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.state_revision') IS NOT 'integer' OR
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.state_revision') < 1 OR
    COALESCE(json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.origin_episode_id'),'')='' OR
    COALESCE(json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.observation_id'),'')='' OR
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.wave_facts_immutable') IS NOT 1 OR
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.cas_persisted') IS NOT 1 OR
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.persistence.status') IS NOT 'CLOSED' OR
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.persistence.immutable') IS NOT 1 OR
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.persistence.verification_method') IS NOT 'D1_IMMUTABLE_RECEIPT' OR
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.persistence.committed_ts') IS NOT NEW.last_observed_ts OR
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.persistence.receipt_id') IS NOT (
      'CMR:'||NEW.campaign_id||':'||json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.state_revision')||':'||json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.observation_id')
    ) OR
    length(COALESCE(json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.persistence.content_digest'),'')) != 16 OR
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.persistence.content_digest') GLOB '*[^0-9a-f]*'
  ) THEN RAISE(ABORT,'stage392 campaign proof contract invalid') END;
END;

CREATE TRIGGER trg_stage392_campaign_proof_update_guard
BEFORE UPDATE OF stage392_proof_bundle_json,campaign_start,current_phase,direction,direction_at_detection,wave_index,completed_wave_count,last_observed_ts
ON multi_wave_campaign_shadow
BEGIN
  -- A valid proof cannot be explicitly removed. The one exception is a stale
  -- mutable projection that has already diverged from its receipt (for example
  -- after an intentional rollback to the Stage 3.9.1 Worker). That projection
  -- must be allowed to degrade to LEGACY_UNPROVEN while the original receipt
  -- remains preserved in the append-only journal.
  SELECT CASE WHEN json_type(OLD.stage392_proof_bundle_json,'$.campaign_bridge')='object'
                    AND json_type(NEW.stage392_proof_bundle_json,'$.campaign_bridge') IS NOT 'object'
                    AND NOT (
      json_extract(OLD.stage392_proof_bundle_json,'$.campaign_bridge.campaign.campaign_id') IS NOT OLD.campaign_id OR
      json_extract(OLD.stage392_proof_bundle_json,'$.campaign_bridge.campaign.contract_code') IS NOT OLD.contract_code OR
      json_extract(OLD.stage392_proof_bundle_json,'$.campaign_bridge.campaign.campaign_start') IS NOT OLD.campaign_start OR
      json_extract(OLD.stage392_proof_bundle_json,'$.campaign_bridge.campaign.current_phase') IS NOT OLD.current_phase OR
      json_extract(OLD.stage392_proof_bundle_json,'$.campaign_bridge.campaign.direction') IS NOT OLD.direction OR
      json_extract(OLD.stage392_proof_bundle_json,'$.campaign_bridge.campaign.direction_at_detection') IS NOT OLD.direction_at_detection OR
      json_extract(OLD.stage392_proof_bundle_json,'$.campaign_bridge.campaign.wave_index') IS NOT OLD.wave_index OR
      json_extract(OLD.stage392_proof_bundle_json,'$.campaign_bridge.campaign.completed_wave_count') IS NOT OLD.completed_wave_count OR
      json_extract(OLD.stage392_proof_bundle_json,'$.campaign_bridge.campaign.last_observed_ts') IS NOT OLD.last_observed_ts
    )
    THEN RAISE(ABORT,'stage392 campaign proof removal forbidden') END;
  SELECT CASE WHEN json_type(OLD.stage392_proof_bundle_json,'$.campaign_bridge') IS NOT 'object'
                    AND json_type(NEW.stage392_proof_bundle_json,'$.campaign_bridge')='object'
    THEN RAISE(ABORT,'stage392 legacy campaign proof backfill forbidden') END;

  SELECT CASE WHEN json_type(NEW.stage392_proof_bundle_json,'$.campaign_bridge')='object'
                    AND NEW.stage392_proof_bundle_json IS NOT OLD.stage392_proof_bundle_json AND (
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.schema_version') IS NOT 'multi-wave-decision-bridge-v1' OR
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.status') IS NOT 'SHADOW_CAMPAIGN_EVALUATED' OR
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.schema_version') IS NOT 'multi-wave-decision-state-v1' OR
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.rules_version') IS NOT 'multi-wave-decision-state-rules-v1' OR
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.campaign_id') IS NOT NEW.campaign_id OR
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.contract_code') IS NOT NEW.contract_code OR
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.campaign_start') IS NOT NEW.campaign_start OR
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.current_phase') IS NOT NEW.current_phase OR
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.direction') IS NOT NEW.direction OR
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.direction_at_detection') IS NOT NEW.direction_at_detection OR
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.wave_index') IS NOT NEW.wave_index OR
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.completed_wave_count') IS NOT NEW.completed_wave_count OR
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.last_observed_ts') IS NOT NEW.last_observed_ts OR
    json_type(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.state_revision') IS NOT 'integer' OR
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.state_revision') < 1 OR
    COALESCE(json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.origin_episode_id'),'')='' OR
    COALESCE(json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.observation_id'),'')='' OR
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.wave_facts_immutable') IS NOT 1 OR
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.cas_persisted') IS NOT 1 OR
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.persistence.status') IS NOT 'CLOSED' OR
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.persistence.immutable') IS NOT 1 OR
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.persistence.verification_method') IS NOT 'D1_IMMUTABLE_RECEIPT' OR
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.persistence.committed_ts') IS NOT NEW.last_observed_ts OR
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.persistence.receipt_id') IS NOT (
      'CMR:'||NEW.campaign_id||':'||json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.state_revision')||':'||json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.observation_id')
    ) OR
    length(COALESCE(json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.persistence.content_digest'),'')) != 16 OR
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.persistence.content_digest') GLOB '*[^0-9a-f]*'
  ) THEN RAISE(ABORT,'stage392 campaign proof contract invalid') END;

  SELECT CASE WHEN json_type(OLD.stage392_proof_bundle_json,'$.campaign_bridge')='object'
                    AND json_type(NEW.stage392_proof_bundle_json,'$.campaign_bridge')='object'
                    AND NEW.stage392_proof_bundle_json IS NOT OLD.stage392_proof_bundle_json AND (
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.origin_episode_id') IS NOT json_extract(OLD.stage392_proof_bundle_json,'$.campaign_bridge.campaign.origin_episode_id') OR
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.campaign_id') IS NOT json_extract(OLD.stage392_proof_bundle_json,'$.campaign_bridge.campaign.campaign_id') OR
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.contract_code') IS NOT json_extract(OLD.stage392_proof_bundle_json,'$.campaign_bridge.campaign.contract_code') OR
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.campaign_start') IS NOT json_extract(OLD.stage392_proof_bundle_json,'$.campaign_bridge.campaign.campaign_start') OR
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.direction') IS NOT json_extract(OLD.stage392_proof_bundle_json,'$.campaign_bridge.campaign.direction') OR
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.direction_at_detection') IS NOT json_extract(OLD.stage392_proof_bundle_json,'$.campaign_bridge.campaign.direction_at_detection') OR
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.last_observed_ts') < json_extract(OLD.stage392_proof_bundle_json,'$.campaign_bridge.campaign.last_observed_ts') OR
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.state_revision') < json_extract(OLD.stage392_proof_bundle_json,'$.campaign_bridge.campaign.state_revision') OR
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.state_revision') > json_extract(OLD.stage392_proof_bundle_json,'$.campaign_bridge.campaign.state_revision') + 1 OR
    (
      json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.state_revision') = json_extract(OLD.stage392_proof_bundle_json,'$.campaign_bridge.campaign.state_revision') AND
      json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.current_phase') IS NOT json_extract(OLD.stage392_proof_bundle_json,'$.campaign_bridge.campaign.current_phase')
    )
  ) THEN RAISE(ABORT,'stage392 campaign proof continuity invalid') END;
END;

-- Rollback compatibility: a Stage 3.9.1 Worker does not know the Stage 3.9.2
-- proof column. If it advances a proof-bearing mutable campaign projection, the
-- unchanged receipt would no longer describe the current row. Detach only that
-- stale projection proof in the same statement; never mutate/delete the
-- append-only receipt journal. A future Stage 3.9.2 runtime therefore sees the
-- campaign as LEGACY_UNPROVEN instead of accepting a stale receipt.
CREATE TRIGGER trg_stage392_campaign_proof_detach_stale_projection
AFTER UPDATE OF campaign_start,current_phase,direction,direction_at_detection,wave_index,completed_wave_count,last_observed_ts
ON multi_wave_campaign_shadow
WHEN json_type(NEW.stage392_proof_bundle_json,'$.campaign_bridge')='object'
 AND NEW.stage392_proof_bundle_json IS OLD.stage392_proof_bundle_json
 AND (
  json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.campaign_id') IS NOT NEW.campaign_id OR
  json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.contract_code') IS NOT NEW.contract_code OR
  json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.campaign_start') IS NOT NEW.campaign_start OR
  json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.current_phase') IS NOT NEW.current_phase OR
  json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.direction') IS NOT NEW.direction OR
  json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.direction_at_detection') IS NOT NEW.direction_at_detection OR
  json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.wave_index') IS NOT NEW.wave_index OR
  json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.completed_wave_count') IS NOT NEW.completed_wave_count OR
  json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.last_observed_ts') IS NOT NEW.last_observed_ts
 )
BEGIN
  UPDATE multi_wave_campaign_shadow
  SET stage392_proof_bundle_json=NULL
  WHERE campaign_id=NEW.campaign_id
    AND stage392_proof_bundle_json IS NEW.stage392_proof_bundle_json;
END;

-- A proof-bearing campaign write initializes/refreshes the authoritative FLAT
-- virtual ledger in the SAME D1 write through a trigger. Open positions are not
-- overwritten by campaign refreshes.
CREATE TRIGGER trg_stage392_campaign_position_insert
AFTER INSERT ON multi_wave_campaign_shadow
WHEN NEW.stage392_proof_bundle_json IS NOT NULL
 AND json_type(NEW.stage392_proof_bundle_json,'$.campaign_bridge')='object'
BEGIN
  INSERT INTO shadow_virtual_position_ledger (
    contract_code,state,state_revision,last_observed_ts,persisted_ts
  ) VALUES (NEW.contract_code,'FLAT',1,NEW.last_observed_ts,NEW.persisted_ts)
  ON CONFLICT(contract_code) DO UPDATE SET
    last_observed_ts=MAX(shadow_virtual_position_ledger.last_observed_ts,excluded.last_observed_ts),
    persisted_ts=MAX(shadow_virtual_position_ledger.persisted_ts,excluded.persisted_ts);
END;

CREATE TRIGGER trg_stage392_campaign_position_update
AFTER UPDATE OF stage392_proof_bundle_json,last_observed_ts ON multi_wave_campaign_shadow
WHEN NEW.stage392_proof_bundle_json IS NOT NULL
 AND json_type(NEW.stage392_proof_bundle_json,'$.campaign_bridge')='object'
BEGIN
  INSERT INTO shadow_virtual_position_ledger (
    contract_code,state,state_revision,last_observed_ts,persisted_ts
  ) VALUES (NEW.contract_code,'FLAT',1,NEW.last_observed_ts,NEW.persisted_ts)
  ON CONFLICT(contract_code) DO UPDATE SET
    last_observed_ts=MAX(shadow_virtual_position_ledger.last_observed_ts,excluded.last_observed_ts),
    persisted_ts=MAX(shadow_virtual_position_ledger.persisted_ts,excluded.persisted_ts);
END;


-- Journal proof-bearing campaign receipts atomically with the mutable current
-- campaign projection. A same receipt_id with non-identical content is a hard
-- collision and aborts the parent campaign write.
CREATE TRIGGER trg_stage392_campaign_receipt_journal_insert
AFTER INSERT ON multi_wave_campaign_shadow
WHEN json_type(NEW.stage392_proof_bundle_json,'$.campaign_bridge')='object'
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM stage392_multi_wave_receipt_journal j
    WHERE j.receipt_id=json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.persistence.receipt_id')
      AND (
        j.content_digest IS NOT json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.persistence.content_digest') OR
        j.receipt_json IS NOT json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge')
      )
  ) THEN RAISE(ABORT,'stage392 campaign receipt collision') END;
  INSERT OR IGNORE INTO stage392_multi_wave_receipt_journal (
    receipt_id,campaign_id,contract_code,state_revision,observation_id,content_digest,committed_ts,receipt_json
  ) VALUES (
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.persistence.receipt_id'),
    NEW.campaign_id,NEW.contract_code,
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.state_revision'),
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.observation_id'),
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.persistence.content_digest'),
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.persistence.committed_ts'),
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge')
  );
END;

CREATE TRIGGER trg_stage392_campaign_receipt_journal_update
AFTER UPDATE OF stage392_proof_bundle_json ON multi_wave_campaign_shadow
WHEN json_type(NEW.stage392_proof_bundle_json,'$.campaign_bridge')='object'
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM stage392_multi_wave_receipt_journal j
    WHERE j.receipt_id=json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.persistence.receipt_id')
      AND (
        j.content_digest IS NOT json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.persistence.content_digest') OR
        j.receipt_json IS NOT json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge')
      )
  ) THEN RAISE(ABORT,'stage392 campaign receipt collision') END;
  INSERT OR IGNORE INTO stage392_multi_wave_receipt_journal (
    receipt_id,campaign_id,contract_code,state_revision,observation_id,content_digest,committed_ts,receipt_json
  ) VALUES (
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.persistence.receipt_id'),
    NEW.campaign_id,NEW.contract_code,
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.state_revision'),
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.campaign.observation_id'),
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.persistence.content_digest'),
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge.persistence.committed_ts'),
    json_extract(NEW.stage392_proof_bundle_json,'$.campaign_bridge')
  );
END;

-- Once entry identity is factual for a wave it cannot be rewritten later.
CREATE TRIGGER trg_stage392_wave_entry_immutability
BEFORE UPDATE ON multi_wave_campaign_wave_shadow
WHEN OLD.entry_trigger_time IS NOT NULL
 AND EXISTS (
   SELECT 1 FROM multi_wave_campaign_shadow c
   WHERE c.campaign_id=OLD.campaign_id
     AND json_type(c.stage392_proof_bundle_json,'$.campaign_bridge')='object'
 )
 AND (
  NEW.entry_trigger_time IS NOT OLD.entry_trigger_time OR
  NEW.entry_trigger_price IS NOT OLD.entry_trigger_price OR
  NEW.base_start IS NOT OLD.base_start OR
  NEW.base_low IS NOT OLD.base_low OR
  NEW.base_high IS NOT OLD.base_high
)
BEGIN
  SELECT RAISE(ABORT,'stage392 immutable wave entry facts');
END;

CREATE TRIGGER trg_stage392_wave_impulse_immutability
BEFORE UPDATE ON multi_wave_campaign_wave_shadow
WHEN OLD.impulse_start IS NOT NULL
 AND EXISTS (
   SELECT 1 FROM multi_wave_campaign_shadow c
   WHERE c.campaign_id=OLD.campaign_id
     AND json_type(c.stage392_proof_bundle_json,'$.campaign_bridge')='object'
 )
 AND (
  NEW.impulse_start IS NOT OLD.impulse_start OR
  NEW.impulse_start_price IS NOT OLD.impulse_start_price
)
BEGIN
  SELECT RAISE(ABORT,'stage392 immutable wave impulse facts');
END;

-- Final Decision remains SHADOW-only. These triggers mutate only the virtual
-- shadow ledger and therefore add zero Worker peak-path queries.
CREATE TRIGGER trg_stage392_final_decision_open_virtual_position
AFTER INSERT ON final_decision_integration_shadow
WHEN NEW.entry_action='SHADOW_ENTRY_ELIGIBLE'
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM multi_wave_campaign_shadow c
    LEFT JOIN shadow_virtual_position_ledger p ON p.contract_code=NEW.contract_code
    WHERE c.contract_code=NEW.contract_code
      AND c.current_phase!='CLOSED'
      AND c.stage392_proof_bundle_json IS NOT NULL
      AND json_type(c.stage392_proof_bundle_json,'$.position_origin_seed')='object'
      AND json_extract(c.stage392_proof_bundle_json,'$.position_origin_seed.entry_action_id')=NEW.entry_action_id
      AND json_extract(c.stage392_proof_bundle_json,'$.position_origin_seed.direction')=NEW.direction
      AND json_extract(c.stage392_proof_bundle_json,'$.position_origin_seed.campaign_id')=json_extract(NEW.decision_json,'$.action_identity.entry.campaign_id')
      AND json_extract(c.stage392_proof_bundle_json,'$.position_origin_seed.entry_wave_id')=json_extract(NEW.decision_json,'$.action_identity.entry.wave_id')
      AND json_extract(c.stage392_proof_bundle_json,'$.position_origin_seed.entry_trigger_ts')=json_extract(NEW.decision_json,'$.action_identity.entry.entry_trigger_ts')
      AND json_extract(c.stage392_proof_bundle_json,'$.position_origin_seed.source_campaign_receipt_id')=NEW.campaign_receipt_id
      AND json_extract(c.stage392_proof_bundle_json,'$.campaign_bridge.persistence.receipt_id')=NEW.campaign_receipt_id
      AND c.last_observed_ts<=NEW.observation_ts
      AND p.state='FLAT' AND p.state_revision>=1
      AND p.last_observed_ts<=NEW.observation_ts AND p.persisted_ts<=NEW.persisted_ts
  ) THEN RAISE(ABORT,'stage392 virtual position entry precondition missing') END;
  INSERT INTO shadow_virtual_position_ledger (
    contract_code,state,state_revision,position_id,entry_ts,direction,campaign_id,entry_wave_id,
    entry_decision_observation_ts,entry_decision_material_digest,entry_decision_id,entry_action_id,
    origin_entry_trigger_price,origin_entry_observation_id,origin_campaign_state_revision,
    origin_source_campaign_receipt_id,origin_source_campaign_content_digest,origin_source_campaign_committed_ts,
    last_observed_ts,persisted_ts
  )
  SELECT
    NEW.contract_code,
    CASE NEW.direction WHEN 'LONG' THEN 'OPEN_LONG' ELSE 'OPEN_SHORT' END,
    COALESCE(p.state_revision,0)+1,
    'VP:'||NEW.entry_action_id,
    json_extract(c.stage392_proof_bundle_json,'$.position_origin_seed.entry_trigger_ts'),
    NEW.direction,
    json_extract(c.stage392_proof_bundle_json,'$.position_origin_seed.campaign_id'),
    json_extract(c.stage392_proof_bundle_json,'$.position_origin_seed.entry_wave_id'),
    NEW.observation_ts,NEW.material_digest,NEW.decision_id,NEW.entry_action_id,
    json_extract(c.stage392_proof_bundle_json,'$.position_origin_seed.entry_trigger_price'),
    json_extract(c.stage392_proof_bundle_json,'$.position_origin_seed.entry_observation_id'),
    json_extract(c.stage392_proof_bundle_json,'$.position_origin_seed.campaign_state_revision_at_entry'),
    json_extract(c.stage392_proof_bundle_json,'$.position_origin_seed.source_campaign_receipt_id'),
    json_extract(c.stage392_proof_bundle_json,'$.position_origin_seed.source_campaign_content_digest'),
    json_extract(c.stage392_proof_bundle_json,'$.position_origin_seed.source_campaign_committed_ts'),
    NEW.observation_ts,NEW.persisted_ts
  FROM multi_wave_campaign_shadow c
  LEFT JOIN shadow_virtual_position_ledger p ON p.contract_code=NEW.contract_code
  WHERE c.contract_code=NEW.contract_code
    AND c.current_phase!='CLOSED'
    AND c.stage392_proof_bundle_json IS NOT NULL
    AND json_type(c.stage392_proof_bundle_json,'$.position_origin_seed')='object'
    AND json_extract(c.stage392_proof_bundle_json,'$.position_origin_seed.entry_action_id')=NEW.entry_action_id
    AND json_extract(c.stage392_proof_bundle_json,'$.position_origin_seed.direction')=NEW.direction
    AND json_extract(c.stage392_proof_bundle_json,'$.position_origin_seed.campaign_id')=json_extract(NEW.decision_json,'$.action_identity.entry.campaign_id')
    AND json_extract(c.stage392_proof_bundle_json,'$.position_origin_seed.entry_wave_id')=json_extract(NEW.decision_json,'$.action_identity.entry.wave_id')
    AND json_extract(c.stage392_proof_bundle_json,'$.position_origin_seed.entry_trigger_ts')=json_extract(NEW.decision_json,'$.action_identity.entry.entry_trigger_ts')
    AND json_extract(c.stage392_proof_bundle_json,'$.position_origin_seed.source_campaign_receipt_id')=NEW.campaign_receipt_id
    AND json_extract(c.stage392_proof_bundle_json,'$.campaign_bridge.persistence.receipt_id')=NEW.campaign_receipt_id
    AND c.last_observed_ts<=NEW.observation_ts
    AND p.state='FLAT' AND p.state_revision>=1
    AND p.last_observed_ts<=NEW.observation_ts AND p.persisted_ts<=NEW.persisted_ts
  ORDER BY c.last_observed_ts DESC LIMIT 1
  ON CONFLICT(contract_code) DO UPDATE SET
    state=excluded.state,state_revision=excluded.state_revision,position_id=excluded.position_id,
    entry_ts=excluded.entry_ts,direction=excluded.direction,campaign_id=excluded.campaign_id,
    entry_wave_id=excluded.entry_wave_id,entry_decision_observation_ts=excluded.entry_decision_observation_ts,
    entry_decision_material_digest=excluded.entry_decision_material_digest,
    entry_decision_id=excluded.entry_decision_id,entry_action_id=excluded.entry_action_id,
    origin_entry_trigger_price=excluded.origin_entry_trigger_price,
    origin_entry_observation_id=excluded.origin_entry_observation_id,
    origin_campaign_state_revision=excluded.origin_campaign_state_revision,
    origin_source_campaign_receipt_id=excluded.origin_source_campaign_receipt_id,
    origin_source_campaign_content_digest=excluded.origin_source_campaign_content_digest,
    origin_source_campaign_committed_ts=excluded.origin_source_campaign_committed_ts,
    last_observed_ts=excluded.last_observed_ts,persisted_ts=excluded.persisted_ts
  WHERE shadow_virtual_position_ledger.state='FLAT';
END;

CREATE TRIGGER trg_stage392_final_decision_exit_virtual_position
AFTER INSERT ON final_decision_integration_shadow
WHEN NEW.management_action='EXIT'
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM shadow_virtual_position_ledger p
    WHERE p.contract_code=NEW.contract_code
      AND p.state=NEW.position_state
      AND p.state IN ('OPEN_LONG','OPEN_SHORT')
      AND p.position_id=json_extract(NEW.decision_json,'$.action_identity.management.position_id')
      AND p.state_revision=json_extract(NEW.decision_json,'$.action_identity.management.position_state_revision')
      AND p.direction=json_extract(NEW.decision_json,'$.action_identity.management.position_direction')
      AND p.last_observed_ts<=NEW.observation_ts AND p.persisted_ts<=NEW.persisted_ts
  ) THEN RAISE(ABORT,'stage392 virtual position exit precondition missing') END;
  UPDATE shadow_virtual_position_ledger SET
    state='FLAT',state_revision=state_revision+1,position_id=NULL,entry_ts=NULL,direction=NULL,
    campaign_id=NULL,entry_wave_id=NULL,entry_decision_observation_ts=NULL,
    entry_decision_material_digest=NULL,entry_decision_id=NULL,entry_action_id=NULL,
    origin_entry_trigger_price=NULL,origin_entry_observation_id=NULL,origin_campaign_state_revision=NULL,
    origin_source_campaign_receipt_id=NULL,origin_source_campaign_content_digest=NULL,
    origin_source_campaign_committed_ts=NULL,last_observed_ts=NEW.observation_ts,persisted_ts=NEW.persisted_ts
  WHERE contract_code=NEW.contract_code
    AND state=NEW.position_state
    AND position_id=json_extract(NEW.decision_json,'$.action_identity.management.position_id')
    AND state_revision=json_extract(NEW.decision_json,'$.action_identity.management.position_state_revision')
    AND direction=json_extract(NEW.decision_json,'$.action_identity.management.position_direction');
END;
