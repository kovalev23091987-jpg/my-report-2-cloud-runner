import {collectNativeEvmFinalizedContext,exactNativeEvmNetwork} from './native-evm-finalized-context.mjs';
import {collectXrplNativePayments} from './xrpl-native-payments.mjs';
import {buildEvidenceV2,SOURCE_POLICIES} from './evidence-source-adapters.mjs';
import {installEvidenceSourceStore,reserveEvidenceSourceAttempts,readEvidenceSourceCache,writeEvidenceSourceCache} from './evidence-source-store.mjs';
export const FINALIZED_CHAIN_EVENTS_VERSION='finalized-chain-events-v5-native-sol-transfer-20261005';
export const AAVE_POOL='0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2';
export const AAVE_TOPIC='0xe413a321e8681d831f4dbccbca790d2952b56f977908e45be37335533e005286';
export const TRANSFER_TOPIC='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const SOURCE='CHAIN_RPC',TTL=SOURCE_POLICIES[SOURCE].ttl_ms,ADDR=/^0x[0-9a-f]{40}$/i,BASE58=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/,BASE58_SIG=/^[1-9A-HJ-NP-Za-km-z]{64,88}$/,WORD=/^0x[0-9a-f]{64}$/i,HEX=/^0x[0-9a-f]+$/i,clean=x=>String(x??'').toLowerCase(),address=x=>WORD.test(String(x))&&/^0x0{24}/i.test(x)?'0x'+x.slice(-40).toLowerCase():null;
const EVM_ENDPOINTS=Object.freeze({ethereum:'https://ethereum-rpc.publicnode.com',bsc:'https://bsc-rpc.publicnode.com',arbitrum:'https://arbitrum-one-rpc.publicnode.com',base:'https://base-rpc.publicnode.com',polygon:'https://polygon-bor-rpc.publicnode.com',optimism:'https://optimism-rpc.publicnode.com',avalanche:'https://avalanche-c-chain-rpc.publicnode.com'});
const EVM_CHAIN_IDS=Object.freeze({ethereum:'0x1',bsc:'0x38',arbitrum:'0xa4b1',base:'0x2105',polygon:'0x89',optimism:'0xa',avalanche:'0xa86a'});
export const SOLANA_SYSTEM_PROGRAM='11111111111111111111111111111111';
export function decodeFinalizedChainEvent({log,mode,asset,block,observed_ts,contract,chain='ethereum'}={}){
 if(!['TOKEN_TRANSFER','AAVE_CREDIT'].includes(mode)||!ADDR.test(asset)||log?.removed!==false||!WORD.test(log?.transactionHash)||!WORD.test(log?.blockHash)||!HEX.test(log?.logIndex)||!block||clean(block.hash)!==clean(log.blockHash)||clean(block.number)!==clean(log.blockNumber)||!HEX.test(block.timestamp))return null;
 const source_ts=Number(BigInt(block.timestamp))*1000;if(!Number.isSafeInteger(source_ts)||source_ts>observed_ts)return null;
 const topics=log.topics,token=clean(asset),tx=clean(log.transactionHash),index=BigInt(log.logIndex).toString(),data=String(log.data??'');let metric,block_id,details;
 if(mode==='AAVE_CREDIT'){
  if(clean(log.address)!==AAVE_POOL||topics?.length!==4||clean(topics[0])!==AAVE_TOPIC||!/^0x[0-9a-f]{256}$/i.test(data))return null;
  const collateral=address(topics[1]),debt=address(topics[2]),user=address(topics[3]),liquidator=address('0x'+data.slice(130,194)),bool=BigInt('0x'+data.slice(194,258));if(!collateral||!debt||!user||!liquidator||!['0','1'].includes(bool.toString())||collateral!==token&&debt!==token)return null;
  metric='DEFI_CREDIT_LIQUIDATION';block_id='N04';details={collateral_asset:collateral,debt_asset:debt,borrower:user,liquidator,debt_to_cover_base_units:BigInt('0x'+data.slice(2,66)).toString(),liquidated_collateral_base_units:BigInt('0x'+data.slice(66,130)).toString(),quantity_units:'RAW_BASE_UNITS_NO_USD_CONVERSION',market_kind:'DEFI_CREDIT',producer:'AAVE_V3_FINALIZED_EVENTS',entry_eligible:false,is_htx_price:false,price_semantics:'DEFI_CREDIT_EVENT'};
 }else{
  if(clean(log.address)!==token||topics?.length!==3||clean(topics[0])!==TRANSFER_TOPIC||!WORD.test(data))return null;
  const from=address(topics[1]),to=address(topics[2]);if(!from||!to)return null;const zero='0x'+'0'.repeat(40);
  metric=from===zero?'MINT_TRANSFER':to===zero?'BURN_TRANSFER':'TOKEN_TRANSFER';block_id=from===zero?'N02':to===zero?'N03':'N04';details={from,to,amount_base_units:BigInt(data).toString(),quantity_units:'RAW_BASE_UNITS_NO_USD_CONVERSION',market_kind:'ONCHAIN_TOKEN_TRANSFER',producer:'FINALIZED_ERC20_EVENTS'};
 }
 chain=clean(chain)||'ethereum';
 return buildEvidenceV2({provider_id:SOURCE,upstream_id:'PUBLICNODE_RPC',asset_id:`${chain}:${token}`,htx_contract:contract,block_id,metric_family:metric,origin_event_id:`${tx}:${index}`,dependency_group:`${chain}:${tx}:${index}`,source_ts,observed_ts,expires_at:observed_ts+TTL,coverage_status:'BOUNDED_FINALIZED_EVENT_SAMPLE',coverage_fraction:0,finality_status:'FINAL',validation_status:'VALID',directional_strength:null,risk_strength:null,extra:{...details,chain,token_address:token,tx_hash:tx,log_index:index,block_hash:clean(log.blockHash),block_ref:clean(log.blockNumber),event_is_not_market_direction:true}});
}
async function rpc(fetch_impl,endpoint,body){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);try{const r=await fetch_impl(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:controller.signal}),p=await r.json();return{ok:r.ok&&!p?.error,payload:p,http_status:r.status,error:p?.error?.message||null};}catch(e){return{ok:false,error:String(e.message).slice(0,100)};}finally{clearTimeout(timer);}}
const exactResult=(payload,id)=>{const rows=Array.isArray(payload)?payload:[payload],hits=rows.filter(x=>x?.id===id&&!x.error);return hits.length===1?hits[0].result:null;};

