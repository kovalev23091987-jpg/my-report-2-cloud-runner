import { freeSourcesBudget } from './resource-budget.mjs';
import { extractEntryBlockers } from './funnel-diagnostics.mjs';
export const SOURCE_REGISTRY_VERSION='source-registry-v2-free-sources-20260925';
export const SOURCE_STATUSES=Object.freeze(['PRODUCTION','CANDIDATE','SHADOW','NOT_CONFIGURED','UNSUPPORTED','BLOCKED']);
const arr=v=>Array.isArray(v)?v:[];const clean=v=>String(v??'').trim();
const known=Object.freeze([
 {id:'HTX',status:'PRODUCTION',scope:'EXECUTION_PRIMARY',key_required:false},
 {id:'Binance Live Public',status:'PRODUCTION',scope:'SPOT_FALLBACK_AND_EXISTING_PUBLIC_WS',key_required:false},
 {id:'Binance Public Data Archive',status:'CANDIDATE',scope:'HISTORY_MAINTENANCE_ONLY',key_required:false},
 {id:'Bybit',status:'PRODUCTION',scope:'DERIVATIVES_CROSS_VENUE',key_required:false},
 {id:'OKX',status:'PRODUCTION',scope:'DERIVATIVES_AND_SPOT',key_required:false},
 {id:'Gate',status:'PRODUCTION',scope:'DERIVATIVES_CROSS_VENUE',key_required:false},
 {id:'Hyperliquid',status:'PRODUCTION',scope:'EXISTING_SMART_MONEY_RECORDER_RECEIPT_REQUIRED_PER_METRIC',key_required:false},
 {id:'ByKaranteli',status:'SHADOW',scope:'EXISTING_ADVISORY_SMART_MONEY_LIQUIDATION_PATH',key_required:true},
 {id:'DEX Screener',status:'CANDIDATE',scope:'DEX_POOL_CONTEXT_KEYLESS_LIVE_PROBE_CLOSED',key_required:false},
 {id:'GeckoTerminal',status:'CANDIDATE',scope:'DEX_POOL_CONTEXT_NON_CRITICAL_KEYLESS_LIVE_PROBE_CLOSED',key_required:false},
 {id:'DefiLlama',status:'CANDIDATE',scope:'TVL_NETWORK_FEES_VOLUME_CONTEXT_KEYLESS_LIVE_PROBE_CLOSED',key_required:false},
 {id:'CoinGecko',status:'NOT_CONFIGURED',scope:'NON_CRITICAL_LOW_FREQUENCY_ONLY',key_required:false},
 {id:'Coinalyze',status:'NOT_CONFIGURED',scope:'UNVERIFIED_IN_CURRENT_CANDIDATE',key_required:null},
 {id:'Etherscan',status:'NOT_CONFIGURED',scope:'UNVERIFIED_IN_CURRENT_CANDIDATE',key_required:true},
 {id:'GoPlus',status:'CANDIDATE',scope:'SUPPORTING_RISK_ONLY_KEYLESS_FREE_LIVE_PROBE_CLOSED',key_required:false},
 {id:'Alchemy',status:'BLOCKED',scope:'BOUNDED_EVM_ONCHAIN',key_required:true,blocker:'OWNER_AUTH_FOR_FREE_ACCOUNT_AND_SECRET'},
 {id:'Solana Public RPC',status:'CANDIDATE',scope:'BOUNDED_CANDIDATE_ONLY_NOT_SOLE_CRITICAL_DEPENDENCY',key_required:false},
 {id:'Bitget',status:'SHADOW',scope:'MEASUREMENT_ONLY_UNTIL_INCREMENTAL_COVERAGE_PROVEN',key_required:false},
 {id:'Coinbase Exchange',status:'SHADOW',scope:'MEASUREMENT_ONLY_INDEPENDENT_SPOT_CONTEXT',key_required:false},
 {id:'Deribit',status:'SHADOW',scope:'SECOND_PRIORITY_BTC_ETH_MARKET_BACKGROUND',key_required:false},
]);
function evidenceByVenue(publicEvidence){const out=new Map();for(const e of arr(publicEvidence?.evidence)){const v=clean(e?.venue||e?.source);if(!v)continue;const a=out.get(v)||[];a.push(e);out.set(v,a);}return out;}
export function buildSourceRegistry({public_evidence=null,smart_money_raw=null,probe_results=[],extra_receipts=[]}={}){
  const ev=evidenceByVenue(public_evidence);const probes=new Map(arr(probe_results).map(x=>[clean(x?.source),x]));
  const entries=known.map(base=>{
    const venueAliases={HTX:['HTX'],Bybit:['BYBIT','Bybit'],OKX:['OKX'],Gate:['GATE','Gate'],'Binance Live Public':['BINANCE','Binance'],'Hyperliquid':['HYPERLIQUID','Hyperliquid']};
    const receipts=(venueAliases[base.id]||[base.id]).flatMap(v=>ev.get(v)||[]).concat(arr(extra_receipts).filter(r=>clean(r?.source)===base.id));
    const current=receipts.filter(r=>String(r?.status).toUpperCase()==='CLOSED');const probe=probes.get(base.id);
    let status=base.status;
    if(probe?.status==='UNSUPPORTED')status='UNSUPPORTED';
    if(probe?.status==='NOT_CONFIGURED')status='NOT_CONFIGURED';
    if(base.id==='ByKaranteli'&&smart_money_raw?.status==='CLOSED')status='SHADOW';
    return {...base,status,runtime_receipt_count:receipts.length,current_closed_receipt_count:current.length,runtime_current:current.length>0,probe_status:probe?.status??null,live_probe_closed:probe?.status==='CLOSED',missing_is_zero:false,stale_is_current:false,unsupported_is_safe:false};
  });
  return {version:SOURCE_REGISTRY_VERSION,status:'CLOSED',entries,continuous_collector_status:'PARTIAL_REALTIME_COVERAGE'};
}
export function buildFreeSourceRuntimeSummary({public_evidence=null,smart_money_raw=null,publication_shadow=null,canonical=null,probe_results=[],extra_receipts=[]}={}){
  const registry=buildSourceRegistry({public_evidence,smart_money_raw,probe_results,extra_receipts});const budget=freeSourcesBudget();
  const diagnostic=extractEntryBlockers({publication_shadow,canonical,source_summary:null});
  return {version:'free-source-runtime-summary-v2-20260925',status:'CLOSED',registry,budget,entry_funnel:diagnostic,hot_cycle_external_request_delta:0,d1_write_delta:0,analysis_only:true,no_new_hard_gate:true,no_strategy_weight_change:true,continuous_collector_status:'PARTIAL_REALTIME_COVERAGE'};
}
