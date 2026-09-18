-- MY_REPORT_2 V3: zero-extra-query wiring of Discovery -> Deep Check handoff.
-- Adds metadata to already-counted scheduler/run-log writes and mirrors lifecycle
-- to v3_discovery_deep_handoff_shadow through D1 triggers.

ALTER TABLE deep_check_scheduler_state ADD COLUMN v3_handoff_id TEXT;
ALTER TABLE deep_check_scheduler_state ADD COLUMN v3_handoff_logical_key TEXT;
ALTER TABLE deep_check_scheduler_state ADD COLUMN v3_scan_ts INTEGER;
ALTER TABLE deep_check_scheduler_state ADD COLUMN v3_base_ticker TEXT;
ALTER TABLE deep_check_scheduler_state ADD COLUMN v3_discovery_rank INTEGER;
ALTER TABLE deep_check_scheduler_state ADD COLUMN v3_detectors_json TEXT;
ALTER TABLE deep_check_scheduler_state ADD COLUMN v3_evidence_ids_json TEXT;
ALTER TABLE deep_check_scheduler_state ADD COLUMN v3_first_seen_state_json TEXT;
ALTER TABLE deep_check_scheduler_state ADD COLUMN v3_current_state_json TEXT;
ALTER TABLE deep_check_scheduler_state ADD COLUMN v3_direction TEXT;
ALTER TABLE deep_check_scheduler_state ADD COLUMN v3_wave_id TEXT;
ALTER TABLE deep_check_scheduler_state ADD COLUMN v3_dedup_reentry_key TEXT;

ALTER TABLE deep_check_run_log ADD COLUMN v3_handoff_id TEXT;
ALTER TABLE deep_check_run_log ADD COLUMN v3_handoff_logical_key TEXT;
ALTER TABLE deep_check_run_log ADD COLUMN v3_scan_ts INTEGER;
ALTER TABLE deep_check_run_log ADD COLUMN v3_base_ticker TEXT;
ALTER TABLE deep_check_run_log ADD COLUMN v3_discovery_rank INTEGER;
ALTER TABLE deep_check_run_log ADD COLUMN v3_detectors_json TEXT;
ALTER TABLE deep_check_run_log ADD COLUMN v3_evidence_ids_json TEXT;
ALTER TABLE deep_check_run_log ADD COLUMN v3_first_seen_state_json TEXT;
ALTER TABLE deep_check_run_log ADD COLUMN v3_current_state_json TEXT;
ALTER TABLE deep_check_run_log ADD COLUMN v3_direction TEXT;
ALTER TABLE deep_check_run_log ADD COLUMN v3_wave_id TEXT;
ALTER TABLE deep_check_run_log ADD COLUMN v3_dedup_reentry_key TEXT;

CREATE INDEX IF NOT EXISTS idx_deep_check_scheduler_v3_handoff
ON deep_check_scheduler_state(v3_handoff_id);

CREATE INDEX IF NOT EXISTS idx_deep_check_run_log_v3_handoff
ON deep_check_run_log(v3_handoff_id);

CREATE TRIGGER IF NOT EXISTS trg_v3_handoff_scheduler_insert_claim
AFTER INSERT ON deep_check_scheduler_state
WHEN NEW.v3_handoff_id IS NOT NULL AND NEW.last_status='RUNNING'
BEGIN
  INSERT INTO v3_discovery_deep_handoff_shadow (
    handoff_id, logical_key, source_run_id, scan_ts, contract_code, base_ticker,
    discovery_rank, detectors_json, evidence_ids_json, first_seen_state_json,
    current_state_json, direction, wave_id, dedup_reentry_key, state,
    attempt_count, lease_owner, lease_started_ts, lease_expires_ts,
    created_ts, updated_ts, shadow_only
  ) VALUES (
    NEW.v3_handoff_id, NEW.v3_handoff_logical_key, NEW.last_run_id,
    NEW.v3_scan_ts, NEW.contract_code, NEW.v3_base_ticker,
    NEW.v3_discovery_rank, COALESCE(NEW.v3_detectors_json,'[]'),
    COALESCE(NEW.v3_evidence_ids_json,'[]'), NEW.v3_first_seen_state_json,
    NEW.v3_current_state_json, NEW.v3_direction, NEW.v3_wave_id,
    NEW.v3_dedup_reentry_key, 'CLAIMED', 1, NEW.last_run_id,
    NEW.last_started_ts, NULL, NEW.last_started_ts, NEW.updated_ts, 1
  )
  ON CONFLICT(handoff_id) DO UPDATE SET
    state = CASE
      WHEN v3_discovery_deep_handoff_shadow.state IN ('COMPLETED','BLOCKED_FINAL','EXPIRED')
        THEN v3_discovery_deep_handoff_shadow.state
      ELSE 'CLAIMED'
    END,
    attempt_count = CASE
      WHEN v3_discovery_deep_handoff_shadow.state IN ('COMPLETED','BLOCKED_FINAL','EXPIRED')
        THEN v3_discovery_deep_handoff_shadow.attempt_count
      ELSE v3_discovery_deep_handoff_shadow.attempt_count + 1
    END,
    lease_owner=NEW.last_run_id,
    lease_started_ts=NEW.last_started_ts,
    updated_ts=NEW.updated_ts;
