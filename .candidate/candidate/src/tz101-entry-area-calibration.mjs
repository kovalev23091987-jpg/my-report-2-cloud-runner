/**
 * Prospective-only shadow calibration dataset for TZ 10.1 entry-area rules.
 *
 * It never derives or promotes a live entry-area rule. Its job is to preserve
 * prospectively committed scenario anchors, attach later factual outcomes, and
 * prove when a chronological dataset is merely READY for a separate OOS
 * calibration procedure.
 */
import { digest } from './upstream-proof-utils.mjs';
import { verifyStoredMultiWaveDecisionBridge } from './multi-wave-decision-bridge-producer.mjs';

export const TZ101_ENTRY_AREA_CALIBRATION_VERSION='tz101-entry-area-calibration-shadow-r8';
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const stamp=v=>Number.isSafeInteger(v)&&v>=1_000_000_000_000;
const text=v=>typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=320;
const near=(a,b)=>finite(a)&&finite(b)&&Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(a),Math.abs(b));

function base(status,reason,extra={}){return {version:TZ101_ENTRY_AREA_CALIBRATION_VERSION,status,reason,calibration_only:true,live_promotion_allowed:false,automatic_rule_promotion:false,...extra};}
function pctDistance(a,b){return finite(a)&&finite(b)&&a>0?Math.abs(b-a)/a*100:null;}

export function buildProspectiveEntryAreaSample({decision_summary:decision,campaign_proof:proof,observed_ts:observedTs=Date.now()}={}){
  if(!obj(decision)||!stamp(observedTs)||!text(decision.decision_id)||!text(decision.snapshot_id)||!text(decision.contract_code)||!['LONG','SHORT'].includes(decision.direction))
    return base('NOT_CAPTURED','DECISION_IDENTITY_NOT_CLOSED');
  const verified=verifyStoredMultiWaveDecisionBridge(proof);
  if(!verified.ok) return base('NOT_CAPTURED',`CAMPAIGN_PROOF_INVALID:${verified.reason}`);
  if(proof.persistence?.receipt_id!==decision.campaign_receipt_id||proof.snapshot_id!==decision.snapshot_id||proof.campaign?.contract_code!==decision.contract_code||proof.campaign?.direction!==decision.direction)
    return base('NOT_CAPTURED','DECISION_CAMPAIGN_IDENTITY_MISMATCH');
  const anchor=proof.entry_scenario_anchor;
  const committed=proof.persistence?.committed_ts;
  if(!obj(anchor)||anchor.schema_version!=='multi-wave-entry-scenario-anchor-v1'||anchor.prospective_only!==true||!stamp(committed)||committed>observedTs)
    return base('NOT_CAPTURED','PROSPECTIVE_SCENARIO_ANCHOR_MISSING');
  // A calibration sample is only accepted when the anchor existed in the same
  // immutable campaign receipt at its original observation. This rejects any
  // later/legacy backfill of an already-active entry phase.
  if(anchor.source_observation_ts!==committed||proof.campaign?.last_observed_ts!==committed||anchor.source_observation_ts>decision.observation_ts||anchor.entry_trigger_time>decision.observation_ts)
    return base('NOT_CAPTURED','RETROSPECTIVE_OR_FUTURE_ANCHOR_FORBIDDEN');
  if(anchor.contract_code!==decision.contract_code||anchor.direction!==decision.direction||anchor.campaign_id!==proof.campaign?.campaign_id||!finite(anchor.entry_trigger_price)||anchor.entry_trigger_price<=0||
     !finite(anchor.base_low)||!finite(anchor.base_high)||anchor.base_low<=0||anchor.base_high<anchor.base_low||!finite(anchor.invalidation_price)||!finite(anchor.target_price))
    return base('NOT_CAPTURED','SCENARIO_ANCHOR_NUMERIC_FACTS_INVALID');
  if((decision.direction==='LONG'&&!(anchor.invalidation_price<anchor.entry_trigger_price&&anchor.target_price>anchor.entry_trigger_price))||
     (decision.direction==='SHORT'&&!(anchor.invalidation_price>anchor.entry_trigger_price&&anchor.target_price<anchor.entry_trigger_price)))
    return base('NOT_CAPTURED','SCENARIO_DIRECTION_LEVELS_INVALID');

  const material={
    schema_version:'tz101-entry-area-prospective-sample-v1',
    decision_id:decision.decision_id,snapshot_id:decision.snapshot_id,contract_code:decision.contract_code,direction:decision.direction,
    campaign_receipt_id:proof.persistence.receipt_id,campaign_id:anchor.campaign_id,wave_index:anchor.wave_index,
    observed_ts:decision.observation_ts,anchor_committed_ts:committed,entry_trigger_time:anchor.entry_trigger_time,
    entry_trigger_price:anchor.entry_trigger_price,base_low:anchor.base_low,base_high:anchor.base_high,
    invalidation_price:anchor.invalidation_price,target_price:anchor.target_price,target_move_pct:anchor.target_move_pct,
    scenario_type:anchor.scenario_type,
    features:{
      base_width_pct:(anchor.base_high-anchor.base_low)/anchor.entry_trigger_price*100,
      invalidation_distance_pct:pctDistance(anchor.entry_trigger_price,anchor.invalidation_price),
      target_distance_pct:pctDistance(anchor.entry_trigger_price,anchor.target_price),
    },
  };
  const sampleId=`EAC:${digest(material)}`;
  return base('CAPTURED_PROSPECTIVE',null,{sample_id:sampleId,material_digest:digest(material),sample:material});
}

