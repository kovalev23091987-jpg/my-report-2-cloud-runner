import fs from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import {loadDailyUsageAggregate,evaluateDailyReservationBudget,reserveRunBudget,finalizeRunUsage} from '../runner/d1-preaction-budget-guard.mjs';
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN);
const req=JSON.parse(await fs.readFile(new URL('./read-current-observation-request.json',import.meta.url),'utf8'));
if(!/^\d+-\d+$/.test(req.run_id)||!Array.isArray(req.contracts)||req.contracts.length!==2||new Set(req.contracts).size!==2||!Number.isSafeInteger(req.start_ts)||!Number.isSafeInteger(req.upper_ts)||req.start_ts!==Number(req.run_id.split('-')[0])||req.upper_ts<req.start_ts||req.upper_ts-req.start_ts>600000)throw Error('EXACT_REQUEST_SCOPE_REQUIRED');
const run=req.run_id,now=Date.now(),reservation={rows_read:8000,rows_written:16};
const id='EXACT_CURRENT_DATA:'+process.env.GITHUB_RUN_ID+':'+process.env.GITHUB_RUN_ATTEMPT;
const out={schema:'report2-exact-current-data-readback-v1',head:process.env.GITHUB_SHA,read_ts:now,run_id:run,source_cloud_run:req.source_cloud_run,source_head:req.source_head,early_rows_scope:'MUTABLE_CURRENT_ROWS_AT_READ_TS_NOT_ORIGINAL_HISTORY',sourceHTTP:0,MAIN:0,Telegram:0,source_writes:0,rows:[]};
const check=()=>{const u=db.usageSnapshot();if(u.unknown_ops!==0||u.rows_read>7500||u.rows_written>14||u.requests>36)throw Error('BOUNDED_D1_USAGE_EXCEEDED');};
out.admission=evaluateDailyReservationBudget({daily:await loadDailyUsageAggregate(db,now),nextReservation:reservation,maxDailyReads:3500000,maxDailyWrites:70000});
if(out.admission.allowed){
 await reserveRunBudget(db,{reservationId:id,now,reservation});
 try{
  check();
  out.handoffs=await db.prepare("SELECT h.contract_code,h.wave_id,h.state,h.scan_ts,h.updated_ts,d.execution_status,d.data_sufficiency,substr(d.error_text,1,500) error_text,d.started_ts,d.completed_ts FROM deep_check_run_log d JOIN v3_discovery_deep_handoff_shadow h ON h.handoff_id=d.v3_handoff_id AND h.contract_code=d.contract_code AND h.source_run_id=d.run_id WHERE d.run_id=?1 ORDER BY h.discovery_rank LIMIT 2").bind(run).all();check();
  for(const contract of req.contracts){
   const found=await db.prepare('SELECT publication_id,contract_code,run_id,snapshot_id,observed_ts,canonical_state,canonical_json,manual_text,telegram_text,presentation_hash FROM canonical_publication_shadow WHERE run_id=?1 AND contract_code=?2 ORDER BY observed_ts DESC LIMIT 2').bind(run,contract).all();check();
   const rows=Array.isArray(found.results)?found.results:[];
   if(rows.length>1)throw Error('AMBIGUOUS_SAME_RUN_CANONICAL');
   for(const row of rows){if(row.contract_code!==contract||row.run_id!==run||row.snapshot_id!=='S392:'+contract+':'+row.observed_ts||row.observed_ts<req.start_ts||row.observed_ts>req.upper_ts||row.snapshot_id!==req.snapshot_ids[contract])throw Error('EXACT_CANONICAL_BINDING_FAILED');const canonical=JSON.parse(row.canonical_json);if(canonical.analytical_fingerprint!==req.analytical_fingerprints[contract])throw Error('ARTIFACT_CANONICAL_FINGERPRINT_MISMATCH');out.rows.push({...row,canonical_json:undefined,canonical});}
   if(!rows.length)out.rows.push({contract_code:contract,run_id:run,status:'NO_CANONICAL_ROW_FOR_EXACT_SOURCE_RUN',canonical:null});
  }
  out.dispatch=await db.prepare("SELECT d.dispatch_id,d.idempotency_key,d.contract,d.direction,d.wave_id,d.lifecycle_event,d.rules_version,d.state,d.decision_id,d.created_ts,d.updated_ts,d.sent_ts,d.telegram_message_id,d.last_error,b.publication_id FROM v3_telegram_dispatch_shadow d LEFT JOIN v3_dispatch_publication_binding_shadow b ON b.idempotency_key=d.idempotency_key WHERE b.run_id=?1 AND b.snapshot_id IN (?2,?3) LIMIT 4").bind(run,...req.contracts.map(c=>req.snapshot_ids[c])).all();check();
  out.early=await db.prepare("SELECT wave_id,contract_code,generation,first_seen_ts,lifecycle_stage,direction_hint,direction_state,early_detection_quality_0_100,last_seen_ts FROM v3_early_candidate_wave WHERE contract_code IN (?1,?2) ORDER BY last_seen_ts DESC LIMIT 8").bind(...req.contracts).all();check();
  out.full_evidence=[];
  for(const r of out.rows.filter(r=>r.canonical)){
   const fid=r.observed_ts+':'+r.contract_code+':full-evidence-v2';
   const f=await db.prepare("SELECT full_evidence_id,shadow_id,contract_code,observed_ts,persisted_ts,dq_status,full_dc_long,full_dc_short,stage392_proof_bundle_json FROM full_evidence_shadow_log WHERE full_evidence_id=?1 LIMIT 1").bind(fid).all();check();
   for(const row of f.results||[]){if(row.contract_code!==r.contract_code||row.observed_ts!==r.observed_ts)throw Error('FORENSIC_FULL_IDENTITY_MISMATCH');const shadow=await db.prepare("SELECT * FROM shadow_decision_log WHERE shadow_id=?1 LIMIT 1").bind(row.shadow_id).all();check();out.full_evidence.push({...row,stage392_proof_bundle_json:undefined,proof_bundle:row.stage392_proof_bundle_json?JSON.parse(row.stage392_proof_bundle_json):null,shadow});}
  }
  out.weekly_journal={scope:'CURRENT_FINAL_DISPATCH_STATES_UPDATED_IN_LAST_7_DAYS_NOT_EVENT_HISTORY',lower_ts:now-7*86400000,upper_ts:now,per_state_limit:401,states:{}};
  for(const state of ['PENDING','SENDING','SENT','FAILED_RETRYABLE','FAILED_FINAL','EXPIRED_NOT_SENT','SUPPRESSED_DEDUP']){
   const sql="SELECT dispatch_id,contract,direction,lifecycle_event,state,created_ts,updated_ts,sent_ts,telegram_message_id,last_error FROM v3_telegram_dispatch_shadow INDEXED BY idx_v3_dispatch_state_ts WHERE state=?1 AND updated_ts>=?2 AND updated_ts<=?3 ORDER BY updated_ts DESC LIMIT 401";
   const plan=await db.prepare('EXPLAIN QUERY PLAN '+sql).bind(state,out.weekly_journal.lower_ts,now).all();check();
   if((plan.results||[]).some(p=>/^SCAN /i.test(p.detail)))throw Error('UNBOUNDED_WEEKLY_JOURNAL_PLAN');
   const data=await db.prepare(sql).bind(state,out.weekly_journal.lower_ts,now).all();check();
   out.weekly_journal.states[state]={plan:plan.results,rows:data.results,complete:(data.results||[]).length<401};
  }
  out.status='EXACT_CURRENT_PUBLIC_DATA_READ';
 }catch(e){out.status='READBACK_FAILED';out.error=String(e.message).slice(0,180);}
 finally{out.finalized_usage=await finalizeRunUsage(db,{reservationId:id,sourceRunId:process.env.GITHUB_RUN_ID,usage:db.usageSnapshot()});}
}else out.status='D1_ADMISSION_BLOCKED';
out.d1_usage=db.usageSnapshot();
await fs.mkdir('audit-output',{recursive:true});
const bytes=Buffer.from(JSON.stringify(out)),gz=gzipSync(bytes,{mtime:0});
await fs.writeFile('audit-output/exact-current-data.json.gz',gz);
const summary={...out,full_evidence:out.full_evidence?.map(r=>({full_evidence_id:r.full_evidence_id,shadow_id:r.shadow_id,contract:r.contract_code,observed_ts:r.observed_ts,proof_keys:Object.keys(r.proof_bundle||{}),shadow_keys:Object.keys(r.shadow?.results?.[0]||{})})),weekly_journal:out.weekly_journal?{...out.weekly_journal,states:Object.fromEntries(Object.entries(out.weekly_journal.states).map(([s,v])=>[s,{count:v.rows.length,complete:v.complete,latest:v.rows.slice(0,3)}]))}:null,rows:out.rows.map(r=>({contract_code:r.contract_code,publication_id:r.publication_id,run_id:r.run_id,snapshot_id:r.snapshot_id,canonical_state:r.canonical_state,canonical_keys:Object.keys(r.canonical||{})})),json_sha256:createHash('sha256').update(bytes).digest('hex'),gzip_sha256:createHash('sha256').update(gz).digest('hex')};
await fs.writeFile('audit-output/readback-summary.json',JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary));if(out.status!=='EXACT_CURRENT_PUBLIC_DATA_READ')process.exitCode=1;
