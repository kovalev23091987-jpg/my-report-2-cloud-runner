import crypto from 'node:crypto';
export const EVIDENCE_SOURCE_ADAPTERS_VERSION='evidence-source-adapters-v1-20260928';
export const SOURCE_POLICIES=Object.freeze({
 WIKIMEDIA_ATTENTION:{daily_cap:12,ttl_ms:6*60*60_000,auth:'PUBLIC',blocks:['N06']},
 HTX_LARGE_TRADES:{daily_cap:144,ttl_ms:60_000,auth:'PUBLIC',blocks:['N12']},
 COINGECKO_SECTOR:{daily_cap:48,ttl_ms:5*60_000,auth:'PUBLIC',blocks:['N15'],monthly_module_bound:1488},
 COINPAPRIKA_SECTOR:{daily_cap:48,ttl_ms:5*60_000,auth:'PUBLIC',blocks:['N15'],monthly_module_bound:1488,official_free_monthly_requests:20000},
 HTX_PUBLIC_RISK:{daily_cap:144,ttl_ms:60*60_000,auth:'PUBLIC',blocks:['N08','N09','N11','N16']},
 CHAIN_RPC:{daily_cap:720,ttl_ms:20*60_000,auth:'PUBLIC',blocks:['N02','N03','N04','N05']},
 KOIOS_NATIVE_SUPPLY:{daily_cap:48,ttl_ms:6*60*60_000,auth:'PUBLIC',blocks:['N02','N03'],official_public_daily_cap:5000,official_burst_cap:100,official_burst_window_seconds:10,retries:0},
 OFFICIAL_EVENTS:{daily_cap:288,ttl_ms:60*60_000,auth:'PUBLIC',blocks:['N01','N07','N08','N09']},
 GDELT_NEWS_DISCOVERY:{daily_cap:144,ttl_ms:60*60_000,auth:'PUBLIC',blocks:['N07']},
 BLUESKY_PUBLIC:{daily_cap:240,ttl_ms:60*60_000,auth:'PUBLIC',blocks:['N06']},
 DERIBIT_ALT_OPTIONS:{daily_cap:168,ttl_ms:20*60_000,auth:'PUBLIC',blocks:['N14']},
 // Legacy collectors remain parseable for historical receipts, but are not
 // routed by the active 15-block candidate runtime.
 SNAPSHOT_GOVERNANCE:{daily_cap:96,ttl_ms:60*60_000,auth:'PUBLIC',blocks:['N13']},
 SOURCIFY_ABI:{daily_cap:48,ttl_ms:7*24*60*60_000,auth:'PUBLIC',blocks:['N17']},
 BLOCKSCOUT_INDEX:{daily_cap:96,daily_credit_cap:5000,ttl_ms:20*60_000,auth:'BLOCKSCOUT_PRO_API_KEY',blocks:['N02','N04','N05']},
 MACRO_CALENDAR:{daily_cap:24,ttl_ms:6*60*60_000,auth:'PUBLIC',blocks:['N13']},
});
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const text=v=>String(v??'').trim();
const hash=v=>crypto.createHash('sha256').update(String(v)).digest('hex');
const exactContract=v=>/^[^-\s]{1,32}-USDT$/u.test(text(v).toUpperCase());

export function planEvidenceSourceRequest({source,htx_contract,asset_id,registry_verified=false,used_today=0,methods=1,credit_cost=null,secret_present=false}={}){
 const policy=SOURCE_POLICIES[source];if(!policy)return{allowed:false,status:'UNKNOWN_SOURCE',attempts:0};
 if(!exactContract(htx_contract)||!text(asset_id)||registry_verified!==true)return{allowed:false,status:'EXACT_ASSET_IDENTITY_REQUIRED',attempts:0};
 if(policy.auth!=='PUBLIC'&&!secret_present)return{allowed:false,status:'WAITING_FREE_KEY',required_secret:policy.auth,attempts:0};
 const count=Math.max(1,Number(methods)||1);if(Number(used_today)+count>policy.daily_cap)return{allowed:false,status:'DAILY_CAP_EXHAUSTED',attempts:0};
 if(source==='CHAIN_RPC'&&count>4)return{allowed:false,status:'RPC_METHODS_PER_REFRESH_EXCEEDED',attempts:0};
 if(source==='KOIOS_NATIVE_SUPPLY'&&count!==4)return{allowed:false,status:'KOIOS_EXACT_FOUR_REQUEST_REFRESH_REQUIRED',attempts:0};
 if(source==='BLOCKSCOUT_INDEX'&&(!Number.isFinite(Number(credit_cost))||Number(credit_cost)<=0||Number(credit_cost)>policy.daily_credit_cap))return{allowed:false,status:'VERIFIED_CREDIT_COST_REQUIRED',attempts:0};
 return{allowed:true,status:'PLANNED',source,attempts:count,ttl_ms:policy.ttl_ms,blocks:policy.blocks,auth:policy.auth};
}

export function buildEvidenceV2({provider_id,upstream_id,asset_id,htx_contract,block_id,metric_family,origin_event_id,dependency_group,source_ts,observed_ts,first_known_ts=observed_ts,effective_from=null,effective_to=null,coverage_status='COMPLETE',coverage_fraction=1,unit=null,value=null,directional_strength=null,risk_strength=null,identity_status='EXACT',finality_status='FINAL',expires_at,validation_status='VALID',validation_reason=null,extra={}}={}){
 const stable=[provider_id,upstream_id,asset_id,htx_contract,block_id,metric_family,origin_event_id,source_ts].join('|');
 return{evidence_id:`EV2:${hash(stable)}`,asset_id,htx_contract,block_id,metric_family,provider_id,upstream_id,origin_event_id,dependency_group,source_ts,observed_ts,first_known_ts,effective_from,effective_to,window_start:null,window_end:null,coverage_status,coverage_fraction,unit,value,directional_strength,risk_strength,identity_status,finality_status,schema_version:'EvidenceV2.1',raw_hash:hash(JSON.stringify({value,extra})),expires_at,cost_receipt_id:null,validation_status,validation_reason,...extra};
}

