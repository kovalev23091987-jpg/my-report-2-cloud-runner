import {fingerprint} from './liquidation-extension/core.mjs';
import {reconcileLiquidationZones} from './htx-source-backed-liquidation-model.mjs';
export const PUMP_LIQUIDATION_ZONES_VERSION='liquidation-zones-v7-explicit-native-future-semantics-20261004';
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const text=v=>String(v??'').trim();
const arr=v=>Array.isArray(v)?v:[];
export const LIQUIDATION_VOLUME_TIERS=Object.freeze({small_below:10000,medium_below:100000,large_below:1000000,unit:'USD_EQUIVALENT_REPORTED_NO_FX_CONVERSION',basis:'REPORT_DISPLAY_POLICY_NOT_INDUSTRY_STANDARD'});
export function liquidationVolumeTier(amount){const n=finite(amount);return n===null||n<=0?null:n>=1000000?'огромная':n>=100000?'крупная':n>=10000?'средняя':'небольшая';}
export function classifyPump24h(changePct,{early_anomaly=false}={}){const value=finite(changePct),move=value===null?null:Math.abs(value);return{status:value===null&&!early_anomaly?'NOT_CLOSED':'CLOSED',rolling_24h_change_pct:value,absolute_move_pct:move,is_pump:move!==null&&move>=5||early_anomaly,is_strong_move:move!==null&&move>=5,early_anomaly:early_anomaly===true,threshold_pct:5,inclusive:true,upper_ceiling_pct:null};}
function normalize(row,{current,observed,source=null,source_ts=null,unit=null,estimated=true,coverage=null,liquidated_side=null,price_quote=null}={}){
 const price=finite(row?.native_price??row?.level_price??row?.center_price??row?.price),amount=finite(row?.notional??row?.notional_usd??row?.notional_usdt??row?.cluster_notional_usd??row?.size_usd),clock=finite(row?.source_ts??source_ts),provider=text(row?.source??row?.provider??source),u=text(row?.notional_unit??unit??(row?.notional_usdt!=null?'USDT':row?.notional_usd!=null?'USD':null));
 if(!price||price<=0||!provider||!clock||clock>observed||observed-clock>300000)return null;
 if(row?.status&& !['CLOSED','USABLE_SCOPED_CONTEXT'].includes(row.status))return null;
 const semantics=[row?.kind,row?.evidence_class,row?.role].map(text).join(' '),approvedCalculated=false;
 if(/REALIZED|LEVERAGE_STRESS/.test(semantics)||/CALCULATED/.test(semantics)||row?.independence_group==='HTX_OFFICIAL_MODEL'||['SWEPT','INVALIDATED','EXPIRED'].includes(text(row?.lifecycle).toUpperCase()))return null;
 const side=text(row?.liquidated_side??row?.side??liquidated_side).toUpperCase(),ref=finite(row?.native_reference_price);
 if(!['LONG','SHORT'].includes(side)||ref!==null&&(side==='SHORT'&&price<=ref||side==='LONG'&&price>=ref))return null;
 const quote=text(row?.price_quote??price_quote)||(u==='USDT'?'USDT':'USD'),reference=quote==='USDT'?current:ref;
 const d=reference>0?(price/reference-1)*100:null;if(d===0||d!==null&&(side==='SHORT'&&d<0||side==='LONG'&&d>0))return null;
 const money=amount!==null&&amount>0&&['USD','USDT','USDC'].includes(u)?amount:null;
 return{kind:estimated?'PROVIDER_ESTIMATE':'NATIVE_FUTURE_LEVEL',price,price_quote:quote,distance_pct:d,distance_reference_price:reference,distance_reference_basis:quote==='USDT'?'HTX_CURRENT_SAME_QUOTE':ref>0?'ORIGINAL_SOURCE_REFERENCE_SAME_QUOTE':'UNKNOWN_SOURCE_REFERENCE_NO_FX_CONVERSION',side:side==='SHORT'?'ABOVE':'BELOW',liquidated_side:side==='SHORT'?'SELLERS':'BUYERS',notional:money,notional_unit:money!==null?u:null,exact_notional_usdt:!estimated&&u==='USDT'?money:null,exact_amount_available:!estimated&&money!==null,amount_semantics:row?.amount_semantics??(estimated?'PROVIDER_ESTIMATE':'REPORTED_OPEN_POSITION_NOTIONAL'),strength_label_ru:liquidationVolumeTier(money),strength_score_0_100:null,strength_basis:money!==null?['REPORTED_VOLUME_TIER']:[],source:provider,venue:row?.venue??null,source_ts:clock,coverage:row?.coverage??coverage,price_semantics:row?.price_semantics??null,native_reference_price:ref,conditional_cross:row?.conditional_cross===true||row?.conditional_on_other_positions===true,position_count:finite(row?.position_count),position_key:row?.position_key??row?.account??null,decision_target_eligible:false,estimated,independence_group:row?.independence_group??null,model_sources:arr(row?.model_sources),model_version:row?.model_version??null,anchor_kinds:arr(row?.anchor_kinds),leverage_scenarios:arr(row?.leverage_scenarios),source_backed_calculated:approvedCalculated};
}
const absDistance=z=>typeof z.distance_pct==='number'?Math.abs(z.distance_pct):Infinity;
function selectSide(rows,side){
 const all=rows.filter(z=>z.side===side),sorted=[...all].sort((a,b)=>(b.notional??-1)-(a.notional??-1)||absDistance(a)-absDistance(b)),selected=new Map();
 const add=(z,role)=>{if(!z)return;const key=[z.source,z.venue,z.price,z.notional_unit,z.position_key].join(':');const old=selected.get(key);selected.set(key,{...z,selection_roles:[...new Set([...(old?.selection_roles||[]),role])]});};
 for(const z of sorted.slice(0,4))add(z,'LARGEST_VISIBLE');
 add(all.filter(z=>typeof z.distance_pct==='number').sort((a,b)=>absDistance(a)-absDistance(b))[0],'NEAREST_NONZERO');
 add(all.filter(z=>typeof z.distance_pct==='number'&&z.notional>=1000000).sort((a,b)=>absDistance(b)-absDistance(a))[0],'FARTHEST_HUGE_VISIBLE');
 if(selected.size<6)add(all.filter(z=>typeof z.distance_pct==='number').sort((a,b)=>absDistance(b)-absDistance(a))[0],'FARTHEST_VISIBLE');
 return [...selected.values()].sort((a,b)=>(b.notional??-1)-(a.notional??-1)||absDistance(a)-absDistance(b));
}
export function buildPumpLiquidationZones({contract=null,rolling_24h_change_pct,current_price,early_anomaly=false,priority_reason=null,realized=[],projected=[],provider_maps=[],native_contexts=[],calculation_context={},volume_profile=null,observed_ts=Date.now()}={}){
 const base=text(contract).normalize('NFC').toUpperCase().replace(/-USDT$/,''),px=finite(current_price),pump=classifyPump24h(rolling_24h_change_pct,{early_anomaly});
 const common={version:PUMP_LIQUIDATION_ZONES_VERSION,pump,current_price:px,priority_reason:text(priority_reason)||null,above:[],below:[],future_only:true,future_levels_required:true,future_levels_status:'NOT_AVAILABLE',distance_cap_pct:null,minimum_distance_pct:0,max_per_side:6,display_minimum_separation_pct:5,display_max_per_side:4,display_nearby_levels_as_one_range:false,calculated_fallback_enabled:false,calculated_fallback_policy:'OWNER_DISABLED_REAL_EXTERNAL_LEVELS_ONLY',no_invented_exact_amounts:true,notional_summed_across_providers:false,volume_tiers:LIQUIDATION_VOLUME_TIERS,realized_events_excluded:arr(realized).length};
 if(!base||px===null||px<=0||!Number.isSafeInteger(observed_ts))return{...common,status:'TECHNICAL_FAILURE',reason:'HTX_CONTRACT_OR_CURRENT_PRICE_REQUIRED'};
 const rows=[],receipts=[];
 for(const map of arr(provider_maps)){
  const {fingerprint:f,...body}=map||{};
  if(!f||fingerprint(body)!==f||map.native_symbol!==base||map.usable_for_context!==true||/REALIZED/.test(map.evidence_class||'')){receipts.push({source:map?.provider,status:'REJECTED_SOURCE_BINDING'});continue;}
  receipts.push({source:map.provider,status:map.status,coverage:map.coverage,source_ts:map.source_ts,visible_half_range_pct:map.visible_half_range_pct??map.query_range_pct??null,total_zones:arr(map.zones).length});
  for(const z of arr(map.zones)){const row=normalize(z,{current:px,observed:observed_ts,source:map.provider,source_ts:map.source_ts,estimated:map.evidence_class!=='NATIVE_ACCOUNT_LIQUIDATION_PRICES'||/BUCKET|CLUSTER_CENTER|MODEL_PRICE_BIN|SDK_ESTIMATE|FEE_AWARE/.test(z.price_semantics||''),coverage:map.coverage});if(row)rows.push(row);}
 }
 for(const ctx of arr(native_contexts)){
  if(receipts.some(r=>r.source===(ctx?.provider??ctx?.venue)))continue;
  if(!['USABLE_NATIVE_SAMPLE','USABLE_SCOPED_NATIVE_CONTEXT','USABLE_SCOPED_CONTEXT'].includes(ctx?.status)||ctx?.binding?.contract!==contract)continue;
  for(const [zones,side] of [[ctx.above,'SHORT'],[ctx.below,'LONG']])for(const z of arr(zones)){
   const estimated=/BUCKET|CLUSTER_CENTER|MODEL_PRICE_BIN|SDK_ESTIMATE|FEE_AWARE/.test(z?.price_semantics||'');
   const row=normalize(z,{current:px,observed:observed_ts,source:ctx.provider??ctx.venue,source_ts:ctx.source_ts,estimated,coverage:ctx.coverage,liquidated_side:side,price_quote:ctx.price_quote});if(row)rows.push(row);
  }
 }
 for(const z of arr(projected)){const row=normalize(z,{current:px,observed:observed_ts});if(row)rows.push(row);}
 const htxModel={status:'DISABLED_BY_OWNER',reason:'CALCULATED_HTX_FALLBACK_FORBIDDEN',zones:[],volatility_1h_pct:null};
 const unique=new Map();for(const z of rows){const key=[z.source,z.venue,z.price,z.notional_unit,z.position_key].join(':');const old=unique.get(key);if(!old||z.source_ts>old.source_ts||z.source_ts===old.source_ts&&(z.notional??0)>(old.notional??0))unique.set(key,z);}
 const raw=[...unique.values()],all=reconcileLiquidationZones(raw,{reference_price:px,volatility_pct:htxModel.volatility_1h_pct}),above=selectSide(all,'ABOVE'),below=selectSide(all,'BELOW'),calculatedCount=all.filter(z=>z.independence_groups?.includes('HTX_OFFICIAL_MODEL')).length,externalCount=all.filter(z=>z.independence_groups?.some(group=>group!=='HTX_OFFICIAL_MODEL')).length,consensusCount=all.filter(z=>(z.independent_source_count??0)>=2).length;
 return{...common,status:all.length?'CLOSED':'NOT_CLOSED',future_levels_status:all.length?(externalCount?'EXTERNAL_SOURCE_LEVELS_AVAILABLE':'NOT_AVAILABLE'):'NOT_AVAILABLE',reason:all.length?null:'FUTURE_LEVELS_NOT_AVAILABLE',above,below,all_zones:all,display_source_zones:raw,provider_zone_count:all.length,external_zone_count:externalCount,calculated_zone_count:calculatedCount,consensus_zone_count:consensusCount,displayed_zone_count:above.length+below.length,omitted_zone_count:all.length-above.length-below.length,source_receipts:receipts,htx_source_backed_model:{...htxModel,zones:undefined},coverage_scope:htxModel.status==='CLOSED'?'ALL_ACTIVE_HTX_CONTRACTS_WITH_CLOSED_OFFICIAL_INPUTS_PLUS_AVAILABLE_EXTERNAL_SOURCES':'ONLY_RETURNED_SOURCE_MARKETS_AND_RANGE',coverage_status:htxModel.status==='CLOSED'?'FULL_HTX_CALCULATED_COVERAGE':'PARTIAL_SOURCE_BACKED_FUTURE_MAP',above_status:above.length?'CLOSED':'NOT_CLOSED',below_status:below.length?'CLOSED':'NOT_CLOSED'};
}
export default{PUMP_LIQUIDATION_ZONES_VERSION,classifyPump24h,buildPumpLiquidationZones};

export function coinLobsterFutureRows(context){return context?.status==='CLOSED'?arr(context.levels).map(z=>({...z,source:context.source,source_ts:context.source_ts,notional_unit:'USD',native_reference_price:context.reference_price,status:'CLOSED',estimated:true})):[];}
