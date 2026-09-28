import {buildEvidenceV2,SOURCE_POLICIES} from './evidence-source-adapters.mjs';
import {installEvidenceSourceStore,reserveEvidenceSourceAttempts,readEvidenceSourceCache,writeEvidenceSourceCache} from './evidence-source-store.mjs';

export const SOURCIFY_ABI_EVIDENCE_VERSION='sourcify-abi-evidence-v1-20260928';
const SOURCE='SOURCIFY_ABI',TTL=SOURCE_POLICIES[SOURCE].ttl_ms,DAILY_CAP=SOURCE_POLICIES[SOURCE].daily_cap;
const CHAIN_IDS=Object.freeze({ethereum:'1',bsc:'56',arbitrum:'42161',base:'8453',polygon:'137',optimism:'10',avalanche:'43114'});
const text=value=>String(value??'').trim(),EVM=/^0x[0-9a-f]{40}$/i;

function exactIdentity(identity){const chain=text(identity?.chain).toLowerCase(),address=text(identity?.contract_or_mint);return CHAIN_IDS[chain]&&EVM.test(address)?{chain,chain_id:CHAIN_IDS[chain],address:address.toLowerCase()}:null;}
async function getJson(fetchImpl,url){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
 try{const response=await fetchImpl(url,{headers:{accept:'application/json','user-agent':'My-Report-2/sourcify-abi-v1'},signal:controller.signal});const payload=await response.json().catch(()=>null);return{ok:response.ok,http_status:response.status,payload,error:response.ok?null:`HTTP_${response.status}`};}
 catch(error){return{ok:false,http_status:null,payload:null,error:String(error?.name==='AbortError'?'TIMEOUT':error?.message||error).slice(0,160)};}
 finally{clearTimeout(timer);}
}

export function normalizeSourcifyAbi({contract,identity,payload,observed_ts=Date.now()}={}){
 const htxContract=text(contract).toUpperCase(),id=exactIdentity(identity);if(!id)return{status:'EXACT_EVM_IDENTITY_REQUIRED',evidence:[],internal_only:true};
 const responseChain=text(payload?.chainId),responseAddress=text(payload?.address).toLowerCase(),abi=Array.isArray(payload?.abi)?payload.abi:[],match=text(payload?.match).toLowerCase(),identityOk=responseChain===id.chain_id&&responseAddress===id.address,verified=identityOk&&['match','exact_match'].includes(match)&&abi.length>0;
 if(!verified)return{status:'NOT_VERIFIED_OR_IDENTITY_MISMATCH',evidence:[],summary:{identity_match:identityOk,match:match||null,abi_items:abi.length},internal_only:true};
 const functions=new Set(abi.filter(row=>text(row?.type).toLowerCase()==='function').map(row=>text(row?.name))),events=new Set(abi.filter(row=>text(row?.type).toLowerCase()==='event').map(row=>text(row?.name)));
 const verifiedAt=Date.parse(text(payload?.verifiedAt)),sourceTs=Number.isFinite(verifiedAt)?verifiedAt:observed_ts;
 const evidence=buildEvidenceV2({provider_id:SOURCE,upstream_id:'SOURCIFY_SERVER_V2',asset_id:`${id.chain}:${id.address}`,htx_contract:htxContract,block_id:'N17',metric_family:'VERIFIED_CONTRACT_ABI',origin_event_id:`${id.chain_id}:${id.address}:${text(payload?.matchId)||sourceTs}`,dependency_group:`CONTRACT_SCHEMA:${id.chain_id}:${id.address}:${text(payload?.matchId)||sourceTs}`,source_ts:sourceTs,observed_ts,expires_at:observed_ts+TTL,directional_strength:null,risk_strength:null,coverage_status:'COMPLETE',coverage_fraction:1,validation_status:'VALID',extra:{chain:id.chain,chain_id:id.chain_id,token_address:id.address,verification_match:match,match_id:text(payload?.matchId)||null,verified_at:text(payload?.verifiedAt)||null,abi_item_count:abi.length,has_total_supply:functions.has('totalSupply'),has_mint_function:[...functions].some(name=>/mint/i.test(name)),has_burn_function:[...functions].some(name=>/burn/i.test(name)),has_transfer_event:events.has('Transfer'),direction_policy:'SCHEMA_QUALITY_ONLY_NO_MARKET_VOTE'}});
 return{status:'CLOSED',contract:htxContract,evidence:[evidence],summary:{chain:id.chain,verification_match:match,abi_items:abi.length,has_total_supply:evidence.has_total_supply,has_transfer_event:evidence.has_transfer_event},internal_only:true};
}

export async function collectSourcifyAbiEvidence({db,fetch_impl=globalThis.fetch,request_admit,contract,run_id,asset_identity,now=Date.now()}={}){
 if(!db)throw new Error('SOURCIFY_ABI_DB_REQUIRED');const htxContract=text(contract).toUpperCase(),id=exactIdentity(asset_identity);
 if(!/^[^\s-]+-USDT$/u.test(htxContract)||!id)return{status:'EXACT_EVM_IDENTITY_REQUIRED',evidence:[],network_calls:0,internal_only:true};
 await installEvidenceSourceStore(db);const assetKey=`${id.chain_id}:${id.address}`,cached=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:assetKey,now});if(cached)return{...cached,contract:htxContract};
 const reservationId=`EV2:${SOURCE}:${run_id}:${assetKey}:${Math.floor(now/TTL)}`,wholeJobAdmission=typeof request_admit==='function'?request_admit({logical_request_id:reservationId,lane:'background',attempts:1}):{allowed:false,status:'WHOLE_JOB_HTTP_ADMISSION_REQUIRED'};
 if(!wholeJobAdmission.allowed)return{status:wholeJobAdmission.status,evidence:[],network_calls:0,whole_job_admission:wholeJobAdmission,internal_only:true};
 const admission=await reserveEvidenceSourceAttempts(db,{source:SOURCE,reservation_id:reservationId,attempts:1,daily_cap:DAILY_CAP,now});if(!admission.allowed)return{status:admission.status,evidence:[],network_calls:0,admission,internal_only:true};
 const raw=await getJson(fetch_impl,`https://sourcify.dev/server/v2/contract/${id.chain_id}/${id.address}?fields=abi`),normalized=normalizeSourcifyAbi({contract:htxContract,identity:asset_identity,payload:raw.ok?raw.payload:null,observed_ts:now});
 const result={version:SOURCIFY_ABI_EVIDENCE_VERSION,...normalized,network_calls:1,cache_status:'REFRESHED',whole_job_admission:wholeJobAdmission,admission,receipts:[{route:'CONTRACT_ABI',status:raw.ok?'CLOSED':'SOURCE_ERROR',http_status:raw.http_status,error:raw.error??null}],internal_only:true};
 if(raw.ok)await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:assetKey,observed_ts:now,expires_ts:now+TTL,payload:result});return result;
}

export default{normalizeSourcifyAbi,collectSourcifyAbiEvidence};
