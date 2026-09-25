import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildV3LiveHandoffPlan,
  classifyV3LiveHandoffZeroReason,
  assessV3PipelineHealth,
} from "../src/v3-live-handoff.mjs";
import { applyEarlyCandidateBridge } from "../src/early-candidate-bridge.mjs";

const workerPath =
  new URL(
    "../src/worker.js",
    import.meta.url
  );

const workerSourceRaw =
  fs.readFileSync(
    workerPath,
    "utf8"
  );

const workerSource = workerSourceRaw.replace(
  /^import \{[\s\S]*?\} from "\.\/fast-move-watch-runtime\.mjs";\n\nimport \{[\s\S]*?\} from "\.\/opportunity-intelligence-runtime\.mjs";\n\nimport \{[\s\S]*?\} from "\.\/multi-wave-campaign-runtime\.mjs";\n\nimport \{[\s\S]*?\} from "\.\/stage392-proof-runtime\.mjs";\n\nimport \{[\s\S]*?\} from "\.\/final-decision-upstream-compat-runtime\.mjs";\n\n(?:import \{[\s\S]*?\} from "\.\/v3-live-handoff\.mjs";\n\n)?import \{[\s\S]*?\} from "\.\/final-decision-integration-adapter\.mjs";\n\nimport \{[\s\S]*?\} from "\.\/final-decision-integration-runtime\.mjs";\n\nimport \{[\s\S]*?\} from "\.\/tz101-publication-runtime\.mjs";\n\n(?:import \{[\s\S]*?\} from "\.\/tz101-byk-proxy-policy\.mjs";\n\n)?(?:import \{[\s\S]*?\} from "\.\/tz101-smart-money-evidence\.mjs";\n\n)?(?:import \{[\s\S]*?\} from "\.\/public-evidence-adapters\.mjs";\n\n)?(?:import \{[\s\S]*?\} from "\.\/full-evidence-shadow-model\.mjs";\n\n)?(?:import \{[\s\S]*?\} from "\.\/htx-turnover-gate\.mjs";\n\n)?(?:import \{[\s\S]*?\} from "\.\/early-candidate-bridge\.mjs";\n\n)?(?:import \{[\s\S]*?\} from "\.\/canonical-runtime-adapter\.mjs";\n\n)?(?:import \{[\s\S]*?\} from "\.\/source-registry\.mjs";\n\n)?/,
  `const FAST_MOVE_WATCH_VERSION = "3.8-fast-move-watch-shadow";
   const FAST_MOVE_WATCH_STATUS = "ACTIVE_SHADOW_BOUNDED_NO_EXECUTION";
   const buildFastMoveDeepObservation = () => null;
   const prepareFastMoveWatchCycle = async ({ discovery_prefilter }) => ({ adaptive_discovery_prefilter: discovery_prefilter, adaptive_cooldown_sec: 1800 });
   const finalizeFastMoveWatchCycle = async () => ({ status: "TEST_STUB" });
   const fastMoveWatchDataPlaneSummary = async () => ({ table_available: false, status: "TEST_STUB" });
   const OPPORTUNITY_VERSION = "3.9-opportunity-intelligence-shadow";
   const buildOpportunityJournalPrefilter = (prefilter) => prefilter;
   const opportunityDataPlaneSummary = async () => ({ table_available: false, status: "TEST_STUB" });
   const runOpportunityShadowCycle = async () => ({ status: "TEST_STUB", safety: { live_signal: false } });
   const selectOpportunityJournalCandidate = async () => ({ status: "NOT_JOURNAL_QUOTA_SLOT", selected_contract: null });
   const MULTI_WAVE_VERSION = "TEST";
   const multiWaveCampaignDataPlaneSummary = async () => ({ table_available: false, status: "TEST_STUB" });
   const runMultiWaveCampaignShadowCycle = async () => ({ status: "TEST_STUB", safety: { live_signal: false } });
   const prepareFullEvidenceProofBundle = () => ({ status: "TEST_STUB" });
   const sealFullEvidenceProofBundleAfterAck = () => ({ status: "TEST_STUB" });
   const stage392ProofSafetyEnvelope = () => ({ status: "TEST_STUB" });
   const evaluateFinalDecisionUpstreamCompatibility = () => ({ status: "TEST_STUB" });
   const adaptStage391ToFinalDecisionInput = () => ({ status: "TEST_STUB" });
   const persistFinalDecisionIntegrationShadow = async () => ({ status: "TEST_STUB" });
   const runTz101PublicationShadow = async () => ({ status: "TEST_STUB", sidecar_persisted: false });
   const validateByKaranteliProxyTarget = () => ({ allowed: true });
   const fetchByKaranteliSmartMoneyRaw = async () => ({ status: "NOT_CLOSED", external_fetches: 0, score_eligible: false, directional_vote_eligible: false });
   const smartMoneyRawEvidenceRows = () => []; const collectPublicFullEvidenceCrossVenue=async()=>({evidence:[]}); const buildFullEvidenceShadowRecordCrossVenue=()=>({status:"TEST_STUB"}); const loadEarlyBridgeInputs=async()=>({status:"SOURCE_UNSUPPORTED",early_rows:[],full_evidence_rows:[]}); const applyEarlyCandidateBridge=({discovery_prefilter})=>discovery_prefilter; const evaluateHtxFuturesTurnoverGate=(row)=>({allowed:true,status:"CLOSED",reason:null,turnover_24h_usd_equivalent:Number(row?.turnover_24h_usdt??100000)}); const buildRuntimeCanonicalBundle=()=>({status:"TEST_STUB",canonical:{state:"OBSERVE"},telegram:{status:"TEST_STUB"},manual:{status:"TEST_STUB"},parity_fingerprint:"TEST"}); const buildFreeSourceRuntimeSummary=()=>({status:"TEST_STUB",sources:[],configured_sources:0,material_gaps:[],external_hot_request_delta:0,d1_write_delta_hot:0,continuous_collector_status:"PARTIAL_REALTIME_COVERAGE"});\n\n`,
);

