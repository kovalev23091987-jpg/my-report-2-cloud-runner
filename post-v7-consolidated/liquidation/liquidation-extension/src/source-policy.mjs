// Conservative operational ceilings, NOT a change to strategy weights or gates.
// Limits must also be reconciled with the account's other consumers at deployment.
export const SOURCE_POLICY=Object.freeze({
 LIQFLOW: {unit:'REQUEST',provider_monthly_free:50000,module_monthly_cap:12000,per_minute_cap:6,max_concurrency:2,ttl_ms:300000,role:'HL_DISCOVERY_AND_MODEL_RESEARCH',key_required_from:'2026-10-27T00:00:00Z',default_decision_enabled:false},
 HL_NATIVE: {unit:'REQUEST',provider_monthly_free:null,module_monthly_cap:30000,per_minute_cap:12,max_concurrency:2,ttl_ms:120000,role:'VALIDATE_SELECTED_NATIVE_POSITIONS',default_decision_enabled:false},
 LIGHTER: {unit:'REQUEST',provider_monthly_free:null,module_monthly_cap:24000,per_minute_cap:20,max_concurrency:2,ttl_ms:180000,role:'SECOND_VENUE_SCOPED_POSITIONS',default_decision_enabled:false},
 GMX: {unit:'REQUEST',provider_monthly_free:null,module_monthly_cap:8000,per_minute_cap:4,max_concurrency:2,ttl_ms:300000,role:'FEE_AWARE_SCOPED_POSITIONS',default_decision_enabled:false},
 GTRADE: {unit:'REQUEST',provider_monthly_free:null,module_monthly_cap:4000,per_minute_cap:6,max_concurrency:2,ttl_ms:300000,role:'BATCH_OPEN_POSITIONS_AND_FEES',default_decision_enabled:false},
 HYPERPERPS: {unit:'REQUEST',provider_monthly_free:null,module_monthly_cap:6000,per_minute_cap:6,max_concurrency:2,ttl_ms:300000,role:'BTC_ETH_SOL_COHORT_CROSSCHECK',default_decision_enabled:false},
 OXARCHIVE: {unit:'CREDIT',provider_monthly_free:50000,module_monthly_cap:5000,per_minute_cap:6,max_concurrency:2,ttl_ms:300000,per_request_cost:null,role:'ALTERNATE_HL_BUCKETS',default_decision_enabled:false},
});
export const RUN_POLICY=Object.freeze({max_new_requests:24,max_parallel:2,max_response_bytes:8000000,max_wall_ms:45000,automatic_payment:false,automatic_trade:false,raw_accounts_to_D1:false,source_snapshots_do_not_create_ENTRY:true});
export function planBudget({provider,used=0,remaining_account_units=null,estimated_calls,credit_cost,run_remaining_requests,quota_reconciled=false}={}){
 const p=SOURCE_POLICY[provider];if(!p)return {allowed:false,reason:'SOURCE_NOT_REGISTERED'};
 if(!Number.isInteger(estimated_calls)||estimated_calls<=0||!Number.isInteger(run_remaining_requests)||run_remaining_requests<estimated_calls)return {allowed:false,reason:'RUN_HTTP_BUDGET'};
 if(!Number.isFinite(used)||used<0)return {allowed:false,reason:'USAGE_UNKNOWN'};
 if(p.unit==='CREDIT'&&(!(typeof credit_cost==='number')||!Number.isFinite(credit_cost)||credit_cost<=0))return {allowed:false,reason:'EXACT_ROUTE_CREDIT_COST_UNKNOWN'};
 if(p.provider_monthly_free!==null&&(!quota_reconciled||remaining_account_units===null))return {allowed:false,reason:'SHARED_ACCOUNT_QUOTA_NOT_RECONCILED'};
 const units=estimated_calls*(p.unit==='CREDIT'?credit_cost:1);
 if(used+units>p.module_monthly_cap||remaining_account_units!==null&&remaining_account_units<units)return {allowed:false,reason:'FREE_QUOTA_WOULD_BE_EXCEEDED'};
 return {allowed:true,reserve_units:units,reserve_requests:estimated_calls,unit:p.unit,automatic_topup:false};
}
export function cacheDecision(entry,{now_ms,max_age_ms,expected_symbol}={}){
 if(!entry||entry.native_symbol!==expected_symbol)return {use:false,reason:'CACHE_IDENTITY_MISMATCH'};
 if(!Number.isSafeInteger(entry.source_ts))return {use:false,reason:'CACHE_SOURCE_TIME_UNKNOWN'};
 if(entry.source_ts>now_ms)return {use:false,reason:'CACHE_FROM_FUTURE'};
 if(now_ms-entry.source_ts>max_age_ms)return {use:false,reason:'CACHE_STALE_FETCH_REQUIRED'};
 return {use:true,source_ts:entry.source_ts,source_time_rewritten:false};
}
export function selectSourceJobs({has_hl,has_lighter,has_gmx,has_gtrade,primary_projected_ok,native_recheck_required,symbol}={}){
 const jobs=[];
 if(primary_projected_ok!==true&&has_hl)jobs.push({provider:'LIQFLOW',purpose:'DISCOVER_PUBLIC_POSITION_ACCOUNTS'});
 if(has_hl&&(native_recheck_required||primary_projected_ok!==true))jobs.push({provider:'HL_NATIVE',max_accounts:8,purpose:'READ_NATIVE_LIQUIDATION_PRICE'});
 if(has_lighter)jobs.push({provider:'LIGHTER',max_accounts:4,purpose:'INDEPENDENT_VENUE_SAMPLE'});
 if(has_gmx)jobs.push({provider:'GMX',max_accounts:2,purpose:'INDEPENDENT_VENUE_FEE_AWARE_SAMPLE'});
 if(has_gtrade)jobs.push({provider:'GTRADE',batch_shared:true,purpose:'REUSE_ONE_CHAIN_SNAPSHOT'});
 if(['BTC','ETH','SOL'].includes(symbol))jobs.push({provider:'HYPERPERPS',purpose:'OPTIONAL_SAME_VENUE_CROSSCHECK_NOT_EXTRA_VOTE'});
 return {jobs,new_scheduler_created:false,production_enabled:false,all_installed_plugins_polled:false};
}
