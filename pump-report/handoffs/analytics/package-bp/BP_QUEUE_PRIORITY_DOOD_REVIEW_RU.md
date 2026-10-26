# BP — доаналитический отбор AUTO, DOOD и один counterexample

Подтверждён конкретный риск порядка: текущая формула допускает, чтобы day-only очередник с300минут ожидания получил базовое место раньше нового short-preview+12%. Это предусмотренный формулой, нежелательный порядок в заданной fixture, а не ошибка исполнения selector. Причина фактического отсутствия AUTO за день пока не доказана: historical/current AUTOqueue не прочитана.

Сначала существенный факт дня: ROOT_DOOD_SENT241_SAME_ORIGINAL_ACTUAL.json SHAee6c0e4ca932fa50c98a5aa5b2397b71c48c7e15dd8c71c2356a14bb1853d3ae подтверждает production MANUAL DOOD,12:55:57.222МСК, ready=true,automatic_eligible=true,SENT241, exact-originalAF5af5e03781bf42ec58d9404c845b5995c97ab82c5226e7c60774b2539892f5824. Следовательно, подходящая по аналитическому допуску идея в этот день была. Это не доказывает, что её AUTOqueue entry уже существовала и была допущена исполнителем до ручного запроса. DOOD/KIMCHI engine/replay не повторялись; прочитан только сохранённый факт/времена.

Точная логика live70

candidate-priority.mjs:5–13:
score=waiting_minutes+20×movement_freshness+20×entry_proximity+20×confirmed_data_fraction.
waiting_minutes идёт от last_checked_ts, иначе first_seen; сверху не ограничен. Остальные факторы вместе≤60. Возраст first_seen сам по себе недостаточен для вывода300: если last_checked свежий, ожидание уже сброшено. Значение short/day growth в score напрямую не входит.

runner:47–79: updateDiscovery по истории обзора за последнийчас считает preliminary_growth как максимальное изменение от любого пригодного прежнего price snapshot, а не доказанный закрытыми свечами5m/60m impulse. Prequeue допускает day≈16% либо short≈8% (0.8×существующие20/10). Day-only и short-preview конкурируют в одном AUTOсписке; sort — score descending, затем first_seen ascending. Source evidence/identity дополнительно проверяются при выборе; в counterexample они равны.

movement_event_ts в discovery:67 может впервые браться из price.event_ts при near=true. Это время наблюдения цены, а не подтверждение объёмного импульса. analysisQueueEvidence:15–29 после анализа использует именно wave.impulse.end_ts или null; его priority_is_not_signal_eligibility=true. В counterexample discovery назначил новому такую price freshness, а реальный analysisQueueEvidence после явно искусственного NOT_READY stub очистил movement_event_ts. Передавать price timestamp как native impulse evidence нельзя.

Один логический connected case, две честно сохранённые Node-попытки

Использованы точные неизменённые25dependency modules из immutable70 artifactb8f0315b2abf7e818705b52d0f7a26146992af79f82a670ffe5f7022c9b2aab5 / pin08ab5e3f4b58cbbce2d5278ca956810fcf1f4f25cda23b033444f087846893a7. Реальный private selectAutomatic вызван через реальный runner.execute; реальные candidatePriority/analysisQueueEvidence/MemoryStore/unifiedBudget. Source/catalog/Core и два NOT_READY analysis stubs искусственные; настоящего analytical engine нет.

| Исходная строка | Day / short light preview | Ожидание | Freshness / proximity / quality | Score | Реальный выбранный слот |
|---|---|---:|---|---:|---|
|OLD, day-only|+30% /0%|300мин|0/0/0|300|первый, BASE|
|NEW, новый short preview|+5% /12.00000000000001%|0мин|1/0/0|20|второй, CONDITIONAL_EXTRA|

В fixture есть1текущее неиспользованное базовое место при base1/hour, прошлые4места потрачены; native/whole headroom искусственно достаточен ровно для одного extra в run. Реальный budget выдал OLDbase, NEWextra; grantNEW закрытCLOSED, unusedhold12 сохранён. Проверены2кандидата в одном invocation. Freshness/identity/source допускаются одинаково; newprice112 после100ровно5минут назад — только light preview, не готовый сигнал.

Стоимость OLD задана как ARTIFICIAL10s, не измерена у провайдера. В этой модели NEW был выбран через10000ms после появления, в том жеrun; дополнительного часа ожидания этот case не доказал. После проверки OLD last_checked сбросился; к моменту выбораNEW scoreOLD=6.6666666667, scoreNEW=20.1527777778. Новый кандидат занял условный extra вместо гарантированного текущего base. Если extra не допущен и нет другого carry/extra раньше, ближайшее earned base в17:00МСК дало бы30мин от synthetic16:30; это неисполненная условная арифметика. Live extra может появиться в другом5m run только при фактическом headroom/admission. Два rows при двух доступных местах не доказывают пропуск, но показывают расход базового места на старый day-only.

