import {buildEvidenceV2,SOURCE_POLICIES} from './evidence-source-adapters.mjs';

export const HTX_PUBLIC_RISK_EVIDENCE_VERSION='htx-public-risk-evidence-v4-exact-isolated-open-state-20261004';
const SOURCE='HTX_PUBLIC_RISK',TTL=SOURCE_POLICIES[SOURCE].ttl_ms,DAILY_CAP=SOURCE_POLICIES[SOURCE].daily_cap;
const GLOBAL_KEY='ALL_HTX_LINEAR_SWAPS_V2';
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

async function getJson(fetchImpl,url,clock){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
 try{const response=await fetchImpl(url,{headers:{accept:'application/json','user-agent':'My-Report-2/htx-risk-v1'},signal:controller.signal});const payload=await response.json().catch(()=>null);return{ok:response.ok&&payload?.status==='ok',http_status:response.status,payload,received_ts:clock()};}
 catch(error){return{ok:false,http_status:null,error:String(error?.name==='AbortError'?'TIMEOUT':error?.message||error).slice(0,160),payload:null};}
 finally{clearTimeout(timer);}
}

const rows=payload=>Array.isArray(payload?.data)?payload.data:payload?.data&&typeof payload.data==='object'?[payload.data]:[];
const matching=(payload,contract)=>rows(payload).filter(row=>contractOf(row?.contract_code)===contract);
const ladderCount=row=>Number.isSafeInteger(row?.ladder_count)?row.ladder_count:Array.isArray(row?.list)?row.list.reduce((n,x)=>n+(Array.isArray(x?.ladders)?x.ladders.length:0),0):1;
// The official endpoints accept an omitted contract_code. Cache one compact
// all-contract response and extract only the exact requested contract. The
// existing consumer needs counts, not the full multi-megabyte ladder arrays.
const compactPayload=(payload,state)=>({status:payload?.status,ts:payload?.ts,data:rows(payload).map(row=>state?{contract_code:row?.contract_code,margin_mode:row?.margin_mode,margin_account:row?.margin_account,open:row?.open}:{contract_code:row?.contract_code,margin_mode:row?.margin_mode,ladder_count:ladderCount(row)})});
export function normalizeHtxPublicRisk({contract,state_payload,isolated_payload,cross_payload,observed_ts=Date.now()}={}){
 const htxContract=contractOf(contract),stateRows=matching(state_payload,htxContract),isolatedRows=matching(isolated_payload,htxContract),crossRows=matching(cross_payload,htxContract);
 const stateRow=stateRows.length===1?stateRows[0]:null,openValue=finite(stateRow?.open),scopeClosed=stateRow?.margin_mode==='isolated'&&contractOf(stateRow?.margin_account)===htxContract,sourceTs=finite(state_payload?.ts),clockClosed=sourceTs!==null&&sourceTs<=observed_ts&&observed_ts-sourceTs<=TTL,stateClosed=Boolean(stateRow&&scopeClosed&&(openValue===0||openValue===1)&&clockClosed),explicitlyClosed=stateClosed&&openValue===0;
 const evidence=buildEvidenceV2({provider_id:SOURCE,upstream_id:'HTX_OFFICIAL_LINEAR_SWAP',asset_id:`htx-futures:${htxContract}`,htx_contract:htxContract,block_id:explicitlyClosed?'N08':'N09',metric_family:explicitlyClosed?'HTX_OPENING_RESTRICTED':'HTX_MARGIN_RISK_CONTEXT',origin_event_id:`${htxContract}:${sourceTs}`,dependency_group:`HTX_EXECUTION_RULES:${htxContract}:${sourceTs}`,source_ts:sourceTs,observed_ts,expires_at:clockClosed?sourceTs+TTL:observed_ts,directional_strength:null,risk_strength:stateClosed&&explicitlyClosed?1:null,coverage_status:stateClosed?'COMPLETE':'PARTIAL',coverage_fraction:stateClosed?1:0,validation_status:stateClosed?'VALID':'ERROR',validation_reason:stateClosed?null:!clockClosed?'HTX_SOURCE_CLOCK_NOT_CURRENT':!scopeClosed?'EXACT_ISOLATED_MARGIN_SCOPE_REQUIRED':'EXACT_BINARY_OPEN_ACCESS_REQUIRED',extra:{execution_open_allowed:stateClosed?!explicitlyClosed:null,execution_open_scope:'HTX_ISOLATED_MARGIN',execution_open_field:'open',execution_open_raw:stateClosed?openValue:null,margin_account:scopeClosed?htxContract:null,official_endpoint:'/linear-swap-api/v1/swap_api_state',isolated_ladder_count:isolatedRows.reduce((n,r)=>n+ladderCount(r),0),cross_ladder_count:crossRows.reduce((n,r)=>n+ladderCount(r),0),official_units_preserved:true,source_clock_closed:clockClosed,margin_context_complete:isolatedRows.length>0&&crossRows.length>0}});
 return{status:stateClosed?'CLOSED':'PARTIAL',contract:htxContract,evidence:[evidence],summary:{execution_open_allowed:evidence.execution_open_allowed,isolated_ladder_count:isolatedRows.length,cross_ladder_count:crossRows.length,margin_context_complete:evidence.margin_context_complete},internal_only:true};
}

