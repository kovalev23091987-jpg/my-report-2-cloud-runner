export const PUMP_LIQUIDATION_ZONES_VERSION='liquidation-zones-v3-all-htx-futures-strength-bands-20260927';

const finite=value=>{
 if(value===null||value===undefined||value==='')return null;
 const n=Number(value);return Number.isFinite(n)?n:null;
};
const text=value=>value===null||value===undefined?'':String(value).trim();
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const strengthLabel=score=>score>=75?'огромная':score>=55?'крупная':score>=35?'средняя':'небольшая';
const bandFor=distance=>{
 const d=Math.abs(distance);
 if(d>=5&&d<15)return '5_15';
 if(d>=15&&d<30)return '15_30';
 if(d>=30&&d<60)return '30_60';
 if(d>=60)return '60_PLUS';
 return null;
};
const BAND_ORDER=Object.freeze(['5_15','15_30','30_60','60_PLUS']);
const BAND_META=Object.freeze({
 '5_15':Object.freeze({min:5,max:15,center:9,base_strength:67,label_ru:'от 5% до 15%'}),
 '15_30':Object.freeze({min:15,max:30,center:21,base_strength:56,label_ru:'от 15% до 30%'}),
 '30_60':Object.freeze({min:30,max:60,center:42,base_strength:45,label_ru:'от 30% до 60%'}),
 '60_PLUS':Object.freeze({min:60,max:null,center:75,base_strength:34,label_ru:'дальше 60%'}),
});

function exactNotional(row){
 const n=finite(row?.notional_usdt??row?.cluster_notional_usd??row?.size_usd??row?.largest_provider_position_usd);
 return n!==null&&n>0?n:null;
}
function positiveMetric(...values){
 for(const value of values){const n=finite(value);if(n!==null&&n>0)return n;}
 return null;
}
function normalize(rows,kind,current){
 return (Array.isArray(rows)?rows:[]).map(row=>{
   const price=finite(row?.level_price??row?.center_price??row?.native_price??row?.price??row?.level);
   if(price===null||price<=0||!text(row?.source??row?.provider)||String(row?.status||'CLOSED').toUpperCase()!=='CLOSED')return null;
   const distance=(price/current-1)*100,side=price>current?'ABOVE':price<current?'BELOW':'AT_PRICE',band=bandFor(distance);
   if(side==='AT_PRICE'||!band)return null;
   const providers=Array.isArray(row?.providers)?row.providers.filter(Boolean):[];
   return {
     kind,price,range:row?.range??null,distance_pct:distance,side,band,
     exact_notional_usdt:providers.includes('0xArchive')?null:exactNotional(row),
     relative_strength_value:positiveMetric(row?.strength_score,row?.strength,row?.last_strength,row?.raw_size),
     position_count:positiveMetric(row?.position_count,row?.positions_count,row?.account_count,row?.density_count),
     provider_count:positiveMetric(row?.provider_count,row?.source_count,providers.length),
     source:text(row?.source??row?.provider),source_ts:finite(row?.source_ts??row?.observed_ts),coverage:row?.coverage??null,
     freshness:row?.freshness??null,lifecycle:text(row?.lifecycle)||null,raw:row,
   };
 }).filter(Boolean).filter(row=>!['SWEPT','INVALIDATED','EXPIRED'].includes(String(row.lifecycle||'').toUpperCase()));
}

