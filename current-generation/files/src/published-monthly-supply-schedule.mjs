import {createHash} from 'node:crypto';
import {buildEvidenceV2,SOURCE_POLICIES} from './evidence-source-adapters.mjs';
import {installEvidenceSourceStore,readEvidenceSourceCache,writeEvidenceSourceCache,reserveEvidenceSourceAttempts} from './evidence-source-store.mjs';
export const PUBLISHED_MONTHLY_SCHEDULE_VERSION='published-monthly-supply-schedule-v1-20261008';
export const PUBLISHED_MONTHLY_SCHEDULE_TTL=6*60*60_000;
export const SUI_MONTHLY_SCHEDULE_ROUTE=Object.freeze({chain:'sui',native_asset_id:'sui:mainnet',url:'https://sui-circulation.suiexplorer.com/api/sui_circulation',parser:'SUI_PUBLISHED_MONTH_END_SCHEDULE_V1',daily_cap:4});
const SOURCE='OFFICIAL_EVENTS',hash=b=>createHash('sha256').update(b).digest('hex'),stamp=v=>Number.isSafeInteger(v)&&v>=1e12,num=v=>typeof v==='number'&&Number.isFinite(v);
export function exactPublishedMonthlyScheduleRoute({contract,asset_identity}={}){
 const r=contract==='SUI-USDT'?SUI_MONTHLY_SCHEDULE_ROUTE:null;
 return r&&asset_identity?.chain===r.chain&&asset_identity.asset_kind==='NATIVE'&&asset_identity.native_asset_id===r.native_asset_id&&asset_identity.contract_or_mint===null?r:null;
}
// Validate the whole published series. Monthly periods never become exact
// release times, finalized supply, or observed transfers.
export function derivePublishedMonthlySchedule(payload,{observed_ts,total_supply=10000000000}={}){
 if(!stamp(observed_ts)||total_supply!==10000000000||!Array.isArray(payload)||payload.length<2||payload.length>240)return null;
 const rows=[];let previousIndex=null,previousSupply=null;
 for(const p of payload){
  if(!p||!Number.isSafeInteger(p.year)||p.year<2023||p.year>2100||!Number.isSafeInteger(p.month)||p.month<1||p.month>12||!num(p.circulatingSupplyValue)||p.circulatingSupplyValue<0||p.circulatingSupplyValue>total_supply||!num(p.circulatingSupplyPercentage)||p.circulatingSupplyPercentage<0||p.circulatingSupplyPercentage>1||Math.abs(p.circulatingSupplyValue/total_supply-p.circulatingSupplyPercentage)>1e-12)return null;
  const index=p.year*12+p.month-1;
  if(previousIndex!==null&&(index!==previousIndex+1||p.circulatingSupplyValue<previousSupply))return null;
  rows.push({month:p.year+'-'+String(p.month).padStart(2,'0'),period_start_ts:Date.UTC(p.year,p.month-1,1),period_end_exclusive_ts:Date.UTC(p.year,p.month,1),planned_month_end_circulation_tokens:p.circulatingSupplyValue,planned_increase_over_previous_month_tokens:previousSupply===null?null:p.circulatingSupplyValue-previousSupply});
  previousIndex=index;previousSupply=p.circulatingSupplyValue;
 }
 const future=rows.filter(r=>r.period_end_exclusive_ts>observed_ts&&r.planned_increase_over_previous_month_tokens!==null).slice(0,2);
 if(!future.length)return null;
 return{schema:'published-month-end-supply-projection-v1',token_unit:'SUI',total_supply_tokens:total_supply,published_months:rows.length,first_published_month:rows[0].month,last_published_month:rows.at(-1).month,projections:future,period_precision:'MONTH;END_OF_MONTH_VALUE_NOT_UNLOCK_TIME',schedule_is_adjustable:true,actual_unlock_transfer_verified:false,current_finalized_supply_verified:false,individual_lockup_positions_verified:false};
}
export function normalizePublishedMonthlySchedule({contract,asset_identity,payload,source_url,observed_ts}={}){
 const route=exactPublishedMonthlyScheduleRoute({contract,asset_identity}),bad=status=>({status,evidence:[],internal_only:true});
 if(!route||source_url!==route.url)return bad('EXACT_PRIMARY_MONTHLY_SCHEDULE_ROUTE_REQUIRED');
 const schedule=derivePublishedMonthlySchedule(payload,{observed_ts});if(!schedule)return bad('PUBLISHED_MONTHLY_SCHEDULE_SCHEMA_OR_FUTURE_NOT_CLOSED');
 const digest=hash(JSON.stringify(payload)),evidence=buildEvidenceV2({provider_id:'SUI_PUBLISHED_MONTHLY_SCHEDULE',upstream_id:'SUI_FOUNDATION_PUBLISHED_SUPPLY_SCHEDULE',asset_id:'sui:native:mainnet',htx_contract:contract,block_id:'N01',metric_family:'OFFICIAL_PUBLISHED_MONTH_END_SUPPLY_PROJECTION',origin_event_id:route.url+':'+digest,dependency_group:'SUI_FOUNDATION_PUBLISHED_SUPPLY_SCHEDULE',source_ts:observed_ts,observed_ts,expires_at:observed_ts+PUBLISHED_MONTHLY_SCHEDULE_TTL,coverage_status:'PRIMARY_PUBLISHED_ADJUSTABLE_MONTHLY_PROJECTION',coverage_fraction:0,directional_strength:null,risk_strength:null,extra:{parser_id:route.parser,chain:'sui',native_asset_id:'sui:mainnet',official_url:route.url,primary_payload:payload,primary_payload_sha256:digest,schedule_context:schedule,source_clock_policy:'ORIGINAL_PRIMARY_SCHEDULE_QUERY_NOT_UNLOCK_EXECUTION',actual_unlock_transfer_verified:false,current_finalized_supply_verified:false,exact_unlock_time_verified:false,entry_authorized:false}});
 return{version:PUBLISHED_MONTHLY_SCHEDULE_VERSION,status:'CLOSED',contract,evidence:[evidence],schedule,internal_only:true};
}
export async function collectPublishedMonthlySchedule({db,fetch_impl=globalThis.fetch,request_admit,contract,run_id,asset_identity,now=Date.now(),clock=Date.now,strict_fresh_manual=false}={}){
 const route=exactPublishedMonthlyScheduleRoute({contract,asset_identity});if(!route)return{status:'EXACT_PRIMARY_MONTHLY_SCHEDULE_ROUTE_REQUIRED',evidence:[],network_calls:0,internal_only:true};
 await installEvidenceSourceStore(db);
 const key=PUBLISHED_MONTHLY_SCHEDULE_VERSION+':'+contract,cached=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:key,now});
 if(!strict_fresh_manual&&cached?.version===PUBLISHED_MONTHLY_SCHEDULE_VERSION&&cached.contract===contract&&cached.status==='CLOSED'){
  const old=cached.evidence?.[0],rebuilt=normalizePublishedMonthlySchedule({contract,asset_identity,payload:old?.primary_payload,source_url:route.url,observed_ts:old?.observed_ts});
  if(old&&rebuilt.status==='CLOSED'&&JSON.stringify(rebuilt.evidence[0])===JSON.stringify(old)&&old.expires_at>now&&old.observed_ts<=now&&old.schedule_context.projections[0].period_end_exclusive_ts>now)return{...cached,network_calls:0,cache_status:'HIT',source_clock_refreshed:false};
 }
 const id='EV2:SUI_MONTHLY_SCHEDULE:'+run_id+':'+contract+':'+Math.floor(now/PUBLISHED_MONTHLY_SCHEDULE_TTL),grant=request_admit?.({logical_request_id:id,lane:'background',attempts:1});
 if(grant?.allowed!==true||grant.duplicate===true)return{status:grant?.status||'WHOLE_JOB_HTTP_ADMISSION_REQUIRED',evidence:[],network_calls:0,internal_only:true};
 const routeAdmission=await reserveEvidenceSourceAttempts(db,{source:'SUI_PUBLISHED_MONTHLY_SCHEDULE',reservation_id:id+':ROUTE',attempts:1,daily_cap:route.daily_cap,now});if(!routeAdmission.allowed)return{status:routeAdmission.status,evidence:[],network_calls:0,admission:routeAdmission,internal_only:true};
 const admission=await reserveEvidenceSourceAttempts(db,{source:SOURCE,reservation_id:id,attempts:1,daily_cap:SOURCE_POLICIES[SOURCE].daily_cap,now});if(!admission.allowed)return{status:admission.status,evidence:[],network_calls:0,admission,internal_only:true};
 try{
  const r=await fetch_impl(route.url,{headers:{accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(8000)}),body=await r.text(),observed=clock();let payload=null;if(Buffer.byteLength(body)<=256*1024)try{payload=JSON.parse(body);}catch{}
  const normalized=r.ok?normalizePublishedMonthlySchedule({contract,asset_identity,payload,source_url:r.url||route.url,observed_ts:observed}):{status:'PRIMARY_MONTHLY_SCHEDULE_SOURCE_ERROR',evidence:[]},result={...normalized,version:PUBLISHED_MONTHLY_SCHEDULE_VERSION,network_calls:1,admission,route_admission:routeAdmission,cache_status:'REFRESHED',receipts:[{route:route.parser,http_status:r.status,check_completed:normalized.status==='CLOSED',body_sha256:hash(body)}],source_clock_refreshed:false,internal_only:true};
  if(normalized.status==='CLOSED')await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:key,observed_ts:observed,expires_ts:normalized.evidence[0].expires_at,payload:result});
  return result;
 }catch(e){return{status:'PRIMARY_MONTHLY_SCHEDULE_SOURCE_ERROR',evidence:[],network_calls:1,admission,route_admission:routeAdmission,error:String(e.message).slice(0,160),internal_only:true};}
}