export function normalizeOfficialEvent({provider_id='OFFICIAL_EVENTS',asset_id,htx_contract,event_id,event_type,effective_at,source_ts,observed_ts,official_url,amount_usd=null,htx_turnover_24h_usd=null,confirmed=false}={}){
 const adverse=new Set(['PROTOCOL_HALT','CONFIRMED_EXPLOIT','HTX_CONTRACT_CESSATION','MARGIN_LIMIT_DETERIORATION']),unlock=event_type==='TOKEN_UNLOCK',amount=finite(amount_usd),scheduleValid=!unlock||(finite(source_ts)!==null&&finite(effective_at)!==null&&finite(effective_at)>=finite(source_ts)&&amount!==null&&amount>=0),verified=confirmed===true&&scheduleValid,risk=unlock&&verified&&finite(htx_turnover_24h_usd)>0?Math.min(1,amount/finite(htx_turnover_24h_usd)):adverse.has(event_type)&&verified?1:null,block=unlock?'N01':event_type==='HTX_CONTRACT_CESSATION'?'N08':event_type==='MARGIN_LIMIT_DETERIORATION'?'N09':'N07';
 return buildEvidenceV2({provider_id,upstream_id:'OFFICIAL_PRIMARY',asset_id,htx_contract,block_id:block,metric_family:event_type,origin_event_id:event_id,dependency_group:`OFFICIAL_EVENT:${event_id}`,source_ts,observed_ts,effective_from:effective_at,expires_at:Math.max(observed_ts+60*60_000,effective_at||0),directional_strength:null,risk_strength:risk,coverage_status:risk===null?'CONTEXT_ONLY':'COMPLETE',coverage_fraction:risk===null?0:1,validation_status:verified?'VALID':'UNVERIFIED',validation_reason:verified?null:!scheduleValid?'STRUCTURED_TOKEN_SCHEDULE_FIELDS_REQUIRED':'PRIMARY_CONFIRMATION_REQUIRED',extra:{official_url,event_type,effective_at}});
}

export function normalizeChainTransfer({provider_id='CHAIN_RPC',asset_id,htx_contract,chain,token_address,tx_hash,log_index,from,to,zero_address,amount_token,amount_usd=null,source_ts,observed_ts,finalized=false,known_exchange_direction=null}={}){
 const mint=text(from).toLowerCase()===text(zero_address).toLowerCase(),burn=text(to).toLowerCase()===text(zero_address).toLowerCase(),block=mint?'N02':burn?'N03':known_exchange_direction?'N05':'N04',risk=mint&&finite(amount_usd)!==null?null:null;
 return buildEvidenceV2({provider_id,upstream_id:chain,asset_id,htx_contract,block_id:block,metric_family:mint?'MINT_TRANSFER':burn?'BURN_TRANSFER':known_exchange_direction?'VERIFIED_EXCHANGE_FLOW':'LARGE_TRANSFER',origin_event_id:`${tx_hash}:${log_index}`,dependency_group:`${chain}:${tx_hash}:${log_index}`,source_ts,observed_ts,expires_at:observed_ts+20*60_000,directional_strength:null,risk_strength:risk,finality_status:finalized?'FINAL':'PROVISIONAL',validation_status:exactContract(htx_contract)&&text(token_address)&&text(tx_hash)?'VALID':'ERROR',extra:{chain,token_address,tx_hash,log_index,from,to,amount_token,amount_usd,known_exchange_direction}});
}

export function normalizeAttentionSample({provider_id,asset_id,htx_contract,window_start,window_end,unique_authors,sample_saturated=false,history_windows=0,history_days=0,observed_ts}={}){
 const warmed=history_windows>=30&&history_days>=7&&!sample_saturated;
 return buildEvidenceV2({provider_id,upstream_id:provider_id,asset_id,htx_contract,block_id:'N06',metric_family:'UNIQUE_AUTHOR_ATTENTION',origin_event_id:`${window_start}:${window_end}`,dependency_group:`ATTENTION:${provider_id}:${window_start}`,source_ts:window_end,observed_ts,expires_at:observed_ts+60*60_000,value:finite(unique_authors),unit:'unique_authors',directional_strength:null,risk_strength:null,coverage_status:warmed?'COMPLETE':'WARMING_OR_SATURATED',coverage_fraction:warmed?1:0,validation_status:'VALID',extra:{window_start,window_end,sample_saturated,history_windows,history_days}});
}

export function normalizeCalendarEvent({provider_id,asset_id='GLOBAL_MACRO',htx_contract='BTC-USDT',event_id,event_type,effective_at,source_ts,observed_ts,time_precision='EXACT'}={}){
 return buildEvidenceV2({provider_id,upstream_id:provider_id,asset_id,htx_contract,block_id:'N13',metric_family:event_type,origin_event_id:event_id,dependency_group:`CALENDAR:${event_id}`,source_ts,observed_ts,effective_from:effective_at,expires_at:Math.max(observed_ts+6*60*60_000,effective_at||0),directional_strength:null,risk_strength:null,coverage_status:'COMPLETE',coverage_fraction:1,validation_status:'VALID',extra:{event_type,effective_at,time_precision}});
}

export default{EVIDENCE_SOURCE_ADAPTERS_VERSION,SOURCE_POLICIES,planEvidenceSourceRequest,buildEvidenceV2,normalizeOfficialEvent,normalizeChainTransfer,normalizeAttentionSample,normalizeCalendarEvent};
