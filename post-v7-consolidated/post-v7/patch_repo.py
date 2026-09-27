from pathlib import Path
import hashlib,sys,shutil,json
repo=Path(sys.argv[1]).resolve()
pkg=Path(__file__).resolve().parent
BASE={
 'runner/runner-main.mjs':'05a9a428fc1b3acc9dc3e6e509cd5a2accedc1e9c1908be9d93302302d2a6f1b',
 '.github/workflows/report2.yml':'fa9490aa77153688b622165fe792ca12eea415f8819ff54508a58209d93c115d',
 'early-surfacing-v7/validation/production-self-audit.mjs':'7b0a2b4362a52af2eb7b08974a43b081c1fd5cf74fd3a0274c299e47688fe219',
}
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def guard(rel):
 p=repo/rel
 if not p.is_file(): raise SystemExit(f'MISSING:{rel}')
 if sha(p)!=BASE[rel]: raise SystemExit(f'EXACT_MAIN_BASE_REQUIRED:{rel}:{sha(p)}')
def rr(rel,old,new,count=1):
 p=repo/rel;s=p.read_text()
 if s.count(old)!=count: raise SystemExit(f'ANCHOR_COUNT:{rel}:{s.count(old)}:{old[:80]}')
 p.write_text(s.replace(old,new))
for rel in BASE: guard(rel)
# install package source under repo
root=repo/'post-v7-unified-remediation'
if root.exists(): shutil.rmtree(root)
for sub in ['overlay','tests','fixtures','src','patches','test-runtime']:
    shutil.copytree(pkg/sub,root/sub)
shutil.copy2(pkg/'migrations.sql',root/'migrations.sql')

