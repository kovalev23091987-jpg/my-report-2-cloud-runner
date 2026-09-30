import {attachNativeContext} from './liquidation-extension/runtime-bridge.mjs';
import { buildCanonicalAnalyticalResult } from './canonical-analytical-result.mjs';
import { computeCanonicalInterestFromRuntime } from './canonical-interest-score.mjs';
import { buildRoleEvidenceView } from './source-role-consumer.mjs';
import { buildPumpLiquidationZones } from './pump-liquidation-zones.mjs';
import { formatTelegramCompact } from './telegram-compact-formatter.mjs';
import { formatManualReport } from './manual-report-formatter.mjs';
import { safeUserReason } from './reason-registry.mjs';
import { consumeExistingSourceReceipts } from './existing-source-consumer.mjs';
import {consumeSpecialistContext} from './specialist-candidate-context.mjs';
import { normalizeInheritedFactEnvelope } from './inherited-fact-contract.mjs';
import { buildOutputSurfaceContract } from './output-surface-contract.mjs';
import { buildSnapshotChanges } from './snapshot-diff.mjs';
import { buildEvidenceDomainContract } from './evidence-domain-contract.mjs';
import { liquidationMapPriority } from './liquidation-extension/htx-liquidation-route.mjs';
import {buildSupplementalScoreEvidence,applySupplementalScoreAdjustment} from './supplemental-score-evidence.mjs';
import {buildDynamicLiquidationPanel} from './dynamic-liquidation-panel.mjs';
import {evaluateTechnicalMovePotential} from './technical-move-potential.mjs';
import {normalizeDirectionCandidate} from './market-contracts.mjs';

