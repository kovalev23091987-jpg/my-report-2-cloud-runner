import {buildEvidenceV2,SOURCE_POLICIES} from './evidence-source-adapters.mjs';
import {installEvidenceSourceStore,reserveEvidenceSourceAttempts,readEvidenceSourceCache,writeEvidenceSourceCache} from './evidence-source-store.mjs';

export const DERIBIT_ALT_OPTIONS_EVIDENCE_VERSION='deribit-alt-options-evidence-v1-20260928';
const SOURCE='DERIBIT_ALT_OPTIONS',TTL=SOURCE_POLICIES[SOURCE].ttl_ms,CATALOG_TTL=6*60*60_000,DAILY_CAP=SOURCE_POLICIES[SOURCE].daily_cap;
const BASE='https://www.deribit.com/api/v2',text=value=>String(value??'').trim(),finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value):null;
const baseOf=contract=>text(contract).toUpperCase().replace(/-USDT$/,'');

async function getJson(fetchImpl,url){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
 try{const response=await fetchImpl(url,{headers:{accept:'application/json','user-agent':'My-Report-2/deribit-alt-options-v1'},signal:controller.signal});const payload=await response.json().catch(()=>null);return{ok:response.ok&&!payload?.error,http_status:response.status,payload,error:response.ok&&!payload?.error?null:`HTTP_OR_RPC_${response.status}`};}
 catch(error){return{ok:false,http_status:null,payload:null,error:String(error?.name==='AbortError'?'TIMEOUT':error?.message||error).slice(0,160)};}
 finally{clearTimeout(timer);}
}

export function selectExactAltOptionInstruments(payload,base){
 const wanted=text(base).toUpperCase(),rows=Array.isArray(payload?.result)?payload.result:[];
 return rows.filter(row=>row?.is_active!==false&&text(row?.kind).toLowerCase()==='option'&&(
  text(row?.base_currency).toUpperCase()===wanted||text(row?.instrument_name).toUpperCase().startsWith(`${wanted}-`)
 )).map(row=>({instrument_name:text(row.instrument_name).toUpperCase(),base_currency:text(row.base_currency).toUpperCase()||wanted,quote_currency:text(row.quote_currency).toUpperCase()||null,settlement_currency:text(row.settlement_currency).toUpperCase()||null,expiration_timestamp:finite(row.expiration_timestamp)}));
}

export function normalizeDeribitAltOptions({contract,instruments=[],summary_payload,observed_ts=Date.now()}={}){
 const htxContract=text(contract).toUpperCase(),base=baseOf(htxContract),names=new Set(instruments.map(row=>text(row.instrument_name).toUpperCase())),rows=(Array.isArray(summary_payload?.result)?summary_payload.result:[]).filter(row=>names.has(text(row?.instrument_name).toUpperCase()));
 const liquid=rows.filter(row=>finite(row?.bid_price)!==null||finite(row?.ask_price)!==null||(finite(row?.volume)??0)>0||(finite(row?.open_interest)??0)>0),sourceTs=Math.max(observed_ts,...rows.map(row=>finite(row?.timestamp)||0));
 const evidence=buildEvidenceV2({provider_id:SOURCE,upstream_id:'DERIBIT_PUBLIC_OPTIONS',asset_id:`htx-futures:${htxContract}`,htx_contract:htxContract,block_id:'N14',metric_family:'ALT_OPTIONS_LIQUIDITY_CONTEXT',origin_event_id:`${base}:${sourceTs}`,dependency_group:`DERIBIT_OPTIONS:${base}:${sourceTs}`,source_ts:sourceTs,observed_ts,expires_at:observed_ts+TTL,directional_strength:null,risk_strength:null,coverage_status:liquid.length?'COMPLETE':'PARTIAL',coverage_fraction:liquid.length?1:0,validation_status:instruments.length?'VALID':'UNVERIFIED',validation_reason:instruments.length?null:'EXACT_OPEN_OPTION_REQUIRED',extra:{base_currency:base,open_instrument_count:instruments.length,liquid_instrument_count:liquid.length,total_volume:liquid.reduce((sum,row)=>sum+(finite(row?.volume)||0),0),total_open_interest:liquid.reduce((sum,row)=>sum+(finite(row?.open_interest)||0),0),direction_policy:'CONTEXT_ONLY_NO_DIRECTIONAL_BONUS'}});
 return{status:instruments.length?'CLOSED':'NOT_APPLICABLE',contract:htxContract,evidence:instruments.length?[evidence]:[],summary:{base_currency:base,open_instrument_count:instruments.length,liquid_instrument_count:liquid.length},internal_only:true};
}

