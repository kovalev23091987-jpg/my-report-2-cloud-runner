import {fetchSolanaNativeSupply,SOLANA_MAINNET_GENESIS} from './solana-native-supply.mjs';
import {buildEvidenceV2,SOURCE_POLICIES} from './evidence-source-adapters.mjs';
import {installEvidenceSourceStore,reserveEvidenceSourceAttempts,readEvidenceSourceCache,writeEvidenceSourceCache} from './evidence-source-store.mjs';

export const CHAIN_SUPPLY_EVIDENCE_VERSION='chain-supply-evidence-v6-native-solana-20261004';
const SOURCE='CHAIN_RPC',TTL=SOURCE_POLICIES[SOURCE].ttl_ms,DAILY_CAP=SOURCE_POLICIES[SOURCE].daily_cap;
const EVM_ENDPOINTS=Object.freeze({ethereum:'https://ethereum-rpc.publicnode.com',bsc:'https://bsc-rpc.publicnode.com',arbitrum:'https://arbitrum-one-rpc.publicnode.com',base:'https://base-rpc.publicnode.com',polygon:'https://polygon-bor-rpc.publicnode.com',optimism:'https://optimism-rpc.publicnode.com',avalanche:'https://avalanche-c-chain-rpc.publicnode.com'});
const EVM_CHAIN_IDS=Object.freeze({ethereum:'0x1',bsc:'0x38',arbitrum:'0xa4b1',base:'0x2105',polygon:'0x89',optimism:'0xa',avalanche:'0xa86a'});
const text=value=>String(value??'').trim(),baseOf=contract=>text(contract).toUpperCase().replace(/-USDT$/,'');
const EVM=/^0x[0-9a-f]{40}$/i,BASE58=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value):null;
const unsigned=value=>/^\d+$/.test(text(value))?BigInt(text(value)):null;
const decimalsOf=value=>{const n=finite(value);return Number.isSafeInteger(n)&&n>=0&&n<=255?n:null;};

function exactIdentity(identity){
 const chain=text(identity?.chain).toLowerCase(),address=text(identity?.contract_or_mint);
 if(['near','solana'].includes(chain)&&identity?.asset_kind==='NATIVE'&&identity?.native_asset_id===`${chain}:mainnet`&&(!address||address==='native:mainnet'))return{chain,address:'native:mainnet',asset_kind:'NATIVE',native_asset_id:`${chain}:mainnet`};
 if(chain==='solana'&&BASE58.test(address))return{chain,address};
 if(EVM_ENDPOINTS[chain]&&EVM.test(address))return{chain,address:address.toLowerCase()};
 return null;
}

