import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import {loadDailyUsageAggregate,evaluateDailyReservationBudget,reserveRunBudget,finalizeRunUsage} from '../runner/d1-preaction-budget-guard.mjs';
const request=JSON.parse(await fs.readFile(new URL('./presentation-request.json',import.meta.url),'utf8'));
if(!Array.isArray(request.targets)||request.targets.length!==2)throw Error('EXACT_TWO_RETAINED_TARGETS_REQUIRED');
const root=path.resolve('runtime');
const publication=await import(pathToFileURL(path.join(root,'src/canonical-publication.mjs')));
const manPath=path.join(root,'src/manual-report-formatter.mjs'),manSource=await fs.readFile(manPath,'utf8');
const diagPath=path.join(root,'src/manual-report-formatter.forensic.mjs');
const needle="return{ok:false,status:'FORBIDDEN_USER_TERMINOLOGY',text:null}";
if(!manSource.includes(needle))throw Error('EXACT_DIAGNOSTIC_FORMATTER_ANCHOR_REQUIRED');
await fs.writeFile(diagPath,manSource.replace(needle,"return{ok:false,status:'FORBIDDEN_USER_TERMINOLOGY',text:null,diagnostic_text:out}"));
const diagnostic=await import(pathToFileURL(diagPath));await fs.unlink(diagPath);
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN);
const now=Date.now(),reservation={rows_read:2000,rows_written:16},id='RETAINED_PRESENTATION:'+process.env.GITHUB_RUN_ID+':'+process.env.GITHUB_RUN_ATTEMPT;
const out={schema:'RETAINED_PRESENTATION_CAUSE_V1',head:process.env.GITHUB_SHA,read_ts:now,sourceHTTP:0,MAIN:0,Telegram:0,source_writes:0,formatter_sha256:createHash('sha256').update(manSource).digest('hex'),scope:'CURRENT_RENDERER_ON_EXACT_RETAINED_CANONICAL_AT_ORIGINAL_CREATION; NOT_FRESH_SIGNAL_OR_HISTORICAL_RENDERER_CLAIM',results:[]};
const check=()=>{const u=db.usageSnapshot();if(u.rows_read>1700||u.rows_written>14||u.requests>28||u.unknown_ops)throw Error('BOUNDED_D1_USAGE_EXCEEDED');};
out.admission=evaluateDailyReservationBudget({daily:await loadDailyUsageAggregate(db,now),nextReservation:reservation,maxDailyReads:3500000,maxDailyWrites:70000});
if(out.admission.allowed){
 await reserveRunBudget(db,{reservationId:id,now,reservation});
 try{
  for(const target of request.targets){
   if(!target.dispatch_id||!Number.isSafeInteger(target.created_ts))throw Error('EXACT_TARGET_REQUIRED');
   const row=await db.prepare("SELECT dispatch_id,idempotency_key,contract,direction,wave_id,lifecycle_event,state,created_ts,updated_ts,last_error FROM v3_telegram_dispatch_shadow WHERE dispatch_id=?1 LIMIT 1").bind(target.dispatch_id).first();check();
   if(!row||row.contract!==target.contract||row.created_ts!==target.created_ts||row.last_error!=='READY')throw Error('RETAINED_DISPATCH_IDENTITY_CHANGED');
   const sql="SELECT run_id,completed_ts FROM deep_check_run_log INDEXED BY idx_deep_check_run_log_contract_completed WHERE contract_code=?1 AND completed_ts>=?2 AND completed_ts<=?3 ORDER BY completed_ts DESC LIMIT 3";
   const args=[row.contract,row.created_ts-600000,row.created_ts+2000];
   const plan=await db.prepare('EXPLAIN QUERY PLAN '+sql).bind(...args).all();check();
   if((plan.results||[]).some(r=>/^SCAN /i.test(r.detail)))throw Error('UNBOUNDED_HANDOFF_PLAN');
   const history=await db.prepare(sql).bind(...args).all();check();
   const found=[];
   for(const h of history.results||[]){
    const data=await db.prepare("SELECT publication_id,contract_code,run_id,snapshot_id,wave_id,observed_ts,canonical_state,analytical_fingerprint,canonical_json FROM canonical_publication_shadow WHERE contract_code=?1 AND run_id=?2 AND wave_id=?3 AND observed_ts<=?4 ORDER BY observed_ts DESC LIMIT 2").bind(row.contract,h.run_id,row.wave_id,row.created_ts).all();check();found.push(...(data.results||[]));
   }
   const unique=[...new Map(found.map(r=>[r.publication_id,r])).values()];
   if(unique.length!==1){out.results.push({dispatch:row,status:unique.length?'AMBIGUOUS_RETAINED_CANONICAL':'NO_RETAINED_CANONICAL',matched:unique.length,history});continue;}
   const c=JSON.parse(unique[0].canonical_json);
   if(c.run_id!==unique[0].run_id||c.snapshot_id!==unique[0].snapshot_id||c.observed_ts!==unique[0].observed_ts||c.analytical_fingerprint!==unique[0].analytical_fingerprint)throw Error('RETAINED_CANONICAL_IDENTITY_MISMATCH');
   const telegram=publication.renderCanonicalTelegram({canonical:c,lifecycle_event:row.lifecycle_event});
   const manual=publication.renderCanonicalManual({canonical:c});
   const diag=diagnostic.formatManualReport(c);
   if(diag.ok!==manual.ok||diag.status!==manual.status)throw Error('DIAGNOSTIC_FORMATTER_CHANGED_DECISION');
   out.results.push({dispatch:row,status:'EXACT_RETAINED_RENDERED',publication:{...unique[0],canonical_json:undefined},canonical:c,telegram,manual,diagnostic:diag,error_current_branch_would_record:telegram.status||manual.status,actual_failure:!telegram.ok?telegram.status:!manual.ok?manual.status:null});
  }
  out.status='RETAINED_PRESENTATION_READ_COMPLETE';
 }catch(e){out.status='FAILED';out.error=String(e.message).slice(0,180);}
 finally{out.finalized_usage=await finalizeRunUsage(db,{reservationId:id,sourceRunId:process.env.GITHUB_RUN_ID,usage:db.usageSnapshot()});}
}else out.status='D1_ADMISSION_BLOCKED';
out.d1_usage=db.usageSnapshot();await fs.mkdir('audit-output',{recursive:true});await fs.writeFile('audit-output/presentation-causes.json.gz',gzipSync(Buffer.from(JSON.stringify(out)),{mtime:0}));
const brief={...out,results:out.results.map(({canonical,diagnostic,telegram,manual,...r})=>({...r,telegram:{ok:telegram?.ok,status:telegram?.status},manual:{ok:manual?.ok,status:manual?.status},diagnostic_text_in_gzip:Boolean(diagnostic?.diagnostic_text)}))};
await fs.writeFile('audit-output/presentation-summary.json',JSON.stringify(brief,null,2));console.log(JSON.stringify(brief));if(out.status!=='RETAINED_PRESENTATION_READ_COMPLETE')process.exitCode=1;
