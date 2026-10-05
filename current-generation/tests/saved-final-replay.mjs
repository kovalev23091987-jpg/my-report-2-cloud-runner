import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {consumeExecutionReportContext,buildCanonicalExecutionEvidence} from '../files/src/execution-report-context.mjs';
const root=process.argv[2];
function find(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory()){const v=find(p);if(v)return v;}else if(e.name==='report2-run-result.json')return p;}}
const file=find(root);assert.ok(file,'SAVED_FINAL_RESULT_REQUIRED');
const run=JSON.parse(fs.readFileSync(file,'utf8'));
assert.equal(run.run_id,'1791212594931-1791212602313');assert.equal(run.status,'PARTIAL_DATA_UNAVAILABLE');assert.equal(run.reason,'REQUIRED_BLOCKS_NOT_CONFIRMED');
const candidates=run.candidates.map(row=>{
 const proof=consumeExecutionReportContext(row,run.run_id);assert.equal(proof.status,'IMMUTABLE_SNAPSHOT_FACTS_VERIFIED');
 const evidence=buildCanonicalExecutionEvidence({...row,execution_context_source:row.execution_context_source});assert.deepEqual(evidence.map(e=>e.block_id),['N11','N16']);
 return {contract:row.contract,snapshot_id:row.snapshot_id,original_checked_block_count:row.block_coverage.checked_block_count,original_score_applied_block_count:row.block_decision_use.score_applied_block_count,immutable_execution_evidence_blocks:evidence.map(e=>e.block_id),original_rendered_block_ids:row.block_rendered_results.used_context_block_ids,original_data_sufficient:row.canonical.data_quality.sufficient};
});
process.stdout.write(JSON.stringify({status:'SAVED_FACTS_REPLAY_VERIFIED',historical_only:true,new_live_acceptance:false,new_HTTP:0,new_MAIN:0,telegram_calls:0,origin_run_id:run.run_id,candidates})+'\n');
