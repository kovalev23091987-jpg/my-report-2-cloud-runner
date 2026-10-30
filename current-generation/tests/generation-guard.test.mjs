import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const generation=JSON.parse(fs.readFileSync(new URL('../GENERATION.json',import.meta.url),'utf8'));
test('two candidates every 40 minutes plus three full reports and five coin analyses fits quota',()=>{
 const scheduled=generation.scheduled_runs_per_day;
 const scheduledWorst=(scheduled+generation.burst_deep_checks_reserved_per_day)*31*generation.max_bykaranteli_requests_per_deep_check;
 const worst=(scheduled+generation.burst_deep_checks_reserved_per_day+generation.manual_deep_checks_reserved_per_day)*31*generation.max_bykaranteli_requests_per_deep_check;
 assert.equal(generation.manual_report_runs_reserved_per_day,3);
 assert.equal(generation.manual_coin_analysis_runs_reserved_per_day,5);
 assert.equal(scheduled,72);assert.equal(scheduledWorst,11625);assert.equal(worst,13330);
 assert(scheduledWorst<generation.bykaranteli_scheduled_monthly_cap);
 assert(worst<generation.bykaranteli_operational_monthly_cap);
 assert(generation.bykaranteli_scheduled_monthly_cap<generation.bykaranteli_operational_monthly_cap);
 assert(generation.bykaranteli_operational_monthly_cap<generation.bykaranteli_official_monthly_quota);
});
test('multi-source comparison remains bounded for schedule, burst checks and manual reserve',()=>{
 const deepRuns=(generation.scheduled_runs_per_day+generation.burst_deep_checks_reserved_per_day+generation.manual_deep_checks_reserved_per_day)*31;
 assert.equal(deepRuns,2666);
 const totalRequests=(generation.scheduled_runs_per_day+generation.burst_deep_checks_reserved_per_day)*31*generation.full_report_shared_extension_request_cap+generation.manual_deep_checks_reserved_per_day*31*generation.liquidation_only_max_additional_requests;
 assert.equal(totalRequests,14353);
 assert.equal(generation.multi_source_max_deep_checks_per_31_days,deepRuns);
 assert.equal(generation.multi_source_max_shared_requests_per_31_days,14353);
 assert.equal(generation.multi_source_oxarchive_worst_case_credits_per_31_days,2666);
 assert.equal(generation.multi_source_provider_monthly_caps.OXARCHIVE-2666,2334);
 assert.ok(generation.multi_source_provider_monthly_caps.GTRADE<=4000);
 assert.ok(generation.multi_source_provider_monthly_caps.GMX<=8000);
 assert.equal(generation.full_report_liq_total_http_cap_including_supplements,8);
 assert.equal(generation.full_report_liq_supplement_per_selected_coin_cap,2);
 assert.equal((generation.scheduled_runs_per_day+generation.burst_deep_checks_reserved_per_day+generation.manual_deep_checks_reserved_per_day)*31*8,generation.worst_case_31_day_liq_total_with_manual_and_burst);
});
test('only authorized report and bounded source workflows remain manually runnable',()=>{
 const root=new URL('../../.github/workflows/',import.meta.url);
 const files=fs.readdirSync(root).filter(x=>x.endsWith('.yml'));
 const manual=files.filter(f=>/workflow_dispatch\s*:/u.test(fs.readFileSync(new URL(f,root),'utf8')));
 assert.deepEqual(manual,['active-source-budget-read-20261014.yml','canonical-compression-validation.yml','coingecko-demo-validation.yml','current-bridge-module-inspection-20261016.yml','current-hourly-native-observer-repair.yml','current-public-collector-repair.yml','deploy-free-history-20261012.yml','deploy-liq-forecast-history-20261013.yml','exact-entry-followup-20261018.yml','exact-recovery-diagnosis-20261018.yml','free-archive-reader-rollout-20261015.yml','htx-compact-4h-daily-20261010.yml','htx-weekly-source-universe.yml','liq-assembled-offline-20261012.yml','liquidation-new-source-qualification-20261015.yml','n05-post-reset-common-source-batch-20261011.yml','paid-sliding-history-20261018.yml','report2-public-collector-backup.yml','report2.yml','retained-history-maintenance.yml','retained-history-native-qualification-20261016.yml','weekly-htx-coordinated-rollout.yml']);
 const entryRead=fs.readFileSync(new URL('exact-entry-followup-20261018.yml',root),'utf8');assert.match(entryRead,/github.ref == 'refs\/heads\/main'/);assert.match(entryRead,/inputs\.expected_main/);assert.match(entryRead,/inputs\.expected_owner/);assert.doesNotMatch(entryRead,/schedule:|cron:|TELEGRAM_BOT_TOKEN|runner-main|manual-requests|deploy/);
 const exactRecovery=fs.readFileSync(new URL('exact-recovery-diagnosis-20261018.yml',root),'utf8');assert.match(exactRecovery,/github.ref == 'refs\/heads\/main'/);assert.match(exactRecovery,/inputs\.expected_main/);assert.match(exactRecovery,/inputs\.expected_owner/);assert.doesNotMatch(exactRecovery,/schedule:|cron:|TELEGRAM_BOT_TOKEN|runner-main|manual-requests|deploy/);
 const dated=fs.readFileSync(new URL('retained-history-native-qualification-20261016.yml',root),'utf8');assert.match(dated,/github.ref == 'refs\/heads\/main'/);assert.match(dated,/inputs\.qualified_head/);assert.match(dated,/inputs\.qualified_run/);assert.match(dated,/REPORT2_SELF_NATIVE_QUALIFICATION_UTC_DAY: '2026-10-16'/);assert.doesNotMatch(dated,/schedule:|cron:|TELEGRAM_BOT_TOKEN|runner-main|manual-requests/);
 const newLiq=fs.readFileSync(new URL('liquidation-new-source-qualification-20261015.yml',root),'utf8');assert.match(newLiq,/github.ref == 'refs\/heads\/main'/);assert.match(newLiq,/inputs\.expected_main/);assert.match(newLiq,/inputs\.expected_lease_owner/);assert.doesNotMatch(newLiq,/runner-main|TELEGRAM_BOT_TOKEN|manual-requests/);
 const bridgeInspect=fs.readFileSync(new URL('current-bridge-module-inspection-20261016.yml',root),'utf8');assert.match(bridgeInspect,/github.ref == 'refs\/heads\/main'/);assert.match(bridgeInspect,/inputs\.expected_main/);assert.match(bridgeInspect,/inputs\.owner/);assert.match(bridgeInspect,/inputs\.connected_run/);assert.match(bridgeInspect,/default: false/);assert.doesNotMatch(bridgeInspect,/schedule:|cron:|D1_BRIDGE_TOKEN|D1_API_TOKEN|TELEGRAM_BOT_TOKEN|runner-main|manual-requests|deploy|--test-scheduled/);
 const hourlyObserver=fs.readFileSync(new URL('current-hourly-native-observer-repair.yml',root),'utf8');assert.match(hourlyObserver,/github.ref == 'refs\/heads\/main'/);assert.match(hourlyObserver,/inputs\.owner/);assert.match(hourlyObserver,/inputs\.connected_run/);assert.match(hourlyObserver,/default: false/);assert.doesNotMatch(hourlyObserver,/schedule:|cron:|D1_BRIDGE|TELEGRAM_BOT_TOKEN|runner-main|manual-requests|--test-scheduled/);
 const readerRepair=fs.readFileSync(new URL('free-archive-reader-rollout-20261015.yml',root),'utf8');assert.match(readerRepair,/github.ref == 'refs\/heads\/main'/);assert.match(readerRepair,/inputs\.expected_main/);assert.match(readerRepair,/inputs\.owner/);assert.match(readerRepair,/inputs\.connected_run/);assert.match(readerRepair,/default: false/);assert.doesNotMatch(readerRepair,/D1_BRIDGE|D1_API_TOKEN|TELEGRAM_BOT_TOKEN|runner-main|manual-requests|--test-scheduled/);
 const collectorRepair=fs.readFileSync(new URL('current-public-collector-repair.yml',root),'utf8');assert.match(collectorRepair,/github.ref == 'refs\/heads\/main'/);assert.match(collectorRepair,/inputs\.borrow_existing_owner/);assert.match(collectorRepair,/default: false/);assert.doesNotMatch(collectorRepair,/D1_BRIDGE|TELEGRAM_BOT_TOKEN|apply-schema|verify-first-sample|runner-main|manual-requests/);
 const weeklyRollout=fs.readFileSync(new URL('weekly-htx-coordinated-rollout.yml',root),'utf8');assert.match(weeklyRollout,/github.ref == 'refs\/heads\/main'/);assert.match(weeklyRollout,/checkWeeklyGithubProposal/);assert.match(weeklyRollout,/inputs\.borrow_existing_owner/);assert.match(weeklyRollout,/default: false/);assert.doesNotMatch(weeklyRollout,/D1_BRIDGE|TELEGRAM_BOT_TOKEN|runner-main|manual-requests/);
 const retained=fs.readFileSync(new URL('retained-history-maintenance.yml',root),'utf8');assert.match(retained,/inputs\.expected_main/);assert.match(retained,/inputs\.expected_owner/);assert.match(retained,/REPORT2_LOSSLESS_RETENTION_ENABLED/);assert.match(retained,/cron: '17 0,12 \* \* \*'/);assert.doesNotMatch(retained,/migrate-retained-history|maintenance-lease\.mjs|runner-main|manual-requests/);
 const paidHistory=fs.readFileSync(new URL('paid-sliding-history-20261018.yml',root),'utf8');assert.match(paidHistory,/github.ref == 'refs\/heads\/main'/);assert.match(paidHistory,/inputs\.expected_owner/);assert.match(paidHistory,/group: report2-retained-history-relocation/);assert.match(paidHistory,/cron: '17 0,12 \* \* \*'/);assert.doesNotMatch(paidHistory,/TELEGRAM_BOT_TOKEN|runner-main|manual-requests|owner_emergency_day/);
 const activeRead=fs.readFileSync(new URL('active-source-budget-read-20261014.yml',root),'utf8');assert.match(activeRead,/inputs\.expected_main/);assert.match(activeRead,/inputs\.lease_owner/);assert.doesNotMatch(activeRead,/runner-main|manual-requests|sendLifecycleRelay|COINGECKO/);
 const activeScript=fs.readFileSync(new URL('../../tools/read-active-source-budgets-20261014.mjs',import.meta.url),'utf8');assert.match(activeScript,/OWNER_OR_FENCE_BLOCKED/);assert.match(activeScript,/INSERT OR IGNORE INTO report2_runner_budget_ledger_shadow/);assert.match(activeScript,/evaluateWithinRunReservation/);assert.match(activeScript,/provider_HTTP:0,MAIN:0,Telegram:0/);assert.doesNotMatch(activeScript,/UPDATE report2_liq_source_allowance_shadow|DELETE FROM|fetch\([^)]*api\.(?:coingecko|coinpaprika)/);
 const compression=fs.readFileSync(new URL('canonical-compression-validation.yml',root),'utf8');assert.match(compression,/validate-canonical-compression-20261013\.mjs/);assert.match(compression,/inputs\.retain_private == true && \(secrets\.REPORT2_CANONICAL_ARCHIVE_D1_API_TOKEN \|\| secrets\.REPORT2_ISOLATED_D1_API_TOKEN\)/);assert.doesNotMatch(compression,/COINGECKO|runner-main|sendLifecycleRelay|manual-requests/);
 const cg=fs.readFileSync(new URL('coingecko-demo-validation.yml',root),'utf8');
 assert.match(cg,/tools\/validate-coingecko-demo-sector-20261013\.mjs/);assert.doesNotMatch(cg,/runner-main|sendLifecycleRelay|manual-requests/);
 const cgScript=fs.readFileSync(new URL('../../tools/validate-coingecko-demo-sector-20261013.mjs',import.meta.url),'utf8');assert.match(cgScript,/maxHTTP=4/);assert.match(cgScript,/evaluateDailyReservationBudget/);assert.match(cgScript,/OWNER_OR_FENCE_BLOCKED/);assert.match(cgScript,/MAIN:0,Telegram:0/);
 const liquidationArchive=fs.readFileSync(new URL('deploy-liq-forecast-history-20261013.yml',root),'utf8');
 assert.match(liquidationArchive,/Check exact main owner lease and fence/);
 assert.match(liquidationArchive,/wrangler@4 deploy --config cloudflare\/free-history\/wrangler-liq\.json/);
 assert.doesNotMatch(liquidationArchive,/runner-main|sendLifecycleRelay|manual-requests/);
 const history=fs.readFileSync(new URL('htx-compact-4h-daily-20261010.yml',root),'utf8');
 assert.match(history,/tools\/acquire-htx-compact-4h-history\.mjs/);
 assert.doesNotMatch(history,/runner-main|sendLifecycleRelay|manual-requests/);
 const backup=fs.readFileSync(new URL('report2-public-collector-backup.yml',root),'utf8');
 assert.match(backup,/REPORT2_BACKUP_WORKER_MINUTES: "300"/);
 assert.match(backup,/REPORT2_BACKUP_WORKER_MINUTES: "0"/);
 assert.match(backup,/cloudflare\/public-collector\/github-backup\.mjs/);
 assert.doesNotMatch(backup,/runner-main|sendLifecycleRelay|manual-requests/);
});

