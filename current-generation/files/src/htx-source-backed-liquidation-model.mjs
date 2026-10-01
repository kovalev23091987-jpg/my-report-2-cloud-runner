export const HTX_SOURCE_BACKED_LIQUIDATION_MODEL_VERSION='htx-source-backed-liquidation-model-v1-20261001';

const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value):null;
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const text=value=>String(value??'').trim();
const median=values=>{const rows=values.filter(Number.isFinite).sort((a,b)=>a-b);if(!rows.length)return null;const i=Math.floor(rows.length/2);return rows.length%2?rows[i]:(rows[i-1]+rows[i])/2;};
const round=value=>Number(Number(value).toPrecision(12));

function exactContract(value){
 const contract=text(value).normalize('NFC').toUpperCase();
 return /^[\p{L}\p{N}]{1,32}-USDT$/u.test(contract)?contract:null;
}

function sourceClock(context,observedTs){
 const candidates=[context?.source_ts,context?.market_source_ts,context?.snapshot_ts].map(finite).filter(value=>value!==null&&value<=observedTs&&observedTs-value<=5*60_000);
 return candidates.length?Math.max(...candidates):null;
}

function returnSamples(context){
 const durations={m5:5/60,m15:15/60,h1:1,h4:4,h24:24,'5m':5/60,'15m':15/60,'1h':1,'4h':4,'24h':24};
 const rows=[];
 for(const [name,hours] of Object.entries(durations)){
  const raw=finite(context?.price_change_pct?.[name]??context?.price_changes?.[name]);
  if(raw!==null&&hours>0)rows.push(Math.abs(raw)/Math.sqrt(hours));
 }
 return rows;
}

function volatility(context,current){
 const samples=returnSamples(context),high=finite(context?.market_24h?.high??context?.high_24h),low=finite(context?.market_24h?.low??context?.low_24h),open=finite(context?.market_24h?.open??context?.open_24h),tick=finite(context?.price_tick);
 if(high>0&&low>0&&high>=low)samples.push(((high-low)/current*100)/Math.sqrt(24));
 if(open>0)samples.push(Math.abs((current/open-1)*100)/Math.sqrt(24));
 const nonzero=samples.filter(value=>value>0),tickPct=tick>0?tick/current*100:null;
 const measured=median(nonzero);
 if(measured===null&&tickPct===null)return null;
 return clamp(Math.max(measured??0,(tickPct??0)*4,0.08),0.08,35);
}

function historicalAnchors(context,current,profile){
 const raw=[
  {price:current,kind:'CURRENT_MARK'},
  {price:finite(context?.market_24h?.open??context?.open_24h),kind:'HTX_24H_OPEN'},
  {price:finite(context?.market_24h?.high??context?.high_24h),kind:'HTX_24H_HIGH'},
  {price:finite(context?.market_24h?.low??context?.low_24h),kind:'HTX_24H_LOW'},
 ];
 for(const [name,value] of Object.entries(context?.price_change_pct??{})){
  const move=finite(value);if(move===null||move<=-99.9)continue;
  raw.push({price:current/(1+move/100),kind:`IMPLIED_ENTRY_${name}`});
 }
 if(profile?.status==='CLOSED'&&profile?.contract===context.contract){
  raw.push({price:finite(profile.poc),kind:'HTX_VOLUME_POC',weight:1.45},{price:finite(profile.val),kind:'HTX_VOLUME_VAL',weight:1.2},{price:finite(profile.vah),kind:'HTX_VOLUME_VAH',weight:1.2});
 }
 const out=[];
 for(const row of raw){if(!(row.price>0))continue;const old=out.find(item=>Math.abs(item.price/row.price-1)<=0.001);if(old){old.kinds.push(row.kind);old.weight=Math.max(old.weight,row.weight??1);}else out.push({price:row.price,kinds:[row.kind],weight:row.weight??1});}
 return out;
}

function leverageScenarios(sigma,configured=[]){
 const exact=[...new Set((Array.isArray(configured)?configured:[]).map(finite).filter(value=>Number.isInteger(value)&&value>=2&&value<=200))].sort((a,b)=>a-b);
 if(exact.length)return{values:exact.slice(-5),basis:'HTX_OFFICIAL_LEVERAGE_TIERS'};
 const cap=sigma>=8?5:sigma>=4?10:sigma>=2?20:50;
 const values=[3,5,10,20,50].filter(value=>value<=cap);
 return{values:values.length?values:[3],basis:'VOLATILITY_CONSTRAINED_SCENARIOS'};
}

