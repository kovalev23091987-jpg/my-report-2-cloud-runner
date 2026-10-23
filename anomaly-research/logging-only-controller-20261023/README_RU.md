# Отдельный logging-only путь для текущего86

Пакет предлагает изолировать настройку логов от активации Worker. Основная функция уже существует: configureCorrelatedBridgeLogs. В её прежнем пути потерянный PATCH ACK мог превратиться в успех по readback, а некоторые ошибки запускали второй восстановительный PATCH. Новый logging-only путь допускает одну попытку PATCH, сохраняет intent до неё и при неизвестном ответе делает не более одного заранее предусмотренного чтения, затем останавливается. Прежний UNKNOWN активации не меняется.

Это TEXT-предложение общих файлов. Автор не применял shared/runtime/workflow, не запускал Node/import/syntax/tests/SQL/CF/provider/MAIN/Telegram или Actions. Разрешения владельца на logging PATCH сейчас нет. Сам H остаётся будущим значением, производственный descriptor SOURCE и actual logging run/head/known receipt — NULL. Успешная квалификация кода не разрешает PATCH.

## Применение связанного пакета

Сначала ROOT применяет frozen SOURCEe32c9297/19: точный перенос existing correlatedLogsIntent в runner/htx-coordinated-rollout.mjs и reexport инструмента, строгие три tuple и оба data-only consumer. Источник6332B/f8352ce5 сохранён без изменений в SOURCE-producer-consumer-contract.original.json. Исходный CLI79701B/0c9cc488 также сохранён точно.

Затем rollout.proposed.patch применяется ОТ SOURCE CLI-stage79701 к combined target. rollout.from-main.proposed.patch — альтернативная полная сверка от main80504/493ac851; нельзя применять оба. Полная версия rollout.proposed.mjs.txt и target-bindings.json задают exactafter. Нет конкурирующей копии политики: producer и consumer используют одну перенесённую функцию. Default ABI существующего configure сохранён: logging_only=null идёт в старую ветку; отдельный context всегда выбирает новый строгий controller.

workflow.proposed.patch добавляет только false-by-default execute_correlated_logging_only в СУЩЕСТВУЮЩИЙ inspection workflow. Все старые операции и их artifact steps выключаются при этом флаге, mixed modes отвергаются до входа. Новый шаг вызывает тот же инструмент с единственным logging-only selector. CLI без явного режима теперь OFF; logging-only не вызывает rollout/activateExisting/activation.initialize. Сам workflow автор не менял и не dispatch-ил.

## Граница входа и nativeоперации

Новый runCurrent86LoggingOnly привязан к actual baseline22958B/6858cf03, run39961572286/head2a81, source86/c327/ac9/settings05120/runtimecf3/emptycron и тому же наблюдавшемуся deployment. Это факт текущего кода, не владение прежним deployment и не ACK неизвестного POST. Перед PATCH идут новые точные metadata GET текущего job и fresh ROOT all4/head/owner/fence/expiry перед КАЖДЫМ реальным CF запросом. Исходные настройки берутся из настоящего GET/settings с версией, уже прочитанного в этом job; getter не выдаёт их за новый запрос/новое время. Лишнего GET/script-settings нет.

Требуются НОВЫЙ квалифицированный common/automatic main, exact публичные source pins и текущий workflow_dispatch run_attempt1. Native path читает только fixedprefix qualification-scope/qualification-receipt/owner-approval. Approval rawhash и fixed operation_id должны быть в новой реальной ROOT lease вместе с DIRECT_HUMAN_APPROVAL/ONE_LOG_SETTINGS_PATCH_ONLY. Прошлая9GET approval не подходит. owner-approval.required-contract.json — лишь описание будущего входа, не такая approval.

Внутри существующего configure новый mode вызывает purpose controller. Он вычисляет desired через настоящий correlatedLogsIntent. Sampling1, persisttrue, destinations onlycloudflare, invocation_logsfalse; внешних destinations нет, остальные observability поля сохраняются существующей политикой. H вычисляется из ACTUAL before effective settings плюс desired; expectedH не является входным аргументом. Полные settings/binding values не экспортируются: в intent только исходная observability, presence flag, её digest, baseline05120/nonobs digest, desired, prospectiveH и exact PATCH wirehash. SOURCE реконструирует05120 из актуального after/current effective settings, исходного presence/value и сверяет ту же политику. Nonobs digest — ТОЧНО legacy rolloutDigest(rest), без альтернативной нормализации.

