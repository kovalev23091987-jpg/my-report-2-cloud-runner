import {digest} from './upstream-proof-utils.mjs';
export const ENTRY_AREA_RULE_VERSION='tz101-entry-area-strategy-rule-v2';
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const stamp=v=>Number.isSafeInteger(v)&&v>=1_000_000_000_000;
const text=v=>typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=320;

export function verifyStrategyEntryAreaRule(rule,{observed_ts=Date.now()}={}){
  if(!obj(rule)||rule.schema_version!=='tz101-entry-area-strategy-rule-v2'||rule.status!=='CLOSED'||rule.approved_for_analytical_entry!==true||!text(rule.rule_version)||!text(rule.method)||!stamp(rule.approved_ts)||rule.approved_ts>observed_ts)return {ok:false,reason:'STRATEGY_ENTRY_AREA_RULE_INVALID'};
  if(!finite(rule.max_distance_bps)||rule.max_distance_bps<=0||rule.max_distance_bps>500)return {ok:false,reason:'STRATEGY_ENTRY_AREA_DISTANCE_INVALID'};
  if(!obj(rule.persistence)||rule.persistence.status!=='CLOSED'||rule.persistence.immutable!==true||rule.persistence.verification_method!=='D1_IMMUTABLE_RECEIPT'||!text(rule.persistence.receipt_id)||!stamp(rule.persistence.committed_ts)||rule.persistence.committed_ts>observed_ts)return {ok:false,reason:'STRATEGY_ENTRY_AREA_RECEIPT_INVALID'};
  const material=structuredClone(rule);delete material.persistence;
  if(rule.persistence.content_digest!==digest(material))return {ok:false,reason:'STRATEGY_ENTRY_AREA_DIGEST_MISMATCH'};
  return {ok:true};
}

export function deriveCandidateEntryArea({rule,decision,campaign_proof,execution_reference_price,observed_ts=Date.now()}={}){
  const check=verifyStrategyEntryAreaRule(rule,{observed_ts}); if(!check.ok)return {status:'NOT_CLOSED',reason:check.reason};
  if(!obj(decision)||!obj(campaign_proof)||!finite(execution_reference_price)||execution_reference_price<=0)return {status:'NOT_CLOSED',reason:'ENTRY_AREA_INPUT_INVALID'};
  const anchor=campaign_proof.entry_scenario_anchor; if(!obj(anchor)||!finite(anchor.entry_trigger_price)||anchor.entry_trigger_price<=0)return {status:'NOT_CLOSED',reason:'ENTRY_TRIGGER_ANCHOR_MISSING'};
  const trigger=anchor.entry_trigger_price, bps=rule.max_distance_bps/10000;
  const min=trigger*(1-bps),max=trigger*(1+bps);
  const inside=execution_reference_price>=min&&execution_reference_price<=max;
  const validUntil=Math.min(Number(campaign_proof.entry_window?.valid_until_ts)||Number.MAX_SAFE_INTEGER, observed_ts+(Number(rule.max_validity_ms)||900000));
  const receiptMaterial={schema_version:'tz101-entry-area-candidate-receipt-v2',rule_version:rule.rule_version,decision_id:decision.decision_id||null,snapshot_id:decision.snapshot_id||null,contract_code:decision.contract_code||null,direction:decision.direction||null,input_trigger_price:trigger,execution_reference_price,min_price:min,max_price:max,observed_ts,valid_until_ts:validUntil,invalidation_price:anchor.invalidation_price};
  return {status:'CLOSED',reason:null,inside,min_price:min,max_price:max,valid_until_ts:validUntil,rule_version:rule.rule_version,strategy_rule_receipt_id:rule.persistence.receipt_id,candidate_receipt:{...receiptMaterial,content_digest:digest(receiptMaterial)}};
}
