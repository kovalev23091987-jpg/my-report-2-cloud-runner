import crypto from 'node:crypto';
import {exactNativeSectorBinding} from './coingecko-sector-evidence.mjs';
import {buildEvidenceV2,SOURCE_POLICIES} from './evidence-source-adapters.mjs';
import {installEvidenceSourceStore,readEvidenceSourceCache,writeEvidenceSourceCache,reserveEvidenceSourceAttempts} from './evidence-source-store.mjs';
import {installProviderMinuteLedger,reserveProviderMinuteUnits} from './provider-minute-ledger.mjs';

export const NATIVE_EVM_CONTEXT_VERSION='native-evm-finalized-context-v1-20261007';
export const NATIVE_EVM_NETWORKS=Object.freeze({
 ethereum:{chain_id:'0x1',endpoint:'https://ethereum-rpc.publicnode.com',symbol:'ETH',execution_base_fee_burn:true},
 bsc:{chain_id:'0x38',endpoint:'https://bsc-rpc.publicnode.com',symbol:'BNB',execution_base_fee_burn:false},
 avalanche:{chain_id:'0xa86a',endpoint:'https://avalanche-c-chain-rpc.publicnode.com',symbol:'AVAX',execution_base_fee_burn:false},
});
const SOURCE='CHAIN_RPC',TTL=SOURCE_POLICIES[SOURCE].ttl_ms,MAX_TX=2000,MAX_BODY=2*1024*1024;
const HEX=/^0x(?:0|[1-9a-f][0-9a-f]*)$/i,HASH=/^0x[0-9a-f]{64}$/i,ADDR=/^0x[0-9a-f]{40}$/i;
const lower=x=>typeof x==='string'?x.toLowerCase():'',hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const q=x=>HEX.test(String(x))?BigInt(x):null;
const result=(payload,id)=>{const rows=Array.isArray(payload)?payload:[],hits=rows.filter(x=>x?.jsonrpc==='2.0'&&x.id===id&&!x.error&&Object.hasOwn(x,'result'));return hits.length===1&&rows.filter(x=>x?.id===id).length===1?hits[0].result:null;};
export function exactNativeEvmNetwork({contract,asset_identity}={}){
 const binding=exactNativeSectorBinding(asset_identity,contract),network=binding&&NATIVE_EVM_NETWORKS[binding.chain];
 return network&&contract===network.symbol+'-USDT'?{...network,chain:binding.chain}:null;
}
function validHeader(block,observed_ts){
 if(!block||!HASH.test(block.hash)||q(block.number)===null||q(block.timestamp)===null||q(block.gasUsed)===null||q(block.gasLimit)===null||q(block.gasUsed)>q(block.gasLimit)||!Number.isSafeInteger(observed_ts))return null;
 const ms=q(block.timestamp)*1000n;if(ms<=0n||ms>BigInt(Number.MAX_SAFE_INTEGER))return null;const source_ts=Number(ms);
 if(source_ts>observed_ts||observed_ts-source_ts>TTL)return null;return{source_ts};
}
const pickTx=tx=>({hash:tx.hash,transactionIndex:tx.transactionIndex,blockHash:tx.blockHash,blockNumber:tx.blockNumber,from:tx.from,to:tx.to,value:tx.value,input:tx.input});
const pickReceipt=r=>({transactionHash:r.transactionHash,transactionIndex:r.transactionIndex,blockHash:r.blockHash,blockNumber:r.blockNumber,from:r.from,to:r.to,status:r.status});
function validTx(tx,block){
 return tx&&HASH.test(tx.hash)&&lower(tx.blockHash)===lower(block.hash)&&q(tx.blockNumber)===q(block.number)&&q(tx.transactionIndex)!==null&&ADDR.test(tx.from)&&ADDR.test(tx.to)&&lower(tx.from)!==lower(tx.to)&&q(tx.value)!==null&&q(tx.value)>0n&&/^0x(?:[0-9a-f]{2})*$/i.test(String(tx.input));
}
function validReceipt(tx,r,block){
 return r&&lower(r.transactionHash)===lower(tx.hash)&&lower(r.blockHash)===lower(block.hash)&&q(r.blockNumber)===q(block.number)&&q(r.transactionIndex)===q(tx.transactionIndex)&&lower(r.from)===lower(tx.from)&&lower(r.to)===lower(tx.to)&&['0x0','0x1'].includes(lower(r.status));
}
export function deriveNativeEvmFacts({contract,asset_identity,proof,observed_ts}={}){
 const network=exactNativeEvmNetwork({contract,asset_identity}),block=proof?.block,head=validHeader(block,observed_ts),samples=proof?.samples;
 if(!network||proof?.schema!=='NATIVE_EVM_FINALIZED_BLOCK_AND_RECEIPTS_V1'||proof.chain_id!==network.chain_id||proof.chain!==network.chain||proof.requested_block_tag!=='finalized'||proof.source_clock_policy!=='ORIGINAL_FINALIZED_BLOCK_TIMESTAMP')return{status:'EXACT_FINALIZED_NATIVE_NETWORK_REQUIRED',evidence:[]};
 if(!head||network.execution_base_fee_burn&&q(block.baseFeePerGas)===null||!Number.isSafeInteger(block.transaction_count)||block.transaction_count<0||block.transaction_count>MAX_TX||!Array.isArray(samples)||samples.length>2||samples.length>block.transaction_count)return{status:'EXACT_FRESH_FINALIZED_BLOCK_REQUIRED',evidence:[]};
 const ids=new Set(),indexes=new Set();
 for(const s of samples){const tx=s?.transaction,index=q(tx?.transactionIndex);if(!validTx(tx,block)||index>=BigInt(block.transaction_count)||ids.has(lower(tx.hash))||indexes.has(String(index))||!validReceipt(tx,s.receipt,block))return{status:'EXACT_SELECTED_TRANSACTION_RECEIPT_REQUIRED',evidence:[]};ids.add(lower(tx.hash));indexes.add(String(index));}
 const upstream='PUBLICNODE_NATIVE_EVM:'+network.chain,root='NATIVE_EVM_BLOCK:'+network.chain+':'+lower(block.hash),extra={chain:network.chain,native_asset_id:network.chain+':mainnet',asset_kind:'NATIVE',token_address:null,block_hash:lower(block.hash),block_ref:lower(block.number),native_evm_proof:proof,native_evm_proof_sha256:hash(proof),physical_root_key:root,source_clock_policy:proof.source_clock_policy,source_clock_refreshed:false,event_is_not_market_direction:true,exchange_labels_verified:false,common_upstream_not_independent_vote:true,score_contribution:0,entry_authorized:false};
 const make=(block_id,metric_family,origin_event_id,detail)=>buildEvidenceV2({provider_id:SOURCE,upstream_id:upstream,asset_id:network.chain+':native:mainnet',htx_contract:contract,block_id,metric_family,origin_event_id,dependency_group:root,source_ts:head.source_ts,observed_ts,expires_at:head.source_ts+TTL,coverage_status:'ONE_FINALIZED_BLOCK_BOUNDED_NATIVE_SAMPLE',coverage_fraction:0,directional_strength:null,risk_strength:null,finality_status:'FINAL',unit:'wei',extra:{...extra,...detail}});
 const evidence=[];
 if(network.execution_base_fee_burn&&q(block.baseFeePerGas)!==null){
  const burn=q(block.baseFeePerGas)*q(block.gasUsed);
  evidence.push(make('N03','NATIVE_EXECUTION_BASE_FEE_BURN',lower(block.hash)+':EXECUTION_BASE_FEE',{base_fee_per_gas_wei:String(q(block.baseFeePerGas)),execution_gas_used:String(q(block.gasUsed)),burned_base_units:String(burn),decimals:18,physical_root_key:root+':EXECUTION_BASE_FEE',producer:'ETHEREUM_FINALIZED_EIP1559_BLOCK',burn_scope:'EXECUTION_BASE_FEE_ONLY',blob_fees_included:false,net_supply_change_verified:false,buyback_verified:false}));
 }
 for(const s of samples){
  if(s.receipt.status.toLowerCase()!=='0x1')continue;const tx=s.transaction;
  evidence.push(make('N04','NATIVE_TRANSFER',lower(tx.hash),{physical_root_key:root+':TX:'+lower(tx.hash),tx_hash:lower(tx.hash),transaction_index:String(q(tx.transactionIndex)),from:lower(tx.from),to:lower(tx.to),amount_base_units:String(q(tx.value)),decimals:18,quantity_units:'NATIVE_WEI_18_DECIMALS',market_kind:'ONCHAIN_NATIVE_TRANSFER',producer:'EVM_FINALIZED_SUCCESSFUL_NATIVE_TRANSACTION',transaction_input_empty:tx.input==='0x',internal_transfers_included:false,net_flow_claim:false}));
 }
 return{version:NATIVE_EVM_CONTEXT_VERSION,status:'CLOSED',contract,evidence,native_evm_proof:proof,source_ts:head.source_ts,observed_ts,expires_at:head.source_ts+TTL,summary:{chain:network.chain,scope:'ONE_FINALIZED_BLOCK_UP_TO_TWO_POSITIVE_NATIVE_TRANSACTIONS',finalized_block:lower(block.number),finalized_block_hash:lower(block.hash),source_ts:head.source_ts,block_transaction_count:block.transaction_count,selected_receipts:samples.length,successful_native_transfers:evidence.filter(r=>r.block_id==='N04').length,execution_burn_verified:evidence.some(r=>r.block_id==='N03'),quantity_units:'NATIVE_WEI_18_DECIMALS',net_market_flow_verified:false,exchange_labels_verified:false,direction_neutral:true},internal_only:true};
}
export function verifiedNativeEvmContextRow(row,{now}={}){
 if(!row||row.provider_id!==SOURCE||row.coverage_fraction!==0||row.directional_strength!==null||row.risk_strength!==null||row.score_contribution!==0||row.entry_authorized!==false||row.event_is_not_market_direction!==true||row.exchange_labels_verified!==false||row.common_upstream_not_independent_vote!==true||row.source_clock_refreshed!==false||row.token_address!==null||row.asset_kind!=='NATIVE'||row.native_evm_proof_sha256!==hash(row.native_evm_proof)||!Number.isSafeInteger(now)||!Number.isSafeInteger(row.observed_ts)||row.observed_ts>now||row.expires_at<now)return null;
 const id={chain:row.chain,asset_kind:'NATIVE',native_asset_id:row.chain+':mainnet',contract_or_mint:null},built=deriveNativeEvmFacts({contract:row.htx_contract,asset_identity:id,proof:row.native_evm_proof,observed_ts:row.observed_ts});
 if(built.status!=='CLOSED')return null;const expected=built.evidence.find(r=>r.evidence_id===row.evidence_id);
 if(!expected||Object.keys(expected).some(k=>JSON.stringify(expected[k])!==JSON.stringify(row[k])))return null;return expected;
}
async function send(fetch_impl,endpoint,messages,clock){
 try{const r=await fetch_impl(endpoint,{method:'POST',headers:{accept:'application/json','content-type':'application/json','user-agent':'My-Report-2/native-finalized-context'},body:JSON.stringify(messages),redirect:'error',signal:AbortSignal.timeout(8000)}),body=await r.text(),observed_ts=clock();if(Buffer.byteLength(body)>MAX_BODY)return{ok:false,http_status:r.status,error:'RESPONSE_TOO_LARGE',observed_ts,body_sha256:crypto.createHash('sha256').update(body).digest('hex')};
 const payload=JSON.parse(body),errors=Array.isArray(payload)?payload.filter(x=>x?.error).slice(0,4).map(x=>({id:x.id,code:x.error.code,message:String(x.error.message||'').slice(0,160)})):[];
 return{ok:r.ok&&Array.isArray(payload)&&errors.length===0,payload,http_status:r.status,observed_ts,errors,body_sha256:crypto.createHash('sha256').update(body).digest('hex')};}catch(e){return{ok:false,http_status:null,error:String(e.message).slice(0,160),observed_ts:clock()};}
}
export async function collectNativeEvmFinalizedContext({db,fetch_impl=globalThis.fetch,request_admit,contract,run_id,asset_identity,now=Date.now(),clock=Date.now,strict_fresh_manual=false}={}){
 const network=exactNativeEvmNetwork({contract,asset_identity});if(!network)return{status:'EXACT_NATIVE_EVM_NETWORK_REQUIRED',network_calls:0,evidence:[],internal_only:true};
 await installEvidenceSourceStore(db);const key=NATIVE_EVM_CONTEXT_VERSION+':'+contract,cached=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:key,now});
 if(!strict_fresh_manual&&cached?.version===NATIVE_EVM_CONTEXT_VERSION&&cached.contract===contract&&Number.isSafeInteger(cached.observed_ts)&&cached.observed_ts<=now&&cached.expires_at>=now){const rebuilt=deriveNativeEvmFacts({contract,asset_identity,proof:cached.native_evm_proof,observed_ts:cached.observed_ts});if(rebuilt.status==='CLOSED'&&rebuilt.source_ts===cached.source_ts&&rebuilt.expires_at===cached.expires_at&&JSON.stringify(rebuilt.evidence)===JSON.stringify(cached.evidence)&&(cached.evidence||[]).every(row=>verifiedNativeEvmContextRow(row,{now})))return{...cached,network_calls:0,cache_status:'VALIDATED_ORIGINAL_CLOCK_CACHE'};}
 const blocked=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:NATIVE_EVM_CONTEXT_VERSION+':BACKOFF:'+network.chain,now});if(blocked)return{...blocked,network_calls:0,evidence:[],internal_only:true};
 const reservation_id='EV2:NATIVE_EVM:'+run_id+':'+contract,whole_job_admission=request_admit?.({logical_request_id:reservation_id,lane:'background',attempts:2});
 if(!whole_job_admission?.allowed||whole_job_admission.duplicate)return{status:whole_job_admission?.status||'WHOLE_JOB_HTTP_ADMISSION_REQUIRED',network_calls:0,evidence:[],whole_job_admission};
 let admission=await reserveEvidenceSourceAttempts(db,{source:SOURCE,reservation_id,attempts:2,daily_cap:SOURCE_POLICIES[SOURCE].daily_cap,now});if(!admission.allowed)return{status:admission.status,network_calls:0,evidence:[],admission};
 await installProviderMinuteLedger(db);admission=await reserveProviderMinuteUnits(db,{provider:'PUBLICNODE_NATIVE_EVM',reservation_id,units:2,cap:6,now});if(!admission.allowed)return{status:admission.status,network_calls:0,evidence:[],admission};
 const reads=[],receipts=[],call=async messages=>{const r=await send(fetch_impl,network.endpoint,messages,clock);reads.push({...r,request:messages});receipts.push({route:messages.some(x=>x.method==='eth_chainId')?'EXACT_CHAIN_FINALIZED_FULL_BLOCK':'EXACT_SELECTED_NATIVE_RECEIPTS',http_status:r.http_status,status:r.ok?'RECEIVED':'SOURCE_ERROR',body_sha256:r.body_sha256||null,error:r.error||null,rpc_errors:r.errors||[]});return r;},message=(id,method,params)=>({jsonrpc:'2.0',id,method,params});
 const head=await call([message(1,'eth_chainId',[]),message(2,'eth_getBlockByNumber',['finalized',true])]),block=result(head.payload,2),chain_id=result(head.payload,1);
 let normalized={status:'EXACT_FRESH_FINALIZED_BLOCK_REQUIRED',evidence:[]},proof=null;
 if(head.ok&&chain_id===network.chain_id&&validHeader(block,head.observed_ts)&&Array.isArray(block.transactions)&&block.transactions.length<=MAX_TX&&block.transactions.every((tx,i)=>tx&&HASH.test(tx.hash)&&lower(tx.blockHash)===lower(block.hash)&&q(tx.blockNumber)===q(block.number)&&q(tx.transactionIndex)===BigInt(i)&&ADDR.test(tx.from)&&(tx.to===null||ADDR.test(tx.to))&&q(tx.value)!==null)&&new Set(block.transactions.map(tx=>lower(tx.hash))).size===block.transactions.length){
  const eligible=block.transactions.filter(tx=>validTx(tx,block)&&q(tx.transactionIndex)<BigInt(block.transactions.length)),selected=[...eligible.filter(tx=>tx.input==='0x'),...eligible.filter(tx=>tx.input!=='0x')].slice(0,2),unique=new Set(selected.map(tx=>lower(tx.hash)));
  if(unique.size!==selected.length)normalized={status:'EXACT_UNIQUE_NATIVE_TRANSACTION_REQUIRED',evidence:[]};
  else{
   const batch=selected.length?await call(selected.map((tx,i)=>message(3+i,'eth_getTransactionReceipt',[tx.hash]))):null;
   if(!batch||batch.ok){
    proof={schema:'NATIVE_EVM_FINALIZED_BLOCK_AND_RECEIPTS_V1',chain:network.chain,chain_id,requested_block_tag:'finalized',source_clock_policy:'ORIGINAL_FINALIZED_BLOCK_TIMESTAMP',block:{hash:block.hash,number:block.number,timestamp:block.timestamp,gasUsed:block.gasUsed,gasLimit:block.gasLimit,baseFeePerGas:block.baseFeePerGas??null,transaction_count:block.transactions.length},samples:selected.map((tx,i)=>({transaction:pickTx(tx),receipt:result(batch?.payload,3+i)?pickReceipt(result(batch.payload,3+i)):null}))};
    normalized=deriveNativeEvmFacts({contract,asset_identity,proof,observed_ts:clock()});
   }else normalized={status:'SOURCE_RECEIPT_NOT_CLOSED',evidence:[]};
  }
 }else if(chain_id!==network.chain_id&&chain_id!==null)normalized={status:'WRONG_NATIVE_CHAIN_ID',evidence:[]};
 const observed=clock(),answer={version:NATIVE_EVM_CONTEXT_VERSION,...normalized,network_calls:reads.length,logical_rpc_methods:reads.reduce((n,r)=>n+r.request.length,0),admission,whole_job_admission,cache_status:'REFRESHED',receipts,internal_only:true};
 if(reads.some(r=>[403,429,451,503].includes(r.http_status)||r.errors?.some(e=>e.code===-32005))){const until=observed+30*60000;await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:NATIVE_EVM_CONTEXT_VERSION+':BACKOFF:'+network.chain,observed_ts:observed,expires_ts:until,payload:{status:'SOURCE_ACCESS_OR_RATE_BACKOFF',until_ts:until}});}
 if(normalized.status==='CLOSED')await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:key,observed_ts:observed,expires_ts:normalized.expires_at,payload:answer});
 return answer;
}
