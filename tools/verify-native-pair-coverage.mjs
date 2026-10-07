import fs from 'node:fs';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import {loadDailyUsageAggregate,evaluateDailyReservationBudget,reserveRunBudget,finalizeRunUsage} from '../runner/d1-preaction-budget-guard.mjs';
import {createCombinedLiquidationService} from '../runtime/src/liquidation-extension/combined-runner-service.mjs';
import {createD1SourceAdmission} from '../runtime/src/liquidation-extension/d1-source-admission.mjs';
import {LIQUIDATION_ALLOWANCE_GENERATION} from '../runtime/src/liquidation-extension/install-source-allowances.mjs';
import {bindNativeAcquisition} from '../runtime/src/liquidation-extension/runtime-bridge.mjs';
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),started=Date.now(),run_id=`NATIVE_PAIR_GAP_FIX:${process.env.GITHUB_RUN_ID}:${started}`,reservation={rows_read:2500,rows_written:160};
const reservationId=run_id,hash=x=>createHash('sha256').update(x).digest('hex'),rows=[],raw=[];
const proof={schema:'BOUNDED_ACTUAL_NATIVE_PAIR_COVERAGE_V1',head:process.env.GITHUB_SHA,run_id,started_ts:started,new_defect_basis:'ACTUAL0930_FIL4HTTP_LEFT_NEAR_NO_NATIVE_VERIFICATION_PAIR',production_MAIN:0,Telegram:0,sourceHTTP:0,source_cap:5,rows};
const admission=evaluateDailyReservationBudget({daily:await loadDailyUsageAggregate(db,started),nextReservation:reservation,maxDailyReads:3500000,maxDailyWrites:70000});proof.day_admission=admission;
if(admission.allowed){
 await reserveRunBudget(db,{reservationId,now:started,reservation});
 try{
  const month=new Date(started).toISOString().slice(0,7).replace('-',''),bindings={};
  for(const provider of ['HYPERLIQUID','LIQFLOW']){
   const scope_id=`${LIQUIDATION_ALLOWANCE_GENERATION}:${month}:${provider}`,r=await db.prepare('SELECT scope_id,config_fingerprint,active,allowance_units,used_units,window_start_ts,window_end_ts FROM report2_liq_source_allowance_shadow WHERE scope_id=?1 LIMIT 1').bind(scope_id).first();
   if(!r||r.active!==1||r.allowance_units>10000||r.window_start_ts>started||r.window_end_ts<=started)throw Error('EXISTING_SOURCE_ALLOWANCE_REQUIRED');bindings[provider]={scope_id,config_fingerprint:r.config_fingerprint};
  }
  const provider_admit=createD1SourceAdmission({db,scope_bindings:bindings,within_run_budget:e=>{const u=db.usageSnapshot();return{allowed:u.unknown_ops===0&&u.rows_read+e.extraRowsRead+4<=reservation.rows_read&&u.rows_written+e.extraRowsWritten+4<=reservation.rows_written};}});
  const service=createCombinedLiquidationService({mode:'SHADOW_ONLY',candidate_slots:2,secondary_enabled:false,provider_admit,liqflow_key:process.env.LIQFLOW_API_KEY||'',max_http_per_run:5,max_total_ms:45000});
  // Original selected order, no replacement/tuning by whether a map exists.
  for(const contract of ['FIL-USDT','NEAR-USDT']){
   const acquisition=await service.collect({contract,native_symbol:contract.split('-')[0],run_id,deep_started_ts:Date.now(),max_http_for_candidate:5,allowed_source_ids:['HYPERLIQUID_NATIVE']});
   const observed_ts=Date.now(),context=acquisition?bindNativeAcquisition(acquisition,{contract,run_id,snapshot_id:`GAP_PROOF:${contract}:${observed_ts}`,observed_ts,direction:null}):null;
   if(acquisition)raw.push(acquisition);
   rows.push({contract,observed_ts,status:context?.status||'NOT_ACQUIRED',reason:context?.reason||null,source_ts:context?.source_ts??null,source_age_ms:context?.source_age_ms??null,returned_positive_levels:context?.returned_positive_levels??0,sample_accounts:context?.sample_accounts??0,coverage:context?.coverage??null,above:context?.above||[],below:context?.below||[],acquisition_fingerprint:acquisition?.acquisition_fingerprint??null,full_market_coverage:false,production_idea_or_entry_acceptance:false});
  }
  proof.source_summary=service.summary();proof.sourceHTTP=service.summary().shared_budget.actual_http;
  if(proof.sourceHTTP>5||db.usageSnapshot().unknown_ops>0)throw Error('ACTUAL_BOUND_VIOLATION');
  proof.status=rows.every(r=>r.status==='USABLE_NATIVE_SAMPLE'&&r.returned_positive_levels>0)?'BOTH_ACTUAL_NATIVE_SAMPLES_CLOSED':'ACTUAL_NATIVE_PAIR_PARTIAL';
 }catch(e){proof.status='ACTUAL_NATIVE_PAIR_NOT_CLOSED';proof.reason=String(e.message).slice(0,180);}
 finally{proof.finalized_usage=await finalizeRunUsage(db,{reservationId,sourceRunId:process.env.GITHUB_RUN_ID,usage:db.usageSnapshot()});}
}else proof.status='D1_ADMISSION_BLOCKED';
proof.completed_ts=Date.now();proof.d1_usage=db.usageSnapshot();fs.mkdirSync('audit-output',{recursive:true});
const gz=gzipSync(Buffer.from(JSON.stringify({schema:'ACTUAL_NATIVE_PAIR_RAW_V1',run_id,head:process.env.GITHUB_SHA,acquisitions:raw})));proof.raw_gzip_sha256=hash(gz);
fs.writeFileSync('audit-output/native-pair-actual-raw.json.gz',gz);fs.writeFileSync('audit-output/native-pair-actual-proof.json',JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({...proof,source_summary:undefined}));
