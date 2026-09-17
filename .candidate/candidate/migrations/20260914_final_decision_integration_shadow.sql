-- My Report 2 / Final Decision Integration Shadow v1
-- Stage 3.9.2 candidate only. This migration does not wire Worker dispatch,
-- Telegram, trading execution, live probability, validation, or weight tuning.
--
-- Creation is intentionally fail-loud: every durable object uses an unconditional
-- create statement. A pre-existing object is schema drift, not a successful apply.
-- The Worker needs one top-level INSERT only; all bounded housekeeping is in
-- triggers and is atomic with that INSERT.

CREATE TABLE final_decision_integration_shadow (
  decision_id TEXT PRIMARY KEY NOT NULL
    CHECK (length(decision_id) BETWEEN 1 AND 320)
    CHECK (decision_id GLOB '[A-Za-z0-9]*')
    CHECK (decision_id NOT GLOB '*[^A-Za-z0-9._:@/-]*'),
  schema_version TEXT NOT NULL CHECK (schema_version='final-decision-integration-shadow-v1'),
  mode TEXT NOT NULL CHECK (mode='SHADOW_ONLY_NO_EXECUTION'),
  material_digest TEXT NOT NULL
    CHECK (length(material_digest)=16 AND material_digest NOT GLOB '*[^0-9a-f]*'),
  input_lineage_digest TEXT NOT NULL
    CHECK (length(input_lineage_digest)=16 AND input_lineage_digest NOT GLOB '*[^0-9a-f]*'),
  snapshot_id TEXT NOT NULL
    CHECK (length(snapshot_id) BETWEEN 1 AND 256)
    CHECK (snapshot_id GLOB '[A-Za-z0-9]*')
    CHECK (snapshot_id NOT GLOB '*[^A-Za-z0-9._:@/-]*'),
  engine_version TEXT NOT NULL CHECK (engine_version='3.9.2-final-decision-integration-shadow'),
  rules_version TEXT NOT NULL CHECK (rules_version='decision-orchestrator-gates-v2'),
  decision_status TEXT NOT NULL CHECK (decision_status IN ('SHADOW_EVALUATED','FAIL_CLOSED')),
  contract_code TEXT NOT NULL
    CHECK (length(contract_code) BETWEEN 1 AND 80)
    CHECK (contract_code GLOB '[A-Z0-9]*')
    CHECK (contract_code NOT GLOB '*[^A-Z0-9._:-]*'),
  observation_ts INTEGER NOT NULL CHECK (observation_ts>0),
  direction TEXT NOT NULL CHECK (direction IN ('LONG','SHORT','NEUTRAL','INSUFFICIENT')),
  directional_quality TEXT NOT NULL CHECK (directional_quality IN ('CLOSED','PARTIAL','CONFLICTING','BLOCKED','INSUFFICIENT','NOT_EVALUATED')),
  entry_action TEXT NOT NULL CHECK (entry_action IN ('SHADOW_ENTRY_ELIGIBLE','WAIT','REJECT','NOT_EVALUATED')),
  entry_action_id TEXT
    CHECK (entry_action_id IS NULL OR (
      length(entry_action_id) BETWEEN 1 AND 320 AND
      entry_action_id GLOB '[A-Za-z0-9]*' AND
      entry_action_id NOT GLOB '*[^A-Za-z0-9._:@/-]*'
    )),
  entry_quality TEXT NOT NULL CHECK (entry_quality IN ('CLOSED','PARTIAL','CONFLICTING','BLOCKED','INSUFFICIENT','NOT_EVALUATED')),
  data_quality TEXT NOT NULL CHECK (data_quality IN ('CLOSED','PARTIAL','CONFLICTING','BLOCKED','INSUFFICIENT','NOT_EVALUATED')),
  execution_quality TEXT NOT NULL CHECK (execution_quality IN ('CLOSED','PARTIAL','CONFLICTING','BLOCKED','INSUFFICIENT','NOT_EVALUATED')),
  entry_execution_quality TEXT NOT NULL CHECK (entry_execution_quality IN ('CLOSED','PARTIAL','CONFLICTING','BLOCKED','INSUFFICIENT','NOT_EVALUATED')),
  management_execution_quality TEXT NOT NULL CHECK (management_execution_quality IN ('CLOSED','PARTIAL','CONFLICTING','BLOCKED','INSUFFICIENT','NOT_EVALUATED')),
  campaign_phase TEXT NOT NULL CHECK (campaign_phase IN (
    'DISCOVERY','PRE_IMPULSE_WATCH','ENTRY_CANDIDATE','ENTRY_TRIGGER','IMPULSE',
    'RELOAD_BASE','NEXT_IMPULSE_WATCH','NEXT_IMPULSE_ENTRY','EXHAUSTION_WARNING',
    'EDGE_SPENT','CLOSED','UNKNOWN'
  )),
  campaign_quality TEXT NOT NULL CHECK (campaign_quality IN ('CLOSED','BLOCKED','INSUFFICIENT')),
  independence_state TEXT NOT NULL CHECK (independence_state IN ('CLOSED','PARTIAL','CORRELATED','CONFLICTING','BLOCKED','INSUFFICIENT','NOT_EVALUATED')),
  timing_state TEXT NOT NULL CHECK (timing_state IN ('EARLY','ENTRY_WINDOW','ACTIVE_MOVE','RELOAD','LATE','EDGE_SPENT','BLOCKED','INSUFFICIENT','NOT_EVALUATED')),
  risk_state TEXT NOT NULL CHECK (risk_state IN ('CLEAR','CAUTION','INVALIDATED','BLOCKED','INSUFFICIENT')),
  position_state TEXT NOT NULL CHECK (position_state IN ('NONE','FLAT','OPEN_LONG','OPEN_SHORT','UNKNOWN','NOT_EVALUATED')),
  management_action TEXT NOT NULL CHECK (management_action IN ('HOLD','EXIT','NOT_EVALUATED')),
  management_intent TEXT NOT NULL CHECK (management_intent IN ('HOLD_ALLOWED','EXIT_REQUIRED','NOT_EVALUATED')),
  management_action_id TEXT
    CHECK (management_action_id IS NULL OR (
      length(management_action_id) BETWEEN 1 AND 320 AND
      management_action_id GLOB '[A-Za-z0-9]*' AND
      management_action_id NOT GLOB '*[^A-Za-z0-9._:@/-]*'
    )),
  management_quality TEXT NOT NULL CHECK (management_quality IN ('CLOSED','PARTIAL','CONFLICTING','BLOCKED','INSUFFICIENT','NOT_EVALUATED')),
  hard_veto INTEGER NOT NULL CHECK (hard_veto IN (0,1)),
  hard_veto_state TEXT NOT NULL CHECK (hard_veto_state IN ('ACTIVE','CLEAR','BLOCKED','INSUFFICIENT')),
  calibration_eligible INTEGER NOT NULL CHECK (calibration_eligible=0),
  shadow_outcome_collection_eligible INTEGER NOT NULL CHECK (shadow_outcome_collection_eligible=0),
  shadow_only INTEGER NOT NULL CHECK (shadow_only=1),
  live_probability REAL CHECK (live_probability IS NULL),
  validated_signal INTEGER NOT NULL CHECK (validated_signal=0),
  execution_authorized INTEGER NOT NULL CHECK (execution_authorized=0),
  telegram_eligible INTEGER NOT NULL CHECK (telegram_eligible=0),

  decision_evidence_receipt_id TEXT CHECK (decision_evidence_receipt_id IS NULL OR (
    length(decision_evidence_receipt_id) BETWEEN 1 AND 256 AND
    decision_evidence_receipt_id GLOB '[A-Za-z0-9]*' AND
    decision_evidence_receipt_id NOT GLOB '*[^A-Za-z0-9._:@/-]*'
  )),
  full_evidence_receipt_id TEXT CHECK (full_evidence_receipt_id IS NULL OR (
    length(full_evidence_receipt_id) BETWEEN 1 AND 256 AND
    full_evidence_receipt_id GLOB '[A-Za-z0-9]*' AND
    full_evidence_receipt_id NOT GLOB '*[^A-Za-z0-9._:@/-]*'
  )),
  full_evidence_source_receipt_id TEXT CHECK (full_evidence_source_receipt_id IS NULL OR (
    length(full_evidence_source_receipt_id) BETWEEN 1 AND 256 AND
    full_evidence_source_receipt_id GLOB '[A-Za-z0-9]*' AND
    full_evidence_source_receipt_id NOT GLOB '*[^A-Za-z0-9._:@/-]*'
  )),
  opportunity_receipt_id TEXT CHECK (opportunity_receipt_id IS NULL OR (
    length(opportunity_receipt_id) BETWEEN 1 AND 256 AND
    opportunity_receipt_id GLOB '[A-Za-z0-9]*' AND
    opportunity_receipt_id NOT GLOB '*[^A-Za-z0-9._:@/-]*'
  )),
  campaign_receipt_id TEXT CHECK (campaign_receipt_id IS NULL OR (
    length(campaign_receipt_id) BETWEEN 1 AND 256 AND
    campaign_receipt_id GLOB '[A-Za-z0-9]*' AND
    campaign_receipt_id NOT GLOB '*[^A-Za-z0-9._:@/-]*'
  )),
  safety_gate_receipt_id TEXT CHECK (safety_gate_receipt_id IS NULL OR (
    length(safety_gate_receipt_id) BETWEEN 1 AND 256 AND
    safety_gate_receipt_id GLOB '[A-Za-z0-9]*' AND
    safety_gate_receipt_id NOT GLOB '*[^A-Za-z0-9._:@/-]*'
  )),
  position_receipt_id TEXT CHECK (position_receipt_id IS NULL OR (
    length(position_receipt_id) BETWEEN 1 AND 256 AND
    position_receipt_id GLOB '[A-Za-z0-9]*' AND
    position_receipt_id NOT GLOB '*[^A-Za-z0-9._:@/-]*'
  )),
  position_origin_campaign_receipt_id TEXT CHECK (position_origin_campaign_receipt_id IS NULL OR (
    length(position_origin_campaign_receipt_id) BETWEEN 1 AND 256 AND
    position_origin_campaign_receipt_id GLOB '[A-Za-z0-9]*' AND
    position_origin_campaign_receipt_id NOT GLOB '*[^A-Za-z0-9._:@/-]*'
  )),
  position_management_receipt_id TEXT CHECK (position_management_receipt_id IS NULL OR (
    length(position_management_receipt_id) BETWEEN 1 AND 256 AND
    position_management_receipt_id GLOB '[A-Za-z0-9]*' AND
    position_management_receipt_id NOT GLOB '*[^A-Za-z0-9._:@/-]*'
  )),

  -- Reconciliation point: any future immutable lineage scalar belongs here,
  -- immediately before reason_codes_json. Shadow outcome samples belong to their
  -- standalone sidecar and must not be added to this decision journal.
  reason_codes_json TEXT NOT NULL
    CHECK (json_valid(reason_codes_json))
    CHECK (json_type(reason_codes_json)='array')
    CHECK (reason_codes_json=json(reason_codes_json))
    CHECK (length(CAST(reason_codes_json AS BLOB))<=4096),
  decision_json TEXT NOT NULL
    CHECK (json_valid(decision_json))
    CHECK (json_type(decision_json)='object')
    CHECK (decision_json=json(decision_json))
    CHECK (length(CAST(decision_json AS BLOB))<=24576),
  persisted_ts INTEGER NOT NULL CHECK (persisted_ts>0),

  -- Storage-level safety fuses not supplied by runtime; defaults are immutable
  -- zero/NULL and make accidental direct-SQL promotion fail closed.
  live_signal INTEGER NOT NULL DEFAULT 0 CHECK (live_signal=0),
  trading_execution INTEGER NOT NULL DEFAULT 0 CHECK (trading_execution=0),
  strategy_weights_changed INTEGER NOT NULL DEFAULT 0 CHECK (strategy_weights_changed=0),
  automatic_weight_tuning INTEGER NOT NULL DEFAULT 0 CHECK (automatic_weight_tuning=0),

  CONSTRAINT uq_final_decision_contract_observation UNIQUE(contract_code,observation_ts),
  CONSTRAINT uq_final_decision_contract_snapshot UNIQUE(contract_code,snapshot_id),
  CHECK (
    instr(decision_id,char(0))=0 AND instr(material_digest,char(0))=0 AND
    instr(input_lineage_digest,char(0))=0 AND instr(snapshot_id,char(0))=0 AND
    instr(contract_code,char(0))=0 AND instr(COALESCE(entry_action_id,''),char(0))=0 AND
    instr(COALESCE(management_action_id,''),char(0))=0 AND
    instr(COALESCE(decision_evidence_receipt_id,''),char(0))=0 AND
    instr(COALESCE(full_evidence_receipt_id,''),char(0))=0 AND
    instr(COALESCE(full_evidence_source_receipt_id,''),char(0))=0 AND
    instr(COALESCE(opportunity_receipt_id,''),char(0))=0 AND
    instr(COALESCE(campaign_receipt_id,''),char(0))=0 AND
    instr(COALESCE(safety_gate_receipt_id,''),char(0))=0 AND
    instr(COALESCE(position_receipt_id,''),char(0))=0 AND
    instr(COALESCE(position_origin_campaign_receipt_id,''),char(0))=0 AND
    instr(COALESCE(position_management_receipt_id,''),char(0))=0
  ),
  CHECK (decision_id='FDI:'||contract_code||':'||CAST(observation_ts AS TEXT)||':'||material_digest),
  -- Commit-lag policy is five minutes. It is deliberately independent of the
  -- 180-day retention horizon implemented by the cleanup trigger.
  CHECK (observation_ts<=persisted_ts),
  CHECK (observation_ts>=persisted_ts-300000),
  CHECK ((hard_veto_state='ACTIVE')=(hard_veto=1)),
  CHECK (hard_veto=0 OR risk_state='INVALIDATED'),
  CHECK (entry_quality=CASE entry_action
    WHEN 'SHADOW_ENTRY_ELIGIBLE' THEN 'CLOSED'
    WHEN 'WAIT' THEN 'INSUFFICIENT'
    WHEN 'REJECT' THEN 'BLOCKED'
    ELSE 'NOT_EVALUATED' END),
  CHECK (execution_quality=CASE
    WHEN position_state IN ('OPEN_LONG','OPEN_SHORT') THEN management_execution_quality
    ELSE entry_execution_quality END),
  CHECK (entry_action!='SHADOW_ENTRY_ELIGIBLE' OR (
    decision_status='SHADOW_EVALUATED' AND entry_action_id IS NOT NULL AND entry_action_id GLOB 'FDE:*' AND
    direction IN ('LONG','SHORT') AND directional_quality='CLOSED' AND entry_quality='CLOSED' AND
    data_quality='CLOSED' AND execution_quality='CLOSED' AND entry_execution_quality='CLOSED' AND
    campaign_quality='CLOSED' AND independence_state='CLOSED' AND timing_state='ENTRY_WINDOW' AND
    campaign_phase IN ('ENTRY_TRIGGER','NEXT_IMPULSE_ENTRY') AND risk_state='CLEAR' AND
    hard_veto=0 AND hard_veto_state='CLEAR' AND position_state IN ('FLAT','NONE') AND
    json_extract(decision_json,'$.source_quality.position') IS 'CLOSED'
  )),
  CHECK (entry_action='SHADOW_ENTRY_ELIGIBLE' OR entry_action_id IS NULL),
  CHECK (position_state NOT IN ('OPEN_LONG','OPEN_SHORT') OR (
    entry_action='NOT_EVALUATED' AND entry_quality='NOT_EVALUATED' AND
    entry_execution_quality='NOT_EVALUATED'
  )),
  CHECK (position_state IN ('OPEN_LONG','OPEN_SHORT') OR (
    management_action='NOT_EVALUATED' AND management_intent='NOT_EVALUATED' AND
    management_quality='NOT_EVALUATED' AND management_execution_quality='NOT_EVALUATED'
  )),
  CHECK (management_action NOT IN ('HOLD','EXIT') OR (
    position_state IN ('OPEN_LONG','OPEN_SHORT') AND management_quality='CLOSED'
  )),
  CHECK (position_state NOT IN ('OPEN_LONG','OPEN_SHORT') OR
    management_action!='NOT_EVALUATED' OR management_quality IN ('BLOCKED','INSUFFICIENT')),
  CHECK ((management_action='HOLD')=(management_intent='HOLD_ALLOWED')),
  CHECK (management_action!='EXIT' OR management_intent='EXIT_REQUIRED'),
  CHECK (management_intent!='EXIT_REQUIRED' OR management_action IN ('EXIT','NOT_EVALUATED')),
  CHECK (management_intent!='EXIT_REQUIRED' OR (
    risk_state='INVALIDATED' AND
    json_extract(decision_json,'$.source_quality.position') IS 'CLOSED' AND
    json_extract(decision_json,'$.source_quality.position_origin_campaign') IS 'CLOSED'
  )),
  CHECK (management_action!='HOLD' OR (
    decision_status='SHADOW_EVALUATED' AND risk_state='CLEAR' AND hard_veto=0 AND
    hard_veto_state='CLEAR' AND management_execution_quality='CLOSED'
  )),
  CHECK (management_action!='EXIT' OR (
    management_action_id IS NOT NULL AND management_action_id GLOB 'FDX:*' AND
    risk_state='INVALIDATED' AND management_execution_quality='CLOSED' AND
    json_extract(decision_json,'$.source_quality.position') IS 'CLOSED' AND
    json_extract(decision_json,'$.source_quality.position_origin_campaign') IS 'CLOSED'
  )),
  CHECK (decision_status='FAIL_CLOSED' OR management_intent!='EXIT_REQUIRED' OR
    management_action!='NOT_EVALUATED' OR management_execution_quality!='CLOSED'),
  CHECK (decision_status='FAIL_CLOSED' OR
    position_state NOT IN ('OPEN_LONG','OPEN_SHORT') OR risk_state!='INVALIDATED' OR
    json_extract(decision_json,'$.source_quality.position') IS NOT 'CLOSED' OR
    json_extract(decision_json,'$.source_quality.position_origin_campaign') IS NOT 'CLOSED' OR
    management_intent='EXIT_REQUIRED'),
  CHECK (management_action='EXIT' OR management_action_id IS NULL),
  CHECK (decision_status!='FAIL_CLOSED' OR (
    entry_action!='SHADOW_ENTRY_ELIGIBLE' AND management_action='NOT_EVALUATED' AND
    shadow_outcome_collection_eligible=0
  )),
  CHECK (direction!='NEUTRAL' OR directional_quality='CONFLICTING'),
  CHECK (direction!='INSUFFICIENT' OR directional_quality!='CLOSED'),
  CHECK (directional_quality NOT IN ('BLOCKED','INSUFFICIENT') OR direction='INSUFFICIENT'),
  CHECK (directional_quality!='CLOSED' OR direction IN ('LONG','SHORT')),
  CHECK (directional_quality!='CLOSED' OR independence_state='CLOSED'),
  CONSTRAINT ck_final_decision_campaign_timing CHECK (
    (campaign_quality='BLOCKED' AND timing_state='BLOCKED') OR
    (campaign_quality='INSUFFICIENT' AND timing_state='INSUFFICIENT') OR
    (campaign_quality='CLOSED' AND (
      (campaign_phase IN ('DISCOVERY','PRE_IMPULSE_WATCH','ENTRY_CANDIDATE') AND
        timing_state IN ('EARLY','LATE')) OR
      (campaign_phase IN ('ENTRY_TRIGGER','NEXT_IMPULSE_ENTRY') AND
        timing_state IN ('ENTRY_WINDOW','LATE')) OR
      (campaign_phase='IMPULSE' AND timing_state IN ('ACTIVE_MOVE','LATE')) OR
      (campaign_phase IN ('RELOAD_BASE','NEXT_IMPULSE_WATCH') AND
        timing_state IN ('RELOAD','LATE')) OR
      (campaign_phase='EXHAUSTION_WARNING' AND timing_state='LATE') OR
      (campaign_phase IN ('EDGE_SPENT','CLOSED') AND timing_state='EDGE_SPENT')
    ))
  ),
  CHECK (data_quality!='CLOSED' OR (
    decision_evidence_receipt_id IS NOT NULL AND full_evidence_receipt_id IS NOT NULL AND
    full_evidence_source_receipt_id IS NOT NULL AND opportunity_receipt_id IS NOT NULL AND
    campaign_receipt_id IS NOT NULL
  ))
) WITHOUT ROWID, STRICT;

