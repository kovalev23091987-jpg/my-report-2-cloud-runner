import {buildEvidenceV2,SOURCE_POLICIES} from './evidence-source-adapters.mjs';
import {installEvidenceSourceStore,reserveEvidenceSourceAttempts,readEvidenceSourceCache,writeEvidenceSourceCache} from './evidence-source-store.mjs';

export const SNAPSHOT_GOVERNANCE_EVIDENCE_VERSION='snapshot-governance-evidence-v1-20260928';
const SOURCE='SNAPSHOT_GOVERNANCE',TTL=SOURCE_POLICIES[SOURCE].ttl_ms,DAILY_CAP=SOURCE_POLICIES[SOURCE].daily_cap,ENDPOINT='https://hub.snapshot.org/graphql';
const QUERY=`query Report2Governance($spaces: [String!]!) { proposals(first: 20, skip: 0, where: { space_in: $spaces }, orderBy: "created", orderDirection: desc) { id title start end state created updated choices space { id name } } }`;
const text=value=>String(value??'').trim(),finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value):null;
const validSpace=value=>/^[a-z0-9][a-z0-9._-]{1,99}$/i.test(text(value));

async function postJson(fetchImpl,body){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
 try{const response=await fetchImpl(ENDPOINT,{method:'POST',headers:{accept:'application/json','content-type':'application/json','user-agent':'My-Report-2/snapshot-governance-v1'},body:JSON.stringify(body),signal:controller.signal});const payload=await response.json().catch(()=>null),graphError=Array.isArray(payload?.errors)&&payload.errors.length;return{ok:response.ok&&!graphError,http_status:response.status,payload,error:response.ok&&!graphError?null:graphError?'GRAPHQL_ERROR':`HTTP_${response.status}`};}
 catch(error){return{ok:false,http_status:null,payload:null,error:String(error?.name==='AbortError'?'TIMEOUT':error?.message||error).slice(0,160)};}
 finally{clearTimeout(timer);}
}

export function normalizeSnapshotGovernance({contract,asset_metadata,payload,observed_ts=Date.now()}={}){
 const htxContract=text(contract).toUpperCase(),space=text(asset_metadata?.snapshot_space).toLowerCase();
 if(!/^[^\s-]+-USDT$/u.test(htxContract)||!validSpace(space))return{status:'EXACT_SNAPSHOT_SPACE_REQUIRED',evidence:[],summary:null,internal_only:true};
 const raw=Array.isArray(payload?.data?.proposals)?payload.data.proposals:[],exact=raw.filter(row=>text(row?.space?.id).toLowerCase()===space),fresh=exact.filter(row=>{const end=finite(row?.end);return end!==null&&end*1000>=observed_ts-24*60*60_000;});
 if(raw.length&&!exact.length)return{status:'SNAPSHOT_SPACE_IDENTITY_MISMATCH',evidence:[],summary:{space,returned:raw.length,exact:0},internal_only:true};
 if(!raw.length)return{status:'EMPTY',evidence:[],summary:{space,returned:0,exact:0},internal_only:true};
 if(!fresh.length)return{status:'STALE_SOURCE',evidence:[],summary:{space,returned:raw.length,exact:exact.length},internal_only:true};
 const evidence=fresh.map(row=>{const start=(finite(row.start)||0)*1000,end=(finite(row.end)||0)*1000,created=(finite(row.created)||0)*1000,updated=(finite(row.updated)||0)*1000,sourceTs=Math.min(observed_ts,Math.max(created,updated)||observed_ts);return buildEvidenceV2({provider_id:SOURCE,upstream_id:'SNAPSHOT_HUB_GRAPHQL',asset_id:`snapshot:${space}`,htx_contract:htxContract,block_id:'N13',metric_family:'GOVERNANCE_PROPOSAL_WINDOW',origin_event_id:text(row.id),dependency_group:`SNAPSHOT_PROPOSAL:${space}:${text(row.id)}`,source_ts:sourceTs,observed_ts,effective_from:start||null,effective_to:end||null,expires_at:Math.max(observed_ts+TTL,end||0),directional_strength:null,risk_strength:null,coverage_status:'COMPLETE',coverage_fraction:1,validation_status:text(row.id)?'VALID':'ERROR',validation_reason:text(row.id)?null:'PROPOSAL_ID_REQUIRED',extra:{snapshot_space:space,proposal_id:text(row.id),proposal_title:text(row.title).slice(0,240),proposal_state:text(row.state).toLowerCase(),proposal_start:start||null,proposal_end:end||null,choice_count:Array.isArray(row.choices)?row.choices.length:0,vote_result_not_execution:true,onchain_execution_status:'NOT_VERIFIED',direction_policy:'CALENDAR_CONTEXT_ONLY_NO_DIRECTIONAL_VOTE'}});});
 return{status:'CLOSED',contract:htxContract,evidence,summary:{space,returned:raw.length,exact:exact.length,fresh:fresh.length},internal_only:true};
}

export async function collectSnapshotGovernanceEvidence({db,fetch_impl=globalThis.fetch,request_admit,contract,run_id,asset_metadata,now=Date.now()}={}){
 if(!db)throw new Error('SNAPSHOT_GOVERNANCE_DB_REQUIRED');const htxContract=text(contract).toUpperCase(),space=text(asset_metadata?.snapshot_space).toLowerCase();
 if(!/^[^\s-]+-USDT$/u.test(htxContract)||!validSpace(space))return{status:'EXACT_SNAPSHOT_SPACE_REQUIRED',evidence:[],network_calls:0,internal_only:true};
 await installEvidenceSourceStore(db);const assetKey=`SPACE:${space}`,cached=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:assetKey,now});if(cached)return{...cached,contract:htxContract};
 const reservationId=`EV2:${SOURCE}:${run_id}:${space}:${Math.floor(now/TTL)}`,wholeJobAdmission=typeof request_admit==='function'?request_admit({logical_request_id:reservationId,lane:'background',attempts:1}):{allowed:false,status:'WHOLE_JOB_HTTP_ADMISSION_REQUIRED'};if(!wholeJobAdmission.allowed)return{status:wholeJobAdmission.status,evidence:[],network_calls:0,whole_job_admission:wholeJobAdmission,internal_only:true};
 const admission=await reserveEvidenceSourceAttempts(db,{source:SOURCE,reservation_id:reservationId,attempts:1,daily_cap:DAILY_CAP,now});if(!admission.allowed)return{status:admission.status,evidence:[],network_calls:0,admission,internal_only:true};
 const raw=await postJson(fetch_impl,{query:QUERY,variables:{spaces:[space]}}),normalized=raw.ok?normalizeSnapshotGovernance({contract:htxContract,asset_metadata:{snapshot_space:space},payload:raw.payload,observed_ts:now}):{status:'SOURCE_ERROR',contract:htxContract,evidence:[],summary:null,internal_only:true};
 const result={version:SNAPSHOT_GOVERNANCE_EVIDENCE_VERSION,...normalized,network_calls:1,cache_status:'REFRESHED',whole_job_admission:wholeJobAdmission,admission,receipts:[{route:'PROPOSALS_PAGE_1',status:raw.ok?'CLOSED':'SOURCE_ERROR',http_status:raw.http_status,error:raw.error}],internal_only:true};
 if(raw.ok&&normalized.status!=='SNAPSHOT_SPACE_IDENTITY_MISMATCH')await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:assetKey,observed_ts:now,expires_ts:now+TTL,payload:result});return result;
}

export default{normalizeSnapshotGovernance,collectSnapshotGovernanceEvidence};
