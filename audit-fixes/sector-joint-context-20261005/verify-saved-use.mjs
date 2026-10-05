import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {RemoteD1Database} from '../../runner/report2-d1-adapter.mjs';
import {loadDailyUsageAggregate,evaluateDailyReservationBudget,reserveRunBudget,finalizeRunUsage} from '../../runner/d1-preaction-budget-guard.mjs';
const root=path.resolve(process.argv[2]||'runtime'),load=p=>import(pathToFileURL(path.join(root,p))),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const {consumeSectorContext}=await load('src/sector-context.mjs'),{auditRenderedBlockResults}=await load('src/block-result-context.mjs'),{formatManualReport}=await load('src/manual-report-formatter.mjs'),{formatManualRunSummary}=await load('src/manual-run-summary.mjs'),{resolveNansenFlowPrimary}=await load('src/candidate-evidence-v2-runtime.mjs');
const phase=JSON.parse(fs.readFileSync('checkpoints/CLOUD_PHASE_STATE_20261004.json'));assert.equal(phase.current_phase,'CORE_BLOCKS');assert.equal(phase.lease.owner,process.env.REPORT2_CONTINUATION_OWNER);assert.ok(phase.lease.expires_ts>Date.now());
const saved=JSON.parse(zlib.gunzipSync(fs.readFileSync('checkpoints/all15-control-source-use-20261005.json.gz'))).report_output;assert.equal(saved.run_id,'1791192063320-1791192067628');
const files=['src/sector-context.mjs','src/block-result-context.mjs','src/candidate-evidence-v2-runtime.mjs','src/manual-report-formatter.mjs','src/manual-run-summary.mjs'],runtime_sha256=Object.fromEntries(files.map(p=>{const h=hash(fs.readFileSync(path.join(root,p)));assert.equal(h,hash(fs.readFileSync(path.join('current-generation/files',p))));return[p,h];}));
const now=Date.now(),db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),reservation={rows_read:5000,rows_written:16},reservationId=`SECTOR_JOINT:${process.env.GITHUB_RUN_ID}`;
const report={schema:'report2-sector-joint-saved-use-v1',github_head:process.env.GITHUB_SHA,observed_ts:now,original_run_id:saved.run_id,original_generated_at:saved.generated_at,scope:'HISTORICAL_SAVED_CONTROL_AT_ORIGINAL_CLOCK_NOT_NEW_LIVE_ACCEPTANCE',runtime_sha256,results:[],source_http:0,production_canonical_writes:0,telegram_calls:0,all15_accepted:false};
const save=()=>fs.writeFileSync('audit-output/sector-joint-use.json',JSON.stringify(report,null,2)+'\n');process.on('uncaughtExceptionMonitor',e=>{report.error=String(e);save();});
report.admission=evaluateDailyReservationBudget({daily:await loadDailyUsageAggregate(db,now),nextReservation:reservation,maxDailyReads:3500000,maxDailyWrites:70000});assert.equal(report.admission.allowed,true);
await reserveRunBudget(db,{reservationId,now,reservation});
try{
 const rebuilt=[];
 for(const previous of saved.candidates){
  const stored=await db.prepare('SELECT contract_code,run_id,snapshot_id,observed_ts,canonical_json FROM canonical_publication_shadow WHERE run_id=?1 AND contract_code=?2 LIMIT 1').bind(saved.run_id,previous.contract).first();assert.ok(stored,'EXACT_SAVED_CANONICAL_REQUIRED');
  const c=JSON.parse(stored.canonical_json);assert.equal(c.run_id,previous.run_id);assert.equal(c.snapshot_id,previous.snapshot_id);assert.equal(c.observed_ts,previous.observed_ts);assert.equal(c.metadata.contract,previous.contract);assert.equal(c.analytical_fingerprint,previous.canonical.analytical_fingerprint);
  const context=c.metadata.internal_market_context,evidence=context.evidence_v2?.evidence||[],identity=context.candidate_context?.asset_identity;
  const sector=consumeSectorContext({evidence,contract:previous.contract,asset_identity:identity,now:c.observed_ts});
  const beforeManual=formatManualReport(c);assert.equal(beforeManual.ok,true);assert.equal(beforeManual.text,previous.manual_text);
  const repaired=structuredClone(c);repaired.metadata.supporting_context.facts=[...repaired.metadata.supporting_context.facts.filter(f=>f.block_id!=='N15'),...sector.facts];
  const manual=formatManualReport(repaired);assert.equal(manual.ok,true);assert.equal(manual.text,beforeManual.text,'APPROVED_PER_COIN_FORM_UNCHANGED');
  for(const key of ['scores','direction','state','targets','data_quality','analytical_fingerprint','run_id','snapshot_id','observed_ts'])assert.deepEqual(repaired[key],c[key]);
  const proof=auditRenderedBlockResults({canonical:repaired,manual}),row={...previous,canonical:repaired,manual_text:manual.text,block_rendered_results:proof};rebuilt.push(row);
  const oldProof=previous.block_rendered_results;
  const receiptContext=context.candidate_context||{},oldNansen=context.evidence_v2?.sources?.NANSEN_FLOWS;
  const admissionReceipts=receiptContext.receipts||receiptContext.supplemental_context?.receipts||[];
  const diagnosed=resolveNansenFlowPrimary(receiptContext.sources?.NANSEN_FLOWS,{contract:previous.contract,asset_identity:identity,now:c.observed_ts,supplemental_context:{receipts:admissionReceipts}});
  report.results.push({contract:previous.contract,identity,source_clock:c.observed_ts,sector,old_used_blocks:oldProof.used_context_block_ids,repaired_used_blocks:proof.used_context_block_ids,manual_unchanged:true,analytical_values_unchanged:true,n05_original:oldNansen,n05_existing_receipts:admissionReceipts.filter(r=>r.source==='NANSEN_FLOWS'),n05_diagnostic:diagnosed,canonical:repaired,manual,rendered_use:proof});
 }
 const after=formatManualRunSummary({...saved,candidates:rebuilt}),btw=report.results.find(r=>r.contract==='BTW-USDT'),br=report.results.find(r=>r.contract==='BR-USDT');assert.equal(btw.sector.status,'CLOSED');assert.ok(btw.repaired_used_blocks.includes('N15'));assert.equal(btw.repaired_used_blocks.length,13);assert.equal(br.repaired_used_blocks.length,7);
 const fact=btw.sector.facts[0];assert.ok(!saved.report_text.includes(fact.value));assert.ok(after.includes(fact.value));report.joint_report_before=saved.report_text;report.joint_report_after=after;
 report.current_provider_budget=(await db.prepare('SELECT source,day,attempts,blocked_until FROM report2_specialist_budget WHERE source=?1 LIMIT 1').bind('NANSEN').first())||null;
 report.current_flow_cache=(await db.prepare("SELECT contract_code,source,observed_ts,expires_ts,json_extract(payload_json,'$.status') AS status FROM report2_candidate_source_cache WHERE source=?1 AND contract_code IN (?2,?3) LIMIT 2").bind('NANSEN_FLOWS','BTW-USDT','BR-USDT').all()).results||[];
 report.status='EXACT_SAVED_N15_SOURCE_TO_JOINT_RECEIPT_VERIFIED';
}finally{report.finalized_usage=await finalizeRunUsage(db,{reservationId,sourceRunId:process.env.GITHUB_RUN_ID,usage:db.usageSnapshot()});report.database_usage=db.usageSnapshot();save();}
assert.equal(report.database_usage.unknown_ops,0);assert.ok(report.database_usage.rows_read<=5000&&report.database_usage.rows_written<=16);save();console.log(JSON.stringify({status:report.status,source_http:0,blocks:report.results.map(r=>({contract:r.contract,old:r.old_used_blocks.length,repaired:r.repaired_used_blocks.length,n05:r.n05_diagnostic.status})),provider_budget:report.current_provider_budget,database_usage:report.database_usage,all15_accepted:false}));