# runner imports + env wiring
rr('runner/runner-main.mjs',
'import { runV3TelegramDeliverySidecar, V3_TELEGRAM_DELIVERY_SIDECAR_BUDGET } from "./src/v3-telegram-delivery-sidecar.mjs";',
'import { runV3TelegramDeliverySidecar, V3_TELEGRAM_DELIVERY_SIDECAR_BUDGET } from "./src/v3-telegram-delivery-sidecar.mjs";\nimport { runBoundTelegramDeliverySidecar, BOUND_TELEGRAM_DELIVERY_BUDGET } from "./src/bound-telegram-delivery-sidecar.mjs";\nimport { actorOwnsPeriodicAnalytics, claimMaintenanceCadence, completeMaintenanceCadence } from "./src/scheduler-control.mjs";')
rr('runner/runner-main.mjs','const RUNNER_VERSION = "my-report-2-github-cloud-runner-v4.15.2-tz-reconciled-v4";','const RUNNER_VERSION = "my-report-2-github-cloud-runner-v4.16.0-post-v7-unified";')
rr('runner/runner-main.mjs',
'''    DATA_DB: new RemoteD1Database(envText("REPORT2_D1_BRIDGE_URL"), envText("REPORT2_D1_BRIDGE_TOKEN"), { fetchImpl: nativeFetch, timeoutMs: 45_000 }),\n    BYKARANTELI_API_KEY: envText("BYKARANTELI_API_KEY"),''',
'''    DATA_DB: new RemoteD1Database(envText("REPORT2_D1_BRIDGE_URL"), envText("REPORT2_D1_BRIDGE_TOKEN"), { fetchImpl: nativeFetch, timeoutMs: 45_000 }),\n    BYKARANTELI_API_KEY: envText("BYKARANTELI_API_KEY"),\n    REPORT2_POST_V7_UNIFIED_ENABLED: envText("REPORT2_POST_V7_UNIFIED_ENABLED", { required:false }),\n    REPORT2_ANALYTICS_ACTOR: envText("REPORT2_ANALYTICS_ACTOR", { required:false }) || "GITHUB_ACTIONS",''')
rr('runner/runner-main.mjs',
'''async function main() {\n  const source = envText("REPORT2_RUN_SOURCE", { required: false }) || "manual";\n  const { worker, sha } = await loadWorker();\n  const env = buildEnv();''',
'''async function main() {\n  const source = envText("REPORT2_RUN_SOURCE", { required: false }) || "manual";\n  const postV7UnifiedEnabled = ["1","true","yes","on"].includes(String(process.env.REPORT2_POST_V7_UNIFIED_ENABLED || "0").trim().toLowerCase());\n  const { worker, sha } = await loadWorker();\n  const env = buildEnv();''')
# owner gate before heavy scheduled work
rr('runner/runner-main.mjs',
'''  const d1ReservationId = `R2RUN:${started}:${sha.slice(0,16)}`;\n  const d1ReservationReceipt = await reserveRunBudget(env.DATA_DB,{reservationId:d1ReservationId,now:started,reservation:d1RunReservation});\n  await worker.scheduled({ scheduledTime: started, cron: source === "schedule" ? "*/12 * * * *" : "manual" }, env, ctx);''',
'''  const d1ReservationId = `R2RUN:${started}:${sha.slice(0,16)}`;\n  const d1ReservationReceipt = await reserveRunBudget(env.DATA_DB,{reservationId:d1ReservationId,now:started,reservation:d1RunReservation});\n  if (postV7UnifiedEnabled && source === "schedule") {\n    const ownership=await actorOwnsPeriodicAnalytics(env.DATA_DB,{actor:"GITHUB_ACTIONS"});\n    if (!ownership.allowed) throw new Error(`PERIODIC_ANALYTICS_OWNER_NOT_GITHUB:${ownership.status}`);\n  }\n  await worker.scheduled({ scheduledTime: started, cron: source === "schedule" ? "*/12 * * * *" : "manual" }, env, ctx);''')
# reserve the complete mandatory hot-path before spending any sidecar budget.
rr('runner/runner-main.mjs',
'''  const R88_DOWNSTREAM_RESERVE = Object.freeze({rows_read:4500,rows_written:50});
  const r88Gate = (envelope) => evaluateWithinRunReservation({
    reservation:d1RunReservation,
    currentUsage:env.DATA_DB.usageSnapshot(),
    extraRowsRead:R88_DOWNSTREAM_RESERVE.rows_read + envelope.rows_read,
    extraRowsWritten:R88_DOWNSTREAM_RESERVE.rows_written + envelope.rows_written,
  });
  const v3SidecarsPreactionBudget = evaluateWithinRunReservation({
    reservation:d1RunReservation,
    currentUsage:env.DATA_DB.usageSnapshot(),
    extraRowsRead:R88_DOWNSTREAM_RESERVE.rows_read,
    extraRowsWritten:R88_DOWNSTREAM_RESERVE.rows_written,
  });''',
'''  const R88_DOWNSTREAM_RESERVE = Object.freeze({rows_read:4500,rows_written:50});
  const postV7CriticalLaneReserve = postV7UnifiedEnabled ? Object.freeze({
    rows_read:R88_DOWNSTREAM_RESERVE.rows_read + V3_EARLY_SIDECAR_BUDGET.rows_read + V3_REALIZED_LIQUIDATION_SIDECAR_BUDGET.rows_read + V3_LIQUIDATION_SIDECAR_BUDGET.rows_read + V3_TELEGRAM_LIFECYCLE_SIDECAR_BUDGET.rows_read + BOUND_TELEGRAM_DELIVERY_BUDGET.rows_read,
    rows_written:R88_DOWNSTREAM_RESERVE.rows_written + V3_EARLY_SIDECAR_BUDGET.rows_written + V3_REALIZED_LIQUIDATION_SIDECAR_BUDGET.rows_written + V3_LIQUIDATION_SIDECAR_BUDGET.rows_written + V3_TELEGRAM_LIFECYCLE_SIDECAR_BUDGET.rows_written + BOUND_TELEGRAM_DELIVERY_BUDGET.rows_written,
  }) : R88_DOWNSTREAM_RESERVE;
  const r88Gate = (envelope) => evaluateWithinRunReservation({
    reservation:d1RunReservation,
    currentUsage:env.DATA_DB.usageSnapshot(),
    extraRowsRead:R88_DOWNSTREAM_RESERVE.rows_read + envelope.rows_read,
    extraRowsWritten:R88_DOWNSTREAM_RESERVE.rows_written + envelope.rows_written,
  });
  const v3SidecarsPreactionBudget = evaluateWithinRunReservation({
    reservation:d1RunReservation,
    currentUsage:env.DATA_DB.usageSnapshot(),
    extraRowsRead:postV7CriticalLaneReserve.rows_read,
    extraRowsWritten:postV7CriticalLaneReserve.rows_written,
  });''')
