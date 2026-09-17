#!/usr/bin/env python3
import argparse, hashlib, pathlib, shutil

RUNNER_BLOB_SHA='f3803f4ed39d200720bfe7b35d7241275f10cb1f'
WORKFLOW_BLOB_SHA='cf085f6684d11ca5272d6bc42b766f309d5f64f2'

def git_blob_sha(data: bytes):
    return hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()

def replace_once(text, old, new, label):
    n=text.count(old)
    if n!=1:
        raise RuntimeError(f'{label}_ANCHOR_COUNT_{n}')
    return text.replace(old,new,1)

def patch_runner_text(text):
    text=replace_once(text,
'''import { RemoteD1Database } from "./report2-d1-adapter.mjs";
import { runTelegramOutputLayer } from "./telegram-output.mjs";''',
'''import { RemoteD1Database } from "./report2-d1-adapter.mjs";
import { runTelegramOutputLayer } from "./telegram-output.mjs";
import { deriveRunReservation, loadDailyUsageAggregate, reserveRunBudget, evaluateDailyReservationBudget, evaluateWithinRunReservation, finalizeRunUsage } from "./d1-preaction-budget-guard.mjs";
import { classifyZeroTelegram } from "./telegram-zero-reason.mjs";''','IMPORT')

    old_hour='''    const minute = new Date(ts).getUTCMinutes();
    if (source === "schedule" && minute !== 2) {
      const report = { mode:"DISCOVERY_RECALL_KPI_SHADOW_V1", status:"DEFERRED_HOURLY_SLOT", scheduled_minute_utc:minute, persisted:false };
      console.log("DISCOVERY_RECALL_KPI_SHADOW", JSON.stringify(report));
      return report;
    }'''
    new_hour='''    const minute = new Date(ts).getUTCMinutes();
    const hourlyBucket = Math.floor(ts / 3_600_000) * 3_600_000;
    if (source === "schedule") {
      const already = await db.prepare(`SELECT audit_ts_bucket FROM discovery_recall_kpi_shadow WHERE audit_ts_bucket=?1 LIMIT 1`).bind(hourlyBucket).first();
      if (already) {
        const report = { mode:"DISCOVERY_RECALL_KPI_SHADOW_V1", status:"ALREADY_FILLED_THIS_HOUR", scheduled_minute_utc:minute, persisted:true };
        console.log("DISCOVERY_RECALL_KPI_SHADOW", JSON.stringify(report));
        return report;
      }
    }'''
    text=replace_once(text,old_hour,new_hour,'HOURLY_LATE_FILL')
    text=replace_once(text,'    const bucket = Math.floor(ts / 3_600_000) * 3_600_000;','    const bucket = hourlyBucket;','HOURLY_BUCKET')

    old_main_start='''  const env = buildEnv();
  const pending = [];
  const ctx = { waitUntil(promise) { pending.push(Promise.resolve(promise)); }, passThroughOnException() {} };
  const started = Date.now();
  await worker.scheduled({ scheduledTime: started, cron: source === "schedule" ? "*/5 * * * *" : "manual" }, env, ctx);'''
    new_main_start='''  const env = buildEnv();
  const pending = [];
  const ctx = { waitUntil(promise) { pending.push(Promise.resolve(promise)); }, passThroughOnException() {} };
  const started = Date.now();
  const d1RunReservation = deriveRunReservation({
    runsPerDay:envNumber("REPORT2_D1_RUNS_PER_DAY", 288),
    maxDailyReads:envNumber("REPORT2_D1_MAX_DAILY_READS", 3_500_000),
    maxDailyWrites:envNumber("REPORT2_D1_MAX_DAILY_WRITES", 70_000),
  });
  if (!d1RunReservation.ok) throw new Error(`D1_RUN_RESERVATION_NOT_CLOSED:${d1RunReservation.status}`);
  const d1DailyBeforeReservation = await loadDailyUsageAggregate(env.DATA_DB, started);
  const d1DayAdmission = evaluateDailyReservationBudget({
    daily:d1DailyBeforeReservation,
    nextReservation:d1RunReservation,
    maxDailyReads:envNumber("REPORT2_D1_MAX_DAILY_READS", 3_500_000),
    maxDailyWrites:envNumber("REPORT2_D1_MAX_DAILY_WRITES", 70_000),
  });
  if (!d1DayAdmission.allowed) throw new Error(`D1_DAY_PREACTION_BUDGET_BLOCKED:${d1DayAdmission.status}:${(d1DayAdmission.reasons||[]).join(",")}`);
  const d1ReservationId = `R2RUN:${started}:${sha.slice(0,16)}`;
  const d1ReservationReceipt = await reserveRunBudget(env.DATA_DB,{reservationId:d1ReservationId,now:started,reservation:d1RunReservation});
  await worker.scheduled({ scheduledTime: started, cron: source === "schedule" ? "*/5 * * * *" : "manual" }, env, ctx);'''
    text=replace_once(text,old_main_start,new_main_start,'RUN_RESERVATION_BEFORE_WORKER')

    old_start='''  const telegramOutput = await runTelegramOutputLayer({
    db: env.DATA_DB,'''
    new_start='''  const d1PreTelegramBudget = evaluateWithinRunReservation({
    reservation:d1RunReservation,
    currentUsage:env.DATA_DB.usageSnapshot(),
    extraRowsRead:64,
    extraRowsWritten:41,
  });
  let telegramOutput;
  if (!d1PreTelegramBudget.allowed) {
    telegramOutput = {
      version:"telegram-output-budget-guard", enabled:true, final_chain_auto:false,
      morning:{status:"BLOCKED_D1_PREACTION_BUDGET",sent:false},
      watch70:{status:"DISABLED_FINAL_CHAIN_ONLY",sent:0},
      shadow_decision:{status:"BLOCKED_D1_PREACTION_BUDGET",sent:false,count:0,skipped:[{reason:d1PreTelegramBudget.status}]},
    };
  } else telegramOutput = await runTelegramOutputLayer({
    db: env.DATA_DB,'''
    text=replace_once(text,old_start,new_start,'PRE_TELEGRAM_BUDGET')
    text=replace_once(text,
'''    fetchImpl: nativeFetch,
  });
  if (source !== "schedule"''',
'''    fetchImpl: nativeFetch,
  });
  const telegramZeroReason = classifyZeroTelegram({ preBudget:d1PreTelegramBudget, telegramObserver, telegramOutput });
  if (source !== "schedule"''','TELEGRAM_WRAP_CLOSE')

    text=replace_once(text,
'''  const d1Usage = enforceD1Budget(env.DATA_DB);
  const completed = Date.now();
  console.log(JSON.stringify({ ok:true, version:RUNNER_VERSION, source, started_ts:started, completed_ts:completed, duration_ms:completed-started, worker_sha256:sha, cron_run_id:cron.run_id, universe_total:Number(cron.universe_total), scanned:Number(cron.scanned), stage0_coverage_pct:Number(scan.stage0_coverage_pct), telegram_observer:telegramObserver, discovery_recall_kpi:discoveryRecallKpi, telegram_output:telegramOutput, d1_usage:d1Usage, bykaranteli_secret_exported:false }));''',
'''  const d1PostCycleBudget = evaluateWithinRunReservation({reservation:d1RunReservation,currentUsage:env.DATA_DB.usageSnapshot()});
  if (!d1PostCycleBudget.allowed) throw new Error(`D1_POST_CYCLE_RESERVATION_EXCEEDED:${(d1PostCycleBudget.reasons||[]).join(",")}`);
  const d1Usage = enforceD1Budget(env.DATA_DB);
  const d1FinalizedUsage = await finalizeRunUsage(env.DATA_DB,{reservationId:d1ReservationId,sourceRunId:cron.run_id,now:Date.now(),usage:env.DATA_DB.usageSnapshot()});
  const completed = Date.now();
  console.log(JSON.stringify({ ok:true, version:RUNNER_VERSION, source, started_ts:started, completed_ts:completed, duration_ms:completed-started, worker_sha256:sha, cron_run_id:cron.run_id, universe_total:Number(cron.universe_total), scanned:Number(cron.scanned), stage0_coverage_pct:Number(scan.stage0_coverage_pct), telegram_observer:telegramObserver, discovery_recall_kpi:discoveryRecallKpi, telegram_output:telegramOutput, telegram_zero_reason:telegramZeroReason, d1_run_reservation:d1RunReservation, d1_day_admission:d1DayAdmission, d1_reservation_receipt:d1ReservationReceipt, d1_pretelegram_budget:d1PreTelegramBudget, d1_post_cycle_budget:d1PostCycleBudget, d1_finalized_usage:d1FinalizedUsage, d1_usage:d1Usage, bykaranteli_secret_exported:false }));''','POST_BUDGET_FINALIZE')
    return text

