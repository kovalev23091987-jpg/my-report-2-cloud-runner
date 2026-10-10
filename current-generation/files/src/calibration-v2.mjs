const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
export function evaluateZoneTouch({direction,level_price,path_high,path_low}={}) {
  const level=finite(level_price),high=finite(path_high),low=finite(path_low);
  if(!['LONG','SHORT'].includes(direction)||level===null||high===null||low===null||
     level<=0||low<=0||high<low)return {status:'CENSORED',zone_touch:null};
  return {status:'CLOSED',zone_touch:direction==='LONG'?high>=level:low<=level};
}
export function forecastGroupKey({asset,wave,upstream_venue,forecast_family,horizon}={}){return [asset,wave,upstream_venue,forecast_family,horizon].join('|');}
export function calibrationReadiness(rows=[]) {
  const valid=[],invalid=[];
  for(const row of rows||[]){
    const ts=row?.observed_ts;
    if(!row||!Number.isSafeInteger(ts)||!Number.isFinite(new Date(ts).getTime())||
      !['LONG','SHORT'].includes(row.direction)||
      ['asset','wave','upstream_venue','forecast_family','horizon'].some(k=>typeof row[k]!=='string'||!row[k].trim())){
      invalid.push(row);continue;
    }
    valid.push(row);
  }
  const groups=new Map();for(const row of valid)groups.set(forecastGroupKey(row),row);
  const unique=[...groups.values()];
  const days=new Set(unique.map(x=>new Date(x.observed_ts).toISOString().slice(0,10))).size;
  const assets=new Set(unique.map(x=>x.asset)).size;
  const long=unique.filter(x=>x.direction==='LONG').length,short=unique.filter(x=>x.direction==='SHORT').length;
  const eligible=unique.length>=200&&days>=30&&assets>=20&&long>=50&&short>=50;
  return {eligible,status:eligible?'ELIGIBLE':'INSUFFICIENT_CALIBRATION_DATA',independent_waves:unique.length,calendar_days:days,assets,long,short,excluded_invalid:invalid.length,split:eligible?{train:.6,validation:.2,test:.2,embargo_hours:24}:null};
}
export function resolveCalibrationFactor({apply_enabled=false,state='SHADOW',candidate_factor=1,readiness,test_lower_bound=null,action_coverage=null,hard_gates_unchanged=false,costs_not_worse=false,false_data_not_worse=false}={}) {
  const factor=finite(candidate_factor),coverage=finite(action_coverage),lower=finite(test_lower_bound);
  const pass=apply_enabled===true&&state==='ACTIVE'&&readiness?.eligible===true&&
    factor!==null&&factor>0&&lower!==null&&lower>0&&lower<=1&&
    coverage!==null&&coverage>=.8&&coverage<=1&&
    hard_gates_unchanged===true&&costs_not_worse===true&&false_data_not_worse===true;
  return {factor:pass?Math.min(1.25,Math.max(.75,factor)):1,status:pass?'ACTIVE':'SHADOW_FACTOR_ONE',automatic_threshold_change:false};
}
export function assignChronologicalSplit(rows=[]){const ordered=[...rows].sort((a,b)=>a.observed_ts-b.observed_ts),n=ordered.length,a=Math.floor(n*.6),b=Math.floor(n*.8);return ordered.map((row,i)=>({...row,split:i<a?'TRAIN':i<b?'VALIDATION':'TEST'}));}
