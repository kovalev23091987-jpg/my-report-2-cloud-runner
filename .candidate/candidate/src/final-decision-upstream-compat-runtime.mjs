import {
  adaptStage391ToFinalDecisionInput,
} from './final-decision-integration-adapter.mjs';
import {
  buildFinalDecisionIntegrationShadow,
  validateFinalDecisionOutput,
} from './final-decision-integration-engine.mjs';

export const UPSTREAM_COMPAT_VERSION = 'final-decision-upstream-compat-v1';
export const UPSTREAM_COMPAT_MODE = 'SHADOW_ONLY_NO_EXECUTION';

const P0_FINDINGS = new Set([
  'CAMPAIGN_STABLE_EPISODE_ID_NOT_AVAILABLE',
  'CAMPAIGN_CAS_REVISION_NOT_AVAILABLE',
  'CAMPAIGN_WAVE_IMMUTABILITY_NOT_PROVEN',
  'ADAPTER_INPUT_UNREADABLE',
]);

function safetyEnvelope() {
  return Object.freeze({
    shadow_only: true,
    production_mutated: false,
    live_probability: null,
    live_signal: false,
    validated_signal: false,
    telegram_started: false,
    trading_execution: false,
    automatic_weight_tuning: false,
    strategy_weights_changed: false,
  });
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function evaluateFinalDecisionUpstreamCompatibility(args = {}) {
  let adapted;
  let decision;
  let validation;
  try {
    adapted = adaptStage391ToFinalDecisionInput(args);
    decision = buildFinalDecisionIntegrationShadow(adapted);
    validation = validateFinalDecisionOutput(decision);
  } catch (error) {
    return {
      version: UPSTREAM_COMPAT_VERSION,
      mode: UPSTREAM_COMPAT_MODE,
      status: 'FAIL_CLOSED',
      ready: false,
      findings: ['UPSTREAM_COMPAT_RUNTIME_EXCEPTION'],
      error: String(error?.message || error).slice(0, 500),
      decision: null,
      safety: safetyEnvelope(),
    };
  }

  const adapterFindings = safeArray(adapted?.compatibility?.findings);
  const p0Findings = adapterFindings.filter((finding) => P0_FINDINGS.has(finding));
  const validationErrors = validation?.valid === true ? [] : safeArray(validation?.errors);
  const engineFailClosed = decision?.status === 'FAIL_CLOSED';
  const unsafePromotion = Boolean(
    decision?.execution_authorized === true ||
    decision?.telegram_eligible === true ||
    decision?.live_probability !== null ||
    decision?.validated_signal === true
  );

  const ready = (
    validationErrors.length === 0 &&
    p0Findings.length === 0 &&
    !engineFailClosed &&
    !unsafePromotion
  );

  return {
    version: UPSTREAM_COMPAT_VERSION,
    mode: UPSTREAM_COMPAT_MODE,
    status: ready ? 'READY_FOR_FINAL_DECISION_SHADOW' : 'FAIL_CLOSED',
    ready,
    findings: [...new Set([
      ...p0Findings,
      ...validationErrors.map((error) => `DECISION_VALIDATION:${error}`),
      ...(engineFailClosed ? ['FINAL_DECISION_ENGINE_FAIL_CLOSED'] : []),
      ...(unsafePromotion ? ['UNSAFE_PROMOTION_DETECTED'] : []),
    ])].sort(),
    adapter_findings: adapterFindings,
    decision,
    safety: safetyEnvelope(),
  };
}