export async function collectDeribitAltOptionsEvidence({db,fetch_impl=globalThis.fetch,request_admit,contract,run_id,now=Date.now()}={}){
 if(!db)throw new Error('DERIBIT_ALT_OPTIONS_DB_REQUIRED');const htxContract=text(contract).toUpperCase(),base=baseOf(htxContract);
 if(!/^[^\s-]+-USDT$/u.test(htxContract))return{status:'EXACT_HTX_CONTRACT_REQUIRED',evidence:[],network_calls:0,internal_only:true};
 await installEvidenceSourceStore(db);const candidateCached=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:`SUMMARY:${base}`,now});if(candidateCached)return{...candidateCached,contract:htxContract};
 let catalog=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:`CATALOG:${base}`,now}),catalogReceipt=null,catalogNetwork=0;
 const plannedAttempts=catalog?1:2,reservationId=`EV2:${SOURCE}:${run_id}:${base}:${Math.floor(now/TTL)}`,wholeJobAdmission=typeof request_admit==='function'?request_admit({logical_request_id:reservationId,lane:'background',attempts:plannedAttempts}):{allowed:false,status:'WHOLE_JOB_HTTP_ADMISSION_REQUIRED'};
 if(!wholeJobAdmission.allowed)return{status:wholeJobAdmission.status,evidence:[],network_calls:0,whole_job_admission:wholeJobAdmission,internal_only:true};
 const admission=await reserveEvidenceSourceAttempts(db,{source:SOURCE,reservation_id:reservationId,attempts:plannedAttempts,daily_cap:DAILY_CAP,now});if(!admission.allowed)return{status:admission.status,evidence:[],network_calls:0,admission,internal_only:true};
 if(!catalog){
  catalogReceipt=await getJson(fetch_impl,`${BASE}/public/get_instruments?currency=any&kind=option&expired=false`);catalogNetwork=1;
  const exactInstruments=selectExactAltOptionInstruments(catalogReceipt.ok?catalogReceipt.payload:null,base);
  catalog={exact_instruments:exactInstruments};
  if(catalogReceipt.ok)await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:`CATALOG:${base}`,observed_ts:now,expires_ts:now+CATALOG_TTL,payload:catalog});
 }
 const instruments=Array.isArray(catalog?.exact_instruments)?catalog.exact_instruments:[];
 if(!instruments.length){
  const result={version:DERIBIT_ALT_OPTIONS_EVIDENCE_VERSION,status:'NOT_APPLICABLE',contract:htxContract,evidence:[],network_calls:catalogNetwork,cache_status:catalogNetwork?'REFRESHED':'HIT',whole_job_admission:wholeJobAdmission,admission,receipts:catalogReceipt?[{route:'CATALOG',status:catalogReceipt.ok?'CLOSED':'SOURCE_ERROR',http_status:catalogReceipt.http_status,error:catalogReceipt.error}]:[],summary:{base_currency:base,open_instrument_count:0,liquid_instrument_count:0},internal_only:true};
  await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:`SUMMARY:${base}`,observed_ts:now,expires_ts:now+TTL,payload:result});return result;
 }
 const summary=await getJson(fetch_impl,`${BASE}/public/get_book_summary_by_currency?currency=${encodeURIComponent(base)}&kind=option`),normalized=normalizeDeribitAltOptions({contract:htxContract,instruments,summary_payload:summary.ok?summary.payload:null,observed_ts:now});
 const result={version:DERIBIT_ALT_OPTIONS_EVIDENCE_VERSION,...normalized,network_calls:catalogNetwork+1,cache_status:'REFRESHED',whole_job_admission:wholeJobAdmission,admission,receipts:[...(catalogReceipt?[{route:'CATALOG',status:catalogReceipt.ok?'CLOSED':'SOURCE_ERROR',http_status:catalogReceipt.http_status,error:catalogReceipt.error}]:[]),{route:'SUMMARY',status:summary.ok?'CLOSED':'SOURCE_ERROR',http_status:summary.http_status,error:summary.error}],internal_only:true};
 await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:`SUMMARY:${base}`,observed_ts:now,expires_ts:now+TTL,payload:result});return result;
}

export default{selectExactAltOptionInstruments,normalizeDeribitAltOptions,collectDeribitAltOptionsEvidence};
