import assert from "node:assert/strict";
import fs from "node:fs";

const workerPath = new URL("../src/worker.js", import.meta.url);
const raw = fs.readFileSync(workerPath, "utf8");
const source = raw.replace(
  /^import \{[\s\S]*?\} from "\.\/fast-move-watch-runtime\.mjs";\n\nimport \{[\s\S]*?\} from "\.\/opportunity-intelligence-runtime\.mjs";\n\nimport \{[\s\S]*?\} from "\.\/multi-wave-campaign-runtime\.mjs";\n\nimport \{[\s\S]*?\} from "\.\/stage392-proof-runtime\.mjs";\n\nimport \{[\s\S]*?\} from "\.\/final-decision-upstream-compat-runtime\.mjs";\n\nimport \{[\s\S]*?\} from "\.\/final-decision-integration-adapter\.mjs";\n\nimport \{[\s\S]*?\} from "\.\/final-decision-integration-runtime\.mjs";\n\nimport \{[\s\S]*?\} from "\.\/tz101-publication-runtime\.mjs";\n\nimport \{[\s\S]*?\} from "\.\/tz101-byk-proxy-policy\.mjs";\n\nimport \{[\s\S]*?\} from "\.\/tz101-smart-money-evidence\.mjs";\n\n(?:import \{[\s\S]*?\} from "\.\/public-evidence-adapters\.mjs";\n\n)?(?:import \{[\s\S]*?\} from "\.\/full-evidence-shadow-model\.mjs";\n\n)?(?:import \{[\s\S]*?\} from "\.\/htx-turnover-gate\.mjs";\n\n)?(?:import \{[\s\S]*?\} from "\.\/early-candidate-bridge\.mjs";\n\n)?(?:import \{[\s\S]*?\} from "\.\/canonical-runtime-adapter\.mjs";\n\n)?(?:import \{[\s\S]*?\} from "\.\/source-registry\.mjs";\n\n)?/,
  `const FAST_MOVE_WATCH_VERSION = "TEST";
   const FAST_MOVE_WATCH_STATUS = "TEST";
   const buildFastMoveDeepObservation = () => null;
   const prepareFastMoveWatchCycle = async () => ({});
   const finalizeFastMoveWatchCycle = async () => ({});
   const fastMoveWatchDataPlaneSummary = async () => ({});
   const OPPORTUNITY_VERSION = "TEST";
   const buildOpportunityJournalPrefilter = (x) => x;
   const opportunityDataPlaneSummary = async () => ({});
   const runOpportunityShadowCycle = async () => ({});
   const selectOpportunityJournalCandidate = async () => ({status:"NO"});
   const MULTI_WAVE_VERSION = "TEST";
   const multiWaveCampaignDataPlaneSummary = async () => ({});
   const runMultiWaveCampaignShadowCycle = async () => ({});
   const prepareFullEvidenceProofBundle = () => ({ status: "TEST_STUB" });
   const sealFullEvidenceProofBundleAfterAck = () => ({ status: "TEST_STUB" });
   const stage392ProofSafetyEnvelope = () => ({ status: "TEST_STUB" });
   const evaluateFinalDecisionUpstreamCompatibility = () => ({ status: "TEST_STUB" });
   const adaptStage391ToFinalDecisionInput = () => ({ status: "TEST_STUB" });
   const persistFinalDecisionIntegrationShadow = async () => ({ status: "TEST_STUB" });const runTz101PublicationShadow=async()=>({status:"TEST_STUB",sidecar_persisted:false}); const validateByKaranteliProxyTarget=()=>({ok:true}); const fetchByKaranteliSmartMoneyRaw=async()=>({status:"UNKNOWN",score_eligible:false,directional_vote_eligible:false}); const smartMoneyRawEvidenceRows=()=>[]; const collectPublicFullEvidenceCrossVenue=async()=>({evidence:[]}); const buildFullEvidenceShadowRecordCrossVenue=()=>({status:"TEST_STUB"}); const loadEarlyBridgeInputs=async()=>({status:"SOURCE_UNSUPPORTED",early_rows:[],full_evidence_rows:[]}); const applyEarlyCandidateBridge=({discovery_prefilter})=>discovery_prefilter; const evaluateHtxFuturesTurnoverGate=(row)=>({allowed:true,status:"CLOSED",reason:null,turnover_24h_usd_equivalent:Number(row?.turnover_24h_usdt??100000)}); const buildRuntimeCanonicalBundle=()=>({status:"TEST_STUB",canonical:{state:"OBSERVE"},telegram:{status:"TEST_STUB"},manual:{status:"TEST_STUB"},parity_fingerprint:"TEST"}); const buildFreeSourceRuntimeSummary=()=>({status:"TEST_STUB",sources:[],configured_sources:0,material_gaps:[],external_hot_request_delta:0,d1_write_delta_hot:0,continuous_collector_status:"PARTIAL_REALTIME_COVERAGE"});\n\n`,
);
assert.notEqual(source, raw, "worker import adapter must match once");

