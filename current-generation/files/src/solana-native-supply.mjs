export const SOLANA_MAINNET_GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
// Preserve the JSON wire integers before Number conversion. Solana supply
// in lamports exceeds Number.MAX_SAFE_INTEGER.
export function parseSolanaSupplyPayload(raw){
 if(typeof raw!=='string'||raw.length>131072)throw Error('SOLANA_SUPPLY_BODY_LIMIT');
 return JSON.parse(raw,(key,value,context)=>{
  if(['total','circulating','nonCirculating'].includes(key)&&typeof value==='number'){
   if(!context?.source||!/^\d+$/.test(context.source))throw Error('SOLANA_EXACT_WIRE_UINT_REQUIRED');
   return context.source;
  }
  return value;
 });
}
const uint=v=>typeof v==='string'&&/^\d+$/.test(v)?BigInt(v):null;
async function rpc(fetch_impl,body,parse=JSON.parse){
 const timer=AbortSignal.timeout(8000);
 try{const response=await fetch_impl('https://api.mainnet-beta.solana.com',{method:'POST',headers:{accept:'application/json','content-type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:timer});const raw=await response.text();if(raw.length>131072)throw Error('SOLANA_SUPPLY_BODY_LIMIT');return{network_calls:1,ok:response.ok,http_status:response.status,payload:parse(raw)};}
 catch(error){return{network_calls:1,ok:false,http_status:null,payload:null,error:String(error.message).slice(0,120)};}
}
export async function fetchSolanaNativeSupply(fetch_impl){
 const first=await rpc(fetch_impl,[{jsonrpc:'2.0',id:1,method:'getGenesisHash',params:[]},{jsonrpc:'2.0',id:2,method:'getSupply',params:[{commitment:'finalized',excludeNonCirculatingAccountsList:true}]}],parseSolanaSupplyPayload);
 const rows=Array.isArray(first.payload)?first.payload:[],genesis=rows.filter(r=>r.id===1),supplies=rows.filter(r=>r.id===2),s=supplies[0]?.result,value=s?.value,total=uint(value?.total),circulating=uint(value?.circulating),nonCirculating=uint(value?.nonCirculating),slot=s?.context?.slot;
 const valid=first.ok&&rows.length===2&&genesis.length===1&&!genesis[0].error&&genesis[0].result===SOLANA_MAINNET_GENESIS&&supplies.length===1&&!supplies[0].error&&total!==null&&circulating!==null&&nonCirculating!==null&&total===circulating+nonCirculating&&Number.isSafeInteger(slot)&&slot>0;
 const second=valid?await rpc(fetch_impl,{jsonrpc:'2.0',id:3,method:'getBlockTime',params:[slot]}):{network_calls:0,ok:false,payload:null,error:'EXACT_SOLANA_MAINNET_FINALIZED_SUPPLY_REQUIRED'};
 const seconds=second.payload?.result,clockValid=second.ok&&second.payload?.id===3&&!second.payload.error&&Number.isSafeInteger(seconds)&&seconds>0;
 return{receipts:[{route:'SOLANA_MAINNET_GENESIS_AND_FINALIZED_NATIVE_SUPPLY',...first},{route:'SOLANA_NATIVE_SLOT_CLOCK',...second}],attempts:first.network_calls+second.network_calls,current:valid&&clockValid?{supply:String(total),decimals:9,block_ref:String(slot),source_ts:seconds*1000,finalized:true,genesis_hash:SOLANA_MAINNET_GENESIS,commitment:'finalized'}:null};
}
