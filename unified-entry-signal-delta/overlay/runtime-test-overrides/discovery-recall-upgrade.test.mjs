import assert from "node:assert/strict";
import fs from "node:fs";

const workerPath = new URL("../src/worker.js", import.meta.url);
const raw = fs.readFileSync(workerPath, "utf8");
const source = raw.replace(
  /^import \{[\s\S]*?\} from "\.\/fast-move-watch-runtime\.mjs";\n\nimport \{[\s\S]*?\} from "\.\/opportunity-intelligence-runtime\.mjs";\n\nimport \{[\s\S]*?\} from "\.\/multi-wave-campaign-runtime\.mjs";\n\nimport \{[\s\S]*?\} from "\.\/stage392-proof-runtime\.mjs";\n\nimport \{[\s\S]*?\} from "\.\/final-decision-upstream-compat-runtime\.mjs";\n\nimport \{[\s\S]*?\} from "\.\/final-decision-integration-adapter\.mjs";\n\nimport \{[\s\S]*?\} from "\.\/final-decision-integration-runtime\.mjs";\n\nimport \{[\s\S]*?\} from "\.\/tz101-publication-runtime\.mjs";\n\nimport \{[\s\S]*?\} from "\.\/tz101-byk-proxy-policy\.mjs";\n\nimport \{[\s\S]*?\} from "\.\/tz101-smart-money-evidence\.mjs";\n\n(?:import \{[\s\S]*?\} from "\.\/public-evidence-adapters\.mjs";\n\n)?(?:import \{[\s\S]*?\} from "\.\/full-evidence-shadow-model\.mjs";\n\n)?(?:import \{[\s\S]*?\} from "\.\/htx-turnover-gate\.mjs";\n\n)?(?:import \{[\s\S]*?\} from "\.\/early-candidate-bridge\.mjs";\n\n)?(?:import \{[\s\S]*?\} from "\.\/canonical-runtime-adapter\.mjs";\n\n)?/,
  `const FAST_MOVE_WATCH_VERSION = "TEST";
   const FAST_MOVE_WATCH_STATUS = "TEST";
   const buildFastMoveDeepObservation = () => null;
   const prepareFastMoveWatchCycle = async ({ discovery_prefilter }) => ({ adaptive_discovery_prefilter: discovery_prefilter, adaptive_cooldown_sec: 1800 });
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
   const prepareFullEvidenceProofBundle = () => ({ status: "TEST" });
   const sealFullEvidenceProofBundleAfterAck = () => ({ status: "TEST" });
   const stage392ProofSafetyEnvelope = () => ({ status: "TEST" });
   const evaluateFinalDecisionUpstreamCompatibility = () => ({ status: "TEST" });
   const adaptStage391ToFinalDecisionInput = () => ({ status: "TEST" });
   const persistFinalDecisionIntegrationShadow = async () => ({ status: "TEST" });const runTz101PublicationShadow=async()=>({status:"TEST_STUB",sidecar_persisted:false}); const validateByKaranteliProxyTarget=()=>({ok:true}); const fetchByKaranteliSmartMoneyRaw=async()=>({status:"UNKNOWN",score_eligible:false,directional_vote_eligible:false}); const smartMoneyRawEvidenceRows=()=>[]; const collectPublicFullEvidenceCrossVenue=async()=>({evidence:[]}); const buildFullEvidenceShadowRecordCrossVenue=()=>({status:"TEST_STUB"}); const loadEarlyBridgeInputs=async()=>({status:"SOURCE_UNSUPPORTED",early_rows:[],full_evidence_rows:[]}); const applyEarlyCandidateBridge=({discovery_prefilter})=>discovery_prefilter; const evaluateHtxFuturesTurnoverGate=(row)=>({allowed:true,status:"CLOSED",reason:null,turnover_24h_usd_equivalent:Number(row?.turnover_24h_usdt??100000)}); const buildRuntimeCanonicalBundle=()=>({status:"TEST_STUB",canonical:{state:"OBSERVE"},telegram:{status:"TEST_STUB"},manual:{status:"TEST_STUB"},parity_fingerprint:"TEST"});\n\n`
);
assert.notEqual(source, raw);
const testable = source + `\nexport { buildDeepCheckQueue, buildDiscoveryPrefilter, compactStage0Payload };\n`;
const url = "data:text/javascript;base64," + Buffer.from(testable).toString("base64");
const { buildDeepCheckQueue, buildDiscoveryPrefilter, compactStage0Payload } = await import(url);