function percentile(value,values){
 if(value===null||!values.length)return null;
 if(values.length===1)return 0.6;
 const below=values.filter(v=>v<value).length,equal=values.filter(v=>v===value).length;
 return clamp((below+(equal-1)/2)/(values.length-1),0,1);
}
function observedStrength(row,allRows){
 const scores=[],basis=[];
 const notionals=allRows.map(x=>x.exact_notional_usdt).filter(x=>x!==null).sort((a,b)=>a-b);
 const relatives=allRows.map(x=>x.relative_strength_value).filter(x=>x!==null).sort((a,b)=>a-b);
 if(row.exact_notional_usdt!==null){
   scores.push(clamp(20+20*(Math.log10(row.exact_notional_usdt)-3),10,95));
   scores.push(25+70*percentile(row.exact_notional_usdt,notionals));
   basis.push('EXACT_NOTIONAL','RELATIVE_TO_COIN_ZONES');
 }
 if(row.relative_strength_value!==null){scores.push(20+75*percentile(row.relative_strength_value,relatives));basis.push('RELATIVE_PROVIDER_STRENGTH');}
 if(row.position_count!==null){scores.push(row.position_count>=8?90:row.position_count>=4?68:row.position_count>=2?48:25);basis.push('POSITION_DENSITY');}
 if(row.provider_count!==null){scores.push(row.provider_count>=3?90:row.provider_count===2?72:38);basis.push('SOURCE_AGREEMENT');}
 if(!scores.length)return null;
 const score=clamp(scores.reduce((sum,value)=>sum+value,0)/scores.length,0,100);
 return {score,strength_label_ru:strengthLabel(score),strength_basis:[...new Set(basis)]};
}

function calculatedDistance(meta,move,side){
 if(meta.max===null){
   const far=meta.center+Math.min(move,300)*0.22;
   return side==='BELOW'?Math.min(92,far):far;
 }
 const shifted=meta.center*(1+Math.min(move,200)/800);
 return clamp(shifted,meta.min+0.25,meta.max-0.25);
}
function calculatedStrength({meta,side,move,oi,funding,volume,early_anomaly}){
 let score=meta.base_strength;
 score+=Math.min(Math.abs(move),100)*0.08;
 score+=Math.min(Math.abs(oi??0),30)*0.25;
 score+=Math.min(Math.max((volume??1)-1,0),8)*2;
 score+=early_anomaly?4:0;
 if(side==='BELOW'){
   if(move>0)score+=5;
   if((funding??0)>0)score+=Math.min(Math.abs(funding)*200,8);
   if((oi??0)>0&&move>0)score+=4;
 }else{
   if(move<0)score+=5;
   if((funding??0)<0)score+=Math.min(Math.abs(funding)*200,8);
   if((oi??0)>0&&move<0)score+=4;
 }
 return clamp(score,5,96);
}
function calculatedZone({band,side,current,moveSigned,oi,funding,volume,early_anomaly}){
 const meta=BAND_META[band],move=Math.abs(moveSigned),distance=calculatedDistance(meta,move,side);
 const signedDistance=side==='ABOVE'?distance:-distance;
 const price=current*(1+signedDistance/100);
 const score=calculatedStrength({meta,side,move:moveSigned,oi,funding,volume,early_anomaly});
 return {
   kind:'CALCULATED',price,distance_pct:signedDistance,side,band,
   strength_score_0_100:score,strength_label_ru:strengthLabel(score),
   strength_basis:['LEVERAGE_STRESS_BAND','HTX_PRICE','OI_VOLUME_FUNDING_CONTEXT'],
   exact_notional_usdt:null,source:'HTX_CALCULATED_LIQUIDATION_MODEL',source_ts:null,
   calculation_status:'CLOSED',calculation_label_ru:'расчётная вероятная зона',
   range_label_ru:meta.label_ru,liquidated_side:side==='ABOVE'?'SELLERS':'BUYERS',
   selection_role:`STRONGEST_IN_${band}`,exact_amount_available:false,
 };
}

function pickSide(rows,side,context){
 const sameSide=rows.filter(row=>row.side===side),out=[];
 for(const band of BAND_ORDER){
   const candidates=sameSide.filter(row=>row.band===band).map(row=>{
     const strength=observedStrength(row,rows);
     return strength?{...row,strength_score_0_100:strength.score,strength_label_ru:strength.strength_label_ru,strength_basis:strength.strength_basis,calculation_label_ru:row.kind==='REALIZED'?'фактическая зона':'подтверждённая расчётная зона',exact_amount_available:row.exact_notional_usdt!==null}:null;
   }).filter(Boolean).sort((a,b)=>b.strength_score_0_100-a.strength_score_0_100||Math.abs(a.distance_pct)-Math.abs(b.distance_pct));
   const selected=candidates[0]??calculatedZone({band,side,...context});
   out.push({...selected,selection_role:`STRONGEST_IN_${band}`,liquidated_side:side==='ABOVE'?'SELLERS':'BUYERS'});
 }
 return out;
}

