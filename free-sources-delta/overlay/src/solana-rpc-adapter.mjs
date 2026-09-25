import { normalizeContractIdentity } from './asset-identity.mjs';
import { classifyBlockchainEvent } from './blockchain-event-classifier.mjs';
export const SOLANA_RPC_ADAPTER_VERSION='solana-rpc-adapter-v1-20260925';
const clean=v=>String(v??'').trim();
export function buildSolanaRpcRequest({method,mint,signature,limit=100}={}){
  const id=normalizeContractIdentity({chain:'solana',contract_or_mint:mint});
  if(id.status!=='CLOSED')return {status:'NOT_CLOSED',reason:id.reason};
  if(method==='getSignaturesForAddress')return {status:'CANDIDATE',method,url:'https://api.mainnet-beta.solana.com',body:{jsonrpc:'2.0',id:1,method,params:[id.contract_or_mint,{limit:Math.max(1,Math.min(1000,Number(limit)||100))}]},mint:id.contract_or_mint};
  if(method==='getTransaction'&&clean(signature))return {status:'CANDIDATE',method,url:'https://api.mainnet-beta.solana.com',body:{jsonrpc:'2.0',id:1,method,params:[clean(signature),{encoding:'jsonParsed',maxSupportedTransactionVersion:0,commitment:'confirmed'}]},mint:id.contract_or_mint};
  return {status:'NOT_CLOSED',reason:'SOLANA_METHOD_OR_SIGNATURE_INVALID'};
}
export function normalizeSolanaSignatures(payload,{mint}={}){
  const id=normalizeContractIdentity({chain:'solana',contract_or_mint:mint});if(id.status!=='CLOSED')return {status:'NOT_CLOSED',reason:id.reason,rows:[]};
  const rows=Array.isArray(payload?.result)?payload.result:[];
  return {status:Array.isArray(payload?.result)?'CLOSED':'NOT_CLOSED',mint:id.contract_or_mint,rows:rows.map(r=>({signature:r?.signature??null,slot:r?.slot??null,err:r?.err??null,block_time:r?.blockTime??null,confirmation_status:r?.confirmationStatus??null})).filter(r=>r.signature)};
}
export function classifySolanaParsedAction(action={}){
  const program=clean(action.program||action.programId).toLowerCase();const type=clean(action.type).toUpperCase();
  const supported=new Set(['spl-token','spl-token-2022','jupiter','raydium','orca']).has(program)||action.supported_program===true;
  if(type==='TRANSFER')return classifyBlockchainEvent({type:'TRANSFER'});
  if(type.includes('BRIDGE'))return classifyBlockchainEvent({type:'BRIDGE'});
  if(type==='ADD_LIQUIDITY')return classifyBlockchainEvent({type:'ADD_LIQUIDITY'});
  if(type==='SWAP')return classifyBlockchainEvent({type:'SWAP',supported_program:supported,asset_identity_verified:action.asset_identity_verified===true,direction:action.direction,quote_outflow_verified:action.quote_outflow_verified===true,token_inflow_verified:action.token_inflow_verified===true});
  return {status:'UNSUPPORTED',classification:'SOLANA_PROGRAM_OR_OPERATION_UNSUPPORTED',is_buy:false,reason:'UNSUPPORTED_OPERATION'};
}