assert.notEqual(workerSource, workerSourceRaw, "Stage 3.8 import test adapter must match exactly once");

const testableSource =
  workerSource +
  `\nexport {
    classifyHtxInstrumentScope,
    buildDeepCheckQueue,
    buildDiscoveryPrefilter,
    buildBoundedDeepCheckPlan,
    deepCheckAttemptedForD1Budget
  };\n`;

const moduleUrl =
  "data:text/javascript;base64," +
  Buffer.from(
    testableSource
  ).toString("base64");

const {
  classifyHtxInstrumentScope,
  buildDeepCheckQueue,
  buildDiscoveryPrefilter,
  buildBoundedDeepCheckPlan,
  deepCheckAttemptedForD1Budget,
} = await import(moduleUrl);

function scopeInfo(overrides = {}) {
  return {
    contract_code:
      "ETHFI-USDT",
    business_type:
      "swap",
    contract_type:
      "swap",
    trade_partition:
      "USDT",
    labels: ["common"],
    tradfi_labels: [],
    ...overrides,
  };
}

const crypto =
  classifyHtxInstrumentScope(
    scopeInfo()
  );

assert.equal(
  crypto.classification,
  "CRYPTO_CONFIRMED"
);

assert.equal(
  crypto
    .eligible_for_crypto_discovery,
  true
);

const stock =
  classifyHtxInstrumentScope(
    scopeInfo({
      contract_code:
        "BNC-USDT",
      labels: [
        "tradfi",
        "stock",
      ],
      tradfi_labels: [
        "Stocks",
      ],
    })
  );

assert.equal(
  stock.classification,
  "NON_CRYPTO_HTX_CLASSIFIED"
);

assert.equal(
  stock
    .eligible_for_crypto_discovery,
  false
);

const unknown =
  classifyHtxInstrumentScope({
    contract_code:
      "UNKNOWN-USDT",
    business_type:
      "swap",
    contract_type:
      "swap",
    trade_partition:
      "USDT",
  });

assert.equal(
  unknown.classification,
  "UNKNOWN_FAIL_CLOSED"
);

assert.equal(
  unknown
    .eligible_for_crypto_discovery,
  false
);

