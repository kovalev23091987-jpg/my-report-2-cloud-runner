import {createHash} from 'node:crypto';
import {singleActiveVersion} from './htx-coordinated-rollout.mjs';
import {receiptProjection} from './native-cost-observations.mjs';
const hash=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex'),name='my-report-2-hub',tag='REPORT2_PUBLIC_COLLECTOR_NATIVE_D1',schema='PUBLIC_COLLECTOR_NATIVE_INVOCATION_USAGE_V1';
export function tailNativeEvidence(frame,{opened_ts,received_ts,version}={}){
 if(!Number.isSafeInteger(opened_ts)||!Number.isSafeInteger(received_ts)||opened_ts<=0||received_ts<opened_ts||frame?.scriptName!==name||!['*/5 * * * *','3-58/5 * * * *'].includes(frame?.event?.cron)||!Number.isSafeInteger(frame.eventTimestamp)||frame.eventTimestamp<opened_ts||frame.eventTimestamp>received_ts||frame.truncated===true||!Array.isArray(frame.logs)||frame.logs.length>128)return[];
 const out=[];for(const l of frame.logs){
  if(!Array.isArray(l.message)||l.message.length!==2||l.message[0]!==tag||typeof l.message[1]!=='string'||l.message[1].length>20000||!Number.isSafeInteger(l.timestamp)||l.timestamp<frame.eventTimestamp||l.timestamp>received_ts)continue;
  let raw;try{raw=JSON.parse(l.message[1]);}catch{continue;}const receipt=receiptProjection(raw,schema);if(!receipt||!Number.isSafeInteger(receipt.started_ts)||!Number.isSafeInteger(receipt.completed_ts)||receipt.started_ts<frame.eventTimestamp||receipt.completed_ts<receipt.started_ts||receipt.completed_ts>l.timestamp)continue;
  // The tail API is explicitly filtered to this immutable version. Tail event
  // payloads need not have a scriptVersion field; never invent that field.
  const explicit=frame.scriptVersion?.id??frame.scriptVersion;if(explicit&&explicit!==version)continue;
  out.push({worker:name,version,version_binding_basis:explicit?'EXPLICIT_TAIL_EVENT_VERSION':'EXACT_TAIL_VERSION_FILTER_AND_STABLE_DEPLOYMENT',event_ts:frame.eventTimestamp,log_ts:l.timestamp,received_ts,receipt_sha256:hash(raw),original_native_message:l.message[1],receipt,daily_total:false});
 }
 const unique=new Map(out.map(e=>[e.receipt_sha256,e]));return unique.size===1?[...unique.values()]:[];
}
export async function captureCollectorNativeTail({call,guard,open,save=async()=>{},clock=Date.now,max_wait_ms=330000}={}){
 if(!Number.isSafeInteger(max_wait_ms)||max_wait_ms<1||max_wait_ms>330000)throw Error('TAIL_WAIT_BOUND');await guard();
 const root='/workers/scripts/'+name,before=singleActiveVersion(await call(root+'/deployments'));
 const out={schema:'BOUNDED_COLLECTOR_NATIVE_TAIL_V1',worker:name,before,started_ts:clock(),status:'TAIL_NOT_CREATED',filters:{filters:[{query:tag},{scriptVersion:before.version_id}]},frames:0,wire_bytes:0,receipts:[],tail_created:false,tail_deleted:false,websocket_connections:0,settings_changed:false,sourceHTTP:0,SQL:0,MAIN:0,Telegram:0,Worker_invocations:0,whole_day_closed:false,daily_total:null};
 let tail,socket,createdAttempted=false;
 try{
  await guard();createdAttempted=true;tail=await call(root+'/tails',{method:'POST',body:out.filters});
  if(typeof tail?.id!=='string'||!/^([a-f0-9]{32}|[a-f0-9-]{36})$/.test(tail.id))throw Error('EXACT_OWN_TAIL_ID_REQUIRED');out.tail_created=true;out.tail_id=tail.id;out.expires_at=tail.expires_at;out.status='TAIL_CREATED_AWAITING_REGULAR_CRON';await save(out);
  const url=new URL(tail.url);if(url.protocol!=='wss:'||url.hostname!=='tail.developers.workers.dev'||url.username||url.password||url.port)throw Error('EXACT_CLOUDFLARE_TAIL_HOST_REQUIRED');
  const expiry=Date.parse(tail.expires_at);if(!Number.isFinite(expiry)||expiry-clock()<max_wait_ms+20000)throw Error('TAIL_SESSION_HEADROOM_REQUIRED');
  await guard();socket=open(url.href,'trace-v1');out.websocket_connections=1;socket.binaryType='arraybuffer';
  await new Promise(resolve=>{
   let done=false,opened_ts=null;const finish=reason=>{if(done)return;done=true;clearTimeout(timeout);clearTimeout(handshake);out.stream_status=reason;resolve();};
   const timeout=setTimeout(()=>finish('TAIL_WINDOW_ENDED'),max_wait_ms),handshake=setTimeout(()=>finish('TAIL_CONNECTION_TIMEOUT'),20000);
   socket.addEventListener('open',()=>{if(done)return;clearTimeout(handshake);opened_ts=clock();out.opened_ts=opened_ts;socket.send(JSON.stringify({debug:false}));});
   socket.addEventListener('message',event=>{if(done)return;try{
    const bytes=typeof event.data==='string'?Buffer.from(event.data):Buffer.from(event.data);out.wire_bytes+=bytes.length;out.frames++;
    if(out.frames>16||out.wire_bytes>262144){finish('TAIL_WIRE_OR_FRAME_BOUND');return;}
    const frame=JSON.parse(bytes.toString('utf8')),receipts=tailNativeEvidence(frame,{opened_ts,received_ts:clock(),version:before.version_id});
    if(receipts.length){out.receipts=receipts;finish('REGULAR_CRON_NATIVE_RECEIPT_RECEIVED');}
   }catch{finish('TAIL_FRAME_UNCONFIRMED');}});
   socket.addEventListener('error',()=>finish('TAIL_CONNECTION_ERROR'));socket.addEventListener('close',()=>finish('TAIL_CONNECTION_CLOSED'));
  });
 }catch(error){out.reason=/^[A-Z0-9_]+$/.test(error.message)?error.message:'TAIL_OBSERVATION_ERROR';out.status='TAIL_OBSERVATION_NOT_ACCEPTED';if(createdAttempted&&!out.tail_created)out.tail_creation_ack_unknown=true;}
 finally{
  try{socket?.close();}catch{out.websocket_close_unconfirmed=true;}
  if(out.tail_created){try{await call(root+'/tails/'+out.tail_id,{method:'DELETE'});out.tail_deleted=true;}catch{out.cleanup_unconfirmed=true;}}
  // Never let a guard expiry suppress cleanup of this exact temporary resource.
  await save(out);
 }
 try{await guard();const after=singleActiveVersion(await call(root+'/deployments'));out.after=after;if(before.deployment_id!==after.deployment_id||before.version_id!==after.version_id){out.attribution_refused='WORKER_MOVED_DURING_TAIL';out.receipts=[];}}
 catch(error){out.attribution_refused=/^[A-Z0-9_]+$/.test(error.message)?error.message:'TAIL_FINAL_GUARD_ERROR';out.receipts=[];}
 out.status=out.receipts.length&&out.tail_deleted&&!out.attribution_refused?'REGULAR_COLLECTOR_NATIVE_TAIL_OBSERVED':'TAIL_OBSERVATION_NOT_ACCEPTED';out.completed_ts=clock();await save(out);return out;
}
