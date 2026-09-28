import {buildEvidenceV2,SOURCE_POLICIES} from './evidence-source-adapters.mjs';
import {installEvidenceSourceStore,reserveEvidenceSourceAttempts,readEvidenceSourceCache,writeEvidenceSourceCache} from './evidence-source-store.mjs';

export const CHAIN_SUPPLY_EVIDENCE_VERSION='chain-supply-evidence-v1-20260928';
const SOURCE='CHAIN_RPC',TTL=SOURCE_POLICIES[SOURCE].ttl_ms,DAILY_CAP=SOURCE_POLICIES[SOURCE].daily_cap;
const EVM_ENDPOINTS=Object.freeze({ethereum:'https://ethereum-rpc.publicnode.com',bsc:'https://bsc-rpc.publicnode.com',arbitrum:'https://arbitrum-one-rpc.publicnode.com',base:'https://base-rpc.publicnode.com',polygon:'https://polygon-bor-rpc.publicnode.com',optimism:'https://optimism-rpc.publicnode.com',avalanche:'https://avalanche-c-chain-rpc.publicnode.com'});
const EVM_CHAIN_IDS=Object.freeze({ethereum:'0x1',bsc:'0x38',arbitrum:'0xa4b1',base:'0x2105',polygon:'0x89',optimism:'0xa',avalanche:'0xa86a'});
const text=value=>String(value??'').trim(),baseOf=contract=>text(contract).toUpperCase().replace(/-USDT$/,'');
const EVM=/^0x[0-9a-f]{40}$/i,BASE58=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value):null;
const unsigned=value=>/^\d+$/.test(text(value))?BigInt(text(value)):null;

function exactIdentity(identity){
 const chain=text(identity?.chain).toLowerCase(),address=text(identity?.contract_or_mint);
 if(chain==='solana'&&BASE58.test(address))return{chain,address};
 if(EVM_ENDPOINTS[chain]&&EVM.test(address))return{chain,address:address.toLowerCase()};
 return null;
}