function stage0Row(
  contract,
  classification,
  overrides = {}
) {
  return {
    contract_code:
      contract,
    data_status:
      "CLOSED",
    freshness: {
      stale: false,
      market_age_sec: 2,
    },
    quality: {
      market_present: true,
      oi_present: true,
      funding_present: true,
      history_available: true,
    },
    symbol_fingerprint: {
      resolution_status:
        "RESOLVED_HTX_EXACT",
    },
    instrument_scope: {
      classification,
    },
    turnover_24h_usdt:
      1_000_000,
    open_interest: {
      value_usdt: 500_000,
    },
    funding: {
      funding_rate: -0.01,
    },
    transitions: {
      "5m": {
        price_change_pct: 2,
        oi_change_pct: 3,
      },
      "15m": {
        price_change_pct: 3,
        oi_change_pct: 4,
      },
      "1h": {
        price_change_pct: 5,
        oi_change_pct: 6,
      },
      "4h": {
        price_change_pct: 8,
        oi_change_pct: 9,
      },
    },
    acceleration: {
      "5m_vs_15m": {
        price_pct_per_min_delta:
          0.2,
        oi_pct_per_min_delta:
          0.3,
      },
    },
    ...overrides,
  };
}

const scan = {
  contracts: [
    stage0Row(
      "ETHFI-USDT",
      "CRYPTO_CONFIRMED"
    ),
    stage0Row(
      "BNC-USDT",
      "NON_CRYPTO_HTX_CLASSIFIED"
    ),
    stage0Row(
      "MISSING-USDT",
      "UNKNOWN_FAIL_CLOSED"
    ),
  ],
};

const queue =
  buildDeepCheckQueue(scan);

assert.deepEqual(
  queue.queue.map(
    (row) => row.contract
  ),
  ["ETHFI-USDT"]
);

assert.equal(
  queue.decision.generated,
  false
);

assert.equal(
  queue.decision.validated,
  false
);

for (
  const excludedContract
  of [
    "BNC-USDT",
    "MISSING-USDT",
  ]
) {
  const excluded =
    queue.excluded.find(
      (row) =>
        row.contract ===
        excludedContract
    );

  assert.ok(excluded);
  assert.ok(
    excluded.reasons.includes(
      "INSTRUMENT_SCOPE_NOT_CRYPTO_CONFIRMED"
    )
  );
}

const discovery =
  buildDiscoveryPrefilter(
    scan,
    queue,
    {
      liquidity_percentile:
        0.5,
      anomaly_percentile:
        0.8,
      funding_percentile:
        0.8,
      min_anomaly_flags:
        0,
      max_shortlist:
        12,
    }
  );

assert.ok(
  discovery.shortlist.every(
    (row) =>
      row.contract ===
      "ETHFI-USDT"
  )
);

assert.equal(
  discovery.decision.generated,
  false
);

const planningInput = {
  shortlist: [
    {
      contract:
        "ETHFI-USDT",
      priority_rank: 1,
      anomaly_flags_count: 4,
    },
    {
      contract:
        "RAY-USDT",
      priority_rank: 2,
      anomaly_flags_count: 3,
    },
    {
      contract:
        "AKE-USDT",
      priority_rank: 3,
      anomaly_flags_count: 2,
    },
  ],
};

const plan =
  buildBoundedDeepCheckPlan(
    planningInput,
    [],
    Date.now(),
    {
      max_per_run: 99,
      confirmed_scope_contracts:
        planningInput.shortlist.map(
          (row) => row.contract
        ),
    }
  );

assert.equal(
  plan.parameters
    .hard_max_per_run,
  2
);

assert.equal(
  plan.parameters
    .resource_max_per_run,
  1
);

assert.equal(
  plan.counts.selected,
  1
);

assert.equal(
  plan.budget
    .deep_check_external_requests_each,
  39
);

assert.equal(
  plan.budget
    .smart_money_external_requests_each,
  1
);

assert.equal(
  plan.budget
    .deep_check_total_external_requests_each,
  40
);

assert.equal(
  plan.budget
    .smart_money_external_requests_each,
  1
);

assert.equal(
  plan.budget
    .deep_check_total_external_requests_each,
  40
);

assert.equal(
  plan.budget
    .external_request_reserve,
  6
);

assert.equal(
  plan.budget
    .estimated_external_requests_this_run,
  44
);

assert.equal(
  plan.budget
    .within_known_external_limit,
  true
);

assert.equal(
  plan.decision.generated,
  false
);

assert.equal(
  plan.execution
    .telegram_started,
  false
);

