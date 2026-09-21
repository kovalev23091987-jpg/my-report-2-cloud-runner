/**
 * TZ 10.1 shadow-only publication-input persistence/readback.
 *
 * This module does not derive entry ranges, fee rates or holding horizons. It
 * only accepts already immutable, identity-bound receipts, persists the exact
 * bundle once, and verifies the same bytes after a restart. Missing, stale or
 * conflicting input always remains NOT_CLOSED.
 */
import { buildHtxFeeScheduleReceipt } from './tz101-fee-source.mjs';
import { digest, stableJson } from './upstream-proof-utils.mjs';

export const TZ101_PUBLICATION_INPUT_RUNTIME_VERSION='tz101-publication-input-runtime-r1';
export const TZ101_PUBLICATION_INPUT_BUDGET=Object.freeze({load_rows_read:1,persist_rows_read:1,persist_rows_written:1});
export const MAX_TZ101_PUBLICATION_INPUT_BYTES=64*1024;

const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=v=>typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=320;
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const stamp=v=>Number.isSafeInteger(v)&&v>=1_000_000_000_000;
const bytes=v=>new TextEncoder().encode(v).byteLength;
const base=(status,reason,extra={})=>({version:TZ101_PUBLICATION_INPUT_RUNTIME_VERSION,status,reason,statements:0,rows_read:0,rows_written:0,
  entry_area_rule:null,fee_schedule:null,holding_plan:null,safety:{shadow_only:true,automatic_trade:false,automatic_rule_promotion:false,credentials_stored:false},...extra});

function immutable(value,schema,now){
  if(!obj(value)||value.schema_version!==schema||!obj(value.persistence)||value.persistence.status!=='CLOSED'||value.persistence.immutable!==true||
    value.persistence.verification_method!=='D1_IMMUTABLE_RECEIPT'||!text(value.persistence.receipt_id)||!stamp(value.persistence.committed_ts)||value.persistence.committed_ts>now||
    !/^[0-9a-f]{16}$/.test(String(value.persistence.content_digest||'')))return false;
  const material=structuredClone(value);delete material.persistence;
  return value.persistence.content_digest===digest(material);
}

function validateEntryAreaRule(rule,{decision,now}){
  if(!immutable(rule,'tz101-entry-area-rule-v1',now)||rule.status!=='CLOSED'||rule.calibration_status!=='VALIDATED_OUT_OF_SAMPLE'||
    rule.automatic_rule_promotion!==false||rule.contract_code!==decision.contract_code||rule.snapshot_id!==decision.snapshot_id||
    rule.decision_id!==decision.decision_id||rule.direction!==decision.direction||rule.campaign_receipt_id!==decision.campaign_receipt_id||
    !text(rule.calibration_receipt_id)||!/^[0-9a-f]{16,64}$/.test(String(rule.calibration_dataset_digest||''))||
    !finite(rule.min_price)||!finite(rule.max_price)||rule.min_price<=0||rule.max_price<rule.min_price||
    !stamp(rule.source_ts)||rule.source_ts>decision.observation_ts||!stamp(rule.valid_until_ts)||rule.valid_until_ts<now)return false;
  return true;
}

function validateFeeSchedule(schedule,{decision,now}){
  if(!immutable(schedule,'tz101-htx-fee-schedule-v1',now)||schedule.status!=='CLOSED'||schedule.contract_code!==decision.contract_code)return false;
  const rebuilt=buildHtxFeeScheduleReceipt({contract_code:decision.contract_code,source_record:schedule,observed_ts:now});
  return rebuilt.status==='CLOSED'&&stableJson(rebuilt.fee_schedule)===stableJson(schedule);
}

function validateHoldingPlan(plan,{decision,now}){
  if(!immutable(plan,'tz101-holding-plan-v1',now)||plan.status!=='CLOSED'||plan.contract_code!==decision.contract_code||
    plan.decision_id!==decision.decision_id||plan.direction!==decision.direction||plan.prospective_only!==true||plan.automatic_trade!==false||
    !['PRECOMMITTED_CAMPAIGN_POLICY','OWNER_DECLARED_SHADOW_PLAN'].includes(String(plan.source_kind||''))||!text(plan.source_receipt_id)||
    !stamp(plan.source_ts)||plan.source_ts>decision.observation_ts||!stamp(plan.entry_ts)||plan.entry_ts!==decision.observation_ts||
    !stamp(plan.planned_exit_no_later_than_ts)||plan.entry_ts>=plan.planned_exit_no_later_than_ts||plan.planned_exit_no_later_than_ts<=now)return false;
  return true;
}

