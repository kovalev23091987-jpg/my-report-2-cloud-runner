# Время завершённого тела HTX 1m: готовое предложение

Это TEXT-предложение по одному существующему пути, без применения к runtime. Первый коммит протокола: 6a0afdf7. База d1405cfa; все исходные хеши и ожидаемые результаты применения содержатся в proposal-targets.json. Общие файлы, schema, маршруты и ограничения автор не менял. Node/import/syntax/semantic/SQL исполнения: 0.

## Конкретная потеря

futuresTrajectory запрашивает /linear-swap-ex/market/history/kline?contract_code=…&period=1min. В worker.js fetchJson получает headers и фиксирует received_ts ДО await response.text(). При завершении response.text прежний код сразу передаёт строку parseHtxMarketJson, который обновляет существующий captured snapshot с parse-observed clock. Отдельного complete-body clock и хеша того же текста в request receipt нет. Это мешает различать время headers, получение полного текста и позднюю осведомлённость о событии.

Существующий requestReceipts.minutes уже принимает stage и исходные часы; persistCapturedHtxSignedTape.finish.source_clocks переносит его в raw_acquisition_diagnostic. Но buildHtxFlowClosureDiagnostic не копирует успешный attempt в конечный source_diagnostic. Предложение сохраняет отдельные новые поля через этот существующий JSON-carrier. Нового канала/экспортера/таблицы не требуется.

## Ровно три цели

- worker.js: отдельный body_completed_ts после уже выполняемого response.text(), до parser; ссылка на ту же immutable JS-строку, без копии тела или изменения возвращаемого результата.
- htx-signed-tape.mjs: новый body_knowledge только внутри существующего minutes attempt. Existing byteHash вычисляет SHA256_UTF8_RESPONSE_TEXT при размере <=1048576 UTF-8 bytes. На code-unit/UTF-8 overflow digest/bytes NULL; parse всё равно получает прежний полный текст. Legacy/неупорядоченное время остаётся NULL. Ошибка хеша не превращает прежний успешный ответ в ошибку.
- source-closure-diagnostics.mjs: типизированный minute_body_knowledge в прежнем diagnostic. Future clock не переносит валидный digest. Старый failure spread исключает только новый body_knowledge; иначе добавление могло бы переполнить прежний frame до optional-guard. Если новое поле не помещается в прежние2048 bytes, оно опускается, а старый diagnostic сохраняется. Прежний oversized frame по-прежнему NULL.

Реальный дальнейший путь уже есть: buildHtxFuturesFlowPrimary.closure_diagnostic → existing source_checks[name].source_diagnostic в candidate-evidence-v2-runtime → existing block-decision-use-audit. Эти два модуля не меняются; их pins сохранены. Полный snapshot/canonical/full-evidence write, native readback и Telegram этим callable не проверяются.

## Один новый общий affected case

Entry: runBodyCompletionIngressConnected({runtime_root,baseline_runtime_root,repo_root}) из connected.mjs. Первые два аргумента — два ПОЛНЫХ assembled src-каталога с настоящими зависимостями, третий — полный корень репозитория. Coordinator применяет ровно предложенный patch к candidate, оставляет полное before-дерево для baseline; author не запускал apply. Перед импортами callable сверяет3 target pins и8 dependency pins в обеих сборках.

Неэкспортируемый реальный fetchJson извлекается по уникальным границам async function fetchJson и следующего createPerDeepCheckFetchCache. Тело функции не переписывается. Vm исполняет его с реальными parser/observer и контролируемым transport/clock. Нового production export для проверки нет. Это выполнение фактического producer-body, не whole Worker schedule, не futuresTrajectory HTTP acquisition.

Подготовлены7 новых групп assertions внутри ОДНОГО entry:

1. Задержанное полное тело: headers раньше body; до разрешения body promise нет completed clock/hash. Затем реальные parser/observer/persist finish (пустое incomplete acquisition, SQL не допускается), builder/retainer и JSON несут точные clock/hash/bytes; исходные source/header/parse clocks и возвращаемый fetch result сравниваются с baseline.
2. Body-read failure остаётся отказом с NULL body knowledge.
3. Invalid JSON сохраняет parse refusal, хотя полное тело уже известно.
4. Ровно1048576, сверхпредела и многобайтовая строка: хеш ограничен по UTF-8, прежний parser не ограничивается новым hash-cap.
5. Legacy/обратный/future clock не становятся положительным знанием.
6. Metadata route не получает нового minutes-поля.
7. Typed bounded projection не копирует произвольный payload; новая metadata исключается из старого failure spread; старый representable near2048 frame сохраняется при отказе добавления; старый oversized остаётся NULL.

Ни один из этих сценариев автором не исполнялся. Контролируемые факты не подменяют provider body или реальную стоимость. При общем запуске сохранение возвращённого component JSON перед дальнейшими assertions принадлежит координатору. Зависимости и примерные bounds не являются admission.

## Стоимость и предел

Дополнительных HTTP/SQL: по тексту изменений0. Старые квоты, request cache,8-contract map, TTL и2048 byte diagnostic cap не повышены. До1MiB текста на один уже выполняемый точный минутный запрос обрабатываются локальным hash; строка уже находилась в памяти из response.text. ByteHash получает её напрямую, отдельный Buffer тела не создаётся. В map остаётся только фиксированный metadata object, не тело. Новые сериализации ограничивают маленький существующий carrier, не создают новый private payload. Native CPU/heap/задержка хеша и глобальный остаток бюджета UNKNOWN: перед включением нужны фактические измерения, их отсутствия не маскирует нулевая дополнительная сеть.

Это latest in-process attempt по contract/type, а не immutable event card с exact run/snapshot. Перезапуск очищает эту память, последующий запрос заменяет attempt; такие ограничения существовали и сохраняются. Hash не восстанавливает исходное тело и не доказывает, что оно пригодно для anomaly analysis. SHA256_UTF8_RESPONSE_TEXT — строка после декодирования response.text(), не исходные wire bytes/content-encoding. Source payload.ts, header clock, parse-observed clock не переписываются. Body completion не переименован в first_known_ts события. Для15m/30m/1h/4h/1d/1w, spot и105 активов новое покрытие не заявляется.

Epoch, долговечная карточка/наблюдение/outbox, серверный domain ACK, точная first-known привязка события, общий admission и отправка нового Telegram остаются открыты. Основной отчёт и LIQ сохраняются. ENTRY-followup/TTL/anchors и физическая ёмкость отложены владельцем. Работа по источникам и late-cost projection другого worker не дублируется.