function crowding(context){
 const funding=finite(context?.funding_rate_pct)??0,oiMoves=Object.values(context?.oi_change_pct??{}).map(finite).filter(value=>value!==null),priceMoves=Object.values(context?.price_change_pct??{}).map(finite).filter(value=>value!==null),oi=oiMoves.length?median(oiMoves):0,move=priceMoves.length?median(priceMoves):0;
 const fundingBias=Math.tanh(funding/0.05)*0.12,jointBias=oi>0.25?Math.sign(move)*Math.min(0.08,Math.abs(oi)/100):0;
 const longShare=clamp(0.5+fundingBias+jointBias,0.25,0.75);
 return{long_share:longShare,short_share:1-longShare,funding_bias:fundingBias,price_oi_bias:jointBias};
}

function consolidate(rows,current,sigma,totalOi){
 const tolerancePct=clamp(sigma*.18,0.18,1.25),clusters=[];
 for(const row of [...rows].sort((a,b)=>a.price-b.price)){
  let cluster=clusters.find(item=>item.liquidated_side===row.liquidated_side&&Math.abs((row.price/item.price-1)*100)<=tolerancePct);
  if(!cluster){cluster={...row,components:[],weight_sum:0,weighted_price:0};clusters.push(cluster);}
  cluster.components.push(row);cluster.weight_sum+=row.model_weight;cluster.weighted_price+=row.price*row.model_weight;
 }
 for(const cluster of clusters){
  cluster.price=round(cluster.weighted_price/cluster.weight_sum);cluster.native_price=cluster.price;cluster.distance_pct=(cluster.price/current-1)*100;
  cluster.notional=Math.max(1,totalOi*cluster.components.reduce((sum,row)=>sum+row.model_weight,0)/rows.reduce((sum,row)=>sum+row.model_weight,0));
  cluster.notional_usdt=cluster.notional;cluster.size_usd=cluster.notional;
  cluster.anchor_kinds=[...new Set(cluster.components.flatMap(row=>row.anchor_kinds))];cluster.leverage_scenarios=[...new Set(cluster.components.map(row=>row.leverage))].sort((a,b)=>a-b);
  delete cluster.components;delete cluster.weight_sum;delete cluster.weighted_price;delete cluster.model_weight;delete cluster.leverage;
 }
 return clusters;
}

export function buildHtxSourceBackedLiquidationModel({contract,current_price,observed_ts=Date.now(),calculation_context={},volume_profile=null}={}){
 const exact=exactContract(contract),current=finite(current_price),observed=finite(observed_ts),context={...calculation_context,contract:exact};
 const common={version:HTX_SOURCE_BACKED_LIQUIDATION_MODEL_VERSION,source:'HTX_SOURCE_BACKED_MODEL',contract:exact,status:'NOT_CLOSED',zones:[],calculated:true,provider_model_not_position_census:true,notional_summed_across_sources:false};
 if(!exact||['BTC-USDT','ETH-USDT'].includes(exact)||!(current>0)||!Number.isSafeInteger(observed))return{...common,reason:'EXACT_HTX_CONTRACT_CURRENT_PRICE_AND_CLOCK_REQUIRED'};
 const clock=sourceClock(context,observed),oi=finite(context?.open_interest_value_usdt),turnover=finite(context?.turnover_24h_usdt),sigma=volatility(context,current);
 if(clock===null||!(oi>0)||turnover===null||turnover<0||!(sigma>0))return{...common,reason:'FRESH_HTX_PRICE_OI_TURNOVER_AND_VOLATILITY_REQUIRED',inputs:{source_ts:clock,open_interest_value_usdt:oi,turnover_24h_usdt:turnover,volatility_1h_pct:sigma}};
 const profile=volume_profile?.status==='CLOSED'&&volume_profile?.contract===exact?volume_profile:null,anchors=historicalAnchors(context,current,profile),leverages=leverageScenarios(sigma,context?.leverage_tiers),skew=crowding(context),maintenance=clamp(sigma/100*0.08,0.0025,0.0125),raw=[];
 for(const anchor of anchors)for(const leverage of leverages.values){
  const distance=clamp(1/leverage-maintenance,0.0125,0.45),baseWeight=anchor.weight/Math.sqrt(leverage);
  const longPrice=anchor.price*(1-distance),shortPrice=anchor.price*(1+distance);
  if(longPrice>0&&longPrice<current)raw.push({price:longPrice,native_price:longPrice,liquidated_side:'LONG',model_weight:baseWeight*skew.long_share,leverage,anchor_kinds:anchor.kinds});
  if(shortPrice>current)raw.push({price:shortPrice,native_price:shortPrice,liquidated_side:'SHORT',model_weight:baseWeight*skew.short_share,leverage,anchor_kinds:anchor.kinds});
 }
 if(!raw.length)return{...common,reason:'NO_GEOMETRICALLY_VALID_MODEL_ZONES'};
 const zones=consolidate(raw,current,sigma,oi).map(row=>({...row,kind:'PROJECTED',status:'CLOSED',source:'Расчётная модель HTX',provider:'Расчётная модель HTX',venue:'HTX',source_ts:clock,price_quote:'USDT',notional_unit:'USDT',native_reference_price:current,estimated:true,exact_amount_available:false,amount_semantics:'HTX_OPEN_INTEREST_ALLOCATION_ESTIMATE',price_semantics:'HTX_SOURCE_BACKED_MODEL_ZONE',coverage:'ALL_ACTIVE_HTX_USDT_SWAP_WITH_CLOSED_BATCH_INPUTS',evidence_class:'SOURCE_BACKED_CALCULATED_MODEL',independence_group:'HTX_OFFICIAL_MODEL',model_sources:['HTX_CURRENT_PRICE','HTX_OPEN_INTEREST','HTX_TURNOVER','HTX_FUNDING','HTX_PRICE_HISTORY',...(profile?['HTX_EXACT_VOLUME_PROFILE']:[])],model_version:HTX_SOURCE_BACKED_LIQUIDATION_MODEL_VERSION}));
 return{...common,status:'CLOSED',reason:null,zones,source_ts:clock,reference_price:current,volatility_1h_pct:sigma,open_interest_value_usdt:oi,turnover_24h_usdt:turnover,leverage_scenarios:leverages.values,leverage_basis:leverages.basis,maintenance_buffer:maintenance,crowding:skew,anchor_count:anchors.length,volume_profile_used:Boolean(profile),coverage:'ALL_ACTIVE_HTX_USDT_SWAP_WITH_CLOSED_BATCH_INPUTS'};
}

