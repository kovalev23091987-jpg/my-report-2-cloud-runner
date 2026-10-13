// Exact native finalized ledger headers. Provider/chain subsets are not an
// identity discovery mechanism and never convert issued assets into natives.
export const NATIVE_LEDGER_SUPPLY_VERSION='native-finalized-ledger-supply-v1-20261007';
export const NATIVE_LEDGER_FAMILIES=Object.freeze({
 xrp:{contract:'XRP-USDT',decimals:6,provider:'XRPL_NATIVE_SUPPLY',upstream:'XRPL_INFTF_MAINNET_RPC',url:'https://xrplcluster.com/',attempts:3,daily_cap:24},
 stellar:{contract:'XLM-USDT',decimals:7,provider:'STELLAR_NATIVE_SUPPLY',upstream:'STELLAR_SDF_MAINNET_HORIZON',url:'https://horizon.stellar.org/',attempts:2,daily_cap:24},
});
const clean=v=>String(v??'').trim(),hash=v=>/^[a-f0-9]{64}$/i.test(clean(v));
const integer=v=>typeof v==='number'?Number.isSafeInteger(v)&&v>0?v:null:/^[1-9]\d*$/.test(clean(v))&&Number.isSafeInteger(Number(v))?Number(v):null;
const clock=v=>typeof v==='string'&&/Z$/.test(v)&&Number.isSafeInteger(Date.parse(v))?Date.parse(v):null;
const fail=status=>({status,current:null,previous:null});
// Original public RPC quota headers contain no API key or client identity.
// An absent/malformed limit stays unknown; it is never an unlimited quota.
export function nativeRpcQuotaReceipt(response,payload,observed_ts){
 const number=name=>{const value=response?.headers?.get?.(name);return typeof value==='string'&&/^\d{1,9}$/.test(value)&&Number.isSafeInteger(Number(value))?Number(value):null;};
 if(!Number.isSafeInteger(observed_ts)||observed_ts<=0)return null;
 const limit=number('ratelimit-limit'),remaining=number('ratelimit-remaining'),reset=number('ratelimit-reset'),retry=number('retry-after'),warning=payload?.warning==='load'||payload?.result?.warning==='load';
 const validReset=reset!==null&&reset>0&&reset<=86400?reset:null,validRetry=retry!==null&&retry>0&&retry<=86400?retry:null;
 const exhausted=remaining===0||[429,503].includes(response?.status)||warning;
 const wait=exhausted?(validRetry??validReset??60):null;
 if(limit===null&&remaining===null&&validReset===null&&validRetry===null&&!exhausted)return null;
 return{schema:'XRPL_PUBLIC_RPC_QUOTA_RECEIPT_V1',observed_ts,http_status:response?.status??null,limit,remaining,reset_seconds:validReset,retry_after_seconds:validRetry,load_warning:warning,retry_after_ts:wait===null?null:observed_ts+wait*1000,wait_basis:wait===null?null:validRetry?'ORIGINAL_RETRY_AFTER':validReset?'ORIGINAL_BINDING_QUOTA_RESET':'CONSERVATIVE_60S_LOAD_BACKOFF',published_daily_allowance:null};
}
export function nativeRpcQuotaWait(quota,now){
 return quota?.schema==='XRPL_PUBLIC_RPC_QUOTA_RECEIPT_V1'&&Number.isSafeInteger(now)&&Number.isSafeInteger(quota.observed_ts)&&quota.observed_ts<=now&&Number.isSafeInteger(quota.retry_after_ts)&&quota.retry_after_ts>now&&quota.retry_after_ts<=quota.observed_ts+86400000?quota.retry_after_ts:null;
}
export function xrplNodeHealthy(network){const r=network?.result,i=r?.info,v=i?.validated_ledger;if(r?.status!=='success'||!i||i.corruption_detected===true||i.amendment_blocked===true||i.network_id!==undefined&&Number(i.network_id)!==0||!Number.isSafeInteger(v?.age)||v.age<0||v.age>120||!hash(v.hash)||!integer(v.seq))return false;return ['full','validating','proposing'].includes(i.server_state)||typeof i.clio_version==='string'&&r.validated===true;}
export function exactNativeLedgerIdentity(contract,identity){
 const d=NATIVE_LEDGER_FAMILIES[identity?.chain];
 return Boolean(d&&contract===d.contract&&identity?.asset_kind==='NATIVE'&&identity.native_asset_id===`${identity.chain}:mainnet`&&identity.contract_or_mint===null);
}
export function decimalBaseUnits(value,decimals){
 if(typeof value!=='string'||!/^\d+(?:\.\d+)?$/.test(value))return null;
 const [whole,fraction='']=value.split('.');if(fraction.length>decimals)return null;
 const n=BigInt(whole)*10n**BigInt(decimals)+BigInt(fraction.padEnd(decimals,'0')||'0');return n>0n?n.toString():null;
}
function xrplHeader(payload){
 const r=payload?.result,l=r?.ledger,sequence=integer(l?.ledger_index),outerSequence=integer(r?.ledger_index),rippleSeconds=integer(l?.close_time),iso=clock(l?.close_time_iso),ts=rippleSeconds===null?null:(rippleSeconds+946684800)*1000;
 if(r?.status!=='success'||r.validated!==true||l?.closed!==true||!sequence||sequence!==outerSequence||!hash(l.ledger_hash)||clean(l.ledger_hash).toUpperCase()!==clean(r.ledger_hash).toUpperCase()||!hash(l.parent_hash)||ts===null||iso!==null&&iso!==ts||typeof l.total_coins!=='string'||!/^\d+$/.test(l.total_coins)||BigInt(l.total_coins)<=0n||BigInt(l.total_coins)>100000000000000000n)return null;
 return{chain:'xrp',address:'native:mainnet',supply:l.total_coins,decimals:6,block_ref:l.ledger_hash,source_ts:ts,finalized:true,ledger_index:sequence,parent_hash:l.parent_hash,supply_measure:'VALIDATED_XRPL_TOTAL_XRP_DROPS',unit:'drops',provider_query:'ledger(validated) / ledger(parent_hash)',close_time_resolution:l.close_time_resolution??null};
}
function stellarHeader(row){
 const seq=integer(row?.sequence),ts=clock(row?.closed_at),supply=decimalBaseUnits(row?.total_coins,7);
 if(!seq||ts===null||supply===null||!hash(row?.hash)||!hash(row?.prev_hash)||clean(row.id).toLowerCase()!==clean(row.hash).toLowerCase())return null;
 const link=row?._links?.self?.href;try{if(link!==`https://horizon.stellar.org/ledgers/${seq}`)return null;}catch{return null;}
 return{chain:'stellar',address:'native:mainnet',supply,decimals:7,block_ref:row.hash,source_ts:ts,finalized:true,ledger_index:seq,parent_hash:row.prev_hash,supply_measure:'CLOSED_STELLAR_LEDGER_TOTAL_COINS',unit:'stroops',provider_query:'mainnet Horizon /ledgers?order=desc&limit=2'};
}
export function normalizeNativeLedgerPair({chain,network,current_payload,previous_payload,observed_ts}={}){
 if(!Number.isSafeInteger(observed_ts)||observed_ts<=0)return fail('OBSERVATION_CLOCK_REQUIRED');
 let current,previous;
 if(chain==='xrp'){
  const info=network?.result?.info;
  // The transport is pinned to the issuer-documented mainnet endpoint. Reject
  // explicit other network IDs or a node that is not caught up. Older rippled
  // builds omit network_id; omission is not a fake independent network claim.
  if(!xrplNodeHealthy(network))return fail('XRPL_MAINNET_NODE_NOT_CLOSED');
  current=xrplHeader(current_payload);previous=xrplHeader(previous_payload);
 }else if(chain==='stellar'){
  if(network?.network_passphrase!=='Public Global Stellar Network ; September 2015')return fail('STELLAR_MAINNET_NETWORK_REQUIRED');
  const rows=current_payload?._embedded?.records;if(!Array.isArray(rows)||rows.length!==2)return fail('TWO_EXACT_CLOSED_LEDGERS_REQUIRED');
  current=stellarHeader(rows[0]);previous=stellarHeader(rows[1]);
 }else return fail('UNSUPPORTED_NATIVE_LEDGER_FAMILY');
 if(!current||!previous)return fail('FINALIZED_LEDGER_HEADER_SCHEMA_REQUIRED');
 if(current.ledger_index!==previous.ledger_index+1||clean(current.parent_hash).toLowerCase()!==clean(previous.block_ref).toLowerCase()||current.source_ts<=previous.source_ts)return fail('ADJACENT_FINALIZED_LEDGER_CHAIN_REQUIRED');
 if(current.source_ts>observed_ts||previous.source_ts>observed_ts||observed_ts-current.source_ts>20*60_000)return fail('FINALIZED_LEDGER_CLOCK_NOT_CURRENT');
 current.native_ledger_pair_payload={chain,network,current_payload,previous_payload,observed_ts};
 return{status:'CLOSED',current,previous,method:'ADJACENT_PRIMARY_FINALIZED_NATIVE_LEDGER_HEADERS',burn_or_buyback_cause_verified:false,directional_vote:false};
}
async function jsonRequest(fetch_impl,url,body=null,readClock=Date.now){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
 try{const response=await fetch_impl(url,{method:body?'POST':'GET',headers:{accept:'application/json','user-agent':'My-Report-2/native-ledger-supply-v1',...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:controller.signal});const raw=await response.text(),observed=readClock();let payload=null,error=null;
  if(Buffer.byteLength(raw)>64*1024)error='RESPONSE_TOO_LARGE';else try{payload=JSON.parse(raw);}catch{error='SOURCE_SCHEMA_ERROR';}
  const quota=url===NATIVE_LEDGER_FAMILIES.xrp.url?nativeRpcQuotaReceipt(response,payload,observed):null,ok=response.ok&&!payload?.error&&!payload?.result?.error&&!error;
  return{network_calls:1,ok,http_status:response.status,payload,error:error||(!ok?`HTTP_OR_RPC_${response.status}`:null),...(quota?{provider_quota:quota}:{})};
 }catch(e){return{network_calls:1,ok:false,http_status:null,payload:null,error:e?.name==='AbortError'?'TIMEOUT':String(e?.message||e).slice(0,160)};}finally{clearTimeout(timer);}
}
export async function fetchNativeLedgerSupply(fetch_impl,id,{clock:readClock=Date.now}={}){
 const d=NATIVE_LEDGER_FAMILIES[id?.chain];if(!d)return{attempts:0,receipts:[],current:null,previous:null,status:'UNSUPPORTED_NATIVE_LEDGER_FAMILY'};
 const receipts=[];let network,cur,prior;
 if(id.chain==='xrp'){
  network=await jsonRequest(fetch_impl,d.url,{method:'server_info',params:[{}]},readClock);receipts.push({route:'XRPL_MAINNET_NETWORK',...network,payload:undefined});
  if(nativeRpcQuotaWait(network.provider_quota,readClock()))return{attempts:receipts.length,receipts,current:null,previous:null,status:'PROVIDER_RATE_LIMIT_WAIT'};
  const info=network.payload?.result?.info;if(!network.ok||!xrplNodeHealthy(network.payload))return{attempts:receipts.length,receipts,current:null,previous:null,status:'XRPL_MAINNET_NODE_NOT_CLOSED'};
  cur=await jsonRequest(fetch_impl,d.url,{method:'ledger',params:[{ledger_index:'validated',transactions:false,expand:false,api_version:2}]},readClock);receipts.push({route:'XRPL_VALIDATED_LEDGER',...cur,payload:undefined});
  if(nativeRpcQuotaWait(cur.provider_quota,readClock()))return{attempts:receipts.length,receipts,current:null,previous:null,status:'PROVIDER_RATE_LIMIT_WAIT'};
  const h=xrplHeader(cur.payload);if(!cur.ok||!h)return{attempts:receipts.length,receipts,current:null,previous:null,status:'FINALIZED_LEDGER_HEADER_SCHEMA_REQUIRED'};
  prior=await jsonRequest(fetch_impl,d.url,{method:'ledger',params:[{ledger_hash:h.parent_hash,transactions:false,expand:false,api_version:2}]},readClock);receipts.push({route:'XRPL_EXACT_PARENT_LEDGER',...prior,payload:undefined});
 }else{
  network=await jsonRequest(fetch_impl,d.url);receipts.push({route:'STELLAR_MAINNET_NETWORK',...network,payload:undefined});
  if(!network.ok||network.payload?.network_passphrase!=='Public Global Stellar Network ; September 2015')return{attempts:receipts.length,receipts,current:null,previous:null,status:'STELLAR_MAINNET_NETWORK_REQUIRED'};
  cur=await jsonRequest(fetch_impl,`${d.url}ledgers?order=desc&limit=2`);receipts.push({route:'STELLAR_TWO_CLOSED_LEDGERS',...cur,payload:undefined});
 }
 const normalized=normalizeNativeLedgerPair({chain:id.chain,network:network.payload,current_payload:cur?.payload,previous_payload:prior?.payload,observed_ts:readClock()});
 return{...normalized,attempts:receipts.length,receipts};
}
