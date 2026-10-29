// Repeated READS of an observed busy executor are bounded within one grant.
// Transport errors propagate immediately; no failed request is retried.
export async function readPausedExecutorBounded({store,maximum_reads,wait_ms,clock=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
 if(!Number.isSafeInteger(maximum_reads)||maximum_reads<1||maximum_reads>6||wait_ms!==20000)throw Error('BOUNDED_EXECUTOR_READ_SCOPE_REQUIRED');
 let executor=null,reads=0;
 for(;reads<maximum_reads;){
  executor=await store.get('pump:executor');reads++;
  if(!executor?.owner)break;
  if(reads<maximum_reads)await sleep(wait_ms);
 }
 return{status:executor?.owner?'IN_FLIGHT_DO_NOT_DEPLOY':'QUIESCENT_CODE_UPDATE_ALLOWED',executor,observed_ts:clock(),executor_PK_reads:reads,business_history_not_read:true,resources_not_read:true,market_HTTP:0,Telegram:0};
}
