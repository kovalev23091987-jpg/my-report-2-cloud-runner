import {createPrivateCanonicalRestorer,privateCanonicalArchivePool} from '../../current-generation/files/src/private-canonical-history.mjs';
import {nativeMeasuredD1} from '../free-history/native-measured-d1.mjs';
import {evaluateWithinRunReservation,finalizeRunUsage} from '../../runner/d1-preaction-budget-guard.mjs';

export const PRIVATE_PRICE_POLICY=Object.freeze({slot_ms:300000,max_rows:2,max_runs_day:288,rows_read:800,rows_written:32,max_daily_reads:3500000,max_daily_writes:70000});
const count=v=>Number.isSafeInteger(v)&&v>=0;
function measured(binding){return typeof binding?.usageSnapshot==='function'?binding:nativeMeasuredD1(binding);}
function delta(db,start){const current=db.usageSnapshot(),out={};for(const key of ['requests','rows_read','rows_written','unknown_ops']){if(!count(current[key])||!count(start[key])||current[key]<start[key])throw Error('PRIVATE_PRICE_USAGE_NOT_CLOSED');out[key]=current[key]-start[key];}return out;}

export async function reservePrivatePriceBudget(db,{bucket,now}={}){
 const p=PRIVATE_PRICE_POLICY;
 if(!Number.isSafeInteger(bucket)||bucket<=0||bucket%p.slot_ms!==0||!Number.isSafeInteger(now)||now<bucket||now-bucket>=p.slot_ms)throw Error('PRIVATE_PRICE_CURRENT_SLOT_REQUIRED');
 const id='PRIVATE_PRICE:'+bucket,day=new Date(now).toISOString().slice(0,10);
 // A single indexed day scan closes all shared caps atomically. A backup
 // cannot reserve the primary's slot again; attempts are never refunded.
 const result=await db.prepare(`INSERT OR IGNORE INTO report2_runner_budget_ledger_shadow(reservation_id,day_utc,reserve_rows_read,reserve_rows_written,state,started_ts)
 SELECT ?1,?2,?3,?4,'RESERVED',?5 FROM (
 SELECT COALESCE(SUM(MAX(reserve_rows_read,COALESCE(measured_rows_read,0)+CASE WHEN state='FINALIZED' THEN 1 ELSE 0 END)),0) AS reads,COALESCE(SUM(MAX(reserve_rows_written,COALESCE(measured_rows_written,0))),0) AS writes,
 COALESCE(SUM(CASE WHEN state='FINALIZED' AND COALESCE(unknown_ops,1)>0 THEN 1 ELSE 0 END),0) AS unknown_count,
 COALESCE(SUM(CASE WHEN reservation_id LIKE 'PRIVATE_PRICE:%' THEN 1 ELSE 0 END),0) AS slot_count
 FROM report2_runner_budget_ledger_shadow WHERE day_utc=?2
 ) WHERE reads+?3<=?6 AND writes+?4<=?7 AND unknown_count=0 AND slot_count<?8`).bind(id,day,p.rows_read,p.rows_written,now,p.max_daily_reads,p.max_daily_writes,p.max_runs_day).run();
 const changes=Number(result?.meta?.changes);
 if(changes!==1)return{allowed:false,status:changes===0?'PRIVATE_PRICE_SHARED_DAY_BOUND_OR_DUPLICATE':'PRIVATE_PRICE_ADMISSION_ACK_INVALID'};
 const row=await db.prepare('SELECT reservation_id,day_utc,reserve_rows_read,reserve_rows_written,state FROM report2_runner_budget_ledger_shadow WHERE reservation_id=?1 LIMIT 1').bind(id).first();
 if(row?.state!=='RESERVED'||row.day_utc!==day||row.reserve_rows_read!==p.rows_read||row.reserve_rows_written!==p.rows_written)throw Error('PRIVATE_PRICE_RESERVATION_READBACK_REQUIRED');
 return{allowed:true,status:'ATOMIC_SHARED_DAY_RESERVED',reservation_id:id};
}

export async function runPrivatePriceRechecks({source_db,private_db,private_dbs={},check,args}={}){
 if(typeof check!=='function'||!private_db?.prepare)throw Error('PRIVATE_PRICE_EXACT_READER_REQUIRED');
 const pool=new Map([...privateCanonicalArchivePool(private_db,private_dbs)].map(([slot,db])=>[slot,measured(db)]));
 const source=measured(source_db),archive=pool.get('LEGACY'),sourceStart=source.usageSnapshot(),p=PRIVATE_PRICE_POLICY;
 const starts=new Map([...pool].map(([slot,db])=>[slot,db.usageSnapshot()]));
 const privateUsage=()=>{const out={requests:0,rows_read:0,rows_written:0,unknown_ops:0};for(const [slot,db] of pool){const d=delta(db,starts.get(slot));for(const key of Object.keys(out))out[key]+=d[key];}return out;};
 const usage=()=>{const a=delta(source,sourceStart),b=privateUsage();return Object.fromEntries(Object.keys(a).map(k=>[k,a[k]+b[k]]));};
 const admit=e=>evaluateWithinRunReservation({reservation:p,currentUsage:usage(),extraRowsRead:e.rows_read,extraRowsWritten:e.rows_written+3});
 let admission;
 try{admission=await reservePrivatePriceBudget(source,{bucket:args?.bucket,now:args?.now});}
 catch(error){return{status:'PRIVATE_PRICE_ADMISSION_RETRY_REQUIRED',selected:0,checked:0,rows_read:usage().rows_read,rows_written:usage().rows_written,results:[],reason:String(error?.message||'PRIVATE_PRICE_ADMISSION_ERROR'),D1:usage(),entry_authorized:false,source_http:0,telegram:false};}
 if(!admission.allowed)return{status:admission.status,selected:0,checked:0,rows_read:usage().rows_read,rows_written:usage().rows_written,results:[],entry_authorized:false,source_http:0,telegram:false,admission,D1:usage()};
 let result;
 try{
  const reader=createPrivateCanonicalRestorer({archive_db:archive,archive_dbs:Object.fromEntries([...pool].filter(([slot])=>slot!=='LEGACY')),db_admit:admit,max_rows:p.max_rows});
  if(!admit({rows_read:256,rows_written:0}).allowed)throw Error('PRIVATE_PRICE_QUERY_HEADROOM_DENIED');
  result=await check(source,{...args,restore_canonical_row:reader.restore,db_admit:admit});
 }catch(error){result={status:'PRIVATE_PRICE_RETRY_REQUIRED',selected:0,checked:0,results:[],reason:String(error?.message||'PRIVATE_PRICE_ERROR'),entry_authorized:false,source_http:0,telegram:false};}
 const finalized_usage=await finalizeRunUsage(source,{reservationId:admission.reservation_id,sourceRunId:admission.reservation_id,now:args.now,usage:usage()});
 const total=usage();
 return{...result,admission,finalized_usage,D1:total,private_D1:privateUsage(),rows_read:total.rows_read,rows_written:total.rows_written,source_http:0,telegram:false,entry_authorized:false};
}
