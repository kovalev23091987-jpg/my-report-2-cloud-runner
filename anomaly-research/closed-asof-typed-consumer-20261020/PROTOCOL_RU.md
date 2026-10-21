# Закрытость сохранённого HTX бара на исходный as-of

Протокол фиксируется отдельным первым коммитом до патча и сценария. База c3d5a80e1d7db8804b06f687d90b1495b72079cc. Own lease a5ae3ddc3a9e52847736cd0f30d0c5d2b7048b80 / CODEX:OFFLINE_ANOMALIES:1792529304677, до1792532904677. Пункт общего плана: HISTORY_TYPED_CONSUMERS. Автор не исполняет Node/import/syntax/semantic/SQL/tests/apply.

Единственная canonical research цель: anomaly-research/saved-candle-typed-input-20261019/typed-input.mjs, buildResearchInput. Существующий потребитель передаёт его candle/prior в чистую features. Production не импортирует этот модуль. Изменения готовятся только в новом ownprefix как TEXT proposal; текущая цель, старые qualification artifacts, frozen585 и historical corrected-copy не меняются автором.

Конкретный дефект: HTX selected20prior+target связываются с original body id/OHLC/turnover и4h duration. Но end_ts не сравнивается с input_value.ts/original_source_ts. Проверка конца по позднему LOCAL known_by_ts не доказывает, что бар был закрыт в исходном ответе. Исходный source clock может также быть NULL при generic policy, поэтому для HTX нужны safe integer исходные ts и closed end<=исходный as-of. Запоздалое чтение не закрывает старое partial тело. Это новый статический контрпример существующего consumer, не повтор квалификации трёх real inputs, 37/3274/13096 исследования или prospective качества.

Второй конкретный предел того же пути: положительные OHLC лексемы проходят number(), но нет high>=max(open,close)/low<=min(open,close)/low<=high. Тогда features может получить отрицательные тени/диапазон. Проверка геометрии applies to target и20prior обоих уже существующих source kinds; native-unit policy не меняется.

Предлагаемая минимальная семантика:

- В HTX branch после прежней exact-body/channel/source binding, до переноса в features, требовать stamp(input_value.ts), stamp(end_ts) и end_ts<=input_value.ts для каждого21 выбранного бара. Старое4h duration и exact-native source row binding сохраняются. Ровно end==as-of допустимо. NULL исходный as-of не подменяется current local time.
- При построении каждого toBar после прежнего positive number() проверять только OHLC inequalities. Source/body clocks, number lexemes, USDT quote-turnover/both-sides/no-half, observed0, 20prior continuity, frozen policy hashes и все identity/epoch/card/watch/ACK блокировки сохраняются. Новый timeframe alignment или недоказанная единица не вводятся.
- annotateLaterArchivedBar и observer.features не менять; неполное later path не объявлять actual outcome. Новый I/O, schema, storage/reader/dispatch/native admission не появляется.

Один новый callable runClosedAsofTypedConsumerConnected({repo_root,baseline_repo_root}). Полные независимые repo trees; до импорта exact baseline/after module pins, policy bytes и unchanged features-module hash. Реальный current buildResearchInput и features; CONTROLLED21barHTXJSON с native channel/indices, новые verifyReadJson local markers. Исходная policy только читается по прежнему pinned SHA; старые rawgzip/BTC realcard/37cohort/study artifacts не загружаются и не вычисляются.

Группы одного affected case: valid source-asof edge сохраняет exact baseline view/features при одном controlled clock; target ещё открыт на originalasof (старый принимает, новый отказывает); выбранный prior тоже не может быть source-future; NULL sourceasof отказывает; положительные malformed OHLC target и prior отказывают; genuinely0 volume сохраняется. Новые controlled JSON bytes/markers не выдаются за реальные provider bodies и не записываются по заявленным rawrefs. Семантических результатов до общей проверки координатора нет.

Пределы: изменение закрывает typed research validation, не native instrument epoch/body knowledge, server/domain commit ACK, prospective precision/recall, memory/watch/outbox или отдельное уведомление. Никаких main/score/weights/forms/limits/pauses/LIQ изменений, provider/native SQL/MAIN/TG/deploy. ENTRY-followup и physical capacity остаются отложены. После передачи координатор решает применение и один новый общий affected run, автор старые suites не повторяет.