export function attachFactualEntryAreaOutcome({sample_record:sampleRecord,outcome_record:outcome,computed_ts:computedTs=Date.now()}={}){
  const sample=sampleRecord?.sample;
  if(sampleRecord?.status!=='CAPTURED_PROSPECTIVE'||!obj(sample)||sample.schema_version!=='tz101-entry-area-prospective-sample-v1'||sampleRecord.material_digest!==digest(sample))
    return base('NOT_CLOSED','PROSPECTIVE_SAMPLE_INVALID');
  if(!obj(outcome)||outcome.status!=='CLOSED_FACTUAL'||outcome.contract_code!==sample.contract_code||outcome.direction_hint!==sample.direction||outcome.observed_ts!==sample.observed_ts)
    return base('NOT_CLOSED','FACTUAL_OUTCOME_IDENTITY_MISMATCH',{sample_id:sampleRecord.sample_id});
  if(outcome.interpolation_used!==false||outcome.calibration_only!==true||outcome.live_promotion_allowed!==false||!stamp(outcome.outcome_scan_ts)||!stamp(outcome.target_ts)||outcome.outcome_scan_ts<outcome.target_ts||!stamp(computedTs)||computedTs<outcome.outcome_scan_ts)
    return base('NOT_CLOSED','FACTUAL_OUTCOME_TEMPORAL_OR_MODE_INVALID',{sample_id:sampleRecord.sample_id});
  if(!finite(outcome.directional_return_pct)||!finite(outcome.mfe_directional_pct_snapshot)||!finite(outcome.mae_directional_pct_snapshot))
    return base('NOT_CLOSED','FACTUAL_OUTCOME_NUMERIC_FIELDS_MISSING',{sample_id:sampleRecord.sample_id});
  const targetPct=sample.features.target_distance_pct, invalidPct=sample.features.invalidation_distance_pct;
  const targetTouched=finite(targetPct)&&outcome.mfe_directional_pct_snapshot>=targetPct;
  const invalidTouched=finite(invalidPct)&&outcome.mae_directional_pct_snapshot<=-invalidPct;
  const orderStatus=targetTouched&&invalidTouched?'AMBIGUOUS_BOTH_TOUCHED_ORDER_UNKNOWN':targetTouched?'TARGET_ONLY_TOUCHED':invalidTouched?'INVALIDATION_ONLY_TOUCHED':'NEITHER_TOUCHED';
  const material={schema_version:'tz101-entry-area-factual-outcome-v1',sample_id:sampleRecord.sample_id,contract_code:sample.contract_code,direction:sample.direction,observed_ts:sample.observed_ts,
    horizon_hours:outcome.horizon_hours,target_ts:outcome.target_ts,outcome_scan_ts:outcome.outcome_scan_ts,directional_return_pct:outcome.directional_return_pct,
    mfe_directional_pct_snapshot:outcome.mfe_directional_pct_snapshot,mae_directional_pct_snapshot:outcome.mae_directional_pct_snapshot,path_coverage_pct:outcome.path_coverage_pct??null,
    target_touched:targetTouched,invalidation_touched:invalidTouched,path_order_status:orderStatus,source:outcome.source,computed_ts:computedTs};
  return base('CLOSED_FACTUAL',null,{sample_id:sampleRecord.sample_id,material_digest:digest(material),outcome:material});
}

