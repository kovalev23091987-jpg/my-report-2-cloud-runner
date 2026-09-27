import {attachNativeContext} from './liquidation-extension/runtime-bridge.mjs';
import { buildCanonicalAnalyticalResult } from './canonical-analytical-result.mjs';
import { computeCanonicalInterestFromRuntime } from './canonical-interest-score.mjs';
import { buildRoleEvidenceView } from './source-role-consumer.mjs';
import { buildPumpLiquidationZones } from './pump-liquidation-zones.mjs';
import { formatTelegramCompact } from './telegram-compact-formatter.mjs';
import { formatManualReport } from './manual-report-formatter.mjs';
import { safeUserReason } from './reason-registry.mjs';
import { consumeExistingSourceReceipts } from './existing-source-consumer.mjs';
import { normalizeInheritedFactEnvelope } from './inherited-fact-contract.mjs';
import { buildOutputSurfaceContract } from './output-surface-contract.mjs';
import { buildSnapshotChanges } from './snapshot-diff.mjs';
import { buildEvidenceDomainContract } from './evidence-domain-contract.mjs';
import { liquidationMapPriority } from './liquidation-extension/htx-liquidation-route.mjs';
import {buildSupplementalScoreEvidence,applySupplementalScoreAdjustment} from './supplemental-score-evidence.mjs';