function solanaAmount(row){const raw=String(row?.uiTokenAmount?.amount??'');return /^\d+$/.test(raw)?BigInt(raw):null;}
export function decodeFinalizedSolanaTransaction({transaction,mint,signature,observed_ts,contract}={}){
 const slot=Number(transaction?.slot),source_ts=Number(transaction?.blockTime)*1000,meta=transaction?.meta;
 if(!BASE58.test(String(mint))||!BASE58_SIG.test(String(signature))||!Number.isSafeInteger(slot)||slot<0||!Number.isSafeInteger(source_ts)||source_ts>observed_ts||!meta||meta.err!==null)return [];
 const pre=(meta.preTokenBalances||[]).filter(row=>row?.mint===mint),post=(meta.postTokenBalances||[]).filter(row=>row?.mint===mint),byIndex=new Map();
 for(const row of pre){const amount=solanaAmount(row);if(amount!==null)byIndex.set(row.accountIndex,{pre:amount,post:0n});}
 for(const row of post){const amount=solanaAmount(row);if(amount!==null)byIndex.set(row.accountIndex,{pre:byIndex.get(row.accountIndex)?.pre??0n,post:amount});}
 let debits=0n,credits=0n;for(const row of byIndex.values()){const delta=row.post-row.pre;if(delta<0n)debits-=delta;else credits+=delta;}
 const net=credits-debits;if(net===0n&&debits===0n)return [];
 const block_id=net>0n?'N02':net<0n?'N03':'N04',metric_family=net>0n?'TOKEN_BALANCE_INCREASE':net<0n?'TOKEN_BALANCE_DECREASE':'TOKEN_TRANSFER',amount=net===0n?debits:(net<0n?-net:net);
 return[buildEvidenceV2({provider_id:SOURCE,upstream_id:'SOLANA_MAINNET_RPC',asset_id:`solana:${mint}`,htx_contract:contract,block_id,metric_family,origin_event_id:signature,dependency_group:`solana:${signature}`,source_ts,observed_ts,expires_at:observed_ts+TTL,coverage_status:'BOUNDED_FINALIZED_EVENT_SAMPLE',coverage_fraction:0,finality_status:'FINAL',validation_status:'VALID',directional_strength:null,risk_strength:null,extra:{chain:'solana',token_address:mint,tx_hash:signature,block_ref:String(slot),amount_base_units:String(amount),quantity_units:'RAW_BASE_UNITS_NO_USD_CONVERSION',market_kind:'ONCHAIN_TOKEN_TRANSFER',producer:'SOLANA_FINALIZED_TOKEN_BALANCE_DIFF',event_is_not_market_direction:true}})];
}

