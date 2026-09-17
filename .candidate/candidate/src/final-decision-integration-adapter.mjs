import {
  FINAL_DECISION_INTEGRATION_VERSION,
  FINAL_DECISION_MODE,
  buildFinalDecisionIntegrationShadow,
  finalDecisionSafetyEnvelope,
} from "./final-decision-integration-engine.mjs";

export const FINAL_DECISION_ADAPTER_VERSION = "stage391-to-final-decision-shadow-adapter-v2";

function finite(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function text(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function timestamp(value) {
  const n = finite(value);
  if (n === null || n <= 0 || !Number.isSafeInteger(n)) return null;
  const milliseconds = n < 10_000_000_000 ? n * 1000 : n;
  return Number.isSafeInteger(milliseconds) ? milliseconds : null;
}

function extractOpportunity(value) {
  if (value?.analysis && typeof value.analysis === "object") return value.analysis;
  if (value?.opportunity && typeof value.opportunity === "object") return value.opportunity;
  return value && typeof value === "object" ? value : null;
}

function extractCampaign(value) {
  if (!value || typeof value !== "object") return null;
  return value;
}

function legacyCompatibilityFindings({ shadowDecision, fullEvidence, opportunity, campaign }) {
  const findings = [];
  if (shadowDecision) {
    findings.push("LEGACY_SHADOW_SCORES_NOT_IMPORTED");
    if (!timestamp(shadowDecision?.evidence_cutoff_ts)) findings.push("LEGACY_SHADOW_PER_FEATURE_PROVENANCE_NOT_CLOSED");
    if (["LONG", "SHORT"].includes(text(shadowDecision?.direction_hint).toUpperCase())) {
      findings.push("LEGACY_DIRECTION_HINT_NOT_DECISION_EVIDENCE");
    }
  }
  if (fullEvidence) {
    const rows = Array.isArray(fullEvidence?.evidence_compact)
      ? fullEvidence.evidence_compact
      : Array.isArray(fullEvidence?.evidence)
        ? fullEvidence.evidence
        : [];
    if (rows.some((row) => row?.eligible_for_chain_closure !== true)) findings.push("FULL_EVIDENCE_CONTAINS_NON_ELIGIBLE_ROWS");
    if (rows.some((row) => ["CONFLICT", "CONFLICTING"].includes(text(row?.status).toUpperCase()))) findings.push("FULL_EVIDENCE_CONTAINS_RAW_CONFLICT");
  }
  const event = opportunity?.newest_event;
  if (event && !["LONG", "SHORT"].includes(text(event?.direction_at_event).toUpperCase())) findings.push("OPPORTUNITY_DIRECTION_NOT_PRECOMMITTED");
  if (event && text(event?.direction_at_detection)) findings.push("MULTI_WAVE_DIRECTION_FIELD_NOT_TRUSTED_AS_EVENT_DIRECTION");
  const c = campaign?.campaign || campaign;
  if (c) {
    if (!text(c?.origin_episode_id)) findings.push("CAMPAIGN_STABLE_EPISODE_ID_NOT_AVAILABLE");
    if (!Number.isSafeInteger(Number(c?.state_revision))) findings.push("CAMPAIGN_CAS_REVISION_NOT_AVAILABLE");
    if (c?.wave_facts_immutable !== true) findings.push("CAMPAIGN_WAVE_IMMUTABILITY_NOT_PROVEN");
  }
  return [...new Set(findings)].sort();
}

/**
 * Compatibility boundary for Stage 3.9.1 + Multi-Wave.
 *
 * The adapter deliberately does not translate the old weighted Shadow Decision
 * score or Multi-Wave boolean counts into independent evidence. Only evidence
 * already emitted under the new explicit causal-domain contract is forwarded.
 * This makes a legacy-only invocation fail closed instead of silently promoting
 * a technically available, but not statistically validated, signal.
 */
function adaptStage391ToFinalDecisionInputCore({
  shadow_decision = null,
  full_evidence = null,
  opportunity = null,
  multi_wave = null,
  decision_evidence = [],
  evidence_registry = null,
  hard_veto = null,
  execution_gate = null,
  safety_gate_receipt = null,
  position = { state: "UNKNOWN" },
  position_origin_campaign = null,
  position_management_context = null,
  observed_ts = null,
  contract_code = null,
  snapshot_id = null,
} = {}) {
  const opp = extractOpportunity(opportunity);
  const campaign = extractCampaign(multi_wave);
  const contract = text(
    contract_code ??
    opp?.contract ??
    full_evidence?.contract ??
    full_evidence?.contract_code ??
    campaign?.campaign?.contract_code ??
    shadow_decision?.contract,
  ).normalize("NFC");
  const observed = timestamp(
    observed_ts ??
    opp?.observed_ts ??
    full_evidence?.observed_ts ??
    campaign?.campaign?.last_observed_ts ??
    shadow_decision?.observed_ts,
  );
  const explicitRows = Array.isArray(decision_evidence) ? decision_evidence : [];
  return {
    adapter_version: FINAL_DECISION_ADAPTER_VERSION,
    target_version: FINAL_DECISION_INTEGRATION_VERSION,
    mode: FINAL_DECISION_MODE,
    contract_code: contract || null,
    snapshot_id: text(snapshot_id ?? opp?.snapshot_id ?? full_evidence?.snapshot_id ?? campaign?.snapshot_id) || null,
    observed_ts: observed,
    full_evidence,
    opportunity: opp,
    campaign,
    decision_evidence: explicitRows,
    evidence_registry,
    hard_veto,
    execution_gate,
    safety_gate_receipt,
    position,
    position_origin_campaign,
    position_management_context,
    compatibility: {
      current_worker_mutated: false,
      network_calls_added: 0,
      d1_reads_added: 0,
      d1_writes_added: 0,
      legacy_strategy_weights_read_as_metadata_only: true,
      legacy_strategy_weights_applied: false,
      legacy_shadow_scores_imported: false,
      legacy_boolean_evidence_counts_imported: false,
      explicit_new_contract_rows: explicitRows.length,
      findings: legacyCompatibilityFindings({
        shadowDecision: shadow_decision,
        fullEvidence: full_evidence,
        opportunity: opp,
        campaign,
      }),
    },
    safety: finalDecisionSafetyEnvelope(),
  };
}

function unreadableAdapterInput() {
  return {
    adapter_version: FINAL_DECISION_ADAPTER_VERSION,
    target_version: FINAL_DECISION_INTEGRATION_VERSION,
    mode: FINAL_DECISION_MODE,
    contract_code: null,
    snapshot_id: null,
    observed_ts: null,
    full_evidence: null,
    opportunity: null,
    campaign: null,
    decision_evidence: [],
    evidence_registry: null,
    hard_veto: null,
    execution_gate: null,
    safety_gate_receipt: null,
    position: { state: "UNKNOWN" },
    position_origin_campaign: null,
    position_management_context: null,
    compatibility: {
      current_worker_mutated: false,
      network_calls_added: 0,
      d1_reads_added: 0,
      d1_writes_added: 0,
      legacy_strategy_weights_read_as_metadata_only: false,
      legacy_strategy_weights_applied: false,
      legacy_shadow_scores_imported: false,
      legacy_boolean_evidence_counts_imported: false,
      explicit_new_contract_rows: 0,
      findings: ["ADAPTER_INPUT_UNREADABLE"],
    },
    safety: finalDecisionSafetyEnvelope(),
  };
}

export function adaptStage391ToFinalDecisionInput(args = {}) {
  try {
    if (!args || typeof args !== "object" || Array.isArray(args)) return unreadableAdapterInput();
    return adaptStage391ToFinalDecisionInputCore(args);
  } catch {
    return unreadableAdapterInput();
  }
}

export function buildFinalDecisionFromStage391Shadow(args = {}) {
  const adapted = adaptStage391ToFinalDecisionInput(args);
  const decision = buildFinalDecisionIntegrationShadow(adapted);
  return {
    decision,
    adapter_metadata: {
      adapter_version: FINAL_DECISION_ADAPTER_VERSION,
      compatibility: adapted.compatibility,
    },
  };
}
