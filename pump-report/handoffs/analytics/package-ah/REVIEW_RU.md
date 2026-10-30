# AH v2 — согласованные исправления proposal; НЕ ADMITTED

Только `proposal.patch` и этот review. Diff относится исключительно к `pump-report/runtime/worker.mjs` на main `824f894a44b98d6bee5b0fedab12c11084859949`, Git blob `9b374def0e96ab24f772f8854677ff8566d8cb78`. Fresh final authority main `46076fa37297b93a6eb7cfd007f9f80bf07580f2` после совместимого ROOT rollover; worker-байты по-прежнему совпали с базой824f894a. Базовый SHA256 `9b25c687b471d99d8e20547e97f2dcbf77dac1903584c3950673d30aad948438`; worker-файл v2 не создавался и не исполнялся, изменён только текст diff. **SHA256 proposal.patch: `43d4fb93b9a04756a99196a86c6c64ff1eeb18480438ddbb7b4f442299a942f2`**.143 строки diff. Предыдущая frozen v1: patch SHA667119d85e393d9faf9d1c5acbe53bd8b3bbc5a25c594b86760ad48a6eb731eb, review SHA51bdc5eb5286797c6d6f52c30c7226b0a331a6908a60e73b5171474e9f804979; она заменена по двум прямым уточнениям ROOT. Patch не применён; ROOT файлы/ANALYTICS/пороги не изменены. Imports/ядро/syntax/runtime checks/tests/HTTP/RPC/SQL/TG/deploy —0. AG consumer не запускался.

Worker использует обещанные ROOT exports `PRODUCTION_PLAN,productionPolicies,productionAdmission` из `runtime/production-policy.mjs`. ROOT сообщил о local production-policy module и3 новых connected PASS первого запуска; в main он ещё не опубликован. AH их не повторял. Публикация/интеграция exact module, настройки stage и фактический допуск остаются ROOT. При production передаётся `policy:{...NATIVE_POLICY,evidence_ref:PRODUCTION_PLAN.evidence_ref}`, затем `productionPolicies(PROVIDER_POLICIES)` и `productionAdmission(native.admission,PROVIDER_POLICY_VERSION,{mode})`. Старый qualification expiry применяется ко всем прежним stages; production использует строго **тот же native.admission.expires_ts**, выдаваемый reserveNativeRun на15мин. Новый постоянный срок, lease-as-admission или перенос старого grant не вводится.

| Граница | Что сохраняется/требуется |
|---|---|
| Provider caps ROOT module | BINGX900/day,27900/month,10/min,1/sec; TELEGRAM27/day,837/month. Глобальный900/day и164/run остаются общими, TG не добавляет обход общего cap. allowed_providers только BINGX/TG |
| Сохранённый расход | Те же `pump:resources` и shared native ledger, day/month/spent/unknown/outstanding/backoff, прежние qualification_totals иcaps. Старые контрольные/metadata/map/day/TG grants не сбрасываются и не переименовываются |
| Production purpose | Только настоящие AUTO/MANUAL отчёты и genuine ограниченный readonly LOOKUP, включая statistics-audit по существующему сохранённому plan_id/after/limit. Новый HTTP family для обхода расхода не создаётся; CORE/DISCOVERY/DELIVERY source meaning сохраняется. Production module должен отделять новый настоящий PRODUCTION purpose от закрытых qualification attempts |
| Позднейшие циклы | PROTECTED_HTTP (включая manual3), NATIVE_POLICY.manual_checks3, прежние floors/nextfull/outcomes/delivery; DISCOVERY_PLAN для native будущих SQL и productionAdmission.discovery/future_candidates для HTTP. ROOT подтверждает builder output и exact source costs перед активацией |
| Маршруты до SQL | Production whitelist: /pump/manual, /pump/run, /pump/manual-result, /pump/summary, /pump/statistics-audit. Для последнего прежние body.plan_id (ранее сохранённого плана), after/limit и bounds1..10 сохраняются; productionAdmission для LOOKUP имеет allowed_providers[], без HTTP/TG и без автоматического обучения моделей. Старый fixed SAVED_STATISTICS_AUDIT_SINGLE/grant_id остаётся SPENT/недоступным. Все source-probe,delivery-check,map-probe,day-probe,integration-check,metadata-probe,source-feasibility отклоняются400; grant_id/probe_id/diagnostic_id/kind также запрещены. Старые stages не открываются заново |
| Flags/owner gates | AUTO POST дополнительно требует PUMP_REPORT_ENABLED=1; scheduled gate/window прежние. TG flag, control-key, noBTC/noETH, готовность, conservative plan≥10, mandatory book/price/candles revalidate, сохранённый текст и receipt pipeline не обходятся. Ручная проверка не является торговлей |