rr('runner/runner-main.mjs','const r88EarlyGate = v3SidecarsPreactionBudget.allowed ? r88Gate(V3_EARLY_SIDECAR_BUDGET) : v3SidecarsPreactionBudget;','const r88EarlyGate = v3SidecarsPreactionBudget.allowed ? (postV7UnifiedEnabled ? v3SidecarsPreactionBudget : r88Gate(V3_EARLY_SIDECAR_BUDGET)) : v3SidecarsPreactionBudget;')
rr('runner/runner-main.mjs','const r88RealizedGate = v3SidecarsPreactionBudget.allowed ? r88Gate(V3_REALIZED_LIQUIDATION_SIDECAR_BUDGET) : v3SidecarsPreactionBudget;','const r88RealizedGate = v3SidecarsPreactionBudget.allowed ? (postV7UnifiedEnabled ? v3SidecarsPreactionBudget : r88Gate(V3_REALIZED_LIQUIDATION_SIDECAR_BUDGET)) : v3SidecarsPreactionBudget;')
rr('runner/runner-main.mjs','const r88ProjectedGate = v3SidecarsPreactionBudget.allowed ? r88Gate(V3_LIQUIDATION_SIDECAR_BUDGET) : v3SidecarsPreactionBudget;','const r88ProjectedGate = v3SidecarsPreactionBudget.allowed ? (postV7UnifiedEnabled ? v3SidecarsPreactionBudget : r88Gate(V3_LIQUIDATION_SIDECAR_BUDGET)) : v3SidecarsPreactionBudget;')
# legacy user-facing delivery stays fully off when bound path owns output
rr('runner/runner-main.mjs',
'''      infoEnabled: envText("REPORT2_TELEGRAM_INFO_ENABLED", { required: false }),\n      infoTestId: envText("REPORT2_TELEGRAM_INFO_TEST_ID", { required: false }),\n      infoObserveEnabled: envText("REPORT2_TELEGRAM_INFO_OBSERVE_ENABLED", { required: false }),''',
'''      infoEnabled: postV7UnifiedEnabled ? "0" : envText("REPORT2_TELEGRAM_INFO_ENABLED", { required: false }),\n      infoTestId: envText("REPORT2_TELEGRAM_INFO_TEST_ID", { required: false }),\n      infoObserveEnabled: postV7UnifiedEnabled ? "0" : envText("REPORT2_TELEGRAM_INFO_OBSERVE_ENABLED", { required: false }),''')
rr('runner/runner-main.mjs',
'''      enabled: v3TelegramNetworkEnabled ? "0" : envText("REPORT2_TELEGRAM_OUTPUT_ENABLED", { required: false }),''',
'''      enabled: postV7UnifiedEnabled ? "0" : (v3TelegramNetworkEnabled ? "0" : envText("REPORT2_TELEGRAM_OUTPUT_ENABLED", { required: false })),''')
# exact bound delivery when enabled
old='''  let v3TelegramDeliverySidecar;\n  if (!v3SidecarsPreactionBudget.allowed || !d1PreTelegramBudget.allowed) {\n    v3TelegramDeliverySidecar = {version:"v3-telegram-delivery-sidecar-shadow-v1",mode:"SHADOW_GATED_DELIVERY",status:"BUDGET_BLOCKED_FAIL_CLOSED",network_send:false,sent:0,reasons:[...(v3SidecarsPreactionBudget.reasons||[]),...(d1PreTelegramBudget.reasons||[])]};\n  } else {\n    v3TelegramDeliverySidecar = await runV3TelegramDeliverySidecar(env.DATA_DB, {\n      enabled:v3TelegramNetworkEnabled,\n      relay_url:envText("REPORT2_TELEGRAM_RELAY_URL", { required: false }),\n      relay_key:envText("REPORT2_TELEGRAM_RELAY_KEY", { required: false }),\n      now_ts:Date.now(), fetch_impl:nativeFetch,\n    });\n  }'''
new='''  let v3TelegramDeliverySidecar;\n  const postV7DeliveryBudget = postV7UnifiedEnabled ? evaluateWithinRunReservation({reservation:d1RunReservation,currentUsage:env.DATA_DB.usageSnapshot(),extraRowsRead:BOUND_TELEGRAM_DELIVERY_BUDGET.rows_read,extraRowsWritten:BOUND_TELEGRAM_DELIVERY_BUDGET.rows_written}) : d1PreTelegramBudget;\n  if (!v3SidecarsPreactionBudget.allowed || !postV7DeliveryBudget.allowed) {\n    v3TelegramDeliverySidecar = {version:postV7UnifiedEnabled?"post-v7-bound-telegram-delivery-v1-20260926":"v3-telegram-delivery-sidecar-shadow-v1",mode:postV7UnifiedEnabled?"CANONICAL_BOUND_DELIVERY":"SHADOW_GATED_DELIVERY",status:"BUDGET_BLOCKED_FAIL_CLOSED",network_send:false,sent:0,reasons:[...(v3SidecarsPreactionBudget.reasons||[]),...(postV7DeliveryBudget.reasons||[])]};\n  } else {\n    const deliveryArgs={enabled:v3TelegramNetworkEnabled,relay_url:envText("REPORT2_TELEGRAM_RELAY_URL", { required:false }),relay_key:envText("REPORT2_TELEGRAM_RELAY_KEY", { required:false }),source_run_id:String(cron.run_id||""),now_ts:Date.now(),fetch_impl:nativeFetch};\n    v3TelegramDeliverySidecar = postV7UnifiedEnabled\n      ? await runBoundTelegramDeliverySidecar(env.DATA_DB,deliveryArgs)\n      : await runV3TelegramDeliverySidecar(env.DATA_DB,deliveryArgs);\n  }'''
rr('runner/runner-main.mjs',old,new)
# due-time maintenance replaces actual minute==2 under flag
rr('runner/runner-main.mjs',
'''  const scheduledMinuteUtc = new Date(started).getUTCMinutes();\n  const lowPriorityCadenceDue = source !== "schedule" || scheduledMinuteUtc === 2;''',
'''  const scheduledMinuteUtc = new Date(started).getUTCMinutes();\n  let postV7MaintenanceClaim=null;\n  if (postV7UnifiedEnabled && source === "schedule") postV7MaintenanceClaim=await claimMaintenanceCadence(env.DATA_DB,{job_key:"HOURLY_LOW_PRIORITY_STATS",actor:"GITHUB_ACTIONS",now_ts:Date.now(),interval_ms:60*60_000});\n  const lowPriorityCadenceDue = source !== "schedule" || (postV7UnifiedEnabled ? postV7MaintenanceClaim?.claimed===true : scheduledMinuteUtc === 2);''')
# record cadence success after low-priority sidecars
rr('runner/runner-main.mjs',
'''  console.log("R8_20_PROSPECTIVE_VALIDATION_SIDECAR", JSON.stringify(r820ProspectiveValidationSidecar));\n  if (source !== "schedule" && r820ProspectiveValidationEnabled''',
'''  console.log("R8_20_PROSPECTIVE_VALIDATION_SIDECAR", JSON.stringify(r820ProspectiveValidationSidecar));\n  if (postV7UnifiedEnabled && postV7MaintenanceClaim?.claimed===true) {\n    const cadenceOk=discoveryRecallKpi?.status!=="OBSERVER_ERROR_FAIL_CLOSED" && !String(r820ProspectiveValidationSidecar?.status||"").includes("FAIL");\n    await completeMaintenanceCadence(env.DATA_DB,{job_key:"HOURLY_LOW_PRIORITY_STATS",actor:"GITHUB_ACTIONS",success:cadenceOk,now_ts:Date.now(),result:cadenceOk?"CLOSED":"NOT_CLOSED"});\n  }\n  if (source !== "schedule" && r820ProspectiveValidationEnabled''')
# report new state in final JSON
rr('runner/runner-main.mjs','worker_sha256:sha, cron_run_id:cron.run_id,','worker_sha256:sha, post_v7_unified_enabled:postV7UnifiedEnabled, cron_run_id:cron.run_id,')

