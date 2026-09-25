/**
 * TZ 10.1 scenario-plan producer.
 *
 * Uses only immutable campaign proof + factual HTX execution facts. It can
 * close scenario identity, target and invalidation when they were committed
 * prospectively. It does NOT invent an entry-area tolerance: publication stays
 * NOT_CLOSED until a separately calibrated immutable entry-area rule exists.
 */
import { digest } from './upstream-proof-utils.mjs';
import { verifyStoredMultiWaveDecisionBridge } from './multi-wave-decision-bridge-producer.mjs';
import { verifyExecutionFacts } from './tz101-execution-facts.mjs';
import { deriveCandidateEntryArea } from './entry-area-rule-v2.mjs';

export const TZ101_SCENARIO_PLAN_VERSION='tz101-scenario-plan-r8-entry-area-v2';
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const stamp=v=>Number.isSafeInteger(v)&&v>=1_000_000_000_000;
const text=v=>typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=320;
const near=(a,b)=>finite(a)&&finite(b)&&Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(a),Math.abs(b));

function base(status, reason, extra={}) {
  return {version:TZ101_SCENARIO_PLAN_VERSION,status,reason,
    scenario_identity_status:'UNKNOWN',required_evidence_status:'UNKNOWN',entry_area_status:'UNKNOWN',
    entry_area:null,target:null,invalidation:null,current_price_in_entry_area:null,valid_until_ts:null,
    target_price:null,invalidation_price:null,entry_trigger_price:null,execution_reference_price:null,
    risk_summary:null,reasons:[],automatic_trade:false,...extra};
}
function verifyImmutableEnvelope(value,{schema,now}={}) {
  if(!obj(value)||value.schema_version!==schema||!obj(value.persistence)||value.persistence.status!=='CLOSED'||
     value.persistence.immutable!==true||value.persistence.verification_method!=='D1_IMMUTABLE_RECEIPT'||
     !text(value.persistence.receipt_id)||!stamp(value.persistence.committed_ts)||value.persistence.committed_ts>now) return false;
  const material=structuredClone(value); delete material.persistence;
  return value.persistence.content_digest===digest(material);
}
function evidenceClosed(rows,direction,snapshot,contract) {
  const list=Array.isArray(rows)?rows:[];
  const ok=row=>obj(row)&&row.status==='CLOSED'&&row.eligible_for_decision===true&&row.stance===direction&&
    row.snapshot_id===snapshot&&row.contract_code===contract;
  const price=list.some(r=>ok(r)&&r.causal_family==='PRICE_RESPONSE');
  const relative=list.some(r=>ok(r)&&r.causal_family==='RELATIVE_STRENGTH');
  return price&&relative;
}
function verifyEntryAreaRule(rule,{decision,observedTs,currentPrice}={}) {
  if(!verifyImmutableEnvelope(rule,{schema:'tz101-entry-area-rule-v1',now:observedTs})||rule.status!=='CLOSED'||
    rule.calibration_status!=='VALIDATED_OUT_OF_SAMPLE'||rule.contract_code!==decision.contract_code||
    rule.snapshot_id!==decision.snapshot_id||rule.decision_id!==decision.decision_id||rule.direction!==decision.direction||
    rule.campaign_receipt_id!==decision.campaign_receipt_id||!finite(rule.min_price)||!finite(rule.max_price)||
    rule.min_price<=0||rule.max_price<rule.min_price||!stamp(rule.source_ts)||rule.source_ts>observedTs||
    !stamp(rule.valid_until_ts)||rule.valid_until_ts<observedTs||!finite(currentPrice)) return null;
  const inside=currentPrice>=rule.min_price&&currentPrice<=rule.max_price;
  return {inside,min:rule.min_price,max:rule.max_price,current:currentPrice,valid_until_ts:rule.valid_until_ts,receipt_id:rule.persistence.receipt_id};
}