export function buildTz101PublicationInputBundle({decision_summary:decision,entry_area_rule,fee_schedule,holding_plan}={}){
  const now=decision?.observation_ts;
  if(!obj(decision)||!text(decision.decision_id)||!text(decision.snapshot_id)||!text(decision.contract_code)||!['LONG','SHORT'].includes(decision.direction)||
    !text(decision.campaign_receipt_id)||!stamp(now))return base('NOT_CLOSED','DECISION_IDENTITY_NOT_CLOSED');
  if(!validateEntryAreaRule(entry_area_rule,{decision,now}))return base('NOT_CLOSED','ENTRY_AREA_RULE_RECEIPT_NOT_CLOSED');
  if(!validateFeeSchedule(fee_schedule,{decision,now}))return base('NOT_CLOSED','FEE_SCHEDULE_RECEIPT_NOT_CLOSED');
  if(!validateHoldingPlan(holding_plan,{decision,now}))return base('NOT_CLOSED','HOLDING_PLAN_RECEIPT_NOT_CLOSED');
  const bundle={schema_version:'tz101-publication-input-bundle-v1',status:'CLOSED',decision_id:decision.decision_id,snapshot_id:decision.snapshot_id,
    contract_code:decision.contract_code,direction:decision.direction,observation_ts:decision.observation_ts,campaign_receipt_id:decision.campaign_receipt_id,
    entry_area_rule,fee_schedule,holding_plan,shadow_only:true,automatic_trade:false,automatic_rule_promotion:false};
  return base('CLOSED',null,{bundle,bundle_digest:digest(bundle),entry_area_rule,fee_schedule,holding_plan});
}

export function verifyTz101PublicationInputBundle(bundle,{decision_summary:decision,observed_ts:now}={}){
  if(!obj(bundle)||bundle.schema_version!=='tz101-publication-input-bundle-v1'||bundle.status!=='CLOSED'||bundle.shadow_only!==true||
    bundle.automatic_trade!==false||bundle.automatic_rule_promotion!==false||!obj(decision)||!stamp(now)||
    bundle.decision_id!==decision.decision_id||bundle.snapshot_id!==decision.snapshot_id||bundle.contract_code!==decision.contract_code||
    bundle.direction!==decision.direction||bundle.observation_ts!==decision.observation_ts||bundle.campaign_receipt_id!==decision.campaign_receipt_id)
    return base('NOT_CLOSED','PUBLICATION_INPUT_BUNDLE_IDENTITY_MISMATCH');
  if(!validateEntryAreaRule(bundle.entry_area_rule,{decision,now}))return base('NOT_CLOSED','ENTRY_AREA_RULE_RECEIPT_NOT_CURRENT');
  if(!validateFeeSchedule(bundle.fee_schedule,{decision,now}))return base('NOT_CLOSED','FEE_SCHEDULE_RECEIPT_NOT_CURRENT');
  if(!validateHoldingPlan(bundle.holding_plan,{decision,now}))return base('NOT_CLOSED','HOLDING_PLAN_RECEIPT_NOT_CURRENT');
  return base('CLOSED',null,{bundle,bundle_digest:digest(bundle),entry_area_rule:bundle.entry_area_rule,fee_schedule:bundle.fee_schedule,holding_plan:bundle.holding_plan});
}

function resultRows(result){
  if(result?.success===false||!Array.isArray(result?.results))throw new Error('D1_READ_RESULT_UNKNOWN');
  return result.results;
}
function writeAck(result){
  if(result?.success!==true||!obj(result.meta)||!Number.isSafeInteger(result.meta.changes)||![0,1].includes(result.meta.changes)||
    !Number.isSafeInteger(result.meta.rows_written)||result.meta.rows_written!==result.meta.changes)throw new Error('D1_WRITE_ACK_INVALID');
  return result.meta.changes;
}
function rowBundle(row){
  if(!obj(row)||typeof row.bundle_json!=='string'||bytes(row.bundle_json)>MAX_TZ101_PUBLICATION_INPUT_BYTES)return null;
  let bundle;try{bundle=JSON.parse(row.bundle_json);}catch{return null;}
  if(digest(bundle)!==row.bundle_digest||row.bundle_digest!==String(row.bundle_id||'').replace(/^TPI:/,''))return null;
  if(row.decision_id!==bundle.decision_id||row.snapshot_id!==bundle.snapshot_id||row.contract_code!==bundle.contract_code||
    row.direction!==bundle.direction||Number(row.observation_ts)!==bundle.observation_ts||row.status!=='CLOSED')return null;
  return bundle;
}

