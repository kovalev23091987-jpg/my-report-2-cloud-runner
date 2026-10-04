import {createHash} from 'node:crypto';
import {buildEvidenceV2,SOURCE_POLICIES} from './evidence-source-adapters.mjs';
import {installEvidenceSourceStore,reserveEvidenceSourceAttempts,readEvidenceSourceCache,writeEvidenceSourceCache} from './evidence-source-store.mjs';

export const DERIBIT_ALT_OPTIONS_EVIDENCE_VERSION='deribit-alt-options-evidence-v2-settlement-route-20261004';
const SOURCE='DERIBIT_ALT_OPTIONS',TTL=SOURCE_POLICIES[SOURCE].ttl_ms,CATALOG_TTL=6*60*60_000,DAILY_CAP=SOURCE_POLICIES[SOURCE].daily_cap;
const BASE='https://www.deribit.com/api/v2',text=value=>String(value??'').trim(),finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value):null;
const baseOf=contract=>text(contract).toUpperCase().replace(/-USDT$/,'');

async function getJson(fetchImpl,url,clock=Date.now){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
 try{const response=await fetchImpl(url,{headers:{accept:'application/json','user-agent':'My-Report-2/deribit-alt-options-v1'},signal:controller.signal});const payload=await response.json().catch(()=>null);return{received_ts:clock(),ok:response.ok&&!payload?.error,http_status:response.status,payload,error:response.ok&&!payload?.error?null:`HTTP_OR_RPC_${response.status}`};}
 catch(error){return{ok:false,http_status:null,payload:null,error:String(error?.name==='AbortError'?'TIMEOUT':error?.message||error).slice(0,160)};}
 finally{clearTimeout(timer);}
}

export function selectExactAltOptionInstruments(payload,base){
 const wanted=text(base).toUpperCase(),rows=Array.isArray(payload?.result)?payload.result:[];
 return rows.filter(row=>row?.is_active!==false&&text(row?.kind).toLowerCase()==='option'&&(
  text(row?.base_currency).toUpperCase()===wanted||(!text(row?.base_currency)&&text(row?.instrument_name).toUpperCase().startsWith(`${wanted}-`))
 )).map(row=>({instrument_name:text(row.instrument_name).toUpperCase(),base_currency:text(row.base_currency).toUpperCase()||wanted,quote_currency:text(row.quote_currency).toUpperCase()||null,settlement_currency:text(row.settlement_currency).toUpperCase()||null,expiration_timestamp:finite(row.expiration_timestamp)}));
}

export function normalizeDeribitAltOptions({contract,instruments=[],summary_payload,observed_ts=Date.now()}={}){
 const htxContract=text(contract).toUpperCase(),base=baseOf(htxContract),names=new Set(instruments.map(row=>text(row.instrument_name).toUpperCase())),rows=(Array.isArray(summary_payload?.result)?summary_payload.result:[]).filter(row=>names.has(text(row?.instrument_name).toUpperCase()));
 const freshRows=rows.filter(row=>(finite(row?.creation_timestamp)??finite(row?.timestamp))!==null&&(finite(row.creation_timestamp)??finite(row.timestamp))<=observed_ts&&(finite(row.creation_timestamp)??finite(row.timestamp))>=observed_ts-TTL);
 if(instruments.length&&(!summary_payload||!Array.isArray(summary_payload.result)||!freshRows.length))return{status:'NOT_CLOSED',contract:htxContract,evidence:[],summary:{base_currency:base,open_instrument_count:instruments.length,liquid_instrument_count:null},internal_only:true};
 const liquid=freshRows.filter(row=>(finite(row?.bid_price)??0)>0||(finite(row?.ask_price)??0)>0||(finite(row?.volume)??0)>0||(finite(row?.open_interest)??0)>0),sourceTs=freshRows.length?Math.max(...freshRows.map(row=>finite(row.creation_timestamp)??row.timestamp)):null;
 const evidence=buildEvidenceV2({provider_id:SOURCE,upstream_id:'DERIBIT_PUBLIC_OPTIONS',asset_id:`htx-futures:${htxContract}`,htx_contract:htxContract,block_id:'N14',metric_family:'ALT_OPTIONS_LIQUIDITY_CONTEXT',origin_event_id:`${base}:${sourceTs}`,dependency_group:`DERIBIT_OPTIONS:${base}:${sourceTs}`,source_ts:sourceTs,observed_ts,expires_at:observed_ts+TTL,directional_strength:null,risk_strength:null,coverage_status:liquid.length?'COMPLETE':'PARTIAL',coverage_fraction:liquid.length?1:0,validation_status:instruments.length?'VALID':'UNVERIFIED',validation_reason:instruments.length?null:'EXACT_OPEN_OPTION_REQUIRED',extra:{source_clock_policy:'PROVIDER_TIMESTAMP_ONLY',base_currency:base,open_instrument_count:instruments.length,liquid_instrument_count:liquid.length,total_volume:liquid.reduce((sum,row)=>sum+(finite(row?.volume)||0),0),total_open_interest:liquid.reduce((sum,row)=>sum+(finite(row?.open_interest)||0),0),direction_policy:'CONTEXT_ONLY_NO_DIRECTIONAL_BONUS'}});
 return{status:instruments.length?'CLOSED':'NOT_APPLICABLE',contract:htxContract,evidence:instruments.length?[evidence]:[],summary:{base_currency:base,open_instrument_count:instruments.length,liquid_instrument_count:liquid.length},internal_only:true};
}