export function buildTz101ScenarioPlan({
  decision_summary:decision,
  campaign_proof:campaignProof,
  execution_gate:executionGate,
  decision_evidence:decisionEvidence=[],
  entry_area_rule:entryAreaRule=null,
  observed_ts:observedTs=Date.now(),
}={}) {
  if(!obj(decision)||!stamp(observedTs)||decision.entry_action!=='SHADOW_ENTRY_ELIGIBLE'||!['LONG','SHORT'].includes(decision.direction))
    return base('NOT_CLOSED','FINAL_DECISION_ENTRY_IDENTITY_NOT_CLOSED');
  const proofCheck=verifyStoredMultiWaveDecisionBridge(campaignProof);
  if(!proofCheck.ok) return base('NOT_CLOSED',`CAMPAIGN_PROOF_INVALID:${proofCheck.reason}`);
  if(campaignProof.snapshot_id!==decision.snapshot_id||campaignProof.campaign?.contract_code!==decision.contract_code||
     campaignProof.campaign?.direction!==decision.direction||campaignProof.persistence?.receipt_id!==decision.campaign_receipt_id)
    return base('NOT_CLOSED','CAMPAIGN_DECISION_IDENTITY_MISMATCH');
  const window=campaignProof.entry_window, anchor=campaignProof.entry_scenario_anchor;
  if(!obj(window)||window.status!=='CLOSED'||window.action_id!==decision.entry_action_id||window.snapshot_id!==decision.snapshot_id||
     !stamp(window.source_ts)||!stamp(window.valid_until_ts)||window.source_ts>observedTs||window.valid_until_ts<observedTs)
    return base('NOT_CLOSED','IMMUTABLE_ENTRY_WINDOW_NOT_CLOSED');
  if(!obj(anchor)||anchor.schema_version!=='multi-wave-entry-scenario-anchor-v1'||anchor.prospective_only!==true||
     anchor.contract_code!==decision.contract_code||anchor.campaign_id!==campaignProof.campaign.campaign_id||
     anchor.direction!==decision.direction||anchor.entry_trigger_time!==campaignProof.campaign.entry_trigger_time||
     !near(anchor.entry_trigger_price,campaignProof.campaign.entry_trigger_price)||!finite(anchor.target_price)||!finite(anchor.invalidation_price))
    return base('NOT_CLOSED','IMMUTABLE_SCENARIO_ANCHOR_MISSING_OR_MISMATCH');
  if(!obj(executionGate)||executionGate.authoritative!==true||executionGate.snapshot_id!==decision.snapshot_id||executionGate.contract_code!==decision.contract_code||
     executionGate.safety_gate_receipt_id!==decision.safety_gate_receipt_id)
    return base('NOT_CLOSED','EXECUTION_GATE_DECISION_RECEIPT_MISMATCH');
  const execution=verifyExecutionFacts(executionGate?.factual_basis,{contract_code:decision.contract_code,observed_ts:observedTs});
  const plan=execution?.plans?.[decision.direction];
  if(plan?.status!=='CLOSED'||!obj(plan.entry)||!finite(plan.entry.reference_price)||!finite(plan.entry.vwap))
    return base('NOT_CLOSED','FACTUAL_ENTRY_EXECUTION_NOT_CLOSED');
  const required=evidenceClosed(decisionEvidence,decision.direction,decision.snapshot_id,decision.contract_code);
  const target=anchor.target_price, invalidation=anchor.invalidation_price, entry=anchor.entry_trigger_price;
  if((decision.direction==='LONG'&&!(invalidation<entry&&target>entry))||(decision.direction==='SHORT'&&!(invalidation>entry&&target<entry)))
    return base('BLOCKED','SCENARIO_LEVEL_DIRECTION_INCONSISTENT');
  let area=verifyEntryAreaRule(entryAreaRule,{decision,observedTs,currentPrice:plan.entry.reference_price});
  let candidateReceipt=null;
  if(!area && entryAreaRule?.schema_version==='tz101-entry-area-strategy-rule-v2') {
    const derived=deriveCandidateEntryArea({rule:entryAreaRule,decision,campaign_proof:campaignProof,execution_reference_price:plan.entry.reference_price,observed_ts:observedTs});
    if(derived?.status==='CLOSED') {
      area={inside:derived.inside,min:derived.min_price,max:derived.max_price,current:plan.entry.reference_price,valid_until_ts:derived.valid_until_ts,receipt_id:derived.strategy_rule_receipt_id};
      candidateReceipt=derived.candidate_receipt;
    }
  }
  const validUntil=Math.min(window.valid_until_ts,execution.facts.valid_until_ts,area?.valid_until_ts??Number.MAX_SAFE_INTEGER);
  const entryText=area?`${area.min}–${area.max} USDT`:null;
  const targetText=`${target} USDT`;
  const invalidText=`${invalidation} USDT`;
  const status=required&&area?.inside===true&&validUntil>=observedTs?'CLOSED':'NOT_CLOSED';
  const reasons=[
    `Сценарий ${anchor.scenario_type} зафиксирован до публикации`,
    `Цель следует из заранее заданного порога волны ${anchor.target_move_pct}%`,
    `Отмена следует из границы подтверждённой базы кампании`,
  ];
  return {
    version:TZ101_SCENARIO_PLAN_VERSION,status,reason:status==='CLOSED'?null:!required?'SCENARIO_REQUIRED_EVIDENCE_NOT_CLOSED':!area?'ENTRY_AREA_RULE_NOT_CALIBRATED_OR_PROVEN':area.inside!==true?'CURRENT_PRICE_OUTSIDE_ENTRY_AREA':'SCENARIO_PLAN_NOT_CLOSED',
    scenario_identity_status:'CLOSED',scenario_type:anchor.scenario_type,scenario_receipt_id:campaignProof.persistence.receipt_id,
    campaign_id:anchor.campaign_id,wave_index:anchor.wave_index,direction:decision.direction,contract_code:decision.contract_code,snapshot_id:decision.snapshot_id,
    required_evidence_status:required?'CLOSED':'NOT_CLOSED',entry_area_status:area?'CLOSED':'UNKNOWN',entry_area:entryText,
    current_price_in_entry_area:area?.inside===true,target:targetText,invalidation:invalidText,target_price:target,invalidation_price:invalidation,
    entry_trigger_price:entry,execution_reference_price:plan.entry.reference_price,execution_vwap:plan.entry.vwap,measured_contracts:plan.measured_contracts,
    valid_until_ts:validUntil>=1_000_000_000_000?validUntil:null,risk_summary:'Структура сценария отменяется при нарушении зафиксированной границы базы; исполнение и расходы проверяются отдельно.',
    reasons,entry_area_rule_receipt_id:area?.receipt_id??null,entry_area_candidate_receipt:candidateReceipt,entry_area_min_price:area?.min??null,entry_area_max_price:area?.max??null,automatic_trade:false,
    safety:{retroactive_scenario_selection:false,liquidation_as_target:false,unknown_as_closed:false,user_position_assumed:false},
  };
}
