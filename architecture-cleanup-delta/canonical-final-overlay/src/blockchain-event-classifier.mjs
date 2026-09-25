export const BLOCKCHAIN_EVENT_CLASSIFIER_VERSION='blockchain-event-classifier-v1-20260925';
const clean=v=>String(v??'').trim();
export function eventIdentity({chain,tx_hash,log_index,signature,instruction_index}={}){
  const c=clean(chain).toLowerCase();if(c==='solana')return signature&&Number.isInteger(Number(instruction_index))?`solana:${signature}:${Number(instruction_index)}`:null;
  return tx_hash&&Number.isInteger(Number(log_index))?`${c}:${String(tx_hash).toLowerCase()}:${Number(log_index)}`:null;
}
export function classifyBlockchainEvent(event={}){
  const type=clean(event.type||event.event_name).toUpperCase();
  const removed=event.removed===true||event.reorged===true;
  if(removed)return {status:'INVALIDATED',classification:'REORG_REMOVED',is_buy:false,reason:'REORG_OR_REMOVED_LOG'};
  const mapping={TRANSFER:'TRANSFER',BRIDGE:'BRIDGE',BRIDGE_IN:'BRIDGE',BRIDGE_OUT:'BRIDGE',ADD_LIQUIDITY:'LIQUIDITY_ADD',REMOVE_LIQUIDITY:'LIQUIDITY_REMOVE'};
  if(mapping[type])return {status:'CLOSED',classification:mapping[type],is_buy:false,reason:'NOT_A_BUY_EVENT'};
  if(type==='SWAP'){
    if(event.supported_program!==true||event.asset_identity_verified!==true)return {status:'UNSUPPORTED',classification:'SWAP_UNSUPPORTED_CONTEXT',is_buy:false,reason:'SUPPORTED_PROGRAM_AND_IDENTITY_REQUIRED'};
    if(event.direction==='BUY'&&event.quote_outflow_verified===true&&event.token_inflow_verified===true)return {status:'CLOSED',classification:'DEX_BUY',is_buy:true,reason:'SUPPORTED_SWAP_WITH_VERIFIED_ASSET_LEGS'};
    if(event.direction==='SELL')return {status:'CLOSED',classification:'DEX_SELL',is_buy:false,reason:'SUPPORTED_SWAP_SELL'};
    return {status:'UNKNOWN',classification:'SWAP_DIRECTION_UNKNOWN',is_buy:false,reason:'MULTIHOP_OR_DIRECTION_NOT_PROVEN'};
  }
  return {status:'UNSUPPORTED',classification:'UNSUPPORTED_EVENT',is_buy:false,reason:'EVENT_NOT_DECODED'};
}
export function dedupeBlockchainEvents(events=[]){
  const seen=new Set(),out=[],duplicates=[];
  for(const e of Array.isArray(events)?events:[]){const id=eventIdentity(e);if(!id){out.push({...e,dedupe_status:'IDENTITY_MISSING'});continue;}if(seen.has(id)){duplicates.push(id);continue;}seen.add(id);out.push({...e,event_identity:id});}
  return {status:'CLOSED',events:out,duplicates,duplicate_count:duplicates.length};
}
