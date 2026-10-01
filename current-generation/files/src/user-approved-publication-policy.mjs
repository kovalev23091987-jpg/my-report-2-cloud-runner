import {digest} from './upstream-proof-utils.mjs';

export const USER_APPROVED_PUBLICATION_POLICY_VERSION='user-approved-publication-policy-v2-no-fixed-minimum-20261001';
export const MINIMUM_REPORTABLE_MOVE_PCT=null;
export const ENTRY_BAND_BPS=50;
export const MAX_HOLDING_HOURS=24;
export const CONSERVATIVE_TAKER_FEE_RATE=0.001;
export const CONSERVATIVE_FUNDING_FLOOR_PCT=0.1;

const APPROVED_TS=Date.UTC(2026,8,27,20,45,0);
const POLICY_ID='MY_REPORT_2_OWNER_APPROVED_20260927';
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=v=>v===null||v===undefined?'':String(v).trim();
const stamp=v=>Number.isSafeInteger(Number(v))&&Number(v)>=1_000_000_000_000?Number(v):null;

function sealed(material,receiptId,committedTs=APPROVED_TS){
 const clean=structuredClone(material);
 delete clean.persistence;
 return {...clean,persistence:{
  status:'CLOSED',immutable:true,
  verification_method:'USER_APPROVED_IMMUTABLE_CODE_POLICY',
  receipt_id:receiptId,committed_ts:committedTs,
  content_digest:digest(clean),policy_id:POLICY_ID,
 }};
}

export function buildApprovedEntryAreaRule({observed_ts=Date.now()}={}){
 const now=stamp(observed_ts);
 if(now===null||now<APPROVED_TS)return null;
 return sealed({
  schema_version:'tz101-entry-area-strategy-rule-v2',status:'CLOSED',
  approved_for_analytical_entry:true,
  rule_version:'entry-area-trigger-band-50bps-owner-approved-v1',
  method:'TRIGGER_BAND_BPS',max_distance_bps:ENTRY_BAND_BPS,
  max_validity_ms:15*60_000,approved_ts:APPROVED_TS,
  minimum_remaining_move_pct:MINIMUM_REPORTABLE_MOVE_PCT,
  automatic_trade:false,
 },'POLICY:ENTRY_AREA:20260927');
}

export function buildApprovedFeeSchedule({decision_summary:decision,observed_ts=Date.now()}={}){
 const now=stamp(observed_ts),contract=text(decision?.contract_code).toUpperCase();
 if(now===null||now<APPROVED_TS||!/^[A-Z0-9]{1,24}-USDT$/.test(contract))return null;
 return sealed({
  schema_version:'tz101-htx-fee-schedule-v1',status:'CLOSED',venue:'HTX',market_type:'USDT_PERP',
  contract_code:contract,fee_role:'TAKER',
  entry_rate:CONSERVATIVE_TAKER_FEE_RATE,exit_rate:CONSERVATIVE_TAKER_FEE_RATE,
  source_kind:'OWNER_APPROVED_CONSERVATIVE_ANALYTICAL_CAP',
  source_receipt_id:'HTX:OFFICIAL:TAKER:FEE:CONSERVATIVE:20260927',
  source_authority:'HTX_OFFICIAL',source_url:'https://www.htx.com/en-us/support/900000089923/',
  conservative_for_unknown_account:true,source_ts:APPROVED_TS,
  valid_until_ts:now+30*60_000,automatic_trade:false,
 },`POLICY:FEE:${contract}:20260927`);
}

export function buildApprovedHoldingPlan({decision_summary:decision,observed_ts=Date.now()}={}){
 const now=stamp(observed_ts),entryTs=stamp(decision?.observation_ts),contract=text(decision?.contract_code).toUpperCase();
 const direction=text(decision?.direction).toUpperCase(),decisionId=text(decision?.decision_id);
 if(now===null||now<APPROVED_TS||entryTs===null||entryTs>now||!contract||!decisionId||!['LONG','SHORT'].includes(direction))return null;
 return sealed({
  schema_version:'tz101-holding-plan-v1',status:'CLOSED',contract_code:contract,
  decision_id:decisionId,direction,source_kind:'OWNER_APPROVED_ANALYTICAL_POLICY',
  source_receipt_id:'HOLDING:MAX_24H:NO_FIXED_MIN_MOVE:20261001',source_ts:APPROVED_TS,
  entry_ts:entryTs,planned_exit_no_later_than_ts:entryTs+MAX_HOLDING_HOURS*60*60_000,
  maximum_holding_hours:MAX_HOLDING_HOURS,minimum_remaining_move_pct:MINIMUM_REPORTABLE_MOVE_PCT,
  conservative_funding_floor_pct:CONSERVATIVE_FUNDING_FLOOR_PCT,
  prospective_only:true,automatic_trade:false,
 },`POLICY:HOLDING:${contract}:${decisionId}:20260927`);
}

export function buildApprovedPublicationInputs({decision_summary:decision,observed_ts=Date.now()}={}){
 if(!obj(decision))return {status:'NOT_CLOSED',reason:'DECISION_REQUIRED'};
 const entry_area_rule=buildApprovedEntryAreaRule({observed_ts});
 const fee_schedule=buildApprovedFeeSchedule({decision_summary:decision,observed_ts});
 const holding_plan=buildApprovedHoldingPlan({decision_summary:decision,observed_ts});
 const status=entry_area_rule&&fee_schedule&&holding_plan?'CLOSED':'NOT_CLOSED';
 return {version:USER_APPROVED_PUBLICATION_POLICY_VERSION,status,
  reason:status==='CLOSED'?null:'APPROVED_POLICY_INPUT_NOT_CLOSED',
  entry_area_rule,fee_schedule,holding_plan,
  minimum_reportable_move_pct:MINIMUM_REPORTABLE_MOVE_PCT,
  automatic_trade:false};
}

export function verifyApprovedCodePolicyReceipt(value,{schema,observed_ts=Date.now()}={}){
 const now=stamp(observed_ts);
 if(!obj(value)||value.schema_version!==schema||now===null||!obj(value.persistence)||
  value.persistence.status!=='CLOSED'||value.persistence.immutable!==true||
  value.persistence.verification_method!=='USER_APPROVED_IMMUTABLE_CODE_POLICY'||
  value.persistence.policy_id!==POLICY_ID||!text(value.persistence.receipt_id)||
  stamp(value.persistence.committed_ts)===null||value.persistence.committed_ts>now)return false;
 const material=structuredClone(value);delete material.persistence;
 return value.persistence.content_digest===digest(material);
}

export default {USER_APPROVED_PUBLICATION_POLICY_VERSION,MINIMUM_REPORTABLE_MOVE_PCT,buildApprovedPublicationInputs,verifyApprovedCodePolicyReceipt};
