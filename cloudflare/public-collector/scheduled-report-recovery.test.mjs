import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {inspectScheduledReportGap,dispatchScheduledReportRecovery,dispatchContinuousBackupRenewal} from './scheduled-report-recovery.mjs';

const NOW=Date.parse('2026-10-12T10:00:00Z');
const run=(time,display_title='Report 2 Cloud Runner',status='completed')=>({created_at:new Date(time).toISOString(),display_title,head_branch:'main',status});
const mockLists=({scheduled=[],dispatched=[],http_status=200}={})=>async(url,options)=>{
  assert.equal(options.headers.Authorization,'Bearer TEST');
  if(http_status!==200)return new Response('{}',{status:http_status});
  const rows=url.includes('event=schedule')?scheduled:dispatched;
  return new Response(JSON.stringify({workflow_runs:rows}),{status:200});
};
const inspect=(fetch_impl,extra={})=>inspectScheduledReportGap({repository:'owner/repo',token:'TEST',now:NOW,fetch_impl,...extra});

test('a recent no-work schedule event cannot hide an overdue D1 full-cycle cadence',async()=>{
  const gap=await inspect(mockLists({scheduled:[run(NOW-10*60_000)]}),{cadence_last_success_ts:NOW-41*60_000});
  assert.equal(gap.allowed,true);
  assert.equal(gap.status,'SCHEDULED_REPORT_GAP_CONFIRMED');
  const fallback=await inspect(mockLists({scheduled:[run(NOW-20*60_000)]}));
  assert.equal(fallback.status,'SCHEDULED_REPORT_RECENT');
});

test('D1 cadence, live schedule, lease and settlement grace suppress duplicate recovery',async()=>{
  const recent=await inspect(mockLists({scheduled:[run(NOW-90*60_000)]}),{cadence_last_success_ts:NOW-20*60_000});
  assert.equal(recent.status,'SCHEDULED_REPORT_RECENT');
  const inProgress=await inspect(mockLists({scheduled:[run(NOW-10*60_000,'Report 2 Cloud Runner','in_progress')]}),{cadence_last_success_ts:NOW-41*60_000});
  assert.equal(inProgress.status,'SCHEDULED_RUN_IN_PROGRESS');
  const grace=await inspect(mockLists({scheduled:[run(NOW-2*60_000)]}),{cadence_last_success_ts:NOW-41*60_000});
  assert.equal(grace.status,'SCHEDULED_RUN_SETTLEMENT_GRACE');
  const lease=await inspect(mockLists({scheduled:[run(NOW-90*60_000)]}),{cadence_last_success_ts:NOW-41*60_000,cadence_lease_expires_ts:NOW+60_000});
  assert.equal(lease.status,'CADENCE_LEASE_ACTIVE_OR_INVALID');
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
  assert.match(worker,/SELECT last_success_ts,lease_expires_ts FROM v3_maintenance_cadence_shadow/);
  assert.match(worker,/RECOVERY_CADENCE_READ_FAILED/);
  assert.match(workflow,/Verify exact recovery delivery artifact without network\n\s*if:.*scheduled_recovery_run == true.*full_report\.outcome == 'success'/);
  assert.match(workflow,/runtime\/automatic-delivery-audit\.json/);
  assert.match(backup,/workflow_dispatch:\n\s*inputs:/);
  assert.match(backup,/current-generation\/files\/\*\*/);
  assert.match(worker,/dispatchContinuousBackupRenewal/);
});

test('only a normally closed, current-main guarded backup worker may renew its bounded window',async()=>{
  const worker={status:'WORKER_WINDOW_CLOSED',cycles:3};
  const code_guard={allowed:true,status:'CURRENT_MAIN_CODE_VERIFIED'};
  let calls=0;
  const fetch_impl=async(url,options)=>{
    calls++;
    assert.equal(url,'https://api.github.com/repos/owner/repo/actions/workflows/report2-public-collector-backup.yml/dispatches');
    assert.equal(options.method,'POST');
    assert.deepEqual(JSON.parse(options.body),{ref:'main',inputs:{reason:'CONTINUOUS_BACKUP_RENEWAL'}});
    return new Response(null,{status:204});
  };
  const args={worker,code_guard,repository:'owner/repo',token:'TEST',fetch_impl};
  assert.equal((await dispatchContinuousBackupRenewal(args)).dispatched,true);
  assert.equal(calls,1);
  for(const patch of [{worker:{status:'ORIGINAL_SOURCE_JOB_HTTP_CAP_REACHED',cycles:3}},{worker:{status:'WORKER_WINDOW_CLOSED',cycles:0}},{code_guard:{allowed:false,status:'CURRENT_MAIN_CODE_CHANGED'}},{token:''}]){
    assert.equal((await dispatchContinuousBackupRenewal({...args,...patch})).dispatched,false);
  }
  assert.equal(calls,1);
  assert.equal((await dispatchContinuousBackupRenewal({...args,fetch_impl:async()=>new Response(null,{status:403})})).status,'BACKUP_RENEWAL_DISPATCH_FAILED');
});