export const CANONICAL_RUNTIME_ADAPTER_VERSION='canonical-runtime-adapter-v13-current-cycle-20260929';
const finite=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;};
const text=v=>v===null||v===undefined?'':String(v).trim();
const arr=v=>Array.isArray(v)?v:[];
const validState=v=>['ENTRY_NOW_ANALYTICAL','ENTRY_NOW_VALIDATED','WAIT_FOR_TRIGGER','OBSERVE','REJECTED'].includes(text(v));
const firstFinite=(...values)=>{for(const v of values){const n=finite(v);if(n!==null)return n;}return null;};
function currentPrice({publication,liquidations,futures,discovery}={}){
 return firstFinite(
  publication?.scenario_plan?.execution_reference_price,
  liquidations?.provider_current_price,
  futures?.data?.mark_price,
  futures?.data?.ticker?.last_price,
  futures?.data?.ticker_24h?.last_price,
  discovery?.current_price,
 );
}
function sourceReceipts(publicEvidence){
 const rows=arr(publicEvidence?.evidence).slice(0,48);
 return normalizeInheritedFactEnvelope(rows,{
  default_contract_code:publicEvidence?.contract_code??null,
  default_observed_ts:publicEvidence?.observed_ts??null,
  default_quality_status:publicEvidence?.dq_status??publicEvidence?.data_quality?.status??'UNKNOWN',
 }).facts;
}
function reasonFacts({discovery,opportunity,publication}={}){
 const out=[];
 const q=finite(discovery?.early_candidate_quality_0_100);
 if(q!==null)out.push({label:'Качество раннего сигнала',value:Math.round(q),unit:'из 100',source:'V3 early'});
 if(discovery?.microstructure_priority_confirmed===true)out.push({label:'Микроструктурные подтверждения',value:arr(discovery?.microstructure_priority_domains).length,unit:'факта',source:'HTX'});
 if(discovery?.preselection_cross_venue_confirmed===true)out.push({label:'Межбиржевое подтверждение',event:'подтверждено свежим сохранённым receipt',source:'несколько бирж'});
 if(discovery?.preselection_cross_venue_conflict===true)out.push({label:'Расхождение между биржами',event:'обнаружено, не усреднялось',source:'несколько бирж'});
 const preselectionRouter=discovery?.preselection_metric_router;
 if(preselectionRouter?.status==='CLOSED'){
   const routed=finite(preselectionRouter?.selected_metric_count);
   const sources=arr(preselectionRouter?.selected_sources).slice(0,4);
   out.push({
     label:'Предвыбор источников',
     value:routed,
     unit:'метрик',
     source:sources.length?sources.join(', '):'межбиржевые данные',
     event:'выбраны по полноте, свежести, авторитетности и состоянию источника',
   });
 }
 const ev=opportunity?.newest_event;
 if(ev?.minute_decomposition?.classification_allowed===true){
   out.push({label:'Закрытые минутные свечи',value:ev.minute_decomposition.one_minute_bars,unit:'1м',source:'HTX'});
 }
 const routeReason=text(publication?.entry_signal?.reason);
 if(routeReason)out.push({label:'Состояние входа',event:safeUserReason(routeReason,{short:true}),internal_code:routeReason,source:'CANONICAL_ROUTER'});
 return out.slice(0,8);
}
function earlyCandidate(discovery,qualification){
 if(qualification?.closed!==true)return null;
 return {items:[{
  contract:discovery.contract,
  wave_id:discovery.early_candidate_wave_id??null,
  operational_priority_0_100:finite(discovery.early_candidate_operational_priority_0_100),
  early_detection_quality_0_100:finite(discovery.early_candidate_quality_0_100),
  reason:discovery.bridge_reason??null,
  evidence_domains:arr(discovery.early_candidate_evidence_domains),
  direction_hint:discovery.early_candidate_direction_hint??null,
  scheduler_priority_is_probability:false,
 }]};
}
function opportunityCompact(opportunity){
 const ev=opportunity?.newest_event;
 if(!ev)return null;
 return {
  version:opportunity?.version??null,status:opportunity?.status??null,event_id:ev.event_id??null,timeframe:ev.timeframe??null,
  event_close_ts:ev.event_close_ts??null,funnel_stage:ev?.funnel?.stage??null,
  minute_decomposition:ev.minute_decomposition??null,early_anomaly_classification:ev.early_anomaly_classification??null,
  event_type:ev.event_type??ev.type??null,candle:ev.candle?{open:finite(ev.candle.open),high:finite(ev.candle.high),low:finite(ev.candle.low),close:finite(ev.candle.close)}:null,
  hypotheses:ev.hypotheses??null,
 };
}
function microCompact(discovery){
 if(discovery?.early_candidate_bridge!==true)return null;
 return {status:discovery.microstructure_priority_confirmed===true?'CLOSED':'NOT_CLOSED',domains:arr(discovery.microstructure_priority_domains),continuous_coverage:'PARTIAL_REALTIME_COVERAGE'};
}
function hardGates({discovery,publication,executionHandoff}={}){
 const gates=[];
 if(discovery?.htx_futures_turnover_gate)gates.push(discovery.htx_futures_turnover_gate);
 if(publication?.publication_gate)gates.push({gate:'TZ101_PUBLICATION',status:publication.publication_gate.status??null,reason:publication.publication_gate.reason??null});
 if(executionHandoff)gates.push({gate:'HTX_EXECUTION_HANDOFF',status:executionHandoff.status??null,reason:executionHandoff.reason??null});
 return gates;
}
function qualifiedEarlyReceipt(discovery,decisionTs){
 const receipt=discovery?.early_candidate_receipt;
 const candidate=normalizeDirectionCandidate(receipt?.direction_hint??discovery?.early_candidate_direction_hint,{origin:'EARLY_CYCLE',source_ts:receipt?.source_ts??discovery?.early_candidate_source_ts,confirmation_state:receipt?.direction_state??'UNCONFIRMED'});
 const sourceTs=finite(receipt?.source_ts??receipt?.feature_observed_ts??discovery?.early_candidate_source_ts);
 const availableAt=finite(receipt?.available_at??discovery?.early_candidate_available_at??sourceTs);
 const sameContract=text(receipt?.contract)===text(discovery?.contract);
 const sameWave=text(receipt?.wave_id)!==''&&text(receipt?.wave_id)===text(discovery?.early_candidate_wave_id??discovery?.wave_id);
 const fresh=sourceTs!==null&&availableAt!==null&&sourceTs<=decisionTs&&availableAt<=decisionTs&&decisionTs-sourceTs<=15*60_000;
 const evidence=arr(receipt?.evidence);
 const directed=evidence.some(row=>{const side=text(row?.side).toUpperCase();return row?.status==='CLOSED'&&(side===candidate.direction||side==='BOTH');});
 const closed=discovery?.early_candidate_bridge===true&&receipt?.status==='CLOSED'&&sameContract&&sameWave&&fresh&&directed&&['LONG','SHORT'].includes(candidate.direction);
 return {closed,direction:closed?candidate.direction:null,candidate,source_ts:sourceTs,available_at:availableAt,same_contract:sameContract,same_wave:sameWave,fresh,directed,evidence_ids:arr(receipt?.evidence_ids)};
}
export function resolveCanonicalDirection({route=null,discovery=null,decision_ts=Date.now()}={}){
 const facts=[];
 const routed=normalizeDirectionCandidate(route?.direction,{origin:'FINAL_ROUTE',source_ts:route?.source_ts??decision_ts,confirmation_state:text(route?.state)});
 if(['WAIT_FOR_TRIGGER','ENTRY_NOW_ANALYTICAL','ENTRY_NOW_VALIDATED'].includes(text(route?.state))&&['LONG','SHORT'].includes(routed.direction))facts.push({direction:routed.direction,evidence_id:`FINAL_ROUTE:${text(route?.state)}:${routed.direction}`,origin:'FINAL_ROUTE'});
 const early=qualifiedEarlyReceipt(discovery,decision_ts);
 if(early.closed)for(const evidenceId of (early.evidence_ids.length?early.evidence_ids:[`EARLY:${text(discovery?.early_candidate_wave_id)}:${early.direction}`]))facts.push({direction:early.direction,evidence_id:text(evidenceId),origin:'EARLY_CYCLE'});
 const unique=[...new Map(facts.map(row=>[row.evidence_id,row])).values()];
 const directions=[...new Set(unique.map(row=>row.direction))];
 return {status:directions.length===1?'CLOSED':directions.length>1?'CONFLICT':'UNKNOWN',direction:directions.length===1?directions[0]:null,facts:unique,early_receipt:early,candidate_direction:directions.length===1?directions[0]:'UNKNOWN',authorized_entry_direction:['ENTRY_NOW_ANALYTICAL','ENTRY_NOW_VALIDATED'].includes(text(route?.state))&&directions.length===1&&routed.direction===directions[0]?directions[0]:'UNKNOWN'};
}
export function selectCanonicalPublicationState({route_state,route_hard_veto=false,early_candidate=false,early_quality=null,interest=null,direction=null,observe_contract_closed=true}={}){
 const routed=validState(route_state)?text(route_state):null;
 if(routed&&routed!=='REJECTED')return routed;
 const quality=finite(early_quality),score=finite(interest),dir=text(direction).toUpperCase();
 const hardVeto=route_hard_veto===true||route_hard_veto===1||text(route_hard_veto)==='1';
 const factualInterest=score??(early_candidate===true?quality:null);
 if(factualInterest!==null&&factualInterest>=70&&['LONG','SHORT'].includes(dir)&&!hardVeto&&observe_contract_closed===true)return 'OBSERVE';
 return 'REJECTED';
}
export function selectCanonicalInterestBasis({state,early_quality=null,deep_interest=null,early_qualified=null}={}){
 const early=finite(early_quality),deep=finite(deep_interest);
 if((early_qualified===true||(early_qualified===null&&text(state)==='OBSERVE'))&&early!==null&&early>=70)return{score:early,basis:'QUALIFIED_EARLY_DETECTION_SCORE'};
 return{score:deep,basis:deep===null?'NOT_CLOSED':'DEEP_CANONICAL_INTEREST_SCORE'};
}
function observationPlan({publication,route,direction,price,opportunity,observedTs,pump,discovery}={}){
 const scenario=publication?.scenario_plan;
 if(scenario?.entry_area_min_price!=null&&scenario?.entry_area_max_price!=null)return null;
 if(!['LONG','SHORT'].includes(direction)||finite(price)===null||price<=0)return null;
 const candle=opportunity?.newest_event?.candle||{};
 const eventHigh=finite(candle.high),eventLow=finite(candle.low);
 const routedLevel=finite(route?.trigger?.value);
 const anomalyClosed=opportunity?.newest_event?.minute_decomposition?.classification_allowed===true;
 const factualCandleLevel=anomalyClosed?(direction==='LONG'&&eventHigh>price?eventHigh:direction==='SHORT'&&eventLow<price?eventLow:null):null;
 const level=routedLevel??factualCandleLevel;
 const cancel=anomalyClosed?(direction==='LONG'&&eventLow<level?eventLow:direction==='SHORT'&&eventHigh>level?eventHigh:null):null;
 if(level===null||cancel===null)return null;
 // The stated cancellation condition must still be false at this snapshot.
 // An old candle can supply a target while its opposite boundary was already
 // crossed; publishing that as a live watch would contradict its own plan.
 if((direction==='LONG'&&price<cancel)||(direction==='SHORT'&&price>cancel))return null;
 const potential=evaluateTechnicalMovePotential({direction,current_price:price,trigger_price:level,liquidation_zones:pump,opportunity,rolling_24h_change_pct:finite(discovery?.rolling_24h_change_pct),oi_change_pct:finite(discovery?.best_oi_build_pct),volume_ratio:finite(discovery?.volume_ratio),funding_rate_pct:finite(discovery?.funding_per_hour_pct??discovery?.funding_rate_pct),early_anomaly:pump?.pump?.early_anomaly===true});
 if(potential.status!=='CLOSED')return null;
 const entry={area:`${level} USDT`,min_price:level,max_price:level,basis:routedLevel!==null?'ROUTED_FACTUAL_LEVEL':'VERIFIED_ANOMALY_CANDLE_LEVEL'};
 const targetPrice=potential.target_price;
 const expires=observedTs+30*60_000;
 const fallbackTrigger={trigger_type:'PRICE_CONFIRMATION',metric:'price',operator:direction==='LONG'?'>=':'<=',value:level,unit:'USDT',timeframe:'5m',expires_ts:expires,next_recheck_ts:observedTs+5*60_000,cancel_condition:`price${direction==='LONG'?'<':'>'}${cancel}`,level_origin:routedLevel!==null?'ROUTED_FACTUAL_LEVEL':'VERIFIED_ANOMALY_CANDLE_LEVEL'};
 return {entry,trigger:route?.trigger??fallbackTrigger,invalidation:{condition:route?.trigger?.cancel_condition??`price${direction==='LONG'?'<':'>'}${cancel}`,price:cancel},targets:[{price:targetPrice,source:'technically_proven_move_potential',start_closing:true,potential_move_pct:potential.potential_move_pct,basis:potential.basis,basis_ru:potential.basis_ru}],technical_move_potential:potential};
}
function targetsFrom(publication,observation){
 const p=finite(publication?.scenario_plan?.target_price);return p===null?(observation?.targets??[]):[{price:p,source:'scenario_plan',start_closing:true,potential_move_pct:finite(publication?.scenario_plan?.remaining_move_pct)}];
}
function entryFrom(publication,observation){
 const s=publication?.scenario_plan;if(!s)return null;
 const lo=finite(s.entry_area_min_price),hi=finite(s.entry_area_max_price);
 if(lo===null||hi===null)return s.entry_area?{area:s.entry_area}:null;
 return {area:s.entry_area??`${lo}–${hi} USDT`,min_price:lo,max_price:hi,rule_receipt_id:s.entry_area_rule_receipt_id??null,candidate_receipt:s.entry_area_candidate_receipt??null};
}
export function buildRuntimeCanonicalBundle({
 contract,run_id,snapshot_id,observed_ts,discovery_row=null,publication_shadow=null,opportunity=null,
 public_evidence=null,liquidation_intelligence=null,futures_component=null,execution_handoff=null,data_sufficiency=null,free_source_summary=null,smart_money_raw=null,shadow_decision=null,
 existing_source_receipts=null,previous_snapshot_context=null,oi_window_receipts=null,native_liquidation_acquisition=null,
 internal_market_context=null,
}={}){
 const route=publication_shadow?.entry_signal||null;
 const directionResolution=resolveCanonicalDirection({route,discovery:discovery_row,decision_ts:observed_ts});
 const early=directionResolution.early_receipt.closed===true;
 const earlyQuality=finite(discovery_row?.early_candidate_quality_0_100);
 const direction=directionResolution.direction;
 const deepInterest=direction?computeCanonicalInterestFromRuntime({direction,discovery_row,shadow_decision,public_evidence,opportunity}):null;
 const interestBasis=selectCanonicalInterestBasis({state:null,early_quality:earlyQuality,deep_interest:deepInterest,early_qualified:early});
 const baseInterest=interestBasis.score;
 const price=currentPrice({publication:publication_shadow,liquidations:liquidation_intelligence,futures:futures_component,discovery:discovery_row});
 const liqPriority=liquidationMapPriority({
  contract,
  move_pct:finite(discovery_row?.rolling_24h_change_pct),
  oi_delta_pct:finite(discovery_row?.best_oi_build_pct),
  funding_shift_abs:finite(discovery_row?.funding_per_hour_pct),
  volume_spike_ratio:finite(discovery_row?.volume_ratio),
  spot_flow_anomaly:discovery_row?.early_candidate_bridge===true||discovery_row?.microstructure_priority_confirmed===true,
 });
 const pump=buildPumpLiquidationZones({
  contract,
  rolling_24h_change_pct:finite(discovery_row?.rolling_24h_change_pct),
  current_price:price,
  early_anomaly:liqPriority.priority==='EARLY_PREMOVE_ANOMALY',
  priority_reason:liqPriority.reason,
  realized:arr(liquidation_intelligence?.realized?.provider),
  projected:arr(liquidation_intelligence?.projected_clusters).map(r=>({...r,status:String(liquidation_intelligence?.projected_map_status||'').startsWith('CLOSED')?'CLOSED':'NOT_CLOSED',source:r?.provider||liquidation_intelligence?.provider||'PROJECTED_PROVIDER'})),
  calculation_context:{
   oi_change_pct:finite(discovery_row?.best_oi_build_pct),
   funding_rate_pct:finite(discovery_row?.funding_per_hour_pct??discovery_row?.funding_rate_pct),
   volume_ratio:finite(discovery_row?.volume_ratio),
  },
 });
 const nativeLiquidationView=attachNativeContext(pump,native_liquidation_acquisition,{contract,run_id,snapshot_id,observed_ts,direction});
 const nativeContexts=[nativeLiquidationView?.native_extension,...arr(nativeLiquidationView?.independent_extensions)].filter(Boolean);
 const liquidationPanel=buildDynamicLiquidationPanel({contexts:nativeContexts,reference_price:price,observed_ts});
 const supplementalScoreEvidence=buildSupplementalScoreEvidence({direction,internal_market_context,liquidation_panel:liquidationPanel});
 const supplementalScoreAdjustment=applySupplementalScoreAdjustment(baseInterest,supplementalScoreEvidence);
 const interest=supplementalScoreAdjustment.final_score;
 const nativeTargets=arr(liquidationPanel?.clusters).filter(row=>row?.decision_target_eligible===true&&finite(row.target_price)!==null).map(row=>({kind:'NATIVE_SCOPED',price:row.target_price,exact_notional_usdt:row.contains_estimates?null:row.largest_provider_position_usd,strength_score_0_100:null,strength_label_ru:null,source:arr(row.providers).join('+'),source_ts:row.source_ts,decision_target_eligible:true,path_obstacle_eligible:row.path_obstacle_eligible===true}));
 const proofZones={...pump,above:[...arr(pump?.above),...nativeTargets.filter(row=>row.price>price)],below:[...arr(pump?.below),...nativeTargets.filter(row=>row.price<price)]};
 const routedState=validState(route?.state)?text(route.state):null;
 const needsTechnicalFallback=(!routedState||['REJECTED','OBSERVE','WAIT_FOR_TRIGGER'].includes(routedState))&&finite(publication_shadow?.scenario_plan?.target_price)===null;
 const observation=needsTechnicalFallback?observationPlan({publication:publication_shadow,route,direction,price,opportunity,observedTs:observed_ts,pump:proofZones,discovery:discovery_row}):null;
 const scenario=publication_shadow?.scenario_plan;
 const existingPlanClosed=Boolean(
  entryFrom(publication_shadow,null)&&
  (route?.trigger||scenario?.trigger)&&
  (scenario?.invalidation||route?.trigger?.cancel_condition)&&
  finite(scenario?.target_price)!==null&&
  finite(scenario?.remaining_move_pct)!==null&&finite(scenario?.remaining_move_pct)>=5
 );
 const observationPlanClosed=Boolean(observation?.entry&&observation?.trigger&&observation?.invalidation&&arr(observation?.targets).length&&finite(observation?.technical_move_potential?.potential_move_pct)>=5);
 const effectiveState=selectCanonicalPublicationState({route_state:routedState,route_hard_veto:route?.hard_veto,early_candidate:early,early_quality:earlyQuality,interest,direction,observe_contract_closed:existingPlanClosed||observationPlanClosed});
 const routedOverall=finite(publication_shadow?.score_interval?.score_lower_bound);
 const overall=effectiveState==='OBSERVE'?null:routedOverall;
 const freeSources=free_source_summary?.status==='CLOSED'&&free_source_summary?.owner==='source-registry.mjs'?free_source_summary:{version:'free-source-runtime-summary-missing-owner-v1',status:'NOT_CLOSED',owner:null,registry:{status:'NOT_CLOSED',entries:[]},entry_funnel:{status:'NOT_CLOSED',blockers:['UNKNOWN_INTERNAL_REASON'],blocker_details:[{code:'UNKNOWN_INTERNAL_REASON',full_ru:'Сводка источников не была передана назначенным владельцем; вывод оставлен в безопасном режиме.',short_ru:'сводка источников не подтверждена; вывод не готов',known:false}],has_unknown_reason:true},continuous_collector_status:'PARTIAL_REALTIME_COVERAGE',hot_cycle_external_request_delta:0,d1_write_delta:0};
 const supportingContext=consumeExistingSourceReceipts(existing_source_receipts||{});
 const specialistContext=consumeSpecialistContext({sources:internal_market_context?.candidate_sources||{},contract,now:finite(observed_ts),primary_price:internal_market_context?.htx_reference_price,asset_identity:internal_market_context?.candidate_context?.asset_identity});
 supportingContext.blocks={...supportingContext.blocks,...specialistContext.blocks};
 supportingContext.facts=[...specialistContext.facts,...supportingContext.facts];
 supportingContext.specialist_context_status=specialistContext.status;
 if(specialistContext.facts.length)supportingContext.status='CLOSED';
 const runtimeSourceReceipts=[
  ...sourceReceipts(public_evidence),
  ...(futures_component?.ok===true&&futures_component?.data?[{
    metric:'HTX_EXECUTION_SNAPSHOT',source:'HTX',venue:'HTX',status:'CLOSED',market_type:'USDT_M_PERPETUAL',
    source_ts:futures_component?.available_ts??futures_component?.data?.ts??observed_ts,observed_ts,unit:null,value:null,
    reason_code:null,coverage_pct:100,
  }]:[]),
 ];
 const sourceRoleView=buildRoleEvidenceView(runtimeSourceReceipts);
 const snapshotChanges=buildSnapshotChanges({
  previous_snapshot_context,
  current_public_evidence:public_evidence,
  observed_ts,
  max_lines:5,
 });
 const evidenceDomains=buildEvidenceDomainContract({opportunity,public_evidence,futures_component,liquidation_intelligence});
 const canonical=buildCanonicalAnalyticalResult({
  snapshot_id:text(snapshot_id)||`UNBOUND:${text(contract)||'UNKNOWN'}:${observed_ts}`,
  run_id:text(run_id)||`UNBOUND:${observed_ts}`,
  observed_ts,
  universe:[{contract:text(contract)||null}],candidates:[{contract:text(contract)||null,ticker:text(contract)||null}],
  source_receipts:runtimeSourceReceipts,hard_gates:hardGates({discovery:discovery_row,publication:publication_shadow,executionHandoff:execution_handoff}),
  state:effectiveState,direction,overall_score_0_100:overall,coin_interest_score_0_100:interest,entry_readiness_score_0_100:null,
  reasons:reasonFacts({discovery:discovery_row,opportunity,publication:publication_shadow}),current_price:price,
  entry:entryFrom(publication_shadow,observation)??observation?.entry??null,trigger:route?.trigger??observation?.trigger??null,invalidation:publication_shadow?.scenario_plan?.invalidation??observation?.invalidation??null,
  targets:targetsFrom(publication_shadow,observation),costs:publication_shadow?.cost_assessment??null,
  early_candidate:earlyCandidate(discovery_row,directionResolution.early_receipt),opportunity:opportunityCompact(opportunity),microstructure:microCompact(discovery_row),
  liquidations:nativeLiquidationView,data_quality:data_sufficiency??null,free_sources:freeSources,
  changes_from_previous:snapshotChanges.lines,
  metadata:{contract:text(contract)||null,oi_window_receipts,canonical_runtime_adapter:CANONICAL_RUNTIME_ADAPTER_VERSION,entry_readiness_score_status:'NOT_PROVISIONED_DO_NOT_INVENT',live_probability:null,validated_signal:false,automatic_execution:false,minimum_reportable_move_pct:5,technical_move_potential:observation?.technical_move_potential??(publication_shadow?.scenario_plan?.remaining_move_pct>=5?{status:'CLOSED',basis:'PRECOMMITTED_MEASURED_STRUCTURE',potential_move_pct:publication_shadow.scenario_plan.remaining_move_pct,target_price:publication_shadow.scenario_plan.target_price}:null),start_closing_price:targetsFrom(publication_shadow,observation)?.[0]?.price??null,idea_basis:pump?.pump?.is_pump===true?'LIQUIDATION_PUMP':(opportunity?.newest_event?.minute_decomposition?.classification_allowed===true||opportunity?.newest_event?.early_anomaly_classification)?'CANDLE_ANOMALY':'MULTI_FACTOR',supporting_context:supportingContext,internal_market_context:internal_market_context&&internal_market_context.internal_only===true?internal_market_context:null,dynamic_liquidation_panel:liquidationPanel,supplemental_score_adjustment:supplementalScoreAdjustment,score_basis:{selected:interestBasis.basis,qualified_early_detection_0_100:earlyQuality,deep_canonical_interest_0_100:deepInterest,routed_overall_0_100:routedOverall},direction_resolution:directionResolution,scenario_plan_transfer:{existing_plan_closed:existingPlanClosed,fallback_plan_closed:observationPlanClosed,reason:effectiveState==='REJECTED'&&!existingPlanClosed&&!observationPlanClosed?(observation?.entry&&!observation?.targets?.length?'TARGET_NOT_PROVEN':'PLAN_NOT_CLOSED'):null},source_role_view:sourceRoleView,snapshot_comparison:snapshotChanges,evidence_domain_contract:evidenceDomains,protective_filter:publication_shadow?.protective_filter??null},
 });
 const telegram=formatTelegramCompact(canonical,{facts:canonical?.reasons||[]});
 const manual=formatManualReport(canonical);
 const surface_contract=buildOutputSurfaceContract({canonical,telegram,manual});
 return {version:CANONICAL_RUNTIME_ADAPTER_VERSION,status:canonical?.status==='CLOSED'&&surface_contract.status==='CLOSED'?'CLOSED':'NOT_CLOSED',canonical,telegram,manual,surface_contract,parity_fingerprint:canonical?.analytical_fingerprint??null};
}
export default{CANONICAL_RUNTIME_ADAPTER_VERSION,resolveCanonicalDirection,selectCanonicalPublicationState,selectCanonicalInterestBasis,buildRuntimeCanonicalBundle};
