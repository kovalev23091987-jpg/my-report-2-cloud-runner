import {createPrivateCanonicalRestorer,privateCanonicalArchivePool} from '../../current-generation/files/src/private-canonical-history.mjs';
import {nativeMeasuredD1} from '../free-history/native-measured-d1.mjs';
import {evaluateWithinRunReservation,finalizeRunUsage} from '../../runner/d1-preaction-budget-guard.mjs';
import {nativeReconciliationAtomicWitness} from '../../runner/native-day-reconciliation-tokens.mjs';

export const PRIVATE_PRICE_POLICY=Object.freeze({slot_ms:300000,max_rows:2,max_runs_day:288,rows_read:800,rows_written:32,max_daily_reads:3500000,max_daily_writes:70000});
export const PRIVATE_PRICE_ACK_PROTOCOL=Object.freeze({source_prefix:'PRIVATE_PRICE_ACK_REQUIRED_V1:',collector_status:'CLOSED_PRIVATE_PRICE_NATIVE_ACK_V1'});
const count=v=>Number.isSafeInteger(v)&&v>=0;
function measured(binding){return typeof binding?.usageSnapshot==='function'?binding:nativeMeasuredD1(binding);}
function delta(db,start){const current=db.usageSnapshot(),out={};for(const key of ['requests','rows_read','rows_written','unknown_ops']){if(!count(current[key])||!count(start[key])||current[key]<start[key])throw Error('PRIVATE_PRICE_USAGE_NOT_CLOSED');out[key]=current[key]-start[key];}return out;}