const exactLeasePlan =
  buildBoundedDeepCheckPlan(
    planningInput,
    [],
    Date.now(),
    {
      max_per_run: 2,
      require_exact_contract:
        true,
      required_contract:
        "RAY-USDT",
      confirmed_scope_contracts:
        planningInput.shortlist.map(
          (row) => row.contract
        ),
    }
  );

assert.deepEqual(
  exactLeasePlan.selected.map(
    (row) => row.contract
  ),
  ["RAY-USDT"],
  "Fast-Move lease must override the independent fairness order"
);

assert.equal(
  exactLeasePlan.parameters
    .required_contract_status,
  "READY_EXACT_MATCH"
);

const missingLeaseIdentityPlan =
  buildBoundedDeepCheckPlan(
    planningInput,
    [],
    Date.now(),
    {
      max_per_run: 1,
      require_exact_contract:
        true,
      required_contract:
        null,
      confirmed_scope_contracts:
        planningInput.shortlist.map(
          (row) => row.contract
        ),
    }
  );

assert.equal(
  missingLeaseIdentityPlan
    .counts.selected,
  0
);

assert.equal(
  missingLeaseIdentityPlan
    .parameters
    .required_contract_status,
  "MISSING_FAIL_CLOSED"
);

const blockedLeasePlan =
  buildBoundedDeepCheckPlan(
    planningInput,
    [
      {
        contract_code:
          "RAY-USDT",
        last_started_ts:
          Date.now() - 1000,
        last_completed_ts:
          null,
        last_status:
          "RUNNING",
      },
    ],
    Date.now(),
    {
      max_per_run: 1,
      require_exact_contract:
        true,
      required_contract:
        "RAY-USDT",
      confirmed_scope_contracts:
        planningInput.shortlist.map(
          (row) => row.contract
        ),
    }
  );

assert.equal(
  blockedLeasePlan.counts.selected,
  0
);

assert.equal(
  blockedLeasePlan.parameters
    .required_contract_status,
  "NOT_READY_FAIL_CLOSED"
);

const failClosedPlan =
  buildBoundedDeepCheckPlan(
    planningInput,
    [],
    Date.now(),
    {
      max_per_run: 1,
    }
  );

assert.equal(
  failClosedPlan.counts.selected,
  0
);

assert.equal(
  failClosedPlan.scope_status,
  "UNCONFIRMED_FAIL_CLOSED"
);

const v3LiveFirstPlan = buildV3LiveHandoffPlan({
  discovery_prefilter: planningInput,
  fast_move_watch_cycle: { selected_contracts: [], selected_leases: [] },
  opportunity_journal_plan: {
    status: "SELECTED_BOUNDED_JOURNAL_MAINTENANCE",
    selected_contract: "SKYAI-USDT",
  },
});

assert.equal(v3LiveFirstPlan.lane, "LIVE_DISCOVERY");
assert.equal(v3LiveFirstPlan.require_exact_contract, false);
assert.equal(v3LiveFirstPlan.required_contract, null);
assert.equal(v3LiveFirstPlan.maintenance_deferred, true);
assert.equal(v3LiveFirstPlan.live_shortlist_count, 3);

const v3FastMovePlan = buildV3LiveHandoffPlan({
  discovery_prefilter: planningInput,
  fast_move_watch_cycle: {
    selected_contracts: ["RAY-USDT"],
    selected_leases: [{ contract: "RAY-USDT", generation: 2 }],
  },
  opportunity_journal_plan: {
    status: "SELECTED_BOUNDED_JOURNAL_MAINTENANCE",
    selected_contract: "SKYAI-USDT",
  },
});

assert.equal(v3FastMovePlan.lane, "LIVE_FAST_MOVE_RECHECK");
assert.equal(v3FastMovePlan.require_exact_contract, true);
assert.equal(v3FastMovePlan.required_contract, "RAY-USDT");
assert.equal(v3FastMovePlan.maintenance_deferred, true);

const v3MaintenancePlan = buildV3LiveHandoffPlan({
  discovery_prefilter: { shortlist: [] },
  fast_move_watch_cycle: { selected_contracts: [], selected_leases: [] },
  opportunity_journal_plan: {
    status: "SELECTED_BOUNDED_JOURNAL_MAINTENANCE",
    selected_contract: "SKYAI-USDT",
  },
});

