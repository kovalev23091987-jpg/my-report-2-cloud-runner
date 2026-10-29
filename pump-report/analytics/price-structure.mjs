import {finite,positive,validTime,CANDLE_CCXT_TIME_BASIS,GROWTH_24H_UNIT,PRICE_STRUCTURE_UNIT,PRICE_STRUCTURE_BOUNDS} from '../contracts/index.mjs';
import {confirmedPivots} from './movement.mjs';

const text=value=>typeof value==='string'&&value.trim().length>0&&value.length<=512;
const key=pivot=>pivot.kind+':'+pivot.event_ts+':'+pivot.price;
// This pool is for constructPlan only. Never copy it into movement/next_wave.
export function consumePriceStructure(input,coreRows,corePivots,profile){
  const f=input.facts?.price_structure,at=input.analysis_ts,instrument=input.instrument;
  const diagnostic={status:f?'IGNORED':'ABSENT',reason:f?'PRICE_STRUCTURE_NOT_QUALIFIED':'OPTIONAL_PRICE_STRUCTURE_ABSENT',
    fact_id:text(f?.fact_id)?f.fact_id:null,rows:null,confirmed_pivots:null,additional_pivots:0,used_for_plan:false};
  const ignore=reason=>({pivots:corePivots,diagnostic:{...diagnostic,reason}});
  if(!f)return ignore('OPTIONAL_PRICE_STRUCTURE_ABSENT');
  if(typeof f!=='object'||Array.isArray(f)||f.kind!=='price_structure'||f.status!=='USABLE'||f.unit!==PRICE_STRUCTURE_UNIT||
    f.origin!=='OBSERVED'||f.venue!=='BINGX'||f.primary_provider!=='BINGX'||f.source!=='BINGX_OFFICIAL_PUBLIC_API')return ignore('PRICE_STRUCTURE_ENVELOPE_UNQUALIFIED');
  if(['instrument_id','asset_id','market_type','quote','settle','identity_evidence_ref'].some(field=>f[field]!==instrument[field]))return ignore('PRICE_STRUCTURE_IDENTITY_MISMATCH');
  const c=f.coverage,d=f.derived_from,g=input.facts.growth_24h;
  if(!text(f.fact_id)||!text(f.evidence_ref)||!text(f.identity_evidence_ref)||!validTime(f.event_ts)||!validTime(f.received_ts)||!validTime(f.expires_ts)||
    f.event_ts>f.received_ts||f.received_ts>at||at>f.expires_ts||at-f.event_ts>profile.freshness_ms.candles||
    f.expires_ts!==f.event_ts+profile.freshness_ms.candles)return ignore('PRICE_STRUCTURE_CLOCK_OR_EVIDENCE_UNBOUND');
  if(!c||c.complete!==true||c.time_qualified!==true||c.time_basis!==CANDLE_CCXT_TIME_BASIS||c.interval_ms!==PRICE_STRUCTURE_BOUNDS.interval_ms||
    c.quantity_used!==false||c.absolute_quantity!==null||!text(c.time_evidence_ref)||!text(c.owner_decision_ref)||c.expected_rows!==PRICE_STRUCTURE_BOUNDS.rows||
    !validTime(c.window_start)||c.window_end!==f.event_ts||c.window_end-c.window_start!==PRICE_STRUCTURE_BOUNDS.window_ms)return ignore('PRICE_STRUCTURE_COVERAGE_UNQUALIFIED');
  if(!d||d.additional_request!==false||d.original_receipt_id!==f.evidence_ref||d.original_received_ts!==f.received_ts||
    d.source_route!=='/openApi/swap/v3/quote/klines'||c.source_route!==d.source_route||d.interval_ms!==PRICE_STRUCTURE_BOUNDS.interval_ms||d.time_basis!==CANDLE_CCXT_TIME_BASIS||d.time_evidence_ref!==c.time_evidence_ref||
    !g||g.kind!=='growth_24h'||g.unit!==GROWTH_24H_UNIT||g.status!=='USABLE'||
    ['instrument_id','asset_id','market_type','quote','settle','venue','source','primary_provider','origin','identity_evidence_ref'].some(field=>g[field]!==f[field])||
    d.parent_fact_id!==g.fact_id||g.evidence_ref!==f.evidence_ref||g.event_ts!==f.event_ts||g.received_ts!==f.received_ts||g.expires_ts!==f.expires_ts)return ignore('PRICE_STRUCTURE_SHARED_REQUEST_UNBOUND');
  if(['complete','time_qualified','time_basis','time_evidence_ref','owner_decision_ref','interval_ms','window_start','window_end','expected_rows'].some(field=>g.coverage?.[field]!==c[field])||
    g.derived_from?.time_evidence_ref!==c.time_evidence_ref||g.derived_from?.time_basis!==c.time_basis||
    g.derived_from?.original_receipt_id!==g.evidence_ref||g.derived_from?.original_received_ts!==g.received_ts)return ignore('PRICE_STRUCTURE_COMPANION_PROOF_CONFLICT');
  const value=f.value,step=PRICE_STRUCTURE_BOUNDS.interval_ms;
  if(!Array.isArray(value)||value.length!==PRICE_STRUCTURE_BOUNDS.rows)return ignore('PRICE_STRUCTURE_COMPLETE_ROWS_REQUIRED');
  const rows=[];
  for(let index=0;index<value.length;index++){
    const row=value[index];
    if(!Array.isArray(row)||row.length!==5||!row.every(finite))return ignore('PRICE_STRUCTURE_ROW_INVALID');
    const [open_ts,open,high,low,close]=row,close_ts=open_ts+step;
    if(!validTime(open_ts)||open_ts%step!==0||!positive(open)||!positive(high)||!positive(low)||!positive(close)||
      low>Math.min(open,close)||high<Math.max(open,close)||low>high||close_ts>f.event_ts||close_ts>at||
      open_ts!==c.window_start+index*step)return ignore('PRICE_STRUCTURE_GRID_OR_OHLC_INVALID');
    rows.push({open_ts,close_ts,open,high,low,close});
  }
  if(rows.at(-1).close_ts!==f.event_ts)return ignore('PRICE_STRUCTURE_END_UNBOUND');
  if(!g.value||g.value.open!==rows[0].open||g.value.last!==rows.at(-1).close||g.value.start_ts!==c.window_start||
    g.value.end_ts!==f.event_ts||g.value.window_ms!==PRICE_STRUCTURE_BOUNDS.window_ms)return ignore('PRICE_STRUCTURE_COMPANION_BOUNDARY_CONFLICT');
  if(new TextEncoder().encode(JSON.stringify(value)).byteLength>PRICE_STRUCTURE_BOUNDS.bytes)return ignore('PRICE_STRUCTURE_BYTE_BOUND_EXCEEDED');
  const historyByTime=new Map(rows.map(row=>[row.open_ts,row]));let overlap=0;
  for(const core of coreRows){
    const row=historyByTime.get(core.open_ts);if(!row)continue;overlap++;
    if(core.close_ts!==row.close_ts||['open','high','low','close'].some(field=>core[field]!==row[field]))return ignore('PRICE_STRUCTURE_CORE_OVERLAP_CONFLICT');
  }
  if(!overlap)return ignore('PRICE_STRUCTURE_CORE_OVERLAP_REQUIRED');
  const pivots=confirmedPivots(rows,profile.pivot_radius_bars).filter(p=>p.event_ts<=p.known_ts&&p.known_ts<=at)
    .map(p=>({...p,fact_id:f.fact_id,evidence_ref:f.evidence_ref}));
  const pool=[...corePivots],seen=new Set(corePivots.map(key));
  for(const pivot of pivots)if(!seen.has(key(pivot))){seen.add(key(pivot));pool.push(pivot);}
  return {pivots:pool,diagnostic:{...diagnostic,status:'USABLE',reason:null,rows:rows.length,confirmed_pivots:pivots.length,additional_pivots:pool.length-corePivots.length}};
}