Попытка1 завершила реальный selector, order/base-extra иscore300/20 asserts, затем строгий harness assert12 против12.00000000000001 упал. Первый fail/input frozen cf1d94859df73730ec438d9fb9c897b32e7cac6e5606e1eea86f16519ce44701 сохранён побайтно, полногоPASSему не приписано. ROOT явно разрешил исправление этого жеcase. Попытка2 сравнила точный текущий формат (112/100−1)×100 без изменения порогов; explicitdiff сохранён. ИтогPASS_COUNTEREXAMPLE_ORDERING_RISK_NOT_ACTUAL_DAY_CAUSE, Node2/логическийcase1. Старые tests не запускались. Гипотеза100×масштаба не подтверждается сохранёнными F550 оригиналами по отдельному чтению ROOT; BP их не переигрывал.

DOOD: ещё один путь, который требует actual evidence

Текущий live70 rememberAnalysis:81–99 сохраняет wave для MANUAL, но:
- active-instruments пополняется при mode=AUTO либо если инструмент уже был в active set (:89);
- если MANUAL и queue entry отсутствует, :94 оставляет queue без новой строки;
- если строка уже есть, MANUAL обновляет last_checked, next_check=clock+5min, active_wave и evidence (:95–96).

Поэтому manual.ready/automatic_eligible не равны доказанному попаданию в AUTOqueue. Для уже существующей строки ручная wave могла продолжить AUTO-наблюдение; для отсутствующей — один manual сам её не создаёт. Это проверенный static-путь ТЕКУЩЕГО70; соответствие AF5-коду12:55 и наличие/отсутствие тогдашней записи не устанавливались. Нельзя ретроспективно приписывать12:55текущий hourly-bank без проверки времени его установки. После SENT241 отдельная повторная AUTO-доставка также требует обычной проверки дедупликации; прежнюю отправку нельзя объявлять отсутствующей.

Минимальное предложение ROOT без изменения стратегии

Предлагается перед неизменённым score ввести только класс срочности:
tier1 = existing active_wave ИЛИ fresh light short preview;
tier0 = остальные eligible rows.
Fresh short preview: текущая пригодная price/price_expires, заново рассчитанный preliminary_growth≥существующего short_pct10; это всё ещё только очередь, не квалификация impulse. Внутри tier сохраняются текущие four factors/age и tie-break. ManualWork/reserve остаются раньше AUTO, обязательные growth/volume/liquidity/plan/expiry/доставка неизменны. На двух rows это поставило быNEWпередOLD. Movement clock не повышается до impulse proof; для аудита можно явно сохранить происхождение preview и timestamps пары price snapshots.

Это review proposal, не патч: поведение fairness при непрерывном потоке новых short-preview требует оценки ROOT. Нет нового waiting cap, нового ростового порога или принудительного сигнала. Вопрос automatic handoff manual-wave — отдельный ROOT путь после actual-подтверждения, не слепая вставка/повтор ужеSENT241.

Минимальная фактическая проверка, не выполненная BP

Сначала переиспользовать сохранённые per-run/flags/release snapshots вокруг12:55и следующих AUTOциклов: runtime pin, время установки hourly-bank, был лиAUTOвключён, selected/checked/deferred иsource-evidence reasonDOOD. Для причинного вывода нужен исторический queue snapshot/лог на тотмомент: DOODmembership, first_seen,last_checked,next_check, active_wave, day/shortpreview, price/movement clocks, confirmed data и реальные конкуренты. Текущий snapshot не восстанавливает прошлое.

Только если ROOT отдельно получит новый точный native допуск: одна bounded диагностическая операция возвращает DOODqueue row, максимум5eligible priority leaders с достаточными полями, существующуюDOODwave/active-membership и связанные hourly/extra obligations/admission reasons. Actual R/W/query стоимость заранее не считать равной числу PK; rawprivate. Это proposal, no14 сейчас. Если historic snapshot отсутствует, итог причины12:55 останется UNPROVEN; current top5 может подтвердить текущий риск, а не факт прошлого пропуска.

Итоговые категории: implementation runtime bug — не доказан; нежелательный разрешённый порядок — искусственно воспроизведён; реальная подходящая MANUALидеяDOOD/SENT241 — подтверждена сохранённым фактом; historical AUTOqueue/почемуDOODнебылвыбрандоMANUAL — не прочитано/не доказано.

Node2/одинcase/actualengine0/marketHTTP0/nativeSQL0/TG0/deploy0/oldtests0/codefix0. Source/ROOT code, strategy/пороги не менялись. Первые BPfail и BO/BN/BM/BL frozen сохранены; native13spent, no14/CONTROL7/METADATA3; бюджеты/unknowns/резервы/9пауз/2OWNERdeferrals прежние.