CREATE INDEX idx_final_decision_observation
ON final_decision_integration_shadow(observation_ts DESC,decision_id DESC);

CREATE TABLE final_decision_action_claim_shadow (
  action_id TEXT PRIMARY KEY NOT NULL
    CHECK (length(action_id) BETWEEN 1 AND 320)
    CHECK (action_id GLOB '[A-Za-z0-9]*')
    CHECK (action_id NOT GLOB '*[^A-Za-z0-9._:@/-]*'),
  action_kind TEXT NOT NULL CHECK (action_kind IN ('ENTRY','EXIT')),
  contract_code TEXT NOT NULL
    CHECK (length(contract_code) BETWEEN 1 AND 80)
    CHECK (contract_code GLOB '[A-Z0-9]*')
    CHECK (contract_code NOT GLOB '*[^A-Z0-9._:-]*'),
  subject_id TEXT NOT NULL
    CHECK (length(subject_id) BETWEEN 1 AND 256)
    CHECK (subject_id GLOB '[A-Za-z0-9]*')
    CHECK (subject_id NOT GLOB '*[^A-Za-z0-9._:@/-]*'),
  scope_id TEXT NOT NULL
    CHECK (length(scope_id) BETWEEN 1 AND 320)
    CHECK (scope_id GLOB '[A-Za-z0-9]*')
    CHECK (scope_id NOT GLOB '*[^A-Za-z0-9._:@/-]*'),
  state_marker INTEGER NOT NULL CHECK (state_marker BETWEEN 0 AND 9007199254740991),
  direction TEXT CHECK (direction IS NULL OR direction IN ('LONG','SHORT')),
  first_decision_id TEXT NOT NULL
    CHECK (length(first_decision_id) BETWEEN 1 AND 320)
    CHECK (first_decision_id GLOB '[A-Za-z0-9]*')
    CHECK (first_decision_id NOT GLOB '*[^A-Za-z0-9._:@/-]*'),
  claimed_ts INTEGER NOT NULL CHECK (claimed_ts>0),
  expires_ts INTEGER NOT NULL CHECK (expires_ts=claimed_ts+15552000000),
  shadow_only INTEGER NOT NULL DEFAULT 1 CHECK (shadow_only=1),
  CONSTRAINT uq_final_decision_action_target
    UNIQUE(action_kind,contract_code,subject_id,scope_id,state_marker),
  CHECK (
    instr(action_id,char(0))=0 AND instr(contract_code,char(0))=0 AND
    instr(subject_id,char(0))=0 AND instr(scope_id,char(0))=0 AND
    instr(COALESCE(direction,''),char(0))=0 AND
    instr(first_decision_id,char(0))=0
  ),
  CHECK ((action_kind='ENTRY' AND action_id GLOB 'FDE:*' AND state_marker>0) OR
         (action_kind='EXIT' AND action_id GLOB 'FDX:*' AND scope_id='EXIT')),
  CHECK (direction IS NOT NULL AND direction IN ('LONG','SHORT'))
) WITHOUT ROWID, STRICT;

CREATE INDEX idx_final_decision_action_claim_expiry
ON final_decision_action_claim_shadow(expires_ts,action_id);

CREATE INDEX idx_final_decision_action_claim_contract
ON final_decision_action_claim_shadow(contract_code,expires_ts,action_id);

CREATE TRIGGER trg_final_decision_clock_guard
BEFORE INSERT ON final_decision_integration_shadow
WHEN NEW.persisted_ts < CAST(strftime('%s','now') AS INTEGER)*1000-300000
  OR NEW.persisted_ts >= CAST(strftime('%s','now') AS INTEGER)*1000+1000
  OR NEW.observation_ts >= CAST(strftime('%s','now') AS INTEGER)*1000+1000
BEGIN
  SELECT RAISE(ABORT,'final decision persisted clock skew');
END;

CREATE TRIGGER trg_final_decision_duplicate_collision_guard
BEFORE INSERT ON final_decision_integration_shadow
WHEN EXISTS (SELECT 1 FROM final_decision_integration_shadow WHERE decision_id=NEW.decision_id)
BEGIN
  SELECT CASE WHEN (
    SELECT decision_json FROM final_decision_integration_shadow WHERE decision_id=NEW.decision_id
  ) IS NOT NEW.decision_json THEN RAISE(ABORT,'final decision id collision') END;
END;

CREATE TRIGGER trg_final_decision_observation_collision_guard
BEFORE INSERT ON final_decision_integration_shadow
WHEN EXISTS (
  SELECT 1 FROM final_decision_integration_shadow
  WHERE contract_code=NEW.contract_code AND observation_ts=NEW.observation_ts
    AND decision_id!=NEW.decision_id
)
BEGIN
  SELECT RAISE(ABORT,'final decision observation collision');
END;

CREATE TRIGGER trg_final_decision_snapshot_collision_guard
BEFORE INSERT ON final_decision_integration_shadow
WHEN EXISTS (
  SELECT 1 FROM final_decision_integration_shadow
  WHERE contract_code=NEW.contract_code AND snapshot_id=NEW.snapshot_id
    AND decision_id!=NEW.decision_id
)
BEGIN
  SELECT RAISE(ABORT,'final decision snapshot collision');
END;

CREATE TRIGGER trg_final_decision_contract_admission_guard
BEFORE INSERT ON final_decision_integration_shadow
WHEN NOT EXISTS (SELECT 1 FROM final_decision_integration_shadow WHERE decision_id=NEW.decision_id)
  AND (SELECT COUNT(*) FROM final_decision_integration_shadow WHERE contract_code=NEW.contract_code)>=64
  AND EXISTS (
    SELECT 1 FROM (
      SELECT observation_ts,decision_id FROM final_decision_integration_shadow
      WHERE contract_code=NEW.contract_code ORDER BY observation_ts ASC,decision_id ASC LIMIT 1
    ) oldest
    WHERE NEW.observation_ts<oldest.observation_ts
      OR (NEW.observation_ts=oldest.observation_ts AND NEW.decision_id<=oldest.decision_id)
  )
BEGIN
  SELECT RAISE(ABORT,'final decision contract retention admission rejected');
END;

CREATE TRIGGER trg_final_decision_global_admission_guard
BEFORE INSERT ON final_decision_integration_shadow
WHEN NOT EXISTS (SELECT 1 FROM final_decision_integration_shadow WHERE decision_id=NEW.decision_id)
  AND (SELECT COUNT(*) FROM final_decision_integration_shadow)>=2048
  AND EXISTS (
    SELECT 1 FROM (
      SELECT observation_ts,decision_id FROM final_decision_integration_shadow
      ORDER BY observation_ts ASC,decision_id ASC LIMIT 1
    ) oldest
    WHERE NEW.observation_ts<oldest.observation_ts
      OR (NEW.observation_ts=oldest.observation_ts AND NEW.decision_id<=oldest.decision_id)
  )
BEGIN
  SELECT RAISE(ABORT,'final decision global retention admission rejected');
END;

CREATE TRIGGER trg_final_decision_json_insert_guard
BEFORE INSERT ON final_decision_integration_shadow
BEGIN
  SELECT CASE WHEN
    (SELECT COUNT(*) FROM json_each(NEW.decision_json))!=48 OR
    (SELECT COUNT(DISTINCT key) FROM json_each(NEW.decision_json))!=48 OR
    EXISTS (
      SELECT 1 FROM json_each(NEW.decision_json)
      WHERE key NOT IN (
        'version','rules_version','mode','status','decision_id','material_digest','contract_code',
        'snapshot_id','observation_ts','direction','directional_quality','entry_action','entry_action_id',
        'entry_quality','data_quality','execution_quality','entry_execution_quality',
        'management_execution_quality','campaign_phase','campaign_quality','independence_state',
        'timing_state','risk_state','position_state','management_action','management_intent',
        'management_action_id','management_quality','management_trigger_basis','action_identity','lineage_receipts',
        'input_lineage_digest','hard_veto','hard_veto_state','calibration_eligible',
        'calibration_status','shadow_outcome_collection_eligible','live_probability',
        'validated_signal','execution_authorized','telegram_eligible','shadow_only','reason_codes',
        'opportunity_latency','evidence_independence','explainability','source_quality','safety'
      )
    )
  THEN RAISE(ABORT,'final decision JSON shape guard') END;
END;

CREATE TRIGGER trg_final_decision_json_identity_guard
BEFORE INSERT ON final_decision_integration_shadow
BEGIN
  SELECT CASE WHEN
    json_extract(NEW.decision_json,'$.version') IS NOT NEW.engine_version OR
    json_extract(NEW.decision_json,'$.rules_version') IS NOT NEW.rules_version OR
    json_extract(NEW.decision_json,'$.mode') IS NOT 'FINAL_DECISION_INTEGRATION_SHADOW_NO_EXECUTION' OR
    json_extract(NEW.decision_json,'$.status') IS NOT NEW.decision_status OR
    json_extract(NEW.decision_json,'$.decision_id') IS NOT NEW.decision_id OR
    json_extract(NEW.decision_json,'$.material_digest') IS NOT NEW.material_digest OR
    json_extract(NEW.decision_json,'$.input_lineage_digest') IS NOT NEW.input_lineage_digest OR
    json_extract(NEW.decision_json,'$.snapshot_id') IS NOT NEW.snapshot_id OR
    json_extract(NEW.decision_json,'$.contract_code') IS NOT NEW.contract_code OR
    json_type(NEW.decision_json,'$.observation_ts') IS NOT 'integer' OR
    json_extract(NEW.decision_json,'$.observation_ts') IS NOT NEW.observation_ts OR
    json_extract(NEW.decision_json,'$.direction') IS NOT NEW.direction OR
    json_extract(NEW.decision_json,'$.directional_quality') IS NOT NEW.directional_quality
  THEN RAISE(ABORT,'final decision JSON identity guard') END;
END;

CREATE TRIGGER trg_final_decision_json_entry_scalar_guard
BEFORE INSERT ON final_decision_integration_shadow
BEGIN
  SELECT CASE WHEN
    json_extract(NEW.decision_json,'$.entry_action') IS NOT NEW.entry_action OR
    json_type(NEW.decision_json,'$.entry_action_id') NOT IN ('text','null') OR
    json_extract(NEW.decision_json,'$.entry_action_id') IS NOT NEW.entry_action_id OR
    json_extract(NEW.decision_json,'$.entry_quality') IS NOT NEW.entry_quality OR
    json_extract(NEW.decision_json,'$.data_quality') IS NOT NEW.data_quality OR
    json_extract(NEW.decision_json,'$.execution_quality') IS NOT NEW.execution_quality OR
    json_extract(NEW.decision_json,'$.entry_execution_quality') IS NOT NEW.entry_execution_quality OR
    json_extract(NEW.decision_json,'$.management_execution_quality') IS NOT NEW.management_execution_quality OR
    json_extract(NEW.decision_json,'$.campaign_phase') IS NOT NEW.campaign_phase OR
    json_extract(NEW.decision_json,'$.campaign_quality') IS NOT NEW.campaign_quality OR
    json_extract(NEW.decision_json,'$.independence_state') IS NOT NEW.independence_state OR
    json_extract(NEW.decision_json,'$.timing_state') IS NOT NEW.timing_state OR
    json_extract(NEW.decision_json,'$.risk_state') IS NOT NEW.risk_state
  THEN RAISE(ABORT,'final decision JSON entry scalar guard') END;
END;

CREATE TRIGGER trg_final_decision_json_management_scalar_guard
BEFORE INSERT ON final_decision_integration_shadow
BEGIN
  SELECT CASE WHEN
    json_extract(NEW.decision_json,'$.position_state') IS NOT NEW.position_state OR
    json_extract(NEW.decision_json,'$.management_action') IS NOT NEW.management_action OR
    json_extract(NEW.decision_json,'$.management_intent') IS NOT NEW.management_intent OR
    json_type(NEW.decision_json,'$.management_action_id') NOT IN ('text','null') OR
    json_extract(NEW.decision_json,'$.management_action_id') IS NOT NEW.management_action_id OR
    json_extract(NEW.decision_json,'$.management_quality') IS NOT NEW.management_quality OR
    json_type(NEW.decision_json,'$.hard_veto') NOT IN ('true','false') OR
    json_extract(NEW.decision_json,'$.hard_veto') IS NOT NEW.hard_veto OR
    json_extract(NEW.decision_json,'$.hard_veto_state') IS NOT NEW.hard_veto_state OR
    json_type(NEW.decision_json,'$.calibration_eligible') IS NOT 'false' OR
    NEW.calibration_eligible!=0 OR
    json_type(NEW.decision_json,'$.shadow_outcome_collection_eligible') IS NOT 'false' OR
    NEW.shadow_outcome_collection_eligible!=0 OR
    json_type(NEW.decision_json,'$.shadow_only') IS NOT 'true' OR NEW.shadow_only!=1 OR
    json_type(NEW.decision_json,'$.live_probability') IS NOT 'null' OR NEW.live_probability IS NOT NULL OR
    json_type(NEW.decision_json,'$.validated_signal') IS NOT 'false' OR NEW.validated_signal!=0 OR
    json_type(NEW.decision_json,'$.execution_authorized') IS NOT 'false' OR NEW.execution_authorized!=0 OR
    json_type(NEW.decision_json,'$.telegram_eligible') IS NOT 'false' OR NEW.telegram_eligible!=0 OR
    json_extract(NEW.decision_json,'$.calibration_status') IS NOT 'NOT_STATISTICALLY_VALIDATED'
  THEN RAISE(ABORT,'final decision JSON management scalar guard') END;
