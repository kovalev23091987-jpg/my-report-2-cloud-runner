import {NATIVE_LEDGER_FAMILIES,fetchNativeLedgerSupply,normalizeNativeLedgerPair} from './native-ledger-supply.mjs';
import {fetchStellarPublishedSupply,normalizeStellarPublishedSupply} from './stellar-primary-supply.mjs';
import {fetchSolanaNativeSupply,SOLANA_MAINNET_GENESIS} from './solana-native-supply.mjs';
import {buildEvidenceV2,SOURCE_POLICIES} from './evidence-source-adapters.mjs';
import {installEvidenceSourceStore,reserveEvidenceSourceAttempts,readEvidenceSourceCache,writeEvidenceSourceCache} from './evidence-source-store.mjs';

export const CHAIN_SUPPLY_EVIDENCE_VERSION='chain-supply-evidence-v9-primary-native-families-20261007';
const DEFAULT_SOURCE='CHAIN_RPC';
const EVM_ENDPOINTS=Object.freeze({ethereum:'https://ethereum-rpc.publicnode.com',bsc:'https://bsc-rpc.publicnode.com',arbitrum:'https://arbitrum-one-rpc.publicnode.com',base:'https://base-rpc.publicnode.com',polygon:'https://polygon-bor-rpc.publicnode.com',optimism:'https://optimism-rpc.publicnode.com',avalanche:'https://avalanche-c-chain-rpc.publicnode.com'});
const EVM_CHAIN_IDS=Object.freeze({ethereum:'0x1',bsc:'0x38',arbitrum:'0xa4b1',base:'0x2105',polygon:'0x89',optimism:'0xa',avalanche:'0xa86a'});
const text=value=>String(value??'').trim(),baseOf=contract=>text(contract).toUpperCase().replace(/-USDT$/,'');
const EVM=/^0x[0-9a-f]{40}$/i,BASE58=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value):null;
const unsigned=value=>/^\d+$/.test(text(value))?BigInt(text(value)):null;
const decimalsOf=value=>{const n=finite(value);return Number.isSafeInteger(n)&&n>=0&&n<=255?n:null;};

function exactIdentity(identity){
 const chain=text(identity?.chain).toLowerCase(),address=text(identity?.contract_or_mint);
 if(['near','solana','cardano','xrp','stellar'].includes(chain)&&identity?.asset_kind==='NATIVE'&&identity?.native_asset_id===`${chain}:mainnet`&&(!address||address==='native:mainnet'))return{chain,address:'native:mainnet',asset_kind:'NATIVE',native_asset_id:`${chain}:mainnet`};
 if(chain==='solana'&&BASE58.test(address))return{chain,address};
 if(EVM_ENDPOINTS[chain]&&EVM.test(address))return{chain,address:address.toLowerCase()};
 return null;
}

const nativeContract=id=>({near:'NEAR-USDT',solana:'SOL-USDT',cardano:'ADA-USDT',xrp:'XRP-USDT',stellar:'XLM-USDT'}[id?.chain]||null);
const sourceFor=id=>id?.chain==='cardano'?'KOIOS_NATIVE_SUPPLY':NATIVE_LEDGER_FAMILIES[id?.chain]?.provider||DEFAULT_SOURCE;

