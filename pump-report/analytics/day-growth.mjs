import {factUsable, positive, validTime, CANDLE_CCXT_TIME_BASIS, CANDLE_SEMANTICS_OWNER_REF, GROWTH_24H_UNIT, GROWTH_24H_WINDOW_MS} from '../contracts/index.mjs';
import {START_PROFILE} from '../profile/start-v1.mjs';
import {pct, growthAtLeast} from './math.mjs';

const STEP=60000,COUNT=1440,ROUTE='/openApi/swap/v3/quote/klines';
const text=value=>typeof value==='string'&&value.length>0;
// Consume SOURCE's independently qualified price window. Quantity has no role
// here, and reported ticker percentages cannot fill missing window evidence.
export function consumeObservedDayGrowth(fact,{instrument,as_of_ts,profile=START_PROFILE,rows=[]}){
  const reject=reason=>({usable:false,reason,window:null,fact_id:null});
  if(!fact)return reject('DAY_FACT_UNAVAILABLE');
  if(fact.kind!=='growth_24h'||fact.unit!==GROWTH_24H_UNIT||fact.origin!=='OBSERVED'||
    fact.source!=='BINGX_OFFICIAL_PUBLIC_API'||fact.primary_provider!=='BINGX')return reject('DAY_SOURCE_OR_UNIT_UNQUALIFIED');
  if(fact.instrument_id!==instrument.instrument_id||fact.asset_id!==instrument.asset_id||fact.venue!=='BINGX'||fact.market_type!=='PERPETUAL'||
    fact.quote!=='USDT'||fact.settle!=='USDT'||!text(instrument.identity_evidence_ref)||fact.identity_evidence_ref!==instrument.identity_evidence_ref)return reject('DAY_IDENTITY_UNQUALIFIED');
  const ttl=profile.freshness_ms?.candles;
  if(!positive(ttl)||!factUsable(fact,as_of_ts)||fact.event_ts>fact.received_ts||as_of_ts-fact.event_ts>ttl||
    fact.expires_ts!==fact.event_ts+ttl)return reject('DAY_CLOCK_OR_STATUS_UNQUALIFIED');
  const v=fact.value,c=fact.coverage,d=fact.derived_from;
  if(!positive(v?.open)||!positive(v?.last)||!validTime(v.start_ts)||!validTime(v.end_ts)||v.start_ts%STEP||v.end_ts%STEP||
    v.end_ts-v.start_ts!==GROWTH_24H_WINDOW_MS||v.window_ms!==GROWTH_24H_WINDOW_MS||fact.event_ts!==v.end_ts)return reject('DAY_EXACT_BOUNDARIES_REQUIRED');
  if(c?.window_start!==v.start_ts||c.window_end!==v.end_ts||c.window_ms!==GROWTH_24H_WINDOW_MS||c.interval_ms!==STEP||c.expected_rows!==COUNT||
    c.complete!==true||c.time_qualified!==true||c.time_basis!==CANDLE_CCXT_TIME_BASIS||!text(c.time_evidence_ref)||c.owner_decision_ref!==CANDLE_SEMANTICS_OWNER_REF||
    c.source_route!==ROUTE||c.native_returned_rows!==COUNT||c.included_closed_rows!==COUNT||c.outside_window_rows!==0||c.captured_unclosed_rows!==0||
    !Array.isArray(c.gaps)||c.gaps.length||c.start_boundary_present!==true||c.end_boundary_present!==true||
    c.quantity_used!==false||c.absolute_quantity!==null||c.independent_vendor_guarantee_claimed!==false)return reject('DAY_FULL_CLOSED_WINDOW_UNQUALIFIED');
  if(!text(fact.fact_id)||!text(fact.evidence_ref)||d?.kind!=='OBSERVED_OHLC_WINDOW_BOUNDARIES'||d.source_route!==ROUTE||d.interval_ms!==STEP||d.observed_closed_rows!==COUNT||
    d.original_receipt_id!==fact.evidence_ref||d.original_received_ts!==fact.received_ts||d.open_field!=='first.open'||d.last_field!=='last.close'||
    d.start_field!=='first.time'||d.end_field!=='last.time+60000'||d.time_basis!==CANDLE_CCXT_TIME_BASIS||d.time_evidence_ref!==c.time_evidence_ref||d.absolute_quantity!==null)return reject('DAY_ORIGINAL_OHLC_PROVENANCE_REQUIRED');
  const sharedEnd=rows.find(r=>r.close_ts===v.end_ts);
  if(sharedEnd&&sharedEnd.close!==v.last)return reject('DAY_END_PRICE_CONFLICT');
  const change=pct(v.open,v.last);
  if(!Number.isFinite(change))return reject('DAY_RETURN_NOT_FINITE');
  return {usable:true,reason:null,fact_id:fact.fact_id,window:{window_ms:GROWTH_24H_WINDOW_MS,start_ts:v.start_ts,end_ts:v.end_ts,start_price:v.open,end_price:v.last,
    return_pct:change,passed:growthAtLeast(v.last,v.open,profile.automatic_growth.day_pct),basis:'OBSERVED_CLOSED_OHLC_24H',fact_ids:[fact.fact_id],evidence_ref:fact.evidence_ref}};
}
