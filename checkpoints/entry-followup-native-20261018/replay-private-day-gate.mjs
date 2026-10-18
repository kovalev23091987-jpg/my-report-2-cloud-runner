// Controlled SQLite reproduction of a code mechanism, not production replay.
// Only the historical accounting inputs are original. Simulated timestamps and
// SQLite row counters do not represent native D1 billing or a market condition.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(process.argv[2]),output=process.argv[3];
const moduleAt=p=>import(pathToFileURL(path.join(root,p)).href);
const {runPrivatePriceRechecks}=await moduleAt('cloudflare/public-collector/private-price-consumer.mjs');
const {nativeMeasuredD1}=await moduleAt('cloudflare/free-history/native-measured-d1.mjs');
const {loadVerifiedNativeDayReconciliation}=await moduleAt('runner/verified-native-day-reconciliation.mjs');
const {loadDailyUsageAggregate,evaluateDailyReservationBudget}=await moduleAt('runner/d1-preaction-budget-guard.mjs');
const manifestPath='checkpoints/paid-report-recovery-20261018/UTC18-39081512792-reconciliation.json';
const manifestBytes=fs.readFileSync(path.join(root,manifestPath)),m=JSON.parse(manifestBytes);
const archive=path.join(root,m.files.source_archive.path),raw=execFileSync('unzip',['-p',archive,'report2-failure-accounting.json']);
const sha=b=>createHash('sha256').update(b).digest('hex');
assert.equal(sha(raw),m.source.usage_sha256);
assert.equal(sha(fs.readFileSync(archive)),m.files.source_archive.sha256);
const f=JSON.parse(raw),r=f.receipt,now=Date.UTC(2026,9,18,13,5,0),bucket=now;
const handle=loadVerifiedNativeDayReconciliation({root,now_ts:now,generation:m.generation});
assert(handle,'SAVED_AUTHENTICATED_HISTORICAL_PROOF_REQUIRED');
class ControlledD1 {
 constructor(){this.raw=new DatabaseSync(':memory:');this.calls=[];this.raw.exec('CREATE TABLE report2_runner_budget_ledger_shadow(reservation_id TEXT PRIMARY KEY,day_utc TEXT,reserve_rows_read INTEGER,reserve_rows_written INTEGER,state TEXT,started_ts INTEGER,completed_ts INTEGER,source_run_id TEXT,measured_rows_read INTEGER,measured_rows_written INTEGER,measured_requests INTEGER,unknown_ops INTEGER); CREATE INDEX ledger_day ON report2_runner_budget_ledger_shadow(day_utc)');}
 prepare(sql){let args=[];const db=this;const execute=async write=>{db.calls.push(sql);const positions=[],q=sql.replace(/\?(\d+)/g,(_,n)=>{positions.push(Number(n)-1);return '?';}),s=db.raw.prepare(q),bound=positions.length?positions.map(i=>args[i]):args;if(write){const changes=Number(s.run(...bound).changes);return{success:true,results:[],meta:{changes,rows_read:1,rows_written:changes}};}const results=s.all(...bound);return{success:true,results,meta:{rows_read:Math.max(1,results.length),rows_written:0}};};return{bind(...values){args=values;return this;},all:()=>execute(false),run:()=>execute(true)};}
 close(){this.raw.close();}
}
const results=[];
for(const mode of ['CONTROL_NO_UNKNOWN','ORIGINAL15_NO_HANDLE','ORIGINAL15_AUTHENTICATED_HANDLE']){
 const binding=new ControlledD1(),db=nativeMeasuredD1(binding);let checks=0;
 try{
  if(mode!=='CONTROL_NO_UNKNOWN')binding.raw.prepare('INSERT INTO report2_runner_budget_ledger_shadow VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(m.source.reservation_id,m.day_utc,m.original_reservation.rows_read,m.original_reservation.rows_written,'FINALIZED',Number(m.source.reservation_id.split(':')[1]),Date.parse(m.interval.to)-1,String(m.source.run_id),r.measured_rows_read,r.measured_rows_written_accounted,r.measured_requests_accounted,r.unknown_ops);
  const before=binding.raw.prepare('SELECT * FROM report2_runner_budget_ledger_shadow').all();
  const daily=await loadDailyUsageAggregate(db,now,{reconciliation:mode==='ORIGINAL15_AUTHENTICATED_HANDLE'?handle:null});
  const fullStyle=evaluateDailyReservationBudget({daily,nextReservation:{rows_read:59000,rows_written:920}});
  const price=await runPrivatePriceRechecks({source_db:db,private_db:{prepare(){throw Error('UNEXPECTED_ARCHIVE_READ')}},check:async()=>{checks++;return{status:'CONTROLLED_CHECK_CALLBACK_REACHED',selected:0,checked:0,results:[]};},args:{bucket,now,reconciliation:mode==='ORIGINAL15_AUTHENTICATED_HANDLE'?handle:null}});
  const original=binding.raw.prepare('SELECT * FROM report2_runner_budget_ledger_shadow WHERE reservation_id=?').get(m.source.reservation_id);
  if(mode==='CONTROL_NO_UNKNOWN'){assert.equal(checks,1);assert.equal(price.admission.allowed,true);assert.equal(fullStyle.allowed,true);}
  else{assert.equal(checks,0);assert.equal(price.status,'PRIVATE_PRICE_SHARED_DAY_BOUND_OR_DUPLICATE');assert.deepEqual(original,before[0]);assert.equal(binding.raw.prepare("SELECT COUNT(*) AS n FROM report2_runner_budget_ledger_shadow WHERE reservation_id LIKE 'PRIVATE_PRICE:%'").get().n,0);assert.equal(fullStyle.allowed,mode==='ORIGINAL15_AUTHENTICATED_HANDLE');}
  results.push({mode,authenticated_handle_supplied:mode==='ORIGINAL15_AUTHENTICATED_HANDLE',full_style_admission_allowed:fullStyle.allowed,full_style_status:fullStyle.status,private_price_status:price.status,price_check_callback_calls:checks,original15unknown_preserved:original?.unknown_ops??null,original_row_byte_values_unchanged:mode==='CONTROL_NO_UNKNOWN'?null:JSON.stringify(original)===JSON.stringify(before[0]),new_price_slot_reserved:mode==='CONTROL_NO_UNKNOWN'});
 }finally{binding.close();}
}
const out={schema:'CONTROLLED_SAVED_UTC18_PRIVATE_PRICE_DAY_GATE_REPRODUCTION_V1',status:'THREE_CONTROLLED_CASES_PASS',accounting_original:{manifest:manifestPath,manifest_sha256:sha(manifestBytes),source_archive:m.files.source_archive,original_usage_sha256:sha(raw),unknown_ops:15},source_hashes:['cloudflare/public-collector/private-price-consumer.mjs','runner/d1-preaction-budget-guard.mjs','runner/native-day-reconciliation-tokens.mjs','runner/verified-native-day-reconciliation.mjs'].map(file=>({file,sha256:sha(fs.readFileSync(path.join(root,file)))})),results,scope:{SQLite_only:true,original_source_reservation_and_counters:true,source_completed_ts:'CONTROLLED_WITHIN_VERIFIED_INTERVAL_NOT_NATIVE_ROW_EXPORT',simulated_UTC18_clock:true,market_condition_tested:false,original_canonical_body_available:false,production_task_executed:false,deployed_collector_version_verified:false,actual_production_log_root_cause_proven:false,all_historical_ENTRY_failures_explained:false,native_billing_claim:false,sourceHTTP:0,native_SQL:0,MAIN:0,Telegram:0,strategy_caps_unknown_or_reservations_changed:false},conclusion:'Current private-price code unconditionally refuses this retained15unknown day before calling any price checker, even when a separately authenticated historical proof permits full-style admission. A qualified atomic witness path for this consumer is still missing; no bypass is authorized by this reproduction.'};
fs.writeFileSync(output,JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({status:out.status,cases:results,native_SQL:0,sourceHTTP:0,actual_production_root_cause_proven:false}));