async function collectSolanaFinalizedEvents({db,fetch_impl,request_admit,contract,run_id,mint,now,clock,strict_fresh_manual=false}){
 const key=`FINAL_EVENTS:${FINALIZED_CHAIN_EVENTS_VERSION}:${contract}:solana:TOKEN_TRANSFER:${mint}`,cached=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:key,now});if(!strict_fresh_manual&&cached?.version===FINALIZED_CHAIN_EVENTS_VERSION)return{...cached,contract};
 const reservation_id=`EV2:CHAIN_EVENTS:${contract}:TOKEN_TRANSFER:${run_id}:${mint}`,whole_job_admission=request_admit?.({logical_request_id:reservation_id,lane:'background',attempts:2});if(whole_job_admission?.allowed!==true)return{status:whole_job_admission?.status||'ADMISSION_REQUIRED',evidence:[],network_calls:0,whole_job_admission};
 const admission=await reserveEvidenceSourceAttempts(db,{source:SOURCE,reservation_id,attempts:2,daily_cap:SOURCE_POLICIES[SOURCE].daily_cap,now});if(!admission.allowed)return{status:admission.status,evidence:[],network_calls:0,admission};
 const endpoint='https://api.mainnet-beta.solana.com',sig=await rpc(fetch_impl,endpoint,{jsonrpc:'2.0',id:1,method:'getSignaturesForAddress',params:[mint,{limit:20,commitment:'finalized'}]}),signatures=exactResult(sig.payload,1),receipts=[{route:'SOLANA_FINALIZED_SIGNATURES',status:sig.ok&&Array.isArray(signatures)?'CLOSED':'SOURCE_ERROR',http_status:sig.http_status,error:sig.error??null}];let calls=1,evidence=[],status='SOURCE_SCHEMA_NOT_CLOSED',sampled_signature=null;
 if(sig.ok&&Array.isArray(signatures)){
  const selected=signatures.find(row=>row?.err===null&&BASE58_SIG.test(String(row?.signature||'')))||null;sampled_signature=selected?.signature||null;
  if(!selected)status='CLOSED';
  else{const tx=await rpc(fetch_impl,endpoint,{jsonrpc:'2.0',id:2,method:'getTransaction',params:[selected.signature,{commitment:'finalized',encoding:'jsonParsed',maxSupportedTransactionVersion:0}]});calls++;const transaction=exactResult(tx.payload,2);receipts.push({route:'SOLANA_FINALIZED_TRANSACTION',status:tx.ok&&transaction?'CLOSED':'SOURCE_ERROR',http_status:tx.http_status,error:tx.error??null});if(tx.ok&&transaction){const observed=clock(),sourceTs=Number(transaction.blockTime)*1000;if(!Number.isFinite(sourceTs)||sourceTs>observed)status='SOURCE_CLOCK_NOT_CLOSED';else{evidence=decodeFinalizedSolanaTransaction({transaction,mint,signature:selected.signature,observed_ts:observed,contract});status='CLOSED';}}else status='SOURCE_TRANSACTION_NOT_CLOSED';}
 }
 const observed=clock(),result={version:FINALIZED_CHAIN_EVENTS_VERSION,status,evidence,summary:{mode:'TOKEN_TRANSFER',scope:'LAST_20_FINALIZED_SIGNATURES_ONE_TRANSACTION',matching_signatures:Array.isArray(signatures)?signatures.length:0,sampled_signature,confirmed_timed_events:evidence.length,direction_neutral:true},network_calls:calls,admission,whole_job_admission,receipts,internal_only:true};if(status==='CLOSED')await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:key,observed_ts:observed,expires_ts:observed+TTL,payload:result});return result;
}

