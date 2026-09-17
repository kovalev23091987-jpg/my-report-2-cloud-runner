import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { prepareTz101DecisionEvidence } from '../src/tz101-decision-evidence-producer.mjs';
import { buildOpportunityProofFromAdmissionWitness, prepareFullEvidenceProofBundle, sealFullEvidenceProofBundleAfterAck, buildDecisionEvidenceRegistry } from '../src/stage392-proof-runtime.mjs';
import { buildFinalDecisionIntegrationShadow } from '../src/final-decision-integration-engine.mjs';
import { opportunity, completeInput, fullEvidence, NOW, CONTRACT, SNAPSHOT } from './final-decision-integration-fixtures.mjs';
import { digest, immutableReceipt } from '../src/upstream-proof-utils.mjs';

// Real local Worker functions, not hand-labelled "complete" aggregate mocks.
const source = fs.readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8')
  .replace(/from "(\.\/[^"\n]+\.mjs)"/g, (_, p) => `from ${JSON.stringify(new URL('../src/' + p.slice(2), import.meta.url).href)}`);
const api = await import('data:text/javascript;base64,' + Buffer.from(source + '\nexport {buildTrajectoryWindow, buildDeepCheckInput};').toString('base64'));
const END = NOW - 60_000, START = END - 5 * 60_000;
function fixture(side = 'LONG') {
  const rawAnalysis = structuredClone(opportunity(side));
  const event = structuredClone(rawAnalysis.newest_event);
  event.independent_sample = true;
  const proof = buildOpportunityProofFromAdmissionWitness({
    analysis:{...rawAnalysis,newest_event:event},
    witness:{event,event_id:event.event_id,persisted_ts:event.event_close_ts+500,control_group:false,independent_sample:true,
      directional_evaluation_eligible:true,d1_acknowledged:true,immutable_row:true,episode_revision:1,
      raw_event_digest:digest({episode_revision:1,event})},
    snapshot_id:SNAPSHOT,observed_ts:NOW,receipt_committed_ts:NOW-100,
  });
  assert.equal(proof.status, 'CLOSED');
  const close = side === 'LONG' ? 101 : 99;
  const bars = Array.from({length:5},(_,i)=>({ts:START+i*60_000,open:100,high:101,low:99,close,
    volume_contracts:1,volume_base:1,turnover_usdt:100,trade_count:2}));
  const trades = Array.from({length:10},(_,i)=>({'trade-id':`T${i}`,ts:START+i*30_000,
    direction:side==='LONG'?'buy':'sell',amount:1,quantity:1,price:100,trade_turnover:100}));
  const w = api.buildTrajectoryWindow({label:'5m',startMs:START,endMs:END,klines:bars,orderedTrades:trades,contractSize:1,minTrades:5,oi:null});
  assert.equal(w.order_flow.cvd_delta_reliable,true);
  return {contract_code:CONTRACT,snapshot_id:SNAPSHOT,observed_ts:NOW,available_ts:NOW-50,
    opportunity_proof:proof.proof,trajectory:{contract:CONTRACT,market:'HTX USDT-M Futures',tool:'htx_futures_trajectory',source:'HTX official public API',
      contract_info:{contract_code:CONTRACT,contract_status:1,contract_size:1},windows:{'5m':w}}};
}
const mutateProof = (f, edit) => {const p=structuredClone(f.opportunity_proof); edit(p); f.opportunity_proof=immutableReceipt(p,p.persistence.receipt_id,NOW-100);};
for (const side of ['LONG','SHORT']) test(`actual worker aggregate + real opportunity producer: ${side}`,()=>{
  const f=fixture(side), r=prepareTz101DecisionEvidence(f);
  assert.equal(r.status,'PREPARED_UNACKNOWLEDGED',JSON.stringify(r));
  assert.equal(r.rows.length,1); assert.equal(r.rows[0].stance,side);
  assert.equal(r.complete_direction,false); assert.equal(r.rows[0].registry_receipt_id,null);
  assert.deepEqual(r.independent_domains,['PRICE_ACTION']);
  const built=prepareFullEvidenceProofBundle({record:fullEvidence(),contract_code:CONTRACT,snapshot_id:SNAPSHOT,observed_ts:NOW,
    shadow_decision:{eq:{status:'OK'}},opportunity_proof:f.opportunity_proof,decision_evidence:r.rows,decision_evidence_audit:r,committed_ts:NOW});
  assert.equal(built.status,'PREPARED_UNACKNOWLEDGED');
  for(const ack of [{status:'CLOSED',persisted:true,changes:0},{status:'CLOSED',persisted:true,changes:2},{status:'CLOSED',persisted:false,changes:1}]) assert.equal(sealFullEvidenceProofBundleAfterAck(built,ack).status,'FAIL_CLOSED');
  const sealed=sealFullEvidenceProofBundleAfterAck(built,{status:'CLOSED',persisted:true,changes:1});
  assert.equal(sealed.status,'CLOSED');
  assert.equal(sealed.bundle.decision_evidence.length,1);
  assert.deepEqual(sealed.bundle.decision_evidence_audit,r);
  const rows=sealed.bundle.decision_evidence;
  assert.equal(rows[0].registry_receipt_id,sealed.bundle.evidence_registry.receipt_id);
  const engineInput={...completeInput(side),decision_evidence:rows,
    evidence_registry:sealed.bundle.evidence_registry,opportunity:f.opportunity_proof};
  engineInput.campaign=immutableReceipt(engineInput.campaign,engineInput.campaign.persistence.receipt_id,NOW-50);
  const evaluated=buildFinalDecisionIntegrationShadow(engineInput);
  assert.equal(evaluated.evidence_independence.raw_usable_evidence_count,1);
  assert.equal(evaluated.evidence_independence.causal_domains.PRICE_ACTION.state,side);
  assert.ok(!evaluated.reason_codes.includes('OPPORTUNITY_RAW_EVENT_DIGEST_MISMATCH'));
  assert.ok(!evaluated.reason_codes.includes('OPPORTUNITY_FULL_EVENT_PROJECTION_MISMATCH'));
  assert.equal(evaluated.source_quality.opportunity, 'CLOSED');
  assert.notEqual(evaluated.entry_action,'SHADOW_ENTRY_ELIGIBLE','single domain must never be a full entry');
  assert.equal(evaluated.execution_authorized,false);
  assert.equal(evaluated.telegram_eligible,false);
  assert.equal(evaluated.live_probability,null);
  fs.mkdirSync(new URL('../verification/',import.meta.url),{recursive:true});
  fs.writeFileSync(new URL(`../verification/producer_${side}_engine.json`,import.meta.url),JSON.stringify(evaluated,null,2));
});
const invalid = {
  'missing availability': f=>delete f.available_ts,
  'future availability': f=>f.available_ts=NOW+1,
  'future window': f=>{const w=f.trajectory.windows['5m'];w.synchronized_window_end_ts=NOW+1;},
  'missing factual count': f=>f.trajectory.windows['5m'].order_flow.cvd_delta_quality.factual_1m_trade_count=null,
  'count differs although flagged complete': f=>f.trajectory.windows['5m'].order_flow.cvd_delta_quality.raw_trade_count=9,
  'non exact minute grid': f=>f.trajectory.windows['5m'].price.exact_1m_bars=false,
  'duplicated trades': f=>f.trajectory.windows['5m'].order_flow.cvd_delta_quality.record_integrity.complete=false,
  'duplicate count despite complete label': f=>f.trajectory.windows['5m'].order_flow.cvd_delta_quality.record_integrity.duplicate_trade_id_count=1,
  'missing duplicate count is not zero': f=>delete f.trajectory.windows['5m'].order_flow.cvd_delta_quality.record_integrity.duplicate_trade_id_count,
  'invalid payload despite complete label': f=>f.trajectory.windows['5m'].order_flow.cvd_delta_quality.record_integrity.invalid_payload_count=1,
  'source truncated despite complete label': f=>f.trajectory.windows['5m'].order_flow.cvd_delta_quality.record_integrity.source_truncated=true,
  'source rows dropped despite complete label': f=>f.trajectory.windows['5m'].order_flow.cvd_delta_quality.record_integrity.source_rows_dropped=1,
  'unique IDs differ despite complete label': f=>f.trajectory.windows['5m'].order_flow.cvd_delta_quality.record_integrity.unique_trade_ids=9,
  'raw records differ despite complete label': f=>f.trajectory.windows['5m'].order_flow.cvd_delta_quality.record_integrity.raw_records=9,
  'completeness ratio inconsistent': f=>f.trajectory.windows['5m'].order_flow.cvd_delta_quality.completeness_ratio=0.9,
  'flow boundaries differ': f=>f.trajectory.windows['5m'].order_flow.window_start_ts+=60_000,
  'null price': f=>f.trajectory.windows['5m'].price.close=null,
  'boolean price': f=>f.trajectory.windows['5m'].price.close=true,
  'string price': f=>f.trajectory.windows['5m'].price.close='101',
  'fabricated return': f=>f.trajectory.windows['5m'].price.change_pct=50,
  'fabricated delta': f=>f.trajectory.windows['5m'].order_flow.delta_usdt=50,
  'zero turnover': f=>f.trajectory.windows['5m'].order_flow.total_turnover_usdt=0,
  'infinite flow': f=>f.trajectory.windows['5m'].order_flow.taker_buy_usdt=Infinity,
  'future opportunity commit': f=>f.opportunity_proof.persistence.committed_ts=NOW+1,
  'unacknowledged opportunity': f=>f.opportunity_proof.persistence.status='PREPARED',
  'opportunity modified without new digest': f=>f.opportunity_proof.newest_event.episode_id='OTHER',
  'no campaign or opportunity proof': f=>f.opportunity_proof=null,
  'wrong asset': f=>f.trajectory.contract_info.contract_code='OTHER-USDT',
  'inactive contract': f=>f.trajectory.contract_info.contract_status=0,
  'wrong venue': f=>f.trajectory.source='OTHER',
  'missing all flow': f=>f.trajectory.windows['5m'].order_flow=null,
  'only 1h instead of selected 5m': f=>{f.trajectory.windows['1h']=f.trajectory.windows['5m'];delete f.trajectory.windows['5m'];},
  'detector/inputs mismatch': f=>f.trajectory.windows['5m'].derived.price_flow_alignment='selling_confirms_price_down',
  'control-group contamination': f=>mutateProof(f,p=>{p.newest_event.control_group=true;}),
  'not independent admitted sample': f=>mutateProof(f,p=>{p.newest_event.independent_sample=false;}),
  'directionless no retrospective side choice': f=>mutateProof(f,p=>{p.newest_event.direction_at_event='DIRECTIONLESS_EVENT';}),
  'direction lock after confirmation begins': f=>mutateProof(f,p=>{p.newest_event.direction_locked_ts=END;p.newest_event.event_close_ts=END;p.newest_event.direction_available_ts=END;p.direction_receipt.direction_locked_ts=END;}),
  'corrupt direction subreceipt': f=>mutateProof(f,p=>{p.direction_receipt.direction='SHORT';}),
};
for(const [name,edit] of Object.entries(invalid)) test(name,()=>{const f=fixture();edit(f);const r=prepareTz101DecisionEvidence(f);assert.equal(r.rows.length,0,JSON.stringify(r));assert.ok(r.reasons.length);assert.notEqual(r.check,'CONFIRMED');});
test('opposing flow is NOT automatically proven absorption',()=>{
  const f=fixture(); f.trajectory.windows['5m']=fixture('SHORT').trajectory.windows['5m'];
  const r=prepareTz101DecisionEvidence(f);assert.equal(r.check,'REFUTED');assert.equal(r.rows.length,0);
  const w=f.trajectory.windows['5m'];w.price=fixture().trajectory.windows['5m'].price;w.derived.price_flow_alignment='negative_flow_price_resilient';
  const a=prepareTz101DecisionEvidence(f);assert.equal(a.rows.length,0);assert.equal(a.check,'REFUTED');
});
test('funding sign, OI, legacy score cannot select direction or change evidence',()=>{
  const f=fixture(), expected=prepareTz101DecisionEvidence(f);
  for(const rate of [-2,0,2,null]) {f.trajectory.funding={current:{funding_rate_pct:rate}};f.trajectory.windows['5m'].open_interest={contracts:{change_pct:999}};f.shadow_decision={dc_long:99,dc_short:1}; assert.deepEqual(prepareTz101DecisionEvidence(f),expected);}
  f.trajectory.windows={};assert.equal(prepareTz101DecisionEvidence(f).rows.length,0);
});