END;

CREATE TRIGGER trg_final_decision_json_reason_guard
BEFORE INSERT ON final_decision_integration_shadow
BEGIN
  SELECT CASE WHEN
    json_type(NEW.decision_json,'$.reason_codes') IS NOT 'array' OR
    json_extract(NEW.decision_json,'$.reason_codes') IS NOT NEW.reason_codes_json OR
    json_array_length(NEW.reason_codes_json) NOT BETWEEN 1 AND 32 OR
    EXISTS (
      SELECT 1 FROM json_each(NEW.reason_codes_json)
      WHERE type!='text' OR length(CAST(value AS BLOB)) NOT BETWEEN 1 AND 96 OR
        value NOT GLOB '[A-Z]*' OR value GLOB '*[^A-Z0-9_.:-]*'
    ) OR
    (SELECT COUNT(*) FROM json_each(NEW.reason_codes_json)) !=
      (SELECT COUNT(DISTINCT value) FROM json_each(NEW.reason_codes_json))
  THEN RAISE(ABORT,'final decision reason-code guard') END;
END;

CREATE TRIGGER trg_final_decision_json_lineage_shape_guard
BEFORE INSERT ON final_decision_integration_shadow
BEGIN
  SELECT CASE WHEN
    json_type(NEW.decision_json,'$.lineage_receipts') IS NOT 'object' OR
    (SELECT COUNT(*) FROM json_each(NEW.decision_json,'$.lineage_receipts'))!=9 OR
    (SELECT COUNT(DISTINCT key) FROM json_each(NEW.decision_json,'$.lineage_receipts'))!=9 OR
    EXISTS (
      SELECT 1 FROM json_each(NEW.decision_json,'$.lineage_receipts')
      WHERE key NOT IN (
        'campaign','decision_evidence','full_evidence','full_evidence_source','opportunity',
        'position','position_management','position_origin_campaign','safety_gate'
      )
    )
  THEN RAISE(ABORT,'final decision lineage shape guard') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM json_each(NEW.decision_json,'$.lineage_receipts') AS receipt
    WHERE receipt.type!='object' OR
      (SELECT COUNT(*) FROM json_each(receipt.value))!=3 OR
      (SELECT COUNT(DISTINCT key) FROM json_each(receipt.value))!=3 OR
      EXISTS (SELECT 1 FROM json_each(receipt.value)
              WHERE key NOT IN ('receipt_id','committed_ts','content_digest')) OR
      NOT (
        (json_type(receipt.value,'$.receipt_id')='null' AND
         json_type(receipt.value,'$.committed_ts')='null' AND
         json_type(receipt.value,'$.content_digest')='null')
        OR
        (json_type(receipt.value,'$.receipt_id')='text' AND
         length(json_extract(receipt.value,'$.receipt_id')) BETWEEN 1 AND 256 AND
         json_extract(receipt.value,'$.receipt_id') GLOB '[A-Za-z0-9]*' AND
         json_extract(receipt.value,'$.receipt_id') NOT GLOB '*[^A-Za-z0-9._:@/-]*' AND
         json_type(receipt.value,'$.committed_ts')='integer' AND
         json_extract(receipt.value,'$.committed_ts') BETWEEN 1 AND NEW.observation_ts AND
         json_type(receipt.value,'$.content_digest')='text' AND
         length(json_extract(receipt.value,'$.content_digest'))=16 AND
         json_extract(receipt.value,'$.content_digest') NOT GLOB '*[^0-9a-f]*')
      )
  ) THEN RAISE(ABORT,'final decision lineage receipt guard') END;
END;

CREATE TRIGGER trg_final_decision_json_lineage_parity_guard
BEFORE INSERT ON final_decision_integration_shadow
BEGIN
  SELECT CASE WHEN
    json_extract(NEW.decision_json,'$.lineage_receipts.decision_evidence.receipt_id') IS NOT NEW.decision_evidence_receipt_id OR
    json_extract(NEW.decision_json,'$.lineage_receipts.full_evidence.receipt_id') IS NOT NEW.full_evidence_receipt_id OR
    json_extract(NEW.decision_json,'$.lineage_receipts.full_evidence_source.receipt_id') IS NOT NEW.full_evidence_source_receipt_id OR
    json_extract(NEW.decision_json,'$.lineage_receipts.opportunity.receipt_id') IS NOT NEW.opportunity_receipt_id OR
    json_extract(NEW.decision_json,'$.lineage_receipts.campaign.receipt_id') IS NOT NEW.campaign_receipt_id OR
    json_extract(NEW.decision_json,'$.lineage_receipts.safety_gate.receipt_id') IS NOT NEW.safety_gate_receipt_id OR
    json_extract(NEW.decision_json,'$.lineage_receipts.position.receipt_id') IS NOT NEW.position_receipt_id OR
    json_extract(NEW.decision_json,'$.lineage_receipts.position_origin_campaign.receipt_id') IS NOT NEW.position_origin_campaign_receipt_id OR
    json_extract(NEW.decision_json,'$.lineage_receipts.position_management.receipt_id') IS NOT NEW.position_management_receipt_id
  THEN RAISE(ABORT,'final decision lineage parity guard') END;
END;

CREATE TRIGGER trg_final_decision_json_lineage_collision_guard
BEFORE INSERT ON final_decision_integration_shadow
BEGIN
  SELECT CASE WHEN (
    SELECT COUNT(*)!=COUNT(DISTINCT json_extract(receipt.value,'$.receipt_id'))
    FROM json_each(NEW.decision_json,'$.lineage_receipts') receipt
    WHERE json_type(receipt.value,'$.receipt_id')='text'
  ) AND NOT (
    NEW.decision_status='FAIL_CLOSED' AND
    EXISTS (
      SELECT 1 FROM json_each(NEW.reason_codes_json)
      WHERE value='INPUT_LINEAGE_RECEIPT_ID_COLLISION'
    ) AND
    NEW.entry_action!='SHADOW_ENTRY_ELIGIBLE' AND
    NEW.management_action NOT IN ('HOLD','EXIT')
  ) THEN RAISE(ABORT,'final decision lineage receipt id collision') END;
END;

CREATE TRIGGER trg_final_decision_json_semantic_guard
BEFORE INSERT ON final_decision_integration_shadow
BEGIN
  SELECT CASE WHEN
    json_type(NEW.decision_json,'$.opportunity_latency') IS NOT 'object' OR
    json_type(NEW.decision_json,'$.evidence_independence') IS NOT 'object' OR
    json_extract(NEW.decision_json,'$.evidence_independence.semantics') IS NOT
      'RULE_BASED_CAUSAL_DOMAIN_SEPARATION_NOT_STATISTICAL_INDEPENDENCE' OR
    json_extract(NEW.decision_json,'$.evidence_independence.status') IS NOT NEW.independence_state OR
    json_type(NEW.decision_json,'$.evidence_independence.statistical_independence_validated') IS NOT 'false' OR
    json_type(NEW.decision_json,'$.explainability') IS NOT 'object' OR
    json_type(NEW.decision_json,'$.explainability.no_score_aggregation_used') IS NOT 'true' OR
    json_type(NEW.decision_json,'$.source_quality') IS NOT 'object' OR
    json_extract(NEW.decision_json,'$.source_quality.entry_execution') IS NOT NEW.entry_execution_quality OR
    json_extract(NEW.decision_json,'$.source_quality.management_execution') IS NOT NEW.management_execution_quality OR
    json_extract(NEW.decision_json,'$.source_quality.campaign') IS NOT NEW.campaign_quality OR
    json_extract(NEW.decision_json,'$.source_quality.hard_veto') IS NOT CASE
      WHEN NEW.hard_veto_state IN ('ACTIVE','CLEAR') THEN 'CLOSED' ELSE NEW.hard_veto_state END OR
    json_extract(NEW.decision_json,'$.source_quality.position_origin_campaign') NOT IN
      ('CLOSED','PARTIAL','CONFLICTING','BLOCKED','INSUFFICIENT','NOT_EVALUATED') OR
    json_extract(NEW.decision_json,'$.source_quality.position_management') NOT IN
      ('CLOSED','PARTIAL','CONFLICTING','BLOCKED','INSUFFICIENT','NOT_EVALUATED')
  THEN RAISE(ABORT,'final decision JSON semantic guard') END;
END;

CREATE TRIGGER trg_final_decision_json_explainability_guard
BEFORE INSERT ON final_decision_integration_shadow
BEGIN
  SELECT CASE WHEN
    (SELECT COUNT(*) FROM json_each(NEW.decision_json,'$.explainability'))!=7 OR
    (SELECT COUNT(DISTINCT key) FROM json_each(NEW.decision_json,'$.explainability'))!=7 OR
    EXISTS (
      SELECT 1 FROM json_each(NEW.decision_json,'$.explainability')
      WHERE key NOT IN (
        'confirming_evidence','contradictory_evidence','blockers','missing_or_unusable',
        'suppressed_evidence','gate_order','no_score_aggregation_used'
      )
    ) OR
    json_type(NEW.decision_json,'$.explainability.no_score_aggregation_used') IS NOT 'true' OR
    json_type(NEW.decision_json,'$.explainability.gate_order') IS NOT 'array' OR
    json_array_length(NEW.decision_json,'$.explainability.gate_order')!=8 OR
    EXISTS (
      SELECT 1 FROM json_each(NEW.decision_json,'$.explainability') field
      WHERE field.key IN (
        'confirming_evidence','contradictory_evidence','blockers','missing_or_unusable',
        'suppressed_evidence'
      ) AND (field.type!='array' OR json_array_length(field.value)>32)
    )
  THEN RAISE(ABORT,'final decision explainability shape guard') END;

  SELECT CASE WHEN
    json_extract(NEW.decision_json,'$.explainability.gate_order[0]') IS NOT 'INPUT_AND_TEMPORAL_INTEGRITY' OR
    json_extract(NEW.decision_json,'$.explainability.gate_order[1]') IS NOT 'DATA_QUALITY' OR
    json_extract(NEW.decision_json,'$.explainability.gate_order[2]') IS NOT 'HARD_VETO' OR
    json_extract(NEW.decision_json,'$.explainability.gate_order[3]') IS NOT 'HTX_EXECUTION' OR
    json_extract(NEW.decision_json,'$.explainability.gate_order[4]') IS NOT 'DIRECTION_COHERENCE' OR
    json_extract(NEW.decision_json,'$.explainability.gate_order[5]') IS NOT 'EVIDENCE_INDEPENDENCE' OR
    json_extract(NEW.decision_json,'$.explainability.gate_order[6]') IS NOT 'CAMPAIGN_AND_TIMING' OR
    json_extract(NEW.decision_json,'$.explainability.gate_order[7]') IS NOT 'POSITION_ACTION'
  THEN RAISE(ABORT,'final decision explainability gate-order guard') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM json_each(NEW.decision_json,'$.explainability') field,
      json_each(field.value) item
    WHERE field.key IN (
      'confirming_evidence','contradictory_evidence','blockers','missing_or_unusable',
      'suppressed_evidence'
    ) AND (
      item.type!='text' OR length(item.value) NOT BETWEEN 1 AND 256 OR
      item.value GLOB ('*['||char(1)||'-'||char(31)||char(127)||']*')
    )
  ) OR EXISTS (
    SELECT 1 FROM json_each(NEW.decision_json,'$.explainability') field
    WHERE field.key IN (
      'confirming_evidence','contradictory_evidence','blockers','missing_or_unusable',
      'suppressed_evidence'
    ) AND (SELECT COUNT(*) FROM json_each(field.value)) !=
      (SELECT COUNT(DISTINCT value) FROM json_each(field.value))
  ) THEN RAISE(ABORT,'final decision explainability list guard') END;
END;

CREATE TRIGGER trg_final_decision_json_explainability_utf16_guard
BEFORE INSERT ON final_decision_integration_shadow
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM json_each(NEW.decision_json,'$.explainability') field,
      json_each(field.value) item
    WHERE field.key IN (
      'confirming_evidence','contradictory_evidence','blockers','missing_or_unusable',
      'suppressed_evidence'
    ) AND item.type='text' AND (
      WITH RECURSIVE character_index(i) AS (
        SELECT 1 WHERE length(item.value)>0
        UNION ALL
        SELECT i+1 FROM character_index
        WHERE i<min(length(item.value),256)
      )
      SELECT length(item.value)+COALESCE(sum(
        CASE WHEN unicode(substr(item.value,i,1))>65535 THEN 1 ELSE 0 END
      ),0) FROM character_index
    )>256
  ) THEN RAISE(ABORT,'final decision explainability UTF-16 length guard') END;
END;

CREATE TRIGGER trg_final_decision_json_source_quality_guard
BEFORE INSERT ON final_decision_integration_shadow
BEGIN
  SELECT CASE WHEN
    (SELECT COUNT(*) FROM json_each(NEW.decision_json,'$.source_quality'))!=10 OR
    (SELECT COUNT(DISTINCT key) FROM json_each(NEW.decision_json,'$.source_quality'))!=10 OR
    EXISTS (
      SELECT 1 FROM json_each(NEW.decision_json,'$.source_quality')
      WHERE key NOT IN (
        'full_evidence','opportunity','campaign','position','position_origin_campaign',
        'position_management','entry_execution','management_execution','hard_veto',
        'strict_weighted_chain_status'
      )
    ) OR
    EXISTS (
      SELECT 1 FROM json_each(NEW.decision_json,'$.source_quality')
      WHERE key!='strict_weighted_chain_status' AND
        (type!='text' OR value NOT IN (
          'CLOSED','PARTIAL','CONFLICTING','BLOCKED','INSUFFICIENT','NOT_EVALUATED'
        ))
    ) OR
    json_type(NEW.decision_json,'$.source_quality.strict_weighted_chain_status') IS NOT 'object' OR
    (NEW.data_quality='CLOSED' AND (
      json_extract(NEW.decision_json,'$.source_quality.full_evidence') IS NOT 'CLOSED' OR
      json_extract(NEW.decision_json,'$.source_quality.opportunity') IS NOT 'CLOSED' OR
      json_extract(NEW.decision_json,'$.source_quality.campaign') IS NOT 'CLOSED'
    ))
  THEN RAISE(ABORT,'final decision source-quality guard') END;
END;

CREATE TRIGGER trg_final_decision_json_source_lineage_guard
BEFORE INSERT ON final_decision_integration_shadow
BEGIN
  SELECT CASE WHEN
    (json_extract(NEW.decision_json,'$.source_quality.full_evidence') IS 'CLOSED' AND
      (NEW.full_evidence_receipt_id IS NULL OR NEW.full_evidence_source_receipt_id IS NULL)) OR
    (json_extract(NEW.decision_json,'$.source_quality.opportunity') IS 'CLOSED' AND
      NEW.opportunity_receipt_id IS NULL) OR
    (json_extract(NEW.decision_json,'$.source_quality.campaign') IS 'CLOSED' AND
      NEW.campaign_receipt_id IS NULL) OR
    (json_extract(NEW.decision_json,'$.source_quality.position') IS 'CLOSED' AND
      NEW.position_receipt_id IS NULL) OR
    (json_extract(NEW.decision_json,'$.source_quality.position_origin_campaign') IS 'CLOSED' AND
      NEW.position_origin_campaign_receipt_id IS NULL) OR
    (json_extract(NEW.decision_json,'$.source_quality.position_management') IS 'CLOSED' AND
      NEW.position_management_receipt_id IS NULL) OR
    ((json_extract(NEW.decision_json,'$.source_quality.entry_execution') IS 'CLOSED' OR
      json_extract(NEW.decision_json,'$.source_quality.management_execution') IS 'CLOSED' OR
      json_extract(NEW.decision_json,'$.source_quality.hard_veto') IS 'CLOSED') AND
      NEW.safety_gate_receipt_id IS NULL)
  THEN RAISE(ABORT,'final decision CLOSED source lacks lineage receipt') END;

  SELECT CASE WHEN
    (json_extract(NEW.decision_json,'$.evidence_independence.raw_usable_evidence_count')>0 OR
      EXISTS (
        SELECT 1
        FROM json_each(
          NEW.decision_json,'$.evidence_independence.causal_domains'
        ) domain
        WHERE json_array_length(domain.value,'$.evidence_ids')>0
      ) OR
      json_extract(
        NEW.decision_json,'$.evidence_independence.cross_plane_reuse.total_reuse_count'
      )>0 OR
      NEW.directional_quality IN ('CLOSED','CONFLICTING') OR
      NEW.independence_state IN ('CLOSED','CORRELATED','CONFLICTING')) AND
    NEW.decision_evidence_receipt_id IS NULL
  THEN RAISE(ABORT,'final decision direction evidence lacks lineage receipt') END;

  SELECT CASE WHEN
    json_extract(
      NEW.decision_json,'$.evidence_independence.cross_plane_reuse.total_reuse_count'
    )>0 AND
    (NEW.full_evidence_receipt_id IS NULL OR NEW.full_evidence_source_receipt_id IS NULL)
  THEN RAISE(ABORT,'final decision cross-plane reuse lacks full-evidence lineage') END;