export function decodeFinalizedNativeSolanaTransaction({transaction,signature,observed_ts,contract}={}){
 const slot=Number(transaction?.slot),source_ts=Number(transaction?.blockTime)*1000,meta=transaction?.meta,message=transaction?.transaction?.message;
 if(contract!=='SOL-USDT'||!BASE58_SIG.test(String(signature))||!Number.isSafeInteger(slot)||slot<0||!Number.isSafeInteger(source_ts)||source_ts>observed_ts||!meta||meta.err!==null||!message)return[];
 const outer=Array.isArray(message.instructions)?message.instructions:[],inner=Array.isArray(meta.innerInstructions)?meta.innerInstructions.flatMap(row=>Array.isArray(row?.instructions)?row.instructions:[]):[],rows=[];
 for(const [index,instruction] of [...outer,...inner].entries()){
  const parsed=instruction?.parsed,info=parsed?.info,lamports=info?.lamports;
  if(instruction?.program!=='system'||parsed?.type!=='transfer'||!Number.isSafeInteger(lamports)||lamports<=0||typeof info?.source!=='string'||typeof info?.destination!=='string'||info.source===info.destination)continue;
  rows.push(buildEvidenceV2({provider_id:SOURCE,upstream_id:'SOLANA_MAINNET_RPC',asset_id:'solana:native:mainnet',htx_contract:contract,block_id:'N04',metric_family:'NATIVE_TRANSFER',origin_event_id:`${signature}:${index}`,dependency_group:`solana:${signature}`,source_ts,observed_ts,expires_at:observed_ts+TTL,coverage_status:'BOUNDED_FINALIZED_EVENT_SAMPLE',coverage_fraction:0,finality_status:'FINAL',validation_status:'VALID',directional_strength:null,risk_strength:null,extra:{chain:'solana',native_asset_id:'solana:mainnet',tx_hash:signature,instruction_index:String(index),block_ref:String(slot),from:info.source,to:info.destination,amount_base_units:String(lamports),quantity_units:'LAMPORTS',market_kind:'ONCHAIN_NATIVE_TRANSFER',producer:'SOLANA_FINALIZED_NATIVE_SYSTEM_TRANSFER',event_is_not_market_direction:true,exchange_labels_verified:false}}));
  if(rows.length===16)break;
 }
 return rows;
}