export function classifyPump24h(changePct,{early_anomaly=false}={}){
 const value=finite(changePct),move=value===null?null:Math.abs(value);
 return {status:value===null&&!early_anomaly?'NOT_CLOSED':'CLOSED',rolling_24h_change_pct:value,absolute_move_pct:move,is_pump:(move!==null&&move>=5)||early_anomaly,is_strong_move:move!==null&&move>=5,early_anomaly:early_anomaly===true,threshold_pct:5,inclusive:true,upper_ceiling_pct:null};
}

export function buildPumpLiquidationZones({
 contract=null,rolling_24h_change_pct,current_price,early_anomaly=false,priority_reason=null,
 realized=[],projected=[],calculation_context={},
}={}){
 const base=text(contract).normalize('NFC').toUpperCase().replace(/-USDT$/,''),px=finite(current_price);
 const pump=classifyPump24h(rolling_24h_change_pct,{early_anomaly});
 if(['BTC','ETH'].includes(base))return{version:PUMP_LIQUIDATION_ZONES_VERSION,status:'EXCLUDED_BY_USER_POLICY',pump,current_price:px,above:[],below:[],reason:'BTC_ETH_EXCLUDED_BY_USER_POLICY'};
 if(!base||px===null||px<=0)return{version:PUMP_LIQUIDATION_ZONES_VERSION,status:'TECHNICAL_FAILURE',pump,current_price:px,above:[],below:[],reason:'HTX_CONTRACT_OR_CURRENT_PRICE_REQUIRED'};
 const rows=normalize(projected,'PROJECTED',px).filter(row=>!['REALIZED','REALIZED_EVENTS','REALIZED_LIQUIDATION_EVENT','REALIZED_LIQUIDATION_AGGREGATE'].includes(String(row.raw?.evidence_type??row.raw?.role??row.raw?.kind??'').toUpperCase()));
 const move=finite(rolling_24h_change_pct)??0;
 const context={current:px,moveSigned:move,oi:finite(calculation_context?.oi_change_pct),funding:finite(calculation_context?.funding_rate_pct),volume:finite(calculation_context?.volume_ratio),early_anomaly};
 const above=pickSide(rows,'ABOVE',context),below=pickSide(rows,'BELOW',context);
 const providerZones=above.concat(below).filter(row=>row.kind!=='CALCULATED').length;
 return {
   version:PUMP_LIQUIDATION_ZONES_VERSION,status:'CLOSED',pump,current_price:px,priority_reason:text(priority_reason)||null,
   above,below,future_levels_required:true,future_levels_status:providerZones?'SOURCE_LEVELS_AVAILABLE':'NOT_AVAILABLE',historical_events:realized,realized_projected_separate:true,distance_cap_pct:null,max_per_side:4,no_invented_exact_amounts:true,
   calculated_fallback_enabled:true,calculated_zones_are_not_observed_positions:true,upper_move_ceiling_pct:null,
   coverage_scope:'ALL_HTX_FUTURES_EXCEPT_BTC_ETH',coverage_status:providerZones===8?'PROVIDER_ZONES_ALL_BANDS':providerZones?'MIXED_PROVIDER_AND_CALCULATED':'CALCULATED_FOR_ALL_BANDS',
   provider_zone_count:providerZones,above_status:'CLOSED',below_status:'CLOSED',
 };
}

export default{PUMP_LIQUIDATION_ZONES_VERSION,classifyPump24h,buildPumpLiquidationZones};