async function readStored(db,decision){
  const r=await db.prepare(`SELECT bundle_id,decision_id,snapshot_id,contract_code,direction,observation_ts,bundle_json,bundle_digest,status,persisted_ts
    FROM tz101_publication_input_shadow WHERE decision_id=?1 AND contract_code=?2 LIMIT 2`).bind(decision.decision_id,decision.contract_code).all();
  const rows=resultRows(r);if(rows.length>1)throw new Error('D1_PUBLICATION_INPUT_MULTIPLE_ROWS');
  return rows[0]||null;
}

export async function loadTz101PublicationInputs({env,decision_summary:decision,observed_ts:now=Date.now()}={}){
  if(!obj(decision)||!text(decision.decision_id)||!text(decision.contract_code)||!stamp(now))return base('NOT_CLOSED','LOAD_IDENTITY_OR_TIME_INVALID');
  if(!env?.DATA_DB||typeof env.DATA_DB.prepare!=='function')return base('SOURCE_UNSUPPORTED','DATA_DB_NOT_CONFIGURED');
  try{
    const row=await readStored(env.DATA_DB,decision);
    if(!row)return base('NOT_FOUND','PUBLICATION_INPUT_BUNDLE_NOT_FOUND',{statements:1,rows_read:0});
    const bundle=rowBundle(row);if(!bundle)return base('FAIL_CLOSED','PUBLICATION_INPUT_READBACK_INVALID',{statements:1,rows_read:1});
    const verified=verifyTz101PublicationInputBundle(bundle,{decision_summary:decision,observed_ts:now});
    return {...verified,statements:1,rows_read:1,persisted_ts:Number(row.persisted_ts)||null};
  }catch(error){
    const message=String(error?.message||error).slice(0,500);
    return base(/no such table|schema/i.test(message)?'MIGRATION_REQUIRED':'FAIL_CLOSED',message,{statements:1});
  }
}

export async function persistTz101PublicationInputs({env,decision_summary:decision,entry_area_rule,fee_schedule,holding_plan,persisted_ts=Date.now()}={}){
  const built=buildTz101PublicationInputBundle({decision_summary:decision,entry_area_rule,fee_schedule,holding_plan});
  if(built.status!=='CLOSED')return built;
  if(!env?.DATA_DB||typeof env.DATA_DB.prepare!=='function')return base('SOURCE_UNSUPPORTED','DATA_DB_NOT_CONFIGURED');
  if(!stamp(persisted_ts)||persisted_ts<decision.observation_ts)return base('NOT_CLOSED','PERSISTED_TS_INVALID');
  const bundleJson=stableJson(built.bundle);if(bytes(bundleJson)>MAX_TZ101_PUBLICATION_INPUT_BYTES)return base('NOT_CLOSED','PUBLICATION_INPUT_BUNDLE_TOO_LARGE');
  const bundleId=`TPI:${built.bundle_digest}`;
  let statements=0,rowsWritten=0;
  try{
    statements+=1;
    const result=await env.DATA_DB.prepare(`INSERT OR IGNORE INTO tz101_publication_input_shadow
      (bundle_id,decision_id,snapshot_id,contract_code,direction,observation_ts,entry_area_rule_receipt_id,fee_schedule_receipt_id,holding_plan_receipt_id,bundle_json,bundle_digest,status,persisted_ts)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,'CLOSED',?12)`).bind(bundleId,decision.decision_id,decision.snapshot_id,decision.contract_code,decision.direction,
      decision.observation_ts,entry_area_rule.persistence.receipt_id,fee_schedule.persistence.receipt_id,holding_plan.persistence.receipt_id,bundleJson,built.bundle_digest,persisted_ts).run();
    const changes=writeAck(result);rowsWritten=changes;statements+=1;
    const row=await readStored(env.DATA_DB,decision),stored=rowBundle(row);
    if(!stored||stableJson(stored)!==bundleJson)return base('FAIL_CLOSED',changes===0?'PUBLICATION_INPUT_IDENTITY_COLLISION':'PUBLICATION_INPUT_READBACK_FAILED',{statements:2,rows_read:row?1:0,rows_written:changes});
    const verified=verifyTz101PublicationInputBundle(stored,{decision_summary:decision,observed_ts:persisted_ts});
    if(verified.status!=='CLOSED')return {...verified,statements:2,rows_read:1,rows_written:changes};
    return {...verified,status:changes===1?'CLOSED':'DEDUPLICATED',statements:2,rows_read:1,rows_written:changes,bundle_id:bundleId,persisted_ts:Number(row.persisted_ts)||null};
  }catch(error){
    const message=String(error?.message||error).slice(0,500);
    return base(/no such table|schema/i.test(message)?'MIGRATION_REQUIRED':'FAIL_CLOSED',message,{statements,rows_written:rowsWritten});
  }
}