export function evaluateEntryAreaCalibrationReadiness(rows,{min_train=80,min_holdout=40,as_of_ts:asOfTs=Date.now()}={}){
  if(!Number.isSafeInteger(min_train)||min_train<1||!Number.isSafeInteger(min_holdout)||min_holdout<1||!stamp(asOfTs)) return base('NOT_VALIDATED_CONFIGURATION_INVALID','CALIBRATION_CONFIGURATION_INVALID');
  const input=Array.isArray(rows)?rows:[];
  const valid=[]; const seen=new Set();
  for(const row of input){
    const sample=row?.sample_record?.sample, outcome=row?.outcome_record?.outcome;
    if(row?.sample_record?.status!=='CAPTURED_PROSPECTIVE'||row?.outcome_record?.status!=='CLOSED_FACTUAL'||!obj(sample)||!obj(outcome)) continue;
    if(row.sample_record.material_digest!==digest(sample)||row.outcome_record.material_digest!==digest(outcome)||row.sample_record.sample_id!==row.outcome_record.sample_id) continue;
    if(!stamp(sample.observed_ts)||!stamp(outcome.outcome_scan_ts)||outcome.outcome_scan_ts>asOfTs||sample.observed_ts>=outcome.outcome_scan_ts) continue;
    if(seen.has(row.sample_record.sample_id)) return base('NOT_VALIDATED_DUPLICATE_SAMPLE','DUPLICATE_PROSPECTIVE_SAMPLE');
    seen.add(row.sample_record.sample_id); valid.push(row);
  }
  valid.sort((a,b)=>a.sample_record.sample.observed_ts-b.sample_record.sample.observed_ts);
  const required=min_train+min_holdout;
  if(valid.length<required) return base('NOT_VALIDATED_INSUFFICIENT_PROSPECTIVE_SAMPLE','INSUFFICIENT_PROSPECTIVE_SAMPLE',{closed_samples:valid.length,required_samples:required,min_train,min_holdout});
  const split=valid.length-min_holdout, train=valid.slice(0,split), holdout=valid.slice(split);
  const trainMax=train.at(-1).sample_record.sample.observed_ts, holdoutMin=holdout[0].sample_record.sample.observed_ts;
  if(!(trainMax<holdoutMin)) return base('NOT_VALIDATED_CHRONOLOGICAL_SPLIT_INVALID','CHRONOLOGICAL_OOS_SPLIT_INVALID',{closed_samples:valid.length});
  // Readiness is deliberately not validation. A separate, precommitted rule and
  // acceptance criteria are required before an immutable entry-area rule can
  // ever be marked VALIDATED_OUT_OF_SAMPLE.
  return base('CALIBRATION_DATA_READY_NOT_VALIDATED',null,{closed_samples:valid.length,train_samples:train.length,holdout_samples:holdout.length,train_max_observed_ts:trainMax,holdout_min_observed_ts:holdoutMin,rule_created:false,validated_out_of_sample:false});
}