function row(contract, {
  turnover=500000,
  oi=250000,
  fundingPct=0.005,
  interval=4,
  p1=0,
  p4=0,
  o15=0,
  o1=0,
  o4=0,
  status="CLOSED",
  scope="CRYPTO_CONFIRMED",
  prior1=null,
  prior4=null,
}={}) {
  const fundingRate = fundingPct / 100;
  return {
    contract_code: contract,
    data_status: status,
    freshness: { stale:false, market_age_sec:5 },
    quality: {
      market_present:true,
      oi_present:true,
      funding_present:true,
      history_available:true,
    },
    symbol_fingerprint: { resolution_status:"RESOLVED_HTX_EXACT" },
    instrument_scope: { classification:scope },
    turnover_24h_usdt: turnover,
    open_interest: { value_usdt:oi, contracts:oi },
    funding: {
      funding_rate: fundingRate,
      funding_rate_pct: fundingPct,
      interval_hours: interval,
    },
    transitions: {
      "5m": { price_change_pct:p1/12, oi_change_pct:o15/3 },
      "15m": { price_change_pct:p1/4, oi_change_pct:o15 },
      "1h": { price_change_pct:p1, oi_change_pct:o1, prior_discovery:prior1 },
      "4h": { price_change_pct:p4, oi_change_pct:o4, prior_discovery:prior4 },
    },
  };
}

const contracts = [
  row("BTC-USDT", {turnover:9e9,oi:5e9,fundingPct:-0.0091,interval:8,p1:0.20,p4:1.2,o1:-1,o4:-2}),
  row("ETH-USDT", {turnover:6e9,oi:4e9,fundingPct:-0.0088,interval:8,p1:0.25,p4:1.0,o1:-1,o4:-2}),
  row("STEEM-USDT", {turnover:860000,oi:43682,fundingPct:-0.5276,interval:4,p1:0.65,p4:2.63,o15:0.2,o1:0.06,o4:3.53}),
  row("BEAT-USDT", {turnover:213000,oi:136465,fundingPct:0.03216,interval:4,p1:-0.59,p4:5.42,o15:-0.4,o1:-0.4,o4:0.3}),
  row("EARLY-USDT", {turnover:180000,oi:110000,fundingPct:-0.015,interval:4,p1:1.4,p4:3.5,o15:0.8,o1:1.5,o4:2.7}),
  row("MISSED-USDT", {turnover:160000,oi:100000,fundingPct:0.001,interval:4,p1:4.2,p4:6.5,o1:0.1,o4:0.1,prior1:{long_watch:false,short_watch:false},prior4:{long_watch:false,short_watch:false}}),
  row("NOINTERVAL-USDT", {turnover:220000,oi:120000,fundingPct:0.6,interval:null,p1:0,p4:0,o1:0,o4:0}),
  row("PARTIAL-USDT", {turnover:2e6,oi:2e6,fundingPct:-1,interval:4,p1:8,p4:10,o1:10,o4:20,status:"PARTIAL"}),
];
for (let i=0;i<12;i++) {
  contracts.push(row(`FILL${i}-USDT`, {
    turnover: 250000 + i*120000,
    oi: 150000 + i*80000,
    fundingPct: 0.004 + i*0.0002,
    interval: 4,
    p1: (i%3-1)*0.2,
    p4: (i%4-2)*0.3,
    o1: (i%3)*0.15,
    o4: (i%4)*0.25,
  }));
}
const scan = {timestamp:Date.now(), contracts};
const queue = buildDeepCheckQueue(scan);
assert.ok(!queue.queue.some(x=>x.contract==="PARTIAL-USDT"), "PARTIAL must remain fail-closed");

const discovery = buildDiscoveryPrefilter(scan, queue, {
  liquidity_percentile:0.70,
  early_liquidity_percentile:0.45,
  anomaly_percentile:0.95,
  early_anomaly_percentile:0.80,
  funding_percentile:0.95,
  funding_tail_percentile:0.10,
  min_anomaly_flags:2,
  min_early_flags:2,
  max_shortlist:24,
});

