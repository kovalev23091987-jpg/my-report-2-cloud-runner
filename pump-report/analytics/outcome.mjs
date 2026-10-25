import {positive, validTime, finite} from '../contracts/index.mjs';
import {closedCandles, completeInterval, growthAtLeast, plusTenPrice} from './math.mjs';

const DD=(p,low)=>100*Math.max(0,1-low/p);
const touch=(r,z)=>positive(z?.lower)&&positive(z?.upper)&&r.low<=z.upper&&r.high>=z.lower;
function enclosingCoverage(rows,start,end){
  let cursor=start;
  for(const r of rows.filter(r=>r.close_ts>start&&r.open_ts<end)){
    if(r.open_ts>cursor)return false;
    cursor=Math.max(cursor,r.close_ts);
  }
  return cursor>=end;
}
function scenario(plan,rows,points,complete){
  if(!plan||!Array.isArray(plan.entry_zones)||!plan.exit_zone)return {status:plan?'PLAN_SHAPE_UNAVAILABLE':'NO_PLAN',entry_touched:null,exit_touched:null,execution_proven:false,user_profit:null};
  const entries=plan.entry_zones??[],touched=rows.filter(r=>entries.some(z=>touch(r,z))),entryPoints=points.filter(p=>entries.some(z=>p.price>=z.lower&&p.price<=z.upper));
  const first=Math.min(...touched.map(r=>r.open_ts),...entryPoints.map(p=>p.event_ts));
  const knownBy=Math.min(...touched.map(r=>r.close_ts),...entryPoints.map(p=>p.event_ts));
  const later=rows.filter(r=>r.open_ts>=knownBy),laterPoints=points.filter(p=>p.event_ts>=knownBy);
  const exited=later.some(r=>touch(r,plan.exit_zone))||laterPoints.some(p=>p.price>=plan.exit_zone.lower&&p.price<=plan.exit_zone.upper);
  const ambiguous=touched.some(r=>touch(r,plan.exit_zone));
  return {status:'PRICE_SCENARIO_ONLY',entry_touched:Number.isFinite(first)?true:complete?false:null,exit_touched:exited?true:ambiguous?null:complete&&Number.isFinite(first)?false:null,
    entry_then_exit_confirmed:exited?true:ambiguous?null:complete?false:null,intrabar_order_unknown:ambiguous&&!exited,
    execution_proven:false,user_profit:null,entry_first_interval:touched.length?{start_ts:touched[0].open_ts,end_ts:touched[0].close_ts}:null};
}
export function evaluateOutcome({signal,price_points=[],candles=[],as_of_ts}={}) {
  const valid=signal&&typeof signal.signal_id==='string'&&typeof signal.wave_id==='string'&&validTime(signal.t0)&&positive(signal.reference_price)&&validTime(as_of_ts)&&as_of_ts>=signal.t0;
  const p=signal?.reference_price,start=signal?.t0,deadline=valid?start+14400000:null;
  const base={signal_id:signal?.signal_id??null,wave_id:signal?.wave_id??null,independence_key:signal?.wave_id??null,mode:signal?.mode??null,map_mode:signal?.map_mode??null,
    rules_version:signal?.rules_version??null,t0:start??null,reference_price:p??null,target_price:valid?plusTenPrice(p):null,deadline_ts:deadline,status:'UNKNOWN',hit_ts:null,
    hit_interval:null,drawdown_before_hit_pct:null,drawdown_total_pct:null,hit_after_invalidation:null,coverage:{complete:false},reasons:[],scenario_outcome:null};
  if(!valid||!Array.isArray(price_points)||!Array.isArray(candles))return {...base,reasons:['INVALID_OUTCOME_INPUT']};
  const cutoff=Math.min(deadline,as_of_ts),barMap=new Map(),conflictingBars=new Set(),pathIssues=[];
  for(const row of candles){
    if(validTime(row?.close_ts)&&row.close_ts<=start||validTime(row?.open_ts)&&row.open_ts>=deadline)continue;
    const normalized=closedCandles([row],as_of_ts,60000);
    if(normalized.reason){pathIssues.push(normalized.reason);continue;}
    const r=normalized.rows[0];if(!r)continue;
    if(barMap.has(r.open_ts)&&JSON.stringify(barMap.get(r.open_ts))!==JSON.stringify(r)){conflictingBars.add(r.open_ts);continue;}
    barMap.set(r.open_ts,r);
  }
  if(conflictingBars.size)pathIssues.push('CONFLICTING_CANDLES');
  const normalized={rows:[...barMap.values()].filter(r=>!conflictingBars.has(r.open_ts)).sort((a,b)=>a.open_ts-b.open_ts)};
  const byTime=new Map();
  for(const row of price_points){
    if(!validTime(row?.event_ts)||!positive(row?.price))return {...base,reasons:['INVALID_PRICE_POINT']};
    if(row.event_ts<start||row.event_ts>cutoff)continue;
    if(byTime.has(row.event_ts)&&byTime.get(row.event_ts).price!==row.price)return {...base,reasons:['CONFLICTING_PRICE_POINT']};
    byTime.set(row.event_ts,{event_ts:row.event_ts,price:row.price});
  }
  const points=[...byTime.values()].sort((a,b)=>a.event_ts-b.event_ts);
  const rows=normalized.rows.filter(r=>r.open_ts>=start&&r.close_ts<=cutoff),boundary=normalized.rows.filter(r=>r.open_ts<start&&r.close_ts>start||r.open_ts<deadline&&r.close_ts>deadline);
  const complete=pathIssues.length===0&&as_of_ts>=deadline&&completeInterval(rows,start,deadline),partialComplete=pathIssues.length===0&&completeInterval(rows,start,cutoff);
  const enclosing=normalized.rows.filter(r=>r.close_ts>start&&r.open_ts<deadline);
  const noHitCovered=pathIssues.length===0&&as_of_ts>=deadline&&enclosingCoverage(enclosing,start,deadline)&&enclosing.every(r=>!growthAtLeast(r.high,p,10))&&!points.some(r=>growthAtLeast(r.price,p,10));
  const noHitBasis=noHitCovered?'ENCLOSING_CLOSED_MINUTE_BARS_ALL_HIGHS_BELOW_TARGET':null;
  const pointHit=points.find(r=>growthAtLeast(r.price,p,10)),barHit=rows.find(r=>growthAtLeast(r.high,p,10));
  const hit=Boolean(pointHit||barHit),proofEnd=barHit&&(!pointHit||barHit.close_ts<=pointHit.event_ts)?barHit.close_ts:pointHit?.event_ts??null;
  const firstExact=pointHit&&(!barHit||pointHit.event_ts<=barHit.open_ts);
  const result={...base,status:hit?'HIT':complete||noHitCovered?'MISS':'UNKNOWN',hit_ts:firstExact?pointHit.event_ts:null,
    hit_interval:hit&&!firstExact?{start_ts:barHit.open_ts,end_ts:barHit.close_ts}:null,
    coverage:{complete,no_hit_period_covered:noHitCovered,no_hit_basis:noHitBasis,basis:complete?'EXACT_CLOSED_MINUTE_INTERVAL':noHitBasis??'INSUFFICIENT_OR_BOUNDARY_AMBIGUOUS',
      covered_until_ts:cutoff,observed_interval_complete:partialComplete,fully_contained_candles:rows.length,boundary_candles_excluded:boundary.length,
      price_points:points.length,point_samples_prove_continuity:false},reasons:[...new Set(pathIssues)],scenario_outcome:scenario(signal.plan,rows,points,complete)};
  if(!hit&&!complete&&!noHitCovered)result.reasons.push(as_of_ts<deadline?'HORIZON_NOT_MATURE':'INSUFFICIENT_HISTORY_COVERAGE');
  if(noHitCovered&&!complete)result.reasons.push('NO_HIT_PROVEN_BY_ENCLOSING_BARS_BOUNDARY_DRAWDOWN_UNKNOWN');
  if(boundary.some(r=>growthAtLeast(r.high,p,10)))result.reasons.push('BOUNDARY_HIGH_NOT_PROOF');
  if(complete)result.drawdown_total_pct=DD(p,Math.min(p,...rows.map(r=>r.low),...points.map(r=>r.price)));
  if(hit&&firstExact&&completeInterval(rows,start,pointHit.event_ts)){
    result.drawdown_before_hit_pct=DD(p,Math.min(p,...rows.filter(r=>r.close_ts<=pointHit.event_ts).map(r=>r.low),...points.filter(r=>r.event_ts<=pointHit.event_ts).map(r=>r.price)));
  }else if(hit)result.reasons.push(firstExact?'PRE_HIT_COVERAGE_INCOMPLETE':'INTRABAR_FIRST_HIT_TIME_AND_ORDER_UNKNOWN');
  const invalid=signal.plan?.invalidation;
  if(hit&&invalid?.kind==='PRICE_BELOW'&&positive(invalid.price)){
    const before=firstExact?pointHit.event_ts:barHit.open_ts;
    const cancel=points.some(r=>r.event_ts<before&&r.price<invalid.price)||rows.some(r=>r.close_ts<=before&&r.low<invalid.price);
    result.hit_after_invalidation=cancel?true:completeInterval(rows,start,proofEnd)?false:null;
    if(barHit&&barHit.low<invalid.price&&!cancel)result.hit_after_invalidation=null;
  }
  return result;
}
