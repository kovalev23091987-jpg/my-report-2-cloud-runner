import {selectDeribitOptionRisk} from './deribit-option-risk-context.mjs';
import {createHash} from 'node:crypto';
import {buildEvidenceV2,SOURCE_POLICIES} from './evidence-source-adapters.mjs';
import {installEvidenceSourceStore,reserveEvidenceSourceAttempts,readEvidenceSourceCache,writeEvidenceSourceCache} from './evidence-source-store.mjs';

export const DERIBIT_ALT_OPTIONS_EVIDENCE_VERSION='deribit-alt-options-evidence-v3-shared-risk-20261004';
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
  text(row?.base_currency).toUpperCase()===wanted
 )).map(row=>({instrument_name:text(row.instrument_name),base_currency:text(row.base_currency).toUpperCase()||wanted,quote_currency:text(row.quote_currency).toUpperCase()||null,settlement_currency:text(row.settlement_currency).toUpperCase()||null,expiration_timestamp:finite(row.expiration_timestamp),option_type:text(row.option_type).toLowerCase()||null,strike:finite(row.strike)}));
}

export function normalizeDeribitAltOptions({contract,instruments=[],summary_payload,observed_ts=Date.now(),catalog_instrument_count=instruments.length,settlement_currency=null}={}){
 const htxContract=text(contract).toUpperCase(),base=baseOf(htxContract),names=new Set(instruments.map(row=>text(row.instrument_name)));
 if(instruments.some(i=>i.base_currency!==base)||new Set(instruments.map(i=>i.instrument_name)).size!==instruments.length)return{status:'EXACT_OPTION_IDENTITY_NOT_CLOSED',contract:htxContract,evidence:[],internal_only:true};
 const rows=(Array.isArray(summary_payload?.result)?summary_payload.result:[]).filter(row=>names.has(text(row?.instrument_name))),freshRows=rows.filter(row=>(finite(row?.creation_timestamp)??finite(row?.timestamp))!==null&&(finite(row.creation_timestamp)??finite(row.timestamp))<=observed_ts&&(finite(row.creation_timestamp)??finite(row.timestamp))>=observed_ts-TTL);
 if(instruments.length&&(!summary_payload||!Array.isArray(summary_payload.result)||!freshRows.length||new Set(rows.map(r=>r.instrument_name)).size!==rows.length))return{status:'NOT_CLOSED',contract:htxContract,evidence:[],summary:{base_currency:base,open_instrument_count:catalog_instrument_count,liquid_instrument_count:null},internal_only:true};
 const liquid=freshRows.filter(row=>(finite(row?.bid_price)??0)>0||(finite(row?.ask_price)??0)>0||(finite(row?.volume)??0)>0||(finite(row?.open_interest)??0)>0),sourceTs=freshRows.length?Math.min(...freshRows.map(row=>finite(row.creation_timestamp)??row.timestamp)):null;
 const currencies=[...new Set(instruments.map(i=>i.settlement_currency).filter(Boolean))],currency=settlement_currency??(currencies.length===1?currencies[0]:null);
 if(currencies.length>1||settlement_currency&&currencies.some(c=>c!==settlement_currency))return{status:'MIXED_SETTLEMENT_NOT_CLOSED',contract:htxContract,evidence:[],internal_only:true};
 const risk=currency?selectDeribitOptionRisk({instruments,rows:freshRows,base_currency:base,settlement_currency:currency,observed_ts}):null;
 const total=field=>liquid.length&&liquid.every(row=>finite(row[field])!==null&&finite(row[field])>=0)?liquid.reduce((sum,row)=>sum+finite(row[field]),0):null;
 const evidence=buildEvidenceV2({provider_id:SOURCE,upstream_id:'DERIBIT_PUBLIC_OPTIONS',asset_id:`htx-futures:${htxContract}`,htx_contract:htxContract,block_id:'N14',metric_family:'ALT_OPTIONS_LIQUIDITY_CONTEXT',origin_event_id:`${base}:${currency}:${sourceTs}`,dependency_group:`DERIBIT_OPTIONS:${base}:${currency}:${sourceTs}`,source_ts:sourceTs,observed_ts,expires_at:sourceTs+TTL,directional_strength:null,risk_strength:null,coverage_status:'SCOPED_PROVIDER_OPTION_QUOTES',coverage_fraction:catalog_instrument_count?Math.min(1,freshRows.length/catalog_instrument_count):0,validation_status:instruments.length?'VALID':'UNVERIFIED',validation_reason:instruments.length?null:'EXACT_OPEN_OPTION_REQUIRED',extra:{source_clock_policy:'PROVIDER_TIMESTAMP_ONLY',base_currency:base,open_instrument_count:catalog_instrument_count,scoped_instrument_count:instruments.length,summary_instrument_count:freshRows.length,settlement_currency:currency,liquid_instrument_count:liquid.length,total_volume:total('volume'),total_open_interest:total('open_interest'),aggregate_unit:base,option_risk_context:risk,direction_policy:'CONTEXT_ONLY_NO_DIRECTIONAL_BONUS'}});
 return{status:instruments.length?'CLOSED':'NOT_APPLICABLE',contract:htxContract,evidence:instruments.length?[evidence]:[],summary:{base_currency:base,open_instrument_count:catalog_instrument_count,scoped_instrument_count:instruments.length,settlement_currency:currency,liquid_instrument_count:liquid.length,option_risk_status:risk?.status??'NOT_CLOSED'},internal_only:true};
}
const validCatalog=(c,now)=>c?.version===DERIBIT_ALT_OPTIONS_EVIDENCE_VERSION&&c.validation_status==='VALID'&&Number.isSafeInteger(c.observed_ts)&&c.observed_ts<=now&&c.observed_ts+CATALOG_TTL>now&&/^[a-f0-9]{64}$/.test(c.response_sha256||'');
const cacheBound=c=>Buffer.byteLength(JSON.stringify(c),'utf8')<1500000;
const compactSummary=payload=>({result:payload.result.map(r=>Object.fromEntries(['instrument_name','creation_timestamp','timestamp','bid_price','ask_price','volume','open_interest','mark_iv','underlying_price'].filter(k=>r[k]!==undefined).map(k=>[k,r[k]])))});
export async function collectDeribitAltOptionsEvidence({db,fetch_impl=globalThis.fetch,request_admit,contract,run_id,now=Date.now(),strict_fresh_manual=false,clock=Date.now}={}){
 if(!db)throw new Error('DERIBIT_ALT_OPTIONS_DB_REQUIRED');const htxContract=text(contract).toUpperCase(),base=baseOf(htxContract);
 if(!/^[^\s-]+-USDT$/u.test(htxContract))return{status:'EXACT_HTX_CONTRACT_REQUIRED',evidence:[],network_calls:0,internal_only:true};
 await installEvidenceSourceStore(db);const candidateCached=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:`SUMMARY:${base}`,now});if(!strict_fresh_manual&&candidateCached?.version===DERIBIT_ALT_OPTIONS_EVIDENCE_VERSION)return{...candidateCached,contract:htxContract};
 let sharedCatalog=strict_fresh_manual?null:await readEvidenceSourceCache(db,{source:SOURCE,asset_key:'CATALOG:ALL_OPTIONS',now});if(!validCatalog(sharedCatalog,now)||!Array.isArray(sharedCatalog?.exact_instruments))sharedCatalog=null;
 let catalog=sharedCatalog?{...sharedCatalog,exact_instruments:sharedCatalog.exact_instruments.filter(i=>i.base_currency===base)}:strict_fresh_manual?null:await readEvidenceSourceCache(db,{source:SOURCE,asset_key:`CATALOG:${base}`,now}),catalogReceipt=null,catalogNetwork=0;
 if(!validCatalog(catalog,now))catalog=null;
 const initialCurrencies=[...new Set((catalog?.exact_instruments||[]).map(i=>i.settlement_currency).filter(Boolean))],pickCurrency=cs=>cs.includes('USDC')?'USDC':cs.includes(base)?base:cs.filter(c=>['BTC','ETH','USDT','EURR'].includes(c)).sort()[0]||null;
 const selected=pickCurrency(initialCurrencies);
 let sharedSummary=!strict_fresh_manual&&selected?await readEvidenceSourceCache(db,{source:SOURCE,asset_key:`BOOK:${selected}`,now}):null;
 if(sharedSummary&&(sharedSummary.version!==DERIBIT_ALT_OPTIONS_EVIDENCE_VERSION||!Array.isArray(sharedSummary.payload?.result)||!Number.isSafeInteger(sharedSummary.observed_ts)||sharedSummary.observed_ts>now||sharedSummary.observed_ts+TTL<=now))sharedSummary=null;
 const plannedAttempts=(catalog?0:1)+(catalog&&!catalog.exact_instruments.length||sharedSummary?0:1),reservationId=`EV2:${SOURCE}:${run_id}:${base}:${Math.floor(now/TTL)}`,wholeJobAdmission=plannedAttempts?typeof request_admit==='function'?request_admit({logical_request_id:reservationId,lane:'background',attempts:plannedAttempts}):{allowed:false,status:'WHOLE_JOB_HTTP_ADMISSION_REQUIRED'}:{allowed:true,status:'SHARED_CACHE_NO_HTTP',attempts:0};
 if(!wholeJobAdmission.allowed)return{status:wholeJobAdmission.status,evidence:[],network_calls:0,whole_job_admission:wholeJobAdmission,internal_only:true};
 const admission=plannedAttempts?await reserveEvidenceSourceAttempts(db,{source:SOURCE,reservation_id:reservationId,attempts:plannedAttempts,daily_cap:DAILY_CAP,now}):{allowed:true,status:'SHARED_CACHE_NO_SOURCE_ATTEMPT',attempts:0};if(!admission.allowed)return{status:admission.status,evidence:[],network_calls:0,admission,internal_only:true};
 if(!catalog){
  catalogReceipt=await getJson(fetch_impl,`${BASE}/public/get_instruments?currency=any&kind=option&expired=false`,clock);catalogNetwork=1;
  catalogReceipt.ok=catalogReceipt.ok&&Array.isArray(catalogReceipt.payload?.result)&&catalogReceipt.payload.result.length<=10000;
  const rows=catalogReceipt.ok?catalogReceipt.payload.result:[],bases=[...new Set(rows.map(r=>text(r.base_currency).toUpperCase()).filter(Boolean))],all=bases.flatMap(b=>selectExactAltOptionInstruments(catalogReceipt.payload,b));
  sharedCatalog={version:DERIBIT_ALT_OPTIONS_EVIDENCE_VERSION,exact_instruments:all,observed_ts:catalogReceipt.received_ts,validation_status:catalogReceipt.ok?'VALID':'INVALID',response_sha256:createHash('sha256').update(JSON.stringify(catalogReceipt.payload)).digest('hex')};
  catalog={...sharedCatalog,exact_instruments:all.filter(i=>i.base_currency===base)};
  if(catalogReceipt.ok){if(cacheBound(sharedCatalog))await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:'CATALOG:ALL_OPTIONS',observed_ts:sharedCatalog.observed_ts,expires_ts:sharedCatalog.observed_ts+CATALOG_TTL,payload:sharedCatalog});await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:`CATALOG:${base}`,observed_ts:catalog.observed_ts,expires_ts:catalog.observed_ts+CATALOG_TTL,payload:catalog});}
 }
 const instruments=Array.isArray(catalog?.exact_instruments)?catalog.exact_instruments:[];
 if(!instruments.length){
  const catalogValid=catalog.validation_status==='VALID'&&Number.isFinite(catalog.observed_ts)&&catalog.observed_ts<=Math.max(now,catalogReceipt?.received_ts||0)&&catalog.observed_ts+CATALOG_TTL>=now;
  const observation=Math.max(now,catalog.observed_ts||0);
  const absence=catalogValid?buildEvidenceV2({provider_id:SOURCE,upstream_id:'DERIBIT_PUBLIC_OPTIONS',asset_id:`htx-futures:${htxContract}`,htx_contract:htxContract,block_id:'N14',metric_family:'ALT_OPTIONS_CATALOG_ABSENCE',origin_event_id:`CATALOG:${base}:${catalog.observed_ts}`,dependency_group:`DERIBIT_OPTIONS_CATALOG:${base}:${catalog.observed_ts}`,source_ts:catalog.observed_ts,observed_ts:observation,expires_at:Math.min(catalog.observed_ts+CATALOG_TTL,observation+TTL),coverage_status:'EXACT_PROVIDER_CATALOG_ONLY',coverage_fraction:0,unit:'instruments',value:0,extra:{base_currency:base,open_instrument_count:0,source_clock_policy:'OBSERVED_STATIC_CATALOG_QUERY',catalog_response_sha256:catalog.response_sha256,direction_policy:'PROVIDER_ABSENCE_ONLY_NO_DIRECTIONAL_BONUS'}}):null;
  const result={version:DERIBIT_ALT_OPTIONS_EVIDENCE_VERSION,status:catalogReceipt&&!catalogReceipt.ok?'SOURCE_ERROR':catalogValid?'NOT_APPLICABLE':'CATALOG_OBSERVATION_NOT_CLOSED',contract:htxContract,evidence:absence?[absence]:[],network_calls:catalogNetwork,cache_status:catalogNetwork?'REFRESHED':'HIT',whole_job_admission:wholeJobAdmission,admission,receipts:catalogReceipt?[{route:'CATALOG',status:catalogReceipt.ok?'CLOSED':'SOURCE_ERROR',http_status:catalogReceipt.http_status,error:catalogReceipt.error}]:[],summary:{base_currency:base,open_instrument_count:catalogReceipt&&!catalogReceipt.ok?null:0,liquid_instrument_count:catalogReceipt&&!catalogReceipt.ok?null:0},internal_only:true};
  await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:`SUMMARY:${base}`,observed_ts:now,expires_ts:Math.min(now+TTL,...result.evidence.map(e=>e.expires_at)),payload:result});return result;
 }
 // Choose one explicit settlement partition. Never combine native and USDC option units.
 const currencies=[...new Set(instruments.map(row=>text(row.settlement_currency).toUpperCase()).filter(Boolean))],currency=pickCurrency(currencies);
 if(!currency)return{status:'SUMMARY_CURRENCY_NOT_CLOSED',contract:htxContract,evidence:[],network_calls:catalogNetwork,summary:{base_currency:base,open_instrument_count:instruments.length,liquid_instrument_count:null},internal_only:true};
 const scoped=instruments.filter(i=>i.settlement_currency===currency);
 let summary=sharedSummary?{ok:true,received_ts:sharedSummary.observed_ts,payload:sharedSummary.payload,http_status:200,error:null}:await getJson(fetch_impl,`${BASE}/public/get_book_summary_by_currency?currency=${encodeURIComponent(currency)}&kind=option`,clock);
 summary.ok=summary.ok&&Array.isArray(summary.payload?.result);
 if(summary.ok&&!sharedSummary){const compact={version:DERIBIT_ALT_OPTIONS_EVIDENCE_VERSION,observed_ts:summary.received_ts,payload:compactSummary(summary.payload)};if(cacheBound(compact))await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:`BOOK:${currency}`,observed_ts:compact.observed_ts,expires_ts:compact.observed_ts+TTL,payload:compact});}
 const normalized=normalizeDeribitAltOptions({contract:htxContract,instruments:scoped,catalog_instrument_count:instruments.length,settlement_currency:currency,summary_payload:summary.ok?summary.payload:null,observed_ts:Math.max(now,summary.received_ts??now)});
 const result={version:DERIBIT_ALT_OPTIONS_EVIDENCE_VERSION,...normalized,network_calls:catalogNetwork+(sharedSummary?0:1),cache_status:catalogNetwork||!sharedSummary?'REFRESHED':'SHARED_HIT',whole_job_admission:wholeJobAdmission,admission,receipts:[...(catalogReceipt?[{route:'CATALOG',status:catalogReceipt.ok?'CLOSED':'SOURCE_ERROR',http_status:catalogReceipt.http_status,error:catalogReceipt.error}]:[]),{route:'SUMMARY',currency,cache_hit:!!sharedSummary,status:summary.ok?'CLOSED':'SOURCE_ERROR',http_status:summary.http_status,error:summary.error}],internal_only:true};
 await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:`SUMMARY:${base}`,observed_ts:now,expires_ts:Math.min(now+TTL,...result.evidence.map(e=>e.expires_at)),payload:result});return result;
}

export default{selectExactAltOptionInstruments,normalizeDeribitAltOptions,collectDeribitAltOptionsEvidence};
