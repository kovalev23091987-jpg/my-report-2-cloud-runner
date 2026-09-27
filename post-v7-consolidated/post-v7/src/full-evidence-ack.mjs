export const FULL_EVIDENCE_ACK_VERSION='post-v7-full-evidence-ack-v1-20260926';

const changesOf=result=>Number(result?.meta?.changes ?? result?.changes ?? NaN);
const rowsWrittenOf=result=>{
  const raw=result?.meta?.rows_written ?? result?.rows_written;
  if(raw===undefined||raw===null)return null;
  const n=Number(raw); return Number.isFinite(n)?n:null;
};

export function classifyFullEvidenceInsertAck(result,{duplicateConfirmed=false}={}){
  const changes=changesOf(result),rowsWritten=rowsWrittenOf(result);
  if(!Number.isInteger(changes)||changes<0) return {status:'ACK_INVALID',persisted:false,deduplicated:false,insert_changes:0,reason:'CHANGES_INVALID'};
  if(rowsWritten!==null&&(!Number.isInteger(rowsWritten)||rowsWritten<0)) return {status:'ACK_INVALID',persisted:false,deduplicated:false,insert_changes:changes,reason:'ROWS_WRITTEN_INVALID'};
  if(changes===1){
    if(rowsWritten!==null&&rowsWritten<1)return {status:'ACK_INVALID',persisted:false,deduplicated:false,insert_changes:changes,reason:'WRITE_ACK_INCONSISTENT'};
    return {status:'CLOSED',persisted:true,deduplicated:false,insert_changes:1,reason:null};
  }
  if(changes===0&&duplicateConfirmed===true){
    if(rowsWritten!==null&&rowsWritten!==0)return {status:'ACK_INVALID',persisted:false,deduplicated:false,insert_changes:0,reason:'DEDUP_WRITE_ACK_INCONSISTENT'};
    return {status:'DEDUPLICATED',persisted:false,deduplicated:true,insert_changes:0,reason:'PRIMARY_KEY_ALREADY_PRESENT'};
  }
  return {status:'NOT_PERSISTED',persisted:false,deduplicated:false,insert_changes:changes,reason:changes===0?'ZERO_ROW_WITHOUT_CONFIRMED_DUPLICATE':'UNEXPECTED_CHANGE_COUNT'};
}

export function fullEvidenceInsertSql(){
  return `INSERT INTO full_evidence_shadow_log (
    full_evidence_id, shadow_id, contract_code, observed_ts,
    rules_version, contract_version, adapters_version, mode,
    fixed_weights_json, weight_derivatives, weight_market_strength_spot,
    weight_smart_money_onchain, weight_supporting_risk, strategy_weights_changed,
    automatic_weight_tuning_enabled, htx_execution_gate_closed, dq_status,
    dq_usable_items, dq_total_items, dq_independent_groups, dq_observed_weight_pct,
    uncertainty_count, missing_weighted_chains_json, chain_status_json,
    conflicts_json, alias_verification_json, evidence_compact_json,
    relative_strength_json, prior_htx_shadow_json, full_dc_long, full_dc_short,
    live_probability, full_decision_eligible, live_signal, validated,
    telegram_started, trading_execution, missing_data_coerced_to_zero,
    cross_venue_dispersion_called_conflict, shadow_only, retention_days,
    persisted_ts, stage392_proof_bundle_json
  ) VALUES (
    ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,
    ?22,?23,?24,?25,?26,?27,?28,?29,?30,?31,?32,?33,?34,?35,?36,?37,?38,?39,?40,?41,?42,?43
  ) ON CONFLICT(full_evidence_id) DO NOTHING`;
}

export async function persistWithExplicitAck(db,{statement,full_evidence_id}={}){
  if(!db?.prepare||!statement||!full_evidence_id)return {status:'INVALID_INPUT',persisted:false,deduplicated:false,insert_changes:0};
  const result=await statement.run();
  const changes=changesOf(result);
  if(changes===1)return classifyFullEvidenceInsertAck(result);
  if(changes!==0)return classifyFullEvidenceInsertAck(result);
  const existing=await db.prepare(`SELECT full_evidence_id FROM full_evidence_shadow_log WHERE full_evidence_id=?1 LIMIT 1`).bind(full_evidence_id).first();
  return classifyFullEvidenceInsertAck(result,{duplicateConfirmed:Boolean(existing?.full_evidence_id===full_evidence_id)});
}

export default {FULL_EVIDENCE_ACK_VERSION,classifyFullEvidenceInsertAck,fullEvidenceInsertSql,persistWithExplicitAck};
