DROP TRIGGER IF EXISTS trg_stage392_full_evidence_proof_insert_guard

-- report2:statement-break

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
    json_extract(NEW.stage392_proof_bundle_json,'$.full_evidence.full_evidence_id') IS NOT NEW.full_evidence_id OR
    json_extract(NEW.stage392_proof_bundle_json,'$.full_evidence.contract_code') IS NOT NEW.contract_code OR
    json_extract(NEW.stage392_proof_bundle_json,'$.full_evidence.observed_ts') IS NOT NEW.observed_ts OR
    json_extract(NEW.stage392_proof_bundle_json,'$.full_evidence.fixed_decision_weights.CROSS_EXCHANGE_DERIVATIVES') IS NOT NEW.weight_derivatives OR
    json_extract(NEW.stage392_proof_bundle_json,'$.full_evidence.fixed_decision_weights.MARKET_STRENGTH_SPOT') IS NOT NEW.weight_market_strength_spot OR
    json_extract(NEW.stage392_proof_bundle_json,'$.full_evidence.fixed_decision_weights.SMART_MONEY_ONCHAIN') IS NOT NEW.weight_smart_money_onchain OR
    json_extract(NEW.stage392_proof_bundle_json,'$.full_evidence.fixed_decision_weights.SUPPORTING_RISK') IS NOT NEW.weight_supporting_risk OR
    json_extract(NEW.stage392_proof_bundle_json,'$.full_evidence.persistence.status') IS NOT 'PREPARED_UNACKNOWLEDGED' OR
    json_type(NEW.stage392_proof_bundle_json,'$.full_evidence.persistence.committed_ts') IS NOT 'null' OR
    json_extract(NEW.stage392_proof_bundle_json,'$.full_evidence.persistence.timeline_contract') IS NOT 'DECISION_THEN_EXACT_D1_ACK_V1' OR
    json_extract(NEW.stage392_proof_bundle_json,'$.full_evidence.persistence.immutable') IS NOT 1 OR
    json_extract(NEW.stage392_proof_bundle_json,'$.full_evidence.persistence.verification_method') IS NOT 'D1_IMMUTABLE_RECEIPT' OR
    COALESCE(json_extract(NEW.stage392_proof_bundle_json,'$.full_evidence.persistence.receipt_id'),'')='' OR
    length(COALESCE(json_extract(NEW.stage392_proof_bundle_json,'$.full_evidence.persistence.content_digest'),''))!=16 OR
    json_extract(NEW.stage392_proof_bundle_json,'$.full_evidence.persistence.content_digest') GLOB '*[^0-9a-f]*' OR
    json_extract(NEW.stage392_proof_bundle_json,'$.full_evidence.source_registry.status') IS NOT 'CLOSED' OR
    json_extract(NEW.stage392_proof_bundle_json,'$.full_evidence.source_registry.authoritative') IS NOT 1 OR
    json_extract(NEW.stage392_proof_bundle_json,'$.full_evidence.source_registry.persistence.status') IS NOT 'PREPARED_UNACKNOWLEDGED' OR
    json_type(NEW.stage392_proof_bundle_json,'$.full_evidence.source_registry.persistence.committed_ts') IS NOT 'null' OR
    json_extract(NEW.stage392_proof_bundle_json,'$.full_evidence.source_registry.persistence.timeline_contract') IS NOT 'DECISION_THEN_EXACT_D1_ACK_V1' OR
    json_extract(NEW.stage392_proof_bundle_json,'$.full_evidence.source_registry.persistence.immutable') IS NOT 1 OR
    json_extract(NEW.stage392_proof_bundle_json,'$.full_evidence.source_registry.persistence.verification_method') IS NOT 'D1_IMMUTABLE_RECEIPT' OR
    json_extract(NEW.stage392_proof_bundle_json,'$.full_evidence.source_registry.receipt_id') IS NOT json_extract(NEW.stage392_proof_bundle_json,'$.full_evidence.source_registry.persistence.receipt_id') OR
    json_extract(NEW.stage392_proof_bundle_json,'$.evidence_registry.status') IS NOT 'CLOSED' OR
    json_extract(NEW.stage392_proof_bundle_json,'$.evidence_registry.authoritative') IS NOT 1 OR
    json_extract(NEW.stage392_proof_bundle_json,'$.evidence_registry.rules_version') IS NOT 'causal-lineage-registry-v3-full-envelope' OR
    json_extract(NEW.stage392_proof_bundle_json,'$.evidence_registry.persistence.status') IS NOT 'PREPARED_UNACKNOWLEDGED' OR
    json_type(NEW.stage392_proof_bundle_json,'$.evidence_registry.persistence.committed_ts') IS NOT 'null' OR
    json_extract(NEW.stage392_proof_bundle_json,'$.evidence_registry.persistence.timeline_contract') IS NOT 'DECISION_THEN_EXACT_D1_ACK_V1' OR
    json_extract(NEW.stage392_proof_bundle_json,'$.evidence_registry.persistence.immutable') IS NOT 1 OR
    json_extract(NEW.stage392_proof_bundle_json,'$.evidence_registry.persistence.verification_method') IS NOT 'D1_IMMUTABLE_RECEIPT' OR
    json_extract(NEW.stage392_proof_bundle_json,'$.evidence_registry.receipt_id') IS NOT json_extract(NEW.stage392_proof_bundle_json,'$.evidence_registry.persistence.receipt_id') OR
    json_extract(NEW.stage392_proof_bundle_json,'$.safety_gate_receipt.status') IS NOT 'CLOSED' OR
    json_extract(NEW.stage392_proof_bundle_json,'$.safety_gate_receipt.authoritative') IS NOT 1 OR
    json_extract(NEW.stage392_proof_bundle_json,'$.safety_gate_receipt.persistence.status') IS NOT 'PREPARED_UNACKNOWLEDGED' OR
    json_type(NEW.stage392_proof_bundle_json,'$.safety_gate_receipt.persistence.committed_ts') IS NOT 'null' OR
    json_extract(NEW.stage392_proof_bundle_json,'$.safety_gate_receipt.persistence.timeline_contract') IS NOT 'DECISION_THEN_EXACT_D1_ACK_V1' OR
    json_extract(NEW.stage392_proof_bundle_json,'$.safety_gate_receipt.persistence.immutable') IS NOT 1 OR
    json_extract(NEW.stage392_proof_bundle_json,'$.safety_gate_receipt.persistence.verification_method') IS NOT 'D1_IMMUTABLE_RECEIPT' OR
    json_extract(NEW.stage392_proof_bundle_json,'$.safety_gate_receipt.receipt_id') IS NOT json_extract(NEW.stage392_proof_bundle_json,'$.safety_gate_receipt.persistence.receipt_id')
  ) THEN RAISE(ABORT,'stage392 full evidence proof contract invalid') END;
END