END;

CREATE TRIGGER trg_final_decision_json_strict_chain_guard
BEFORE INSERT ON final_decision_integration_shadow
BEGIN
  SELECT CASE WHEN
    (SELECT COUNT(*) FROM json_each(
      NEW.decision_json,'$.source_quality.strict_weighted_chain_status'
    )) NOT IN (0,4) OR
    ((SELECT COUNT(*) FROM json_each(
      NEW.decision_json,'$.source_quality.strict_weighted_chain_status'
    ))=4 AND (
      (SELECT COUNT(DISTINCT key) FROM json_each(
        NEW.decision_json,'$.source_quality.strict_weighted_chain_status'
      ))!=4 OR
      EXISTS (
        SELECT 1 FROM json_each(
          NEW.decision_json,'$.source_quality.strict_weighted_chain_status'
        ) WHERE key NOT IN (
          'CROSS_EXCHANGE_DERIVATIVES','MARKET_STRENGTH_SPOT',
          'SMART_MONEY_ONCHAIN','SUPPORTING_RISK'
        )
      )
    )) OR
    ((SELECT COUNT(*) FROM json_each(
      NEW.decision_json,'$.source_quality.strict_weighted_chain_status'
    ))=0 AND json_extract(
      NEW.decision_json,'$.source_quality.full_evidence'
    ) IS NOT 'INSUFFICIENT')
  THEN RAISE(ABORT,'final decision strict-chain shape guard') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM json_each(
      NEW.decision_json,'$.source_quality.strict_weighted_chain_status'
    ) chain
    WHERE json_type(chain.value) IS NOT 'object' OR
      (SELECT COUNT(*) FROM json_each(chain.value))!=3 OR
      (SELECT COUNT(DISTINCT key) FROM json_each(chain.value))!=3 OR
      EXISTS (
        SELECT 1 FROM json_each(chain.value)
        WHERE key NOT IN ('declared_closed','eligible_rows','closed')
      ) OR
      json_type(chain.value,'$.declared_closed') NOT IN ('true','false') OR
      json_type(chain.value,'$.eligible_rows') IS NOT 'integer' OR
      json_extract(chain.value,'$.eligible_rows') NOT BETWEEN 0 AND 32 OR
      json_type(chain.value,'$.closed') NOT IN ('true','false') OR
      (json_type(chain.value,'$.closed')='true') != (
        json_type(chain.value,'$.declared_closed')='true' AND
        json_extract(chain.value,'$.eligible_rows')>0
      )
  ) THEN RAISE(ABORT,'final decision strict-chain state guard') END;

  SELECT CASE WHEN
    json_extract(NEW.decision_json,'$.source_quality.full_evidence')='CLOSED' AND
    EXISTS (
      SELECT 1 FROM json_each(
        NEW.decision_json,'$.source_quality.strict_weighted_chain_status'
      ) WHERE json_type(value,'$.closed') IS NOT 'true'
    )
  THEN RAISE(ABORT,'final decision strict-chain closure guard') END;
END;

CREATE TRIGGER trg_final_decision_json_independence_shape_guard
BEFORE INSERT ON final_decision_integration_shadow
BEGIN
  SELECT CASE WHEN
    (SELECT COUNT(*) FROM json_each(NEW.decision_json,'$.evidence_independence'))!=10 OR
    (SELECT COUNT(DISTINCT key) FROM json_each(NEW.decision_json,'$.evidence_independence'))!=10 OR
    EXISTS (
      SELECT 1 FROM json_each(NEW.decision_json,'$.evidence_independence')
      WHERE key NOT IN (
        'semantics','status','causal_domains','effective_directional_domains',
        'raw_usable_evidence_count','effective_directional_vote_count',
        'duplicate_or_correlated_suppressed','cross_domain_payload_digest_reuse',
        'cross_plane_reuse','statistical_independence_validated'
      )
    ) OR
    json_type(NEW.decision_json,'$.evidence_independence.causal_domains') IS NOT 'object' OR
    json_type(NEW.decision_json,'$.evidence_independence.duplicate_or_correlated_suppressed') IS NOT 'array' OR
    json_type(NEW.decision_json,'$.evidence_independence.cross_domain_payload_digest_reuse') IS NOT 'array' OR
    json_type(NEW.decision_json,'$.evidence_independence.cross_plane_reuse') IS NOT 'object'
  THEN RAISE(ABORT,'final decision independence shape guard') END;
END;

CREATE TRIGGER trg_final_decision_json_independence_value_guard
BEFORE INSERT ON final_decision_integration_shadow
BEGIN
  SELECT CASE WHEN
    json_type(NEW.decision_json,'$.evidence_independence.effective_directional_domains') IS NOT 'array' OR
    json_array_length(NEW.decision_json,'$.evidence_independence.effective_directional_domains')>3 OR
    EXISTS (
      SELECT 1 FROM json_each(
        NEW.decision_json,'$.evidence_independence.effective_directional_domains'
      ) WHERE type!='text' OR value NOT IN ('PRICE_ACTION','POSITIONING','RELATIVE_MARKET')
    ) OR
    (SELECT COUNT(*) FROM json_each(
      NEW.decision_json,'$.evidence_independence.effective_directional_domains'
    ))!=(SELECT COUNT(DISTINCT value) FROM json_each(
      NEW.decision_json,'$.evidence_independence.effective_directional_domains'
    )) OR
    json_type(NEW.decision_json,'$.evidence_independence.effective_directional_vote_count') IS NOT 'integer' OR
    json_extract(NEW.decision_json,'$.evidence_independence.effective_directional_vote_count') NOT BETWEEN 0 AND 3 OR
    json_extract(NEW.decision_json,'$.evidence_independence.effective_directional_vote_count') IS NOT
      json_array_length(NEW.decision_json,'$.evidence_independence.effective_directional_domains') OR
    json_type(NEW.decision_json,'$.evidence_independence.raw_usable_evidence_count') IS NOT 'integer' OR
    json_extract(NEW.decision_json,'$.evidence_independence.raw_usable_evidence_count') NOT BETWEEN 0 AND 24 OR
    json_extract(NEW.decision_json,'$.evidence_independence.raw_usable_evidence_count')<
      json_extract(NEW.decision_json,'$.evidence_independence.effective_directional_vote_count')
  THEN RAISE(ABORT,'final decision independence value guard') END;

  SELECT CASE WHEN
    json_type(NEW.decision_json,'$.evidence_independence.duplicate_or_correlated_suppressed') IS NOT 'array' OR
    json_array_length(NEW.decision_json,'$.evidence_independence.duplicate_or_correlated_suppressed')>16 OR
    EXISTS (
      SELECT 1 FROM json_each(
        NEW.decision_json,'$.evidence_independence.duplicate_or_correlated_suppressed'
      ) item
      WHERE item.type!='text' OR length(item.value) NOT BETWEEN 1 AND 256 OR
        item.value GLOB ('*['||char(1)||'-'||char(31)||char(127)||']*')
    ) OR
    (SELECT COUNT(*) FROM json_each(
      NEW.decision_json,'$.evidence_independence.duplicate_or_correlated_suppressed'
    ))!=(SELECT COUNT(DISTINCT value) FROM json_each(
      NEW.decision_json,'$.evidence_independence.duplicate_or_correlated_suppressed'
    ))
  THEN RAISE(ABORT,'final decision suppressed evidence guard') END;

  SELECT CASE WHEN
    json_type(NEW.decision_json,'$.evidence_independence.cross_domain_payload_digest_reuse') IS NOT 'array' OR
    json_array_length(NEW.decision_json,'$.evidence_independence.cross_domain_payload_digest_reuse')>24 OR
    EXISTS (
      SELECT 1 FROM json_each(
        NEW.decision_json,'$.evidence_independence.cross_domain_payload_digest_reuse'
      ) item
      WHERE item.type!='text' OR length(item.value)!=16 OR
        item.value GLOB '*[^0-9a-f]*'
    ) OR
    (SELECT COUNT(*) FROM json_each(
      NEW.decision_json,'$.evidence_independence.cross_domain_payload_digest_reuse'
    ))!=(SELECT COUNT(DISTINCT value) FROM json_each(
      NEW.decision_json,'$.evidence_independence.cross_domain_payload_digest_reuse'
    )) OR
    (json_array_length(
      NEW.decision_json,'$.evidence_independence.cross_domain_payload_digest_reuse'
    )>0 AND NEW.independence_state NOT IN ('CORRELATED','CONFLICTING','BLOCKED'))
  THEN RAISE(ABORT,'final decision cross-domain reuse guard') END;
END;

CREATE TRIGGER trg_final_decision_json_independence_count_derivation_guard
BEFORE INSERT ON final_decision_integration_shadow
BEGIN
  SELECT CASE WHEN
    json_extract(
      NEW.decision_json,'$.evidence_independence.raw_usable_evidence_count'
    ) < (
      SELECT COUNT(*)
      FROM json_each(
        NEW.decision_json,'$.evidence_independence.causal_domains'
      ) domain,
      json_each(domain.value,'$.evidence_ids') evidence
    ) OR (
      NOT EXISTS (
        SELECT 1 FROM json_each(
          NEW.decision_json,'$.evidence_independence.causal_domains'
        ) domain
        WHERE json_array_length(domain.value,'$.evidence_ids')=16
      ) AND json_extract(
        NEW.decision_json,'$.evidence_independence.raw_usable_evidence_count'
      ) IS NOT (
        SELECT COUNT(*)
        FROM json_each(
          NEW.decision_json,'$.evidence_independence.causal_domains'
        ) domain,
        json_each(domain.value,'$.evidence_ids') evidence
      )
    ) OR (
      SELECT COUNT(*)
      FROM json_each(
        NEW.decision_json,'$.evidence_independence.causal_domains'
      ) domain,
      json_each(domain.value,'$.evidence_ids') evidence
    ) IS NOT (
      SELECT COUNT(DISTINCT evidence.value)
      FROM json_each(
        NEW.decision_json,'$.evidence_independence.causal_domains'
      ) domain,
      json_each(domain.value,'$.evidence_ids') evidence
    )
  THEN RAISE(ABORT,'final decision independence evidence count guard') END;
END;

CREATE TRIGGER trg_final_decision_json_suppressed_utf16_guard
BEFORE INSERT ON final_decision_integration_shadow
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM json_each(
      NEW.decision_json,'$.evidence_independence.duplicate_or_correlated_suppressed'
    ) item
    WHERE item.type='text' AND (
      WITH RECURSIVE character_index(i) AS (
        SELECT 1 WHERE length(item.value)>0
        UNION ALL
        SELECT i+1 FROM character_index
        WHERE i<min(length(item.value),256)
      )
      SELECT length(item.value)+COALESCE(sum(
        CASE WHEN unicode(substr(item.value,i,1))>65535 THEN 1 ELSE 0 END
      ),0) FROM character_index
    )>256
  ) THEN RAISE(ABORT,'final decision suppressed evidence UTF-16 length guard') END;
END;

CREATE TRIGGER trg_final_decision_json_raw_support_derivation_guard
BEFORE INSERT ON final_decision_integration_shadow
BEGIN
  SELECT CASE WHEN
    json_extract(
      NEW.decision_json,'$.evidence_independence.raw_usable_evidence_count'
    ) < (
      SELECT coalesce(sum(json_extract(domain.value,'$.raw_support_count')),0)
      FROM json_each(
        NEW.decision_json,'$.evidence_independence.causal_domains'
      ) domain
    )
  THEN RAISE(ABORT,'final decision raw support lower-bound guard') END;
END;

CREATE TRIGGER trg_final_decision_json_causal_domain_guard
BEFORE INSERT ON final_decision_integration_shadow
BEGIN
  SELECT CASE WHEN
    (SELECT COUNT(*) FROM json_each(
      NEW.decision_json,'$.evidence_independence.causal_domains'
    ))!=6 OR
    (SELECT COUNT(DISTINCT key) FROM json_each(
      NEW.decision_json,'$.evidence_independence.causal_domains'
    ))!=6 OR
    EXISTS (
      SELECT 1 FROM json_each(
        NEW.decision_json,'$.evidence_independence.causal_domains'
      ) WHERE key NOT IN (
        'POSITIONING','PRICE_ACTION','REGIME_CONTEXT','RELATIVE_MARKET',
        'RISK_INVALIDATION','VENUE_BREADTH_CONTEXT'
      )
    )
  THEN RAISE(ABORT,'final decision causal-domain set guard') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM json_each(
      NEW.decision_json,'$.evidence_independence.causal_domains'
    ) domain
    WHERE json_type(domain.value) IS NOT 'object' OR
      (SELECT COUNT(*) FROM json_each(domain.value))!=9 OR
      (SELECT COUNT(DISTINCT key) FROM json_each(domain.value))!=9 OR
      EXISTS (
        SELECT 1 FROM json_each(domain.value)
        WHERE key NOT IN (
          'state','evidence_ids','support_ids','invalidates_long_ids','invalidates_short_ids',
          'causal_families','correlation_groups','raw_support_count','effective_domain_votes'
        )
      ) OR
      json_type(domain.value,'$.state') IS NOT 'text' OR
      json_extract(domain.value,'$.state') NOT IN (
        'UNKNOWN','NEUTRAL','LONG','SHORT','CONFLICTING'
      ) OR
      json_type(domain.value,'$.evidence_ids') IS NOT 'array' OR
      json_type(domain.value,'$.support_ids') IS NOT 'array' OR
      json_type(domain.value,'$.invalidates_long_ids') IS NOT 'array' OR
      json_type(domain.value,'$.invalidates_short_ids') IS NOT 'array' OR
      json_type(domain.value,'$.causal_families') IS NOT 'array' OR
      json_type(domain.value,'$.correlation_groups') IS NOT 'array' OR
      json_array_length(domain.value,'$.evidence_ids')>16 OR
      json_array_length(domain.value,'$.support_ids')>16 OR
      json_array_length(domain.value,'$.invalidates_long_ids')>16 OR
      json_array_length(domain.value,'$.invalidates_short_ids')>16 OR
      json_array_length(domain.value,'$.causal_families')>13 OR
      json_array_length(domain.value,'$.correlation_groups')>16 OR
      json_type(domain.value,'$.raw_support_count') IS NOT 'integer' OR
      json_extract(domain.value,'$.raw_support_count') NOT BETWEEN 0 AND 24 OR
      json_type(domain.value,'$.effective_domain_votes') IS NOT 'integer' OR
      json_extract(domain.value,'$.effective_domain_votes') IS NOT CASE
        WHEN json_extract(domain.value,'$.state') IN ('LONG','SHORT') THEN 1 ELSE 0 END
  ) THEN RAISE(ABORT,'final decision causal-domain shape guard') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM json_each(
      NEW.decision_json,'$.evidence_independence.causal_domains'
    ) domain,
    json_each(domain.value,'$.evidence_ids') item
    WHERE item.type!='text' OR length(item.value) NOT BETWEEN 1 AND 96 OR
      item.value NOT GLOB '[A-Za-z0-9]*' OR item.value GLOB '*[^A-Za-z0-9._:@/-]*'
  ) OR EXISTS (
    SELECT 1
    FROM json_each(
      NEW.decision_json,'$.evidence_independence.causal_domains'
    ) domain,
    json_each(domain.value,'$.support_ids') item
    WHERE item.type!='text' OR length(item.value) NOT BETWEEN 1 AND 96 OR
      item.value NOT GLOB '[A-Za-z0-9]*' OR item.value GLOB '*[^A-Za-z0-9._:@/-]*'
  ) THEN RAISE(ABORT,'final decision causal-domain evidence id guard') END;
END;