test('private canonical copying is separate from provider and Telegram paths, with a scoped token and durable receipt',()=>{
 const workflow=fs.readFileSync(new URL('../../.github/workflows/report2.yml',import.meta.url),'utf8');
 const start=workflow.indexOf('- name: Preserve exact new canonical rows in the free private archive'),end=workflow.indexOf('- name: Admit weekly liquidation maintenance',start),step=workflow.slice(start,end);
 assert(start>0&&end>start);assert.match(step,/steps\.full_report\.outcome == 'success'/);assert.match(step,/REPORT2_CANONICAL_PRIVATE_COPY_ENABLED: "1"/);assert.match(step,/secrets\.REPORT2_CANONICAL_ARCHIVE_D1_API_TOKEN \|\| secrets\.REPORT2_ISOLATED_D1_API_TOKEN/);assert.match(workflow,/runtime\/private-canonical-archive-receipt\.json/);
 const script=fs.readFileSync(new URL('../../tools/retain-current-canonical-private.mjs',import.meta.url),'utf8');
 assert.match(script,/reserveCanonicalCopyBudget/);assert.match(script,/finalizeRunUsage/);assert.match(script,/ARCHIVE_MAIN_MOVED_KEEP_SOURCE/);assert.match(script,/ARCHIVE_PHASE_OR_FENCE_BLOCKED/);assert.doesNotMatch(script,/DELETE FROM|sendLifecycleRelay|COINGECKO|BYKARANTELI/);
});
test('workflow schedule and generation binding are exact',()=>{
 const y=fs.readFileSync(new URL('../../.github/workflows/report2.yml',import.meta.url),'utf8');
 const cron=y.match(/cron: "([^"]+)"/)[1],guard=y.match(/github.event.schedule == '([^']+)'/)[1];
 assert.equal(cron,'7,27,47 * * * *');assert.equal(guard,cron);
 const minutes=cron.split(' ')[0].split(',').map(Number);
 assert.deepEqual([minutes[1]-minutes[0],minutes[2]-minutes[1],60+minutes[0]-minutes[2]],[20,20,20]);
 assert.equal(minutes.length*24,generation.scheduled_runs_per_day);
 assert.match(y,/REPORT2_D1_RUNS_PER_DAY:\s*"47"/);
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
 assert.equal(hash,'4b066bbfbdaaf82b578493b95e48a87983a078cf400d38d154c6811d3f900860');
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