Перед возможным PATCH сохранены controllerintent и native transportintent с opid/requesthash; локальный файл прочитан обратно byteexact. Нет гарантии global fsync/cross-job durable once: ROOT обязан отправить workflow один раз, потребить approval и не повторять неизвестную операцию. Operation_id фиксирован в approval/lease, не генерируется заново после сбоя.

## ACK и остановка

Известный PATCH ACK связывается с opid, exact wirehash, HTTP2xx/CFsuccess и hashes полного тела/result. До следующего CF известный ответ сохраняется; ошибка сохранения удерживает его в RAM с persistence-failure и останавливает дальнейшие CF. Затем exact settingsH/desired/nonobs проверяются по readback, а deployment/version/ETag/runtime/bindings/crons — по текущим ответам. Несовпадение прекращает операцию без второго PATCH/restore/rollback.

Неизвестный PATCH ACK даёт controller UNKNOWN_PATCH_ACK_STOP и native STOP, known_patch_ACKfalse/logging_qualifiedfalse. Разрешено не более одного уже предусмотренного GET/settings, даже если он покажет H. После него нет postdeployment/дополнительной inspection/повтора/усыновления. Отказ самого чтения или сохранения также завершает STOP. Уже совпавшая конфигурация даёт0PATCH и отдельный readonly/no-write результат; это не новое разрешение H.

Canonical known-success outer — CURRENT86_LOGGING_KNOWN_ACK_AND_EXACT_READBACK, known_patch_ACK/logging_qualified/intent_before_IO=true, mutation_attempts1 и actualrun/head. Это не activation ACK: known_activation_ACK/activation_ownership_verified/old_unknown_recovered/day_hold_removed/current_Telegram_restored остаютсяfalse. Возможность будущих логов, retention, полнота correlation costs и восстановление отчёта не квалифицируются настройкой. Partial/unknown/controller-only proof не подходит для H. SOURCE production descriptor sha/run/head остаётсяNULL, пока ROOT не закрепит точный independently accepted actualknown artifact.

## Расходы и будущая проверка

Native success:11CF (10GET+1PATCH),17GH (freshstart1+4currentqualification/executionmetadata+perCF11+finalfresh1)=28 actualcontrol; cleanup10→38 в control40, manual24→62 в whole164. UNKNOWN branch максимум8CF/13GH, затемSTOP. Noop6CF/12GH. Пределы262144B ответа/131072B proof,2s headers+body timeout и currentrun5min/30s tail. Это план, не измеренный shared/day остаток; неизвестные расходы/резервы не обнуляются. При отсутствии retainedrawbasis или headroom нет незаложенных blob reads/retries. Source/provider/D1/SQL/MAIN/TG0, отдельный логовый PATCH требует будущего разрешения.

ONE callable logging-only-cases.proposed.mjs: runLoggingOnlyControllerCases({repo_root}),7новых groups/18вариантов, UNEXECUTED. Он проверяет exactcombinedtarget/workflow/publicclosure до import, использует настоящий public controller/policy и только CONTROLLED callbacks. Покрывает CLIoff/mixed isolation, savedintent/computedH, knownACK/readback, unknownACK+oneobservation/noadoption, conflicts/no restore, intent/knownreply persistence failures, precondition denials иnoop. Core всегда native_provenance_qualified=false. Native entry/Cloudflare/currentauthority/globalonce этими моделями не квалифицируются. Error.partial_result сохраняет уже завершённые новые groups; старые625/624/9GET/peer не вызываются.

ROOT сохраняет результат одного нового общего запуска отдельно, не меняя frozenоригиналы. Если SOURCE или currentcode уже отличаются, сначала exact stage/case bindings к одному конечному кандидату, затем FIRST. После этого нужна конкретная отдельная approval владельца для готовой ограниченной nativeоперации. Этот пакет её не выдаёт.