CREATE TRIGGER trg_final_decision_json_causal_domain_list_guard
BEFORE INSERT ON final_decision_integration_shadow
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM json_each(
      NEW.decision_json,'$.evidence_independence.causal_domains'
    ) domain,
    json_each(domain.value) field,
    json_each(field.value) item
    WHERE field.key IN (
      'evidence_ids','support_ids','invalidates_long_ids','invalidates_short_ids'
    ) AND (
      item.type!='text' OR length(item.value) NOT BETWEEN 1 AND 96 OR
      item.value NOT GLOB '[A-Za-z0-9]*' OR item.value GLOB '*[^A-Za-z0-9._:@/-]*'
    )
  ) OR EXISTS (
    SELECT 1
    FROM json_each(
      NEW.decision_json,'$.evidence_independence.causal_domains'
    ) domain,
    json_each(domain.value) field
    WHERE field.key IN (
      'evidence_ids','support_ids','invalidates_long_ids','invalidates_short_ids'
    ) AND (SELECT COUNT(*) FROM json_each(field.value)) !=
      (SELECT COUNT(DISTINCT value) FROM json_each(field.value))
  ) THEN RAISE(ABORT,'final decision causal-domain id list guard') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM json_each(
      NEW.decision_json,'$.evidence_independence.causal_domains'
    ) domain,
    json_each(domain.value,'$.causal_families') family
    WHERE family.type!='text' OR CASE family.value
      WHEN 'PRICE_RESPONSE' THEN 'PRICE_ACTION'
      WHEN 'AGGRESSOR_RESPONSE' THEN 'PRICE_ACTION'
      WHEN 'LIQUIDITY_RESPONSE' THEN 'PRICE_ACTION'
      WHEN 'EFFORT_RESULT' THEN 'PRICE_ACTION'
      WHEN 'FUNDING' THEN 'POSITIONING'
      WHEN 'BASIS' THEN 'POSITIONING'
      WHEN 'OPEN_INTEREST' THEN 'POSITIONING'
      WHEN 'LIQUIDATION_POSITIONING' THEN 'POSITIONING'
      WHEN 'RELATIVE_STRENGTH' THEN 'RELATIVE_MARKET'
      WHEN 'MARKET_INDEPENDENCE' THEN 'RELATIVE_MARKET'
      WHEN 'CROSS_VENUE_BREADTH' THEN 'VENUE_BREADTH_CONTEXT'
      WHEN 'RISK_INVALIDATION' THEN 'RISK_INVALIDATION'
      WHEN 'REGIME_CONTEXT' THEN 'REGIME_CONTEXT'
      ELSE NULL END IS NOT domain.key
  ) OR EXISTS (
    SELECT 1
    FROM json_each(
      NEW.decision_json,'$.evidence_independence.causal_domains'
    ) domain
    WHERE (SELECT COUNT(*) FROM json_each(domain.value,'$.causal_families')) !=
      (SELECT COUNT(DISTINCT value) FROM json_each(domain.value,'$.causal_families'))
  ) THEN RAISE(ABORT,'final decision causal-domain family guard') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM json_each(
      NEW.decision_json,'$.evidence_independence.causal_domains'
    ) domain,
    json_each(domain.value,'$.correlation_groups') group_id
    WHERE group_id.type!='text' OR length(group_id.value) NOT BETWEEN 1 AND 256 OR
      group_id.value NOT GLOB '[A-Za-z0-9]*' OR
      group_id.value GLOB '*[^A-Za-z0-9._:@/-]*'
  ) OR EXISTS (
    SELECT 1
    FROM json_each(
      NEW.decision_json,'$.evidence_independence.causal_domains'
    ) domain
    WHERE (SELECT COUNT(*) FROM json_each(domain.value,'$.correlation_groups')) !=
      (SELECT COUNT(DISTINCT value) FROM json_each(domain.value,'$.correlation_groups'))
  ) THEN RAISE(ABORT,'final decision causal-domain correlation-group guard') END;
END;

CREATE TRIGGER trg_final_decision_json_causal_domain_classification_guard
BEFORE INSERT ON final_decision_integration_shadow
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM json_each(
      NEW.decision_json,'$.evidence_independence.causal_domains'
    ) domain,
    json_each(domain.value) classified,
    json_each(classified.value) classified_id
    WHERE classified.key IN (
      'support_ids','invalidates_long_ids','invalidates_short_ids'
    ) AND NOT EXISTS (
      SELECT 1 FROM json_each(domain.value,'$.evidence_ids') evidence_id
      WHERE evidence_id.value=classified_id.value
    )
  ) THEN RAISE(ABORT,'final decision causal-domain classification subset guard') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM json_each(
      NEW.decision_json,'$.evidence_independence.causal_domains'
    ) domain
    WHERE EXISTS (
      SELECT 1 FROM json_each(domain.value,'$.support_ids') left_id
      JOIN json_each(domain.value,'$.invalidates_long_ids') right_id
        ON left_id.value=right_id.value
    ) OR EXISTS (
      SELECT 1 FROM json_each(domain.value,'$.support_ids') left_id
      JOIN json_each(domain.value,'$.invalidates_short_ids') right_id
        ON left_id.value=right_id.value
    ) OR EXISTS (
      SELECT 1 FROM json_each(domain.value,'$.invalidates_long_ids') left_id
      JOIN json_each(domain.value,'$.invalidates_short_ids') right_id
        ON left_id.value=right_id.value
    ) OR json_array_length(domain.value,'$.support_ids') IS NOT min(
      json_extract(domain.value,'$.raw_support_count'),16
    )
  ) THEN RAISE(ABORT,'final decision causal-domain classification coherence guard') END;
END;

CREATE TRIGGER trg_final_decision_json_causal_domain_state_derivation_guard
BEFORE INSERT ON final_decision_integration_shadow
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM json_each(
      NEW.decision_json,'$.evidence_independence.causal_domains'
    ) domain
    WHERE
      (json_extract(domain.value,'$.state')='UNKNOWN' AND (
        json_array_length(domain.value,'$.evidence_ids')!=0 OR
        json_array_length(domain.value,'$.support_ids')!=0 OR
        json_array_length(domain.value,'$.invalidates_long_ids')!=0 OR
        json_array_length(domain.value,'$.invalidates_short_ids')!=0 OR
        json_array_length(domain.value,'$.causal_families')!=0 OR
        json_array_length(domain.value,'$.correlation_groups')!=0 OR
        json_extract(domain.value,'$.raw_support_count')!=0
      )) OR
      (json_extract(domain.value,'$.state')!='UNKNOWN' AND (
        json_array_length(domain.value,'$.evidence_ids')<1 OR
        json_array_length(domain.value,'$.causal_families')<1
      )) OR
      (json_extract(domain.value,'$.state')='NEUTRAL' AND (
        json_array_length(domain.value,'$.support_ids')!=0 OR
        json_array_length(domain.value,'$.correlation_groups')!=0 OR
        json_extract(domain.value,'$.raw_support_count')!=0
      )) OR
      (json_extract(domain.value,'$.state') IN ('LONG','SHORT') AND (
        json_array_length(domain.value,'$.support_ids')<1 OR
        json_array_length(domain.value,'$.correlation_groups')<1 OR
        json_extract(domain.value,'$.raw_support_count')<1
      )) OR
      (json_extract(domain.value,'$.state')='CONFLICTING' AND (
        json_array_length(domain.value,'$.support_ids')<2 OR
        json_array_length(domain.value,'$.correlation_groups')<1 OR
        json_extract(domain.value,'$.raw_support_count')<2
      ))
  ) THEN RAISE(ABORT,'final decision causal-domain state derivation guard') END;
END;

CREATE TRIGGER trg_final_decision_json_flat_invalidation_risk_guard
BEFORE INSERT ON final_decision_integration_shadow
WHEN NEW.position_state IN ('FLAT','NONE') AND
  NEW.direction IN ('LONG','SHORT') AND NEW.risk_state!='INVALIDATED'
BEGIN
  SELECT CASE WHEN
    (NEW.direction='LONG' AND EXISTS (
      SELECT 1 FROM json_each(
        NEW.decision_json,'$.evidence_independence.causal_domains'
      ) domain
      WHERE json_array_length(domain.value,'$.invalidates_long_ids')>0
    )) OR
    (NEW.direction='SHORT' AND EXISTS (
      SELECT 1 FROM json_each(
        NEW.decision_json,'$.evidence_independence.causal_domains'
      ) domain
      WHERE json_array_length(domain.value,'$.invalidates_short_ids')>0
    ))
  THEN RAISE(ABORT,'final decision thesis invalidation risk mismatch') END;
END;

CREATE TRIGGER trg_final_decision_json_independence_closure_guard
BEFORE INSERT ON final_decision_integration_shadow
WHEN NEW.independence_state='CLOSED'
BEGIN
  SELECT CASE WHEN
    json_type(NEW.decision_json,'$.evidence_independence.effective_directional_domains') IS NOT 'array' OR
    json_array_length(NEW.decision_json,'$.evidence_independence.effective_directional_domains') NOT BETWEEN 2 AND 3 OR
    EXISTS (
      SELECT 1 FROM json_each(
        NEW.decision_json,'$.evidence_independence.effective_directional_domains'
      ) WHERE type!='text' OR value NOT IN ('PRICE_ACTION','POSITIONING','RELATIVE_MARKET')
    ) OR
    (SELECT COUNT(*) FROM json_each(
      NEW.decision_json,'$.evidence_independence.effective_directional_domains'
    ))!=(SELECT COUNT(DISTINCT value) FROM json_each(
      NEW.decision_json,'$.evidence_independence.effective_directional_domains'
    )) OR
    NOT EXISTS (
      SELECT 1 FROM json_each(
        NEW.decision_json,'$.evidence_independence.effective_directional_domains'
      ) WHERE value='PRICE_ACTION'
    ) OR
    json_type(NEW.decision_json,'$.evidence_independence.effective_directional_vote_count') IS NOT 'integer' OR
    json_extract(NEW.decision_json,'$.evidence_independence.effective_directional_vote_count') IS NOT
      json_array_length(NEW.decision_json,'$.evidence_independence.effective_directional_domains') OR
    json_type(NEW.decision_json,'$.evidence_independence.raw_usable_evidence_count') IS NOT 'integer' OR
    json_extract(NEW.decision_json,'$.evidence_independence.raw_usable_evidence_count') <
      json_extract(NEW.decision_json,'$.evidence_independence.effective_directional_vote_count')
  THEN RAISE(ABORT,'final decision independence closure count guard') END;

  SELECT CASE WHEN NEW.directional_quality='CLOSED' AND (
    json_extract(NEW.decision_json,'$.evidence_independence.causal_domains.PRICE_ACTION.state') IS NOT NEW.direction OR
    NOT EXISTS (
      SELECT 1 FROM json_each(
        NEW.decision_json,'$.evidence_independence.effective_directional_domains'
      ) WHERE value IN ('POSITIONING','RELATIVE_MARKET')
    ) OR
    (EXISTS (
      SELECT 1 FROM json_each(
        NEW.decision_json,'$.evidence_independence.effective_directional_domains'
      ) WHERE value='POSITIONING'
    ) AND json_extract(
      NEW.decision_json,'$.evidence_independence.causal_domains.POSITIONING.state'
    ) IS NOT NEW.direction) OR
    (EXISTS (
      SELECT 1 FROM json_each(
        NEW.decision_json,'$.evidence_independence.effective_directional_domains'
      ) WHERE value='RELATIVE_MARKET'
    ) AND json_extract(
      NEW.decision_json,'$.evidence_independence.causal_domains.RELATIVE_MARKET.state'
    ) IS NOT NEW.direction) OR
    EXISTS (
      SELECT 1 FROM json_each(
        NEW.decision_json,'$.evidence_independence.causal_domains'
      ) AS domain
      WHERE domain.key IN ('PRICE_ACTION','POSITIONING','RELATIVE_MARKET') AND
        json_extract(domain.value,'$.state') IN ('LONG','SHORT','CONFLICTING') AND
        json_extract(domain.value,'$.state')!=NEW.direction
    )
  ) THEN RAISE(ABORT,'final decision independence direction guard') END;
END;

CREATE TRIGGER trg_final_decision_json_effective_domain_derivation_guard
BEFORE INSERT ON final_decision_integration_shadow
WHEN NEW.independence_state='CLOSED'
BEGIN
  SELECT CASE WHEN NEW.directional_quality='CLOSED' AND EXISTS (
    SELECT 1
    FROM json_each(
      NEW.decision_json,'$.evidence_independence.causal_domains'
    ) domain
    WHERE domain.key IN ('PRICE_ACTION','POSITIONING','RELATIVE_MARKET') AND
      json_extract(domain.value,'$.state')=NEW.direction AND NOT EXISTS (
        SELECT 1 FROM json_each(
          NEW.decision_json,'$.evidence_independence.effective_directional_domains'
        ) effective_domain
        WHERE effective_domain.value=domain.key
      )
  ) THEN RAISE(ABORT,'final decision effective directional-domain set guard') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM json_each(
      NEW.decision_json,'$.evidence_independence.effective_directional_domains'
    ) effective_domain
    WHERE json_array_length(
      NEW.decision_json,
      '$.evidence_independence.causal_domains.'||effective_domain.value||'.correlation_groups'
    )<1
  ) THEN RAISE(ABORT,'final decision effective domain lacks correlation group') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM json_each(
      NEW.decision_json,'$.evidence_independence.effective_directional_domains'
    ) left_domain
    JOIN json_each(
      NEW.decision_json,'$.evidence_independence.effective_directional_domains'
    ) right_domain ON left_domain.value<right_domain.value
    JOIN json_each(
      NEW.decision_json,
      '$.evidence_independence.causal_domains.'||left_domain.value||'.correlation_groups'
    ) left_group
    JOIN json_each(
      NEW.decision_json,
      '$.evidence_independence.causal_domains.'||right_domain.value||'.correlation_groups'
    ) right_group ON left_group.value=right_group.value
  ) THEN RAISE(ABORT,'final decision cross-domain correlation-group reuse') END;
END;

CREATE TRIGGER trg_final_decision_json_cross_plane_guard
BEFORE INSERT ON final_decision_integration_shadow
BEGIN
  SELECT CASE WHEN
    (SELECT COUNT(*) FROM json_each(
      NEW.decision_json,'$.evidence_independence.cross_plane_reuse'
    ))!=6 OR
    (SELECT COUNT(DISTINCT key) FROM json_each(
      NEW.decision_json,'$.evidence_independence.cross_plane_reuse'
    ))!=6 OR
    EXISTS (
      SELECT 1 FROM json_each(
        NEW.decision_json,'$.evidence_independence.cross_plane_reuse'
      ) WHERE key NOT IN (
        'state','total_reuse_count','all_reuse_digest','report_truncated','reports','reason_codes'
      )
    ) OR
    json_type(NEW.decision_json,'$.evidence_independence.cross_plane_reuse.state') IS NOT 'text' OR
    json_extract(NEW.decision_json,'$.evidence_independence.cross_plane_reuse.state') NOT IN
      ('CLOSED','CORRELATED') OR
    json_type(NEW.decision_json,'$.evidence_independence.cross_plane_reuse.total_reuse_count') IS NOT 'integer' OR
    json_extract(NEW.decision_json,'$.evidence_independence.cross_plane_reuse.total_reuse_count') NOT BETWEEN 0 AND 456 OR
    json_type(NEW.decision_json,'$.evidence_independence.cross_plane_reuse.all_reuse_digest') IS NOT 'text' OR
    length(json_extract(NEW.decision_json,'$.evidence_independence.cross_plane_reuse.all_reuse_digest'))!=16 OR
    json_extract(NEW.decision_json,'$.evidence_independence.cross_plane_reuse.all_reuse_digest') GLOB '*[^0-9a-f]*' OR
    json_type(NEW.decision_json,'$.evidence_independence.cross_plane_reuse.report_truncated') NOT IN ('true','false') OR
    json_type(NEW.decision_json,'$.evidence_independence.cross_plane_reuse.reports') IS NOT 'array' OR
    json_array_length(NEW.decision_json,'$.evidence_independence.cross_plane_reuse.reports')>8 OR
    json_type(NEW.decision_json,'$.evidence_independence.cross_plane_reuse.reason_codes') IS NOT 'array' OR
    json_array_length(NEW.decision_json,'$.evidence_independence.cross_plane_reuse.reason_codes')>16
  THEN RAISE(ABORT,'final decision cross-plane shape guard') END;

  SELECT CASE WHEN
    (json_extract(
      NEW.decision_json,'$.evidence_independence.cross_plane_reuse.total_reuse_count'
    )>0)!=(json_extract(
      NEW.decision_json,'$.evidence_independence.cross_plane_reuse.state'
    )='CORRELATED') OR
    (json_extract(
      NEW.decision_json,'$.evidence_independence.cross_plane_reuse.total_reuse_count'
    )>8)!=(json_type(
      NEW.decision_json,'$.evidence_independence.cross_plane_reuse.report_truncated'
    )='true') OR
    json_array_length(NEW.decision_json,'$.evidence_independence.cross_plane_reuse.reports') IS NOT
      min(json_extract(
        NEW.decision_json,'$.evidence_independence.cross_plane_reuse.total_reuse_count'
      ),8) OR
    (json_extract(
      NEW.decision_json,'$.evidence_independence.cross_plane_reuse.total_reuse_count'
    )>0 AND NEW.independence_state NOT IN ('CORRELATED','CONFLICTING','BLOCKED'))
  THEN RAISE(ABORT,'final decision cross-plane state guard') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM json_each(
      NEW.decision_json,'$.evidence_independence.cross_plane_reuse.reason_codes'
    ) reason
    WHERE reason.type!='text' OR length(reason.value) NOT BETWEEN 1 AND 96 OR
      reason.value NOT GLOB '[A-Z]*' OR reason.value GLOB '*[^A-Za-z0-9_.:-]*'
  ) OR (
    SELECT COUNT(*) FROM json_each(
      NEW.decision_json,'$.evidence_independence.cross_plane_reuse.reason_codes'
    )
  )!=(
    SELECT COUNT(DISTINCT value) FROM json_each(
      NEW.decision_json,'$.evidence_independence.cross_plane_reuse.reason_codes'
    )
  ) THEN RAISE(ABORT,'final decision cross-plane reason guard') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM json_each(
      NEW.decision_json,'$.evidence_independence.cross_plane_reuse.reports'
    ) report
    WHERE report.type!='object' OR
      (SELECT COUNT(*) FROM json_each(report.value))!=8 OR
      (SELECT COUNT(DISTINCT key) FROM json_each(report.value))!=8 OR
      EXISTS (
        SELECT 1 FROM json_each(report.value)
        WHERE key NOT IN (
          'decision_evidence_count','decision_evidence_ids','detail_truncated',
          'full_evidence_observation_count','full_evidence_observation_ids',
          'identity','identity_digest','kind'
        )
      ) OR
      json_type(report.value,'$.kind') IS NOT 'text' OR
      json_extract(report.value,'$.kind') NOT IN (
        'SOURCE_OBSERVATION_ID','SOURCE_PAYLOAD_DIGEST','SOURCE_FACT_ID','SOURCE_ROOT'
      ) OR
      json_type(report.value,'$.identity_digest') IS NOT 'text' OR
      length(json_extract(report.value,'$.identity_digest'))!=16 OR
      json_extract(report.value,'$.identity_digest') GLOB '*[^0-9a-f]*' OR
      json_type(report.value,'$.decision_evidence_count') IS NOT 'integer' OR
      json_extract(report.value,'$.decision_evidence_count') NOT BETWEEN 1 AND 24 OR
      json_type(report.value,'$.full_evidence_observation_count') IS NOT 'integer' OR
      json_extract(report.value,'$.full_evidence_observation_count') NOT BETWEEN 1 AND 32 OR
      json_type(report.value,'$.decision_evidence_ids') IS NOT 'array' OR
      json_array_length(report.value,'$.decision_evidence_ids') NOT BETWEEN 1 AND 8 OR
      json_type(report.value,'$.full_evidence_observation_ids') IS NOT 'array' OR
      json_array_length(report.value,'$.full_evidence_observation_ids') NOT BETWEEN 1 AND 8 OR
      json_type(report.value,'$.detail_truncated') NOT IN ('true','false')
  ) THEN RAISE(ABORT,'final decision cross-plane report guard') END;