async function postRpc(fetchImpl,url,method,params){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
 try{const response=await fetchImpl(url,{method:'POST',headers:{accept:'application/json','content-type':'application/json','user-agent':'My-Report-2/chain-supply-v1'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:controller.signal});const payload=await response.json().catch(()=>null);return{ok:response.ok&&!payload?.error,http_status:response.status,payload,error:response.ok&&!payload?.error?null:`HTTP_OR_RPC_${response.status}`};}
 catch(error){return{ok:false,http_status:null,payload:null,error:String(error?.name==='AbortError'?'TIMEOUT':error?.message||error).slice(0,160)};}
 finally{clearTimeout(timer);}
}

export function normalizeChainSupply({contract,identity,current,previous=null,observed_ts=Date.now()}={}){
 const htxContract=text(contract).toUpperCase(),id=exactIdentity(identity);if(!id)return{status:'EXACT_ASSET_IDENTITY_REQUIRED',evidence:[],internal_only:true};
 const sameAddress=id.chain==='solana'?id.address===text(previous?.address):id.address.toLowerCase()===text(previous?.address).toLowerCase();
 const currentValue=unsigned(current?.supply),samePrevious=id.chain===text(previous?.chain).toLowerCase()&&sameAddress&&Number(previous?.decimals)===Number(current?.decimals),previousValue=samePrevious?unsigned(previous?.supply):null;
 if(currentValue===null)return{status:'SOURCE_SCHEMA_ERROR',evidence:[],internal_only:true};
 const delta=previousValue===null?null:currentValue-previousValue,metric=delta===null?'TOTAL_SUPPLY_OBSERVATION':delta>0n?'SUPPLY_INCREASE':delta<0n?'SUPPLY_DECREASE':'SUPPLY_UNCHANGED',block=delta!==null&&delta<0n?'N03':'N02';
 const sourceTs=finite(current?.source_ts)??observed_ts,origin=`${id.chain}:${id.address}:${text(current?.block_ref)||sourceTs}`;
 const evidence=buildEvidenceV2({provider_id:SOURCE,upstream_id:id.chain==='solana'?'SOLANA_MAINNET_RPC':'PUBLICNODE_RPC',asset_id:`${id.chain}:${id.address}`,htx_contract:htxContract,block_id:block,metric_family:metric,origin_event_id:origin,dependency_group:`CHAIN_SUPPLY:${id.chain}:${id.address}:${text(current?.block_ref)||sourceTs}`,source_ts:sourceTs,observed_ts,expires_at:observed_ts+TTL,directional_strength:null,risk_strength:null,coverage_status:delta===null?'CONTEXT_ONLY':'PARTIAL',coverage_fraction:0,finality_status:current?.finalized===true?'FINAL':'PROVISIONAL',validation_status:'VALID',extra:{chain:id.chain,token_address:id.address,total_supply_base_units:text(current.supply),previous_supply_base_units:previousValue===null?null:text(previous.supply),supply_delta_base_units:delta===null?null:String(delta),decimals:Number.isInteger(Number(current?.decimals))?Number(current.decimals):null,block_ref:text(current?.block_ref)||null,identity_method:text(identity?.identity_method)||null,direction_policy:'SUPPLY_OBSERVATION_ONLY_UNTIL_MATCHED_FINALIZED_TRANSACTION'}});
 return{status:'CLOSED',contract:htxContract,evidence:[evidence],summary:{chain:id.chain,total_supply_base_units:text(current.supply),supply_delta_base_units:evidence.supply_delta_base_units,decimals:evidence.decimals,finalized:evidence.finality_status==='FINAL'},current_observation:{chain:id.chain,address:id.address,supply:text(current.supply),decimals:evidence.decimals,block_ref:evidence.block_ref,source_ts:sourceTs},internal_only:true};
}

async function fetchSupply(fetchImpl,id){
 if(id.chain==='solana'){
  const row=await postRpc(fetchImpl,'https://api.mainnet-beta.solana.com','getTokenSupply',[id.address,{commitment:'finalized'}]),value=row?.payload?.result?.value,amount=/^\d+$/.test(text(value?.amount))?text(value.amount):null;
  return{receipts:[{route:'SOLANA_GET_TOKEN_SUPPLY',...row}],attempts:1,current:row.ok&&amount!==null?{supply:amount,decimals:Number(value.decimals),block_ref:row.payload?.result?.context?.slot,source_ts:Date.now(),finalized:true}:null};
 }
 const endpoint=EVM_ENDPOINTS[id.chain],chainRow=await postRpc(fetchImpl,endpoint,'eth_chainId',[]),blockRow=await postRpc(fetchImpl,endpoint,'eth_getBlockByNumber',['finalized',false]);
 const blockRef=text(blockRow?.payload?.result?.number),supplyRow=chainRow.ok&&text(chainRow?.payload?.result).toLowerCase()===EVM_CHAIN_IDS[id.chain]&&blockRow.ok&&/^0x[0-9a-f]+$/i.test(blockRef)?await postRpc(fetchImpl,endpoint,'eth_call',[{to:id.address,data:'0x18160ddd'},blockRef]):{ok:false,http_status:null,payload:null,error:'CHAIN_OR_FINALIZED_BLOCK_NOT_VERIFIED'};
 const raw=text(supplyRow?.payload?.result),supply=/^0x[0-9a-f]+$/i.test(raw)?BigInt(raw).toString():null;
 return{receipts:[{route:'EVM_CHAIN_ID',...chainRow},{route:'EVM_FINALIZED_BLOCK',...blockRow},{route:'EVM_TOTAL_SUPPLY',...supplyRow}],attempts:3,current:supplyRow.ok&&supply!==null?{supply,decimals:0,block_ref:blockRef,source_ts:Number.parseInt(text(blockRow?.payload?.result?.timestamp),16)*1000,finalized:true}:null};
}

export async function collectChainSupplyEvidence({db,fetch_impl=globalThis.fetch,request_admit,contract,run_id,asset_identity,identity_method=null,now=Date.now()}={}){
 if(!db)throw new Error('CHAIN_SUPPLY_DB_REQUIRED');const htxContract=text(contract).toUpperCase(),id=exactIdentity(asset_identity);
 if(!/^[^\s-]+-USDT$/u.test(htxContract)||!id)return{status:'EXACT_ASSET_IDENTITY_REQUIRED',evidence:[],network_calls:0,internal_only:true};
 await installEvidenceSourceStore(db);const assetKey=id.chain==='solana'?`${id.chain}:${id.address}`:`${id.chain}:${id.address}`.toLowerCase(),cached=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:assetKey,now});if(cached)return{...cached,contract:htxContract};
 const previousRow=await db.prepare(`SELECT payload_json FROM report2_evidence_source_cache WHERE source=?1 AND asset_key=?2 LIMIT 1`).bind(SOURCE,assetKey).first();let previous=null;try{previous=JSON.parse(previousRow?.payload_json||'null')?.current_observation||null;}catch{}
 const attempts=id.chain==='solana'?1:3,reservationId=`EV2:${SOURCE}:${run_id}:${assetKey}:${Math.floor(now/TTL)}`,wholeJobAdmission=typeof request_admit==='function'?request_admit({logical_request_id:reservationId,lane:'background',attempts}):{allowed:false,status:'WHOLE_JOB_HTTP_ADMISSION_REQUIRED'};
 if(!wholeJobAdmission.allowed)return{status:wholeJobAdmission.status,evidence:[],network_calls:0,whole_job_admission:wholeJobAdmission,internal_only:true};
 const admission=await reserveEvidenceSourceAttempts(db,{source:SOURCE,reservation_id:reservationId,attempts,daily_cap:DAILY_CAP,now});if(!admission.allowed)return{status:admission.status,evidence:[],network_calls:0,admission,internal_only:true};
 const fetched=await fetchSupply(fetch_impl,id),normalized=normalizeChainSupply({contract:htxContract,identity:{...id,contract_or_mint:id.address,identity_method},current:fetched.current,previous,observed_ts:now});
 const result={version:CHAIN_SUPPLY_EVIDENCE_VERSION,...normalized,network_calls:fetched.attempts,cache_status:'REFRESHED',whole_job_admission:wholeJobAdmission,admission,receipts:fetched.receipts.map(({route,ok,http_status,error})=>({route,status:ok?'CLOSED':'SOURCE_ERROR',http_status,error:error??null})),internal_only:true};
 if(fetched.current)await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:assetKey,observed_ts:now,expires_ts:now+TTL,payload:result});return result;
}

export default{normalizeChainSupply,collectChainSupplyEvidence};
