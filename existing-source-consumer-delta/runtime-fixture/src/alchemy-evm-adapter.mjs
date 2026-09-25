import { normalizeContractIdentity, normalizeTimestamp } from './asset-identity.mjs';
import { dedupeBlockchainEvents, classifyBlockchainEvent } from './blockchain-event-classifier.mjs';
export const ALCHEMY_EVM_ADAPTER_VERSION='alchemy-evm-adapter-v1-20260925';
const clean=v=>String(v??'').trim();
export function alchemyRpcRequest({network='ethereum',api_key='',method='eth_getLogs',params=[]}={}){
  const key=clean(api_key);if(!key)return {status:'NOT_CONFIGURED',reason:'ALCHEMY_API_KEY_REQUIRED',request:null};
  const networkName=clean(network).toLowerCase();
  return {status:'CANDIDATE',request:{method:'POST',url:`https://${networkName}-mainnet.g.alchemy.com/v2/${key}`,headers:{'content-type':'application/json'},body:{jsonrpc:'2.0',id:1,method,params}}};
}
export function normalizeEvmLog(log,{chain='ethereum',contract_or_mint,event_name=null,direction=null,supported_program=false,asset_identity_verified=false}={}){
  const id=normalizeContractIdentity({chain,contract_or_mint});if(id.status!=='CLOSED')return {status:'NOT_CLOSED',reason:id.reason};
  const idx=Number(log?.logIndex);const tx=clean(log?.transactionHash);const blockTs=normalizeTimestamp(log?.blockTimestamp??log?.timestamp??Date.now(),{unit:'auto'});
  if(!tx||!Number.isInteger(idx)||blockTs.status!=='CLOSED')return {status:'NOT_CLOSED',reason:'EVM_LOG_IDENTITY_OR_TIME_INVALID'};
  const type=String(event_name||log?.eventName||'').toUpperCase();const classification=classifyBlockchainEvent({type,removed:log?.removed===true,direction,supported_program,asset_identity_verified,quote_outflow_verified:log?.quote_outflow_verified===true,token_inflow_verified:log?.token_inflow_verified===true});
  return {status:classification.status,chain:id.chain,contract_or_mint:id.contract_or_mint,tx_hash:tx.toLowerCase(),log_index:idx,event_ts:blockTs.ms,event_name:type,classification};
}
export function normalizeEvmLogBatch(logs,options={}){
  const rows=(Array.isArray(logs)?logs:[]).map(x=>normalizeEvmLog(x,options)).filter(x=>x.tx_hash);
  return dedupeBlockchainEvents(rows);
}