END;

CREATE TRIGGER trg_final_decision_json_cross_plane_report_identity_guard
BEFORE INSERT ON final_decision_integration_shadow
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM json_each(
      NEW.decision_json,'$.evidence_independence.cross_plane_reuse.reports'
    ) report
    WHERE
      (json_extract(report.value,'$.kind') IN ('SOURCE_OBSERVATION_ID','SOURCE_FACT_ID') AND (
        json_type(report.value,'$.identity') IS NOT 'text' OR
        length(json_extract(report.value,'$.identity')) NOT BETWEEN 1 AND 256 OR
        json_extract(report.value,'$.identity') NOT GLOB '[A-Za-z0-9]*' OR
        json_extract(report.value,'$.identity') GLOB '*[^A-Za-z0-9._:@/-]*'
      )) OR
      (json_extract(report.value,'$.kind')='SOURCE_PAYLOAD_DIGEST' AND (
        json_type(report.value,'$.identity') IS NOT 'text' OR
        length(json_extract(report.value,'$.identity'))!=16 OR
        json_extract(report.value,'$.identity') GLOB '*[^0-9a-f]*'
      )) OR
      (json_extract(report.value,'$.kind')='SOURCE_ROOT' AND (
        json_type(report.value,'$.identity') IS NOT 'object' OR
        (SELECT COUNT(*) FROM json_each(report.value,'$.identity'))!=4 OR
        (SELECT COUNT(DISTINCT key) FROM json_each(report.value,'$.identity'))!=4 OR
        EXISTS (
          SELECT 1 FROM json_each(report.value,'$.identity')
          WHERE key NOT IN ('metric','source','source_ts','venue')
        ) OR
        json_type(report.value,'$.identity.source') IS NOT 'text' OR
        length(json_extract(report.value,'$.identity.source')) NOT BETWEEN 1 AND 160 OR
        trim(json_extract(report.value,'$.identity.source')) IS NOT json_extract(report.value,'$.identity.source') OR
        json_type(report.value,'$.identity.venue') IS NOT 'text' OR
        length(json_extract(report.value,'$.identity.venue')) NOT BETWEEN 1 AND 160 OR
        trim(json_extract(report.value,'$.identity.venue')) IS NOT json_extract(report.value,'$.identity.venue') OR
        json_type(report.value,'$.identity.metric') IS NOT 'text' OR
        length(json_extract(report.value,'$.identity.metric')) NOT BETWEEN 1 AND 160 OR
        trim(json_extract(report.value,'$.identity.metric')) IS NOT json_extract(report.value,'$.identity.metric') OR
        json_type(report.value,'$.identity.source_ts') IS NOT 'integer' OR
        json_extract(report.value,'$.identity.source_ts') NOT BETWEEN 1 AND NEW.observation_ts
      ))
  ) THEN RAISE(ABORT,'final decision cross-plane identity guard') END;
END;

CREATE TRIGGER trg_final_decision_json_cross_plane_report_list_guard
BEFORE INSERT ON final_decision_integration_shadow
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM json_each(
      NEW.decision_json,'$.evidence_independence.cross_plane_reuse.reports'
    ) report
    WHERE
      EXISTS (
        SELECT 1 FROM json_each(report.value,'$.decision_evidence_ids') item
        WHERE item.type!='text' OR length(item.value) NOT BETWEEN 1 AND 96 OR
          item.value NOT GLOB '[A-Za-z0-9]*' OR item.value GLOB '*[^A-Za-z0-9._:@/-]*'
      ) OR
      (SELECT COUNT(*) FROM json_each(report.value,'$.decision_evidence_ids'))!=
        (SELECT COUNT(DISTINCT value) FROM json_each(report.value,'$.decision_evidence_ids')) OR
      EXISTS (
        SELECT 1 FROM json_each(report.value,'$.decision_evidence_ids') item
        WHERE CAST(item.key AS INTEGER)>0 AND item.value<=json_extract(
          report.value,'$.decision_evidence_ids['||(CAST(item.key AS INTEGER)-1)||']'
        )
      ) OR
      EXISTS (
        SELECT 1 FROM json_each(report.value,'$.full_evidence_observation_ids') item
        WHERE item.type!='text' OR length(item.value) NOT BETWEEN 1 AND 256 OR
          item.value NOT GLOB '[A-Za-z0-9]*' OR item.value GLOB '*[^A-Za-z0-9._:@/-]*'
      ) OR
      (SELECT COUNT(*) FROM json_each(report.value,'$.full_evidence_observation_ids'))!=
        (SELECT COUNT(DISTINCT value) FROM json_each(report.value,'$.full_evidence_observation_ids')) OR
      EXISTS (
        SELECT 1 FROM json_each(report.value,'$.full_evidence_observation_ids') item
        WHERE CAST(item.key AS INTEGER)>0 AND item.value<=json_extract(
          report.value,'$.full_evidence_observation_ids['||(CAST(item.key AS INTEGER)-1)||']'
        )
      ) OR
      json_array_length(report.value,'$.decision_evidence_ids') IS NOT min(
        json_extract(report.value,'$.decision_evidence_count'),8
      ) OR
      json_array_length(report.value,'$.full_evidence_observation_ids') IS NOT min(
        json_extract(report.value,'$.full_evidence_observation_count'),8
      ) OR
      (json_type(report.value,'$.detail_truncated')='true') IS NOT (
        json_extract(report.value,'$.decision_evidence_count')>8 OR
        json_extract(report.value,'$.full_evidence_observation_count')>8
      )
  ) THEN RAISE(ABORT,'final decision cross-plane report list guard') END;
END;

CREATE TRIGGER trg_final_decision_json_cross_plane_source_root_text_guard
BEFORE INSERT ON final_decision_integration_shadow
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM json_each(
      NEW.decision_json,'$.evidence_independence.cross_plane_reuse.reports'
    ) report,
    json_each(report.value,'$.identity') field
    WHERE json_extract(report.value,'$.kind')='SOURCE_ROOT' AND
      field.key IN ('source','venue','metric') AND (
        field.type!='text' OR
        field.value GLOB ('*['||char(1)||'-'||char(31)||char(127)||']*') OR
        field.value GLOB ('*['||char(8234)||'-'||char(8238)||char(8294)||'-'||char(8297)||']*') OR
        field.value GLOB ('['||char(160)||char(5760)||char(8192)||'-'||char(8202)||
          char(8232)||char(8233)||char(8239)||char(8287)||char(12288)||char(65279)||']*') OR
        field.value GLOB ('*['||char(160)||char(5760)||char(8192)||'-'||char(8202)||
          char(8232)||char(8233)||char(8239)||char(8287)||char(12288)||char(65279)||']') OR
        (
          WITH RECURSIVE character_index(i) AS (
            SELECT 1
            UNION ALL
            SELECT i+1 FROM character_index
            WHERE i<min(length(field.value),161)
          )
          SELECT min(length(field.value),161)+COALESCE(sum(
            CASE WHEN unicode(substr(field.value,i,1))>65535 THEN 1 ELSE 0 END
          ),0) FROM character_index
        )>160
      )
  ) THEN RAISE(ABORT,'final decision cross-plane source-root text guard') END;
END;

CREATE TRIGGER trg_final_decision_json_cross_plane_source_root_codepoint_guard
BEFORE INSERT ON final_decision_integration_shadow
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM json_each(
      NEW.decision_json,'$.evidence_independence.cross_plane_reuse.reports'
    ) report,
    json_each(report.value,'$.identity') field
    WHERE json_extract(report.value,'$.kind')='SOURCE_ROOT' AND
      field.key IN ('source','venue','metric') AND (
        field.type!='text' OR field.value IS NOT lower(field.value) OR EXISTS (
          WITH RECURSIVE character_index(i) AS (
            SELECT 1
            UNION ALL
            SELECT i+1 FROM character_index
            WHERE i<min(length(field.value),161)
          )
          SELECT 1 FROM character_index
          WHERE
            (unicode(substr(field.value,i,1)) BETWEEN 0 AND 127 AND NOT (
              unicode(substr(field.value,i,1)) BETWEEN 48 AND 57 OR
              unicode(substr(field.value,i,1)) BETWEEN 97 AND 122 OR
              (i>1 AND unicode(substr(field.value,i,1)) IN (45,46,47,58,64,95))
            )) OR
            unicode(substr(field.value,i,1)) IN (
              173,847,1564,4447,4448,6068,6069,12644,65279,65440
            ) OR
            unicode(substr(field.value,i,1)) BETWEEN 6155 AND 6159 OR
            unicode(substr(field.value,i,1)) BETWEEN 8203 AND 8207 OR
            unicode(substr(field.value,i,1)) BETWEEN 8234 AND 8238 OR
            unicode(substr(field.value,i,1)) BETWEEN 8288 AND 8303 OR
            unicode(substr(field.value,i,1)) BETWEEN 65024 AND 65039 OR
            unicode(substr(field.value,i,1)) BETWEEN 65520 AND 65528 OR
            unicode(substr(field.value,i,1)) BETWEEN 113824 AND 113827 OR
            unicode(substr(field.value,i,1)) BETWEEN 119155 AND 119162 OR
            unicode(substr(field.value,i,1)) BETWEEN 917504 AND 921599 OR
            unicode(substr(field.value,i,1)) IN (160,5760,8232,8233,8239,8287,12288) OR
            unicode(substr(field.value,i,1)) BETWEEN 8192 AND 8202
          LIMIT 1
        )
      )
  ) THEN RAISE(ABORT,'final decision cross-plane source-root codepoint guard') END;
END;

CREATE TRIGGER trg_final_decision_json_cross_plane_derivation_guard
BEFORE INSERT ON final_decision_integration_shadow
BEGIN
  SELECT CASE WHEN
    EXISTS (
      SELECT 1 FROM json_each(
        NEW.decision_json,'$.evidence_independence.cross_plane_reuse.reports'
      ) report
      WHERE CAST(report.key AS INTEGER)>0 AND
        json_extract(report.value,'$.kind')||':'||json_extract(report.value,'$.identity_digest')<=
        json_extract(
          NEW.decision_json,
          '$.evidence_independence.cross_plane_reuse.reports['||
          (CAST(report.key AS INTEGER)-1)||'].kind'
        )||':'||json_extract(
          NEW.decision_json,
          '$.evidence_independence.cross_plane_reuse.reports['||
          (CAST(report.key AS INTEGER)-1)||'].identity_digest'
        )
    ) OR
    json_array_length(
      NEW.decision_json,'$.evidence_independence.cross_plane_reuse.reason_codes'
    ) IS NOT (
      json_array_length(NEW.decision_json,'$.evidence_independence.cross_plane_reuse.reports')+
      CASE WHEN json_type(
        NEW.decision_json,'$.evidence_independence.cross_plane_reuse.report_truncated'
      )='true' THEN 1 ELSE 0 END
    ) OR
    EXISTS (
      SELECT 1 FROM json_each(
        NEW.decision_json,'$.evidence_independence.cross_plane_reuse.reports'
      ) report
      WHERE NOT EXISTS (
        SELECT 1 FROM json_each(
          NEW.decision_json,'$.evidence_independence.cross_plane_reuse.reason_codes'
        ) reason
        WHERE reason.value='CROSS_PLANE_'||json_extract(report.value,'$.kind')||
          '_REUSE:'||json_extract(report.value,'$.identity_digest')
      )
    ) OR
    EXISTS (
      SELECT 1 FROM json_each(
        NEW.decision_json,'$.evidence_independence.cross_plane_reuse.reason_codes'
      ) reason
      WHERE NOT (
        (reason.value='CROSS_PLANE_REUSE_REPORT_TRUNCATED' AND json_type(
          NEW.decision_json,'$.evidence_independence.cross_plane_reuse.report_truncated'
        )='true') OR EXISTS (
          SELECT 1 FROM json_each(
            NEW.decision_json,'$.evidence_independence.cross_plane_reuse.reports'
          ) report
          WHERE reason.value='CROSS_PLANE_'||json_extract(report.value,'$.kind')||
            '_REUSE:'||json_extract(report.value,'$.identity_digest')
        )
      )
    ) OR
    EXISTS (
      SELECT 1 FROM json_each(
        NEW.decision_json,'$.evidence_independence.cross_plane_reuse.reason_codes'
      ) reason
      WHERE CAST(reason.key AS INTEGER)>0 AND reason.value<=json_extract(
        NEW.decision_json,
        '$.evidence_independence.cross_plane_reuse.reason_codes['||
        (CAST(reason.key AS INTEGER)-1)||']'
      )
    )
  THEN RAISE(ABORT,'final decision cross-plane derivation guard') END;
END;

CREATE TRIGGER trg_final_decision_json_correlation_closure_guard
BEFORE INSERT ON final_decision_integration_shadow
WHEN NEW.independence_state='CLOSED'
BEGIN
  SELECT CASE WHEN
    json_array_length(
      NEW.decision_json,'$.evidence_independence.cross_domain_payload_digest_reuse'
    )!=0 OR
    (SELECT COUNT(*) FROM json_each(
      NEW.decision_json,'$.evidence_independence.cross_plane_reuse'
    ))!=6 OR
    (SELECT COUNT(DISTINCT key) FROM json_each(
      NEW.decision_json,'$.evidence_independence.cross_plane_reuse'
    ))!=6 OR
    EXISTS (
      SELECT 1 FROM json_each(
        NEW.decision_json,'$.evidence_independence.cross_plane_reuse'
      ) WHERE key NOT IN (
        'state','total_reuse_count','all_reuse_digest','report_truncated','reports','reason_codes'
      )
    )
  THEN RAISE(ABORT,'final decision correlation closure shape guard') END;

  SELECT CASE WHEN
    json_extract(NEW.decision_json,'$.evidence_independence.cross_plane_reuse.state') IS NOT 'CLOSED' OR
    json_type(NEW.decision_json,'$.evidence_independence.cross_plane_reuse.total_reuse_count') IS NOT 'integer' OR
    json_extract(NEW.decision_json,'$.evidence_independence.cross_plane_reuse.total_reuse_count')!=0 OR
    json_type(NEW.decision_json,'$.evidence_independence.cross_plane_reuse.all_reuse_digest') IS NOT 'text' OR
    length(json_extract(NEW.decision_json,'$.evidence_independence.cross_plane_reuse.all_reuse_digest'))!=16 OR
    json_extract(NEW.decision_json,'$.evidence_independence.cross_plane_reuse.all_reuse_digest') GLOB '*[^0-9a-f]*' OR
    json_extract(NEW.decision_json,'$.evidence_independence.cross_plane_reuse.all_reuse_digest')!='ed09c966dbcf99dd' OR
    json_type(NEW.decision_json,'$.evidence_independence.cross_plane_reuse.report_truncated') IS NOT 'false' OR
    json_type(NEW.decision_json,'$.evidence_independence.cross_plane_reuse.reports') IS NOT 'array' OR
    json_array_length(NEW.decision_json,'$.evidence_independence.cross_plane_reuse.reports')!=0 OR
    json_type(NEW.decision_json,'$.evidence_independence.cross_plane_reuse.reason_codes') IS NOT 'array' OR
    json_array_length(NEW.decision_json,'$.evidence_independence.cross_plane_reuse.reason_codes')!=0
  THEN RAISE(ABORT,'final decision correlated evidence hidden behind CLOSED') END;
