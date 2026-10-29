// Repeated READS of an observed busy executor are bounded within one grant.
// Transport errors propagate immediately; no failed request is retried.
export async function readPausedExecutorBounded({store,maximum_reads,wait_ms,clock=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
 if(!Number.isSafeInteger(maximum_reads)||maximum_reads<1||maximum_reads>6||wait_ms!==20000)throw Error('BOUNDED_EXECUTOR_READ_SCOPE_REQUIRED');
 let executor=null,reads=0,busy=false;
 for(;reads<maximum_reads;){
  executor=await store.get('pump:executor');reads++;
  // A missing PK is null. Any present JSON value must explicitly describe
  // an unowned executor or a nonempty owner; malformed state is never free.
  if(executor===null)busy=false;
  else if(typeof executor==='object'&&!Array.isArray(executor)&&Object.hasOwn(executor,'owner')&&executor.owner===null)busy=false;
  else if(typeof executor==='object'&&!Array.isArray(executor)&&Object.hasOwn(executor,'owner')&&typeof executor.owner==='string'&&executor.owner.trim().length>0)busy=true;
  else throw Error('EXECUTOR_STATE_INVALID_DO_NOT_DEPLOY');
  if(!busy)break;
  if(reads<maximum_reads)await sleep(wait_ms);
 }
 return{status:busy?'IN_FLIGHT_DO_NOT_DEPLOY':'QUIESCENT_CODE_UPDATE_ALLOWED',executor,observed_ts:clock(),executor_PK_reads:reads,business_history_not_read:true,resources_not_read:true,market_HTTP:0,Telegram:0};
}
