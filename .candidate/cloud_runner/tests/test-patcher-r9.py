import importlib.util, pathlib
p=pathlib.Path(__file__).resolve().parents[2]/'tools/patch_cloud_runner_r9.py'
spec=importlib.util.spec_from_file_location('patcher',p); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
fixture='''import { RemoteD1Database } from "./report2-d1-adapter.mjs";\nimport { runTelegramOutputLayer } from "./telegram-output.mjs";\nasync function f(){\n    const ts = Number(startedTs || Date.now());\n    const minute = new Date(ts).getUTCMinutes();\n    if (source === "schedule" && minute !== 2) {\n      const report = { mode:"DISCOVERY_RECALL_KPI_SHADOW_V1", status:"DEFERRED_HOURLY_SLOT", scheduled_minute_utc:minute, persisted:false };\n      console.log("DISCOVERY_RECALL_KPI_SHADOW", JSON.stringify(report));\n      return report;\n    }\n    const bucket = Math.floor(ts / 3_600_000) * 3_600_000;\n}\nasync function main(){\n  const env = buildEnv();\n  const pending = [];\n  const ctx = { waitUntil(promise) { pending.push(Promise.resolve(promise)); }, passThroughOnException() {} };\n  const started = Date.now();\n  await worker.scheduled({ scheduledTime: started, cron: source === "schedule" ? "*/5 * * * *" : "manual" }, env, ctx);\n  const telegramOutput = await runTelegramOutputLayer({\n    db: env.DATA_DB,\n    fetchImpl: nativeFetch,\n  });\n  if (source !== "schedule" && x) {}\n  const d1Usage = enforceD1Budget(env.DATA_DB);\n  const completed = Date.now();\n  console.log(JSON.stringify({ ok:true, version:RUNNER_VERSION, source, started_ts:started, completed_ts:completed, duration_ms:completed-started, worker_sha256:sha, cron_run_id:cron.run_id, universe_total:Number(cron.universe_total), scanned:Number(cron.scanned), stage0_coverage_pct:Number(scan.stage0_coverage_pct), telegram_observer:telegramObserver, discovery_recall_kpi:discoveryRecallKpi, telegram_output:telegramOutput, d1_usage:d1Usage, bykaranteli_secret_exported:false }));\n}\n'''
out=m.patch_runner_text(fixture)
assert 'reserveRunBudget' in out
assert 'RUN_RESERVATION_BEFORE_WORKER' not in out
assert out.index('reserveRunBudget') < out.index('await worker.scheduled')
assert 'evaluateWithinRunReservation' in out
assert 'BLOCKED_D1_PREACTION_BUDGET' in out
assert 'ALREADY_FILLED_THIS_HOUR' in out
assert 'telegram_zero_reason' in out
assert 'finalizeRunUsage' in out
assert out.index('finalizeRunUsage') > out.index('runTelegramOutputLayer')
wf='''env:\n  REPORT2_EXPECTED_WORKER_SHA: "c016d0c468dc124a27d7383beae95743e7f917c7aefcfb3bf29f8f32a216a0ba"\nrun: |\n          cp runner/report2-d1-adapter.mjs runtime/report2-d1-adapter.mjs\n          cp runner/telegram-output.mjs runtime/telegram-output.mjs\n'''
w=m.patch_workflow_text(wf,'a'*64)
assert 'd1-preaction-budget-guard.mjs' in w and 'telegram-zero-reason.mjs' in w
assert '"'+'a'*64+'"' in w
print('PASS r9 cloud runner patcher reservation-first')