END;

CREATE TRIGGER trg_final_decision_json_latency_shape_guard
BEFORE INSERT ON final_decision_integration_shadow
BEGIN
  SELECT CASE WHEN
    (SELECT COUNT(*) FROM json_each(NEW.decision_json,'$.opportunity_latency'))!=8 OR
    (SELECT COUNT(DISTINCT key) FROM json_each(NEW.decision_json,'$.opportunity_latency'))!=8 OR
    EXISTS (
      SELECT 1 FROM json_each(NEW.decision_json,'$.opportunity_latency')
      WHERE key NOT IN (
        'event_ts','event_close_ts','first_detected_ts','entry_trigger_ts',
        'detection_lag_ms','detection_lag_from_close_ms','entry_lag_from_detection_ms',
        'observation_age_from_event_ms'
      ) OR type NOT IN ('integer','null') OR (type='integer' AND atom<0)
    ) OR
    EXISTS (
      SELECT 1 FROM json_each(NEW.decision_json,'$.opportunity_latency')
      WHERE key IN ('event_ts','event_close_ts','first_detected_ts','entry_trigger_ts') AND
        type='integer' AND (atom=0 OR atom>NEW.observation_ts)
    )
  THEN RAISE(ABORT,'final decision opportunity-latency shape guard') END;
END;

CREATE TRIGGER trg_final_decision_json_latency_coherence_guard
BEFORE INSERT ON final_decision_integration_shadow
BEGIN
  SELECT CASE WHEN NEW.decision_status!='FAIL_CLOSED' AND (
    (json_type(NEW.decision_json,'$.opportunity_latency.event_ts')='integer' AND
     json_type(NEW.decision_json,'$.opportunity_latency.event_close_ts')='integer' AND
     json_extract(NEW.decision_json,'$.opportunity_latency.event_close_ts')<
       json_extract(NEW.decision_json,'$.opportunity_latency.event_ts')) OR
    (json_type(NEW.decision_json,'$.opportunity_latency.event_close_ts')='integer' AND
     json_type(NEW.decision_json,'$.opportunity_latency.first_detected_ts')='integer' AND
     json_extract(NEW.decision_json,'$.opportunity_latency.first_detected_ts')<
       json_extract(NEW.decision_json,'$.opportunity_latency.event_close_ts'))
  ) THEN RAISE(ABORT,'final decision opportunity-latency order guard') END;

  SELECT CASE WHEN
    json_extract(NEW.decision_json,'$.opportunity_latency.detection_lag_ms') IS NOT CASE
      WHEN json_type(NEW.decision_json,'$.opportunity_latency.first_detected_ts')='integer' AND
           json_type(NEW.decision_json,'$.opportunity_latency.event_ts')='integer' AND
           json_extract(NEW.decision_json,'$.opportunity_latency.first_detected_ts')>=
             json_extract(NEW.decision_json,'$.opportunity_latency.event_ts')
      THEN json_extract(NEW.decision_json,'$.opportunity_latency.first_detected_ts')-
           json_extract(NEW.decision_json,'$.opportunity_latency.event_ts') ELSE NULL END OR
    json_extract(NEW.decision_json,'$.opportunity_latency.detection_lag_from_close_ms') IS NOT CASE
      WHEN json_type(NEW.decision_json,'$.opportunity_latency.first_detected_ts')='integer' AND
           json_type(NEW.decision_json,'$.opportunity_latency.event_close_ts')='integer' AND
           json_extract(NEW.decision_json,'$.opportunity_latency.first_detected_ts')>=
             json_extract(NEW.decision_json,'$.opportunity_latency.event_close_ts')
      THEN json_extract(NEW.decision_json,'$.opportunity_latency.first_detected_ts')-
           json_extract(NEW.decision_json,'$.opportunity_latency.event_close_ts') ELSE NULL END
  THEN RAISE(ABORT,'final decision opportunity-latency detection guard') END;

  SELECT CASE WHEN
    json_extract(NEW.decision_json,'$.opportunity_latency.entry_lag_from_detection_ms') IS NOT CASE
      WHEN json_type(NEW.decision_json,'$.opportunity_latency.entry_trigger_ts')='integer' AND
           json_type(NEW.decision_json,'$.opportunity_latency.first_detected_ts')='integer' AND
           json_extract(NEW.decision_json,'$.opportunity_latency.entry_trigger_ts')>=
             json_extract(NEW.decision_json,'$.opportunity_latency.first_detected_ts')
      THEN json_extract(NEW.decision_json,'$.opportunity_latency.entry_trigger_ts')-
           json_extract(NEW.decision_json,'$.opportunity_latency.first_detected_ts') ELSE NULL END OR
    json_extract(NEW.decision_json,'$.opportunity_latency.observation_age_from_event_ms') IS NOT CASE
      WHEN json_type(NEW.decision_json,'$.opportunity_latency.event_ts')='integer' AND
           NEW.observation_ts>=json_extract(NEW.decision_json,'$.opportunity_latency.event_ts')
      THEN NEW.observation_ts-json_extract(NEW.decision_json,'$.opportunity_latency.event_ts')
      ELSE NULL END
  THEN RAISE(ABORT,'final decision opportunity-latency derived guard') END;
END;

CREATE TRIGGER trg_final_decision_json_safety_envelope_guard
BEFORE INSERT ON final_decision_integration_shadow
BEGIN
  SELECT CASE WHEN
    json_type(NEW.decision_json,'$.safety') IS NOT 'object' OR
    (SELECT COUNT(*) FROM json_each(NEW.decision_json,'$.safety'))!=15 OR
    (SELECT COUNT(DISTINCT key) FROM json_each(NEW.decision_json,'$.safety'))!=15 OR
    EXISTS (
      SELECT 1 FROM json_each(NEW.decision_json,'$.safety')
      WHERE key NOT IN (
        'shadow_only','classification_is_probability','live_probability','live_signal','validated_signal',
        'telegram_eligible','telegram_started','trading_execution','execution_authorized',
        'automatic_weight_tuning','strategy_weights_changed','fixed_strategy_weights_applied_by_this_layer',
        'statistical_validation_claimed','missing_data_coerced_to_zero',
        'correlated_features_counted_as_independent'
      )
    ) OR
    json_type(NEW.decision_json,'$.safety.shadow_only') IS NOT 'true' OR
    json_type(NEW.decision_json,'$.safety.live_probability') IS NOT 'null' OR
    EXISTS (
      SELECT 1 FROM json_each(NEW.decision_json,'$.safety')
      WHERE key!='shadow_only' AND key!='live_probability' AND type!='false'
    )
  THEN RAISE(ABORT,'final decision safety-envelope guard') END;
END;

CREATE TRIGGER trg_final_decision_json_recursive_safety_guard
BEFORE INSERT ON final_decision_integration_shadow
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM json_tree(NEW.decision_json)
    WHERE key IS NOT NULL
    GROUP BY parent,key HAVING COUNT(*)>1
  ) THEN RAISE(ABORT,'final decision duplicate JSON key guard') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM json_tree(NEW.decision_json)
    WHERE key IS NOT NULL AND typeof(key)='text' AND
      (length(key)=0 OR instr(key,char(0))>0 OR key GLOB '*[^A-Za-z0-9_]*')
  ) THEN RAISE(ABORT,'final decision JSON key guard') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM json_tree(NEW.decision_json)
    WHERE (type='text' AND instr(atom,char(0))>0) OR
      (type='real' AND (atom>1.7976931348623157e308 OR atom<(-1.7976931348623157e308)))
  ) THEN RAISE(ABORT,'final decision JSON scalar guard') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM json_tree(NEW.decision_json)
    WHERE
      (replace(replace(lower(key),'_',''),'-','')='liveprobability' AND type!='null') OR
      (replace(replace(lower(key),'_',''),'-','') IN (
        'automaticweighttuning','executionauthorized','livesignal','strategyweightschanged',
        'telegrameligible','telegramstarted','tradingexecution','validatedsignal','validated',
        'classificationisprobability','fixedstrategyweightsappliedbythislayer',
        'statisticalvalidationclaimed','statisticalindependencevalidated',
        'missingdatacoercedtozero','correlatedfeaturescountedasindependent','calibrationeligible',
        'shadowoutcomecollectioneligible'
      ) AND type!='false') OR
      (replace(replace(lower(key),'_',''),'-','')='shadowonly' AND type!='true')
  ) THEN RAISE(ABORT,'final decision recursive safety guard') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM json_tree(NEW.decision_json)
    WHERE replace(replace(lower(key),'_',''),'-','') IN (
      'asofts','availablets','campaignstart','candleclosets','detectionts','directionavailablets',
      'directionlockedts','entrytriggertime','entrytriggerts','eventclosets','eventts',
      'firstdetectedtime','firstdetectedts','impulsepeakts','impulsestart','lasteventts',
      'lastobservedts','observationts','observedts','sourcets','timestamp','committedts',
      'assignedts','persistedts'
    ) AND (type NOT IN ('integer','null') OR
           (type='integer' AND (atom<=0 OR atom>NEW.observation_ts)))
  ) THEN RAISE(ABORT,'final decision evidence timestamp guard') END;
END;

CREATE TRIGGER trg_final_decision_json_action_identity_guard
BEFORE INSERT ON final_decision_integration_shadow
BEGIN
  SELECT CASE WHEN
    json_type(NEW.decision_json,'$.action_identity') IS NOT 'object' OR
    (SELECT COUNT(*) FROM json_each(NEW.decision_json,'$.action_identity'))!=2 OR
    (SELECT COUNT(DISTINCT key) FROM json_each(NEW.decision_json,'$.action_identity'))!=2 OR
    EXISTS (SELECT 1 FROM json_each(NEW.decision_json,'$.action_identity')
            WHERE key NOT IN ('entry','management'))
  THEN RAISE(ABORT,'final decision action identity shape invalid') END;

  SELECT CASE WHEN NEW.entry_action='SHADOW_ENTRY_ELIGIBLE' AND (
    json_type(NEW.decision_json,'$.action_identity.entry') IS NOT 'object' OR
    (SELECT COUNT(*) FROM json_each(NEW.decision_json,'$.action_identity.entry'))!=5 OR
    (SELECT COUNT(DISTINCT key) FROM json_each(NEW.decision_json,'$.action_identity.entry'))!=5 OR
    EXISTS (SELECT 1 FROM json_each(NEW.decision_json,'$.action_identity.entry')
            WHERE key NOT IN ('campaign_id','contract_code','direction','entry_trigger_ts','wave_id')) OR
    json_extract(NEW.decision_json,'$.action_identity.entry.contract_code') IS NOT NEW.contract_code OR
    json_extract(NEW.decision_json,'$.action_identity.entry.direction') IS NOT NEW.direction OR
    json_type(NEW.decision_json,'$.action_identity.entry.campaign_id') IS NOT 'text' OR
    length(json_extract(NEW.decision_json,'$.action_identity.entry.campaign_id')) NOT BETWEEN 1 AND 256 OR
    json_extract(NEW.decision_json,'$.action_identity.entry.campaign_id') NOT GLOB '[A-Za-z0-9]*' OR
    json_extract(NEW.decision_json,'$.action_identity.entry.campaign_id') GLOB '*[^A-Za-z0-9._:@/-]*' OR
    json_type(NEW.decision_json,'$.action_identity.entry.wave_id') IS NOT 'text' OR
    length(json_extract(NEW.decision_json,'$.action_identity.entry.wave_id')) NOT BETWEEN 1 AND 320 OR
    json_extract(NEW.decision_json,'$.action_identity.entry.wave_id') NOT GLOB '[A-Za-z0-9]*' OR
    json_extract(NEW.decision_json,'$.action_identity.entry.wave_id') GLOB '*[^A-Za-z0-9._:@/-]*' OR
    json_type(NEW.decision_json,'$.action_identity.entry.entry_trigger_ts') IS NOT 'integer' OR
    json_extract(NEW.decision_json,'$.action_identity.entry.entry_trigger_ts') NOT BETWEEN 1 AND NEW.observation_ts OR
    json_type(NEW.decision_json,'$.lineage_receipts.position.receipt_id') IS NOT 'text' OR
    json_type(NEW.decision_json,'$.lineage_receipts.safety_gate.receipt_id') IS NOT 'text'
  ) THEN RAISE(ABORT,'final decision entry action identity invalid') END;

  SELECT CASE WHEN NEW.entry_action!='SHADOW_ENTRY_ELIGIBLE' AND
    json_type(NEW.decision_json,'$.action_identity.entry') IS NOT 'null'
  THEN RAISE(ABORT,'final decision inactive entry identity present') END;

  SELECT CASE WHEN NEW.management_action='EXIT' AND (
    json_type(NEW.decision_json,'$.action_identity.management') IS NOT 'object' OR
    (SELECT COUNT(*) FROM json_each(NEW.decision_json,'$.action_identity.management'))!=5 OR
    (SELECT COUNT(DISTINCT key) FROM json_each(NEW.decision_json,'$.action_identity.management'))!=5 OR
    EXISTS (SELECT 1 FROM json_each(NEW.decision_json,'$.action_identity.management')
            WHERE key NOT IN ('command','contract_code','position_direction','position_id','position_state_revision')) OR
    json_extract(NEW.decision_json,'$.action_identity.management.command') IS NOT 'EXIT' OR
    json_extract(NEW.decision_json,'$.action_identity.management.contract_code') IS NOT NEW.contract_code OR
    json_extract(NEW.decision_json,'$.action_identity.management.position_direction') IS NOT CASE
      WHEN NEW.position_state='OPEN_LONG' THEN 'LONG'
      WHEN NEW.position_state='OPEN_SHORT' THEN 'SHORT' ELSE NULL END OR
    json_type(NEW.decision_json,'$.action_identity.management.position_id') IS NOT 'text' OR
    length(json_extract(NEW.decision_json,'$.action_identity.management.position_id')) NOT BETWEEN 1 AND 256 OR
    json_extract(NEW.decision_json,'$.action_identity.management.position_id') NOT GLOB '[A-Za-z0-9]*' OR
    json_extract(NEW.decision_json,'$.action_identity.management.position_id') GLOB '*[^A-Za-z0-9._:@/-]*' OR
    json_type(NEW.decision_json,'$.action_identity.management.position_state_revision') IS NOT 'integer' OR
    json_extract(NEW.decision_json,'$.action_identity.management.position_state_revision') NOT BETWEEN
      0 AND 9007199254740991 OR
    json_type(NEW.decision_json,'$.lineage_receipts.position.receipt_id') IS NOT 'text' OR
    json_type(NEW.decision_json,'$.lineage_receipts.position_origin_campaign.receipt_id') IS NOT 'text' OR
    json_type(NEW.decision_json,'$.lineage_receipts.safety_gate.receipt_id') IS NOT 'text'
  ) THEN RAISE(ABORT,'final decision exit action identity invalid') END;

  SELECT CASE WHEN NEW.management_action!='EXIT' AND
    json_type(NEW.decision_json,'$.action_identity.management') IS NOT 'null'
  THEN RAISE(ABORT,'final decision inactive management identity present') END;

  SELECT CASE WHEN NEW.management_action='HOLD' AND (
    json_type(NEW.decision_json,'$.lineage_receipts.position.receipt_id') IS NOT 'text' OR
    json_type(NEW.decision_json,'$.lineage_receipts.position_origin_campaign.receipt_id') IS NOT 'text' OR
    json_type(NEW.decision_json,'$.lineage_receipts.position_management.receipt_id') IS NOT 'text' OR
    json_type(NEW.decision_json,'$.lineage_receipts.safety_gate.receipt_id') IS NOT 'text' OR
    json_extract(NEW.decision_json,'$.source_quality.position') IS NOT 'CLOSED' OR
    json_extract(NEW.decision_json,'$.source_quality.position_origin_campaign') IS NOT 'CLOSED' OR
    json_extract(NEW.decision_json,'$.source_quality.position_management') IS NOT 'CLOSED'
  ) THEN RAISE(ABORT,'final decision hold lineage invalid') END;
END;

