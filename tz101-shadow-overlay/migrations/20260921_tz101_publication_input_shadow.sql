-- Exact, immutable publication inputs. Provisioning is shadow-only and is not
-- performed by the hot path. Worker reads at most one row by decision_id.
CREATE TABLE IF NOT EXISTS tz101_publication_input_shadow (
  bundle_id TEXT PRIMARY KEY CHECK(bundle_id GLOB 'TPI:[0-9a-f]*' AND length(bundle_id)=20),
  decision_id TEXT NOT NULL UNIQUE,
  snapshot_id TEXT NOT NULL,
  contract_code TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('LONG','SHORT')),
  observation_ts INTEGER NOT NULL,
  entry_area_rule_receipt_id TEXT NOT NULL,
  fee_schedule_receipt_id TEXT NOT NULL,
  holding_plan_receipt_id TEXT NOT NULL,
  bundle_json TEXT NOT NULL CHECK(json_valid(bundle_json) AND length(bundle_json)<=65536),
  bundle_digest TEXT NOT NULL CHECK(length(bundle_digest)=16 AND bundle_digest NOT GLOB '*[^0-9a-f]*'),
  status TEXT NOT NULL CHECK(status='CLOSED'),
  persisted_ts INTEGER NOT NULL CHECK(persisted_ts>=observation_ts),
  CHECK(length(trim(decision_id))>0 AND length(trim(snapshot_id))>0 AND length(trim(contract_code))>0),
  CHECK(length(trim(entry_area_rule_receipt_id))>0 AND length(trim(fee_schedule_receipt_id))>0 AND length(trim(holding_plan_receipt_id))>0)
);

CREATE INDEX IF NOT EXISTS idx_tz101_publication_input_contract_ts
  ON tz101_publication_input_shadow(contract_code,observation_ts DESC);

CREATE TRIGGER IF NOT EXISTS trg_tz101_publication_input_insert_guard
BEFORE INSERT ON tz101_publication_input_shadow
BEGIN
  SELECT CASE WHEN
    json_extract(NEW.bundle_json,'$.schema_version') IS NOT 'tz101-publication-input-bundle-v1' OR
    json_extract(NEW.bundle_json,'$.status') IS NOT 'CLOSED' OR
    json_extract(NEW.bundle_json,'$.decision_id') IS NOT NEW.decision_id OR
    json_extract(NEW.bundle_json,'$.snapshot_id') IS NOT NEW.snapshot_id OR
    json_extract(NEW.bundle_json,'$.contract_code') IS NOT NEW.contract_code OR
    json_extract(NEW.bundle_json,'$.direction') IS NOT NEW.direction OR
    CAST(json_extract(NEW.bundle_json,'$.observation_ts') AS INTEGER) IS NOT NEW.observation_ts OR
    json_extract(NEW.bundle_json,'$.entry_area_rule.persistence.receipt_id') IS NOT NEW.entry_area_rule_receipt_id OR
    json_extract(NEW.bundle_json,'$.fee_schedule.persistence.receipt_id') IS NOT NEW.fee_schedule_receipt_id OR
    json_extract(NEW.bundle_json,'$.holding_plan.persistence.receipt_id') IS NOT NEW.holding_plan_receipt_id OR
    json_extract(NEW.bundle_json,'$.shadow_only') IS NOT 1 OR
    json_extract(NEW.bundle_json,'$.automatic_trade') IS NOT 0 OR
    json_extract(NEW.bundle_json,'$.automatic_rule_promotion') IS NOT 0
  THEN RAISE(ABORT,'TZ101_PUBLICATION_INPUT_BINDING_GUARD') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_tz101_publication_input_no_update
BEFORE UPDATE ON tz101_publication_input_shadow
BEGIN SELECT RAISE(ABORT,'TZ101_PUBLICATION_INPUT_IMMUTABLE'); END;

CREATE TRIGGER IF NOT EXISTS trg_tz101_publication_input_no_delete
BEFORE DELETE ON tz101_publication_input_shadow
BEGIN SELECT RAISE(ABORT,'TZ101_PUBLICATION_INPUT_IMMUTABLE'); END;
