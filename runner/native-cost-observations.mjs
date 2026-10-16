import {createHash} from 'node:crypto';
import {singleActiveVersion} from './htx-coordinated-rollout.mjs';
const hash=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const valid=n=>Number.isSafeInteger(n)&&n>=0;
const workers=[{name:'my-report-2-free-history',tag:'REPORT2_FREE_HISTORY_NATIVE_D1',schema:'FREE_HISTORY_NATIVE_INVOCATION_USAGE_V1'},{name:'my-report-2-hub',tag:'REPORT2_PUBLIC_COLLECTOR_NATIVE_D1',schema:'PUBLIC_COLLECTOR_NATIVE_INVOCATION_USAGE_V1'}];
const counterKeys=['requests','rows_read','rows_written','unknown_ops'];
const counters=x=>x&&counterKeys.every(k=>valid(x[k]))?Object.fromEntries(counterKeys.map(k=>[k,x[k]])):null;
export function persistentLogState(settings){
 const o=settings?.observability,l=o?.logs;
 const enabled=o?.enabled===false||l?.enabled===false||l?.persist===false?false:o?.enabled===true&&(l===undefined||l?.enabled===true)&&l?.persist!==false?true:null;
 return{enabled,head_sampling_rate:l?.head_sampling_rate??o?.head_sampling_rate??null,invocation_logs:l?.invocation_logs??null,persist:l?.persist??null,status:enabled===false?'PERSISTENT_LOGS_DISABLED':enabled===true?'PERSISTENT_LOGS_CONFIGURED':'PERSISTENT_LOGGING_UNCONFIRMED',platform_sampling_excluded:false};
}
function message(event,tag){
 for(const v of [event?.source?.message,event?.source,event?.$metadata?.message]){
  if(Array.isArray(v)&&v[0]===tag&&typeof v[1]==='string')return v[1];
  if(typeof v==='string'&&v.startsWith(tag+' '))return v.slice(tag.length+1);
 }
 return null;
}
export function receiptProjection(r,schema){
 if(r?.schema!==schema||typeof r.invocation_id!=='string'||!r.invocation_id||r.invocation_id.length>100||r.additional_SQL!==0||r.daily_total!==false)return null;
 if(schema==='PUBLIC_COLLECTOR_NATIVE_INVOCATION_USAGE_V1'){
  const total=counters(r.native_D1),nested=counters(r.private_price_source_D1),rest=counters(r.collector_excluding_private_price_source_D1);
  if(!total)return{schema,invocation_id:r.invocation_id,started_ts:r.started_ts??null,completed_ts:r.completed_ts??null,native_D1:null,unknown:true};
  const disjoint=Boolean(nested&&rest&&counterKeys.every(k=>nested[k]+rest[k]===total[k]));
  return{schema,invocation_id:r.invocation_id,started_ts:r.started_ts??null,completed_ts:r.completed_ts??null,native_D1:total,private_price_source_D1:nested,collector_excluding_private_price_source_D1:rest,split_disjoint:disjoint,unknown:total.unknown_ops!==0||!disjoint||r.native_totals_closed!==true};
 }
 const bindings={};for(const name of ['DATA_DB','ARCHIVE_DB']){
  const b=r.bindings?.[name],keys=['attempted_statements','measured_rows_read_subtotal','measured_rows_written_subtotal','unknown_operations'];
  if(!b||!keys.every(k=>valid(b[k]))){bindings[name]=null;continue;}
  bindings[name]=Object.fromEntries(keys.map(k=>[k,b[k]]));
 }
 return{schema,invocation_id:r.invocation_id,scheduled_ts:r.scheduled_ts??null,execution_started_ts:r.execution_started_ts??null,execution_completed_ts:r.execution_completed_ts??null,bindings,unknown:Object.values(bindings).some(b=>!b||b.unknown_operations!==0)||r.row_totals_closed!==true};
}
export function nativeEventEvidence(event,{name,tag,schema,active_version,from,to}={}){
 const line=message(event,tag);if(!line)return{accepted:false,reason:'EXACT_NATIVE_LOG_LINE_MISSING'};
 let raw;try{raw=JSON.parse(line);}catch{return{accepted:false,reason:'NATIVE_LOG_JSON_INVALID',message_sha256:hash(line)};}
 const receipt=receiptProjection(raw,schema),m=event?.$metadata,w=event?.$workers;
 if(!receipt)return{accepted:false,reason:'NATIVE_RECEIPT_SCHEMA_INVALID',message_sha256:hash(line)};
 const bound=typeof m?.id==='string'&&m.id.length>0&&m?.service===name&&w?.scriptName===name&&w?.scriptVersion?.id===active_version&&['scheduled','cron'].includes(w?.eventType)&&valid(event.timestamp)&&event.timestamp>=from&&event.timestamp<=to&&w?.truncated!==true;
 const start=schema==='FREE_HISTORY_NATIVE_INVOCATION_USAGE_V1'?receipt.execution_started_ts:receipt.started_ts,end=schema==='FREE_HISTORY_NATIVE_INVOCATION_USAGE_V1'?receipt.execution_completed_ts:receipt.completed_ts;
 const day=t=>valid(t)&&t>0?new Date(t).toISOString().slice(0,10):null;
 const unambiguous=valid(start)&&start>0&&valid(end)&&end>=start&&end<=event.timestamp&&day(start)===day(end);
 return{accepted:Boolean(bound),reason:bound?'EXACT_VERSION_NATIVE_INVOCATION_OBSERVED':'NATIVE_EVENT_BINDING_UNCONFIRMED',event_id:typeof m?.id==='string'?m.id:null,event_ts:event.timestamp??null,worker:name,version:w?.scriptVersion?.id??null,message_sha256:hash(line),receipt_sha256:hash(raw),receipt,actual_day_utc:unambiguous?day(start):null,day_allocation_closed:Boolean(bound&&unambiguous&&!receipt.unknown),daily_total:false};
}
export function reconcileNativeEvents(events,context){
 if(!Array.isArray(events)||events.length>64)throw Error('BOUNDED_NATIVE_EVENTS_REQUIRED');
 const byInvocation=new Map(),rejected=[],conflicts=[];
 for(const event of events){const e=nativeEventEvidence(event,context);if(!e.accepted){rejected.push(e);continue;}const key=e.worker+':'+e.receipt.invocation_id,old=byInvocation.get(key);if(old&&old.receipt_sha256!==e.receipt_sha256){conflicts.push(key);continue;}if(!old)byInvocation.set(key,e);}
 const receipts=[...byInvocation.entries()].filter(([k])=>!conflicts.includes(k)).map(([,v])=>v);
 // No sum of overlapping PRIVATE_PRICE and the whole collector, and no daily
 // extrapolation from a limited/sampled event query. Each original subtotal stays.
 return{receipts,rejected,conflicting_invocations:[...new Set(conflicts)],accepted_unique_invocations:receipts.length,whole_day_closed:false,daily_total:null};
}
export async function readNativeCostObservations({call,guard,now=Date.now()}={}){
 if(!valid(now)||now<=0)throw Error('EXACT_NATIVE_OBSERVATION_TIME_REQUIRED');await guard();
 const timeframe={from:now-2*3600000,to:now},out={schema:'BOUNDED_NATIVE_COST_OBSERVATIONS_V1',timeframe,workers:[],sourceHTTP:0,SQL:0,MAIN:0,Telegram:0,Worker_invocations:0,settings_changed:false,whole_day_closed:false,daily_total:null};
 for(const worker of workers){
  const root='/workers/scripts/'+worker.name,before=singleActiveVersion(await call(root+'/deployments')),settings=await call(root+'/script-settings'),logging=persistentLogState(settings),row={worker:worker.name,active_version:before.version_id,logging,query_status:'NOT_QUERIED',receipts:[]};out.workers.push(row);
  if(logging.enabled===false){row.query_status='PERSISTENT_LOGS_DISABLED';continue;}
  const query={queryId:'report2-native-cost-'+worker.name+'-'+now,view:'events',dry:true,limit:64,timeframe,parameters:{datasets:['cloudflare-workers'],filters:[{key:'$metadata.service',operation:'eq',type:'string',value:worker.name}],needle:{value:worker.tag}}};
  try{
   const result=await call('/workers/observability/telemetry/query',{method:'POST',body:query});row.query=query;row.query_sha256=hash(query);row.response_sha256=hash(result);row.telemetry_statistics=result.statistics??null;
   if(!Array.isArray(result.events?.events)){row.query_status='NATIVE_EVENT_RESULT_UNCONFIRMED';continue;}
   const after=singleActiveVersion(await call(root+'/deployments'));
   if(before.deployment_id!==after.deployment_id||before.version_id!==after.version_id){row.query_status='WORKER_MOVED_DURING_OBSERVATION';continue;}
   Object.assign(row,reconcileNativeEvents(result.events.events,{...worker,active_version:before.version_id,...timeframe}));row.query_status=row.accepted_unique_invocations?'NATIVE_INVOCATIONS_OBSERVED':'NO_QUALIFIED_NATIVE_INVOCATIONS';row.events_returned=result.events.events.length;row.events_matching=result.events.count??null;
  }catch(error){row.query_status=/^[A-Z0-9_]+$/.test(error.message)?error.message:'NATIVE_OBSERVATION_READ_ERROR';}
 }
 await guard();return out;
}
