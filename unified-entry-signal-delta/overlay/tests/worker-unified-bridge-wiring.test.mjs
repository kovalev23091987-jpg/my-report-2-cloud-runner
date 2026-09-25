import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const raw=fs.readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');

test('worker actually consumes turnover gate, early bridge and canonical runtime bundle',()=>{
  assert.match(raw,/evaluateHtxFuturesTurnoverGate\(\s*row\s*\)/);
  assert.match(raw,/await loadEarlyBridgeInputs\(/);
  assert.match(raw,/applyEarlyCandidateBridge\(\{/);
  assert.match(raw,/discovery_row:\s*target\?\._v3_discovery_source/);
  assert.match(raw,/buildRuntimeCanonicalBundle\(\{/);
  assert.match(raw,/canonical_analytical_bundle:\s*canonicalAnalyticalBundle/);
});

async function testableWorker(){
  const marker='const STAGE392_SHADOW_INTEGRATION_VERSION';
  const i=raw.indexOf(marker);assert.ok(i>0);
  const body=raw.slice(i);
  const stubs=`
const FAST_MOVE_WATCH_VERSION='T',FAST_MOVE_WATCH_STATUS='T';
const buildFastMoveDeepObservation=()=>null,prepareFastMoveWatchCycle=async({discovery_prefilter})=>({adaptive_discovery_prefilter:discovery_prefilter}),finalizeFastMoveWatchCycle=async()=>({}),fastMoveWatchDataPlaneSummary=async()=>({});
const OPPORTUNITY_VERSION='T',buildOpportunityJournalPrefilter=x=>x,opportunityDataPlaneSummary=async()=>({}),runOpportunityShadowCycle=async()=>({}),selectOpportunityJournalCandidate=async()=>({status:'NO'});
const MULTI_WAVE_VERSION='T',multiWaveCampaignDataPlaneSummary=async()=>({}),runMultiWaveCampaignShadowCycle=async()=>({});
const prepareTz101DecisionEvidence=()=>[],prepareHtxExecutionFacts=()=>({}),checkExecutionHandoff=()=>({}),prepareFullEvidenceProofBundle=()=>({}),sealFullEvidenceProofBundleAfterAck=()=>({}),stage392ProofSafetyEnvelope=()=>({});
const evaluateFinalDecisionUpstreamCompatibility=()=>({}),buildV3LiveHandoffPlan=()=>({}),buildDiscoveryHandoffEnvelope=()=>({}),classifyV3LiveHandoffZeroReason=()=>({}),assessV3PipelineHealth=()=>({});
const adaptStage391ToFinalDecisionInput=()=>({}),persistFinalDecisionIntegrationShadow=async()=>({}),runTz101PublicationShadow=async()=>({});
const validateByKaranteliProxyTarget=()=>({allowed:true}),fetchByKaranteliSmartMoneyRaw=async()=>({}),smartMoneyRawEvidenceRows=()=>[];
const collectPublicFullEvidenceCrossVenue=async()=>({evidence:[]}),buildFullEvidenceShadowRecordCrossVenue=()=>({});
const evaluateHtxFuturesTurnoverGate=(row)=>{const v=Number(row?.turnover_24h_usdt);const exact=row?.symbol_fingerprint?.resolution_status==='RESOLVED_HTX_EXACT';const tradable=row?.quality?.market_present===true&&row?.instrument_scope?.classification==='CRYPTO_CONFIRMED';const fresh=row?.freshness?.stale===false&&Number(row?.freshness?.market_age_sec)<=300;if(!exact||!tradable||!fresh||!Number.isFinite(v))return {status:'NOT_CLOSED',allowed:false,reason:'NOT_CLOSED'};return {status:'CLOSED',allowed:v>=100000,reason:v>=100000?'PASS':'HTX_FUTURES_24H_TURNOVER_BELOW_100K',turnover_usd_equivalent:v};};
const loadEarlyBridgeInputs=async()=>({status:'CLOSED',early_rows:[],full_evidence_rows:[]}),applyEarlyCandidateBridge=({discovery_prefilter})=>discovery_prefilter,buildRuntimeCanonicalBundle=()=>({status:'CLOSED'});
`;
  const source=stubs+body+`\nexport {buildDeepCheckQueue,buildDiscoveryPrefilter};`;
  return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
}
function row(contract,turnover){return {contract_code:contract,data_status:'CLOSED',freshness:{stale:false,market_age_sec:5},quality:{market_present:true,oi_present:true,funding_present:true,history_available:true},symbol_fingerprint:{resolution_status:'RESOLVED_HTX_EXACT'},instrument_scope:{classification:'CRYPTO_CONFIRMED'},turnover_24h_usdt:turnover,open_interest:{value_usdt:200000},funding:{funding_rate_pct:0.01,interval_hours:4},transitions:{'5m':{price_change_pct:0,oi_change_pct:0},'15m':{price_change_pct:0,oi_change_pct:0},'1h':{price_change_pct:1,oi_change_pct:1},'4h':{price_change_pct:1,oi_change_pct:1},'24h':{price_change_pct:1}}};}

test('worker queue enforces inclusive 100k gate before discovery',async()=>{
  const {buildDeepCheckQueue,buildDiscoveryPrefilter}=await testableWorker();
  const scan={contracts:[row('LOW-USDT',99999),row('EDGE-USDT',100000),row('HIGH-USDT',100001)]};
  const q=buildDeepCheckQueue(scan);
  assert.deepEqual(q.queue.map(x=>x.contract),['EDGE-USDT','HIGH-USDT']);
  assert.ok(q.excluded.find(x=>x.contract==='LOW-USDT')?.reasons.includes('HTX_FUTURES_24H_TURNOVER_BELOW_100K'));
  const d=buildDiscoveryPrefilter(scan,q,{liquidity_percentile:.5,early_liquidity_percentile:.2,anomaly_percentile:.8,early_anomaly_percentile:.65,min_anomaly_flags:1,min_early_flags:2,max_shortlist:24});
  assert.equal(d.contract_telemetry.some(x=>x.contract==='LOW-USDT'),false);
});
