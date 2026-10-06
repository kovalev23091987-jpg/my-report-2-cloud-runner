import {verifiedObservationRange} from './observation-technical-range.mjs';
import {readProspectiveOpportunity} from './prospective-opportunity-view.mjs';
import {bindSupplementalSupportingReceipts,attachSupplementalSupportingUse} from './supplemental-supporting-bridge.mjs';
import {reviewSectorRelativeStrength} from './sector-relative-strength-review.mjs';
import {reviewBoundedMoneyFlow} from './bounded-money-flow-diagnostic.mjs';
import {qualifyEarlyDirectionReceipt as qualifiedEarlyReceipt} from './early-direction-receipt.mjs';
import {readHtxTechnicalStructure} from './htx-technical-structure.mjs';
import {capturedTrackedBands} from './byk-tracked-future-map.mjs';
import {capturedFutureMap,capturedNativeFutureMaps,capturedCoinLobsterHint} from './future-liquidation-map-source.mjs';
import {selectComparableVolumeProfiles} from './cross-venue-volume-profile.mjs';
import {volumeProfileFacts,applyVolumeProfileToLiquidationPanel} from './htx-volume-profile.mjs';
import {attachNativeContext} from './liquidation-extension/runtime-bridge.mjs';
import { buildCanonicalAnalyticalResult } from './canonical-analytical-result.mjs';
import { computeCanonicalInterestFromRuntime } from './canonical-interest-score.mjs';
import { buildRoleEvidenceView } from './source-role-consumer.mjs';
import { buildPumpLiquidationZones,coinLobsterFutureRows } from './pump-liquidation-zones.mjs';
import { formatTelegramCompact } from './telegram-compact-formatter.mjs';
import { formatManualReport } from './manual-report-formatter.mjs';
import { safeUserReason } from './reason-registry.mjs';
import { consumeExistingSourceReceipts } from './existing-source-consumer.mjs';
import {consumeSectorContext} from './sector-context.mjs';
import {consumeBlockResultContext,auditRenderedBlockResults} from './block-result-context.mjs';
import {precommittedTechnicalPlanEvidence} from './technical-plan-context.mjs';
import {consumeCanonicalExecutionContext,buildCanonicalExecutionEvidence,buildCanonicalExecutionRoleFacts,bindVerifiedPrimarySourceFacts} from './execution-report-context.mjs';
import {auditCandidateBlocks} from './candidate-evidence-v2-runtime.mjs';
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