export async function reservePrivatePriceBudget(db,{bucket,now,reconciliation=null}={}){
 const p=PRIVATE_PRICE_POLICY;
 if(!Number.isSafeInteger(bucket)||bucket<=0||bucket%p.slot_ms!==0||!Number.isSafeInteger(now)||now<bucket||now-bucket>=p.slot_ms)throw Error('PRIVATE_PRICE_CURRENT_SLOT_REQUIRED');
 const id='PRIVATE_PRICE:'+bucket,day=new Date(now).toISOString().slice(0,10);
 const witness=nativeReconciliationAtomicWitness({handle:reconciliation,now,current_usage:db.usageSnapshot?.()});
 // The exceptional old unknown set may be cost-closed only by the exact
 // independently authenticated proof, freshly matched INSIDE this INSERT.
 // Every price slot in the existing day scan must have a closed reply.
 // A later legacy writer cannot hide an earlier unacknowledged protocol row.
 // These indexed parent lookups add read work, but no new SQL request.
 const priceAck=`COALESCE(SUM(CASE WHEN substr(reservation_id,1,14)='PRIVATE_PRICE:' AND COALESCE((
 state='FINALIZED' AND COALESCE(unknown_ops,1)=0 AND
 (source_run_id=reservation_id OR (source_run_id='${PRIVATE_PRICE_ACK_PROTOCOL.source_prefix}'||substr(reservation_id,15) AND EXISTS(
 SELECT 1 FROM report2_public_collector_usage_v1 c WHERE c.actor='HUB_PUBLIC_COLLECTOR' AND c.generation='MY_REPORT_2_CURRENT_20260928_CANONICAL_RUNTIME_V12_CONTRACT_INTEGRITY_20M' AND c.bucket=CAST(substr(reservation_id,15) AS INTEGER) AND c.state='CLOSED' AND c.status='${PRIVATE_PRICE_ACK_PROTOCOL.collector_status}' AND c.started_ts<=report2_runner_budget_ledger_shadow.started_ts AND c.completed_ts>=report2_runner_budget_ledger_shadow.completed_ts)))
 ),0)=0 THEN 1 ELSE 0 END),0) AS unacknowledged_price_count`;
 const exactSource=witness?`,COALESCE(SUM(CASE WHEN state='FINALIZED' THEN COALESCE(unknown_ops,1) ELSE 0 END),0) AS unknown_operations,
 COALESCE(SUM(CASE WHEN state='RESERVED' THEN 1 ELSE 0 END),0) AS unfinished_count,
 COALESCE(SUM(CASE WHEN state NOT IN ('RESERVED','FINALIZED') OR typeof(reserve_rows_read)!='integer' OR reserve_rows_read<0 OR typeof(reserve_rows_written)!='integer' OR reserve_rows_written<0 OR (state='FINALIZED' AND (typeof(measured_rows_read)!='integer' OR measured_rows_read<0 OR typeof(measured_rows_written)!='integer' OR measured_rows_written<0 OR typeof(measured_requests)!='integer' OR measured_requests<0 OR typeof(unknown_ops)!='integer' OR unknown_ops<0)) THEN 1 ELSE 0 END),0) AS invalid_count,
 MAX(CASE WHEN reservation_id=?9 AND day_utc=?2 AND source_run_id=?10 AND state='FINALIZED' AND started_ts=?11 AND typeof(completed_ts)='integer' AND completed_ts>=?11 AND completed_ts<=?12 AND reserve_rows_read>=?13 AND reserve_rows_written>=?14 AND measured_rows_read=?15 AND measured_rows_written=?16 AND measured_requests=?17 AND unknown_ops=?18 THEN 1 ELSE 0 END) AS exact_verified_source`:'';
 const gate=(witness?'reads+?3+?19<=?6 AND writes+?4+?20<=?7 AND unknown_count=1 AND unknown_operations=?18 AND exact_verified_source=1 AND unfinished_count=0 AND invalid_count=0 AND slot_count<?8':'reads+?3<=?6 AND writes+?4<=?7 AND unknown_count=0 AND slot_count<?8')+' AND unacknowledged_price_count=0';
 // A single indexed day scan closes all shared caps atomically. A backup
 // cannot reserve the primary's slot again; attempts are never refunded.
 const statement=db.prepare(`INSERT OR IGNORE INTO report2_runner_budget_ledger_shadow(reservation_id,day_utc,reserve_rows_read,reserve_rows_written,state,started_ts)
 SELECT ?1,?2,?3,?4,'RESERVED',?5 FROM (
 SELECT COALESCE(SUM(MAX(reserve_rows_read,COALESCE(measured_rows_read,0)+CASE WHEN state='FINALIZED' THEN 1 ELSE 0 END)),0) AS reads,COALESCE(SUM(MAX(reserve_rows_written,COALESCE(measured_rows_written,0))),0) AS writes,
 COALESCE(SUM(CASE WHEN state='FINALIZED' AND COALESCE(unknown_ops,1)>0 THEN 1 ELSE 0 END),0) AS unknown_count,
 COALESCE(SUM(CASE WHEN reservation_id LIKE 'PRIVATE_PRICE:%' THEN 1 ELSE 0 END),0) AS slot_count,${priceAck}${exactSource}
 FROM report2_runner_budget_ledger_shadow WHERE day_utc=?2
 ) WHERE ${gate}`);
 const args=[id,day,p.rows_read,p.rows_written,now,p.max_daily_reads,p.max_daily_writes,p.max_runs_day];
 if(witness)args.push(witness.reservation_id,witness.source_run_id,witness.started_ts,witness.completed_ts_max,witness.min_reserve_rows_read,witness.min_reserve_rows_written,witness.measured_rows_read,witness.measured_rows_written,witness.measured_requests,witness.unknown_ops,59000,920);
 const result=await statement.bind(...args).run();
 if(db.usageSnapshot?.().unknown_ops>0)throw Error('PRIVATE_PRICE_ADMISSION_NATIVE_USAGE_NOT_CLOSED');
 const changes=Number(result?.meta?.changes);
 if(changes!==1)return{allowed:false,status:changes===0?'PRIVATE_PRICE_SHARED_DAY_BOUND_OR_DUPLICATE':'PRIVATE_PRICE_ADMISSION_ACK_INVALID'};
 const row=await db.prepare('SELECT reservation_id,day_utc,reserve_rows_read,reserve_rows_written,state FROM report2_runner_budget_ledger_shadow WHERE reservation_id=?1 LIMIT 1').bind(id).first();
 if(row?.state!=='RESERVED'||row.day_utc!==day||row.reserve_rows_read!==p.rows_read||row.reserve_rows_written!==p.rows_written)throw Error('PRIVATE_PRICE_RESERVATION_READBACK_REQUIRED');
 return{allowed:true,status:witness?'ATOMIC_SHARED_DAY_RESERVED_WITH_EXACT_NATIVE_COST_WITNESS':'ATOMIC_SHARED_DAY_RESERVED',reservation_id:id,...(witness?{native_cost_reconciliation:{manifest_sha256:witness.manifest_sha256,historical_unknown_operations_preserved:witness.unknown_ops,original_reservation_preserved:true,new_or_unmatched_unknown_authorized:false,next_full_protected:{rows_read:59000,rows_written:920}}}:{})};
}