Capture — **только** обычный POST /pump/manual: capture_requested=true лишь если body.capture_id входит в точный конечный PRODUCTION_PLAN.capture_ids и request_id===body.capture_id. В списке ровно3 различных ID: PRODUCTION_PLAN.capture_id, pump-first-production-manual-20261026-two, pump-first-production-manual-20261026-three. В native reservation run_id равен фактическому body.capture_id; services проверяет принадлежность тому же списку; envelope.capture_id=request_id. Wrong capture/route/request_id —400 до services/store.install/reserveNativeRun и SQL. Без capture_id запрос с любым из3 зарезервированных capture request_id тоже отклоняется только на /pump/manual; /pump/manual-result с тем же id остаётся доступным для честного readback. Каждый ID — отдельный однократный идемпотентный genuine native MANUAL, а не CONTROL/probe; повтор не перевыдаёт уже записанную reservation и не возвращает её расход. publish:false или честный NOT_READY расходует свою настоящую ручную попытку; следующие2 ID позволяют получить private capture следующего реального отчёта. Это до3 попыток внутри прежнего manual3, не новый резерв, не повышениеcaps и не переиспользование старых trial IDs.

Capture не создаёт отдельный probe и не принуждает READY/TG. После обычного runner берётся только ответ указанного manual request; queued/error/no analysis честно дают пустой analyses/status. Через analysis_key выполняется1 дополнительный PK read original, сверяются digest, exact analysis/input identity/run/time/purpose/pin/saved_ts. Если была карточка — ещё1 PK read card, сверка text_hash, same original analysis/card text и существующего сохранённого SENT receipt. При дедупликации на прежнюю карточку другой analysis статус **DIFFERENT_SAVED_ANALYSIS_CARD_NOT_CURRENT_SENT_PROOF**, а не новая отправка. Ошибка capture после возможной отправки не даёт права повторить send; сохранённый manual-result/card и действующий отдельный LOOKUP admission нужны ROOT для восстановления readback.

В `result.launch_capture`: schema PUMP_LAUNCH_READINESS_ACTUAL_V1, implementation pin, boolean publication_allowed как отражение запроса/flags/READY (не новый допуск), analyses:[{analysis_key,analysis,original}], отдельные actual_receipts и private raw_responses. Broker wrapper записывает только существующие request/response/error; не повторяет запросы, не меняет caches/clocks/normalization. URL без credentials и headers; query только symbol/interval/limit/startTime/endTime; env TOKEN/KEY/SECRET значения редактируются. При редактировании, более24 записей либо8MiB raw_capture.complete=false; отчёт продолжает прежний путь. Эти24 — предел записей памяти, **не новый HTTP grant**. Capture basis явно **BROKER_PARSED_JSON_NOT_WIRE_BYTES**: это parsed JSON broker response, не исходные wire bytes; AG source-body adapter/ROOT hashes должны честно учитывать это. При cache_hit сохраняются прежние received_ts/receipt_id. Telegram token/HTTP URL не записывается, его фактический receipt идёт отдельным card readback.

Actual input/цены/книга/карточка/raw/recipient/message_id остаются private control response/local artifact, не Git. Новые capture reads входят в тот же bounded native admission, расход и финализацию, но их2 PK read и размер ответа ROOT обязан включить в текущий фактический IO budget/artifact. Резервирование/квоты/успешная доставка/полный550/ADMITTED здесь не доказаны. До actualIO ROOT отдельно готовит current positive provider+whole-native admission, exact implementation artifact/pin, stage/flags и необходимые approvals. Предлагаемый код требует одной связанной ROOT qualification после интеграции; AH сам её не исполняет. Старый отчёт/автоматизации,9пауз,2OWNERdeferrals, originals/расходы/unknown/резервы/caps сохранены.