assert.equal(v3MaintenancePlan.lane, "MAINTENANCE");
assert.equal(v3MaintenancePlan.require_exact_contract, true);
assert.equal(v3MaintenancePlan.required_contract, "SKYAI-USDT");
assert.equal(v3MaintenancePlan.maintenance_deferred, false);

const v3IdlePlan = buildV3LiveHandoffPlan({
  discovery_prefilter: { shortlist: [] },
  fast_move_watch_cycle: { selected_contracts: [], selected_leases: [] },
  opportunity_journal_plan: { status: "NOT_JOURNAL_QUOTA_SLOT" },
});
assert.equal(v3IdlePlan.lane, "IDLE");

const discoveryReadyPlan = buildBoundedDeepCheckPlan(
  planningInput,
  [],
  Date.now(),
  {
    max_per_run: 1,
    require_exact_contract: false,
    confirmed_scope_contracts: planningInput.shortlist.map((row) => row.contract),
  }
);
assert.deepEqual(
  discoveryReadyPlan.selected.map((row) => row.contract),
  ["ETHFI-USDT"],
  "V3 live discovery lane must send rank #1 first when all candidates are never checked"
);


const earlyBridgeNow = Date.now();
const earlyBase = {
  mode: "DISCOVERY_PREFILTER_RECALL_V2",
  parameters: { max_shortlist: 24 },
  shortlist: [
    { contract: "ETHFI-USDT", priority_rank: 1, anomaly_flags: ["base"], anomaly_flags_count: 1 },
    { contract: "RAY-USDT", priority_rank: 2, anomaly_flags: ["base"], anomaly_flags_count: 1 },
  ],
  counts: { shortlist: 2 },
  decision: { generated: false, probability: null, validated: false },
};
const rayStage0 = stage0Row("RAY-USDT", "CRYPTO_CONFIRMED", {
  transitions: { ...stage0Row("RAY-USDT", "CRYPTO_CONFIRMED").transitions, "24h": { price_change_pct: 8 } },
});
const ethfiStage0 = stage0Row("ETHFI-USDT", "CRYPTO_CONFIRMED", {
  transitions: { ...stage0Row("ETHFI-USDT", "CRYPTO_CONFIRMED").transitions, "24h": { price_change_pct: 2 } },
});
const bridgedDiscovery = applyEarlyCandidateBridge({
  discovery_prefilter: earlyBase,
  scan: { contracts: [ethfiStage0, rayStage0] },
  deep_check_queue: { queue: [{ contract: "ETHFI-USDT" }, { contract: "RAY-USDT" }] },
  early_rows: [{
    contract_code: "RAY-USDT",
    wave_id: "wave-ray-1",
    lifecycle_stage: "PRE_IMPULSE_WATCH",
    direction_hint: "LONG",
    direction_state: "LONG_WATCH",
    early_detection_quality_0_100: 91,
    long_evidence_domain_count: 3,
    short_evidence_domain_count: 0,
    last_seen_ts: earlyBridgeNow - 5_000,
    feature_observed_ts: earlyBridgeNow - 4_000,
    shadow_only: 1,
    evidence_refs_json: JSON.stringify([
      { domain: "VOLUME_ACCELERATION", side: "LONG", status: "CLOSED" },
      { domain: "ORDERFLOW_ABSORPTION", side: "LONG", status: "CLOSED" },
      { domain: "POSITIONING_TRAJECTORY", side: "LONG", status: "CLOSED" },
    ]),
    evidence_json: JSON.stringify([
      { domain: "VOLUME_ACCELERATION", side: "LONG", status: "CLOSED" },
      { domain: "ORDERFLOW_ABSORPTION", side: "LONG", status: "CLOSED" },
      { domain: "POSITIONING_TRAJECTORY", side: "LONG", status: "CLOSED" },
    ]),
    feature_json: JSON.stringify({ feature_fusion: { status: "CLOSED" } }),
  }],
  full_evidence_rows: [],
  early_input_status: "CLOSED",
  now: earlyBridgeNow,
});
assert.equal(bridgedDiscovery.shortlist[0].contract, "RAY-USDT", "persisted V3 early anomaly must raise operational priority");
assert.equal(bridgedDiscovery.shortlist[0].wave_id, "wave-ray-1", "existing V3 wave identity must survive the bridge");
const earlyBridgePlan = buildBoundedDeepCheckPlan(
  bridgedDiscovery,
  [],
  earlyBridgeNow,
  {
    max_per_run: 1,
    require_exact_contract: false,
    confirmed_scope_contracts: ["ETHFI-USDT", "RAY-USDT"],
  }
);
assert.deepEqual(
  earlyBridgePlan.selected.map((row) => row.contract),
  ["RAY-USDT"],
  "persisted V3 early anomaly must reach the existing bounded Deep Check scheduler"
);
assert.equal(earlyBridgePlan.selected[0]._v3_discovery_source?.wave_id, "wave-ray-1");