export async function runPrivatePriceRechecks({source_db,private_db,private_dbs={},check,args,reconciliation=null}={}){
 if(typeof check!=='function'||!private_db?.prepare)throw Error('PRIVATE_PRICE_EXACT_READER_REQUIRED');
 const pool=new Map([...privateCanonicalArchivePool(private_db,private_dbs)].map(([slot,db])=>[slot,measured(db)]));
 const source=measured(source_db),archive=pool.get('LEGACY'),sourceStart=source.usageSnapshot(),p=PRIVATE_PRICE_POLICY;
 const starts=new Map([...pool].map(([slot,db])=>[slot,db.usageSnapshot()]));
 const privateUsage=()=>{const out={requests:0,rows_read:0,rows_written:0,unknown_ops:0};for(const [slot,db] of pool){const d=delta(db,starts.get(slot));for(const key of Object.keys(out))out[key]+=d[key];}return out;};
 const usage=()=>{const a=delta(source,sourceStart),b=privateUsage();return Object.fromEntries(Object.keys(a).map(k=>[k,a[k]+b[k]]));};
 const admit=e=>evaluateWithinRunReservation({reservation:p,currentUsage:usage(),extraRowsRead:e.rows_read,extraRowsWritten:e.rows_written+3});
 let admission;
 try{if(source.usageSnapshot().unknown_ops>0)throw Error('PRIVATE_PRICE_PRECEDING_NATIVE_USAGE_NOT_CLOSED');admission=await reservePrivatePriceBudget(source,{bucket:args?.bucket,now:args?.now,reconciliation});}
 catch(error){return{status:'PRIVATE_PRICE_ADMISSION_RETRY_REQUIRED',selected:0,checked:0,rows_read:usage().rows_read,rows_written:usage().rows_written,results:[],reason:String(error?.message||'PRIVATE_PRICE_ADMISSION_ERROR'),D1:usage(),entry_authorized:false,source_http:0,telegram:false};}
 if(!admission.allowed)return{status:admission.status,selected:0,checked:0,rows_read:usage().rows_read,rows_written:usage().rows_written,results:[],entry_authorized:false,source_http:0,telegram:false,admission,D1:usage()};
 let result;
 try{
  const reader=createPrivateCanonicalRestorer({archive_db:archive,archive_dbs:Object.fromEntries([...pool].filter(([slot])=>slot!=='LEGACY')),db_admit:admit,max_rows:p.max_rows});
  if(!admit({rows_read:256,rows_written:0}).allowed)throw Error('PRIVATE_PRICE_QUERY_HEADROOM_DENIED');
  result=await check(source,{...args,restore_canonical_row:reader.restore,db_admit:admit});
 }catch(error){result={status:'PRIVATE_PRICE_RETRY_REQUIRED',selected:0,checked:0,results:[],reason:String(error?.message||'PRIVATE_PRICE_ERROR'),entry_authorized:false,source_http:0,telegram:false};}
 // Only a later collector CLOSED/ACK row, emitted after a measured reply,
 // acknowledges this protocol tag. Reservation IDs and quota pools stay exact.
 const finalized_usage=await finalizeRunUsage(source,{reservationId:admission.reservation_id,sourceRunId:PRIVATE_PRICE_ACK_PROTOCOL.source_prefix+args.bucket,now:args.now,usage:usage()});
 const total=usage();
 return{...result,admission,finalized_usage,D1:total,private_D1:privateUsage(),rows_read:total.rows_read,rows_written:total.rows_written,source_http:0,telegram:false,entry_authorized:false};
}
