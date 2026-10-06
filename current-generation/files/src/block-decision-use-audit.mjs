import {verifyBoundedMoneyFlowReviews} from './bounded-money-flow-diagnostic.mjs';
import {BLOCKS,validateEvidenceV2,evidenceDedupKey} from './evidence-v2.mjs';

import {auditRenderedBlockResults} from './block-result-context.mjs';

const finite=value=>value===null||value===undefined||value===''?null:Number.isFinite(Number(value))?Number(value):null;
const array=value=>Array.isArray(value)?value:[];
const unique=values=>[...new Set(values.filter(v=>typeof v==='string'&&v.length>0))].sort();
export function summarizeAssignedSourceUse(details={}) {
 const routes=Object.values(details),ids=key=>unique(routes.flatMap(r=>array(r[key])));
 return {scope:'ASSIGNED_RUNTIME_ROUTES_NOT_ENTIRE_SOURCE_CATALOG',configured_route_count:routes.length,
  attempted_route_count:routes.filter(r=>r.attempted).length,checked_route_count:routes.filter(r=>r.checked).length,
  live_contacted_route_count:routes.filter(r=>r.actual_http>0).length,
  checked_without_new_http_route_count:routes.filter(r=>r.checked&&r.actual_http===0).length,
  validated_cache_route_count:routes.filter(r=>r.checked&&r.actual_http===0&&/CACHE|REUSE/i.test(r.cache_status||'')).length,
  routes_with_valid_facts:routes.filter(r=>r.valid_fact_count>0).length,
  routes_with_meaningful_facts:routes.filter(r=>r.meaningful_fact_count>0).length,
  routes_with_actual_use:routes.filter(r=>r.used_fact_count>0).length,routes_with_nonzero_score:routes.filter(r=>r.nonzero_score_fact_count>0).length,
  valid_provider_ids:ids('provider_ids'),used_provider_ids:ids('used_provider_ids'),rendered_provider_ids:ids('rendered_provider_ids'),
  nonzero_score_provider_ids:ids('nonzero_score_provider_ids'),neutral_assessed_provider_ids:ids('neutral_assessed_provider_ids'),unscored_diagnostic_provider_ids:ids('unscored_diagnostic_provider_ids'),
  used_declared_upstream_ids:ids('used_declared_upstream_ids'),used_physical_root_keys:ids('used_physical_root_keys'),
  valid_provider_count:ids('provider_ids').length,used_provider_count:ids('used_provider_ids').length,rendered_provider_count:ids('rendered_provider_ids').length,
  control_effect_provider_count:0,control_effect_not_proven:true,details,independence_claimed:false,rows_are_not_provider_count:true,
  checked_without_new_http_is_not_automatically_cache:true,provider_or_upstream_count_is_not_independent_vote_count:true,
  http_per_route_is_not_additive_across_blocks:true};
}

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
 const contextReviews=verifyBoundedMoneyFlowReviews(canonical?.metadata?.bounded_money_flow_diagnostic,{evidence:rows,contract,run_id:canonical.run_id,snapshot_id:canonical.snapshot_id,decision_ts:decisionTs});
 const blocks={};
 for(const [block,policy] of Object.entries(BLOCKS)) {
  const facts=rows.filter(row=>row.block_id===block);
  const valid=facts.filter(row=>decisionTs!==null&&validateEvidenceV2(row,{decision_ts:decisionTs}).usable);
  const directional=valid.filter(row=>Number(row.coverage_fraction)>0&&((finite(row.directional_strength)??0)!==0||(finite(row.risk_strength)??0)>0));
  const ids=new Set(valid.map(row=>row.evidence_id));
  const receipts=array(score.receipts).filter(receipt=>scoreClosed&&directionClosed&&receipt?.source_id==='EVIDENCE_V2'&&ids.has(receipt.provider_object_id)&&finite(receipt.score_contribution)!==null&&receipt.score_contribution!==0&&array(receipt.evidence_v2_receipts).some(row=>row.evidence_id===receipt.provider_object_id&&row.block_id===block&&row.reason==='CONSUMED'));
  const assessed=array(score.receipts).filter(receipt=>(scoreClosed&&directionClosed||score.status==='BASE_SCORE_MISSING'&&receipt.assessment_mode==='NEUTRAL_CONTEXT_ONLY_NO_BASE_SCORE'&&receipt.score_contribution===0&&valid.some(row=>row.evidence_id===receipt.provider_object_id&&(finite(row.directional_strength)??0)===0&&(finite(row.risk_strength)??0)===0))&&receipt?.source_id==='EVIDENCE_V2'&&ids.has(receipt.provider_object_id)&&finite(receipt.score_contribution)!==null&&array(receipt.evidence_v2_receipts).some(row=>row.evidence_id===receipt.provider_object_id&&row.block_id===block&&row.consumer===policy.consumer&&row.reason==='CONSUMED'));
  const usedContext=rendered.context_receipts.filter(receipt=>receipt.block_id===block&&valid.some(row=>meaningful(row)&&(row.evidence_id===receipt.evidence_id||array(row.immutable_evidence_ids).length&&array(row.immutable_evidence_ids).every(id=>array(receipt.evidence_ids).includes(id)))));
  const assessedUseful=assessed.filter(receipt=>valid.some(row=>row.evidence_id===receipt.provider_object_id&&meaningful(row)));
  const isRendered=row=>usedContext.some(receipt=>row.evidence_id===receipt.evidence_id||array(row.immutable_evidence_ids).length&&array(row.immutable_evidence_ids).every(id=>array(receipt.evidence_ids).includes(id)));
  const diagnosticReviews=contextReviews.filter(r=>r.block_id===block&&r.consumer===policy.consumer&&valid.some(row=>row.evidence_id===r.evidence_id&&isRendered(row)));
  const actuallyUsedIds=new Set(valid.filter(row=>meaningful(row)&&(receipts.some(r=>r.provider_object_id===row.evidence_id)||diagnosticReviews.some(r=>r.evidence_id===row.evidence_id)||assessedUseful.some(r=>r.provider_object_id===row.evidence_id)&&isRendered(row))).map(row=>row.evidence_id));
  const participating=actuallyUsedIds.size>0;
  const sourceDetails=Object.fromEntries(Object.entries(coverage.blocks?.[block]?.source_checks||{}).map(([source,check])=>{
   const sourceIds=new Set(array(check.valid_evidence_ids)),bound=valid.filter(row=>sourceIds.has(row.evidence_id));
   const providers=predicate=>unique(bound.filter(predicate).map(row=>row.provider_id));
   const used=bound.filter(row=>actuallyUsedIds.has(row.evidence_id));
   return[source,{status:check.status,attempted:check.attempted===true,checked:check.checked===true,actual_http:check.network_calls||0,valid_fact_count:bound.length,meaningful_fact_count:bound.filter(meaningful).length,assessed_fact_count:bound.filter(row=>assessed.some(r=>r.provider_object_id===row.evidence_id)).length,unscored_diagnostic_fact_count:bound.filter(row=>diagnosticReviews.some(r=>r.evidence_id===row.evidence_id)).length,rendered_fact_count:bound.filter(isRendered).length,used_fact_count:bound.filter(row=>actuallyUsedIds.has(row.evidence_id)).length,nonzero_score_fact_count:bound.filter(row=>receipts.some(r=>r.provider_object_id===row.evidence_id)).length,provider_ids:unique(bound.map(row=>row.provider_id)),used_provider_ids:providers(row=>actuallyUsedIds.has(row.evidence_id)),rendered_provider_ids:providers(isRendered),nonzero_score_provider_ids:providers(row=>receipts.some(r=>r.provider_object_id===row.evidence_id)),neutral_assessed_provider_ids:providers(row=>actuallyUsedIds.has(row.evidence_id)&&isRendered(row)&&assessedUseful.some(r=>r.provider_object_id===row.evidence_id&&r.score_contribution===0)),unscored_diagnostic_provider_ids:providers(row=>diagnosticReviews.some(r=>r.evidence_id===row.evidence_id)),used_declared_upstream_ids:unique(used.map(row=>row.upstream_id)),used_physical_root_keys:unique(used.map(evidenceDedupKey)),declared_upstream_ids:array(check.declared_upstream_ids),physical_root_keys:array(check.physical_root_keys),cache_status:check.cache_status??null,admission_status:check.admission_status??null,capability_resolved_without_route:check.capability_resolved_without_route===true,blocking_checks:array(check.blocking_checks),receipts:array(check.receipts)}];
  }));
  const source_accounting=summarizeAssignedSourceUse(sourceDetails);
  const checked=coverage.blocks?.[block]?.checked===true;
  const contribution=receipts.reduce((sum,receipt)=>sum+Number(receipt.score_contribution),0);
  const control=coverage.blocks?.[block]?.decision_path==='ADMITTED_CONTROL_CONTEXT';
  const status=receipts.length?'SCORE_APPLICATION_PROVEN':directional.length?(score.status==='BASE_SCORE_MISSING'?'NO_BASE_SCORE_NO_APPLICATION':'ELIGIBLE_APPLICATION_NOT_PROVEN'):valid.length?'VALID_CONTEXT_NO_SCORE_EFFECT':control?'CONTROL_CHECK_APPLICATION_NOT_PROVEN':checked?'CHECKED_NO_APPLICABLE_FACT':'NOT_CHECKED';
  blocks[block]={source_accounting,assigned_consumer:policy.consumer,checked,observed_fact_count:facts.length,valid_fact_count:valid.length,directional_eligible_fact_count:directional.length,score_application_receipt_count:receipts.length,score_contribution:scoreClosed?Number(contribution.toFixed(4)):null,score_application_status:status,control_check_reported:control,control_decision_effect_proven:false,decision_assessment_receipt_count:assessed.length,unscored_diagnostic_receipt_count:diagnosticReviews.length,rendered_useful_context_receipt_count:usedContext.length,participating,participation_status:receipts.length?'SCORE_EFFECT_PROVEN':participating&&assessedUseful.length?'NEUTRAL_ASSESSMENT_AND_RENDERING_PROVEN':participating&&diagnosticReviews.length?'UNSCORED_DIAGNOSTIC_AND_RENDERING_PROVEN':'USE_NOT_PROVEN',evaluation_is_not_nonzero_weight:true};
 }
 const values=Object.values(blocks);
 return {schema:'report2-block-decision-use-audit-v3-explicit-unscored-diagnostics',run_id:canonical.run_id||null,snapshot_id:canonical.snapshot_id||null,contract:contract||null,decision_ts:decisionTs,score_status:score.status||'NOT_RECORDED',direction_closed:directionClosed,blocks,
  required_block_count:Object.keys(BLOCKS).length,checked_block_count:values.filter(row=>row.checked).length,directional_eligible_block_count:values.filter(row=>row.directional_eligible_fact_count>0).length,score_applied_block_count:values.filter(row=>row.score_application_receipt_count>0).length,control_check_reported_block_count:values.filter(row=>row.control_check_reported).length,
  participating_block_count:values.filter(row=>row.participating).length,participating_block_ids:Object.entries(blocks).filter(([,row])=>row.participating).map(([id])=>id),neutral_assessed_and_rendered_block_count:values.filter(row=>row.participation_status==='NEUTRAL_ASSESSMENT_AND_RENDERING_PROVEN').length,unscored_diagnostic_assessed_and_rendered_block_count:values.filter(row=>row.participation_status==='UNSCORED_DIAGNOSTIC_AND_RENDERING_PROVEN').length,rendered_context_block_count:rendered.used_context_block_ids.length,
  all_blocks_have_proven_decision_effect:values.every(row=>row.score_application_receipt_count>0||row.control_decision_effect_proven),
  missing_effect_not_coerced_to_success:true,score_or_strategy_changed:false,internal_only:true};
}

