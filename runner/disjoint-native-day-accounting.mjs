import {createHash} from 'node:crypto';
import {receiptProjection} from './native-cost-observations.mjs';
const hash=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const integer=n=>Number.isSafeInteger(n)&&n>=0;
const day=t=>Number.isSafeInteger(t)&&t>0?new Date(t).toISOString().slice(0,10):null;
const zero=()=>({requests:0,rows_read:0,rows_written:0,unknown_ops:0});
const keys=Object.keys(zero());
const add=(a,b)=>{for(const k of keys){if(!integer(b?.[k])||!integer(a[k]+b[k]))throw Error('EXACT_NATIVE_SUBTOTAL_REQUIRED');a[k]+=b[k];}};
const configs={
 'my-report-2-hub':{schema:'BOUNDED_COLLECTOR_NATIVE_TAIL_V1',status:'REGULAR_COLLECTOR_NATIVE_TAIL_OBSERVED',native:'PUBLIC_COLLECTOR_NATIVE_INVOCATION_USAGE_V1'},
 'my-report-2-free-history':{schema:'BOUNDED_HOURLY_NATIVE_TAIL_V1',status:'REGULAR_HOURLY_NATIVE_TAIL_OBSERVED',native:'FREE_HISTORY_NATIVE_INVOCATION_USAGE_V1'}
};
export function exactSavedTailReceipts({text,sha256,path}={}){
 if(typeof text!=='string'||Buffer.byteLength(text)>524288||hash(text)!==sha256||typeof path!=='string'||!path.startsWith('checkpoints/'))throw Error('EXACT_SAVED_NATIVE_ORIGINAL_REQUIRED');
 const root=JSON.parse(text),config=configs[root.worker];
 if(!config||root.schema!==config.schema||root.status!==config.status||root.tail_created!==true||root.tail_deleted!==true||root.target_satisfied!==true||root.websocket_connections!==1||root.settings_changed!==false||root.before?.version_id!==root.after?.version_id||root.before?.deployment_id!==root.after?.deployment_id||typeof root.before?.version_id!=='string'||!Array.isArray(root.receipts)||root.receipts.length>64||!Array.isArray(root.conflicting_invocations)||root.conflicting_invocations.length||!['sourceHTTP','SQL','MAIN','Telegram','Worker_invocations'].every(k=>root[k]===0))throw Error('EXACT_STABLE_NATIVE_OBSERVATION_REQUIRED');
 return root.receipts.map(r=>{
  if(typeof r.original_native_message!=='string')throw Error('EXACT_NATIVE_MESSAGE_REQUIRED');
  const original=JSON.parse(r.original_native_message),receipt=receiptProjection(original,config.native);
  if(!receipt||hash(original)!==r.receipt_sha256||r.worker!==root.worker||r.version!==root.before.version_id||!['EXPLICIT_TAIL_EVENT_VERSION','EXACT_TAIL_VERSION_FILTER_AND_STABLE_DEPLOYMENT'].includes(r.version_binding_basis))throw Error('EXACT_NATIVE_RECEIPT_BINDING_REQUIRED');
  const start=config.native.startsWith('PUBLIC_')?receipt.started_ts:receipt.execution_started_ts,end=config.native.startsWith('PUBLIC_')?receipt.completed_ts:receipt.execution_completed_ts;
  if(![root.opened_ts,r.event_ts,start,end,r.log_ts,r.received_ts,root.completed_ts].every(t=>Number.isSafeInteger(t)&&t>0)||!(root.opened_ts<=r.event_ts&&r.event_ts<=start&&start<=end&&end<=r.log_ts&&r.log_ts<=r.received_ts&&r.received_ts<=root.completed_ts))throw Error('EXACT_NATIVE_EXECUTION_CLOCK_REQUIRED');
  return{worker:root.worker,version:r.version,invocation_id:receipt.invocation_id,receipt_sha256:r.receipt_sha256,path,source_sha256:sha256,actual_day_utc:day(start)===day(end)?day(start):null,receipt};
 });
}
function parts(r){
 if(r.schema==='PUBLIC_COLLECTOR_NATIVE_INVOCATION_USAGE_V1')return r.split_disjoint?[
  {family:'PRIVATE_PRICE_SOURCE_COMPONENT',inside_existing_family:'PRIVATE_PRICE',cost:r.private_price_source_D1},
  {family:'COLLECTOR_SOURCE_REMAINDER',inside_existing_family:null,cost:r.collector_excluding_private_price_source_D1}
 ]:null;
 const out=[];
 for(const [binding,b] of Object.entries(r.bindings??{})){
  if(!b)return null;
  out.push({family:'HOURLY_'+binding,inside_existing_family:null,cost:{requests:b.attempted_statements,rows_read:b.measured_rows_read_subtotal,rows_written:b.measured_rows_written_subtotal,unknown_ops:b.unknown_operations}});
 }return out.length===2?out:null;
}
export function reconcileSavedNativePointCosts(observations){
 if(!Array.isArray(observations)||observations.length>128)throw Error('BOUNDED_SAVED_NATIVE_OBSERVATIONS_REQUIRED');
 const unique=new Map(),conflicts=new Map();let duplicates=0;
 for(const o of observations){
  const id=o.worker+':'+o.invocation_id,old=unique.get(id);
  if(!old)unique.set(id,o);
  else if(old.receipt_sha256===o.receipt_sha256)duplicates++;
  else{if(!conflicts.has(id))conflicts.set(id,[old]);conflicts.get(id).push(o);}
 }
 const days={},unallocated=[];
 for(const [id,o] of unique){
  if(conflicts.has(id))continue;
  const scopes=parts(o.receipt);
  if(!o.actual_day_utc||!scopes){unallocated.push(o);continue;}
  const d=days[o.actual_day_utc]??={unique_observed_invocations:0,known_point_subtotal:zero(),inside_PRIVATE_PRICE_source_component:zero(),outside_known_family_point_subtotal:zero(),unknown_receipts:0,families:{}};
  d.unique_observed_invocations++;if(o.receipt.unknown)d.unknown_receipts++;
  for(const p of scopes){add(d.known_point_subtotal,p.cost);add(p.inside_existing_family?d.inside_PRIVATE_PRICE_source_component:d.outside_known_family_point_subtotal,p.cost);d.families[p.family]??=zero();add(d.families[p.family],p.cost);}
 }
 return{schema:'DISJOINT_SAVED_NATIVE_POINT_RECONCILIATION_V1',observed_days:days,duplicate_receipts_not_added:duplicates,conflicting_invocations:[...conflicts.keys()],conflicting_known_receipts:[...conflicts.values()].flat(),unallocated_receipts:unallocated,known_subtotals_are_not_daily_cost_or_bounds:true,sampled_cost_extrapolation_performed:false,PRIVATE_PRICE_added_twice:false,whole_day_closed:false,daily_total:null,daily_upper_bound:null,admission_authorized:false,sourceHTTP:0,SQL:0,MAIN:0,Telegram:0};
}
export function qualifyExistingFamilyInventory(inventory){
 if(inventory?.schema!=='ACTIVE105_D1_FAMILY_INVENTORY_V1'||!Array.isArray(inventory.families)||inventory.families.length!==9||new Set(inventory.families.map(f=>f.family)).size!==9)throw Error('EXACT_EXISTING_FAMILY_INVENTORY_REQUIRED');
 const expected=['ANALYTICS','CANONICAL_COLD_COPY','PRIVATE_FORECAST','PRIVATE_PRICE','TRIGGER_ADMISSION','TRIGGER_POLLS_AND_BACKUP_EARLY','RETAINED_HISTORY','HTX_WEEKLY_D1','LIQ_NEW_SOURCE_VALIDATE'];
 if(JSON.stringify(inventory.families.map(f=>f.family).sort())!==JSON.stringify(expected.sort()))throw Error('EXISTING_FAMILIES_MUST_NOT_BE_RENAMED');
 const sum={reads:0,writes:0};
 for(const f of inventory.families)for(const k of ['reads','writes']){const n=f.maximum_invocations,unit=f.per_invocation?.[k];if(!integer(n)||n===0||!integer(unit)||unit===0||!integer(n*unit)||n*unit!==f.day?.[k])throw Error('EXACT_FAMILY_ENVELOPE_ARITHMETIC_REQUIRED');sum[k]+=n*unit;}
 if(sum.reads!==inventory.known_separate_family_envelopes_sum_not_complete_day?.reads||sum.writes!==inventory.known_separate_family_envelopes_sum_not_complete_day?.writes)throw Error('EXACT_FAMILY_SUM_REQUIRED');
 return{known_nine_family_envelopes:sum,limit:inventory.limits,envelopes_are_not_actual_measured_costs:true,missing_families_preserved:inventory.not_yet_closed,combined_with_point_cost_as_daily_bound:false,whole_day_closed:false};
}
