/** Evidence provenance only. No score, trade recommendation, or network operation. */
export const OI_WINDOW_RECEIPT_VERSION = 'oi-window-receipt-post-v7-20260926';
const number = v => (typeof v === 'number' && Number.isFinite(v)) ? v : null;
const stamp = v => Number.isSafeInteger(v) && v >= 1_000_000_000_000;

export function buildHtxOiWindowReceipt({window=null, contract_code=null, as_of_ts=null}={}) {
  const fail = reason => ({version:OI_WINDOW_RECEIPT_VERSION,status:'NOT_CLOSED',reason,contract_code,venue:'HTX',metric:'OPEN_INTEREST',unit:'CONTRACTS',change_pct:null});
  if (typeof contract_code !== 'string' || !/^[\p{L}\p{N}]+-USDT$/u.test(contract_code)) return fail('CONTRACT_IDENTITY_REQUIRED');
  if (!stamp(as_of_ts)) return fail('AS_OF_REQUIRED');
  if (!window || window.usable !== true || window.coverage !== 'closed') return fail('OI_WINDOW_NOT_USABLE');
  const start=window.window_start_ts, end=window.window_end_ts, hours=number(window.requested_hours);
  const from=number(window.contracts?.start), to=number(window.contracts?.end), delta=number(window.contracts?.change_pct);
  if (!stamp(start)||!stamp(end)||start>=end||end>as_of_ts) return fail('WINDOW_TIME_INVALID_OR_AFTER_AS_OF');
  if (hours===null||hours<=0||Math.abs((end-start)/3600000-hours)>0.1) return fail('WINDOW_DURATION_MISMATCH');
  if (from===null||to===null||from<=0||to<0||delta===null) return fail('CONTRACT_COUNTS_REQUIRED_NO_USD_FALLBACK');
  const checked=(to/from-1)*100;
  if (Math.abs(checked-delta)>0.000001) return fail('OI_CHANGE_ARITHMETIC_MISMATCH');
  const limit=number(window.freshness_limit_sec);
  if (limit===null||limit<0||(as_of_ts-end)/1000>limit) return fail('OI_SOURCE_WINDOW_STALE');
  return {
    version:OI_WINDOW_RECEIPT_VERSION,status:'CLOSED',reason:null,
    contract_code,venue:'HTX',market_type:'USDT_M_PERPETUAL',metric:'OPEN_INTEREST',
    source:'HTX official public API',endpoint:'/linear-swap-api/v1/swap_his_open_interest',
    amount_type:1,unit:'CONTRACTS',method:'END_OVER_START_MINUS_ONE_TIMES_100',
    window_kind:'COMPLETED_HOURLY_POINTS',source_period:window.source_period,
    requested_hours:hours,window_start_ts:start,window_end_ts:end,time_zone:'UTC',
    as_of_ts,source_end_age_sec:(as_of_ts-end)/1000,freshness_limit_sec:limit,
    start_value:from,end_value:to,change_pct:delta,
    // No fetched-at clock is invented from a source timestamp or a later replay.
    original_response_received_ts:null,as_of_eligible_by_source_time:true,
    is_rolling_to_message_time:end===as_of_ts,
  };
}

export function compareOiWindowReceipts(left, right, {as_of_ts=null,tolerance_pct_points=0.01}={}) {
  if (!left || !right || left.status!=='CLOSED'||right.status!=='CLOSED') return {status:'NOT_COMPARABLE',reason:'CLOSED_RECEIPTS_REQUIRED'};
  if (left.metric!=='OPEN_INTEREST'||right.metric!=='OPEN_INTEREST') return {status:'NOT_COMPARABLE',reason:'METRIC_MISMATCH'};
  if (left.contract_code!==right.contract_code||left.market_type!==right.market_type) return {status:'NOT_COMPARABLE',reason:'INSTRUMENT_MISMATCH'};
  if (left.unit!==right.unit) return {status:'NOT_COMPARABLE',reason:'UNIT_MISMATCH'};
  if (![left.window_start_ts,left.window_end_ts,right.window_start_ts,right.window_end_ts].every(stamp)) return {status:'NOT_COMPARABLE',reason:'WINDOW_TIME_REQUIRED'};
  if (left.window_start_ts!==right.window_start_ts||left.window_end_ts!==right.window_end_ts) return {status:'NOT_COMPARABLE',reason:'DIFFERENT_TIME_WINDOWS'};
  if (as_of_ts!==null && (!stamp(as_of_ts)||left.window_end_ts>as_of_ts||right.window_end_ts>as_of_ts)) return {status:'NOT_COMPARABLE',reason:'AFTER_REQUESTED_AS_OF'};
  if (!left.venue||!right.venue) return {status:'NOT_COMPARABLE',reason:'VENUE_REQUIRED'};
  if (left.venue!==right.venue) return {status:'CROSS_VENUE_CONTEXT',reason:'DIFFERENT_MARKETS_NOT_A_DATA_ERROR',averaged:false};
  if (number(left.change_pct)===null||number(right.change_pct)===null||number(tolerance_pct_points)===null||tolerance_pct_points<0) return {status:'NOT_COMPARABLE',reason:'NUMERIC_CHANGE_REQUIRED'};
  const difference=Math.abs(left.change_pct-right.change_pct);
  return {status:difference<=tolerance_pct_points?'SAME_MEASUREMENT':'SAME_WINDOW_VALUE_MISMATCH',difference_pct_points:difference,averaged:false};
}
