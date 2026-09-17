-- TZ 10.1 additive sidecar for exact Telegram decision context.
-- Local candidate only. Do not apply remotely without explicit schema/deploy audit.
CREATE TABLE IF NOT EXISTS final_decision_telegram_context_shadow (
  context_id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL UNIQUE,
  material_digest TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  contract_code TEXT NOT NULL,
  observation_ts INTEGER NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('LONG','SHORT')),
  decision_evidence_receipt_id TEXT NOT NULL,
  full_evidence_receipt_id TEXT NOT NULL,
  safety_gate_receipt_id TEXT NOT NULL,
  score_schema TEXT NOT NULL CHECK(score_schema='telegram-final-context-v1'),
  score_semantics TEXT NOT NULL CHECK(score_semantics='FOUR_BLOCK_35_30_20_15_V1'),
  score_lower_bound REAL NOT NULL CHECK(score_lower_bound>=0 AND score_lower_bound<=100),
  score_upper_bound REAL NOT NULL CHECK(score_upper_bound>=0 AND score_upper_bound<=100 AND score_upper_bound>=score_lower_bound),
  valid_until_ts INTEGER NOT NULL,
  context_json TEXT NOT NULL CHECK(json_valid(context_json)),
  context_digest TEXT NOT NULL CHECK(length(context_digest)=64 AND context_digest NOT GLOB '*[^0-9a-f]*'),
  status TEXT NOT NULL DEFAULT 'CLOSED' CHECK(status IN ('CLOSED','SUPERSEDED','INVALIDATED')),
  persisted_ts INTEGER NOT NULL,
  CHECK(length(trim(decision_id))>0),
  CHECK(length(trim(material_digest))>0),
  CHECK(length(trim(snapshot_id))>0),
  CHECK(length(trim(contract_code))>0),
  CHECK(length(trim(decision_evidence_receipt_id))>0),
  CHECK(length(trim(full_evidence_receipt_id))>0),
  CHECK(length(trim(safety_gate_receipt_id))>0),
  CHECK(valid_until_ts>=observation_ts),
  CHECK(valid_until_ts<=observation_ts+900000),
  CHECK(persisted_ts>=observation_ts)
);

CREATE INDEX IF NOT EXISTS idx_final_decision_telegram_context_shadow_recent
  ON final_decision_telegram_context_shadow(persisted_ts DESC);

CREATE TRIGGER IF NOT EXISTS trg_final_decision_telegram_context_insert_guard
BEFORE INSERT ON final_decision_telegram_context_shadow
BEGIN
  SELECT CASE WHEN
    json_extract(NEW.context_json,'$.schema') IS NOT NEW.score_schema OR
    json_extract(NEW.context_json,'$.score_semantics') IS NOT NEW.score_semantics OR
    json_extract(NEW.context_json,'$.is_probability') IS NOT 0 OR
    json_extract(NEW.context_json,'$.decision_id') IS NOT NEW.decision_id OR
    json_extract(NEW.context_json,'$.material_digest') IS NOT NEW.material_digest OR
    json_extract(NEW.context_json,'$.snapshot_id') IS NOT NEW.snapshot_id OR
    CAST(json_extract(NEW.context_json,'$.observation_ts') AS INTEGER) IS NOT NEW.observation_ts OR
    upper(json_extract(NEW.context_json,'$.direction')) IS NOT NEW.direction OR
    json_extract(NEW.context_json,'$.decision_evidence_receipt_id') IS NOT NEW.decision_evidence_receipt_id OR
    json_extract(NEW.context_json,'$.full_evidence_receipt_id') IS NOT NEW.full_evidence_receipt_id OR
    json_extract(NEW.context_json,'$.safety_gate_receipt_id') IS NOT NEW.safety_gate_receipt_id OR
    CAST(json_extract(NEW.context_json,'$.score_lower_bound') AS REAL) IS NOT NEW.score_lower_bound OR
    CAST(json_extract(NEW.context_json,'$.score_upper_bound') AS REAL) IS NOT NEW.score_upper_bound OR
    CAST(json_extract(NEW.context_json,'$.valid_until_ts') AS INTEGER) IS NOT NEW.valid_until_ts OR
    json_type(NEW.context_json,'$.weighted_blocks')!='array' OR
    json_array_length(NEW.context_json,'$.weighted_blocks')!=4 OR
    json_type(NEW.context_json,'$.entry')!='object' OR
    json_type(NEW.context_json,'$.funding')!='object'
  THEN RAISE(ABORT,'FINAL_DECISION_TELEGRAM_CONTEXT_BINDING_GUARD') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_final_decision_telegram_context_no_update
BEFORE UPDATE ON final_decision_telegram_context_shadow
BEGIN
  SELECT RAISE(ABORT,'FINAL_DECISION_TELEGRAM_CONTEXT_IMMUTABLE');
END;