export const CANONICAL_RUNTIME_ADAPTER_VERSION='canonical-runtime-adapter-v17-forward-technical-observation-20261006';
const finite=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;};
const text=v=>v===null||v===undefined?'':String(v).trim();
const arr=v=>Array.isArray(v)?v:[];
const validState=v=>['ENTRY_NOW_ANALYTICAL','ENTRY_NOW_VALIDATED','WAIT_FOR_TRIGGER','OBSERVE','REJECTED'].includes(text(v));
const firstFinite=(...values)=>{for(const v of values){const n=finite(v);if(n!==null)return n;}return null;};
const NATIVE_LIQUIDATION_SOURCE_IDS=Object.freeze(['HYPERLIQUID_NATIVE','LIGHTER_NATIVE','GMX_NATIVE','GTRADE_NATIVE','OXARCHIVE_HL_BUCKETS']);
function nativeLiquidationSourceId(value){
 const provider=text(value?.provider??value?.venue).toUpperCase();
 if(provider.includes('HYPERLIQUID'))return'HYPERLIQUID_NATIVE';
 if(provider.includes('LIGHTER'))return'LIGHTER_NATIVE';
 if(provider.includes('GMX'))return'GMX_NATIVE';
 if(provider.includes('GTRADE')||provider.includes('GAINS'))return'GTRADE_NATIVE';
 if(provider.includes('0XARCHIVE')||provider.includes('OXARCHIVE'))return'OXARCHIVE_HL_BUCKETS';
 return null;
}
function liquidationCoverageGate(context,contract){
 const admission=context?.liquidation_coverage_admission;
 const exact=admission?.eligible===true&&text(admission?.contract).toUpperCase()===text(contract).toUpperCase()&&Array.isArray(admission?.source_ids);
 return {admission:admission??null,eligible:exact,allowed:new Set(exact?admission.source_ids:[])};
}
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
export function resolveCanonicalDirection({route=null,discovery=null,decision_ts=Date.now()}={}){
 const facts=[];
 const routed=normalizeDirectionCandidate(route?.direction,{origin:'FINAL_ROUTE',source_ts:route?.source_ts??decision_ts,confirmation_state:text(route?.state)});
 // OBSERVE is also produced by the committed final-decision router. Retain its
 // confirmed analytical direction without authorizing an entry.
 if(['OBSERVE','WAIT_FOR_TRIGGER','ENTRY_NOW_ANALYTICAL','ENTRY_NOW_VALIDATED'].includes(text(route?.state))&&['LONG','SHORT'].includes(routed.direction))facts.push({direction:routed.direction,evidence_id:`FINAL_ROUTE:${text(route?.state)}:${routed.direction}`,origin:'FINAL_ROUTE'});
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
function observationPlan({contract,publication,route,direction,price,opportunity,observedTs,pump,discovery,technical_evidence=[],allow_range_observation=false,audit=null}={}){
 // Diagnostic receipt only: retain the producer's original clocks and reasons.
 // No score, publication, freshness, plan or entry condition changes here.
 const note=fields=>{if(audit&&typeof audit==='object')Object.assign(audit,fields);};
 const reject=reason=>{note({status:'NOT_CLOSED',reason});return null;};
 note({version:'observation-plan-diagnostic-v1-20261006',contract,decision_ts:observedTs,direction:direction??null,current_price:finite(price),score_contribution:0,entry_authorized_by_receipt:false});
 const scenario=publication?.scenario_plan;
 if(scenario?.entry_area_min_price!=null&&scenario?.entry_area_max_price!=null)return reject('EXISTING_ENTRY_AREA_SUPPRESSES_FALLBACK');
 if(!['LONG','SHORT'].includes(direction)||finite(price)===null||price<=0)return reject(!['LONG','SHORT'].includes(direction)?'DIRECTION_NOT_CLOSED':'EXACT_CURRENT_PRICE_REQUIRED');
 const prospective=readProspectiveOpportunity(opportunity,{contract,decision_ts:observedTs});
 const observationOpportunity=prospective?{...opportunity,newest_event:prospective}:opportunity;
 const event=observationOpportunity?.newest_event;
 note({prospective_input_present:Boolean(opportunity?.live_observation_event),prospective_receipt_usable:Boolean(prospective),event_id:event?.event_id??null,event_close_ts:finite(event?.event_close_ts),producer_observed_ts:finite(prospective?.observed_ts??opportunity?.observed_ts),producer_available_at:finite(prospective?.available_at),statistical_episode_id:prospective?.statistical_episode_id??null});
 const candle=event?.candle||{};
 const eventHigh=finite(candle.high),eventLow=finite(candle.low);
 const routedLevel=finite(route?.trigger?.value);
 const anomalyClosed=observationOpportunity?.newest_event?.minute_decomposition?.classification_allowed===true;
 const factualCandleLevel=anomalyClosed?(direction==='LONG'&&eventHigh>price?eventHigh:direction==='SHORT'&&eventLow<price?eventLow:null):null;
 let level=routedLevel??factualCandleLevel;
 let cancel=anomalyClosed?(direction==='LONG'&&eventLow<level?eventLow:direction==='SHORT'&&eventHigh>level?eventHigh:null):null;
 // A stale anomaly boundary behind the current price is not a forward watch.
 // A qualified early direction may instead reuse this snapshot's verified N10
 // range. Existing routed triggers/cancellation and entry plans keep precedence.
 const range=allow_range_observation&&routedLevel===null&&(level===null||cancel===null)?verifiedObservationRange({evidence:technical_evidence,contract,direction,price,decision_ts:observedTs}):null;
 if(range){level=range.level;cancel=range.cancel;note({technical_range_receipt:range});}
 note({anomaly_candle_closed:anomalyClosed,event_high:eventHigh,event_low:eventLow,routed_trigger_price:routedLevel,selected_trigger_price:level,cancellation_price:cancel});
 if(level===null||cancel===null)return reject(!anomalyClosed?'CLOSED_ANOMALY_CANDLE_REQUIRED':level===null?'NO_FORWARD_FACTUAL_PRICE_TRIGGER':'OPPOSITE_FACTUAL_CANDLE_BOUNDARY_REQUIRED');
 // The stated cancellation condition must still be false at this snapshot.
 // An old candle can supply a target while its opposite boundary was already
 // crossed; publishing that as a live watch would contradict its own plan.
 if((direction==='LONG'&&price<cancel)||(direction==='SHORT'&&price>cancel))return reject('CANCELLATION_ALREADY_TRUE_AT_SNAPSHOT');
 const potential=range?{status:'NOT_CLOSED',reason:'FORWARD_OBSERVATION_CONDITIONS_ONLY',potential_move_pct:null,target_price:null}:evaluateTechnicalMovePotential({direction,current_price:price,trigger_price:level,liquidation_zones:pump,opportunity:observationOpportunity,rolling_24h_change_pct:finite(discovery?.rolling_24h_change_pct),oi_change_pct:finite(discovery?.best_oi_build_pct),volume_ratio:finite(discovery?.volume_ratio),funding_rate_pct:finite(discovery?.funding_per_hour_pct??discovery?.funding_rate_pct),early_anomaly:pump?.pump?.early_anomaly===true});
 const entry={area:`${level} USDT`,min_price:level,max_price:level,basis:range?range.basis:routedLevel!==null?'ROUTED_FACTUAL_LEVEL':'VERIFIED_ANOMALY_CANDLE_LEVEL'};
 const targetPrice=potential.status==='CLOSED'&&finite(potential.target_price)!==null&&finite(potential.potential_move_pct)>0?potential.target_price:null;
 const expires=observedTs+30*60_000;
 const fallbackTrigger={trigger_type:'PRICE_CONFIRMATION',metric:'price',operator:direction==='LONG'?'>=':'<=',value:level,unit:'USDT',timeframe:'5m',expires_ts:expires,next_recheck_ts:observedTs+5*60_000,cancel_condition:`price${direction==='LONG'?'<':'>'}${cancel}`,level_origin:range?range.basis:routedLevel!==null?'ROUTED_FACTUAL_LEVEL':'VERIFIED_ANOMALY_CANDLE_LEVEL'};
 note({status:'CLOSED',reason:range?'VERIFIED_TECHNICAL_RANGE_OBSERVATION_CLOSED':'EXISTING_FACTUAL_OBSERVATION_PLAN_CLOSED'});
 return {entry,trigger:route?.trigger??fallbackTrigger,invalidation:{condition:route?.trigger?.cancel_condition??`price${direction==='LONG'?'<':'>'}${cancel}`,price:cancel},targets:targetPrice===null?[]:[{price:targetPrice,source:'technically_proven_move_potential',start_closing:true,potential_move_pct:potential.potential_move_pct,basis:potential.basis,basis_ru:potential.basis_ru}],technical_move_potential:potential,...(prospective?{prospective_observation_receipt:{event_id:prospective.event_id,statistical_episode_id:prospective.statistical_episode_id,source_ts:prospective.source_ts,available_at:prospective.available_at,contract:prospective.contract,independent_vote_added:false,entry_authorized:false}}:{})};
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
 internal_market_context=null,execution_context_source=null,
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
 const liquidationGate=liquidationCoverageGate(internal_market_context,contract);
 const bykFutureAllowed=liquidationGate.allowed.has('BYKARANTELI_FUTURE_MAP');
 const trackedHlAllowed=liquidationGate.allowed.has('BYK_TRACKED_HL_BANDS');
 const coinLobsterAllowed=liquidationGate.allowed.has('COINLOBSTER_FUTURE_MODEL');
 const nativeAcquisitionAllowed=NATIVE_LIQUIDATION_SOURCE_IDS.some(source=>liquidationGate.allowed.has(source));
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
  projected:bykFutureAllowed?arr(liquidation_intelligence?.projected_clusters).map(r=>({...r,status:String(liquidation_intelligence?.projected_map_status||'').startsWith('CLOSED')?'CLOSED':'NOT_CLOSED',source:r?.provider||liquidation_intelligence?.provider||'PROJECTED_PROVIDER'})):[],
  calculation_context:{
   source_ts:finite(discovery_row?.source_ts??discovery_row?.snapshot_ts),
   market_source_ts:finite(discovery_row?.source_ts??discovery_row?.snapshot_ts),
   open_interest_value_usdt:finite(discovery_row?.open_interest_value_usdt),
   turnover_24h_usdt:finite(discovery_row?.turnover_24h_usdt),
   oi_change_pct:discovery_row?.oi_change_pct??{'4h':finite(discovery_row?.best_oi_build_pct)},
   price_change_pct:discovery_row?.price_change_pct??{'24h':finite(discovery_row?.rolling_24h_change_pct)},
   funding_rate_pct:finite(discovery_row?.funding_per_hour_pct??discovery_row?.funding_rate_pct),
   market_24h:discovery_row?.market_24h??null,
   price_tick:finite(discovery_row?.price_tick),
   volume_ratio:finite(discovery_row?.volume_ratio),
  },
  volume_profile:internal_market_context?.volume_profile??null,
 });
 const attachedNativeLiquidationView=attachNativeContext(pump,nativeAcquisitionAllowed?native_liquidation_acquisition:null,{contract,run_id,snapshot_id,observed_ts,direction});
 const nativeContexts=[attachedNativeLiquidationView?.native_extension,...arr(attachedNativeLiquidationView?.independent_extensions)]
  .filter(context=>{const source=nativeLiquidationSourceId(context);return source&&liquidationGate.allowed.has(source);});
 const nativeLiquidationView={...attachedNativeLiquidationView,native_extension:nativeContexts[0]??(native_liquidation_acquisition?{status:'COVERAGE_GATE_NOT_ADMITTED',reason:liquidationGate.admission?.status??'COVERAGE_DATABASE_NOT_AVAILABLE'}:attachedNativeLiquidationView?.native_extension),independent_extensions:nativeContexts.slice(1),coverage_admission:liquidationGate.admission};
 const volumeConsensus=selectComparableVolumeProfiles({contract,now:observed_ts,reference_price:price,direction,peer_sources:internal_market_context?.cross_exchange_risk?.volume_profiles?.sources||{}});
 const volumeProfile=volumeConsensus.primary;
 const liquidationPanel=applyVolumeProfileToLiquidationPanel(buildDynamicLiquidationPanel({contexts:nativeContexts,reference_price:price,observed_ts}),volumeProfile,{contract,now:observed_ts,reference_price:price,consensus_factor:volumeConsensus.factor});
 const futureMapSource=bykFutureAllowed?capturedFutureMap({contract,run_id,snapshot_id,observed_ts}):{source:'BYKARANTELI_FUTURE_MAP',status:'COVERAGE_GATE_NOT_ADMITTED',maps:[],network_calls:0};
 const trackedHlView=trackedHlAllowed?capturedTrackedBands({contract,run_id,observed_ts}):{source:'BYK_TRACKED_HL_BANDS',status:'COVERAGE_GATE_NOT_ADMITTED',maps:[],network_calls:0};
 const nativeFutureMaps=capturedNativeFutureMaps({contract,run_id}).filter(map=>{const source=nativeLiquidationSourceId(map);return source&&liquidationGate.allowed.has(source);});
 const renderedLiquidationView={...nativeLiquidationView,...buildPumpLiquidationZones({contract,rolling_24h_change_pct:finite(discovery_row?.rolling_24h_change_pct),current_price:price,early_anomaly:liqPriority.priority==='EARLY_PREMOVE_ANOMALY',priority_reason:liqPriority.reason,provider_maps:[...futureMapSource.maps,...trackedHlView.maps,...nativeFutureMaps],native_contexts:nativeContexts,projected:coinLobsterAllowed?coinLobsterFutureRows(internal_market_context?.cross_exchange_risk?.future_provider_models):[],calculation_context:{source_ts:finite(discovery_row?.source_ts??discovery_row?.snapshot_ts),market_source_ts:finite(discovery_row?.source_ts??discovery_row?.snapshot_ts),open_interest_value_usdt:finite(discovery_row?.open_interest_value_usdt),turnover_24h_usdt:finite(discovery_row?.turnover_24h_usdt),oi_change_pct:discovery_row?.oi_change_pct??{'4h':finite(discovery_row?.best_oi_build_pct)},price_change_pct:discovery_row?.price_change_pct??{'24h':finite(discovery_row?.rolling_24h_change_pct)},funding_rate_pct:finite(discovery_row?.funding_per_hour_pct??discovery_row?.funding_rate_pct),market_24h:discovery_row?.market_24h??null,price_tick:finite(discovery_row?.price_tick),volume_ratio:finite(discovery_row?.volume_ratio)},volume_profile:volumeProfile,observed_ts}),future_hint:coinLobsterAllowed?capturedCoinLobsterHint(contract):{source:'COINLOBSTER_FUTURE_HINT',contract,status:'COVERAGE_GATE_NOT_ADMITTED',data_available:false,network_calls:0},future_source_status:{coverage_admission:liquidationGate.admission,...futureMapSource,maps:undefined,tracked_hl:{...trackedHlView,maps:undefined}}};
 const technicalFacts=[...readHtxTechnicalStructure({contract,now:observed_ts}),...precommittedTechnicalPlanEvidence({scenario:publication_shadow?.scenario_plan,contract,snapshot_id,observed_ts})];
 const executionFacts=buildCanonicalExecutionEvidence({contract,run_id,snapshot_id,observed_ts,execution_context_source});
 if(internal_market_context?.evidence_v2){
  const prior=internal_market_context.evidence_v2,unique=new Map();
  for(const row of [...arr(prior.evidence),...technicalFacts,...executionFacts])if(!unique.has(row.evidence_id))unique.set(row.evidence_id,row);
  const evidence=[...unique.values()];
  const sources=bindVerifiedPrimarySourceFacts({sources:prior.sources,evidence:[...technicalFacts,...executionFacts],contract,decision_ts:observed_ts});
  internal_market_context={...internal_market_context,decision_ts:observed_ts,evidence_v2:{...prior,decision_ts:observed_ts,evidence,sources,block_coverage:auditCandidateBlocks({evidence,sources,decision_ts:observed_ts,strict_fresh:prior.strict_fresh_required===true})}};
 }
 const sectorRelativeStrengthReview=reviewSectorRelativeStrength({evidence:internal_market_context?.evidence_v2?.evidence||[],contract,run_id,snapshot_id,decision_ts:observed_ts});
 const boundedMoneyFlowDiagnostic=reviewBoundedMoneyFlow({evidence:internal_market_context?.evidence_v2?.evidence||[],contract,run_id,snapshot_id,decision_ts:observed_ts});
 const supplementalScoreEvidence=buildSupplementalScoreEvidence({direction,internal_market_context,liquidation_panel:liquidationPanel,volume_profile:volumeProfile,volume_consensus:volumeConsensus,contract,observed_ts,reference_price:price});
 const supplementalScoreAdjustment=applySupplementalScoreAdjustment(baseInterest,supplementalScoreEvidence);
 const interest=supplementalScoreAdjustment.final_score;
 const nativeTargets=arr(liquidationPanel?.clusters).filter(row=>row?.decision_target_eligible===true&&finite(row.target_price)!==null).map(row=>({kind:'NATIVE_SCOPED',price:row.target_price,exact_notional_usdt:row.contains_estimates?null:row.largest_provider_position_usd,strength_score_0_100:null,strength_label_ru:null,source:arr(row.providers).join('+'),source_ts:row.source_ts,decision_target_eligible:true,path_obstacle_eligible:row.path_obstacle_eligible===true}));
 const proofZones={...pump,above:[...arr(pump?.above),...nativeTargets.filter(row=>row.price>price)],below:[...arr(pump?.below),...nativeTargets.filter(row=>row.price<price)]};
 const routedState=validState(route?.state)?text(route.state):null;
 const needsTechnicalFallback=(!routedState||['REJECTED','OBSERVE','WAIT_FOR_TRIGGER'].includes(routedState))&&finite(publication_shadow?.scenario_plan?.target_price)===null;
 const observationPlanDiagnostic={version:'observation-plan-diagnostic-v1-20261006',contract,decision_ts:observed_ts,status:'NOT_REQUIRED',reason:'EXISTING_ROUTED_ENTRY_STATE',score_contribution:0,entry_authorized_by_receipt:false};
 const observation=needsTechnicalFallback?observationPlan({contract,publication:publication_shadow,route,direction,price,opportunity,observedTs:observed_ts,pump:proofZones,discovery:discovery_row,technical_evidence:[...technicalFacts,...arr(internal_market_context?.evidence_v2?.evidence)],allow_range_observation:early&&(!routedState||['REJECTED','OBSERVE'].includes(routedState))&&route?.hard_veto!==true,audit:observationPlanDiagnostic}):null;
 const scenario=publication_shadow?.scenario_plan;
 const existingPlanClosed=Boolean(
  entryFrom(publication_shadow,null)&&
  (route?.trigger||scenario?.trigger)&&
  (scenario?.invalidation||route?.trigger?.cancel_condition)
 );
 const observationPlanClosed=Boolean(observation?.entry&&observation?.trigger&&observation?.invalidation);
 const effectiveState=selectCanonicalPublicationState({route_state:routedState,route_hard_veto:route?.hard_veto,early_candidate:early,early_quality:earlyQuality,interest,direction,observe_contract_closed:existingPlanClosed||observationPlanClosed});
 const routedOverall=finite(publication_shadow?.score_interval?.score_lower_bound);
 const overall=effectiveState==='OBSERVE'?null:routedOverall;
 const freeSources=free_source_summary?.status==='CLOSED'&&free_source_summary?.owner==='source-registry.mjs'?free_source_summary:{version:'free-source-runtime-summary-missing-owner-v1',status:'NOT_CLOSED',owner:null,registry:{status:'NOT_CLOSED',entries:[]},entry_funnel:{status:'NOT_CLOSED',blockers:['UNKNOWN_INTERNAL_REASON'],blocker_details:[{code:'UNKNOWN_INTERNAL_REASON',full_ru:'Сводка источников не была передана назначенным владельцем; вывод оставлен в безопасном режиме.',short_ru:'сводка источников не подтверждена; вывод не готов',known:false}],has_unknown_reason:true},continuous_collector_status:'PARTIAL_REALTIME_COVERAGE',hot_cycle_external_request_delta:0,d1_write_delta:0};
 const supplementalSupportingBridge=bindSupplementalSupportingReceipts({context:internal_market_context?.candidate_context,existing:existing_source_receipts||{},contract,run_id,snapshot_id,decision_ts:observed_ts});
 const supportingContext=consumeExistingSourceReceipts(supplementalSupportingBridge.receipts);
 const supplementalSupportingUse=attachSupplementalSupportingUse({consumed:supportingContext,bridge:supplementalSupportingBridge});
 supportingContext.supplemental_supporting_use=supplementalSupportingUse;
 const specialistContext=consumeSpecialistContext({sources:internal_market_context?.candidate_sources||{},contract,now:finite(observed_ts),primary_price:internal_market_context?.htx_reference_price,asset_identity:internal_market_context?.candidate_context?.asset_identity});
 const blockResultContext=consumeBlockResultContext({evidence:internal_market_context?.evidence_v2?.evidence||[],contract,now:observed_ts});
 const executionContext=consumeCanonicalExecutionContext({contract,run_id,snapshot_id,observed_ts,execution_context_source});
 const sectorContext=consumeSectorContext({evidence:internal_market_context?.evidence_v2?.evidence||[],contract,asset_identity:internal_market_context?.candidate_context?.asset_identity,now:observed_ts});
 supportingContext.blocks={...supportingContext.blocks,...specialistContext.blocks,sector_comparison:sectorContext,volume_profile:volumeProfile,volume_profile_consensus:volumeConsensus};
 const profileFacts=volumeProfileFacts(volumeProfile,{contract,now:observed_ts,reference_price:price,direction}).slice(0,1);
 if(profileFacts.length){const vpReceipt=supplementalScoreAdjustment.receipts.find(r=>r.source_id==='HTX_VOLUME_PROFILE');const state=volumeConsensus.status==='MULTI_VENUE_CONFIRMED'?`совпадение HTX+${volumeConsensus.confirmations.map(r=>r.source).join('+')}`:volumeConsensus.status==='CONFLICT'?'расхождение; вес 0':'одна площадка';profileFacts[0].value+=`; ${vpReceipt?.score_contribution??0} балла; ${state}`;profileFacts[0].unit='';}
 supportingContext.facts=[...supplementalSupportingUse.facts,...profileFacts,...specialistContext.facts,...blockResultContext.facts,...executionContext.facts,...sectorContext.facts,...supportingContext.facts.filter(f=>!supplementalSupportingUse.facts.includes(f))];
 supportingContext.specialist_context_status=specialistContext.status;
 if(specialistContext.facts.length||profileFacts.length||blockResultContext.facts.length||executionContext.facts.length||sectorContext.facts.length)supportingContext.status='CLOSED';
 const runtimeSourceReceipts=[
  ...sourceReceipts(public_evidence),
  ...buildCanonicalExecutionRoleFacts({contract,run_id,snapshot_id,observed_ts,execution_context_source}).map(row=>({...normalizeInheritedFactEnvelope([row]).facts[0],evidence_ids:row.evidence_ids,snapshot_id:row.snapshot_id,run_id:row.run_id,physical_root_key:row.physical_root_key,proof_purpose:row.proof_purpose,entry_authorized:false,score_contribution:0})),
  ...(futures_component?.ok===true&&futures_component?.data?[{
    metric:'HTX_EXECUTION_SNAPSHOT',source:'HTX',venue:'HTX',status:'CLOSED',market_type:'USDT_M_PERPETUAL',
    source_ts:futures_component?.available_ts??futures_component?.data?.ts??observed_ts,observed_ts,unit:null,value:null,
    reason_code:null,coverage_pct:100,
  }]:[]),
 ];
 // Bind confirmations to the exact contract and observation clock before the
 // view is stored. Publication revalidates the same receipts independently.
 const sourceRoleView=buildRoleEvidenceView(runtimeSourceReceipts,{contract:text(contract),observed_ts:finite(observed_ts)});
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
  liquidations:renderedLiquidationView,data_quality:data_sufficiency??null,free_sources:freeSources,
  changes_from_previous:snapshotChanges.lines,
  metadata:{contract:text(contract)||null,oi_window_receipts,canonical_runtime_adapter:CANONICAL_RUNTIME_ADAPTER_VERSION,entry_readiness_score_status:'NOT_PROVISIONED_DO_NOT_INVENT',live_probability:null,validated_signal:false,automatic_execution:false,minimum_reportable_move_pct:null,technical_move_potential:observation?.technical_move_potential??(publication_shadow?.scenario_plan?.remaining_move_pct>0?{status:'CLOSED',basis:'PRECOMMITTED_MEASURED_STRUCTURE',potential_move_pct:publication_shadow.scenario_plan.remaining_move_pct,target_price:publication_shadow.scenario_plan.target_price}:null),start_closing_price:targetsFrom(publication_shadow,observation)?.[0]?.price??null,idea_basis:pump?.pump?.is_pump===true?'LIQUIDATION_PUMP':(opportunity?.newest_event?.minute_decomposition?.classification_allowed===true||opportunity?.newest_event?.early_anomaly_classification)?'CANDLE_ANOMALY':'MULTI_FACTOR',supporting_context:supportingContext,bounded_money_flow_diagnostic:boundedMoneyFlowDiagnostic,sector_relative_strength_review:sectorRelativeStrengthReview,...(executionContext.facts.length?{execution_context_source}:{}),internal_market_context:internal_market_context&&internal_market_context.internal_only===true?internal_market_context:null,dynamic_liquidation_panel:liquidationPanel,supplemental_score_adjustment:supplementalScoreAdjustment,...(observation?.prospective_observation_receipt?{prospective_observation_receipt:observation.prospective_observation_receipt}:{}),score_basis:{selected:interestBasis.basis,qualified_early_detection_0_100:earlyQuality,deep_canonical_interest_0_100:deepInterest,routed_overall_0_100:routedOverall},direction_resolution:directionResolution,scenario_plan_transfer:{existing_plan_closed:existingPlanClosed,fallback_plan_closed:observationPlanClosed,fallback_receipt:observationPlanDiagnostic,target_proof_status:targetsFrom(publication_shadow,observation)?.length?'CLOSED':'PENDING_FOR_EARLY_OBSERVATION',reason:effectiveState==='REJECTED'&&!existingPlanClosed&&!observationPlanClosed?'PLAN_NOT_CLOSED':null},source_role_view:sourceRoleView,snapshot_comparison:snapshotChanges,evidence_domain_contract:evidenceDomains,protective_filter:publication_shadow?.protective_filter??null},
 });
 const telegram=formatTelegramCompact(canonical,{facts:canonical?.reasons||[]});
 const manual=formatManualReport(canonical);
 const block_rendered_results=auditRenderedBlockResults({canonical,manual});
 const surface_contract=buildOutputSurfaceContract({canonical,telegram,manual});
 return {version:CANONICAL_RUNTIME_ADAPTER_VERSION,status:canonical?.status==='CLOSED'&&surface_contract.status==='CLOSED'?'CLOSED':'NOT_CLOSED',canonical,telegram,manual,surface_contract,block_rendered_results,parity_fingerprint:canonical?.analytical_fingerprint??null};
}
export default{CANONICAL_RUNTIME_ADAPTER_VERSION,resolveCanonicalDirection,selectCanonicalPublicationState,selectCanonicalInterestBasis,buildRuntimeCanonicalBundle};