const allCooldownPlan = buildBoundedDeepCheckPlan(
  planningInput,
  planningInput.shortlist.map((row) => ({
    contract_code: row.contract,
    last_started_ts: Date.now() - 1000,
    last_completed_ts: Date.now() - 1000,
    last_status: "CLOSED",
  })),
  Date.now(),
  {
    max_per_run: 1,
    require_exact_contract: false,
    cooldown_sec: 1800,
    confirmed_scope_contracts: planningInput.shortlist.map((row) => row.contract),
  }
);

const cooldownReason = classifyV3LiveHandoffZeroReason({
  handoff_plan: v3LiveFirstPlan,
  bounded_deep_check: { status: "NO_READY_TARGETS", plan: allCooldownPlan },
});
assert.equal(cooldownReason, "COOLDOWN_ACTIVE");
assert.equal(
  assessV3PipelineHealth({
    handoff_plan: v3LiveFirstPlan,
    bounded_deep_check: { status: "NO_READY_TARGETS", plan: allCooldownPlan },
    zero_reason: cooldownReason,
  }).status,
  "HEALTHY_NO_IDEA"
);

assert.equal(
  assessV3PipelineHealth({
    handoff_plan: v3LiveFirstPlan,
    bounded_deep_check: { status: "NO_READY_TARGETS", plan: { counts: { selected: 0 }, blocked: [] } },
    zero_reason: null,
  }).status,
  "DEGRADED_PIPELINE",
  "nonempty LIVE shortlist without an explicit zero reason must degrade"
);

const cronCalls =
  workerSource.match(
    /await\s+runBoundedDeepCheckScheduler\s*\(/g
  ) || [];

assert.equal(
  cronCalls.length,
  1,
  "bounded executor must be wired exactly once"
);

assert.match(
  workerSource,
  /max_per_run:\s*1,/
);

assert.match(
  workerSource,
  /require_exact_contract:[\s\S]*?liveHandoffPlan[\s\S]*?require_exact_contract/
);

assert.match(
  workerSource,
  /required_contract:[\s\S]*?liveHandoffPlan[\s\S]*?required_contract/
);

assert.match(
  workerSourceRaw,
  /from "\.\/v3-live-handoff\.mjs"/
);

assert.match(
  workerSource,
  /v3_live_handoff_health/
);

assert.match(
  workerSource,
  /results\.push\(\{[\s\S]*?contract:[\s\S]*?target\.contract,[\s\S]*?run_id:[\s\S]*?runId,[\s\S]*?execution_status:/
);

assert.equal(
  deepCheckAttemptedForD1Budget({ results: [{ execution_status: "SKIPPED" }] }),
  false,
  "a skipped scheduler target must leave the legacy calibration budget available"
);

assert.equal(
  deepCheckAttemptedForD1Budget({ results: [{ execution_status: "FULFILLED" }] }),
  true,
  "a fulfilled Deep Check must reserve the conservative D1 Free envelope"
);

assert.equal(
  deepCheckAttemptedForD1Budget({ results: [{ execution_status: "ERROR" }] }),
  true,
  "a failed Deep Check may already have spent D1 queries and must reserve the envelope"
);

assert.match(workerSource, /DEFERRED_D1_FREE_QUERY_BUDGET/);
assert.match(workerSource, /const CONSERVATIVE_DEEP_CHECK_D1_QUERY_BUDGET = 48/);
assert.match(workerSource, /const LEGACY_OUTCOME_SWEEP_MAX_D1_QUERIES = 14/);

console.log(
  JSON.stringify(
    {
      ok: true,
      suite:
        "bounded-deep-check",
      assertions:
        "scope, queue, prefilter, exact Fast-Move lease binding, resource cap, fail-closed, cron wiring",
    },
    null,
    2
  )
);