function relativeEvidence(side='LONG', sourceTs=NOW-120_000) {
  const v=side==='LONG'?1.2:-1.2;
  const mk=(metric)=>({contract_code:CONTRACT,chain:'MARKET_STRENGTH_SPOT',metric,source:'OKX Spot Public V5',venue:'OKX',market_type:'SPOT',
    observed_ts:NOW-500,source_ts:sourceTs,max_age_sec:7200,status:'CLOSED',venue_observation_status:'CLOSED',eligible_for_chain_closure:true,
    coverage_pct:100,history_coverage_pct:100,window:'1h',symbol_verified:true,alias_required:true,alias_verified:true,
    asset_identity_verified:true,source_compatible:true,independence_group:'OKX_OFFICIAL_PUBLIC',primary_market_id:`${CONTRACT}:OKX:SPOT`,
    value:v,unit:'percentage_points',error:null});
  return {contract_code:CONTRACT,evidence:[mk('rs_vs_btc_1h'),mk('rs_vs_eth_1h')]};
}

for (const side of ['LONG','SHORT']) test(`fresh BTC+ETH relative strength closes second independent domain: ${side}`,()=>{
  const f=fixture(side); f.public_evidence=relativeEvidence(side); f.public_evidence_available_ts=NOW-50;
  const r=prepareTz101DecisionEvidence(f);
  assert.equal(r.status,'PREPARED_UNACKNOWLEDGED',JSON.stringify(r));
  assert.equal(r.rows.length,2);
  assert.deepEqual(r.independent_domains,['PRICE_ACTION','RELATIVE_MARKET']);
  assert.equal(r.complete_direction,true);
  assert.equal(r.rows[1].causal_family,'RELATIVE_STRENGTH');
  assert.equal(r.rows[1].metric_semantics,'RS_VS_BTC_ETH');
  assert.equal(r.rows[1].stance,side);
  const built=prepareFullEvidenceProofBundle({record:fullEvidence(),contract_code:CONTRACT,snapshot_id:SNAPSHOT,observed_ts:NOW,
    shadow_decision:{eq:{status:'OK'}},opportunity_proof:f.opportunity_proof,decision_evidence:r.rows,decision_evidence_audit:r,committed_ts:NOW});
  const sealed=sealFullEvidenceProofBundleAfterAck(built,{status:'CLOSED',persisted:true,changes:1});
  assert.equal(sealed.status,'CLOSED');
  const engineInput={...completeInput(side),decision_evidence:sealed.bundle.decision_evidence,evidence_registry:sealed.bundle.evidence_registry,opportunity:f.opportunity_proof};
  engineInput.campaign=immutableReceipt(engineInput.campaign,engineInput.campaign.persistence.receipt_id,NOW-50);
  const evaluated=buildFinalDecisionIntegrationShadow(engineInput);
  assert.equal(evaluated.evidence_independence.causal_domains.PRICE_ACTION.state,side);
  assert.equal(evaluated.evidence_independence.causal_domains.RELATIVE_MARKET.state,side);
  assert.equal(evaluated.evidence_independence.status,'CLOSED');
});

