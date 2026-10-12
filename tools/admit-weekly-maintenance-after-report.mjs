import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {auditNoWorkReceipt} from './report2-no-work-receipt.mjs';

export function admitWeeklyMaintenance({run_result, no_work_receipt, expected_head, expected_cloud_run} = {}) {
  if (!/^[a-f0-9]{40}$/.test(expected_head || '') || !/^\d+$/.test(String(expected_cloud_run || '')))
    throw Error('EXACT_CURRENT_RUN_REQUIRED');
  if (run_result && no_work_receipt) throw Error('CONFLICTING_CURRENT_RUN_ARTIFACTS');
  if (run_result) {
    if (run_result.head !== expected_head) throw Error('CURRENT_RUN_RESULT_HEAD_REQUIRED');
    return {allowed: false, status: 'CURRENT_REPORT_RESULT_PRESENT'};
  }
  if (!no_work_receipt) throw Error('CURRENT_RUN_OUTCOME_REQUIRED');
  auditNoWorkReceipt({receipt: no_work_receipt, expected_head, expected_cloud_run});
  return {allowed: true, status: 'EXACT_NOT_DUE_NO_WORK_SLOT'};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [dir, expected_head, expected_cloud_run] = process.argv.slice(2);
  if (!dir) throw Error('RUNTIME_DIRECTORY_REQUIRED');
  const read = name => {
    const file = path.join(dir, name);
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  };
  const result = admitWeeklyMaintenance({
    run_result: read('report2-run-result.json'),
    no_work_receipt: read('report2-no-work-receipt.json'),
    expected_head,
    expected_cloud_run
  });
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `allowed=${result.allowed}\n`);
  console.log(JSON.stringify({...result, sourceHTTP: 0, D1: 0, Telegram: 0}));
}
