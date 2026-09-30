import {buildEvidenceV2,SOURCE_POLICIES} from './evidence-source-adapters.mjs';
import {installEvidenceSourceStore,reserveEvidenceSourceAttempts,readEvidenceSourceCache,writeEvidenceSourceCache} from './evidence-source-store.mjs';
export const FINALIZED_CHAIN_EVENTS_VERSION='finalized-chain-events-v1-20260930';
export const AAVE_POOL='0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2';
export const AAVE_TOPIC='0xe413a321e8681d831f4dbccbca790d2952b56f977908e45be37335533e005286';
export const TRANSFER_TOPIC='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const SOURCE='CHAIN_RPC',TTL=SOURCE_POLICIES[SOURCE].ttl_ms,ADDR=/^0x[0-9a-f]{40}$/i,WORD=/^0x[0-9a-f]{64}$/i,HEX=/^0x[0-9a-f]+$/i,clean=x=>String(x??'').toLowerCase(),address=x=>WORD.test(String(x))&&/^0x0{24}/i.test(x)?'0x'+x.slice(-40).toLowerCase():null;
export function decodeFinalizedChainEvent({log,mode,asset,block,observed_ts,contract}={}){
 if(!ADDR.test(asset)||log?.removed!==false||!WORD.test(log?.transactionHash)||!WORD.test(log?.blockHash)||!HEX.test(log?.logIndex)||!block||clean(block.hash)!==clean(log.blockHash)||clean(block.number)!==clean(log.blockNumber)||!HEX.test(block.timestamp))return null;
 const source_ts=Number(BigInt(block.timestamp))*1000;if(!Number.isSafeInteger(source_ts)||source_ts>observed_ts)return null;
 const topics=log.topics,token=clean(asset),tx=clean(log.transactionHash),index=BigInt(log.logIndex).toString(),data=String(log.data??'');let metric,block_id,details;
 if(mode==='AAVE_CREDIT'){
  if(clean(log.address)!==AAVE_POOL||topics?.length!==4||clean(topics[0])!==AAVE_TOPIC||!/^0x[0-9a-f]{256}$/i.test(data))return null;
  const collateral=address(topics[1]),debt=address(topics[2]),user=address(topics[3]),bool=BigInt('0x'+data.slice(194,258));if(!collateral||!debt||!user||!['0','1'].includes(bool.toString())||collateral!==token&&debt!==token)return null;
  metric='DEFI_CREDIT_LIQUIDATION';block_id='N04';details={collateral_asset:collateral,debt_asset:debt,borrower:user,debt_to_cover_base_units:BigInt('0x'+data.slice(2,66)).toString(),liquidated_collateral_base_units:BigInt('0x'+data.slice(66,130)).toString(),quantity_units:'RAW_BASE_UNITS_NO_USD_CONVERSION',market_kind:'DEFI_CREDIT',producer:'AAVE_V3_FINALIZED_EVENTS',entry_eligible:false,is_htx_price:false,price_semantics:'DEFI_CREDIT_EVENT'};
 }else{
  if(clean(log.address)!==token||topics?.length!==3||clean(topics[0])!==TRANSFER_TOPIC||!WORD.test(data))return null;
  const from=address(topics[1]),to=address(topics[2]);if(!from||!to)return null;const zero='0x'+'0'.repeat(40);
  metric=from===zero?'MINT_TRANSFER':to===zero?'BURN_TRANSFER':'TOKEN_TRANSFER';block_id=from===zero?'N02':to===zero?'N03':'N04';details={from,to,amount_base_units:BigInt(data).toString(),quantity_units:'RAW_BASE_UNITS_NO_USD_CONVERSION',market_kind:'ONCHAIN_TOKEN_TRANSFER',producer:'FINALIZED_ERC20_EVENTS'};
 }
 return buildEvidenceV2({provider_id:SOURCE,upstream_id:'PUBLICNODE_RPC',asset_id:`ethereum:${token}`,htx_contract:contract,block_id,metric_family:metric,origin_event_id:`${tx}:${index}`,dependency_group:`ethereum:${tx}:${index}`,source_ts,observed_ts,expires_at:observed_ts+TTL,coverage_status:'BOUNDED_FINALIZED_EVENT_SAMPLE',coverage_fraction:0,finality_status:'FINAL',validation_status:'VALID',directional_strength:null,risk_strength:null,extra:{...details,tx_hash:tx,log_index:index,block_hash:clean(log.blockHash),block_ref:clean(log.blockNumber),event_is_not_market_direction:true}});
}
async function rpc(fetch_impl,body){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);try{const r=await fetch_impl('https://ethereum-rpc.publicnode.com',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:controller.signal}),p=await r.json();return{ok:r.ok,payload:p,http_status:r.status};}catch(e){return{ok:false,error:String(e.message).slice(0,100)};}finally{clearTimeout(timer);}}
const exactResult=(payload,id)=>{const rows=Array.isArray(payload)?payload:[payload],hits=rows.filter(x=>x?.id===id&&!x.error);return hits.length===1?hits[0].result:null;};
export async function collectFinalizedChainEvents({db,fetch_impl=globalThis.fetch,request_admit,contract,run_id,asset_identity,now=Date.now(),event_mode='TOKEN_TRANSFER'}={}){
 const token=clean(asset_identity?.contract_or_mint),mode=event_mode==='AAVE_CREDIT'?'AAVE_CREDIT':'TOKEN_TRANSFER';if(asset_identity?.chain!=='ethereum'||!ADDR.test(token))return{status:'EXACT_ETHEREUM_IDENTITY_REQUIRED',evidence:[],network_calls:0};
 await installEvidenceSourceStore(db);const key=`FINAL_EVENTS:${mode}:${token}`,cached=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:key,now});if(cached?.version===FINALIZED_CHAIN_EVENTS_VERSION)return{...cached,contract};
 const reservation_id=`EV2:CHAIN_EVENTS:${mode}:${run_id}:${token}`,whole_job_admission=request_admit?.({logical_request_id:reservation_id,lane:'background',attempts:3});if(whole_job_admission?.allowed!==true)return{status:whole_job_admission?.status||'ADMISSION_REQUIRED',evidence:[],network_calls:0,whole_job_admission};
 const admission=await reserveEvidenceSourceAttempts(db,{source:SOURCE,reservation_id,attempts:3,daily_cap:SOURCE_POLICIES[SOURCE].daily_cap,now});if(!admission.allowed)return{status:admission.status,evidence:[],network_calls:0,admission};
 let calls=0;const send=body=>{calls++;return rpc(fetch_impl,body);},receipts=[],evidence=[];let status='SOURCE_SCHEMA_NOT_CLOSED',summary={mode,scope:'LAST_256_FINALIZED_BLOCKS_ONE_TIMED_EVENT_BLOCK',quantity_units:'RAW_BASE_UNITS',direction_neutral:true};
 const head=await send([{jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]},{jsonrpc:'2.0',id:2,method:'eth_getBlockByNumber',params:['finalized',false]}]);receipts.push({route:'CHAIN_AND_FINALIZED_HEADER',http_status:head.http_status});
 const block=exactResult(head.payload,2);if(head.ok&&exactResult(head.payload,1)==='0x1'&&HEX.test(block?.number)&&HEX.test(block?.timestamp)){
  const end=BigInt(block.number),start=end>255n?end-255n:0n,raw=await send({jsonrpc:'2.0',id:3,method:'eth_getLogs',params:[{address:mode==='AAVE_CREDIT'?AAVE_POOL:token,fromBlock:'0x'+start.toString(16),toBlock:block.number,topics:[mode==='AAVE_CREDIT'?AAVE_TOPIC:TRANSFER_TOPIC]}]});receipts.push({route:'FINALIZED_LOGS',http_status:raw.http_status});
  const logs=exactResult(raw.payload,3);if(raw.ok&&Array.isArray(logs)&&logs.length<=200){
   const matching=logs.filter(x=>HEX.test(x?.blockNumber)&&BigInt(x.blockNumber)>=start&&BigInt(x.blockNumber)<=end&&(mode!=='AAVE_CREDIT'||[address(x?.topics?.[1]),address(x?.topics?.[2])].includes(token))),wanted=matching.at(-1)?.blockNumber;let timed=null;
   if(wanted){const r=await send({jsonrpc:'2.0',id:4,method:'eth_getBlockByNumber',params:[wanted,false]});receipts.push({route:'EXACT_EVENT_BLOCK_CLOCK',http_status:r.http_status});timed=r.ok?exactResult(r.payload,4):null;}
   for(const log of matching.filter(x=>x.blockNumber===wanted)){const row=decodeFinalizedChainEvent({log,mode,asset:token,block:timed,observed_ts:now,contract});if(row)evidence.push(row);}
   status=wanted&&timed===null?'EVENT_CLOCK_NOT_CLOSED':wanted&&evidence.length===0?'EVENT_VALIDATION_NOT_CLOSED':'CLOSED';summary={...summary,finalized_block:block.number,window_start_block:'0x'+start.toString(16),matching_logs:matching.length,confirmed_timed_events:evidence.length,untimed_logs_excluded:matching.length-evidence.length,empty_sample:matching.length===0};
  }else status=Array.isArray(logs)&&logs.length>200?'LOG_SAMPLE_SATURATED':'SOURCE_LOG_SCHEMA_NOT_CLOSED';
 }
 const result={version:FINALIZED_CHAIN_EVENTS_VERSION,status,evidence,summary,network_calls:calls,logical_rpc_methods:calls===3?4:calls===2?3:2,admission,whole_job_admission,receipts,internal_only:true};
 if(status==='CLOSED')await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:key,observed_ts:now,expires_ts:now+TTL,payload:result});return result;
}