export async function collectDeribitAltOptionsEvidence({db,fetch_impl=globalThis.fetch,request_admit,contract,run_id,now=Date.now(),strict_fresh_manual=false,clock=Date.now}={}){
 if(!db)throw new Error('DERIBIT_ALT_OPTIONS_DB_REQUIRED');const htxContract=text(contract).toUpperCase(),base=baseOf(htxContract);
 if(!/^[^\s-]+-USDT$/u.test(htxContract))return{status:'EXACT_HTX_CONTRACT_REQUIRED',evidence:[],network_calls:0,internal_only:true};
 await installEvidenceSourceStore(db);const candidateCached=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:`SUMMARY:${base}`,now});if(!strict_fresh_manual&&candidateCached?.version===DERIBIT_ALT_OPTIONS_EVIDENCE_VERSION)return{...candidateCached,contract:htxContract};
 let catalog=strict_fresh_manual?null:await readEvidenceSourceCache(db,{source:SOURCE,asset_key:`CATALOG:${base}`,now}),catalogReceipt=null,catalogNetwork=0;
 if(catalog&&(catalog.validation_status!=='VALID'||!Number.isFinite(catalog.observed_ts)||!catalog.response_sha256))catalog=null;
 const plannedAttempts=catalog?1:2,reservationId=`EV2:${SOURCE}:${run_id}:${base}:${Math.floor(now/TTL)}`,wholeJobAdmission=typeof request_admit==='function'?request_admit({logical_request_id:reservationId,lane:'background',attempts:plannedAttempts}):{allowed:false,status:'WHOLE_JOB_HTTP_ADMISSION_REQUIRED'};
 if(!wholeJobAdmission.allowed)return{status:wholeJobAdmission.status,evidence:[],network_calls:0,whole_job_admission:wholeJobAdmission,internal_only:true};
 const admission=await reserveEvidenceSourceAttempts(db,{source:SOURCE,reservation_id:reservationId,attempts:plannedAttempts,daily_cap:DAILY_CAP,now});if(!admission.allowed)return{status:admission.status,evidence:[],network_calls:0,admission,internal_only:true};
 if(!catalog){
  catalogReceipt=await getJson(fetch_impl,`${BASE}/public/get_instruments?currency=any&kind=option&expired=false`,clock);catalogNetwork=1;
  catalogReceipt.ok=catalogReceipt.ok&&Array.isArray(catalogReceipt.payload?.result);
  const exactInstruments=selectExactAltOptionInstruments(catalogReceipt.ok?catalogReceipt.payload:null,base);
  catalog={exact_instruments:exactInstruments,observed_ts:catalogReceipt.received_ts,validation_status:catalogReceipt.ok?'VALID':'INVALID',response_sha256:createHash('sha256').update(JSON.stringify(catalogReceipt.payload)).digest('hex')};
  if(catalogReceipt.ok)await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:`CATALOG:${base}`,observed_ts:now,expires_ts:now+CATALOG_TTL,payload:catalog});
 }
 const instruments=Array.isArray(catalog?.exact_instruments)?catalog.exact_instruments:[];
 if(!instruments.length){
  const catalogValid=catalog.validation_status==='VALID'&&Number.isFinite(catalog.observed_ts)&&catalog.observed_ts<=Math.max(now,catalogReceipt?.received_ts||0)&&catalog.observed_ts+CATALOG_TTL>=now;
  const observation=Math.max(now,catalog.observed_ts||0);
  const absence=catalogValid?buildEvidenceV2({provider_id:SOURCE,upstream_id:'DERIBIT_PUBLIC_OPTIONS',asset_id:`htx-futures:${htxContract}`,htx_contract:htxContract,block_id:'N14',metric_family:'ALT_OPTIONS_CATALOG_ABSENCE',origin_event_id:`CATALOG:${base}:${catalog.observed_ts}`,dependency_group:`DERIBIT_OPTIONS_CATALOG:${base}:${catalog.observed_ts}`,source_ts:catalog.observed_ts,observed_ts:observation,expires_at:Math.min(catalog.observed_ts+CATALOG_TTL,observation+TTL),coverage_status:'EXACT_PROVIDER_CATALOG_ONLY',coverage_fraction:0,unit:'instruments',value:0,extra:{base_currency:base,open_instrument_count:0,source_clock_policy:'OBSERVED_STATIC_CATALOG_QUERY',catalog_response_sha256:catalog.response_sha256,direction_policy:'PROVIDER_ABSENCE_ONLY_NO_DIRECTIONAL_BONUS'}}):null;
  const result={version:DERIBIT_ALT_OPTIONS_EVIDENCE_VERSION,status:catalogReceipt&&!catalogReceipt.ok?'SOURCE_ERROR':catalogValid?'NOT_APPLICABLE':'CATALOG_OBSERVATION_NOT_CLOSED',contract:htxContract,evidence:absence?[absence]:[],network_calls:catalogNetwork,cache_status:catalogNetwork?'REFRESHED':'HIT',whole_job_admission:wholeJobAdmission,admission,receipts:catalogReceipt?[{route:'CATALOG',status:catalogReceipt.ok?'CLOSED':'SOURCE_ERROR',http_status:catalogReceipt.http_status,error:catalogReceipt.error}]:[],summary:{base_currency:base,open_instrument_count:catalogReceipt&&!catalogReceipt.ok?null:0,liquid_instrument_count:catalogReceipt&&!catalogReceipt.ok?null:0},internal_only:true};
  await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:`SUMMARY:${base}`,observed_ts:now,expires_ts:now+TTL,payload:result});return result;
 }
 // Alt options are grouped by settlement currency (usually USDC), not by underlying ticker.
 // Official reference: https://docs.deribit.com/api-reference/market-data/public-get_book_summary_by_currency
 const currencies=[...new Set(instruments.map(row=>text(row.settlement_currency).toUpperCase()).filter(Boolean))];
 if(currencies.length!==1||!['BTC','ETH','USDC','USDT','EURR'].includes(currencies[0]))return{status:'SUMMARY_CURRENCY_NOT_CLOSED',contract:htxContract,evidence:[],network_calls:catalogNetwork,summary:{base_currency:base,open_instrument_count:instruments.length,liquid_instrument_count:null},internal_only:true};
 const summary=await getJson(fetch_impl,`${BASE}/public/get_book_summary_by_currency?currency=${encodeURIComponent(currencies[0])}&kind=option`,clock),normalized=normalizeDeribitAltOptions({contract:htxContract,instruments,summary_payload:summary.ok?summary.payload:null,observed_ts:summary.received_ts??now});
 const result={version:DERIBIT_ALT_OPTIONS_EVIDENCE_VERSION,...normalized,network_calls:catalogNetwork+1,cache_status:'REFRESHED',whole_job_admission:wholeJobAdmission,admission,receipts:[...(catalogReceipt?[{route:'CATALOG',status:catalogReceipt.ok?'CLOSED':'SOURCE_ERROR',http_status:catalogReceipt.http_status,error:catalogReceipt.error}]:[]),{route:'SUMMARY',status:summary.ok?'CLOSED':'SOURCE_ERROR',http_status:summary.http_status,error:summary.error}],internal_only:true};
 await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:`SUMMARY:${base}`,observed_ts:now,expires_ts:now+TTL,payload:result});return result;
}

export default{selectExactAltOptionInstruments,normalizeDeribitAltOptions,collectDeribitAltOptionsEvidence};
