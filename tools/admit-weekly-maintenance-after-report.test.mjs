import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {admitWeeklyMaintenance} from './admit-weekly-maintenance-after-report.mjs';
import {buildNoWorkReceipt} from './report2-no-work-receipt.mjs';

const head = 'a'.repeat(40), cloudRun = '38209536559';
const log = [
  'SCHEDULED_TWO_CANDIDATE_ADMISSION '+JSON.stringify({status:'NOT_DUE', claimed:false, due:false, last_success_ts:1000, next_due_ts:3000}),
  'TRIGGERED_ENTRY_RECHECK_ADMISSION '+JSON.stringify({status:'NO_FRESH_EXACT_SENT_TRIGGER', claimed:false, entry_authorized:false, source_http:0})
].join('\n');
const noWork = buildNoWorkReceipt(log, {head, source_cloud_run:cloudRun});
const decide = extras => admitWeeklyMaintenance({expected_head:head, expected_cloud_run:cloudRun, ...extras});

test('a full analysis or refusal takes priority over weekly maintenance', () => {
  for (const status of ['CLOSED', 'NOT_CLOSED'])
    assert.deepEqual(decide({run_result:{head, run_id:'native-analytics-run', status}}), {allowed:false, status:'CURRENT_REPORT_RESULT_PRESENT'});
});

test('weekly maintenance uses only the exact no-work slot of this scheduled run', () => {
  assert.deepEqual(decide({no_work_receipt:noWork}), {allowed:true, status:'EXACT_NOT_DUE_NO_WORK_SLOT'});
  assert.throws(() => decide({no_work_receipt:{...noWork, source_cloud_run:'1'}}), /NO_WORK_RECEIPT_BINDING_REQUIRED/);
  assert.throws(() => decide({run_result:{head, run_id:cloudRun}, no_work_receipt:noWork}), /CONFLICTING_CURRENT_RUN_ARTIFACTS/);
  assert.throws(() => decide({}), /CURRENT_RUN_OUTCOME_REQUIRED/);
  assert.throws(() => decide({run_result:{head:'b'.repeat(40), run_id:'native-analytics-run'}}), /CURRENT_RUN_RESULT_HEAD_REQUIRED/);
});

test('scheduled workflow attempts the full cycle before bounded weekly maintenance', () => {
  const workflow = readFileSync(new URL('../.github/workflows/report2.yml', import.meta.url), 'utf8');
  const full = workflow.indexOf('      - name: Full Report 2 cycle\n');
  const weekly = workflow.indexOf('      - name: Maintain weekly liquidation coverage without Telegram\n');
  assert.ok(full >= 0 && weekly > full);
  assert.match(workflow, /steps\.weekly_slot\.outputs\.allowed == 'true'/);
  assert.doesNotMatch(workflow, /steps\.weekly_coverage\.outputs\.maintenance_active/);
  assert.equal(fs.existsSync(new URL('./admit-weekly-maintenance-after-report.mjs', import.meta.url)), true);
});
