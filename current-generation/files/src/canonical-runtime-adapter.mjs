import {assessOriginalStrategyFacts} from './owner-strategy-fact-mapping.mjs';
import {bindLiquidationAcquisitionDiagnostics} from './liquidation-source-acquisition-audit.mjs';
import {verifiedObservationRange} from './observation-technical-range.mjs';
import {captureIdeaBasisReceipt} from './idea-basis-facts.mjs';
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
import {PAUSED_BLOCKS} from './evidence-v2.mjs';
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
import {APPROVED_HTX_SCOPE,approvedHtxAnalysisAssetForContract} from './approved-htx-analysis-scope.mjs';

export const CANONICAL_RUNTIME_ADAPTER_VERSION='canonical-runtime-adapter-v18-spot-futures-joint-output-20261012';
const finite=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;};
const text=v=>v===null||v===undefined?'':String(v).trim();
const arr=v=>Array.isArray(v)?v:[];
const validState=v=>['ENTRY_NOW_ANALYTICAL','ENTRY_NOW_VALIDATED','WAIT_FOR_TRIGGER','OBSERVE','REJECTED'].includes(text(v));
const firstFinite=(...values)=>{for(const v of values){const n=finite(v);if(n!==null)return n;}return null;};
const SPOT_FUTURES_CONTEXT_MAX_AGE_MS=5*60_000;
const SPOT_FUTURES_CONTEXT_MAX_SKEW_MS=60_000;
function exactDepthMarket(component,contract,market,now){
 const data=component?.data,book=data?.depth_bbo;
 if(component?.execution_status!=='FULFILLED'||data?.health?.depth!==true||data?.market!==market)return null;
 if(market==='HTX Spot'){
  if(text(data?.requested_symbol).toUpperCase()!==contract||text(data?.symbol).toUpperCase()!==contract.replace('-',''))return null;
 }else if(text(data?.contract).toUpperCase()!==contract||data?.health?.info!==true||text(data?.contract_info?.contract_code).toUpperCase()!==contract)return null;
 const bid=finite(book?.best_bid),ask=finite(book?.best_ask),sourceTs=finite(book?.source_ts);
 if(bid===null||ask===null||bid<=0||ask<bid||sourceTs===null||!Number.isSafeInteger(sourceTs)||sourceTs>now||now-sourceTs>SPOT_FUTURES_CONTEXT_MAX_AGE_MS)return null;
 const mid=(bid+ask)/2;
 return{market,source_ts:sourceTs,best_bid:bid,best_ask:ask,mid,spread_bps:(ask-bid)/mid*10_000};
}
export function buildSpotFuturesMarketContext({contract,spot_component,futures_component,observed_ts}={}){
 const exact=text(contract).toUpperCase(),now=finite(observed_ts);
 const base={schema:'htx-spot-futures-shared-market-context-v1',contract:exact,observed_ts:now,physical_root_key:'HTX_OFFICIAL_PUBLIC_MARKET',independent_venue_count:1,network_calls:0,score_contribution:0,directional_vote:false,entry_authorized:false,
  approved_generation:APPROVED_HTX_SCOPE.generation,approved_manifest_sha256:APPROVED_HTX_SCOPE.manifest_sha256,
  applicability_not_block_coverage:{N04:'MARKET_CONTEXT_NOT_ONCHAIN_DIRECTION',N05:'EXISTING_JOINT_FLOW_UNCHANGED',N10:'PRICE_CONTEXT_NOT_TECHNICAL_TARGET',N12:'EXISTING_TAKER_RECONCILIATION_UNCHANGED',N14:'UNDERLYING_PRICE_CONTEXT_NOT_OPTIONS_IV',N15:'PRICE_CONTEXT_NOT_SECTOR_RELATIVE_STRENGTH',N16:'SPOT_REFERENCE_NOT_FUTURES_EXECUTION_COST'},
  spot_exempt_blocks:['N11'],
  metric_scope:'PRICE_AND_RELATIVE_SPREAD_ONLY;NOT_TAKER_FLOW_EXECUTION_SIZE_ONCHAIN_OPTIONS_IV_OR_SECTOR_STRENGTH'};
 if(!approvedHtxAnalysisAssetForContract(exact))return{...base,status:'NOT_IN_APPROVED_HTX_ANALYSIS_UNIVERSE',spot:null,futures:null,comparison:null,fact:null};
 if(now===null)return{...base,status:'EXACT_USDT_CONTRACT_AND_CLOCK_REQUIRED',spot:null,futures:null,comparison:null,fact:null};
 const spot=exactDepthMarket(spot_component,exact,'HTX Spot',now);
 const futures=exactDepthMarket(futures_component,exact,'HTX USDT-M Futures',now);
 if(!spot||!futures){
  const available=spot||futures,side=spot?'спот':'фьючерсы',missing=spot?'фьючерсная':'спотовая';
  const value=available?`${side}: средняя котировка ${Number(available.mid.toPrecision(8))} USDT, спред ${available.spread_bps.toFixed(1)} б.п.; ${missing} котировка не подтверждена; одна биржа, общего вывода по двум рынкам нет`:null;
  const fact=available?{source:'HTX',label:'Котировка доступного рынка HTX',value,unit:'',field:'SPOT_FUTURES_SINGLE_MARKET_CONTEXT',source_ts:available.source_ts,observed_ts:now,score_contribution:0,directional_vote:false,entry_authorized:false,telegram_eligible:false}:null;
  return{...base,status:spot?'SPOT_ONLY':futures?'FUTURES_ONLY':'NO_FRESH_EXACT_DEPTH_PAIR',spot,futures,comparison:null,fact};
 }
 const skew=Math.abs(spot.source_ts-futures.source_ts);
 if(skew>SPOT_FUTURES_CONTEXT_MAX_SKEW_MS)return{...base,status:'SOURCE_CLOCKS_NOT_ALIGNED',spot,futures,source_skew_ms:skew,comparison:null,fact:null};
 const basisPct=(futures.mid/spot.mid-1)*100;
 const comparison={futures_over_spot_price_pct:basisPct,spot_spread_bps:spot.spread_bps,futures_spread_bps:futures.spread_bps,source_skew_ms:skew};
 const signed=basisPct>=0?'+':'';
 const fact={source:'HTX',label:'Сверка спота и фьючерсов',value:`разница средних цен ${signed}${basisPct.toFixed(2)}%; спреды ${spot.spread_bps.toFixed(1)} и ${futures.spread_bps.toFixed(1)} б.п.; одна биржа`,unit:'',field:'SPOT_FUTURES_PRICE_SPREAD_CONTEXT',source_ts:Math.min(spot.source_ts,futures.source_ts),observed_ts:now,score_contribution:0,entry_authorized:false,telegram_eligible:false};
 return{...base,status:'CLOSED_COMPARABLE_PRICE_AND_SPREAD',spot,futures,comparison,fact};
}
export function buildSpotFuturesJointConclusion({market_context,block_context,evidence=[],contract,observed_ts}={}){
 const market=market_context,now=finite(observed_ts);
 if(now===null||market?.contract!==text(contract).toUpperCase()||market?.observed_ts!==now||!market.spot&&!market.futures)return null;
 const exactJoint=arr(block_context?.facts).find(f=>f.block_id==='N12'&&f.field==='ACTUAL_TAKER_TRADES_BOUNDED_MULTI_MARKET'&&f.observed_ts===now);
 const trade=exactJoint?arr(evidence).find(row=>row?.evidence_id===exactJoint.evidence_id&&row?.htx_contract===market.contract&&row?.block_id==='N12'&&row?.metric_family==='ACTUAL_TAKER_TRADES_BOUNDED_MULTI_MARKET'):null;
 const jointTrade=trade?.independent_venue_count===1&&arr(trade?.components).length===2&&trade.components[0].venue==='HTX'&&trade.components[0].market==='FUTURES'&&trade.components[1].venue==='HTX'&&trade.components[1].market==='SPOT'&&['BOUNDED_MULTIMARKET_AGREEMENT','BOUNDED_MULTIMARKET_DISAGREEMENT'].includes(trade.coverage_status)&&trade.observed_ts===now&&finite(trade.source_ts)!==null&&trade.source_ts<=now?trade:null;
 const price=market.status==='CLOSED_COMPARABLE_PRICE_AND_SPREAD'&&market.comparison&&market.spot&&market.futures
  ?`фьючерсы ${market.comparison.futures_over_spot_price_pct>=0?'дороже':'дешевле'} спота на ${Math.abs(market.comparison.futures_over_spot_price_pct).toFixed(2).replace('.',',')}%`
  :market.status==='SOURCE_CLOCKS_NOT_ALIGNED'?'котировки рынков не сопоставимы по времени':`свежая котировка есть только для ${market.spot?'спота':'фьючерсов'}`;
 const trades=jointTrade?.coverage_status==='BOUNDED_MULTIMARKET_AGREEMENT'
  ?'последние сделки сходятся только в неполной выборке'
  :jointTrade?.coverage_status==='BOUNDED_MULTIMARKET_DISAGREEMENT'
    ?'последние сделки двух рынков расходятся'
    :'совместная выборка последних сделок не подтверждена';
 const sourceTs=Math.min(...[market.spot?.source_ts,market.futures?.source_ts,jointTrade?.source_ts].filter(v=>Number.isSafeInteger(v)));
 if(!Number.isSafeInteger(sourceTs)||sourceTs>now||now-sourceTs>SPOT_FUTURES_CONTEXT_MAX_AGE_MS)return null;
 return{source:'HTX',label:'Сводный вывод по споту и фьючерсам',value:`${price}; ${trades}; общий рыночный вывод по этим данным не установлен; одна биржа`,unit:'',field:'SPOT_FUTURES_JOINT_CONCLUSION',contract:market.contract,source_ts:sourceTs,observed_ts:now,score_contribution:0,directional_vote:false,entry_authorized:false,telegram_eligible:false,market_pair_status:market.status,n12_joint_status:jointTrade?.coverage_status??null};
}
export function buildSpotExecutionCostContext({contract,spot_component,market_context,observed_ts}={}){
 const now=finite(observed_ts),market=market_context?.spot,data=spot_component?.data,reference=data?.spot_execution_reference;
 const base={schema:'htx-spot-500-usdt-execution-reference-v1',block_id:'N16',contract:text(contract).toUpperCase(),status:'SPOT_EXECUTION_REFERENCE_NOT_CLOSED',source:'HTX_OFFICIAL_PUBLIC_MARKET',physical_root_key:'HTX_OFFICIAL_PUBLIC_MARKET',independent_venue_count:1,network_calls:0,score_contribution:0,entry_authorized:false,fact:null};
 if(PAUSED_BLOCKS.N16)return {...base,status:'BLOCK_PAUSED_BY_OWNER'};
 if(!market||market.market!=='HTX Spot'||now===null||spot_component?.execution_status!=='FULFILLED'||reference?.source_scope!=='HTX_SPOT_STEP0_SAME_DEPTH_REPLY'||reference.entry_authorized!==false||reference.source_ts!==market.source_ts||reference.best_bid!==market.best_bid||reference.best_ask!==market.best_ask||reference.requested_notional_usdt!==500)return base;
 const validImpact=(impact,side)=>{
  const request=finite(impact?.requested_notional_usdt),filled=finite(impact?.filled_notional_usdt),vwap=finite(impact?.vwap),bps=finite(impact?.impact_bps),baseQty=finite(impact?.base_quantity),fillPct=finite(impact?.fill_ratio_pct);
  if(impact?.fully_filled!==true||request!==500||filled===null||filled<499.5||filled>500.001||vwap===null||vwap<=0||baseQty===null||baseQty<=0||fillPct===null||fillPct<99.9||fillPct>100.001||bps===null||bps<-.000001)return false;
  const expected=(side==='buy'?vwap/reference.best_ask-1:1-vwap/reference.best_bid)*10_000;
  return Math.abs(expected-bps)<.00001&&Math.abs(filled/baseQty-vwap)<.000001*Math.max(1,vwap);
 };
 if(!validImpact(reference.buy,'buy')||!validImpact(reference.sell,'sell'))return base;
 const buy=reference.buy.impact_bps,sell=reference.sell.impact_bps;
 const fact={source:'HTX / спот',block_id:'N16',label:'Спотовый ориентир издержек для 500 USDT',value:`по одному снимку стакана: покупка ${buy.toFixed(1)} б.п. от лучшей цены продажи, продажа ${sell.toFixed(1)} б.п. от лучшей цены покупки; каждая сторона рассчитана отдельно на 500 USDT; комиссии и будущие изменения стакана не включены; издержки фьючерсов проверяются отдельно`,unit:'',field:'SPOT_EXECUTION_REFERENCE_500',source_ts:market.source_ts,observed_ts:now,score_contribution:0,directional_vote:false,entry_authorized:false,telegram_eligible:false};
 return{...base,status:'SPOT_EXECUTION_REFERENCE_CLOSED',source_ts:market.source_ts,requested_notional_usdt:500,buy_impact_bps:buy,sell_impact_bps:sell,fact};
}
const NATIVE_LIQUIDATION_SOURCE_IDS=Object.freeze(['HYPERLIQUID_NATIVE','LIGHTER_NATIVE','GMX_NATIVE','GTRADE_NATIVE','OXARCHIVE_HL_BUCKETS','DYDX_PINNED_NATIVE']);
function nativeLiquidationSourceId(value){
 const provider=text(value?.provider??value?.venue).toUpperCase();
 if(provider.includes('DYDX'))return'DYDX_PINNED_NATIVE';
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
export function hardGates({discovery,publication,executionHandoff}={}){
 const gates=[];
 if(discovery?.htx_futures_turnover_gate)gates.push(discovery.htx_futures_turnover_gate);
 if(publication?.publication_gate)gates.push({gate:'TZ101_PUBLICATION',status:publication.publication_gate.status??null,reason:publication.publication_gate.reason??null});
 if(executionHandoff)gates.push({gate:'HTX_EXECUTION_HANDOFF',status:executionHandoff.ok===true?'CLOSED':'NOT_CLOSED',reason:executionHandoff.reason??null});
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
export function observationPlan({contract,publication,route,direction,price,opportunity,observedTs,pump,discovery,technical_evidence=[],allow_range_observation=false,independent_price_conflicts=[],audit=null}={}){
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
 const oldCancellationTrue=cancel!==null&&((direction==='LONG'&&price<cancel)||(direction==='SHORT'&&price>cancel));
 // A historical statistical candle is not the active cancellation contract of
 // a new qualified early observation. Only a newer verified closed range may
 // replace that unusable fallback; routed/live prospective plans stay binding.
 const historicalFallbackUnusable=oldCancellationTrue&&!prospective&&route?.trigger==null;
 const rangeCandidate=allow_range_observation&&routedLevel===null&&(level===null||cancel===null||historicalFallbackUnusable)?verifiedObservationRange({evidence:technical_evidence,contract,direction,price,decision_ts:observedTs}):null;
 const range=rangeCandidate&&(!oldCancellationTrue||(historicalFallbackUnusable&&finite(event?.event_close_ts)!==null&&event.event_close_ts<rangeCandidate.window_end))?rangeCandidate:null;
 if(range){level=range.level;cancel=range.cancel;note({technical_range_receipt:range,...(oldCancellationTrue?{replaced_historical_fallback_reason:'CANCELLATION_ALREADY_TRUE_AT_SNAPSHOT'}:{})});}
 note({anomaly_candle_closed:anomalyClosed,event_high:eventHigh,event_low:eventLow,routed_trigger_price:routedLevel,selected_trigger_price:level,cancellation_price:cancel});
 if(level===null||cancel===null)return reject(!anomalyClosed?'CLOSED_ANOMALY_CANDLE_REQUIRED':level===null?'NO_FORWARD_FACTUAL_PRICE_TRIGGER':'OPPOSITE_FACTUAL_CANDLE_BOUNDARY_REQUIRED');
 // The stated cancellation condition must still be false at this snapshot.
 // An old candle can supply a target while its opposite boundary was already
 // crossed; publishing that as a live watch would contradict its own plan.
 if((direction==='LONG'&&price<cancel)||(direction==='SHORT'&&price>cancel))return reject('CANCELLATION_ALREADY_TRUE_AT_SNAPSHOT');
 const priceConflicts=arr(independent_price_conflicts).filter(row=>['BINANCE','BYBIT','OKX'].includes(row?.source)&&row?.reason==='PRICE_OR_ASSET_IDENTITY_CONFLICT');
 const potential=range?{status:'NOT_CLOSED',reason:'FORWARD_OBSERVATION_CONDITIONS_ONLY',potential_move_pct:null,target_price:null}:priceConflicts.length?{status:'NOT_CLOSED',reason:'INDEPENDENT_PRICE_OR_ASSET_IDENTITY_CONFLICT',potential_move_pct:null,target_price:null,conflicting_sources:priceConflicts.map(row=>row.source)}:evaluateTechnicalMovePotential({contract,decision_ts:observedTs,direction,current_price:price,trigger_price:level,liquidation_zones:pump,opportunity:observationOpportunity,rolling_24h_change_pct:finite(discovery?.rolling_24h_change_pct),oi_change_pct:finite(discovery?.best_oi_build_pct),volume_ratio:finite(discovery?.volume_ratio),funding_rate_pct:finite(discovery?.funding_per_hour_pct??discovery?.funding_rate_pct),early_anomaly:pump?.pump?.early_anomaly===true});
 note({target_proof_status:potential.status,target_proof_reason:potential.reason??null,independent_price_conflict_sources:priceConflicts.map(row=>row.source)});
 const entry={area:`${level} USDT`,min_price:level,max_price:level,basis:range?range.basis:routedLevel!==null?'ROUTED_FACTUAL_LEVEL':'VERIFIED_ANOMALY_CANDLE_LEVEL'};
 const targetPrice=potential.status==='CLOSED'&&finite(potential.target_price)!==null&&finite(potential.potential_move_pct)>0?potential.target_price:null;
 const expires=observedTs+30*60_000;
 const fallbackTrigger={trigger_type:'PRICE_CONFIRMATION',metric:'price',operator:direction==='LONG'?'>=':'<=',value:level,unit:'USDT',timeframe:'5m',expires_ts:expires,next_recheck_ts:observedTs+5*60_000,cancel_condition:`price${direction==='LONG'?'<':'>'}${cancel}`,level_origin:range?range.basis:routedLevel!==null?'ROUTED_FACTUAL_LEVEL':'VERIFIED_ANOMALY_CANDLE_LEVEL'};
 note({status:'CLOSED',reason:range?'VERIFIED_TECHNICAL_RANGE_OBSERVATION_CLOSED':'EXISTING_FACTUAL_OBSERVATION_PLAN_CLOSED'});
 return {entry,trigger:route?.trigger??fallbackTrigger,invalidation:{condition:route?.trigger?.cancel_condition??`price${direction==='LONG'?'<':'>'}${cancel}`,price:cancel},targets:targetPrice===null?[]:[{price:targetPrice,source:'technically_proven_move_potential',start_closing:true,potential_move_pct:potential.potential_move_pct,basis:potential.basis,basis_ru:potential.basis_ru}],technical_move_potential:potential,...(prospective?{prospective_observation_receipt:{event_id:prospective.event_id,statistical_episode_id:prospective.statistical_episode_id,source_ts:prospective.source_ts,available_at:prospective.available_at,contract:prospective.contract,independent_vote_added:false,entry_authorized:false}}:{})};
}
function scenarioTargetState(publication,{direction,current_price}={}){
 const p=finite(publication?.scenario_plan?.target_price);if(p===null)return{status:'ABSENT',reason:null};
 const current=finite(current_price);if(!['LONG','SHORT'].includes(direction)||current===null||current<=0||p<=0)return{status:'NOT_CLOSED',reason:'DIRECTION_OR_PRICE_NOT_CLOSED'};
 if(direction==='LONG'?p<=current:p>=current)return{status:'NOT_CLOSED',reason:'TARGET_ALREADY_REACHED_OR_BEHIND_CURRENT_PRICE'};
 return{status:'CLOSED',reason:null};
}
function targetsFrom(publication,observation,{direction,current_price}={}){
 const p=finite(publication?.scenario_plan?.target_price);return p===null?(observation?.targets??[]):scenarioTargetState(publication,{direction,current_price}).status==='CLOSED'?[{price:p,source:'scenario_plan',start_closing:true,potential_move_pct:finite(publication?.scenario_plan?.remaining_move_pct)}]:[];
}
function entryFrom(publication,observation){
 const s=publication?.scenario_plan;if(!s)return null;
 const lo=finite(s.entry_area_min_price),hi=finite(s.entry_area_max_price);
 if(lo===null||hi===null)return s.entry_area?{area:s.entry_area}:null;
 return {area:s.entry_area??`${lo}–${hi} USDT`,min_price:lo,max_price:hi,rule_receipt_id:s.entry_area_rule_receipt_id??null,candidate_receipt:s.entry_area_candidate_receipt??null};
}
export function buildRuntimeCanonicalBundle({
 contract,run_id,snapshot_id,observed_ts,discovery_row=null,publication_shadow=null,opportunity=null,
 public_evidence=null,liquidation_intelligence=null,futures_component=null,spot_component=null,execution_handoff=null,data_sufficiency=null,free_source_summary=null,smart_money_raw=null,shadow_decision=null,
 existing_source_receipts=null,previous_snapshot_context=null,oi_window_receipts=null,native_liquidation_acquisition=null,
 internal_market_context=null,execution_context_source=null,liquidation_source_acquisition_audit=null,original_idea_recheck=null,
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
 const acquisitionDiagnostics=bindLiquidationAcquisitionDiagnostics({audit:liquidation_source_acquisition_audit,contract,run_id,snapshot_id,observed_ts});
 if(acquisitionDiagnostics)renderedLiquidationView.acquisition_diagnostics=acquisitionDiagnostics;
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
 const nativeTargets=arr(liquidationPanel?.clusters).filter(row=>row?.decision_target_eligible===true&&finite(row.target_price)!==null).map(row=>({kind:'NATIVE_SCOPED',price:row.target_price,exact_notional_usdt:row.target_exact_notional_usd,strength_score_0_100:null,strength_label_ru:null,source:arr(row.target_providers).join('+'),source_ts:row.target_source_ts,price_semantics:arr(row.target_price_semantics).join('+'),decision_target_eligible:true,path_obstacle_eligible:row.path_obstacle_eligible===true}));
 const proofZones={...pump,above:[...arr(pump?.above),...nativeTargets.filter(row=>row.price>price)],below:[...arr(pump?.below),...nativeTargets.filter(row=>row.price<price)]};
 const routedState=validState(route?.state)?text(route.state):null;
 const needsTechnicalFallback=(!routedState||['REJECTED','OBSERVE','WAIT_FOR_TRIGGER'].includes(routedState))&&finite(publication_shadow?.scenario_plan?.target_price)===null;
 const observationPlanDiagnostic={version:'observation-plan-diagnostic-v1-20261006',contract,decision_ts:observed_ts,status:'NOT_REQUIRED',reason:'EXISTING_ROUTED_ENTRY_STATE',score_contribution:0,entry_authorized_by_receipt:false};
 const observation=needsTechnicalFallback?observationPlan({contract,publication:publication_shadow,route,direction,price,opportunity,observedTs:observed_ts,pump:proofZones,discovery:discovery_row,technical_evidence:[...technicalFacts,...arr(internal_market_context?.evidence_v2?.evidence)],allow_range_observation:early&&(!routedState||['REJECTED','OBSERVE'].includes(routedState))&&route?.hard_veto!==true,independent_price_conflicts:volumeConsensus.conflicts,audit:observationPlanDiagnostic}):null;
 const scenario=publication_shadow?.scenario_plan;
 const existingPlanClosed=Boolean(
  entryFrom(publication_shadow,null)&&
  (route?.trigger||scenario?.trigger)&&
  (scenario?.invalidation||route?.trigger?.cancel_condition)
 );
 const observationPlanClosed=Boolean(observation?.entry&&observation?.trigger&&observation?.invalidation);
 const analyzedState=selectCanonicalPublicationState({route_state:routedState,route_hard_veto:route?.hard_veto,early_candidate:early,early_quality:earlyQuality,interest,direction,observe_contract_closed:existingPlanClosed||observationPlanClosed});
 const routedOverall=finite(publication_shadow?.score_interval?.score_lower_bound);
 const effectiveState=original_idea_recheck&&['ENTRY_NOW_ANALYTICAL','ENTRY_NOW_VALIDATED'].includes(analyzedState)&&(original_idea_recheck.settlement_confirmed!==true||direction!==original_idea_recheck.direction)?'WAIT_FOR_TRIGGER':analyzedState;
 const overall=effectiveState==='OBSERVE'?null:routedOverall;
 const freeSources=free_source_summary?.status==='CLOSED'&&free_source_summary?.owner==='source-registry.mjs'?free_source_summary:{version:'free-source-runtime-summary-missing-owner-v1',status:'NOT_CLOSED',owner:null,registry:{status:'NOT_CLOSED',entries:[]},entry_funnel:{status:'NOT_CLOSED',blockers:['UNKNOWN_INTERNAL_REASON'],blocker_details:[{code:'UNKNOWN_INTERNAL_REASON',full_ru:'Сводка источников не была передана назначенным владельцем; вывод оставлен в безопасном режиме.',short_ru:'сводка источников не подтверждена; вывод не готов',known:false}],has_unknown_reason:true},continuous_collector_status:'PARTIAL_REALTIME_COVERAGE',hot_cycle_external_request_delta:0,d1_write_delta:0};
 const supplementalSupportingBridge=bindSupplementalSupportingReceipts({context:internal_market_context?.candidate_context,existing:existing_source_receipts||{},contract,run_id,snapshot_id,decision_ts:observed_ts});
 const supportingContext=consumeExistingSourceReceipts(supplementalSupportingBridge.receipts);
 const supplementalSupportingUse=attachSupplementalSupportingUse({consumed:supportingContext,bridge:supplementalSupportingBridge});
 supportingContext.supplemental_supporting_use=supplementalSupportingUse;
 const specialistContext=consumeSpecialistContext({sources:internal_market_context?.candidate_sources||{},contract,now:finite(observed_ts),primary_price:internal_market_context?.htx_reference_price,asset_identity:internal_market_context?.candidate_context?.asset_identity});
 const blockResultContext=consumeBlockResultContext({evidence:internal_market_context?.evidence_v2?.evidence||[],contract,now:observed_ts});
 const spotFuturesMarketContext=buildSpotFuturesMarketContext({contract,spot_component,futures_component,observed_ts});
 const spotFuturesJointConclusion=buildSpotFuturesJointConclusion({market_context:spotFuturesMarketContext,block_context:blockResultContext,evidence:internal_market_context?.evidence_v2?.evidence||[],contract,observed_ts});
 const spotExecutionCostContext=buildSpotExecutionCostContext({contract,spot_component,market_context:spotFuturesMarketContext,observed_ts});
 const executionContext=consumeCanonicalExecutionContext({contract,run_id,snapshot_id,observed_ts,execution_context_source});
 const sectorContext=consumeSectorContext({evidence:internal_market_context?.evidence_v2?.evidence||[],contract,asset_identity:internal_market_context?.candidate_context?.asset_identity,now:observed_ts});
 supportingContext.blocks={...supportingContext.blocks,...specialistContext.blocks,sector_comparison:sectorContext,volume_profile:volumeProfile,volume_profile_consensus:volumeConsensus,spot_futures_market:spotFuturesMarketContext,spot_execution_cost:spotExecutionCostContext};
 const profileFacts=volumeProfileFacts(volumeProfile,{contract,now:observed_ts,reference_price:price,direction}).slice(0,1);
 if(profileFacts.length){const vpReceipt=supplementalScoreAdjustment.receipts.find(r=>r.source_id==='HTX_VOLUME_PROFILE');const state=volumeConsensus.status==='MULTI_VENUE_CONFIRMED'?`совпадение HTX+${volumeConsensus.confirmations.map(r=>r.source).join('+')}`:volumeConsensus.status==='CONFLICT'?'расхождение; вес 0':'одна площадка';profileFacts[0].value+=`; ${vpReceipt?.score_contribution??0} балла; ${state}`;profileFacts[0].unit='';}
 supportingContext.facts=[...supplementalSupportingUse.facts,...profileFacts,...specialistContext.facts,...blockResultContext.facts,...executionContext.facts,...sectorContext.facts,...supportingContext.facts.filter(f=>!supplementalSupportingUse.facts.includes(f)),...(spotFuturesMarketContext.fact?[spotFuturesMarketContext.fact]:[]),...(spotFuturesJointConclusion?[spotFuturesJointConclusion]:[]),...(spotExecutionCostContext.fact?[spotExecutionCostContext.fact]:[])];
 supportingContext.specialist_context_status=specialistContext.status;
 if(specialistContext.facts.length||profileFacts.length||blockResultContext.facts.length||executionContext.facts.length||sectorContext.facts.length||spotFuturesMarketContext.fact||spotExecutionCostContext.fact)supportingContext.status='CLOSED';
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
 const scenarioTarget=scenarioTargetState(publication_shadow,{direction,current_price:price});
 const selectedTargets=targetsFrom(publication_shadow,observation,{direction,current_price:price});
 const canonical=buildCanonicalAnalyticalResult({
  snapshot_id:text(snapshot_id)||`UNBOUND:${text(contract)||'UNKNOWN'}:${observed_ts}`,
  run_id:text(run_id)||`UNBOUND:${observed_ts}`,
  observed_ts,
  universe:[{contract:text(contract)||null}],candidates:[{contract:text(contract)||null,ticker:text(contract)||null}],
  source_receipts:runtimeSourceReceipts,hard_gates:hardGates({discovery:discovery_row,publication:publication_shadow,executionHandoff:execution_handoff}),
  state:effectiveState,direction,overall_score_0_100:overall,coin_interest_score_0_100:interest,entry_readiness_score_0_100:null,
  reasons:reasonFacts({discovery:discovery_row,opportunity,publication:publication_shadow}),current_price:price,
  entry:entryFrom(publication_shadow,observation)??observation?.entry??null,trigger:route?.trigger??observation?.trigger??null,invalidation:publication_shadow?.scenario_plan?.invalidation??observation?.invalidation??null,
  targets:selectedTargets,costs:publication_shadow?.cost_assessment??null,
  early_candidate:earlyCandidate(discovery_row,directionResolution.early_receipt),opportunity:opportunityCompact(opportunity),microstructure:microCompact(discovery_row),
  liquidations:renderedLiquidationView,data_quality:data_sufficiency??null,free_sources:freeSources,
  changes_from_previous:snapshotChanges.lines,
  metadata:{contract:text(contract)||null,...(original_idea_recheck?{original_idea_recheck}:{}),idea_basis_receipt:captureIdeaBasisReceipt({discovery:discovery_row,contract,direction,observed_ts,run_id,snapshot_id}),...(['OBSERVE','WAIT_FOR_TRIGGER'].includes(effectiveState)?{price_recheck_policy:'LIGHT_PRICE_AND_CANCELLATION_5M'}:{}),oi_window_receipts,canonical_runtime_adapter:CANONICAL_RUNTIME_ADAPTER_VERSION,entry_readiness_score_status:'NOT_PROVISIONED_DO_NOT_INVENT',live_probability:null,validated_signal:false,automatic_execution:false,minimum_reportable_move_pct:null,technical_move_potential:observation?.technical_move_potential??(scenarioTarget.status==='NOT_CLOSED'?{status:'NOT_CLOSED',reason:scenarioTarget.reason,target_price:null,potential_move_pct:null}:scenarioTarget.status==='CLOSED'&&publication_shadow?.scenario_plan?.remaining_move_pct>0?{status:'CLOSED',basis:'PRECOMMITTED_MEASURED_STRUCTURE',potential_move_pct:publication_shadow.scenario_plan.remaining_move_pct,target_price:publication_shadow.scenario_plan.target_price}:null),start_closing_price:selectedTargets[0]?.price??null,idea_basis:pump?.pump?.is_pump===true?'LIQUIDATION_PUMP':(opportunity?.newest_event?.minute_decomposition?.classification_allowed===true||opportunity?.newest_event?.early_anomaly_classification)?'CANDLE_ANOMALY':'MULTI_FACTOR',supporting_context:supportingContext,bounded_money_flow_diagnostic:boundedMoneyFlowDiagnostic,sector_relative_strength_review:sectorRelativeStrengthReview,...(executionContext.facts.length?{execution_context_source}:{}),internal_market_context:internal_market_context&&internal_market_context.internal_only===true?internal_market_context:null,dynamic_liquidation_panel:liquidationPanel,supplemental_score_adjustment:supplementalScoreAdjustment,...(observation?.prospective_observation_receipt?{prospective_observation_receipt:observation.prospective_observation_receipt}:{}),score_basis:{selected:interestBasis.basis,qualified_early_detection_0_100:earlyQuality,deep_canonical_interest_0_100:deepInterest,routed_overall_0_100:routedOverall},direction_resolution:directionResolution,scenario_plan_transfer:{existing_plan_closed:existingPlanClosed,fallback_plan_closed:observationPlanClosed,fallback_receipt:observationPlanDiagnostic,target_proof_status:selectedTargets.length?'CLOSED':'PENDING_FOR_EARLY_OBSERVATION',reason:scenarioTarget.reason??(effectiveState==='REJECTED'&&!existingPlanClosed&&!observationPlanClosed?'PLAN_NOT_CLOSED':null)},source_role_view:sourceRoleView,snapshot_comparison:snapshotChanges,evidence_domain_contract:evidenceDomains,protective_filter:publication_shadow?.protective_filter??null},
 });
 const telegram=formatTelegramCompact(canonical,{facts:canonical?.reasons||[]});
 const manual=formatManualReport(canonical);
 const block_rendered_results=auditRenderedBlockResults({canonical,manual});
 const surface_contract=buildOutputSurfaceContract({canonical,telegram,manual});
 const strategy_fit_shadow=assessOriginalStrategyFacts(canonical);
 return {strategy_fit_shadow,version:CANONICAL_RUNTIME_ADAPTER_VERSION,status:canonical?.status==='CLOSED'&&surface_contract.status==='CLOSED'?'CLOSED':'NOT_CLOSED',canonical,telegram,manual,surface_contract,block_rendered_results,parity_fingerprint:canonical?.analytical_fingerprint??null};
}
export default{CANONICAL_RUNTIME_ADAPTER_VERSION,resolveCanonicalDirection,selectCanonicalPublicationState,selectCanonicalInterestBasis,buildRuntimeCanonicalBundle};
