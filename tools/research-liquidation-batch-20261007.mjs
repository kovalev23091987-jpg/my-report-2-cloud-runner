import fs from 'node:fs';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import {loadDailyUsageAggregate,evaluateDailyReservationBudget,reserveRunBudget,finalizeRunUsage} from '../runner/d1-preaction-budget-guard.mjs';
import {createD1SourceAdmission} from '../current-generation/files/src/liquidation-extension/d1-source-admission.mjs';
import {LIQUIDATION_ALLOWANCE_GENERATION} from '../current-generation/files/src/liquidation-extension/install-source-allowances.mjs';
import {readJson} from '../current-generation/files/src/liquidation-extension/io.mjs';
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),started=Date.now(),run_id=`LIQ_BATCH_SCHEMA:${process.env.GITHUB_RUN_ID}:${started}`,reservation={rows_read:1250,rows_written:100};
const proof={schema:'LIQUIDATION_BATCH_SOURCE_RESEARCH_V1',head:process.env.GITHUB_SHA,run_id,started_ts:started,source_cap:2,sourceHTTP:0,MAIN:0,Telegram:0,enabled_for_decisions:false,reason:'Official current schema exposes all-coin routes but omits response schemas and state-clock/unit contracts; actual body absent from retained evidence',rows:[]};
const raw=[];fs.mkdirSync('audit-output',{recursive:true});
try{
 const day=evaluateDailyReservationBudget({daily:await loadDailyUsageAggregate(db,started),nextReservation:reservation,maxDailyReads:3500000,maxDailyWrites:70000});proof.day_admission=day;
 if(!day.allowed){proof.status='D1_ADMISSION_BLOCKED';}
 else{
  await reserveRunBudget(db,{reservationId:run_id,now:started,reservation});
  try{
   const month=new Date(started).toISOString().slice(0,7).replace('-',''),scope_id=`${LIQUIDATION_ALLOWANCE_GENERATION}:${month}:LIQFLOW`;
   const row=await db.prepare('SELECT scope_id,config_fingerprint,active,allowance_units,window_start_ts,window_end_ts FROM report2_liq_source_allowance_shadow WHERE scope_id=?1 LIMIT 1').bind(scope_id).first();
   if(!row||row.active!==1||row.allowance_units>10000||row.window_start_ts>started||row.window_end_ts<=started)throw Error('EXISTING_LIQFLOW_ALLOWANCE_REQUIRED');
   const admit=createD1SourceAdmission({db,scope_bindings:{LIQFLOW:{scope_id,config_fingerprint:row.config_fingerprint}},within_run_budget:e=>{const u=db.usageSnapshot();return{allowed:u.unknown_ops===0&&u.rows_read+e.extraRowsRead+4<=reservation.rows_read&&u.rows_written+e.extraRowsWritten+4<=reservation.rows_written};}});
   const grant=await admit({reservation_id:run_id,contract:'ALL_COIN_SCHEMA_RESEARCH',run_id,requests:{LIQFLOW:2},weights:{},max_requests:2,deadline_ts:started+45000});proof.provider_admission=grant;
   if(grant.allowed!==true||grant.new_reservation!==true)throw Error('DURABLE_PROVIDER_ADMISSION_BLOCKED');
   for(const path of ['/api/positions/open','/api/aggregate/liq-levels']){
    proof.sourceHTTP++;
    const r=await readJson('https://node.liqflow.app'+path,{timeout_ms:12000,max_bytes:2000000,...(process.env.LIQFLOW_API_KEY?{headers:{'X-API-Key':process.env.LIQFLOW_API_KEY}}:{})});
    raw.push({path,...r});const p=r.payload,rows=Array.isArray(p)?p:Array.isArray(p?.positions)?p.positions:Array.isArray(p?.levels)?p.levels:Array.isArray(p?.coins)?p.coins:[];
    proof.rows.push({path,ok:r.ok,http_receipt:r.receipt,reason:r.reason||null,top_keys:p&&typeof p==='object'?Object.keys(p).slice(0,30):[],row_count:rows.length,first_row_keys:rows[0]&&typeof rows[0]==='object'?Object.keys(rows[0]):[],visible_coin_count:new Set(rows.map(x=>x?.coin).filter(Boolean)).size,state_clock_fields:p&&typeof p==='object'?Object.fromEntries(Object.entries(p).filter(([k])=>/time|ts|block|snapshot|updated/i.test(k))):{},levels_are_native_exchange_prices_proven:false});
   }
   proof.status='ACTUAL_BOUNDED_BATCH_RESPONSES_RETAINED_FOR_VALIDATION';
  }catch(e){proof.status='BATCH_RESEARCH_NOT_CLOSED';proof.reason=String(e.message).slice(0,180);}
  finally{proof.finalized_usage=await finalizeRunUsage(db,{reservationId:run_id,sourceRunId:process.env.GITHUB_RUN_ID,usage:db.usageSnapshot()});}
 }
}catch(e){proof.status='RESEARCH_PREACTION_NOT_CLOSED';proof.reason=String(e.message).slice(0,180);}
proof.completed_ts=Date.now();proof.d1_usage=db.usageSnapshot();
const gz=gzipSync(Buffer.from(JSON.stringify({run_id,head:process.env.GITHUB_SHA,raw})));proof.raw_gzip_sha256=createHash('sha256').update(gz).digest('hex');
fs.writeFileSync('audit-output/liquidation-batch-raw.json.gz',gz);fs.writeFileSync('audit-output/liquidation-batch-proof.json',JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