async function collectNativeSolanaFinalizedEvents({db,fetch_impl,request_admit,contract,run_id,now,clock,strict_fresh_manual=false}){
 const key=`FINAL_EVENTS:${FINALIZED_CHAIN_EVENTS_VERSION}:${contract}:solana:NATIVE_TRANSFER`,cached=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:key,now});if(!strict_fresh_manual&&cached?.version===FINALIZED_CHAIN_EVENTS_VERSION)return{...cached,contract};
 const reservation_id=`EV2:CHAIN_EVENTS:${contract}:NATIVE_TRANSFER:${run_id}`,whole_job_admission=request_admit?.({logical_request_id:reservation_id,lane:'background',attempts:4});if(whole_job_admission?.allowed!==true)return{status:whole_job_admission?.status||'ADMISSION_REQUIRED',evidence:[],network_calls:0,whole_job_admission};
 const admission=await reserveEvidenceSourceAttempts(db,{source:SOURCE,reservation_id,attempts:4,daily_cap:SOURCE_POLICIES[SOURCE].daily_cap,now});if(!admission.allowed)return{status:admission.status,evidence:[],network_calls:0,admission};
 const endpoint='https://api.mainnet-beta.solana.com',sig=await rpc(fetch_impl,endpoint,{jsonrpc:'2.0',id:1,method:'getSignaturesForAddress',params:[SOLANA_SYSTEM_PROGRAM,{limit:20,commitment:'finalized'}]}),signatures=exactResult(sig.payload,1),receipts=[{route:'SOLANA_FINALIZED_NATIVE_SIGNATURES',status:sig.ok&&Array.isArray(signatures)?'CLOSED':'SOURCE_ERROR',http_status:sig.http_status,error:sig.error??null}];let calls=1,evidence=[],status='SOURCE_SCHEMA_NOT_CLOSED';const sampled_signatures=[];
 if(sig.ok&&Array.isArray(signatures)){
  const eligible=signatures.filter(row=>row?.err===null&&row?.confirmationStatus==='finalized'&&BASE58_SIG.test(String(row?.signature||''))).slice(0,3);status='CLOSED';
  for(const [index,selected] of eligible.entries()){
   const id=2+index,tx=await rpc(fetch_impl,endpoint,{jsonrpc:'2.0',id,method:'getTransaction',params:[selected.signature,{commitment:'finalized',encoding:'jsonParsed',maxSupportedTransactionVersion:0}]});calls++;const transaction=exactResult(tx.payload,id);sampled_signatures.push(selected.signature);receipts.push({route:'SOLANA_FINALIZED_NATIVE_TRANSACTION',status:tx.ok&&transaction?'CLOSED':'SOURCE_ERROR',http_status:tx.http_status,error:tx.error??null,signature:selected.signature});
   if(!tx.ok||!transaction){status='SOURCE_TRANSACTION_NOT_CLOSED';continue;}const observed=clock(),sourceTs=Number(transaction.blockTime)*1000;if(!Number.isFinite(sourceTs)||sourceTs>observed){status='SOURCE_CLOCK_NOT_CLOSED';continue;}evidence=decodeFinalizedNativeSolanaTransaction({transaction,signature:selected.signature,observed_ts:observed,contract});status='CLOSED';if(evidence.length)break;
  }
 }
 const observed=clock(),result={version:FINALIZED_CHAIN_EVENTS_VERSION,status,evidence,summary:{mode:'NATIVE_TRANSFER',scope:'LAST_20_FINALIZED_SYSTEM_PROGRAM_SIGNATURES_UP_TO_THREE_TRANSACTIONS',sampled_signatures,confirmed_timed_events:evidence.length,direction_neutral:true,quantity_units:'LAMPORTS',exchange_labels_verified:false},network_calls:calls,admission,whole_job_admission,receipts,internal_only:true};if(status==='CLOSED')await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:key,observed_ts:observed,expires_ts:observed+TTL,payload:result});return result;
}
export async function collectFinalizedChainEvents({db,fetch_impl=globalThis.fetch,request_admit,contract,run_id,asset_identity,now=Date.now(),clock=Date.now,event_mode='TOKEN_TRANSFER',strict_fresh_manual=false}={}){
 const chain=clean(asset_identity?.chain),rawToken=String(asset_identity?.contract_or_mint??'').trim(),token=chain==='solana'?rawToken:clean(rawToken),mode=event_mode==='AAVE_CREDIT'?'AAVE_CREDIT':'TOKEN_TRANSFER';if(!/^[^-\s]{1,32}-USDT$/.test(contract))return{status:'EXACT_CHAIN_IDENTITY_REQUIRED',evidence:[],network_calls:0};
 if(mode==='TOKEN_TRANSFER'&&exactNativeEvmNetwork({contract,asset_identity}))return collectNativeEvmFinalizedContext({db,fetch_impl,request_admit,contract,run_id,asset_identity,now,clock,strict_fresh_manual});
 await installEvidenceSourceStore(db);const key=`FINAL_EVENTS:${FINALIZED_CHAIN_EVENTS_VERSION}:${contract}:${chain}:${mode}:${token}`,cached=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:key,now});if(!strict_fresh_manual&&cached?.version===FINALIZED_CHAIN_EVENTS_VERSION)return{...cached,contract};
 if(chain==='xrp'&&contract==='XRP-USDT'&&asset_identity?.asset_kind==='NATIVE'&&asset_identity.native_asset_id==='xrp:mainnet'&&asset_identity.contract_or_mint===null&&mode==='TOKEN_TRANSFER')return collectXrplNativePayments({db,fetch_impl,request_admit,contract,run_id,asset_identity,now,clock,strict_fresh_manual});
 if(chain==='solana'&&asset_identity?.asset_kind==='NATIVE'&&asset_identity?.native_asset_id==='solana:mainnet'&&asset_identity?.contract_or_mint===null&&mode==='TOKEN_TRANSFER')return collectNativeSolanaFinalizedEvents({db,fetch_impl,request_admit,contract,run_id,now,clock,strict_fresh_manual});
 if(chain==='solana'&&BASE58.test(token)&&mode==='TOKEN_TRANSFER')return collectSolanaFinalizedEvents({db,fetch_impl,request_admit,contract,run_id,mint:token,now,clock,strict_fresh_manual});
 const endpoint=EVM_ENDPOINTS[chain];if(!endpoint||!ADDR.test(token)||mode==='AAVE_CREDIT'&&chain!=='ethereum')return{status:'EXACT_SUPPORTED_CHAIN_IDENTITY_REQUIRED',evidence:[],network_calls:0};
 const reservation_id=`EV2:CHAIN_EVENTS:${contract}:${mode}:${run_id}:${token}`,whole_job_admission=request_admit?.({logical_request_id:reservation_id,lane:'background',attempts:4});if(whole_job_admission?.allowed!==true)return{status:whole_job_admission?.status||'ADMISSION_REQUIRED',evidence:[],network_calls:0,whole_job_admission};
 const admission=await reserveEvidenceSourceAttempts(db,{source:SOURCE,reservation_id,attempts:4,daily_cap:SOURCE_POLICIES[SOURCE].daily_cap,now});if(!admission.allowed)return{status:admission.status,evidence:[],network_calls:0,admission};
 let calls=0;const send=body=>{calls++;return rpc(fetch_impl,endpoint,body);},receipts=[],evidence=[];let status='SOURCE_SCHEMA_NOT_CLOSED',summary={mode,chain,scope:'LAST_256_FINALIZED_BLOCKS_ONE_TIMED_EVENT_BLOCK',quantity_units:'RAW_BASE_UNITS',direction_neutral:true};
 const head=await send([{jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]},{jsonrpc:'2.0',id:2,method:'eth_getBlockByNumber',params:['finalized',false]}]);receipts.push({route:'CHAIN_AND_FINALIZED_HEADER',http_status:head.http_status});
 const block=exactResult(head.payload,2);if(head.ok&&clean(exactResult(head.payload,1))===EVM_CHAIN_IDS[chain]&&HEX.test(block?.number)&&HEX.test(block?.timestamp)){
  const end=BigInt(block.number);let start=end>255n?end-255n:0n;let raw=await send({jsonrpc:'2.0',id:3,method:'eth_getLogs',params:[{address:mode==='AAVE_CREDIT'?AAVE_POOL:token,fromBlock:'0x'+start.toString(16),toBlock:block.number,topics:[mode==='AAVE_CREDIT'?AAVE_TOPIC:TRANSFER_TOPIC]}]});receipts.push({route:'FINALIZED_LOGS',http_status:raw.http_status});
  let logs=exactResult(raw.payload,3),scopeNarrowed=false;
  if(raw.ok&&Array.isArray(logs)&&logs.length>200){
   start=end>15n?end-15n:0n;scopeNarrowed=true;
   raw=await send({jsonrpc:'2.0',id:3,method:'eth_getLogs',params:[{address:mode==='AAVE_CREDIT'?AAVE_POOL:token,fromBlock:'0x'+start.toString(16),toBlock:block.number,topics:[mode==='AAVE_CREDIT'?AAVE_TOPIC:TRANSFER_TOPIC]}]});
   receipts.push({route:'NARROWED_LAST_16_FINALIZED_BLOCKS',http_status:raw.http_status});logs=exactResult(raw.payload,3);
  }
  if(raw.ok&&Array.isArray(logs)&&logs.length<=200){
   const matching=logs.filter(x=>HEX.test(x?.blockNumber)&&BigInt(x.blockNumber)>=start&&BigInt(x.blockNumber)<=end&&(mode!=='AAVE_CREDIT'||[address(x?.topics?.[1]),address(x?.topics?.[2])].includes(token))),wanted=matching.at(-1)?.blockNumber;let timed=null;
   if(wanted){const r=await send({jsonrpc:'2.0',id:4,method:'eth_getBlockByNumber',params:[wanted,false]});receipts.push({route:'EXACT_EVENT_BLOCK_CLOCK',http_status:r.http_status});timed=r.ok?exactResult(r.payload,4):null;}
   const observed=clock();
   for(const log of matching.filter(x=>x.blockNumber===wanted)){const row=decodeFinalizedChainEvent({log,mode,asset:token,block:timed,observed_ts:observed,contract,chain});if(row)evidence.push(row);}
   status=wanted&&timed===null?'EVENT_CLOCK_NOT_CLOSED':wanted&&evidence.length===0?'EVENT_VALIDATION_NOT_CLOSED':'CLOSED';summary={...summary,scope:scopeNarrowed?'LAST_16_FINALIZED_BLOCKS_ONE_TIMED_EVENT_BLOCK':summary.scope,scope_narrowed:scopeNarrowed,finalized_block:block.number,window_start_block:'0x'+start.toString(16),matching_logs:matching.length,confirmed_timed_events:evidence.length,untimed_logs_excluded:matching.length-evidence.length,empty_sample:matching.length===0};
  }else status=Array.isArray(logs)&&logs.length>200?'LOG_SAMPLE_SATURATED':'SOURCE_LOG_SCHEMA_NOT_CLOSED';
 }
 const result={version:FINALIZED_CHAIN_EVENTS_VERSION,status,evidence,summary,network_calls:calls,logical_rpc_methods:calls+1,admission,whole_job_admission,receipts,internal_only:true};
 const observed=clock();if(status==='CLOSED')await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:key,observed_ts:observed,expires_ts:observed+TTL,payload:result});return result;
}