async function postRpc(fetchImpl,url,method,params){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
 try{const response=await fetchImpl(url,{method:'POST',headers:{accept:'application/json','content-type':'application/json','user-agent':'My-Report-2/chain-supply-v1'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:controller.signal});const payload=await response.json().catch(()=>null);return{network_calls:1,ok:response.ok&&!payload?.error,http_status:response.status,payload,error:response.ok&&!payload?.error?null:`HTTP_OR_RPC_${response.status}`};}
 catch(error){return{network_calls:1,ok:false,http_status:null,payload:null,error:String(error?.name==='AbortError'?'TIMEOUT':error?.message||error).slice(0,160)};}
 finally{clearTimeout(timer);}
}

async function getJson(fetchImpl,url){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
 try{const response=await fetchImpl(url,{method:'GET',headers:{accept:'application/json','user-agent':'My-Report-2/cardano-supply-v1'},signal:controller.signal});const payload=await response.json().catch(()=>null);return{network_calls:1,ok:response.ok,http_status:response.status,payload,error:response.ok?null:`HTTP_${response.status}`};}
 catch(error){return{network_calls:1,ok:false,http_status:null,payload:null,error:String(error?.name==='AbortError'?'TIMEOUT':error?.message||error).slice(0,160)};}
 finally{clearTimeout(timer);}
}

export function normalizeChainSupply({contract,identity,current,previous=null,observed_ts=Date.now()}={}){
 const htxContract=text(contract).toUpperCase(),id=exactIdentity(identity);if(!id)return{status:'EXACT_ASSET_IDENTITY_REQUIRED',evidence:[],internal_only:true};
 if(id.asset_kind==='NATIVE'&&htxContract!==nativeContract(id))return{status:'EXACT_ASSET_IDENTITY_REQUIRED',evidence:[],internal_only:true};
 const sameAddress=id.chain==='solana'?id.address===text(previous?.address):id.address.toLowerCase()===text(previous?.address).toLowerCase();
 const sourceTs=finite(current?.source_ts),priorTs=finite(previous?.source_ts),chronological=priorTs!==null&&sourceTs!==null&&priorTs<sourceTs&&text(previous?.block_ref)!==''&&text(current?.block_ref)!==''&&text(previous.block_ref)!==text(current.block_ref)&&previous?.finalized===true;
 const decimals=decimalsOf(current?.decimals),currentValue=unsigned(current?.supply),samePrevious=chronological&&decimals!==null&&id.chain===text(previous?.chain).toLowerCase()&&sameAddress&&decimalsOf(previous?.decimals)===decimals,previousValue=samePrevious?unsigned(previous?.supply):null;
 if(id.asset_kind==='NATIVE'&&id.chain==='solana'&&(current?.genesis_hash!==SOLANA_MAINNET_GENESIS||current?.commitment!=='finalized'||current?.decimals!==9))return{status:'SOLANA_MAINNET_SUPPLY_PROOF_REQUIRED',evidence:[],internal_only:true};
 if(id.chain==='xrp'){const proof=normalizeNativeLedgerPair({...current?.native_ledger_pair_payload,observed_ts});if(proof.status!=='CLOSED'||proof.current.supply!==text(current?.supply)||proof.current.source_ts!==sourceTs||proof.current.block_ref!==current?.block_ref||decimals!==6||previous&&(proof.previous.supply!==text(previous.supply)||proof.previous.block_ref!==previous.block_ref||proof.previous.source_ts!==priorTs||decimalsOf(previous.decimals)!==6))return{status:'EXACT_XRPL_FINALIZED_LEDGER_PROOF_REQUIRED',evidence:[],internal_only:true};}
 if(currentValue===null)return{status:'SOURCE_SCHEMA_ERROR',evidence:[],internal_only:true};
 if(current?.finalized!==true)return{status:'SOURCE_FINALITY_NOT_CLOSED',evidence:[],internal_only:true};
 const delta=previousValue===null?null:currentValue-previousValue,metric=id.chain==='cardano'?'CARDANO_ACTIVE_SUPPLY_OBSERVATION':delta===null?'TOTAL_SUPPLY_OBSERVATION':delta>0n?'SUPPLY_INCREASE':delta<0n?'SUPPLY_DECREASE':'SUPPLY_UNCHANGED',block=id.chain==='cardano'?'N02':delta!==null&&delta<0n?'N03':'N02',source=sourceFor(id),ttl=SOURCE_POLICIES[source].ttl_ms;
 const origin=`${id.chain}:${id.address}:${text(current?.block_ref)||sourceTs}`;
 if(sourceTs===null||sourceTs>observed_ts)return{status:'SOURCE_CLOCK_NOT_CLOSED',contract:htxContract,evidence:[],internal_only:true};
 if(observed_ts-sourceTs>(id.chain==='cardano'?6*24*60*60_000:ttl))return{status:'STALE_FINALIZED_SUPPLY',contract:htxContract,evidence:[],internal_only:true};
 const common={...(current?.native_ledger_pair_payload?{native_ledger_pair_payload:current.native_ledger_pair_payload}:{}),chain:id.chain,token_address:id.asset_kind==='NATIVE'?null:id.address,asset_kind:id.asset_kind||'TOKEN',native_asset_id:id.native_asset_id||null,genesis_hash:current?.genesis_hash||null,commitment:current?.commitment||null,total_supply_base_units:text(current.supply),previous_supply_base_units:previousValue===null?null:text(previous.supply),supply_delta_base_units:delta===null?null:String(delta),decimals,block_ref:text(current?.block_ref)||null,previous_source_ts:previousValue===null?null:priorTs,previous_block_ref:previousValue===null?null:text(previous.block_ref),comparison_policy:'EXACT_ASSET_DECIMALS_DISTINCT_BLOCK_INCREASING_CLOCK',identity_method:text(identity?.identity_method)||null,direction_policy:'SUPPLY_OBSERVATION_ONLY_UNTIL_MATCHED_FINALIZED_TRANSACTION',supply_measure:text(current?.supply_measure)||'TOKEN_TOTAL_SUPPLY',unit:text(current?.unit)||null,provider_query:text(current?.provider_query)||null,epoch_no:Number.isSafeInteger(current?.epoch_no)?current.epoch_no:null,previous_epoch_no:Number.isSafeInteger(previous?.epoch_no)?previous.epoch_no:null,max_supply_base_units:text(current?.max_supply)||null};
 const upstream=NATIVE_LEDGER_FAMILIES[id.chain]?.upstream||(id.chain==='near'?'NEAR_MAINNET_RPC':id.chain==='solana'?'SOLANA_MAINNET_RPC':id.chain==='cardano'?'KOIOS_CARDANO_MAINNET':'PUBLICNODE_RPC');
 const evidence=[buildEvidenceV2({provider_id:source,upstream_id:upstream,asset_id:`${id.chain}:${id.address}`,htx_contract:htxContract,block_id:block,metric_family:metric,origin_event_id:origin,dependency_group:`CHAIN_SUPPLY:${id.chain}:${id.address}:${text(current?.block_ref)||sourceTs}`,source_ts:sourceTs,observed_ts,expires_at:observed_ts+ttl,directional_strength:null,risk_strength:null,coverage_status:delta===null?'CONTEXT_ONLY':'PARTIAL_FINALIZED_COMPARISON',coverage_fraction:id.chain==='cardano'?.25:0,finality_status:'FINAL',validation_status:'VALID',extra:common})];
 // A decrease comparison belongs to N03, but its same finalized current
 // supply remains an independently assigned N02 context fact. Preserve the
 // original N03 row and clocks; this is one upstream observation, not a vote.
 if(block==='N03')evidence.push(buildEvidenceV2({provider_id:source,upstream_id:upstream,asset_id:`${id.chain}:${id.address}`,htx_contract:htxContract,block_id:'N02',metric_family:'TOTAL_SUPPLY_OBSERVATION',origin_event_id:`${origin}:CURRENT_SUPPLY_CONTEXT`,dependency_group:`CHAIN_SUPPLY:${id.chain}:${id.address}:${text(current?.block_ref)||sourceTs}`,source_ts:sourceTs,observed_ts,expires_at:observed_ts+ttl,directional_strength:null,risk_strength:null,coverage_status:'CONTEXT_ONLY',coverage_fraction:0,finality_status:'FINAL',validation_status:'VALID',extra:{...common,previous_supply_base_units:null,supply_delta_base_units:null,previous_source_ts:null,previous_block_ref:null}}));
 // A genuine non-decrease is still a bounded answer to N03's supply check.
 // Apply to every supported exact asset, not a ticker-specific exception.
 // Negative deltas already have a native N03 evidence row above.
 if(previousValue!==null&&(id.chain==='cardano'||delta>=0n))evidence.push(buildEvidenceV2({provider_id:source,upstream_id:upstream,asset_id:`${id.chain}:${id.address}`,htx_contract:htxContract,block_id:'N03',metric_family:'SUPPLY_REDUCTION_CHECK',origin_event_id:`${origin}:REDUCTION_CHECK`,dependency_group:`CHAIN_SUPPLY:${id.chain}:${id.address}:${text(current?.block_ref)||sourceTs}`,source_ts:sourceTs,observed_ts,expires_at:observed_ts+ttl,directional_strength:null,risk_strength:null,coverage_status:id.chain==='cardano'?'TWO_CLOSED_EPOCHS':'PARTIAL_FINALIZED_COMPARISON',coverage_fraction:id.chain==='cardano'?.25:0,finality_status:'FINAL',validation_status:'VALID',extra:{...common,supply_decreased:delta<0n,change_cause_verified:false,burn_verified:false,buyback_verified:false}}));
 return{status:'CLOSED',contract:htxContract,evidence,summary:{chain:id.chain,total_supply_base_units:text(current.supply),supply_delta_base_units:delta===null?null:String(delta),decimals,finalized:true,supply_measure:common.supply_measure,epoch_no:common.epoch_no,previous_epoch_no:common.previous_epoch_no},current_observation:{chain:id.chain,address:id.address,supply:text(current.supply),decimals,block_ref:text(current.block_ref),source_ts:sourceTs,finalized:true,epoch_no:common.epoch_no},internal_only:true};
}

async function fetchCardanoSupply(fetchImpl){
 const root='https://api.koios.rest/api/v1',tip=await getJson(fetchImpl,`${root}/tip`),tipRows=Array.isArray(tip.payload)?tip.payload:[],tipRow=tipRows.length===1?tipRows[0]:null;
 const tipEpoch=finite(tipRow?.epoch_no),tipValid=tip.ok&&Number.isSafeInteger(tipEpoch)&&tipEpoch>=2&&/^[0-9a-f]{64}$/i.test(text(tipRow?.hash))&&Number.isSafeInteger(finite(tipRow?.block_time));
 const genesis=tipValid?await getJson(fetchImpl,`${root}/genesis`):{network_calls:0,ok:false,payload:null,error:'EXACT_MAINNET_TIP_REQUIRED'},genesisRows=Array.isArray(genesis.payload)?genesis.payload:[],mainnetRows=genesisRows.filter(row=>Number(row?.networkmagic)===764824073&&text(row?.networkid).toLowerCase()==='mainnet'),genesisRow=mainnetRows.length===1?mainnetRows[0]:null;
 const epochLength=finite(genesisRow?.epochlength),slotLength=finite(genesisRow?.slotlength),systemStart=finite(genesisRow?.systemstart),maxSupply=unsigned(genesisRow?.maxlovelacesupply),genesisValid=genesis.ok&&Number.isSafeInteger(epochLength)&&epochLength===432000&&slotLength===1&&Number.isSafeInteger(systemStart)&&systemStart>0&&maxSupply===45000000000000000n;
 const currentEpoch=tipEpoch-1,previousEpoch=tipEpoch-2,currentRow=genesisValid?await getJson(fetchImpl,`${root}/totals?_epoch_no=${currentEpoch}`):{network_calls:0,ok:false,payload:null,error:'CARDANO_MAINNET_GENESIS_REQUIRED'},previousRow=genesisValid?await getJson(fetchImpl,`${root}/totals?_epoch_no=${previousEpoch}`):{network_calls:0,ok:false,payload:null,error:'CARDANO_MAINNET_GENESIS_REQUIRED'};
 const normalize=(request,epoch)=>{const rows=Array.isArray(request.payload)?request.payload:[],row=rows.length===1?rows[0]:null,supply=unsigned(row?.supply),reserves=unsigned(row?.reserves),rowEpoch=finite(row?.epoch_no),closedAt=(systemStart+(epoch+1)*epochLength)*1000,valid=request.ok&&Number.isSafeInteger(rowEpoch)&&rowEpoch===epoch&&supply!==null&&reserves!==null&&supply+reserves===maxSupply&&Number.isSafeInteger(closedAt);return valid?{chain:'cardano',address:'native:mainnet',supply:String(supply),decimals:6,block_ref:`epoch:${epoch}`,source_ts:closedAt,finalized:true,epoch_no:epoch,supply_measure:'CARDANO_ACTIVE_SUPPLY',unit:'lovelace',provider_query:'KOIOS_TOTALS_CLOSED_EPOCH',max_supply:String(maxSupply)}:null;};
 const current=genesisValid?normalize(currentRow,currentEpoch):null,previous=genesisValid?normalize(previousRow,previousEpoch):null,receipts=[{route:'KOIOS_MAINNET_TIP',...tip},{route:'KOIOS_MAINNET_GENESIS',...genesis},{route:'KOIOS_CLOSED_EPOCH_TOTALS',...currentRow},{route:'KOIOS_PREVIOUS_CLOSED_EPOCH_TOTALS',...previousRow}];
 return{receipts,attempts:receipts.reduce((sum,row)=>sum+Number(row.network_calls||0),0),current,previous};
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

async function fetchSupply(fetchImpl,id,clock){
 if(id.chain==='stellar')return fetchStellarPublishedSupply(fetchImpl);
 if(id.chain==='xrp')return fetchNativeLedgerSupply(fetchImpl,id,{clock});
 if(id.chain==='cardano'&&id.asset_kind==='NATIVE')return fetchCardanoSupply(fetchImpl);
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
 if(!/^[^\s-]+-USDT$/u.test(htxContract)||!id||(id.asset_kind==='NATIVE'&&htxContract!==nativeContract(id)))return{status:'EXACT_ASSET_IDENTITY_REQUIRED',evidence:[],network_calls:0,internal_only:true};
 const source=sourceFor(id),ttl=SOURCE_POLICIES[source].ttl_ms,dailyCap=SOURCE_POLICIES[source].daily_cap;
 await installEvidenceSourceStore(db);const assetKey=id.chain==='solana'?`${id.chain}:${id.address}`:`${id.chain}:${id.address}`.toLowerCase(),cached=await readEvidenceSourceCache(db,{source,asset_key:assetKey,now});if(!strict_fresh_manual&&cached?.version===CHAIN_SUPPLY_EVIDENCE_VERSION&&cached.contract===htxContract&&(cached.evidence||[]).every(row=>row.htx_contract===htxContract)){
  const reduction=cached.evidence.find(row=>row.block_id==='N03'&&row.metric_family==='SUPPLY_DECREASE');
  if(reduction&&!cached.evidence.some(row=>row.block_id==='N02')&&cached.current_observation){
   // Derive only from the retained original finalized observation; never
   // renew its receipt, expiry, comparison history or transport reservation.
   const context=normalizeChainSupply({contract:htxContract,identity:{...id,contract_or_mint:id.address,identity_method:reduction.identity_method},current:{...cached.current_observation,genesis_hash:reduction.genesis_hash,commitment:reduction.commitment,supply_measure:reduction.supply_measure},previous:{chain:reduction.chain,address:id.address,supply:reduction.previous_supply_base_units,decimals:reduction.decimals,block_ref:reduction.previous_block_ref,source_ts:reduction.previous_source_ts,finalized:true},observed_ts:reduction.observed_ts});
   return{...cached,evidence:[...cached.evidence,...context.evidence.filter(row=>row.block_id==='N02')]};
  }
  return cached;
 }
 const previousRow=await db.prepare(`SELECT payload_json FROM report2_evidence_source_cache WHERE source=?1 AND asset_key=?2 LIMIT 1`).bind(source,assetKey).first();let previous=null;try{const prior=JSON.parse(previousRow?.payload_json||'null');if([CHAIN_SUPPLY_EVIDENCE_VERSION,'chain-supply-evidence-v8-general-comparison-context-20261005','chain-supply-evidence-v7-cardano-koios-20261005','chain-supply-evidence-v6-native-solana-20261004','chain-supply-evidence-v5-native-chronology-20261004','chain-supply-evidence-v4-receipt-clock-20261004'].includes(prior?.version)&&prior.status==='CLOSED'&&prior.summary?.finalized===true&&prior.current_observation)previous={...prior.current_observation,finalized:true};}catch{}
 const attempts=id.chain==='stellar'?1:id.chain==='xrp'?3:id.chain==='cardano'?4:['solana','near'].includes(id.chain)?2:3,reservationId=`EV2:${source}:${run_id}:${assetKey}:${Math.floor(now/ttl)}`,wholeJobAdmission=typeof request_admit==='function'?request_admit({logical_request_id:reservationId,lane:'background',attempts}):{allowed:false,status:'WHOLE_JOB_HTTP_ADMISSION_REQUIRED'};
 if(!wholeJobAdmission.allowed)return{status:wholeJobAdmission.status,evidence:[],network_calls:0,whole_job_admission:wholeJobAdmission,internal_only:true};
 const admission=await reserveEvidenceSourceAttempts(db,{source,reservation_id:reservationId,attempts,daily_cap:dailyCap,now});if(!admission.allowed)return{status:admission.status,evidence:[],network_calls:0,admission,internal_only:true};
 if(NATIVE_LEDGER_FAMILIES[id.chain]){const parent=await reserveEvidenceSourceAttempts(db,{source:DEFAULT_SOURCE,reservation_id:reservationId+':PARENT',attempts,daily_cap:SOURCE_POLICIES[DEFAULT_SOURCE].daily_cap,now});if(!parent.allowed)return{status:parent.status,evidence:[],network_calls:0,admission:parent,internal_only:true};}
 const fetched=await fetchSupply(fetch_impl,id,clock),observed=clock(),normalized=id.chain==='stellar'?normalizeStellarPublishedSupply({contract:htxContract,identity:asset_identity,payload:fetched.payload,observed_ts:observed}):normalizeChainSupply({contract:htxContract,identity:{...id,contract_or_mint:id.address,identity_method},current:fetched.current,previous:id.chain==='xrp'?fetched.previous:fetched.previous||previous,observed_ts:observed});
 const result={version:CHAIN_SUPPLY_EVIDENCE_VERSION,...normalized,...(id.chain==='xrp'&&fetched.status!=='CLOSED'?{status:fetched.status}:{}),network_calls:fetched.attempts,cache_status:'REFRESHED',whole_job_admission:wholeJobAdmission,admission,receipts:fetched.receipts.map(({route,ok,http_status,error})=>({route,status:ok?'CLOSED':'SOURCE_ERROR',http_status,error:error??null})),internal_only:true};
 if(normalized.status==='CLOSED'||NATIVE_LEDGER_FAMILIES[id.chain])await writeEvidenceSourceCache(db,{source,asset_key:assetKey,observed_ts:observed,expires_ts:observed+(normalized.status==='CLOSED'?ttl:30*60_000),payload:result});return result;
}

export default{normalizeChainSupply,collectChainSupplyEvidence};
