import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const generation=JSON.parse(fs.readFileSync(new URL('../GENERATION.json',import.meta.url),'utf8'));
test('18-minute schedule plus three manual runs fits 31-day quota with reserve',()=>{
 const scheduled=generation.scheduled_runs_per_day;
 const scheduledWorst=scheduled*31*generation.max_bykaranteli_requests_per_deep_check;
 const worst=(scheduled+generation.manual_runs_reserved_per_day)*31*generation.max_bykaranteli_requests_per_deep_check;
 assert.equal(scheduled,80);assert.equal(scheduledWorst,12400);assert.equal(worst,12865);
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
 for(const cron of ['0,18,36,54 0-23/3 * * *','12,30,48 1-23/3 * * *','6,24,42 2-23/3 * * *'])assert.ok(y.includes(`- cron: "${cron}"`));
 assert.match(y,/REPORT2_D1_RUNS_PER_DAY:\s*"83"/);
 assert.match(y,/REPORT2_CURRENT_GENERATION:\s*"MY_REPORT_2_CURRENT_20260927_LIQ_ALL_HTX_EXCEPT_BTC_ETH_V1"/);
 assert.match(y,/REPORT2_LIQUIDATION_EXTENSION_MODE:\s*"OFF"/);
});
