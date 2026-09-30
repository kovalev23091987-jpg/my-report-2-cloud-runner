// Acquisition completeness is not the same as entry eligibility. Final Decision,
// identity, independent evidence, execution, scenario and cost gates still decide.
const closed = value => value === 'closed';
const finite = value => value === null || value === undefined || value === '' ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
const positive = value => {const n=finite(value);return n!==null&&n>0?n:null;};
const time = value => {const n=finite(value);return Number.isSafeInteger(n)&&n>0?n:null;};

export function applyCandidateDataRequirements({receipt={},futures,trajectory,history}={}) {
 const checks=[];
 for(const [name,component] of [['futures_snapshot',futures],['futures_trajectory',trajectory],['stage0_history',history]])
  checks.push([`${name}.execution_status_FULFILLED`,component?.execution_status==='FULFILLED'&&Boolean(component.data)]);
 const fc=futures?.data?.coverage||{},tc=trajectory?.data?.coverage||{},hc=history?.data?.coverage||{};
 for(const key of ['htx_futures_liquidity','htx_open_interest','htx_funding'])checks.push([`futures_snapshot.${key}`,closed(fc[key])]);
 checks.push(['futures_snapshot.htx_futures_order_flow_sample',closed(fc.htx_futures_order_flow_sample??fc.htx_futures_order_flow)]);
 for(const key of ['price_5m','price_15m','price_1h','price_4h','oi_1h','oi_4h','funding_current','funding_history'])checks.push([`futures_trajectory.${key}`,closed(tc[key])]);
 checks.push(['stage0_history.data_db',history?.data?.health?.data_db===true]);
 checks.push(['stage0_history.persistent_history',closed(hc.persistent_history)]);
 checks.push(['stage0_history.series_non_empty',Array.isArray(history?.data?.series)&&history.data.series.length>0]);
 checks.push(['stage0_history.complete_5m_window',hc.complete_5m_window===true]);
 const mandatoryGaps=checks.filter(([,ok])=>!ok).map(([key])=>key);
 const allGaps=[...new Set([...(Array.isArray(receipt.gaps)?receipt.gaps:[]),...mandatoryGaps])];
 // A missing spot component is explicitly visible, but is not a futures data
 // outage. Independent native/external spot confirmation remains a final gate.
 if(receipt.components?.spot_snapshot?.execution_status!=='FULFILLED')allGaps.push('spot_snapshot.execution_status_FULFILLED');
 const mandatory=new Set(mandatoryGaps),advisoryGaps=allGaps.filter(key=>!mandatory.has(key));
 const coreClassification=mandatoryGaps.length?'INSUFFICIENT':'SUFFICIENT';
 const classification=mandatoryGaps.length?'INSUFFICIENT':allGaps.length?'PARTIAL':'SUFFICIENT';
 return {...receipt,classification,sufficient:classification==='SUFFICIENT',
  full_data_classification:receipt.classification??'UNKNOWN',core_classification:coreClassification,
  gaps:[...new Set(allGaps)],mandatory_gaps:mandatoryGaps,advisory_gaps:[...new Set(advisoryGaps)],
  requirements_policy:{version:'candidate-data-requirements-v1',statistics_required_for_analytical_entry:false,
   mandatory_checks:checks.map(([key,ok])=>({key,closed:ok})),
   optional_context:['EXACT_WINDOW_FLOW','SPOT_FLOW','24H_EXTENDED_CONTEXT'],
   missing_context_value:null,missing_context_directional_votes:0,final_entry_gates_unchanged:true},
  decision_effect:'ACQUISITION_CLASSIFICATION_ONLY_FINAL_ENTRY_GATES_REQUIRED'};
}

export function buildHtxSpotMarketConfirmation({contract,spot,available_ts,now}={}) {
 const fail=reason=>({status:'NOT_CLOSED',reason,directional_votes:0});
 const c=String(contract||'').trim().toUpperCase();
 if(!/^[A-Z0-9]+-USDT$/.test(c))return fail('EXACT_ASCII_USDT_CONTRACT_REQUIRED');
 const expected=c.toLowerCase().replace('-','');
 if(spot?.market!=='HTX Spot'||spot?.source!=='HTX official public API'||spot.market_identity_verified!==true||spot.symbol!==expected||String(spot.requested_symbol||'').trim().toUpperCase()!==c)return fail('SPOT_MARKET_IDENTITY_NOT_VERIFIED');
 if(spot?.health?.ticker!==true||spot?.health?.depth!==true||spot?.coverage?.htx_spot_liquidity!=='closed')return fail('SPOT_QUOTE_OR_DEPTH_NOT_CLOSED');
 const source=time(spot?.depth_source_ts),available=time(available_ts),observed=time(now);
 if(source===null||available===null||observed===null||source>available||available>observed||observed-source>300000)return fail('SPOT_DEPTH_STALE_FUTURE_OR_UNBOUND');
 const bid=positive(spot?.depth_bbo?.best_bid),ask=positive(spot?.depth_bbo?.best_ask);
 const bidDepth=positive(spot?.liquidity?.top_20_depth_bid?.notional_usdt),askDepth=positive(spot?.liquidity?.top_20_depth_ask?.notional_usdt);
 if(bid===null||ask===null||ask<bid||bidDepth===null||askDepth===null)return fail('SPOT_DEPTH_TWO_SIDES_NOT_MEASURABLE');
 return {status:'CLOSED',version:'htx-native-spot-depth-confirmation-v1',contract_code:c,symbol:expected,
  identity_scope:'EXACT_NATIVE_HTX_REQUEST_AND_RESPONSE_CHANNEL',market_type:'SPOT',venue:'HTX',
  source_ts:source,available_ts:available,max_age_sec:300,valid_until_ts:source+300000,
  metric:'spot_depth_two_sided_usdt',value:Math.min(bidDepth,askDepth),unit:'USDT',
  bid_depth_usdt:bidDepth,ask_depth_usdt:askDepth,spread_bps:(ask-bid)/((ask+bid)/2)*10000,
  directional_votes:0,flow_window_closed:false,full_24h_coverage_claimed:false};
}

export async function runOptionalCompactStatistics(run) {
 try {return await run();}
 catch {return {status:'STATISTICS_ERROR_DEFERRED',mode:'SHADOW_PROSPECTIVE_VALIDATION_DATA_ONLY',
  calibration_only:true,live_probability:null,validated_signal:false,trading_execution:false,
  automatic_weight_tuning:false,report_blocked:false,error_code:'COMPACT_STATISTICS_RUNTIME_FAILED',retry_in_existing_cadence:true};}
}
