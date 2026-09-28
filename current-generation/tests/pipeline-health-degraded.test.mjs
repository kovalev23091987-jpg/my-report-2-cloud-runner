import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

test('worker technical failure cannot be persisted as healthy no-idea',()=>{
  const source=fs.readFileSync(new URL('../files/src/v3-pipeline-health-sidecar.mjs',import.meta.url),'utf8');
  assert.match(source,/workerDegraded=internalStatus==='DEGRADED_PIPELINE'/);
  assert.match(source,/technical_final_block:workerDegraded/);
  assert.doesNotMatch(source,/technical_final_block:false/);
});

test('worker degraded result is classified as degraded by the real health runtime',async(t)=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'report2-health-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const sourceRoot=path.resolve(new URL('../../post-v7-consolidated/liquidation/unified-delivery-base/src/',import.meta.url).pathname);
  for(const name of ['v3-pipeline-health-runtime.mjs','v3-telegram-lifecycle.mjs']){
    fs.copyFileSync(path.join(sourceRoot,name),path.join(dir,name));
  }
  fs.copyFileSync(new URL('../files/src/v3-pipeline-health-sidecar.mjs',import.meta.url),path.join(dir,'v3-pipeline-health-sidecar.mjs'));
  const {buildPipelineHealthFromCron}=await import(`${pathToFileURL(path.join(dir,'v3-pipeline-health-sidecar.mjs')).href}?test=${Date.now()}`);
  const health=buildPipelineHealthFromCron({
    cron:{
      status:'SUCCESS',
      v3_pipeline_health_status:'DEGRADED_PIPELINE',
      v3_pipeline_health_reason:'FULL_EVIDENCE_PERSISTENCE_FAILED',
      v3_live_shortlist_count:1,
      v3_live_deep_check_count:1,
    },
    scan:{universe_total:359,scanned:359,errors:0,stale:0,stage0_coverage_pct:100},
    telegram_zero_reason:{status:'NO_ELIGIBLE_EVENTS',reason:'NO_ELIGIBLE_EVENTS'},
  });
  assert.equal(health.status,'DEGRADED_PIPELINE');
  assert.ok(health.reasons.includes('FINAL_DECISION_TECHNICAL_BLOCK'));
  assert.ok(health.reasons.includes('WORKER_FULL_EVIDENCE_PERSISTENCE_FAILED'));
});