END;

CREATE TRIGGER IF NOT EXISTS trg_v3_handoff_scheduler_update_claim
AFTER UPDATE OF v3_handoff_id, last_started_ts, last_status ON deep_check_scheduler_state
WHEN NEW.v3_handoff_id IS NOT NULL AND NEW.last_status='RUNNING'
BEGIN
  INSERT INTO v3_discovery_deep_handoff_shadow (
    handoff_id, logical_key, source_run_id, scan_ts, contract_code, base_ticker,
    discovery_rank, detectors_json, evidence_ids_json, first_seen_state_json,
    current_state_json, direction, wave_id, dedup_reentry_key, state,
    attempt_count, lease_owner, lease_started_ts, lease_expires_ts,
    created_ts, updated_ts, shadow_only
  ) VALUES (
    NEW.v3_handoff_id, NEW.v3_handoff_logical_key, NEW.last_run_id,
    NEW.v3_scan_ts, NEW.contract_code, NEW.v3_base_ticker,
    NEW.v3_discovery_rank, COALESCE(NEW.v3_detectors_json,'[]'),
    COALESCE(NEW.v3_evidence_ids_json,'[]'), NEW.v3_first_seen_state_json,
    NEW.v3_current_state_json, NEW.v3_direction, NEW.v3_wave_id,
    NEW.v3_dedup_reentry_key, 'CLAIMED', 1, NEW.last_run_id,
    NEW.last_started_ts, NULL, NEW.last_started_ts, NEW.updated_ts, 1
  )
  ON CONFLICT(handoff_id) DO UPDATE SET
    state = CASE
      WHEN v3_discovery_deep_handoff_shadow.state IN ('COMPLETED','BLOCKED_FINAL','EXPIRED')
        THEN v3_discovery_deep_handoff_shadow.state
      ELSE 'CLAIMED'
    END,
    attempt_count = CASE
      WHEN v3_discovery_deep_handoff_shadow.state IN ('COMPLETED','BLOCKED_FINAL','EXPIRED')
        THEN v3_discovery_deep_handoff_shadow.attempt_count
      ELSE v3_discovery_deep_handoff_shadow.attempt_count + 1
    END,
    lease_owner=NEW.last_run_id,
    lease_started_ts=NEW.last_started_ts,
    updated_ts=NEW.updated_ts;
END;

CREATE TRIGGER IF NOT EXISTS trg_v3_handoff_scheduler_finalize
AFTER UPDATE OF last_status, last_completed_ts, last_error ON deep_check_scheduler_state
WHEN NEW.v3_handoff_id IS NOT NULL AND NEW.last_status IN ('COMPLETED','ERROR')
BEGIN
  UPDATE v3_discovery_deep_handoff_shadow
  SET state = CASE WHEN NEW.last_status='COMPLETED' THEN 'COMPLETED' ELSE 'FAILED_RETRYABLE' END,
      deep_check_run_id = NEW.last_run_id,
      zero_reason = NULL,
      last_error = NEW.last_error,
      lease_owner = NULL,
      lease_expires_ts = NULL,
      completed_ts = CASE WHEN NEW.last_status='COMPLETED' THEN NEW.last_completed_ts ELSE NULL END,
      updated_ts = NEW.updated_ts
  WHERE handoff_id = NEW.v3_handoff_id
    AND state NOT IN ('BLOCKED_FINAL','EXPIRED');
END;
