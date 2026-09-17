import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("../src/", import.meta.url);
const stubImports = (raw) => raw.replace(
  /^import \{[\s\S]*?\} from "\.\/fast-move-watch-runtime\.mjs";\n\nimport \{[\s\S]*?\} from "\.\/opportunity-intelligence-runtime\.mjs";\n\nimport \{[\s\S]*?\} from "\.\/multi-wave-campaign-runtime\.mjs";\n\nimport \{[\s\S]*?\} from "\.\/stage392-proof-runtime\.mjs";\n\nimport \{[\s\S]*?\} from "\.\/final-decision-upstream-compat-runtime\.mjs";\n\nimport \{[\s\S]*?\} from "\.\/final-decision-integration-adapter\.mjs";\n\nimport \{[\s\S]*?\} from "\.\/final-decision-integration-runtime\.mjs";\n\n(?:import \{[\s\S]*?\} from "\.\/tz101-publication-runtime\.mjs";\n\n)?(?:import \{[\s\S]*?\} from "\.\/tz101-byk-proxy-policy\.mjs";\n\n)?(?:import \{[\s\S]*?\} from "\.\/tz101-smart-money-evidence\.mjs";\n\n)?/,
  `const FAST_MOVE_WATCH_VERSION="TEST";const FAST_MOVE_WATCH_STATUS="TEST";const buildFastMoveDeepObservation=()=>null;const prepareFastMoveWatchCycle=async({discovery_prefilter})=>({adaptive_discovery_prefilter:discovery_prefilter});const finalizeFastMoveWatchCycle=async()=>({});const fastMoveWatchDataPlaneSummary=async()=>({});const OPPORTUNITY_VERSION="TEST";const buildOpportunityJournalPrefilter=x=>x;const opportunityDataPlaneSummary=async()=>({});const runOpportunityShadowCycle=async()=>({});const selectOpportunityJournalCandidate=async()=>({status:"NO"});const MULTI_WAVE_VERSION="TEST";const multiWaveCampaignDataPlaneSummary=async()=>({});const runMultiWaveCampaignShadowCycle=async()=>({});const prepareFullEvidenceProofBundle=()=>({});const sealFullEvidenceProofBundleAfterAck=()=>({});const stage392ProofSafetyEnvelope=()=>({});const evaluateFinalDecisionUpstreamCompatibility=()=>({});const adaptStage391ToFinalDecisionInput=()=>({});const persistFinalDecisionIntegrationShadow=async()=>({});const runTz101PublicationShadow=async()=>({status:"TEST_STUB",sidecar_persisted:false});const validateByKaranteliProxyTarget=()=>({allowed:true});const fetchByKaranteliSmartMoneyRaw=async()=>({status:"NOT_CLOSED",external_fetches:0,score_eligible:false,directional_vote_eligible:false});const smartMoneyRawEvidenceRows=()=>[];\n\n`
);
async function load(name){
  const raw=fs.readFileSync(new URL(name,root),"utf8");
  const src=stubImports(raw)+`\nexport {buildDeepCheckQueue,buildDiscoveryPrefilter};\n`;
  return import("data:text/javascript;base64,"+Buffer.from(src).toString("base64"));
}
const oldM=await load("worker.BACKUP-stage392-authoritative-before-discovery-recall.js");
const newM=await load("worker.js");
function row(contract,{turnover=500000,oi=250000,fundingPct=0.005,interval=4,p1=0,p4=0,o15=0,o1=0,o4=0}={}){
 return {contract_code:contract,data_status:"CLOSED",freshness:{stale:false,market_age_sec:5},quality:{market_present:true,oi_present:true,funding_present:true,history_available:true},symbol_fingerprint:{resolution_status:"RESOLVED_HTX_EXACT"},instrument_scope:{classification:"CRYPTO_CONFIRMED"},turnover_24h_usdt:turnover,open_interest:{value_usdt:oi,contracts:oi},funding:{funding_rate:fundingPct/100,funding_rate_pct:fundingPct,interval_hours:interval},transitions:{"5m":{price_change_pct:p1/12,oi_change_pct:o15/3},"15m":{price_change_pct:p1/4,oi_change_pct:o15},"1h":{price_change_pct:p1,oi_change_pct:o1},"4h":{price_change_pct:p4,oi_change_pct:o4}}};
}
const contracts=[
 row("BTC-USDT",{turnover:9e9,oi:5e9,fundingPct:-0.0091,interval:8,p1:.2,p4:1.2,o1:-1,o4:-2}),
 row("ETH-USDT",{turnover:6e9,oi:4e9,fundingPct:-0.0088,interval:8,p1:.25,p4:1,o1:-1,o4:-2}),
 row("STEEM-USDT",{turnover:860000,oi:43682,fundingPct:-0.5276,interval:4,p1:.65,p4:2.63,o15:.2,o1:.06,o4:3.53}),
 row("BEAT-USDT",{turnover:213000,oi:136465,fundingPct:.03216,interval:4,p1:-.59,p4:5.42,o15:-.4,o1:-.4,o4:.3}),
 row("EARLY-USDT",{turnover:180000,oi:110000,fundingPct:-.015,interval:4,p1:1.4,p4:3.5,o15:.8,o1:1.5,o4:2.7}),
];
for(let i=0;i<20;i++) contracts.push(row(`FILL${i}-USDT`,{turnover:400000+i*130000,oi:220000+i*90000,fundingPct:.004+i*.0002,interval:4,p1:(i%3-1)*.15,p4:(i%4-2)*.25,o1:(i%3)*.1,o4:(i%4)*.2}));
const scan={contracts};
const oldQ=oldM.buildDeepCheckQueue(scan), newQ=newM.buildDeepCheckQueue(scan);
const oldD=oldM.buildDiscoveryPrefilter(scan,oldQ,{liquidity_percentile:.70,anomaly_percentile:.95,funding_percentile:.95,min_anomaly_flags:2,max_shortlist:12});
const newD=newM.buildDiscoveryPrefilter(scan,newQ,{liquidity_percentile:.70,early_liquidity_percentile:.45,anomaly_percentile:.95,early_anomaly_percentile:.80,funding_percentile:.95,funding_tail_percentile:.10,min_anomaly_flags:2,min_early_flags:2,max_shortlist:24});
const oldSet=new Set(oldD.shortlist.map(x=>x.contract)); const newSet=new Set(newD.shortlist.map(x=>x.contract));
for(const x of ["STEEM-USDT","BEAT-USDT","EARLY-USDT"]){ assert.equal(oldSet.has(x),false,`${x} should demonstrate old recall miss in this fixture`); assert.equal(newSet.has(x),true,`${x} should be recovered by new discovery`); }
assert.ok(newD.shortlist.length>oldD.shortlist.length);
assert.equal(newD.decision.generated,false); assert.equal(newD.decision.probability,null); assert.equal(newD.execution.network_calls_generated,0); assert.equal(newD.execution.d1_calls_generated,0);
console.log(JSON.stringify({ok:true,suite:"discovery-recall-ab",old_shortlist_count:oldD.shortlist.length,new_shortlist_count:newD.shortlist.length,recovered:["STEEM-USDT","BEAT-USDT","EARLY-USDT"],old_shortlist:oldD.shortlist.map(x=>x.contract),new_top:newD.shortlist.slice(0,10).map(x=>({contract:x.contract,hint:x.discovery_direction_hint,routes:x.model_routes}))},null,2));