async function postRpc(fetchImpl,url,method,params){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
 try{const response=await fetchImpl(url,{method:'POST',headers:{accept:'application/json','content-type':'application/json','user-agent':'My-Report-2/chain-supply-v1'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:controller.signal});const payload=await response.json().catch(()=>null);return{network_calls:1,ok:response.ok&&!payload?.error,http_status:response.status,payload,error:response.ok&&!payload?.error?null:`HTTP_OR_RPC_${response.status}`};}
 catch(error){return{network_calls:1,ok:false,http_status:null,payload:null,error:String(error?.name==='AbortError'?'TIMEOUT':error?.message||error).slice(0,160)};}
 finally{clearTimeout(timer);}
}

export function normalizeChainSupply({contract,identity,current,previous=null,observed_ts=Date.now()}={}){
 const htxContract=text(contract).toUpperCase(),id=exactIdentity(identity);if(!id)return{status:'EXACT_ASSET_IDENTITY_REQUIRED',evidence:[],internal_only:true};
 if(id.asset_kind==='NATIVE'&&htxContract!==(id.chain==='near'?'NEAR-USDT':'SOL-USDT'))return{status:'EXACT_ASSET_IDENTITY_REQUIRED',evidence:[],internal_only:true};
 const sameAddress=id.chain==='solana'?id.address===text(previous?.address):id.address.toLowerCase()===text(previous?.address).toLowerCase();
 const sourceTs=finite(current?.source_ts),priorTs=finite(previous?.source_ts),chronological=priorTs!==null&&sourceTs!==null&&priorTs<sourceTs&&text(previous?.block_ref)!==''&&text(current?.block_ref)!==''&&text(previous.block_ref)!==text(current.block_ref)&&previous?.finalized===true;
 const decimals=decimalsOf(current?.decimals),currentValue=unsigned(current?.supply),samePrevious=chronological&&decimals!==null&&id.chain===text(previous?.chain).toLowerCase()&&sameAddress&&decimalsOf(previous?.decimals)===decimals,previousValue=samePrevious?unsigned(previous?.supply):null;
 if(id.asset_kind==='NATIVE'&&id.chain==='solana'&&(current?.genesis_hash!==SOLANA_MAINNET_GENESIS||current?.commitment!=='finalized'||current?.decimals!==9))return{status:'SOLANA_MAINNET_SUPPLY_PROOF_REQUIRED',evidence:[],internal_only:true};
 if(currentValue===null)return{status:'SOURCE_SCHEMA_ERROR',evidence:[],internal_only:true};
 if(current?.finalized!==true)return{status:'SOURCE_FINALITY_NOT_CLOSED',evidence:[],internal_only:true};
 const delta=previousValue===null?null:currentValue-previousValue,metric=delta===null?'TOTAL_SUPPLY_OBSERVATION':delta>0n?'SUPPLY_INCREASE':delta<0n?'SUPPLY_DECREASE':'SUPPLY_UNCHANGED',block=delta!==null&&delta<0n?'N03':'N02';
 const origin=`${id.chain}:${id.address}:${text(current?.block_ref)||sourceTs}`;
 if(sourceTs===null||sourceTs>observed_ts)return{status:'SOURCE_CLOCK_NOT_CLOSED',contract:htxContract,evidence:[],internal_only:true};
 if(observed_ts-sourceTs>TTL)return{status:'STALE_FINALIZED_SUPPLY',contract:htxContract,evidence:[],internal_only:true};
 const evidence=buildEvidenceV2({provider_id:SOURCE,upstream_id:id.chain==='near'?'NEAR_MAINNET_RPC':id.chain==='solana'?'SOLANA_MAINNET_RPC':'PUBLICNODE_RPC',asset_id:`${id.chain}:${id.address}`,htx_contract:htxContract,block_id:block,metric_family:metric,origin_event_id:origin,dependency_group:`CHAIN_SUPPLY:${id.chain}:${id.address}:${text(current?.block_ref)||sourceTs}`,source_ts:sourceTs,observed_ts,expires_at:observed_ts+TTL,directional_strength:null,risk_strength:null,coverage_status:delta===null?'CONTEXT_ONLY':'PARTIAL',coverage_fraction:0,finality_status:'FINAL',validation_status:'VALID',extra:{chain:id.chain,token_address:id.asset_kind==='NATIVE'?null:id.address,asset_kind:id.asset_kind||'TOKEN',native_asset_id:id.native_asset_id||null,genesis_hash:current?.genesis_hash||null,commitment:current?.commitment||null,total_supply_base_units:text(current.supply),previous_supply_base_units:previousValue===null?null:text(previous.supply),supply_delta_base_units:delta===null?null:String(delta),decimals,block_ref:text(current?.block_ref)||null,previous_source_ts:previousValue===null?null:priorTs,previous_block_ref:previousValue===null?null:text(previous.block_ref),comparison_policy:'EXACT_ASSET_DECIMALS_DISTINCT_BLOCK_INCREASING_CLOCK',identity_method:text(identity?.identity_method)||null,direction_policy:'SUPPLY_OBSERVATION_ONLY_UNTIL_MATCHED_FINALIZED_TRANSACTION'}});
 return{status:'CLOSED',contract:htxContract,evidence:[evidence],summary:{chain:id.chain,total_supply_base_units:text(current.supply),supply_delta_base_units:evidence.supply_delta_base_units,decimals:evidence.decimals,finalized:true},current_observation:{chain:id.chain,address:id.address,supply:text(current.supply),decimals:evidence.decimals,block_ref:evidence.block_ref,source_ts:sourceTs,finalized:true},internal_only:true};
}

// Two read-only calls at the same finalized block, one HTTP transport. Batch
// responses are matched by id, never by response order. No transaction is sent.
async function fetchEvmTokenState(fetchImpl,url,address,blockRef){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
 try{
  const response=await fetchImpl(url,{method:'POST',headers:{accept:'application/json','content-type':'application/json'},body:JSON.stringify(['0x18160ddd','0x313ce567'].map((data,index)=>({jsonrpc:'2.0',id:index+1,method:'eth_call',params:[{to:address,data},blockRef]}))),signal:controller.signal});
  const rows=await response.json().catch(()=>null),supply=Array.isArray(rows)?rows.filter(r=>r?.id===1):[],decimalRows=Array.isArray(rows)?rows.filter(r=>r?.id===2):[];
  const valid=response.ok&&supply.length===1&&!supply[0]?.error&&/^0x[0-9a-f]+$/i.test(text(supply[0]?.result));
  const rawDecimals=decimalRows.length===1&&!decimalRows[0]?.error&&/^0x[0-9a-f]+$/i.test(text(decimalRows[0]?.result))?BigInt(decimalRows[0].result):null;
  return{network_calls:1,ok:valid,http_status:response.status,payload:valid?{result:supply[0].result}:null,decimals:rawDecimals!==null&&rawDecimals<=255n?Number(rawDecimals):null,error:valid?null:'EXACT_BATCH_SUPPLY_RESPONSE_REQUIRED'};
 }catch(error){return{network_calls:1,ok:false,http_status:null,payload:null,decimals:null,error:String(error?.message||error).slice(0,120)};}finally{clearTimeout(timer);}
}

async function fetchSupply(fetchImpl,id){
 if(id.chain==='solana'&&id.asset_kind==='NATIVE')return fetchSolanaNativeSupply(fetchImpl);
 if(id.chain==='near'){
  const endpoint='https://rpc.mainnet.near.org',statusRow=await postRpc(fetchImpl,endpoint,'status',[]),status=statusRow?.payload?.result;
  const blockRow=statusRow.ok&&status?.chain_id==='mainnet'&&status?.sync_info?.syncing===false?await postRpc(fetchImpl,endpoint,'block',{finality:'final'}):{network_calls:0,ok:false,payload:null,error:'NEAR_MAINNET_READY_NODE_REQUIRED'};
  const header=blockRow?.payload?.result?.header,ns=unsigned(header?.timestamp_nanosec),millis=ns===null?null:ns/1000000n;
  const valid=blockRow.ok&&unsigned(header?.total_supply)!==null&&BASE58.test(text(header?.hash))&&Number.isSafeInteger(header?.height)&&header.height>=0&&millis!==null&&millis>0n&&millis<=BigInt(Number.MAX_SAFE_INTEGER);
  return{receipts:[{route:'NEAR_MAINNET_STATUS',...statusRow},{route:'NEAR_FINALIZED_NATIVE_SUPPLY',...blockRow}],attempts:statusRow.network_calls+blockRow.network_calls,current:valid?{supply:text(header.total_supply),decimals:24,block_ref:header.hash,source_ts:Number(millis),finalized:true}:null};
 }
 if(id.chain==='solana'){
  const row=await postRpc(fetchImpl,'https://api.mainnet-beta.solana.com','getTokenSupply',[id.address,{commitment:'finalized'}]),value=row?.payload?.result?.value,amount=/^\d+$/.test(text(value?.amount))?text(value.amount):null;
  const slot=finite(row?.payload?.result?.context?.slot),clockRow=row.ok&&Number.isSafeInteger(slot)?await postRpc(fetchImpl,'https://api.mainnet-beta.solana.com','getBlockTime',[slot]):{network_calls:0,ok:false,payload:null,error:'EXACT_SLOT_REQUIRED'},sourceSeconds=clockRow.ok?finite(clockRow?.payload?.result):null;
  return{receipts:[{route:'SOLANA_GET_TOKEN_SUPPLY',...row},{route:'SOLANA_SLOT_CLOCK',...clockRow}],attempts:row.network_calls+clockRow.network_calls,current:row.ok&&amount!==null?{supply:amount,decimals:decimalsOf(value.decimals),block_ref:slot,source_ts:sourceSeconds===null?null:sourceSeconds*1000,finalized:true}:null};
 }
 const endpoint=EVM_ENDPOINTS[id.chain],chainRow=await postRpc(fetchImpl,endpoint,'eth_chainId',[]),blockRow=await postRpc(fetchImpl,endpoint,'eth_getBlockByNumber',['finalized',false]);
 const blockRef=text(blockRow?.payload?.result?.number),supplyRow=chainRow.ok&&text(chainRow?.payload?.result).toLowerCase()===EVM_CHAIN_IDS[id.chain]&&blockRow.ok&&/^0x[0-9a-f]+$/i.test(blockRef)?await fetchEvmTokenState(fetchImpl,endpoint,id.address,blockRef):{network_calls:0,ok:false,http_status:null,payload:null,error:'CHAIN_OR_FINALIZED_BLOCK_NOT_VERIFIED'};
 const raw=text(supplyRow?.payload?.result),supply=/^0x[0-9a-f]+$/i.test(raw)?BigInt(raw).toString():null;
 return{receipts:[{route:'EVM_CHAIN_ID',...chainRow},{route:'EVM_FINALIZED_BLOCK',...blockRow},{route:'EVM_TOTAL_SUPPLY',...supplyRow}],attempts:chainRow.network_calls+blockRow.network_calls+supplyRow.network_calls,current:supplyRow.ok&&supply!==null?{supply,decimals:supplyRow.decimals,block_ref:blockRef,source_ts:Number.parseInt(text(blockRow?.payload?.result?.timestamp),16)*1000,finalized:true}:null};
}

export async function collectChainSupplyEvidence({db,fetch_impl=globalThis.fetch,request_admit,contract,run_id,asset_identity,identity_method=null,now=Date.now(),clock=Date.now,strict_fresh_manual=false}={}){
 if(!db)throw new Error('CHAIN_SUPPLY_DB_REQUIRED');const htxContract=text(contract).toUpperCase(),id=exactIdentity(asset_identity);
 if(!/^[^\s-]+-USDT$/u.test(htxContract)||!id||(id.asset_kind==='NATIVE'&&htxContract!==(id.chain==='near'?'NEAR-USDT':'SOL-USDT')))return{status:'EXACT_ASSET_IDENTITY_REQUIRED',evidence:[],network_calls:0,internal_only:true};
 await installEvidenceSourceStore(db);const assetKey=id.chain==='solana'?`${id.chain}:${id.address}`:`${id.chain}:${id.address}`.toLowerCase(),cached=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:assetKey,now});if(!strict_fresh_manual&&cached?.version===CHAIN_SUPPLY_EVIDENCE_VERSION&&cached.contract===htxContract&&(cached.evidence||[]).every(row=>row.htx_contract===htxContract))return cached;
 const previousRow=await db.prepare(`SELECT payload_json FROM report2_evidence_source_cache WHERE source=?1 AND asset_key=?2 LIMIT 1`).bind(SOURCE,assetKey).first();let previous=null;try{const prior=JSON.parse(previousRow?.payload_json||'null');if([CHAIN_SUPPLY_EVIDENCE_VERSION,'chain-supply-evidence-v5-native-chronology-20261004','chain-supply-evidence-v4-receipt-clock-20261004'].includes(prior?.version)&&prior.status==='CLOSED'&&prior.summary?.finalized===true&&prior.current_observation)previous={...prior.current_observation,finalized:true};}catch{}
 const attempts=['solana','near'].includes(id.chain)?2:3,reservationId=`EV2:${SOURCE}:${run_id}:${assetKey}:${Math.floor(now/TTL)}`,wholeJobAdmission=typeof request_admit==='function'?request_admit({logical_request_id:reservationId,lane:'background',attempts}):{allowed:false,status:'WHOLE_JOB_HTTP_ADMISSION_REQUIRED'};
 if(!wholeJobAdmission.allowed)return{status:wholeJobAdmission.status,evidence:[],network_calls:0,whole_job_admission:wholeJobAdmission,internal_only:true};
 const admission=await reserveEvidenceSourceAttempts(db,{source:SOURCE,reservation_id:reservationId,attempts,daily_cap:DAILY_CAP,now});if(!admission.allowed)return{status:admission.status,evidence:[],network_calls:0,admission,internal_only:true};
 const fetched=await fetchSupply(fetch_impl,id),observed=clock(),normalized=normalizeChainSupply({contract:htxContract,identity:{...id,contract_or_mint:id.address,identity_method},current:fetched.current,previous,observed_ts:observed});
 const result={version:CHAIN_SUPPLY_EVIDENCE_VERSION,...normalized,network_calls:fetched.attempts,cache_status:'REFRESHED',whole_job_admission:wholeJobAdmission,admission,receipts:fetched.receipts.map(({route,ok,http_status,error})=>({route,status:ok?'CLOSED':'SOURCE_ERROR',http_status,error:error??null})),internal_only:true};
 if(normalized.status==='CLOSED')await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:assetKey,observed_ts:observed,expires_ts:observed+TTL,payload:result});return result;
}

export default{normalizeChainSupply,collectChainSupplyEvidence};
