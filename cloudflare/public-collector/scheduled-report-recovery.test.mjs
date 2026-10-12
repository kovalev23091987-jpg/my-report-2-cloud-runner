import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {inspectScheduledReportGap,dispatchScheduledReportRecovery} from './scheduled-report-recovery.mjs';

const NOW=Date.parse('2026-10-12T10:00:00Z');
const run=(time,display_title='Report 2 Cloud Runner')=>({created_at:new Date(time).toISOString(),display_title,head_branch:'main'});
const mockLists=({scheduled=[],dispatched=[],http_status=200}={})=>async(url,options)=>{
  assert.equal(options.headers.Authorization,'Bearer TEST');
  if(http_status!==200)return new Response('{}',{status:http_status});
  const rows=url.includes('event=schedule')?scheduled:dispatched;
  return new Response(JSON.stringify({workflow_runs:rows}),{status:200});
};
const inspect=(fetch_impl,extra={})=>inspectScheduledReportGap({repository:'owner/repo',token:'TEST',now:NOW,fetch_impl,...extra});

test('recent scheduled report suppresses recovery even when no report was published',async()=>{
  const gap=await inspect(mockLists({scheduled:[run(NOW-20*60_000)]}));
  assert.equal(gap.allowed,false);
  assert.equal(gap.status,'SCHEDULED_REPORT_RECENT');
});

test('confirmed forty-minute schedule gap dispatches the same bounded report path',async()=>{
  const gap=await inspect(mockLists({scheduled:[run(NOW-41*60_000)]}));
  assert.equal(gap.allowed,true);
  let calls=0;
  const result=await dispatchScheduledReportRecovery({gap,repository:'owner/repo',token:'TEST',fetch_impl:async(url,options)=>{
    calls++;
    assert.equal(url,'https://api.github.com/repos/owner/repo/actions/workflows/report2.yml/dispatches');
    assert.deepEqual(JSON.parse(options.body),{ref:'main',inputs:{reason:'SCHEDULED_CADENCE_RECOVERY',scheduled_recovery_run:true,manual_run_authorized:false}});
    return new Response(null,{status:204});
  }});
  assert.equal(calls,1);
  assert.equal(result.dispatched,true);
  assert.equal(result.source_http,0);
  assert.equal(result.D1,0);
});

test('recent recovery and local accepted dispatch suppress duplicates',async()=>{
  const recent=await inspect(mockLists({scheduled:[run(NOW-90*60_000)],dispatched:[run(NOW-5*60_000,'Report 2 scheduled recovery')]}));
  assert.equal(recent.status,'SCHEDULED_REPORT_RECENT');
  const local=await inspect(async()=>{throw Error('should not read');},{local_last_accepted_ts:NOW-5*60_000});
  assert.equal(local.status,'LOCAL_RECOVERY_ALREADY_ACCEPTED');
});

test('ambiguous history, failed GitHub read and future clocks refuse dispatch',async()=>{
  const crowded=await inspect(mockLists({dispatched:Array.from({length:100},()=>run(NOW-90*60_000,'Unrelated validation'))}));
  assert.equal(crowded.status,'RECOVERY_HISTORY_NOT_CLOSED');
  const failed=await inspect(mockLists({http_status:503}));
  assert.equal(failed.status,'RECOVERY_CONTROL_READ_FAILED');
  const future=await inspect(mockLists({scheduled:[run(NOW+60_000)]}));
  assert.equal(future.status,'RECOVERY_RUN_TIME_FUTURE');
  assert.equal((await dispatchScheduledReportRecovery({gap:failed,repository:'owner/repo',token:'TEST'})).dispatched,false);
});

test('workflow recovery uses scheduled source, caps and Telegram admission without manual queue',()=>{
  const workflow=fs.readFileSync(new URL('../../.github/workflows/report2.yml',import.meta.url),'utf8');
  const backup=fs.readFileSync(new URL('../../.github/workflows/report2-public-collector-backup.yml',import.meta.url),'utf8');
  const worker=fs.readFileSync(new URL('./github-backup.mjs',import.meta.url),'utf8');
  assert.match(workflow,/run-name:.*Report 2 scheduled recovery/);
  assert.match(workflow,/RECOVERY_REASON.*inputs\.reason/);
  assert.match(workflow,/\[ "\$RECOVERY_REASON" = "SCHEDULED_CADENCE_RECOVERY" \]/);
  assert.match(workflow,/DELIVERY_ENABLED:.*inputs\.scheduled_recovery_run == true/);
  assert.match(workflow,/REPORT2_EVIDENCE_HTTP_CAP:.*inputs\.scheduled_recovery_run == true/);
  assert.match(workflow,/REPORT2_V3_TELEGRAM_NETWORK_ENABLED:.*inputs\.scheduled_recovery_run == true/);
  assert.match(workflow,/REPORT2_RUN_SOURCE:.*inputs\.scheduled_recovery_run == true.*'schedule'/);
  assert.match(workflow,/if:.*github\.event_name == 'schedule' \|\| inputs\.scheduled_recovery_run == true.*\n\s*id: known_day_guard/);
  assert.match(workflow,/inputs\.trigger_only_run != true && \(\(github\.event_name == 'push'/);
  assert.match(backup,/REPORT2_SCHEDULED_RECOVERY_ENABLED:.*REPORT2_RUNNER_ENABLED/);
  assert.match(worker,/durationMinutes>0/);
  assert.match(worker,/inspectScheduledReportGap/);
});