test('relative strength is fail-closed when stale, mixed, pre-lock unavailable, or opposite',()=>{
  const cases=[
    f=>{f.public_evidence=relativeEvidence('LONG',NOW-600_000);f.public_evidence_available_ts=NOW-50;},
    f=>{f.public_evidence=relativeEvidence('LONG');f.public_evidence.evidence[1].value=-1.2;f.public_evidence_available_ts=NOW-50;},
    f=>{f.public_evidence=relativeEvidence('LONG');f.public_evidence_available_ts=f.opportunity_proof.newest_event.direction_locked_ts-1;},
    f=>{f.public_evidence=relativeEvidence('SHORT');f.public_evidence_available_ts=NOW-50;},
  ];
  for(const edit of cases){const f=fixture('LONG');edit(f);const r=prepareTz101DecisionEvidence(f);assert.equal(r.rows.length,1,JSON.stringify(r));assert.equal(r.complete_direction,false);}
});

test('repeated snapshots cannot create new independent fact identities',()=>{
  const f=fixture(), a=prepareTz101DecisionEvidence(f);
  f.snapshot_id='SAME-WINDOW-NEW-CYCLE';
  const p=structuredClone(f.opportunity_proof);p.snapshot_id=f.snapshot_id;f.opportunity_proof=immutableReceipt(p,p.persistence.receipt_id,NOW-100);
  const b=prepareTz101DecisionEvidence(f);assert.equal(b.rows.length,1);
  assert.deepEqual(a.rows[0].fact_ids,b.rows[0].fact_ids);
  assert.equal(a.rows[0].source_observation_id,b.rows[0].source_observation_id);
  assert.equal(a.rows[0].lineage_derivation_id,b.rows[0].lineage_derivation_id);
});
test('staleness is determined from source window, not receipt time',()=>{
  const f=fixture();f.observed_ts=NOW+300_000;f.available_ts=f.observed_ts-1;
  const p=structuredClone(f.opportunity_proof);p.observed_ts=f.observed_ts;f.opportunity_proof=immutableReceipt(p,p.persistence.receipt_id,f.observed_ts-1);
  assert.equal(prepareTz101DecisionEvidence(f).reasons[0],'WINDOW_STALE_OR_FUTURE');
});
test('producer totality for absent and malformed containers',()=>{
  for(const x of [null,undefined,0,false,'',[],{}, {trajectory:null}]) assert.equal(prepareTz101DecisionEvidence(x).rows.length,0);
});
test('worker wiring uses real producer and keeps exact ACK path',()=>{
  assert.ok(source.includes('decision_evidence: tz101DecisionEvidence.rows'));
  assert.ok(source.includes('available_ts: trajectory?.available_ts ?? null'));
  assert.ok(source.includes('decision_evidence_audit: tz101DecisionEvidence'));
  assert.ok(source.includes('sealFullEvidenceProofBundleAfterAck('));
  assert.ok(source.indexOf('const componentsAvailableTs = Date.now()')>source.indexOf('await Promise.allSettled(['));
  assert.ok(source.indexOf('now = Date.now();\n  let opportunityIntelligence')>source.indexOf('const componentsAvailableTs = Date.now()'));
});
