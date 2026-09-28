import {buildEvidenceV2,SOURCE_POLICIES} from './evidence-source-adapters.mjs';

export const HTX_PUBLIC_RISK_EVIDENCE_VERSION='htx-public-risk-evidence-v1-20260928';
const SOURCE='HTX_PUBLIC_RISK',TTL=SOURCE_POLICIES[SOURCE].ttl_ms,DAILY_CAP=SOURCE_POLICIES[SOURCE].daily_cap;
const text=value=>String(value??'').trim();
const contractOf=value=>text(value).toUpperCase();
const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value):null;

async function install(db){await db.batch([
 db.prepare(`CREATE TABLE IF NOT EXISTS report2_evidence_source_daily(source TEXT NOT NULL,day_utc TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,last_reservation_id TEXT,updated_at INTEGER NOT NULL,PRIMARY KEY(source,day_utc))`),
 db.prepare(`CREATE TABLE IF NOT EXISTS report2_evidence_source_reservation(reservation_id TEXT PRIMARY KEY,source TEXT NOT NULL,day_utc TEXT NOT NULL,attempts INTEGER NOT NULL,created_at INTEGER NOT NULL)`),
 db.prepare(`CREATE TABLE IF NOT EXISTS report2_evidence_source_cache(source TEXT NOT NULL,asset_key TEXT NOT NULL,observed_ts INTEGER NOT NULL,expires_ts INTEGER NOT NULL,payload_json TEXT NOT NULL,PRIMARY KEY(source,asset_key))`),
]);}

async function reserve(db,{reservation_id,attempts,now}){
 const day=new Date(now).toISOString().slice(0,10);
 await db.batch([
  db.prepare(`INSERT INTO report2_evidence_source_daily(source,day_utc,attempts,last_reservation_id,updated_at) VALUES(?1,?2,0,NULL,?3) ON CONFLICT(source,day_utc) DO NOTHING`).bind(SOURCE,day,now),
  db.prepare(`UPDATE report2_evidence_source_daily SET attempts=attempts+?1,last_reservation_id=?2,updated_at=?3 WHERE source=?4 AND day_utc=?5 AND attempts+?1<=?6 AND NOT EXISTS(SELECT 1 FROM report2_evidence_source_reservation WHERE reservation_id=?2)`).bind(attempts,reservation_id,now,SOURCE,day,DAILY_CAP),
  db.prepare(`INSERT INTO report2_evidence_source_reservation(reservation_id,source,day_utc,attempts,created_at) SELECT ?1,?2,?3,?4,?5 FROM report2_evidence_source_daily WHERE source=?2 AND day_utc=?3 AND last_reservation_id=?1 ON CONFLICT(reservation_id) DO NOTHING`).bind(reservation_id,SOURCE,day,attempts,now),
 ]);
 const row=await db.prepare(`SELECT attempts FROM report2_evidence_source_reservation WHERE reservation_id=?1`).bind(reservation_id).first();
 return{allowed:Number(row?.attempts)===attempts,status:Number(row?.attempts)===attempts?'RESERVED':'DAILY_CAP_OR_DUPLICATE',day_utc:day,attempts:Number(row?.attempts||0)};
}

async function getJson(fetchImpl,url){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
 try{const response=await fetchImpl(url,{headers:{accept:'application/json','user-agent':'My-Report-2/htx-risk-v1'},signal:controller.signal});const payload=await response.json().catch(()=>null);return{ok:response.ok&&payload?.status==='ok',http_status:response.status,payload};}
 catch(error){return{ok:false,http_status:null,error:String(error?.name==='AbortError'?'TIMEOUT':error?.message||error).slice(0,160),payload:null};}
 finally{clearTimeout(timer);}
}

