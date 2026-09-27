import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const generation=JSON.parse(fs.readFileSync(new URL('../GENERATION.json',import.meta.url),'utf8'));
test('20-minute schedule plus three reports and five coin analyses fits 31-day quota with reserve',()=>{
 const scheduled=generation.scheduled_runs_per_day;
 const scheduledWorst=scheduled*31*generation.max_bykaranteli_requests_per_deep_check;
 const worst=(scheduled+generation.manual_runs_reserved_per_day)*31*generation.max_bykaranteli_requests_per_deep_check;
 assert.equal(generation.manual_report_runs_reserved_per_day,3);
 assert.equal(generation.manual_coin_analysis_runs_reserved_per_day,5);
 assert.equal(scheduled,72);assert.equal(scheduledWorst,11160);assert.equal(worst,12400);
 assert(scheduledWorst<generation.bykaranteli_scheduled_monthly_cap);
 assert(worst<generation.bykaranteli_operational_monthly_cap);
 assert(generation.bykaranteli_scheduled_monthly_cap<generation.bykaranteli_operational_monthly_cap);
 assert(generation.bykaranteli_operational_monthly_cap<generation.bykaranteli_official_monthly_quota);
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
 assert.match(y,/REPORT2_CURRENT_GENERATION:\s*"MY_REPORT_2_CURRENT_20260927_DYNAMIC_PANEL_V3_20M"/);
 assert.match(y,/REPORT2_MANUAL_COIN_CONTRACT:/);
 assert.match(y,/REPORT2_SUPPLEMENTAL_IDENTITY_REGISTRY_JSON:\s*\$\{\{ secrets\.REPORT2_SUPPLEMENTAL_IDENTITY_REGISTRY_JSON \}\}/);
 assert.match(y,/REPORT2_LIQUIDATION_EXTENSION_MODE:\s*"SHADOW_ONLY"/);
 assert.match(y,/LIQFLOW_API_KEY:\s*\$\{\{ secrets\.LIQFLOW_API_KEY \}\}/);
});
test('runtime overlay carries the complete formatter dependency set',()=>{
 const overlay=fs.readFileSync(new URL('../apply-runtime-overlay.mjs',import.meta.url),'utf8');
 for(const rel of ['src/canonical-display.mjs','src/native-liquidation-guard.mjs','src/reason-registry.mjs']){
  assert.match(overlay,new RegExp(`['\"]${rel.replaceAll('/','\\/')}['\"]`));
 }
});