Свежая authority и собственный30min CAS/FULL до подготовки; guard-readback ниже не является native admission. После заморозки освобождается только собственная аренда; release находится в existing refs/heads/leases/report2-anomalies, checkpoints/OFFLINE_ANOMALY_WORKER_LEASE.json с SHA этого review. Actual release commit и FULL подтверждение — в итоговом сообщении, без третьего handoff файла.

```json
{
  "main": "46076fa37297b93a6eb7cfd007f9f80bf07580f2",
  "read_at": "2026-10-25 22:37:02 UTC",
  "all4_equal": true,
  "fence_active": false,
  "window_owner_paused": false,
  "technical_task": "ALL_ACTIVE105_SOURCE_EFFICIENCY_IN_PROGRESS",
  "generation": "MY_REPORT_2_CURRENT_20260929_CURRENT_CYCLE_V13_20M",
  "root_owner": "CODEX:ACTIVE105_SOURCE_RELIABILITY:1792967677593",
  "root_expires": 1792972477593,
  "own_owner": "CODEX:OFFLINE_ANOMALIES:1792967657000",
  "own_acquired_ts": 1792967657000,
  "own_expires_ts": 1792969457000,
  "own_CAS_commit": "d514d302a157005f2a7d886044e9cdc27962feb3",
  "FULL_file_bytes_and_cache_busted_ref": true,
  "own_scope_compatible_with_ROOT_rollover": true,
  "guard_git_blobs": {
    "AGENTS.md": "a073956a9ca68b30207670583252f6842197f5a0",
    "pump-report/AGENTS.md": "b40651e68f6e8e4827cf8664ed129a8222380dcc",
    "checkpoints/PUMP_REPORT_OWNER_RESUME_20261025.json": "5f3793840e45606e7905094dd3f33fddf311977b",
    "checkpoints/CLOUD_PHASE_STATE_20261004.json": "41888bc455c7191b6ade437f2c2aa1182082347b",
    "checkpoints/CURRENT_PROJECT_STATUS.json": "4f50ade8abbbce4a4d3025a5baec70bbc90b99fa",
    "checkpoints/OWNER_REVIEW_RESUME_POINT_20261010.json": "52f3de36396733772b3f64726267ee0f732cfcda",
    "checkpoints/FULL_OWNER_TASK_REGISTER_20261007.json": "d8f2c81be8b3d8da394038027973f8a4a102d28c",
    "checkpoints/ACTIVE_WORKING_WINDOW_20261012.json": "435414ceff9e91907c6d5da2ababe64638cd9561",
    "audit-fixes/source-optimization-20260930/execution-lock.json": "b7cfec4353c9cde30c1f836a5330d433203f9421",
    "REPORT2_CURRENT_GENERATION.json": "e935be4ed1f4caa177af3ebee0cf55e4fc71856c",
    "checkpoints/pump-report-20261025/COORDINATOR_PROGRESS.json": "25e4317803d071cb4918ca7bf7501aa58f4726f0",
    "checkpoints/pump-report-20261025/NATIVE_QUALIFICATION_ACTUAL.json": "d6969c796ee0010c7f0699e35e850dc1bd25bd25",
    "checkpoints/pump-report-20261025/PROVIDER_QUALIFICATION_ADMISSION.json": "b63f86627cf24d9fe8f145bb4ebb915c1453fd5d",
    "checkpoints/REPORT2_OWNER_PAUSED_RESUME_HANDOFF_20261024.json": "e6a167a88084b7c2f1bc1238d1f2b8d3ad1e6f91",
    "checkpoints/report2-owner-paused-20261024/pause-save-receipt.json": "7b270b68a39ca6052507c63fffad5da851f02a4d",
    "checkpoints/report2-owner-paused-20261024/resume-queues.json": "916d1594afd7b0f78a8bad9312e71deb37fc23a7",
    "checkpoints/pump-report-20261025/PUMP_REPORT_UNIFIED_WORKING_SPEC_RU.md": "c3b2e866c59f901959dd4fd57a790c3a5f001923"
  }
}
```