const rows=payload=>Array.isArray(payload?.data)?payload.data:payload?.data&&typeof payload.data==='object'?[payload.data]:[];
const matching=(payload,contract)=>rows(payload).filter(row=>!row?.contract_code||contractOf(row.contract_code)===contract);
export function normalizeHtxPublicRisk({contract,state_payload,isolated_payload,cross_payload,observed_ts=Date.now()}={}){
 const htxContract=contractOf(contract),stateRows=matching(state_payload,htxContract),isolatedRows=matching(isolated_payload,htxContract),crossRows=matching(cross_payload,htxContract);
 const openValues=stateRows.flatMap(row=>['open','open_order','open_position'].map(key=>finite(row?.[key])).filter(value=>value!==null));
 const explicitlyClosed=openValues.some(value=>value===0),sourceTs=Math.max(0,...[state_payload?.ts,isolated_payload?.ts,cross_payload?.ts].map(finite).filter(value=>value!==null),observed_ts);
 const evidence=buildEvidenceV2({provider_id:SOURCE,upstream_id:'HTX_OFFICIAL_LINEAR_SWAP',asset_id:`htx-futures:${htxContract}`,htx_contract:htxContract,block_id:explicitlyClosed?'N08':'N09',metric_family:explicitlyClosed?'HTX_OPENING_RESTRICTED':'HTX_MARGIN_RISK_CONTEXT',origin_event_id:`${htxContract}:${sourceTs}`,dependency_group:`HTX_EXECUTION_RULES:${htxContract}:${sourceTs}`,source_ts:sourceTs,observed_ts,expires_at:observed_ts+TTL,directional_strength:null,risk_strength:explicitlyClosed?1:null,coverage_status:stateRows.length?'COMPLETE':'PARTIAL',coverage_fraction:stateRows.length?1:0,validation_status:stateRows.length?'VALID':'ERROR',validation_reason:stateRows.length?null:'HTX_STATE_ROW_REQUIRED',extra:{execution_open_allowed:stateRows.length&&!explicitlyClosed,isolated_ladder_count:isolatedRows.length,cross_ladder_count:crossRows.length,official_units_preserved:true}});
 return{status:stateRows.length?'CLOSED':'PARTIAL',contract:htxContract,evidence:[evidence],summary:{execution_open_allowed:evidence.execution_open_allowed,isolated_ladder_count:isolatedRows.length,cross_ladder_count:crossRows.length},internal_only:true};
}

export async function collectHtxPublicRiskEvidence({db,fetch_impl=globalThis.fetch,pause_impl=ms=>new Promise(resolve=>setTimeout(resolve,ms)),request_admit,contract,run_id,now=Date.now()}={}){
 if(!db)throw new Error('HTX_PUBLIC_RISK_DB_REQUIRED');const htxContract=contractOf(contract);if(!/^[^\s-]+-USDT$/u.test(htxContract))return{status:'EXACT_HTX_CONTRACT_REQUIRED',evidence:[],network_calls:0,internal_only:true};
 await install(db);const cached=await db.prepare(`SELECT payload_json FROM report2_evidence_source_cache WHERE source=?1 AND asset_key=?2 AND expires_ts>?3`).bind(SOURCE,htxContract,now).first();
 if(cached){try{return{...JSON.parse(cached.payload_json),cache_status:'HIT',network_calls:0};}catch{}}
 const reservationId=`EV2:${SOURCE}:${run_id}:${htxContract}:${Math.floor(now/TTL)}`;
 const wholeJobAdmission=typeof request_admit==='function'?request_admit({logical_request_id:reservationId,lane:'background',attempts:3}):{allowed:false,status:'WHOLE_JOB_HTTP_ADMISSION_REQUIRED'};
 if(!wholeJobAdmission.allowed)return{status:wholeJobAdmission.status,evidence:[],network_calls:0,whole_job_admission:wholeJobAdmission,internal_only:true};
 const admission=await reserve(db,{reservation_id:reservationId,attempts:3,now});
 if(!admission.allowed)return{status:admission.status,evidence:[],network_calls:0,admission,internal_only:true};
 const encoded=encodeURIComponent(htxContract),base='https://api.hbdm.com/linear-swap-api/v1';
 const state=await getJson(fetch_impl,`${base}/swap_api_state?contract_code=${encoded}`);await pause_impl(1000);
 const isolated=await getJson(fetch_impl,`${base}/swap_adjustfactor?contract_code=${encoded}`);await pause_impl(1000);
 const cross=await getJson(fetch_impl,`${base}/swap_cross_adjustfactor?contract_code=${encoded}`);
 const normalized=normalizeHtxPublicRisk({contract:htxContract,state_payload:state.ok?state.payload:null,isolated_payload:isolated.ok?isolated.payload:null,cross_payload:cross.ok?cross.payload:null,observed_ts:now});
 const result={version:HTX_PUBLIC_RISK_EVIDENCE_VERSION,...normalized,network_calls:3,cache_status:'REFRESHED',whole_job_admission:wholeJobAdmission,admission,receipts:[state,isolated,cross].map((row,index)=>({route:['STATE','ISOLATED','CROSS'][index],status:row.ok?'CLOSED':'SOURCE_ERROR',http_status:row.http_status??null,error:row.error??null})),internal_only:true};
 await db.prepare(`INSERT INTO report2_evidence_source_cache(source,asset_key,observed_ts,expires_ts,payload_json) VALUES(?1,?2,?3,?4,?5) ON CONFLICT(source,asset_key) DO UPDATE SET observed_ts=excluded.observed_ts,expires_ts=excluded.expires_ts,payload_json=excluded.payload_json`).bind(SOURCE,htxContract,now,now+TTL,JSON.stringify(result)).run();
 return result;
}

export default{HTX_PUBLIC_RISK_EVIDENCE_VERSION,normalizeHtxPublicRisk,collectHtxPublicRiskEvidence};