export async function collectHtxPublicRiskEvidence({db,fetch_impl=globalThis.fetch,pause_impl=ms=>new Promise(resolve=>setTimeout(resolve,ms)),clock=Date.now,request_admit,contract,run_id,now=Date.now(),strict_fresh_manual=false}={}){
 if(!db)throw new Error('HTX_PUBLIC_RISK_DB_REQUIRED');const htxContract=contractOf(contract);if(!/^[^\s-]+-USDT$/u.test(htxContract))return{status:'EXACT_HTX_CONTRACT_REQUIRED',evidence:[],network_calls:0,internal_only:true};
 await install(db);const cached=await db.prepare(`SELECT payload_json FROM report2_evidence_source_cache WHERE source=?1 AND asset_key=?2 AND expires_ts>?3`).bind(SOURCE,htxContract,now).first();
 if(!strict_fresh_manual&&cached){try{const p=JSON.parse(cached.payload_json);if(p.version===HTX_PUBLIC_RISK_EVIDENCE_VERSION)return{...p,cache_status:'HIT',network_calls:0};}catch{}}
 const shared=await db.prepare(`SELECT payload_json FROM report2_evidence_source_cache WHERE source=?1 AND asset_key=?2 AND expires_ts>?3`).bind(SOURCE,GLOBAL_KEY,now).first();
 if(shared){try{
  const p=JSON.parse(shared.payload_json),sameRun=Boolean(text(run_id))&&p.run_id===text(run_id),received=finite(p.observed_ts);
  // One newly fetched all-contract response can serve both exact markets in
  // the same manual cycle. A previous run never satisfies manual freshness.
  const currentRunFresh=sameRun&&received!==null&&received<=now&&now-received<TTL;
  if(p.version===HTX_PUBLIC_RISK_EVIDENCE_VERSION&&(!strict_fresh_manual||currentRunFresh)){
   const normalized=normalizeHtxPublicRisk({contract:htxContract,...p.payloads,observed_ts:now});
   return{version:HTX_PUBLIC_RISK_EVIDENCE_VERSION,...normalized,cache_status:currentRunFresh?'CURRENT_RUN_SHARED_HIT':'SHARED_HIT',network_calls:0,check_completed:currentRunFresh&&normalized.status==='CLOSED',check_basis:currentRunFresh?'SAME_RUN_FRESH_HTTP_EXACT_CONTRACT':'VALID_SHARED_CACHE',receipts:p.receipts,shared_catalog_source_ts:p.source_ts,shared_response_run_id:p.run_id??null,internal_only:true};
  }
 }catch{}}
 const reservationId=`EV2:${SOURCE}:${run_id}:${GLOBAL_KEY}:${Math.floor(now/TTL)}`;
 const wholeJobAdmission=typeof request_admit==='function'?request_admit({logical_request_id:reservationId,lane:'background',attempts:3}):{allowed:false,status:'WHOLE_JOB_HTTP_ADMISSION_REQUIRED'};
 if(!wholeJobAdmission.allowed)return{status:wholeJobAdmission.status,evidence:[],network_calls:0,whole_job_admission:wholeJobAdmission,internal_only:true};
 const admission=await reserve(db,{reservation_id:reservationId,attempts:3,now});
 if(!admission.allowed)return{status:admission.status,evidence:[],network_calls:0,admission,internal_only:true};
 const base='https://api.hbdm.com/linear-swap-api/v1';
 const state=await getJson(fetch_impl,`${base}/swap_api_state`,clock);await pause_impl(1000);
 const isolated=await getJson(fetch_impl,`${base}/swap_adjustfactor`,clock);await pause_impl(1000);
 const cross=await getJson(fetch_impl,`${base}/swap_cross_adjustfactor`,clock);
 const observedTs=Math.max(now,...[state,isolated,cross].map(row=>finite(row.received_ts)??now));
 const normalized=normalizeHtxPublicRisk({contract:htxContract,state_payload:state.ok?state.payload:null,isolated_payload:isolated.ok?isolated.payload:null,cross_payload:cross.ok?cross.payload:null,observed_ts:observedTs});
 const result={version:HTX_PUBLIC_RISK_EVIDENCE_VERSION,...normalized,network_calls:3,cache_status:'REFRESHED',whole_job_admission:wholeJobAdmission,admission,receipts:[state,isolated,cross].map((row,index)=>({route:['STATE','ISOLATED','CROSS'][index],status:row.ok?'CLOSED':'SOURCE_ERROR',http_status:row.http_status??null,error:row.error??null,received_ts:row.received_ts??null})),internal_only:true};
 const clocks=[state,isolated,cross].map(r=>finite(r.payload?.ts));
 if([state,isolated,cross].every(r=>r.ok&&Array.isArray(r.payload?.data))&&clocks.every(ts=>ts!==null&&ts<=observedTs&&observedTs-ts<TTL)){
  const sourceTs=Math.min(...clocks),bundle={version:HTX_PUBLIC_RISK_EVIDENCE_VERSION,run_id:text(run_id),observed_ts:observedTs,source_ts:sourceTs,receipts:result.receipts,payloads:{state_payload:compactPayload(state.payload,true),isolated_payload:compactPayload(isolated.payload,false),cross_payload:compactPayload(cross.payload,false)}};
  await db.prepare(`INSERT INTO report2_evidence_source_cache(source,asset_key,observed_ts,expires_ts,payload_json) VALUES(?1,?2,?3,?4,?5) ON CONFLICT(source,asset_key) DO UPDATE SET observed_ts=excluded.observed_ts,expires_ts=excluded.expires_ts,payload_json=excluded.payload_json`).bind(SOURCE,GLOBAL_KEY,observedTs,sourceTs+TTL,JSON.stringify(bundle)).run();
 }
 if(normalized.status==='CLOSED')await db.prepare(`INSERT INTO report2_evidence_source_cache(source,asset_key,observed_ts,expires_ts,payload_json) VALUES(?1,?2,?3,?4,?5) ON CONFLICT(source,asset_key) DO UPDATE SET observed_ts=excluded.observed_ts,expires_ts=excluded.expires_ts,payload_json=excluded.payload_json`).bind(SOURCE,htxContract,observedTs,normalized.evidence[0].expires_at,JSON.stringify(result)).run();
 return result;
}

export default{HTX_PUBLIC_RISK_EVIDENCE_VERSION,normalizeHtxPublicRisk,collectHtxPublicRiskEvidence};
