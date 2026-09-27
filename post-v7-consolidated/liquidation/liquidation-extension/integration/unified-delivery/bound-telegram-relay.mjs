// Canonical delivery transport. Legacy V7 sender is preserved unchanged.
const text=v=>v==null?'':String(v).trim();
export async function sendLifecycleRelay({relay_url,relay_key,text:message,fetch_impl=globalThis.fetch,timeout_ms=8000}={}){
  const url=text(relay_url),key=text(relay_key),msg=text(message);
  if(!url||!key||!msg)return {ok:false,network_result:'CONFIG_ERROR',status:'RELAY_NOT_CONFIGURED',message_id:null};
  if(Array.from(msg).length>4096)return {ok:false,network_result:'RENDER_ERROR',status:'MESSAGE_TOO_LONG_NO_NETWORK',message_id:null};
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),Math.max(1000,Number(timeout_ms)||8000));
  try{
    const response=await fetch_impl(url,{method:'POST',headers:{'content-type':'application/json; charset=UTF-8',authorization:`Bearer ${key}`},body:JSON.stringify({text:msg}),signal:controller.signal});
    let body=null;try{body=await response.json();}catch{body=null;}
    const ackId=body?.message_id;const ackValid=(typeof ackId==='number'||typeof ackId==='string'&&/^[1-9]\d*$/.test(ackId))&&Number.isSafeInteger(Number(ackId))&&Number(ackId)>0;
    if(response.ok&&body?.ok===true&&ackValid)return {ok:true,network_result:'CONFIRMED_SENT',status:text(body.status)||'SENT',message_id:ackId,http_status:response.status};
    if(response.ok&&body?.ok===true)return {ok:false,network_result:'ACK_UNCERTAIN_NO_RETRY',status:'ACK_MESSAGE_ID_MISSING_OR_INVALID',message_id:null,http_status:response.status};
    if(response.status>=500)return {ok:false,network_result:'5XX',status:'RELAY_5XX',message_id:null,http_status:response.status};
    if(body?.ok===false)return {ok:false,network_result:'REJECTED',status:text(body.status)||'RELAY_REJECTED',message_id:null,http_status:response.status};
    return {ok:false,network_result:'UNKNOWN',status:'AMBIGUOUS_RELAY_RESPONSE',message_id:null,http_status:response.status};
  }catch(error){
    if(error?.name==='AbortError')return {ok:false,network_result:'TIMEOUT',status:'RELAY_TIMEOUT',message_id:null};
    return {ok:false,network_result:'NETWORK_ERROR',status:'NETWORK_ERROR',message_id:null};
  }finally{clearTimeout(timer);}
}

