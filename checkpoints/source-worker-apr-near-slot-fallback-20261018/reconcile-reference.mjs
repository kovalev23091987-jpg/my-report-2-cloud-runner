// Offline proposal only. No production imports, admission, quota or source work.
const N05=new Set(['BITFINEX','BINANCE','KRAKEN','GATE','BACKPACK','BITGET','POLONIEX']);
const N12=new Set(['GATE_FUTURES_N12','OKX_N12_NATIVE','KUCOIN_N12_NATIVE','KUCOIN_N12_EXACT_TOKEN']);
const count=n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0;
export function reconcileExplicitTransport(flow={}){
 const known=count(flow.network_calls)?flow.network_calls:null;
 const fail=reason=>({status:'UNRECONCILED_SHARED_HTTP',reason,total_http:known,n05_http:null,n12_http:null,no_double_count:true,admission_authorized:false});
 if(!count(flow.network_calls))return fail('TOTAL_UNKNOWN_OR_INVALID');
 if(flow.network_calls>5)return fail('EXISTING_FIVE_REQUEST_ENVELOPE_EXCEEDED');
 const rows=flow.adapter_results;
 if(!Array.isArray(rows)||rows.length<1||rows.length>11)return fail('ADAPTER_DETAIL_MISSING_OR_UNBOUNDED');
 if(rows.some(r=>!r||(!N05.has(r.venue)&&!N12.has(r.venue))))return fail('UNKNOWN_ADAPTER_ROLE');
 if(new Set(rows.map(r=>r.venue)).size!==rows.length)return fail('DUPLICATE_ADAPTER');
 if(rows.some(r=>!count(r.network_calls)))return fail('ADAPTER_HTTP_UNKNOWN_OR_INVALID');
 const sum=rows.reduce((n,r)=>n+r.network_calls,0);
 if(!count(flow.flow_network_calls)||sum!==flow.flow_network_calls)return fail('ADAPTER_SUM_NOT_FLOW_HTTP');
 // New explicit field proposed for the existing optional turnover invocation.
 // Never label an unexplained residual as a measured baseline or N05 cost.
 if(!count(flow.baseline_transport_HTTP))return fail('BASELINE_HTTP_UNKNOWN_OR_INVALID');
 if(sum+flow.baseline_transport_HTTP!==flow.network_calls)return fail('FLOW_PLUS_BASELINE_NOT_TOTAL');
 if(!count(flow.observed_transport_HTTP)||flow.observed_transport_HTTP!==flow.network_calls)return fail('WRAPPER_TRANSPORT_NOT_TOTAL');
 if(!count(flow.caller_reserved_requests)||flow.caller_reserved_requests>5||flow.caller_reserved_requests<flow.network_calls)return fail('CALLER_GRANTS_UNKNOWN_OR_INCONSISTENT');
 const n12=rows.filter(r=>N12.has(r.venue)).reduce((n,r)=>n+r.network_calls,0);
 return{status:'RECONCILED_ADAPTER_TRANSPORT',total_http:known,n05_http:sum-n12+flow.baseline_transport_HTTP,n12_http:n12,
  baseline_http:flow.baseline_transport_HTTP,no_double_count:true,admission_authorized:false,
  grants_are_not_transport:true,unused_reservations_refunded:false};
}