const by = new Map(discovery.shortlist.map(x=>[x.contract,x]));
assert.equal(discovery.mode, "MULTI_ENGINE_RECALL_SHADOW_V1");
assert.equal(discovery.semantics, "DISCOVERY_ONLY_NOT_PROBABILITY_NOT_TRADE_SIGNAL");
assert.equal(discovery.decision.generated, false);
assert.equal(discovery.decision.probability, null);
assert.equal(discovery.decision.validated, false);
assert.equal(discovery.execution.network_calls_generated, 0);
assert.equal(discovery.execution.d1_calls_generated, 0);

assert.ok(by.has("STEEM-USDT"), "STEEM must enter discovery shortlist");
assert.equal(by.get("STEEM-USDT").long_watch, true, "STEEM must be a Long discovery watch, not a final signal");
assert.ok(by.get("STEEM-USDT").model_routes.some(x=>x.startsWith("LONG_")));

assert.ok(by.has("BEAT-USDT"), "BEAT funding anomaly must remain discoverable");
assert.equal(by.get("BEAT-USDT").short_watch, false, "funding sign alone must not choose Short direction");
assert.equal(by.get("BEAT-USDT").long_watch, false, "funding sign alone must not choose Long direction");
assert.equal(by.get("BEAT-USDT").funding_context_only, true);
assert.equal(by.get("BEAT-USDT").funding_directional_vote, false);
assert.ok(!by.get("BEAT-USDT").model_routes.some(x=>x.startsWith("SHORT_")||x.startsWith("LONG_")));

assert.ok(by.has("EARLY-USDT"), "early RS/OI candidate must be discoverable before top-5% strict anomaly");
assert.equal(by.get("EARLY-USDT").long_watch, true);

const noInterval = discovery.contract_telemetry.find(x=>x.contract==="NOINTERVAL-USDT");
assert.ok(noInterval);
assert.equal(noInterval.long_watch, false, "missing funding interval cannot fabricate Long funding route");
assert.equal(noInterval.short_watch, false, "missing funding interval cannot fabricate Short funding route");

assert.ok(discovery.false_negative_audit.some(x=>x.contract==="MISSED-USDT"), "prospective false-negative audit must capture a missed strong move");
assert.equal(discovery.benchmark.btc_eth_1h.coverage, 2);
assert.equal(discovery.benchmark.btc_eth_4h.coverage, 2);

for (const c of contracts) {
  const t = discovery.contract_telemetry.find(x=>x.contract===c.contract_code);
  c.discovery_shadow = t ? {
    long_watch:t.long_watch,
    short_watch:t.short_watch,
    long_trigger_count:t.model_routes.filter(x=>x.startsWith("LONG_")).length,
    short_trigger_count:t.model_routes.filter(x=>x.startsWith("SHORT_")).length,
  } : null;
}
const compact = compactStage0Payload(scan);
assert.equal(compact.schema, "stage0-compact-v2");
const steemCompact = compact.contracts.find(x=>x[0]==="STEEM-USDT");
assert.equal(steemCompact.length, 13);
assert.equal(steemCompact[9], true);
assert.equal(steemCompact[10], false);

console.log(JSON.stringify({
  ok:true,
  suite:"discovery-recall-upgrade",
  technical_eligible:queue.counts.eligible,
  shortlist:discovery.counts.shortlist,
  long_watch:discovery.counts.long_watch,
  short_watch:discovery.counts.short_watch,
  false_negative_candidates:discovery.counts.false_negative_candidates,
  fixtures:{
    STEEM:by.get("STEEM-USDT")?.discovery_direction_hint,
    BEAT:by.get("BEAT-USDT")?.discovery_direction_hint,
    EARLY:by.get("EARLY-USDT")?.discovery_direction_hint,
  },
  safety:{probability:discovery.decision.probability,validated:discovery.decision.validated,network_calls_generated:discovery.execution.network_calls_generated,d1_calls_generated:discovery.execution.d1_calls_generated}
},null,2));