export const CANONICAL_RUNTIME_ADAPTER_VERSION='canonical-runtime-adapter-v8-snapshot-diff-20260925';
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
function earlyCandidate(discovery){
 if(discovery?.early_candidate_bridge!==true)return null;
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
function targetsFrom(publication){
 const p=finite(publication?.scenario_plan?.target_price);return p===null?[]:[{price:p,source:'scenario_plan'}];
}
function entryFrom(publication){
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
 const early=discovery_row?.early_candidate_bridge===true;
 const exactMinute=opportunity?.newest_event?.minute_decomposition?.classification_allowed===true;
 const state=validState(route?.state)?route.state:(early&&exactMinute?'OBSERVE':'REJECTED');
 const direction=['LONG','SHORT'].includes(text(route?.direction).toUpperCase())?text(route.direction).toUpperCase():null;
 const price=currentPrice({publication:publication_shadow,liquidations:liquidation_intelligence,futures:futures_component,discovery:discovery_row});
 const liqPriority=liquidationMapPriority({
  contract,
  rolling_24h_change_pct:finite(discovery_row?.rolling_24h_change_pct),
  oi_change_pct:finite(discovery_row?.best_oi_build_pct),
  funding_shift_pct_points:finite(discovery_row?.funding_per_hour_pct),
  volume_ratio:finite(discovery_row?.volume_ratio),
  spot_anomaly:discovery_row?.early_candidate_bridge===true||discovery_row?.microstructure_priority_confirmed===true,
 });
 const pump=buildPumpLiquidationZones({
  contract,
  rolling_24h_change_pct:finite(discovery_row?.rolling_24h_change_pct),
  current_price:price,
  early_anomaly:liqPriority.priority==='EARLY_PREMOVE_ANOMALY',
  priority_reason:liqPriority.reason,
  realized:arr(liquidation_intelligence?.realized?.provider),
  projected:arr(liquidation_intelligence?.projected_clusters).map(r=>({...r,status:String(liquidation_intelligence?.projected_map_status||'').startsWith('CLOSED')?'CLOSED':'NOT_CLOSED',source:r?.provider||liquidation_intelligence?.provider||'PROJECTED_PROVIDER'})),
 });
 const overall=finite(publication_shadow?.score_interval?.score_lower_bound);
 const baseInterest=direction?computeCanonicalInterestFromRuntime({direction,discovery_row,shadow_decision,public_evidence,opportunity}):null;
 const supplementalScoreEvidence=buildSupplementalScoreEvidence({direction,internal_market_context});
 const supplementalScoreAdjustment=applySupplementalScoreAdjustment(baseInterest,supplementalScoreEvidence);
 const interest=supplementalScoreAdjustment.final_score;
 const freeSources=free_source_summary?.status==='CLOSED'&&free_source_summary?.owner==='source-registry.mjs'?free_source_summary:{version:'free-source-runtime-summary-missing-owner-v1',status:'NOT_CLOSED',owner:null,registry:{status:'NOT_CLOSED',entries:[]},entry_funnel:{status:'NOT_CLOSED',blockers:['UNKNOWN_INTERNAL_REASON'],blocker_details:[{code:'UNKNOWN_INTERNAL_REASON',full_ru:'Сводка источников не была передана назначенным владельцем; вывод оставлен в безопасном режиме.',short_ru:'сводка источников не подтверждена; вывод не готов',known:false}],has_unknown_reason:true},continuous_collector_status:'PARTIAL_REALTIME_COVERAGE',hot_cycle_external_request_delta:0,d1_write_delta:0};
 const supportingContext=consumeExistingSourceReceipts(existing_source_receipts||{});
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
 const nativeLiquidationView=attachNativeContext(pump,native_liquidation_acquisition,{contract,run_id,snapshot_id,observed_ts,direction});
 const canonical=buildCanonicalAnalyticalResult({
  snapshot_id:text(snapshot_id)||`UNBOUND:${text(contract)||'UNKNOWN'}:${observed_ts}`,
  run_id:text(run_id)||`UNBOUND:${observed_ts}`,
  observed_ts,
  universe:[{contract:text(contract)||null}],candidates:[{contract:text(contract)||null,ticker:text(contract)||null}],
  source_receipts:runtimeSourceReceipts,hard_gates:hardGates({discovery:discovery_row,publication:publication_shadow,executionHandoff:execution_handoff}),
  state,direction,overall_score_0_100:overall,coin_interest_score_0_100:interest,entry_readiness_score_0_100:null,
  reasons:reasonFacts({discovery:discovery_row,opportunity,publication:publication_shadow}),current_price:price,
  entry:entryFrom(publication_shadow),trigger:route?.trigger??null,invalidation:publication_shadow?.scenario_plan?.invalidation??null,
  targets:targetsFrom(publication_shadow),costs:publication_shadow?.cost_assessment??null,
  early_candidate:earlyCandidate(discovery_row),opportunity:opportunityCompact(opportunity),microstructure:microCompact(discovery_row),
  liquidations:nativeLiquidationView,data_quality:data_sufficiency??null,free_sources:freeSources,
  changes_from_previous:snapshotChanges.lines,
  metadata:{contract:text(contract)||null,oi_window_receipts,canonical_runtime_adapter:CANONICAL_RUNTIME_ADAPTER_VERSION,entry_readiness_score_status:'NOT_PROVISIONED_DO_NOT_INVENT',live_probability:null,validated_signal:false,automatic_execution:false,supporting_context:supportingContext,internal_market_context:internal_market_context&&internal_market_context.internal_only===true?internal_market_context:null,supplemental_score_adjustment:supplementalScoreAdjustment,source_role_view:sourceRoleView,snapshot_comparison:snapshotChanges,evidence_domain_contract:evidenceDomains,protective_filter:publication_shadow?.protective_filter??null},
 });
 const telegram=formatTelegramCompact(canonical,{facts:canonical?.reasons||[]});
 const manual=formatManualReport(canonical);
 const surface_contract=buildOutputSurfaceContract({canonical,telegram,manual});
 return {version:CANONICAL_RUNTIME_ADAPTER_VERSION,status:canonical?.status==='CLOSED'&&surface_contract.status==='CLOSED'?'CLOSED':'NOT_CLOSED',canonical,telegram,manual,surface_contract,parity_fingerprint:canonical?.analytical_fingerprint??null};
}
export default{CANONICAL_RUNTIME_ADAPTER_VERSION,buildRuntimeCanonicalBundle};
