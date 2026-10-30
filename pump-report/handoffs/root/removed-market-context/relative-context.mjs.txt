import {assertInstrument,factUsable,positive,finite,validTime,CANDLE_CCXT_TIME_BASIS} from './index.mjs';
export const RELATIVE_CONTEXT_SCHEMA='BINGX_CLOSED_RETURN_CONTEXT_V1';
export const RELATIVE_CONTEXT_UNIT='RETURN_PERCENT_SAME_WINDOW';
export const RELATIVE_PRICE_BASIS='EXACT_CLOSED_1M_CLOSE_TO_CLOSE';
// This first producer compares native BingX returns, never absolute prices or
// independent venues. Benchmark identities are explicit and cannot be labels.
export function qualifyRelativeContext(fact,{instrument,as_of_ts,freshness_ms=90000}={}){
  const no=reason=>({valid:false,reason,returns:[]});
  try{assertInstrument(instrument);}catch{return no('CANDIDATE_IDENTITY_UNQUALIFIED');}
  if(!factUsable(fact,as_of_ts)||fact.kind!=='market_context'||fact.instrument_id!==instrument.instrument_id||fact.origin!=='OBSERVED'||fact.venue!=='BINGX'||fact.unit!==RELATIVE_CONTEXT_UNIT||fact.value?.schema_version!==RELATIVE_CONTEXT_SCHEMA||fact.event_ts>fact.received_ts||fact.received_ts>as_of_ts||!positive(freshness_ms)||as_of_ts-fact.event_ts>freshness_ms||fact.expires_ts>fact.event_ts+freshness_ms)return no('RELATIVE_CONTEXT_FACT_UNQUALIFIED');
  const legs=fact.value.returns;if(!Array.isArray(legs)||legs.length<2||legs.length>3)return no('RELATIVE_CONTEXT_LEGS_REQUIRED');
  const roles=new Set();let start=null,end=null;
  for(const leg of legs){
    if(!['CANDIDATE','BTC','ETH'].includes(leg.role)||roles.has(leg.role))return no('RELATIVE_CONTEXT_ROLE_AMBIGUOUS');roles.add(leg.role);
    try{assertInstrument(leg.instrument);}catch{return no('RELATIVE_CONTEXT_LEG_IDENTITY_UNQUALIFIED');}
    if(typeof leg.instrument.identity_evidence_ref!=='string'||!leg.instrument.identity_evidence_ref)return no('RELATIVE_CONTEXT_LEG_IDENTITY_UNQUALIFIED');
    if(leg.role==='CANDIDATE'?(leg.instrument.instrument_id!==instrument.instrument_id||leg.instrument.asset_id!==instrument.asset_id):(leg.instrument.base!==leg.role||leg.instrument.native_symbol!==leg.role+'-USDT'))return no('RELATIVE_CONTEXT_WRONG_BENCHMARK');
    if(!validTime(leg.start_ts)||!validTime(leg.end_ts)||leg.end_ts<=leg.start_ts||![300000,900000,3600000].includes(leg.end_ts-leg.start_ts)||leg.end_ts!==fact.event_ts||leg.price_basis!==RELATIVE_PRICE_BASIS||leg.interval_ms!==60000||leg.time_basis!==CANDLE_CCXT_TIME_BASIS||leg.complete_closed_window!==true||typeof leg.fact_id!=='string'||!leg.fact_id||!positive(leg.start_price)||!positive(leg.end_price)||!finite(leg.return_pct))return no('RELATIVE_CONTEXT_WINDOW_OR_BASIS_UNQUALIFIED');
    const calculated=100*(leg.end_price/leg.start_price-1);if(!finite(calculated)||Math.abs(calculated-leg.return_pct)>1e-9*(1+Math.abs(calculated)))return no('RELATIVE_CONTEXT_RETURN_MISMATCH');
    if(start!==null&&(start!==leg.start_ts||end!==leg.end_ts))return no('RELATIVE_CONTEXT_WINDOW_MISMATCH');start=leg.start_ts;end=leg.end_ts;
  }
  if(!roles.has('CANDIDATE')||!roles.has('BTC')&&!roles.has('ETH'))return no('RELATIVE_CONTEXT_BENCHMARK_REQUIRED');
  return {valid:true,reason:null,returns:structuredClone(legs),start_ts:start,end_ts:end,coverage:roles.size===3?'BTC_AND_ETH':'ONE_BENCHMARK',independent_venue_count:1};
}