CREATE TRIGGER trg_final_decision_json_management_trigger_shape_guard
BEFORE INSERT ON final_decision_integration_shadow
BEGIN
  SELECT CASE WHEN NEW.management_intent='EXIT_REQUIRED' AND (
    json_type(NEW.decision_json,'$.management_trigger_basis') IS NOT 'object' OR
    (SELECT COUNT(*) FROM json_each(NEW.decision_json,'$.management_trigger_basis'))!=8 OR
    (SELECT COUNT(DISTINCT key) FROM json_each(NEW.decision_json,'$.management_trigger_basis'))!=8 OR
    EXISTS (
      SELECT 1 FROM json_each(NEW.decision_json,'$.management_trigger_basis')
      WHERE key NOT IN (
        'campaign_phase','campaign_receipt_id','current_campaign_id','hard_veto_receipt_id',
        'origin_campaign_id','origin_campaign_receipt_id','position_management_receipt_id',
        'trigger_types'
      )
    ) OR
    json_type(NEW.decision_json,'$.management_trigger_basis.trigger_types') IS NOT 'array' OR
    json_array_length(NEW.decision_json,'$.management_trigger_basis.trigger_types') NOT BETWEEN 1 AND 3 OR
    (SELECT COUNT(DISTINCT value) FROM json_each(
      NEW.decision_json,'$.management_trigger_basis.trigger_types'
    ))!=json_array_length(NEW.decision_json,'$.management_trigger_basis.trigger_types') OR
    EXISTS (
      SELECT 1 FROM json_each(NEW.decision_json,'$.management_trigger_basis.trigger_types')
      WHERE type!='text' OR value NOT IN (
        'HARD_VETO','ORIGIN_CAMPAIGN_TERMINAL','POSITION_CONTEXT_INVALIDATED'
      )
    ) OR
    EXISTS (
      SELECT 1
      FROM json_each(NEW.decision_json,'$.management_trigger_basis.trigger_types') earlier
      JOIN json_each(NEW.decision_json,'$.management_trigger_basis.trigger_types') later
        ON CAST(earlier.key AS INTEGER)<CAST(later.key AS INTEGER)
      WHERE earlier.value>=later.value
    )
  ) THEN RAISE(ABORT,'final decision management trigger shape invalid') END;

  SELECT CASE WHEN NEW.management_intent!='EXIT_REQUIRED' AND
    json_type(NEW.decision_json,'$.management_trigger_basis') IS NOT 'null'
  THEN RAISE(ABORT,'final decision inactive management trigger present') END;
END;

CREATE TRIGGER trg_final_decision_json_management_trigger_source_guard
BEFORE INSERT ON final_decision_integration_shadow
WHEN NEW.management_intent='EXIT_REQUIRED' AND
  json_type(NEW.decision_json,'$.management_trigger_basis')='object' AND
  json_type(NEW.decision_json,'$.management_trigger_basis.trigger_types')='array'
BEGIN
  SELECT CASE WHEN
    (EXISTS (
      SELECT 1 FROM json_each(NEW.decision_json,'$.management_trigger_basis.trigger_types')
      WHERE value='HARD_VETO'
    ))!=(NEW.hard_veto=1)
  THEN RAISE(ABORT,'final decision management hard-veto trigger mismatch') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM json_each(NEW.decision_json,'$.management_trigger_basis.trigger_types')
    WHERE value='HARD_VETO'
  ) AND (
    json_type(NEW.decision_json,'$.management_trigger_basis.hard_veto_receipt_id') IS NOT 'text' OR
    json_extract(NEW.decision_json,'$.management_trigger_basis.hard_veto_receipt_id') IS NOT NEW.safety_gate_receipt_id OR
    NEW.hard_veto_state!='ACTIVE' OR
    json_extract(NEW.decision_json,'$.source_quality.hard_veto') IS NOT 'CLOSED'
  ) THEN RAISE(ABORT,'final decision management hard-veto trigger invalid') END;

  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM json_each(NEW.decision_json,'$.management_trigger_basis.trigger_types')
    WHERE value='HARD_VETO'
  ) AND json_type(
    NEW.decision_json,'$.management_trigger_basis.hard_veto_receipt_id'
  ) IS NOT 'null'
  THEN RAISE(ABORT,'final decision inactive hard-veto trigger receipt present') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM json_each(NEW.decision_json,'$.management_trigger_basis.trigger_types')
    WHERE value='POSITION_CONTEXT_INVALIDATED'
  ) AND (
    json_type(NEW.decision_json,'$.management_trigger_basis.position_management_receipt_id') IS NOT 'text' OR
    json_extract(NEW.decision_json,'$.management_trigger_basis.position_management_receipt_id') IS NOT NEW.position_management_receipt_id OR
    json_extract(NEW.decision_json,'$.source_quality.position_management') IS NOT 'CLOSED'
  ) THEN RAISE(ABORT,'final decision management position trigger invalid') END;

  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM json_each(NEW.decision_json,'$.management_trigger_basis.trigger_types')
    WHERE value='POSITION_CONTEXT_INVALIDATED'
  ) AND json_type(
    NEW.decision_json,'$.management_trigger_basis.position_management_receipt_id'
  ) IS NOT 'null'
  THEN RAISE(ABORT,'final decision inactive position trigger receipt present') END;
END;

CREATE TRIGGER trg_final_decision_json_management_trigger_origin_guard
BEFORE INSERT ON final_decision_integration_shadow
WHEN NEW.management_intent='EXIT_REQUIRED' AND
  json_type(NEW.decision_json,'$.management_trigger_basis')='object' AND
  json_type(NEW.decision_json,'$.management_trigger_basis.trigger_types')='array'
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM json_each(NEW.decision_json,'$.management_trigger_basis.trigger_types')
    WHERE value='ORIGIN_CAMPAIGN_TERMINAL'
  ) AND (
    json_extract(NEW.decision_json,'$.management_trigger_basis.campaign_phase') IS NOT NEW.campaign_phase OR
    NEW.campaign_phase NOT IN ('EDGE_SPENT','CLOSED') OR
    json_extract(NEW.decision_json,'$.source_quality.campaign') IS NOT 'CLOSED' OR
    json_extract(NEW.decision_json,'$.source_quality.position_origin_campaign') IS NOT 'CLOSED' OR
    json_type(NEW.decision_json,'$.management_trigger_basis.origin_campaign_id') IS NOT 'text' OR
    json_type(NEW.decision_json,'$.management_trigger_basis.current_campaign_id') IS NOT 'text' OR
    length(json_extract(NEW.decision_json,'$.management_trigger_basis.origin_campaign_id')) NOT BETWEEN 1 AND 256 OR
    json_extract(NEW.decision_json,'$.management_trigger_basis.origin_campaign_id') NOT GLOB '[A-Za-z0-9]*' OR
    json_extract(NEW.decision_json,'$.management_trigger_basis.origin_campaign_id') GLOB '*[^A-Za-z0-9._:@/-]*' OR
    json_extract(NEW.decision_json,'$.management_trigger_basis.origin_campaign_id') IS NOT
      json_extract(NEW.decision_json,'$.management_trigger_basis.current_campaign_id') OR
    json_type(NEW.decision_json,'$.management_trigger_basis.origin_campaign_receipt_id') IS NOT 'text' OR
    json_type(NEW.decision_json,'$.management_trigger_basis.campaign_receipt_id') IS NOT 'text' OR
    json_extract(NEW.decision_json,'$.management_trigger_basis.origin_campaign_receipt_id') IS NOT NEW.position_origin_campaign_receipt_id OR
    json_extract(NEW.decision_json,'$.management_trigger_basis.campaign_receipt_id') IS NOT NEW.campaign_receipt_id
  ) THEN RAISE(ABORT,'final decision management origin trigger invalid') END;

  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM json_each(NEW.decision_json,'$.management_trigger_basis.trigger_types')
    WHERE value='ORIGIN_CAMPAIGN_TERMINAL'
  ) AND (
    json_type(NEW.decision_json,'$.management_trigger_basis.campaign_phase') IS NOT 'null' OR
    json_type(NEW.decision_json,'$.management_trigger_basis.origin_campaign_id') IS NOT 'null' OR
    json_type(NEW.decision_json,'$.management_trigger_basis.current_campaign_id') IS NOT 'null' OR
    json_type(NEW.decision_json,'$.management_trigger_basis.origin_campaign_receipt_id') IS NOT 'null' OR
    json_type(NEW.decision_json,'$.management_trigger_basis.campaign_receipt_id') IS NOT 'null'
  ) THEN RAISE(ABORT,'final decision inactive origin trigger fields present') END;
END;

CREATE TRIGGER trg_final_decision_immutable_update_guard
BEFORE UPDATE ON final_decision_integration_shadow
BEGIN
  SELECT RAISE(ABORT,'final decision rows are immutable');
END;

CREATE TRIGGER trg_final_decision_action_collision_guard
BEFORE INSERT ON final_decision_action_claim_shadow
WHEN EXISTS (SELECT 1 FROM final_decision_action_claim_shadow WHERE action_id=NEW.action_id)
  AND EXISTS (
    SELECT 1 FROM final_decision_action_claim_shadow
    WHERE action_id=NEW.action_id AND (
      action_kind!=NEW.action_kind OR contract_code!=NEW.contract_code OR
      subject_id!=NEW.subject_id OR scope_id!=NEW.scope_id OR state_marker!=NEW.state_marker OR
      direction IS NOT NEW.direction
    )
  )
BEGIN
  SELECT RAISE(ABORT,'final decision action collision');
END;

CREATE TRIGGER trg_final_decision_action_target_collision_guard
BEFORE INSERT ON final_decision_action_claim_shadow
WHEN EXISTS (
  SELECT 1 FROM final_decision_action_claim_shadow
  WHERE action_kind=NEW.action_kind AND contract_code=NEW.contract_code AND
    subject_id=NEW.subject_id AND scope_id=NEW.scope_id AND state_marker=NEW.state_marker AND
    action_id!=NEW.action_id
)
BEGIN
  SELECT RAISE(ABORT,'final decision action target collision');
END;

CREATE TRIGGER trg_final_decision_action_claim_contract_capacity_guard
BEFORE INSERT ON final_decision_action_claim_shadow
WHEN NOT EXISTS (SELECT 1 FROM final_decision_action_claim_shadow WHERE action_id=NEW.action_id)
  AND NOT EXISTS (
    SELECT 1 FROM final_decision_action_claim_shadow
    WHERE action_kind=NEW.action_kind AND contract_code=NEW.contract_code AND
      subject_id=NEW.subject_id AND scope_id=NEW.scope_id AND state_marker=NEW.state_marker
  )
  AND (SELECT COUNT(*) FROM final_decision_action_claim_shadow WHERE contract_code=NEW.contract_code)>=256
BEGIN
  SELECT RAISE(ABORT,'final decision action contract capacity exhausted');
END;

CREATE TRIGGER trg_final_decision_action_claim_global_capacity_guard
BEFORE INSERT ON final_decision_action_claim_shadow
WHEN NOT EXISTS (SELECT 1 FROM final_decision_action_claim_shadow WHERE action_id=NEW.action_id)
  AND NOT EXISTS (
    SELECT 1 FROM final_decision_action_claim_shadow
    WHERE action_kind=NEW.action_kind AND contract_code=NEW.contract_code AND
      subject_id=NEW.subject_id AND scope_id=NEW.scope_id AND state_marker=NEW.state_marker
  )
  AND (SELECT COUNT(*) FROM final_decision_action_claim_shadow)>=4096
BEGIN
  SELECT RAISE(ABORT,'final decision action claim capacity exhausted');
END;

CREATE TRIGGER trg_final_decision_action_claim_immutable_guard
BEFORE UPDATE ON final_decision_action_claim_shadow
BEGIN
  SELECT RAISE(ABORT,'final decision action claim is immutable');
END;

CREATE TRIGGER trg_final_decision_action_claims
AFTER INSERT ON final_decision_integration_shadow
BEGIN
  -- Reclaim the exact incoming action and target first.  This guarantees that
  -- an expired tombstone cannot permanently block an otherwise valid replay,
  -- even when an older global backlog fills every remaining cleanup slot.
  DELETE FROM final_decision_action_claim_shadow
  WHERE action_id = CASE
    WHEN NEW.entry_action='SHADOW_ENTRY_ELIGIBLE' THEN NEW.entry_action_id
    WHEN NEW.management_action='EXIT' THEN NEW.management_action_id
    ELSE NULL
  END AND expires_ts<=NEW.persisted_ts;

  DELETE FROM final_decision_action_claim_shadow
  WHERE action_kind = CASE
      WHEN NEW.entry_action='SHADOW_ENTRY_ELIGIBLE' THEN 'ENTRY'
      WHEN NEW.management_action='EXIT' THEN 'EXIT'
      ELSE NULL
    END
    AND contract_code=NEW.contract_code
    AND subject_id = CASE
      WHEN NEW.entry_action='SHADOW_ENTRY_ELIGIBLE' THEN
        json_extract(NEW.decision_json,'$.action_identity.entry.campaign_id')
      WHEN NEW.management_action='EXIT' THEN
        json_extract(NEW.decision_json,'$.action_identity.management.position_id')
      ELSE NULL
    END
    AND scope_id = CASE
      WHEN NEW.entry_action='SHADOW_ENTRY_ELIGIBLE' THEN
        json_extract(NEW.decision_json,'$.action_identity.entry.wave_id')
      WHEN NEW.management_action='EXIT' THEN 'EXIT'
      ELSE NULL
    END
    AND state_marker = CASE
      WHEN NEW.entry_action='SHADOW_ENTRY_ELIGIBLE' THEN
        json_extract(NEW.decision_json,'$.action_identity.entry.entry_trigger_ts')
      WHEN NEW.management_action='EXIT' THEN
        json_extract(NEW.decision_json,'$.action_identity.management.position_state_revision')
      ELSE NULL
    END
    AND expires_ts<=NEW.persisted_ts;

  -- Reserve one of the fixed 16 cleanup slots for the claiming contract.
  DELETE FROM final_decision_action_claim_shadow
  WHERE action_id IN (
    SELECT action_id FROM final_decision_action_claim_shadow
    WHERE contract_code=NEW.contract_code AND expires_ts<=NEW.persisted_ts
    ORDER BY expires_ts ASC,action_id ASC LIMIT 1
  );

  DELETE FROM final_decision_action_claim_shadow
  WHERE action_id IN (
    SELECT action_id FROM final_decision_action_claim_shadow
    WHERE expires_ts<=NEW.persisted_ts
    ORDER BY expires_ts ASC,action_id ASC LIMIT 13
  );

  INSERT INTO final_decision_action_claim_shadow(
    action_id,action_kind,contract_code,subject_id,scope_id,state_marker,
    direction,first_decision_id,claimed_ts,expires_ts
  )
  SELECT NEW.entry_action_id,'ENTRY',NEW.contract_code,
    json_extract(NEW.decision_json,'$.action_identity.entry.campaign_id'),
    json_extract(NEW.decision_json,'$.action_identity.entry.wave_id'),
    json_extract(NEW.decision_json,'$.action_identity.entry.entry_trigger_ts'),
    json_extract(NEW.decision_json,'$.action_identity.entry.direction'),
    NEW.decision_id,NEW.persisted_ts,NEW.persisted_ts+15552000000
  WHERE NEW.entry_action='SHADOW_ENTRY_ELIGIBLE'
  ON CONFLICT(action_id) DO NOTHING;

  INSERT INTO final_decision_action_claim_shadow(
    action_id,action_kind,contract_code,subject_id,scope_id,state_marker,
    direction,first_decision_id,claimed_ts,expires_ts
  )
  SELECT NEW.management_action_id,'EXIT',NEW.contract_code,
    json_extract(NEW.decision_json,'$.action_identity.management.position_id'),
    'EXIT',
    json_extract(NEW.decision_json,'$.action_identity.management.position_state_revision'),
    json_extract(NEW.decision_json,'$.action_identity.management.position_direction'),
    NEW.decision_id,NEW.persisted_ts,NEW.persisted_ts+15552000000
  WHERE NEW.management_action='EXIT'
  ON CONFLICT(action_id) DO NOTHING;
END;

CREATE TRIGGER trg_final_decision_bounded_retention
AFTER INSERT ON final_decision_integration_shadow
BEGIN
  DELETE FROM final_decision_integration_shadow
  WHERE decision_id IN (
    SELECT decision_id FROM final_decision_integration_shadow
    WHERE observation_ts<NEW.persisted_ts-15552000000
    ORDER BY observation_ts ASC,decision_id ASC LIMIT 16
  );

  DELETE FROM final_decision_integration_shadow
  WHERE decision_id IN (
    SELECT decision_id FROM final_decision_integration_shadow
    WHERE contract_code=NEW.contract_code
    ORDER BY observation_ts DESC,decision_id DESC LIMIT 1 OFFSET 64
  );

  DELETE FROM final_decision_integration_shadow
  WHERE decision_id IN (
    SELECT decision_id FROM final_decision_integration_shadow
    ORDER BY observation_ts DESC,decision_id DESC LIMIT 1 OFFSET 2048
  );
END;
