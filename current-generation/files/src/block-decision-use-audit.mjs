import {BLOCKS,validateEvidenceV2} from './evidence-v2.mjs';

import {auditRenderedBlockResults} from './block-result-context.mjs';

const finite=value=>value===null||value===undefined||value===''?null:Number.isFinite(Number(value))?Number(value):null;
const array=value=>Array.isArray(value)?value:[];

// Read only: eligibility and assigned consumers never prove application.
// This receipt changes neither score inputs nor report/Telegram text.
export function auditCanonicalBlockDecisionUse(canonical={}, {manual}={}) {
 const context=canonical?.metadata?.internal_market_context||{};
 const evidence=context?.evidence_v2||{};
 const coverage=evidence?.block_coverage||{};
 const score=canonical?.metadata?.supplemental_score_adjustment||{};
 const contract=String(canonical?.metadata?.contract||'');
 const decisionTs=finite(context.decision_ts);
 const rows=array(evidence.evidence).filter(row=>row?.htx_contract===contract);
 const directionClosed=['LONG','SHORT'].includes(canonical.direction);
 const scoreClosed=score.status==='CLOSED'&&finite(score.base_score)!==null&&finite(score.final_score)!==null;
 const rendered=auditRenderedBlockResults({canonical,manual});
 const meaningful=row=>!String(row.metric_family).includes('ABSENCE')&&(row.metric_family!=='UNIQUE_AUTHOR_ATTENTION'||Number(row.value)>0)&&(row.metric_family!=='ALT_OPTIONS_LIQUIDITY_CONTEXT'||row.option_risk_context?.status==='CLOSED');
 const blocks={};
 for(const [block,policy] of Object.entries(BLOCKS)) {
  const facts=rows.filter(row=>row.block_id===block);
  const valid=facts.filter(row=>decisionTs!==null&&validateEvidenceV2(row,{decision_ts:decisionTs}).usable);
  const directional=valid.filter(row=>Number(row.coverage_fraction)>0&&((finite(row.directional_strength)??0)!==0||(finite(row.risk_strength)??0)>0));
  const ids=new Set(valid.map(row=>row.evidence_id));
  const receipts=array(score.receipts).filter(receipt=>scoreClosed&&directionClosed&&receipt?.source_id==='EVIDENCE_V2'&&ids.has(receipt.provider_object_id)&&finite(receipt.score_contribution)!==null&&receipt.score_contribution!==0&&array(receipt.evidence_v2_receipts).some(row=>row.evidence_id===receipt.provider_object_id&&row.block_id===block&&row.reason==='CONSUMED'));
  const assessed=array(score.receipts).filter(receipt=>scoreClosed&&directionClosed&&receipt?.source_id==='EVIDENCE_V2'&&ids.has(receipt.provider_object_id)&&finite(receipt.score_contribution)!==null&&array(receipt.evidence_v2_receipts).some(row=>row.evidence_id===receipt.provider_object_id&&row.block_id===block&&row.consumer===policy.consumer&&row.reason==='CONSUMED'));
  const usedContext=rendered.context_receipts.filter(receipt=>receipt.block_id===block&&valid.some(row=>meaningful(row)&&(row.evidence_id===receipt.evidence_id||array(row.immutable_evidence_ids).length&&array(row.immutable_evidence_ids).every(id=>array(receipt.evidence_ids).includes(id)))));
  const assessedUseful=assessed.filter(receipt=>valid.some(row=>row.evidence_id===receipt.provider_object_id&&meaningful(row)));
  const participating=receipts.length>0||assessedUseful.length>0&&usedContext.length>0;
  const checked=coverage.blocks?.[block]?.checked===true;
  const contribution=receipts.reduce((sum,receipt)=>sum+Number(receipt.score_contribution),0);
  const control=coverage.blocks?.[block]?.decision_path==='ADMITTED_CONTROL_CONTEXT';
  const status=receipts.length?'SCORE_APPLICATION_PROVEN':directional.length?(score.status==='BASE_SCORE_MISSING'?'NO_BASE_SCORE_NO_APPLICATION':'ELIGIBLE_APPLICATION_NOT_PROVEN'):valid.length?'VALID_CONTEXT_NO_SCORE_EFFECT':control?'CONTROL_CHECK_APPLICATION_NOT_PROVEN':checked?'CHECKED_NO_APPLICABLE_FACT':'NOT_CHECKED';
  blocks[block]={assigned_consumer:policy.consumer,checked,observed_fact_count:facts.length,valid_fact_count:valid.length,directional_eligible_fact_count:directional.length,score_application_receipt_count:receipts.length,score_contribution:scoreClosed?Number(contribution.toFixed(4)):null,score_application_status:status,control_check_reported:control,control_decision_effect_proven:false,decision_assessment_receipt_count:assessed.length,rendered_useful_context_receipt_count:usedContext.length,participating,participation_status:receipts.length?'SCORE_EFFECT_PROVEN':participating?'NEUTRAL_ASSESSMENT_AND_RENDERING_PROVEN':'USE_NOT_PROVEN',evaluation_is_not_nonzero_weight:true};
 }
 const values=Object.values(blocks);
 return {schema:'report2-block-decision-use-audit-v2-same-run-assessments',run_id:canonical.run_id||null,snapshot_id:canonical.snapshot_id||null,contract:contract||null,decision_ts:decisionTs,score_status:score.status||'NOT_RECORDED',direction_closed:directionClosed,blocks,
  required_block_count:Object.keys(BLOCKS).length,checked_block_count:values.filter(row=>row.checked).length,directional_eligible_block_count:values.filter(row=>row.directional_eligible_fact_count>0).length,score_applied_block_count:values.filter(row=>row.score_application_receipt_count>0).length,control_check_reported_block_count:values.filter(row=>row.control_check_reported).length,
  participating_block_count:values.filter(row=>row.participating).length,participating_block_ids:Object.entries(blocks).filter(([,row])=>row.participating).map(([id])=>id),neutral_assessed_and_rendered_block_count:values.filter(row=>row.participation_status==='NEUTRAL_ASSESSMENT_AND_RENDERING_PROVEN').length,rendered_context_block_count:rendered.used_context_block_ids.length,
  all_blocks_have_proven_decision_effect:values.every(row=>row.score_application_receipt_count>0||row.control_decision_effect_proven),
  missing_effect_not_coerced_to_success:true,score_or_strategy_changed:false,internal_only:true};
}