function priority(row){if(row?.estimated===false)return 100;if(row?.independence_group==='HTX_OFFICIAL_MODEL')return 55;return 80;}
function independence(row){return text(row?.independence_group)||text(row?.venue)||text(row?.source)||'UNKNOWN';}

export function reconcileLiquidationZones(rows,{reference_price,volatility_pct=null}={}){
 const ref=finite(reference_price),sigma=finite(volatility_pct),tolerance=clamp((sigma??2)*.2,.35,1.5),clusters=[];
 for(const row of Array.isArray(rows)?rows:[]){if(!(row?.price>0)||!['ABOVE','BELOW'].includes(row.side))continue;let cluster=clusters.find(item=>item.side===row.side&&Math.abs((row.price/item.center-1)*100)<=tolerance);if(!cluster){cluster={side:row.side,center:row.price,rows:[]};clusters.push(cluster);}cluster.rows.push(row);cluster.center=cluster.rows.reduce((sum,item)=>sum+item.price*priority(item),0)/cluster.rows.reduce((sum,item)=>sum+priority(item),0);}
 return clusters.map(cluster=>{
  const ordered=[...cluster.rows].sort((a,b)=>priority(b)-priority(a)||(b.notional??0)-(a.notional??0)),primary=ordered[0],groups=[...new Set(ordered.map(independence))],sources=[...new Set(ordered.map(row=>row.source).filter(Boolean))],price=round(cluster.center),notional=Math.max(...ordered.map(row=>finite(row.notional)??0));
  const confidence=groups.length>=3?'высокая':groups.length===2?'повышенная':primary.independence_group==='HTX_OFFICIAL_MODEL'?'расчётная':'один источник';
  const sameHtxQuote=primary.distance_reference_basis==='HTX_CURRENT_SAME_QUOTE';
  return{...primary,price,native_price:price,distance_pct:sameHtxQuote&&ref>0?(price/ref-1)*100:primary.distance_pct,notional:notional>0?notional:null,notional_usdt:notional>0?notional:null,source:sources.join(' + '),corroborating_sources:sources,independent_source_count:groups.length,independence_groups:groups,consensus_confidence_ru:confidence,consensus_tolerance_pct:tolerance,consensus_component_count:ordered.length,consensus_components:ordered.map(row=>({price:row.price,source:row.source,independence_group:independence(row),estimated:row.estimated===true})),estimated:ordered.length>1?true:primary.estimated,exact_amount_available:ordered.length>1?false:primary.exact_amount_available,exact_notional_usdt:ordered.length>1?null:primary.exact_notional_usdt,amount_semantics:ordered.length>1?'BEST_SINGLE_SOURCE_NOTIONAL_NOT_SUMMED':primary.amount_semantics};
 });
}

export default{HTX_SOURCE_BACKED_LIQUIDATION_MODEL_VERSION,buildHtxSourceBackedLiquidationModel,reconcileLiquidationZones};