def patch_workflow_text(text, worker_sha):
    if not worker_sha or len(worker_sha)!=64 or any(c not in '0123456789abcdef' for c in worker_sha.lower()):
        raise RuntimeError('WORKER_SHA_INVALID')
    import re
    text,n=re.subn(r'REPORT2_EXPECTED_WORKER_SHA: "[0-9a-f]{64}"',f'REPORT2_EXPECTED_WORKER_SHA: "{worker_sha.lower()}"',text,count=1)
    if n!=1: raise RuntimeError(f'WORKFLOW_WORKER_SHA_ANCHOR_COUNT_{n}')
    text=replace_once(text,
'''          cp runner/report2-d1-adapter.mjs runtime/report2-d1-adapter.mjs
          cp runner/telegram-output.mjs runtime/telegram-output.mjs''',
'''          cp runner/report2-d1-adapter.mjs runtime/report2-d1-adapter.mjs
          cp runner/d1-preaction-budget-guard.mjs runtime/d1-preaction-budget-guard.mjs
          cp runner/telegram-zero-reason.mjs runtime/telegram-zero-reason.mjs
          cp runner/telegram-output.mjs runtime/telegram-output.mjs''','WORKFLOW_COPY_MODULES')
    return text

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('repo')
    ap.add_argument('--candidate-root',required=True)
    ap.add_argument('--worker-sha',required=True)
    ap.add_argument('--dry-run',action='store_true')
    a=ap.parse_args()
    repo=pathlib.Path(a.repo).resolve(); cand=pathlib.Path(a.candidate_root).resolve()
    runner=repo/'runner/runner-main.mjs'; workflow=repo/'.github/workflows/report2.yml'
    rb=runner.read_bytes(); wb=workflow.read_bytes()
    if git_blob_sha(rb)!=RUNNER_BLOB_SHA: raise SystemExit(f'RUNNER_MAIN_GIT_BLOB_SHA_MISMATCH:{git_blob_sha(rb)}')
    if git_blob_sha(wb)!=WORKFLOW_BLOB_SHA: raise SystemExit(f'WORKFLOW_GIT_BLOB_SHA_MISMATCH:{git_blob_sha(wb)}')
    rt=patch_runner_text(rb.decode()); wt=patch_workflow_text(wb.decode(),a.worker_sha)
    if a.dry_run:
        print('PATCH_GUARDS=PASS'); print('RUNNER_PATCH=READY'); print('WORKFLOW_PATCH=READY'); return
    shutil.copy2(runner,runner.with_suffix('.mjs.BACKUP-before-r9'))
    shutil.copy2(workflow,workflow.with_suffix('.yml.BACKUP-before-r9'))
    runner.write_text(rt); workflow.write_text(wt)
    for name in ['d1-preaction-budget-guard.mjs','telegram-zero-reason.mjs','telegram-output.mjs']:
        shutil.copy2(cand/name,repo/'runner'/name)
    print('PATCH_APPLIED_LOCAL_ONLY')

if __name__=='__main__': main()