const moduleUrl = "data:text/javascript;base64," +
  Buffer.from(source + "\nexport { futuresTrajectory };\n").toString("base64");
const { futuresTrajectory } = await import(moduleUrl);

const now = Date.now();
const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;
const calls = [];

function response(data) {
  return {
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify(data);
    },
  };
}

const previousFetch = globalThis.fetch;
globalThis.fetch = async (input) => {
  const url = String(input);
  calls.push(url);
  if (url.includes("swap_contract_info")) {
    return response({
      status: "ok",
      data: [{
        contract_code: "LSK-USDT",
        symbol: "LSK",
        contract_size: 1,
        contract_status: 1,
      }],
    });
  }
  if (url.includes("/market/history/kline") && url.includes("period=60min")) {
    return response({
      status: "ok",
      data: Array.from({ length: 10 }, (_, index) => ({
        id: Math.floor((now - (index + 2) * hour) / 1000),
        open: 100,
        high: 102,
        low: 98,
        close: 101,
        vol: 10 + index,
        amount: 10 + index,
        count: 1,
      })),
    });
  }
  if (url.includes("/market/history/kline") && url.includes("period=15min")) {
    return response({
      status: "ok",
      data: Array.from({ length: 40 }, (_, index) => ({
        id: Math.floor((now - (index + 2) * 15 * minute) / 1000),
        open: 100,
        high: 102,
        low: 98,
        close: 101,
        vol: 4 + index,
        amount: 4 + index,
        count: 1,
      })),
    });
  }
  if (url.includes("period=1day")) {
    return response({
      status: "ok",
      data: Array.from({ length: 10 }, (_, index) => ({
        id: Math.floor((now - (index + 2) * day) / 1000),
        open: 100,
        high: 103,
        low: 97,
        close: 101,
        vol: 100 + index,
        amount: 100 + index,
        count: 1,
      })),
    });
  }
  if (url.includes("period=1min")) {
    return response({
      status: "ok",
      data: Array.from({ length: 30 }, (_, index) => ({
        id: Math.floor((now - (index + 2) * minute) / 1000),
        open: 100,
        high: 101,
        low: 99,
        close: 100.5,
        vol: 1,
        amount: 1,
        count: 1,
      })),
    });
  }
  if (url.includes("history/trade")) {
    return response({ status: "ok", data: [] });
  }
  if (url.includes("swap_his_open_interest")) {
    return response({ status: "ok", data: { tick: [] } });
  }
  if (url.includes("swap_open_interest")) {
    return response({ status: "ok", data: [] });
  }
  if (url.includes("swap_funding_rate")) {
    return response({ status: "ok", data: null });
  }
  if (url.includes("swap_historical_funding_rate")) {
    return response({ status: "ok", data: { data: [] } });
  }
  throw new Error(`unmocked URL: ${url}`);
};

try {
  const result = await futuresTrajectory({
    contract: "LSK-USDT",
    kline_size: 1600,
    trades: 2000,
  });
  assert.equal(calls.length, 11, "trajectory must have an exact 11-call logical budget");
  assert.equal(calls.filter((url) => url.includes("/market/history/kline") && url.includes("period=60min")).length, 1);
  assert.equal(calls.filter((url) => url.includes("period=1day")).length, 1);
  assert.ok(result._opportunity_shadow_inputs.one_minute.length >= 1);
  assert.ok(result._opportunity_shadow_inputs.fifteen_minute.length >= 1);
  assert.ok(result._opportunity_shadow_inputs.one_hour.length >= 1);
  assert.ok(result._opportunity_shadow_inputs.one_day.length >= 1);
  assert.equal(
    Object.prototype.propertyIsEnumerable.call(result, "_opportunity_shadow_inputs"),
    false,
  );
  assert.equal(JSON.stringify(result).includes("_opportunity_shadow_inputs"), false);
  assert.equal(result.version, "1.2-opportunity-integrity-inputs");
  assert.equal(result.health.price_15m_native, true);
  assert.equal(result.health.price_1h_native, true);
  assert.equal(result.health.price_1d_native, true);
} finally {
  globalThis.fetch = previousFetch;
}

console.log(JSON.stringify({
  ok: true,
  suite: "worker-opportunity-inputs",
  assertions: "exact 11-call trajectory budget, closed HTX 1m/15m/1h/1d inputs, non-enumerable raw series",
}, null, 2));