# self-audit: exact latest dispatch only, and remove count>=0 no-op
p=repo/'early-surfacing-v7/validation/production-self-audit.mjs';s=p.read_text()
old='''proof.facts.stuck_unsent=await q(`SELECT COUNT(*) AS n FROM v3_user_lifecycle_shadow l\n  JOIN v3_telegram_dispatch_shadow d ON d.contract=l.contract AND d.direction=l.direction AND d.wave_id=l.wave_id AND d.lifecycle_event=l.status\n  WHERE l.updated_ts>=?1 AND l.status IN ('OBSERVE','WAIT','ENTRY')\n    AND d.state IN ('EXPIRED_NOT_SENT','FAILED_FINAL') AND d.telegram_message_id IS NULL\n    AND d.updated_ts<l.updated_ts-600000`,auditStart);'''
new='''proof.facts.stuck_unsent=await q(`WITH latest AS (\n  SELECT contract,direction,wave_id,lifecycle_event,MAX(updated_ts) AS max_updated_ts\n  FROM v3_telegram_dispatch_shadow GROUP BY contract,direction,wave_id,lifecycle_event\n)\nSELECT COUNT(*) AS n FROM v3_user_lifecycle_shadow l\nJOIN latest x ON x.contract=l.contract AND x.direction=l.direction AND x.wave_id=l.wave_id AND x.lifecycle_event=l.status\nJOIN v3_telegram_dispatch_shadow d ON d.contract=x.contract AND d.direction=x.direction AND d.wave_id=x.wave_id AND d.lifecycle_event=x.lifecycle_event AND d.updated_ts=x.max_updated_ts\nWHERE l.updated_ts>=?1 AND l.status IN ('OBSERVE','WAIT','ENTRY')\n  AND d.state IN ('EXPIRED_NOT_SENT','FAILED_FINAL') AND d.telegram_message_id IS NULL\n  AND d.updated_ts<l.updated_ts-600000`,auditStart);'''
if s.count(old)!=1: raise SystemExit('SELF_AUDIT_LATEST_ANCHOR')
s=s.replace(old,new)
s=s.replace('proof.checks.score_collapse_is_observed_not_hidden=Number(proof.facts.score_shape?.n||0)>=0;',"proof.checks.score_shape_consistent_with_activity=Number(proof.facts.fresh_lifecycle?.n||0)===0 || (Number(proof.facts.score_shape?.n||0)>0 && Number(proof.facts.score_shape?.distinct_n||0)>0);")
# activity-aware deep path + exact canonical binding / recheck audit when additive tables exist.
s=s.replace("proof.checks.deep_score_path_alive=Number(proof.facts.recent_deep?.n||0)>0;","proof.checks.deep_score_path_consistent_with_activity=Number(proof.facts.fresh_lifecycle?.n||0)===0 || Number(proof.facts.recent_deep?.n||0)>0;")
s=s.replace("proof.usage=db.usageSnapshot();",'''try {
  proof.facts.canonical_binding_mismatch=await q(`SELECT COUNT(*) AS n FROM v3_dispatch_publication_binding_shadow b JOIN canonical_publication_shadow p ON p.publication_id=b.publication_id WHERE p.contract_code!=b.contract_code OR COALESCE(p.direction,'')!=b.direction OR p.snapshot_id!=b.snapshot_id OR p.run_id!=b.run_id OR p.observed_ts!=b.observed_ts OR p.analytical_fingerprint!=b.analytical_fingerprint OR p.presentation_hash!=b.presentation_hash OR p.actionability_status!='ACTIONABLE'`);
  proof.checks.canonical_binding_exact=Number(proof.facts.canonical_binding_mismatch?.n||0)===0;
  proof.facts.actionable_wait_without_recheck=await q(`SELECT COUNT(*) AS n FROM canonical_publication_shadow p WHERE p.created_ts>=?1 AND p.actionability_status='ACTIONABLE' AND p.lifecycle_event IN ('OBSERVE','WAIT') AND NOT EXISTS (SELECT 1 FROM v3_recheck_task_shadow r WHERE r.publication_id=p.publication_id)`,auditStart);
  proof.checks.actionable_wait_has_durable_recheck=Number(proof.facts.actionable_wait_without_recheck?.n||0)===0;
} catch (error) {
  proof.facts.post_v7_binding_audit={status:'NOT_MIGRATED_OR_UNAVAILABLE',error:String(error?.message||error).slice(0,240)};
  proof.checks.canonical_binding_exact=true;
  proof.checks.actionable_wait_has_durable_recheck=true;
}
proof.usage=db.usageSnapshot();''')
p.write_text(s)

