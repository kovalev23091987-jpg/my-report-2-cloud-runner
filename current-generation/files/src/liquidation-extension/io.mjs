import {permittedGTradePinnedRpcBatch,permittedGTradeRpcUrl} from './gtrade-pinned-position-snapshot.mjs';
import {createHash} from 'node:crypto';
const ALLOWED=new Set(['arbitrum-one-rpc.publicnode.com','arb1.arbitrum.io','trade.hyperperps.app','api.hyperliquid.xyz','api.0xarchive.io','bykaranteli.com','backend-arbitrum.gains.trade','backend-pricing.eu.gains.trade','xoomar.com','node.liqflow.app','mainnet.zklighter.elliot.ai','arbitrum.gmxapi.io','gmx.squids.live']);
export function providerErrorDetails(payload,{headers={},request_id=null}={}){
 const token=v=>typeof v==='number'?String(v):typeof v==='string'&&/^[A-Za-z0-9_.:-]{1,100}$/.test(v)?v:null;
 let message=payload?.error?.message??payload?.message??(typeof payload?.error==='string'?payload.error:null);
 if(typeof message==='string'){for(const [name,value]of Object.entries(headers))if(/authorization|api[-_]key/i.test(name)&&typeof value==='string'&&value){message=message.split(value).join('[REDACTED]');const bearer=value.replace(/^Bearer\s+/i,'');if(bearer!==value)message=message.split(bearer).join('[REDACTED]');}message=message.replace(/[\r\n\x00-\x1f]/g,' ').slice(0,240);}else message=null;
 return{code:token(payload?.error?.code??payload?.error_code??payload?.code),param:token(payload?.param),message,request_id:token(payload?.meta?.request_id??payload?.request_id??request_id)};
}
export async function readJson(url,{method='GET',body,headers={},fetch_impl=globalThis.fetch,timeout_ms=15000,max_bytes=8000000,clock=Date.now}={}){
 const u=new URL(url);
 if(u.protocol!=='https:'||u.username||u.password||!ALLOWED.has(u.hostname))throw Error('SOURCE_URL_NOT_ALLOWLISTED');
 if(['arb1.arbitrum.io','arbitrum-one-rpc.publicnode.com'].includes(u.hostname)&&(!permittedGTradeRpcUrl(u)||method!=='POST'))throw Error('EXACT_PINNED_RPC_ROUTE_REQUIRED');
 if(!['GET','POST'].includes(method))throw Error('READ_ONLY_METHOD_REQUIRED');
 if(method==='POST'){
  const hyper=u.hostname==='api.hyperliquid.xyz'&&u.pathname==='/info'&&['metaAndAssetCtxs','recentTrades','clearinghouseState'].includes(body?.type);
  const gmx=u.hostname==='gmx.squids.live'&&u.pathname==='/gmx-synthetics-arbitrum:prod/api/graphql'&&typeof body?.query==='string'&&body.query.startsWith('query RepresentativeGmxPositions')&&/^0x[0-9a-f]{40}$/i.test(body?.variables?.market||'');
  const gtrade=permittedGTradeRpcUrl(u)&&permittedGTradePinnedRpcBatch(body);
  if(!hyper&&!gmx&&!gtrade)throw Error('UNAPPROVED_POST_OPERATION');
 }
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout_ms);
 const receipt={url:u.toString(),method,started_ts:clock(),request_body:body??null,transport:'DIRECT_READ_ONLY_HTTP',authentication:Object.keys(headers).some(k=>/authorization|api-key/i.test(k))?'CALLER_CONFIGURED_HEADER':'NONE'};
 try{
  const r=await fetch_impl(u.toString(),{method,headers:{accept:'application/json',...(body?{'content-type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{}),signal:controller.signal,redirect:'error'});
  receipt.http_status=r.status;receipt.received_ts=clock();receipt.retry_after=r.headers?.get?.('retry-after')??null;
  const length=Number(r.headers?.get?.('content-length')||0);if(length>max_bytes)throw Error('RESPONSE_SIZE_LIMIT');
  const parts=[];let size=0;
  if(r.body?.getReader){const reader=r.body.getReader();while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max_bytes){await reader.cancel();throw Error('RESPONSE_SIZE_LIMIT');}parts.push(Buffer.from(value));}}
  else{const t=await r.text();parts.push(Buffer.from(t));size=parts[0].length;if(size>max_bytes)throw Error('RESPONSE_SIZE_LIMIT');}
  const bytes=Buffer.concat(parts);receipt.bytes=bytes.length;receipt.sha256=createHash('sha256').update(bytes).digest('hex');
  receipt.received_ts=clock();
  if(!r.ok){let errorBody=null;try{errorBody=JSON.parse(bytes.toString('utf8'));}catch{}const provider_error=providerErrorDetails(errorBody,{headers,request_id:r.headers?.get?.('x-request-id')});receipt.provider_error=provider_error;return {ok:false,reason:r.status===401||r.status===403?'ACCESS_REQUIRED':r.status===429?'RATE_LIMITED':'HTTP_ERROR',receipt,provider_error,payload:null};}
  let payload;try{payload=JSON.parse(bytes.toString('utf8'));}catch{return {ok:false,reason:'JSON_INVALID',receipt,payload:null};}
  return {ok:true,receipt,payload,raw_bytes:bytes};
 }catch(e){return {ok:false,reason:e?.name==='AbortError'?'TIMEOUT':e?.message==='RESPONSE_SIZE_LIMIT'?'RESPONSE_SIZE_LIMIT':'NETWORK_OR_TRANSPORT_ERROR',receipt:{...receipt,received_ts:clock()},payload:null};}
 finally{clearTimeout(timer);}
}
export async function fetchHyperperps(symbol,options={}){
 if(!['BTC','ETH','SOL'].includes(symbol))return {ok:false,reason:'SYMBOL_OUTSIDE_DOCUMENTED_COVERAGE',payload:null};
 return readJson('https://trade.hyperperps.app/api/public/heatmap/'+symbol,options);
}
export async function fetchOxArchive(symbol,{api_key,credit_cost_verified=false,...options}={}){
 if(!api_key)return {ok:false,reason:'SEPARATE_FREE_RUNNER_KEY_REQUIRED',payload:null};
 if(!credit_cost_verified)return {ok:false,reason:'PER_REQUEST_CREDIT_COST_NOT_VERIFIED',payload:null};
 return readJson(`https://api.0xarchive.io/v1/hyperliquid/liquidations/${encodeURIComponent(symbol)}/levels?range_pct=50&buckets=100`,{...options,headers:{'X-API-Key':api_key}});
}
export async function fetchByk(symbol,{api_key,protected_fetch_impl,...options}={}){
 if(!api_key&&!protected_fetch_impl)return {ok:false,reason:'EXISTING_PROTECTED_ROUTE_OR_FREE_KEY_REQUIRED',payload:null};
 return readJson(`https://bykaranteli.com/api/liqmap/public?symbol=${encodeURIComponent(symbol)}`,{...options,...(protected_fetch_impl?{fetch_impl:protected_fetch_impl}:{headers:{'x-api-key':api_key}})});
}
export async function fetchNativeHLState(address,options={}){
 if(!/^0x[0-9a-f]{40}$/i.test(address))throw Error('INVALID_PUBLIC_ACCOUNT');
 return readJson('https://api.hyperliquid.xyz/info',{...options,method:'POST',body:{type:'clearinghouseState',user:address}});
}
