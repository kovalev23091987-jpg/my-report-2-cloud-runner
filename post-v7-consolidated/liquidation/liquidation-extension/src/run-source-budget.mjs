const DEFAULT_RATE=Object.freeze({HYPERLIQUID:12,LIQFLOW:6,GTRADE:6});
const providerOf=(url,init)=>{
 const u=new URL(String(url)),method=String(init?.method||'GET').toUpperCase();
 if(u.protocol!=='https:'||u.username||u.password)throw Error('READ_ONLY_SOURCE_URL_REQUIRED');
 if(u.hostname==='api.hyperliquid.xyz'&&u.pathname==='/info'&&method==='POST'){
  let b;try{b=JSON.parse(init.body);}catch{throw Error('READ_ONLY_BODY_REQUIRED');}
  if(['metaAndAssetCtxs','clearinghouseState','recentTrades'].includes(b?.type))return 'HYPERLIQUID';
 }
 if(u.hostname==='node.liqflow.app'&&/^\/api\/coin\/[^/]+\/positions$/.test(u.pathname)&&method==='GET')return 'LIQFLOW';
 if(method==='GET'&&((u.hostname==='backend-arbitrum.gains.trade'&&['/open-trades','/trading-variables'].includes(u.pathname))||(u.hostname==='backend-pricing.eu.gains.trade'&&u.pathname==='/charts')))return 'GTRADE';
 throw Error('SOURCE_OPERATION_NOT_ALLOWLISTED');
};
// Local ceilings are deliberately conservative operational policy, not a claim
// that the provider contract grants this free quota. Provider admission remains
// mandatory and owns shared-account balances; this wrapper never provisions them.
export function createSharedSourceBudget({provider_admit,fetch_impl=globalThis.fetch,clock=Date.now,max_requests=24,max_parallel=2,max_total_ms=45000,per_minute_limits=DEFAULT_RATE,max_response_bytes=8000000}={}){
 if(typeof provider_admit!=='function'||typeof fetch_impl!=='function'||!Number.isInteger(max_requests)||max_requests<1||max_requests>24||!Number.isInteger(max_parallel)||max_parallel<1||max_parallel>2||!Number.isInteger(max_total_ms)||max_total_ms<100||max_total_ms>45000)throw Error('EXPLICIT_BOUNDED_RUN_POLICY_REQUIRED');
 let phaseStart=null,reserved=0,claimed=0,actual=0,active=0,peak=0;
 const attempts=new Set(),granted=new Map(),claimedByProvider=new Map(),rates=new Map(),dispatchRates=new Map(),pending=[];
 const errors=[];const abort=()=>new DOMException('Source request aborted before or during execution','AbortError');
 const deadlineOk=()=>phaseStart!==null&&clock()-phaseStart<max_total_ms;
 function reserveRate(provider,units,minute){const cap=per_minute_limits[provider],key=provider+':'+minute;if(!Number.isInteger(cap)||cap<1||units+(rates.get(key)||0)>cap)return false;return true;}
 async function admit(request){
  const no=reason=>({allowed:false,new_reservation:false,reason});
  if(!request||typeof request.reservation_id!=='string'||!request.reservation_id||!Number.isFinite(request.deadline_ts)||request.deadline_ts<=clock())return no('SOURCE_REQUEST_ID_OR_DEADLINE_INVALID');
  if(attempts.has(request.reservation_id))return no('LOCAL_RESERVATION_ALREADY_ATTEMPTED');
  const parts=Object.entries(request.requests??{});const n=parts.reduce((sum,[,v])=>sum+v,0);
  if(!parts.length||parts.some(([p,v])=>!Object.hasOwn(per_minute_limits,p)||!Number.isSafeInteger(v)||v<=0)||!Number.isSafeInteger(n)||n!==request.max_requests)return no('REQUEST_COST_NOT_EXACT');
  if(phaseStart===null)phaseStart=clock();if(!deadlineOk())return no('WHOLE_SOURCE_PHASE_EXPIRED');
  if(reserved+n>max_requests)return no('COMBINED_RUN_HTTP_BUDGET');
  const minute=Math.floor(clock()/60000);if(parts.some(([p,v])=>!reserveRate(p,v,minute)))return no('LOCAL_PROVIDER_RATE_CEILING');
  // Reserve synchronously before any await, including denied/ambiguous attempts.
  attempts.add(request.reservation_id);reserved+=n;for(const [p,v]of parts){const k=p+':'+minute;rates.set(k,(rates.get(k)||0)+v);}
  let result;try{result=await provider_admit(request);}catch{errors.push('UPSTREAM_QUOTA_ACK_UNKNOWN');return no('UPSTREAM_QUOTA_ACK_UNKNOWN');}
  if(result?.allowed!==true||result?.new_reservation!==true)return no('UPSTREAM_QUOTA_NOT_GRANTED');
  if(!deadlineOk()||clock()>=request.deadline_ts)return no('SOURCE_PHASE_EXPIRED_AFTER_QUOTA_ACK');
  for(const [p,v]of parts)granted.set(p,(granted.get(p)||0)+v);
  return {...result,combined_local_reservation:true,local_rates_are_policy_not_provider_entitlement:true};
 }
 function slot(signal){
  if(signal?.aborted)return Promise.reject(abort());
  if(active<max_parallel){active++;peak=Math.max(peak,active);return Promise.resolve();}
  return new Promise((resolve,reject)=>{const item={resolve,reject,signal,handler:null};item.handler=()=>{const i=pending.indexOf(item);if(i>=0)pending.splice(i,1);reject(abort());};signal?.addEventListener('abort',item.handler,{once:true});pending.push(item);});
 }
 function release(){active--;while(pending.length){const item=pending.shift();item.signal?.removeEventListener('abort',item.handler);if(item.signal?.aborted){item.reject(abort());continue;}active++;peak=Math.max(peak,active);item.resolve();break;}}
 // The source-phase timer is independent of per-request callers and spans body reads.
 async function guardedFetch(url,init={}){
  const provider=providerOf(url,init);if(!deadlineOk())throw Error('WHOLE_SOURCE_PHASE_EXPIRED');
  const used=claimedByProvider.get(provider)||0;if(used>=(granted.get(provider)||0)||claimed>=max_requests)throw Error('NETWORK_WITHOUT_CONFIRMED_QUOTA_RESERVATION');
  claimedByProvider.set(provider,used+1);claimed++;
  const controller=new AbortController();const forward=()=>controller.abort();
  if(init.signal?.aborted)controller.abort();else init.signal?.addEventListener('abort',forward,{once:true});
  const timer=setTimeout(()=>controller.abort(),Math.max(1,phaseStart+max_total_ms-clock()));let acquired=false,reader=null;
  // Handles even a faulty transport that ignores AbortSignal; its late rejection
  // is consumed, while the budget slot is released deterministically.
  const untilAbort=fn=>new Promise((resolve,reject)=>{
   if(controller.signal.aborted){reject(abort());return;}
   const cancel=()=>reject(abort());controller.signal.addEventListener('abort',cancel,{once:true});
   Promise.resolve().then(fn).then(v=>{controller.signal.removeEventListener('abort',cancel);resolve(v);},e=>{controller.signal.removeEventListener('abort',cancel);reject(e);});
  });
  try{
   await slot(controller.signal);acquired=true;
   if(controller.signal.aborted)throw abort();if(!deadlineOk())throw Error('WHOLE_SOURCE_PHASE_EXPIRED');
   const dispatchKey=provider+':'+Math.floor(clock()/60000),dispatchUsed=dispatchRates.get(dispatchKey)||0;
   if(dispatchUsed>=per_minute_limits[provider])throw Error('ACTUAL_PROVIDER_RATE_CEILING');
   dispatchRates.set(dispatchKey,dispatchUsed+1);actual++;
   const response=await untilAbort(()=>fetch_impl(url,{...init,signal:controller.signal}));const parts=[];let bytes=0;
   const declared=Number(response.headers?.get('content-length')||0);if(declared>max_response_bytes)throw Error('SOURCE_RESPONSE_OVER_MEMORY_BOUND');
   reader=response.body?.getReader?.();
   if(reader){while(true){const {done,value}=await untilAbort(()=>reader.read());if(done)break;bytes+=value.byteLength;if(bytes>max_response_bytes)throw Error('SOURCE_RESPONSE_OVER_MEMORY_BOUND');parts.push(Buffer.from(value));}}
   else{const b=Buffer.from(await untilAbort(()=>response.arrayBuffer()));if(b.length>max_response_bytes)throw Error('SOURCE_RESPONSE_OVER_MEMORY_BOUND');parts.push(b);}
   return new Response(Buffer.concat(parts),{status:response.status,statusText:response.statusText,headers:response.headers});
  }catch(e){if(reader){try{Promise.resolve(reader.cancel()).catch(()=>{});}catch{}}throw e;
  }finally{clearTimeout(timer);init.signal?.removeEventListener('abort',forward);if(acquired)release();}
 }

 return {admit,fetch:guardedFetch,summary:()=>({reserved_http:reserved,claimed_http:claimed,actual_http:actual,max_http:max_requests,active,peak_parallel:peak,max_parallel,queued:pending.length,phase_started_ts:phaseStart,max_total_ms,per_minute_limits:{...per_minute_limits},scope:'SAME_RUN_ALL_NEW_PROVIDERS',actual_dispatch_rate_enforced:true,phase_deadline_actively_enforced:true,provider_quota_provisioned:false,errors:[...errors]})};
}