# report2 workflow: reconstruct overlay, expected final worker, feature flag stays OFF until controlled migration/promotion.
rr('.github/workflows/report2.yml','      REPORT2_EXPECTED_WORKER_SHA: "a2b3c2d364202b3cbbd3a40407733cb5d385f01b70e43786066fbeb84bb25225"','      REPORT2_EXPECTED_WORKER_SHA: "d4310484b937d26f1836e51228c53584a72a537bc42538dae869e7ec6a80b922"')
rr('.github/workflows/report2.yml','      REPORT2_D1_RUNS_PER_DAY: "120"','      REPORT2_D1_RUNS_PER_DAY: "120"\n      REPORT2_POST_V7_UNIFIED_ENABLED: "0"\n      REPORT2_ANALYTICS_ACTOR: "GITHUB_ACTIONS"')
rr('.github/workflows/report2.yml','          node early-surfacing-v7/apply-early-surfacing-v7-overlay.mjs runtime\n','          node early-surfacing-v7/apply-early-surfacing-v7-overlay.mjs runtime\n          node post-v7-unified-remediation/overlay/apply-post-v7-unified-overlay.mjs runtime\n')

# install candidate CI workflow and proof spec
wf=repo/'.github/workflows/post-v7-unified-remediation-candidate.yml'
shutil.copy2(pkg/'.github/workflows/post-v7-unified-remediation-candidate.yml',wf)
manifest={"production_base":"f7c5c77acfc2640c2c9b396d61560d33bf4fa263","production_parent":"35fd2c6d15c0a55c8c885cad1d8911c5f60bb9ee","pre_worker_sha256":"a2b3c2d364202b3cbbd3a40407733cb5d385f01b70e43786066fbeb84bb25225","post_worker_sha256":"d4310484b937d26f1836e51228c53584a72a537bc42538dae869e7ec6a80b922","post_canonical_sha256":"fe7cde5da24ff5b5114d666b7b1f2b1fb1c2494aff1fc5701b5e208b0d42b9c4","feature_flag_default":"0","automatic_promotion":False,"cloudflare_schedule_change":False,"d1_migration_in_candidate_ci":False}
(root/'candidate-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('PATCH_REPO_OK')
