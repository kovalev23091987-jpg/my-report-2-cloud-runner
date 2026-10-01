import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const generation=JSON.parse(fs.readFileSync(new URL('../GENERATION.json',import.meta.url),'utf8'));
test('20-minute schedule plus three reports and five coin analyses fits 31-day quota with reserve',()=>{
 const scheduled=generation.scheduled_runs_per_day;
 const scheduledWorst=(scheduled+generation.burst_deep_checks_reserved_per_day)*31*generation.max_bykaranteli_requests_per_deep_check;
 const worst=(scheduled+generation.burst_deep_checks_reserved_per_day+generation.manual_runs_reserved_per_day)*31*generation.max_bykaranteli_requests_per_deep_check;
 assert.equal(generation.manual_report_runs_reserved_per_day,3);
 assert.equal(generation.manual_coin_analysis_runs_reserved_per_day,5);
 assert.equal(scheduled,72);assert.equal(scheduledWorst,12090);assert.equal(worst,13330);
 assert(scheduledWorst<generation.bykaranteli_scheduled_monthly_cap);
 assert(worst<generation.bykaranteli_operational_monthly_cap);
 assert(generation.bykaranteli_scheduled_monthly_cap<generation.bykaranteli_operational_monthly_cap);
 assert(generation.bykaranteli_operational_monthly_cap<generation.bykaranteli_official_monthly_quota);
});
test('multi-source comparison remains bounded for schedule, burst checks and manual reserve',()=>{
 const deepRuns=(generation.scheduled_runs_per_day+generation.burst_deep_checks_reserved_per_day+generation.manual_runs_reserved_per_day)*31;
 assert.equal(deepRuns,2666);
 const totalRequests=(generation.scheduled_runs_per_day+generation.burst_deep_checks_reserved_per_day)*31*generation.full_report_shared_extension_request_cap+generation.manual_runs_reserved_per_day*31*generation.liquidation_only_max_additional_requests;
 assert.equal(totalRequests,14074);
 assert.equal(generation.multi_source_max_deep_checks_per_31_days,deepRuns);
 assert.equal(generation.multi_source_max_shared_requests_per_31_days,14074);
 assert.equal(generation.multi_source_oxarchive_worst_case_credits_per_31_days,2666);
 assert.equal(generation.multi_source_provider_monthly_caps.OXARCHIVE-2666,2334);
 assert.ok(generation.multi_source_provider_monthly_caps.GTRADE<=4000);
 assert.ok(generation.multi_source_provider_monthly_caps.GMX<=8000);
});
test('only authoritative report workflow remains manually runnable',()=>{
 const root=new URL('../../.github/workflows/',import.meta.url);
 const files=fs.readdirSync(root).filter(x=>x.endsWith('.yml'));
 const manual=files.filter(f=>/workflow_dispatch\s*:/u.test(fs.readFileSync(new URL(f,root),'utf8')));
 assert.deepEqual(manual,['report2.yml']);
});
test('workflow schedule and generation binding are exact',()=>{
 const y=fs.readFileSync(new URL('../../.github/workflows/report2.yml',import.meta.url),'utf8');
 assert.ok(y.includes('- cron: "*/20 * * * *"'));
 assert.match(y,/REPORT2_D1_RUNS_PER_DAY:\s*"80"/);
 assert.match(y,/REPORT2_CURRENT_GENERATION:\s*"MY_REPORT_2_CURRENT_20260929_CURRENT_CYCLE_V13_20M"/);
 assert.match(y,/REPORT2_MANUAL_COIN_CONTRACT:/);
 assert.match(y,/REPORT2_SUPPLEMENTAL_IDENTITY_REGISTRY_JSON:\s*\$\{\{ secrets\.REPORT2_SUPPLEMENTAL_IDENTITY_REGISTRY_JSON \}\}/);
 assert.match(y,/REPORT2_LIQUIDATION_EXTENSION_MODE:\s*"SHADOW_ONLY"/);
 assert.match(y,/LIQFLOW_API_KEY:\s*\$\{\{ secrets\.LIQFLOW_API_KEY \}\}/);
 assert.match(y,/BLOCKSCOUT_PRO_API_KEY:\s*\$\{\{ secrets\.BLOCKSCOUT_PRO_API_KEY \}\}/);
 assert.match(y,/T16_METADATA_SOURCES_SMOKE/);
 assert.match(y,/T16_OFFICIAL_FEED_SMOKE/);
 assert.match(y,/T16_LIDO_SNAPSHOT_SMOKE/);
 assert.match(y,/T16_LIGHTER_NATIVE_SMOKE/);
 assert.match(y,/T16_GMX_NATIVE_SMOKE/);
 assert.match(y,/T16_GTRADE_NATIVE_SMOKE/);
 assert.match(y,/T16_BLOCKSCOUT_INDEX_SMOKE/);
});
test('root pointer and workflow resolve the same current generation',()=>{
 const pointer=JSON.parse(fs.readFileSync(new URL('../../REPORT2_CURRENT_GENERATION.json',import.meta.url),'utf8'));
 const workflow=fs.readFileSync(new URL('../../.github/workflows/report2.yml',import.meta.url),'utf8');
 assert.equal(pointer.latest_only,true);
 assert.equal(pointer.generation,generation.generation);
 assert.match(workflow,new RegExp(`REPORT2_CURRENT_GENERATION:\\s*"${pointer.generation}"`));
 assert.deepEqual(pointer.full_evidence_weights,[35,30,20,15]);
});
test('runtime overlay carries the complete formatter dependency set',()=>{
 const overlay=fs.readFileSync(new URL('../apply-runtime-overlay.mjs',import.meta.url),'utf8');
 for(const rel of ['src/canonical-display.mjs','src/native-liquidation-guard.mjs','src/reason-registry.mjs']){
  assert.match(overlay,new RegExp(`['\"]${rel.replaceAll('/','\\/')}['\"]`));
 }
});
test('authoritative workflow applies current generation exactly once through combined reconstruction',()=>{
 const y=fs.readFileSync(new URL('../../.github/workflows/report2.yml',import.meta.url),'utf8');
 const combined='post-v7-consolidated/full-validation/apply-all-runtime.mjs runtime .';
 const direct='node current-generation/apply-runtime-overlay.mjs runtime';
 const hash='ACTUAL="$(sha256sum src/worker.js';
 assert.ok(y.indexOf(combined)>=0&&y.indexOf(hash)>y.indexOf(combined));
 assert.equal(y.includes(direct),false);
 const applyAll=fs.readFileSync(new URL('../../post-v7-consolidated/full-validation/apply-all-runtime.mjs',import.meta.url),'utf8');
 assert.equal(applyAll.split('current-generation/apply-runtime-overlay.mjs').length-1,1);
});
test('current overlay accepts only the clean base and the pinned deployed predecessor',()=>{
 const overlay=fs.readFileSync(new URL('../apply-runtime-overlay.mjs',import.meta.url),'utf8');
 assert.match(overlay,/940bb12428f320bf248fadd2acd45399af705e144440750973551e5a935f7cc2/);
 assert.match(overlay,/c25939859bbe3f02a7f3479d1f0f656b4877c06dd72f18e372e4927289ba5a97/);
 assert.match(overlay,/expectedInputs\.has\(sha\(input\)\)/);
});
test('runtime diagnostic version is V13',()=>{
 const runner=fs.readFileSync(new URL('../files/runner-main.mjs',import.meta.url),'utf8');
 assert.match(runner,/my-report-2-current-generation-v13-current-cycle-20260929/);
});
test('workflow worker pin equals the effective V13 worker bytes',()=>{
 const worker=fs.readFileSync(new URL('../files/src/worker.js',import.meta.url));
 const hash=createHash('sha256').update(worker).digest('hex');
 const workflow=fs.readFileSync(new URL('../../.github/workflows/report2.yml',import.meta.url),'utf8');
 assert.equal(hash,'95e0638533ad94f8996879a18f521b7d0ebed9fff4697549b7726f9c2071c795');
 assert.match(workflow,new RegExp(hash));
});
test('controlled T15 measurements upload an exact sanitized receipt',()=>{
 const workflow=fs.readFileSync(new URL('../../.github/workflows/report2.yml',import.meta.url),'utf8'),runner=fs.readFileSync(new URL('../files/runner-main.mjs',import.meta.url),'utf8');
 assert.match(workflow,/REPORT2_MEASUREMENT_ARTIFACT_ENABLED/);assert.match(workflow,/report2-measured-run-/);assert.match(runner,/report2-measurement\.json/);assert.match(runner,/secret_values_stored:false/);
});
test('source quota admission protects mandatory completion without reserving optional sidecars twice',()=>{
 const runner=fs.readFileSync(new URL('../files/runner-main.mjs',import.meta.url),'utf8');
 const block=runner.match(/const requiredDownstream=\{([\s\S]*?)\n\s*\};/u)?.[1]||'';
 assert.match(block,/V3_TELEGRAM_LIFECYCLE_SIDECAR_BUDGET/u);
 assert.match(block,/BOUND_TELEGRAM_DELIVERY_BUDGET/u);
 assert.doesNotMatch(block,/V3_EARLY_SIDECAR_BUDGET/u);
 assert.doesNotMatch(block,/V3_REALIZED_LIQUIDATION_SIDECAR_BUDGET/u);
 assert.doesNotMatch(block,/V3_LIQUIDATION_SIDECAR_BUDGET/u);
});
