import crypto from 'node:crypto';
import {buildEvidenceV2,SOURCE_POLICIES} from './evidence-source-adapters.mjs';
import {installEvidenceSourceStore,reserveEvidenceSourceAttempts,readEvidenceSourceCache,writeEvidenceSourceCache} from './evidence-source-store.mjs';

export const OFFICIAL_TOKEN_SCHEDULE_VERSION='official-token-schedule-v2-cardano-20261005';
const SOURCE='OFFICIAL_EVENTS',TTL=SOURCE_POLICIES[SOURCE].ttl_ms;
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
// Explicit primary documents, bound to native assets rather than ticker search.
// An allocation/vesting document is context, never an observed future transfer.
export const TOKEN_SCHEDULE_ROUTES=Object.freeze({
 ADA:{chain:'cardano',native_asset_id:'cardano:mainnet',url:'https://cardano.org/genesis/',parser:'CARDANO_INITIAL_DISTRIBUTION_V1',ttl_ms:24*60*60_000,daily_cap:2},
 APT:{chain:'aptos',native_asset_id:'aptos:mainnet',url:'https://aptosnetwork.com/currents/aptos-tokenomics-overview',parser:'APTOS_PUBLISHED_TERMS_V1'},
 NEAR:{chain:'near',native_asset_id:'near:mainnet',url:'https://www.near.org/',parser:'NEAR_PUBLISHED_UNLOCK_STATUS_V1'},
});
export function exactTokenScheduleRoute({contract,asset_identity}={}){
 const route=TOKEN_SCHEDULE_ROUTES[String(contract||'').replace(/-USDT$/,'')];
 return route&&asset_identity?.asset_kind==='NATIVE'&&asset_identity.chain===route.chain&&asset_identity.native_asset_id===route.native_asset_id&&!asset_identity.contract_or_mint?route:null;
}
const visible=body=>String(body||'').replace(/<(script|style)\b[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&(?:nbsp|amp);/g,' ').replace(/\s+/g,' ').trim();
export function normalizeOfficialTokenSchedule({contract,asset_identity,body,source_url,observed_ts}={}){
 const route=exactTokenScheduleRoute({contract,asset_identity}),text=visible(body);
 if(!route||source_url!==route.url)return{status:'EXACT_OFFICIAL_SCHEDULE_ROUTE_REQUIRED',evidence:[]};
 if(!Number.isSafeInteger(observed_ts)||observed_ts<=0||Buffer.byteLength(String(body))>1024*1024||/404 Page Not Found|The page you are looking for does not exist/i.test(text))return{status:'OFFICIAL_SCHEDULE_SCHEMA_NOT_CLOSED',evidence:[]};
 let terms;
 if(route.parser==='APTOS_PUBLISHED_TERMS_V1'){
  const anchors=['Aptos Tokenomics Overview','October 12, 2022','1 billion tokens','510,217,359.767','190,000,000.000','165,000,000.000','134,782,640.233','125,000,000 APT','5,000,000 APT','1/120','four-year lock-up schedule','excluding staking rewards','3/48ths','13th month','18th month','1/48th','19th month','four-year anniversary'];
  if(!anchors.every(a=>text.includes(a)))return{status:'OFFICIAL_SCHEDULE_SCHEMA_NOT_CLOSED',evidence:[]};
  terms={parser_id:route.parser,document_published_date:'2022-10-17',mainnet_date:'2022-10-12',initial_supply_tokens:1000000000,community_tokens:'510217359.767',foundation_tokens:'165000000',contributors_tokens:'190000000',investors_tokens:'134782640.233',community_initial_tokens:'125000000',foundation_initial_tokens:'5000000',community_foundation_monthly_fraction:'1/120',private_lockup_months:48,first_lock_months:12,private_months_13_to_18_fraction:'3/48',private_months_19_to_48_fraction:'1/48',staking_rewards_excluded:true,terms_are_projected:true,actual_unlock_transfer_verified:false};
 }else if(route.parser==='CARDANO_INITIAL_DISTRIBUTION_V1'){
  const anchors=['Distribution of ada token vouchers','October 2015','January 2017','648,176,761','2,074,165,644','2,463,071,701','25,927,070,538','31,112,484,646','staking rewards'];
  if(!anchors.every(a=>text.includes(a)))return{status:'OFFICIAL_SCHEDULE_SCHEMA_NOT_CLOSED',evidence:[]};
  terms={parser_id:route.parser,distribution_start_month:'2015-10',distribution_end_month:'2017-01',public_sale_tokens:'25927070538',foundation_tokens:'648176761',emurgo_tokens:'2074165644',iohk_tokens:'2463071701',initial_supply_tokens:'31112484646',scope:'HISTORICAL_INITIAL_DISTRIBUTION_ONLY',future_unlock_schedule_verified:false,ongoing_issuance_excluded:false,actual_unlock_transfer_verified:false};
 }else{
  if(!text.includes('NEAR')||!text.includes('fully unlocked token supply'))return{status:'OFFICIAL_SCHEDULE_SCHEMA_NOT_CLOSED',evidence:[]};
  terms={parser_id:route.parser,published_status:'FULLY_UNLOCKED',scope:'OFFICIAL_SITE_PUBLISHED_SUPPLY_STATUS',inflation_or_new_issuance_excluded:true,actual_unlock_transfer_verified:false};
 }
 const digest=hash(String(body)),asset=`${route.chain}:native:mainnet`;
 const evidence=buildEvidenceV2({provider_id:'OFFICIAL_TOKEN_SCHEDULE',upstream_id:'OFFICIAL_PRIMARY',asset_id:asset,htx_contract:contract,block_id:'N01',metric_family:route.parser==='CARDANO_INITIAL_DISTRIBUTION_V1'?'OFFICIAL_INITIAL_DISTRIBUTION_TERMS':'OFFICIAL_VESTING_TERMS',origin_event_id:`${route.url}:${digest}`,dependency_group:`OFFICIAL_VESTING:${asset}:${digest}`,source_ts:observed_ts,observed_ts,expires_at:observed_ts+(route.ttl_ms||TTL),coverage_status:'PRIMARY_DOCUMENT_CONTEXT_ONLY',coverage_fraction:0,directional_strength:null,risk_strength:null,extra:{...terms,official_url:route.url,document_sha256:digest,source_clock_policy:'OBSERVED_PRIMARY_DOCUMENT_QUERY',event_time_precision:'NOT_AN_OBSERVED_UNLOCK_EVENT'}});
 return{version:OFFICIAL_TOKEN_SCHEDULE_VERSION,status:'CLOSED',contract,evidence:[evidence],terms,internal_only:true};
}
export async function collectOfficialTokenSchedule({db,fetch_impl=globalThis.fetch,request_admit,contract,run_id,asset_identity,now=Date.now(),clock=Date.now,strict_fresh_manual=false}={}){
 const route=exactTokenScheduleRoute({contract,asset_identity});
 if(!route)return{status:'STRUCTURED_TOKEN_SCHEDULE_REQUIRED',evidence:[],network_calls:0,check_completed:false,internal_only:true};
 await installEvidenceSourceStore(db);
 const key=`VESTING:${OFFICIAL_TOKEN_SCHEDULE_VERSION}:${contract}:${route.url}`,cached=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:key,now});
 if(!strict_fresh_manual&&cached?.version===OFFICIAL_TOKEN_SCHEDULE_VERSION&&cached.contract===contract)return{...cached,network_calls:0,cache_status:'HIT'};
 const id=`VESTING:${run_id}:${contract}:${Math.floor(now/TTL)}`,grant=request_admit?.({logical_request_id:id,lane:'background',attempts:1});
 if(grant?.allowed!==true||grant.duplicate===true)return{status:grant?.status||'WHOLE_JOB_HTTP_ADMISSION_REQUIRED',evidence:[],network_calls:0,admission:grant};
 const admission=await reserveEvidenceSourceAttempts(db,{source:SOURCE,reservation_id:id,attempts:1,daily_cap:SOURCE_POLICIES[SOURCE].daily_cap,now});
 if(!admission.allowed)return{status:admission.status,evidence:[],network_calls:0,admission};
 if(route.daily_cap){const routeAdmission=await reserveEvidenceSourceAttempts(db,{source:`OFFICIAL_DOCUMENT:${route.parser}`,reservation_id:`${id}:ROUTE`,attempts:1,daily_cap:route.daily_cap,now});if(!routeAdmission.allowed)return{status:'OFFICIAL_DOCUMENT_DAILY_CAP',evidence:[],network_calls:0,admission:routeAdmission};}
 let result;
 try{
  const response=await fetch_impl(route.url,{headers:{accept:'text/html'},redirect:'error',signal:AbortSignal.timeout(8000)}),body=await response.text(),observed=clock();
  const normalized=response.ok?normalizeOfficialTokenSchedule({contract,asset_identity,body,source_url:response.url||route.url,observed_ts:observed}):{status:'OFFICIAL_SCHEDULE_SOURCE_ERROR',evidence:[]};
  result={version:OFFICIAL_TOKEN_SCHEDULE_VERSION,...normalized,network_calls:1,admission,cache_status:'REFRESHED',receipts:[{route:route.parser,http_status:response.status,check_completed:normalized.status==='CLOSED',body_sha256:hash(body)}],internal_only:true};
  if(normalized.status==='CLOSED')await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:key,observed_ts:observed,expires_ts:observed+(route.ttl_ms||TTL),payload:result});
 }catch(e){result={status:'OFFICIAL_SCHEDULE_SOURCE_ERROR',evidence:[],network_calls:1,admission,error:String(e.message).slice(0,160),internal_only:true};}
 return result;
}
