import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root=path.resolve(process.argv[2]||'runtime'),url=rel=>pathToFileURL(path.join(root,rel)).href;
const {RemoteD1Database}=await import(url('report2-d1-adapter.mjs'));
const {consumeExecutionReportContext}=await import(url('src/execution-report-context.mjs'));
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN);
const runId='1791111337657-1791111344224';
const cron=await db.prepare('SELECT run_id,status,v3_live_deep_check_count,v3_pipeline_health_status,v3_pipeline_health_reason FROM cron_runs WHERE run_id=?1 LIMIT 1').bind(runId).first();
assert.equal(cron.run_id,runId);assert.equal(cron.v3_live_deep_check_count,2);
// Execute the EXACT current runner function, not an independent reconstruction.
// The runner entrypoint itself must not start a new market cycle during this proof.
const runner=fs.readFileSync(path.join(root,'runner-main.mjs'),'utf8');
const start=runner.indexOf('async function loadCanonicalRunOutput('),end=runner.indexOf('\nfunction finite(',start);
assert.ok(start>=0&&end>start);
const extracted=runner.slice(start,end).replace('async function loadCanonicalRunOutput(','export async function loadCanonicalRunOutput(');
const imports=`import {loadExecutionReportSource,auditExecutionReportRendering} from ${JSON.stringify(url('src/execution-report-context.mjs'))};
import {auditRenderedBlockResults} from ${JSON.stringify(url('src/block-result-context.mjs'))};
import {auditCanonicalBlockDecisionUse} from ${JSON.stringify(url('src/block-decision-use-audit.mjs'))};
import {classifyCanonicalRunCompletion,enforceManualBlockCoverage,formatManualRunSummary} from ${JSON.stringify(url('src/manual-run-summary.mjs'))};\n`;
const {loadCanonicalRunOutput}=await import('data:text/javascript;base64,'+Buffer.from(imports+extracted).toString('base64'));
const output=await loadCanonicalRunOutput(db,{runId,source:'manual_recovery',generation:'MY_REPORT_2_CURRENT_20260929_CURRENT_CYCLE_V13_20M',head:process.env.GITHUB_SHA,cron,candidateContracts:['BR-USDT','NEAR-USDT']});
assert.equal(output.candidates.length,2);assert.equal(output.status,'PARTIAL_DATA_UNAVAILABLE');
assert.deepEqual(output.execution_report_rendering.used_context_block_ids,['N11','N16']);
assert.equal(output.execution_report_rendering.context_receipts.length,10);
for(const row of output.candidates){assert.equal(row.canonical.data_quality.sufficient,false);assert.equal(consumeExecutionReportContext(row,runId).status,'IMMUTABLE_SNAPSHOT_FACTS_VERIFIED');}
assert.match(output.report_text,/6\.28575 USDT для 2081 одинаковых контрактов/);assert.match(output.report_text,/1\.553 USDT для 203 одинаковых контрактов/);
assert.match(output.report_text,/Действие сейчас: не входить/);
const usage=db.usageSnapshot();assert.equal(usage.rows_written,0);assert.equal(usage.unknown_ops,0);
const receipt={schema:'report2-execution-context-actual-report-proof-v1',status:'EXACT_RUNNER_REPORT_TEXT_VERIFIED',origin_workflow:37196936865,origin_run_id:runId,cloud_head:process.env.GITHUB_SHA,
 output,database_usage:usage,source_http:0,new_deep_checks:0,production_writes:0,telegram_calls:0,main_accepted:false,telegram_accepted:false,historical_rendering_not_fresh_main:true};
fs.writeFileSync('audit-output/execution-actual-report-proof.json',JSON.stringify(receipt,null,2)+'\n');
fs.writeFileSync('audit-output/execution-actual-report.txt',output.report_text+'\n');
assert.ok(usage.rows_read<=100,'EXACT_INDEXED_READ_BUDGET');
console.log(JSON.stringify({status:receipt.status,run_id:runId,blocks:output.execution_report_rendering.used_context_block_ids,receipts:10,database_usage:usage,source_http:0,main_accepted:false}));
