import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root=path.resolve(process.argv[2]||'runtime');
const load=rel=>import(pathToFileURL(path.join(root,rel)));
const {RemoteD1Database}=await load('report2-d1-adapter.mjs');
const {auditRenderedBlockResults,consumeBlockResultContext}=await load('src/block-result-context.mjs');
const {formatManualReport}=await load('src/manual-report-formatter.mjs');
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN);
// Recover one known failed workflow's completed collection, never rerun markets.
const start=Date.parse('2026-10-04T10:55:30Z'),end=Date.parse('2026-10-04T10:55:46Z');
const runs=await db.prepare('SELECT run_id,scheduled_time,started_ts,completed_ts,status,v3_live_deep_check_count,v3_pipeline_health_status,v3_pipeline_health_reason FROM cron_runs WHERE scheduled_time BETWEEN ?1 AND ?2 ORDER BY scheduled_time ASC LIMIT 2').bind(start,end).all();
assert.equal(runs.results.length,1,'ONE_EXACT_BOUNDED_RUN_REQUIRED');
const cron=runs.results[0];
const rows=await db.prepare('SELECT publication_id,contract_code,run_id,snapshot_id,observed_ts,canonical_json,manual_text FROM canonical_publication_shadow WHERE run_id=?1 ORDER BY publication_id ASC LIMIT 3').bind(cron.run_id).all();
assert.equal(rows.results.length,2,'TWO_ACTUAL_CANDIDATES_REQUIRED');
assert.deepEqual(rows.results.map(r=>r.contract_code).sort(),['BR-USDT','NEAR-USDT']);
const candidates=rows.results.map(row=>{
 const c=JSON.parse(row.canonical_json);
 assert.equal(c.run_id,cron.run_id);assert.equal(c.snapshot_id,row.snapshot_id);assert.equal(c.metadata.contract,row.contract_code);
 const before=auditRenderedBlockResults({canonical:c,manual:{ok:typeof row.manual_text==='string',text:row.manual_text}});
 const replay=structuredClone(c),score=JSON.stringify(c.scores);
 const context=consumeBlockResultContext({evidence:c.metadata.internal_market_context.evidence_v2.evidence,contract:c.metadata.contract,now:c.observed_ts});
 replay.metadata.supporting_context={...replay.metadata.supporting_context,facts:[...(replay.metadata.supporting_context?.facts||[]),...context.facts]};
 const after=auditRenderedBlockResults({canonical:replay,manual:formatManualReport(replay)});
 assert.equal(JSON.stringify(replay.scores),score);
 return{publication_id:row.publication_id,contract:row.contract_code,run_id:row.run_id,snapshot_id:row.snapshot_id,observed_ts:row.observed_ts,
  actual_persisted_rendering:before,same_input_candidate_rendering:after,score_unchanged:true,
  canonical_input:{run_id:c.run_id,snapshot_id:c.snapshot_id,observed_ts:c.observed_ts,status:c.status,state:c.state,scores:c.scores,data_quality:c.data_quality,
   metadata:{contract:c.metadata.contract,supporting_context:c.metadata.supporting_context,internal_market_context:{evidence_v2:c.metadata.internal_market_context.evidence_v2}}},
  manual_text:row.manual_text};
});
const usage=db.usageSnapshot();assert.equal(usage.rows_written,0);assert.equal(usage.unknown_ops,0);assert.ok(usage.rows_read<=2000);
const report={schema:'report2-recovered-live-result-v1',origin_workflow_run_id:37196936865,origin_head:'e3b490f0a8251d2c8c293b62c3a4952388d00070',capture_head:process.env.GITHUB_SHA,cron,candidates,database_usage:usage,source_http:0,deep_checks_started:0,production_writes:0,telegram_calls:0,main_accepted:false,telegram_accepted:false};
fs.writeFileSync('audit-output/recovered-live-result.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:'LIVE_COLLECTION_RECOVERED_WITHOUT_MARKET_RERUN',run_id:cron.run_id,candidates:candidates.map(c=>({contract:c.contract,actual_used_blocks:c.actual_persisted_rendering.used_context_block_ids})),source_http:0,production_writes:0,main_accepted:false}));
