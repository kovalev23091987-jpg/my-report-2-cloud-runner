# H — последовательные счётчики исходов

ТЗ v2 SHA256 `0674adf8bef087f63ddac8214b8e650ae14410f33970ed4f869c5ab2564975cc`; authority main `93faf0b17b3bd7018ef419d665a21819d2589056`. Код локальный, ROOT интегрирует. Runtime/shared/source/profile не менялись этим чатом.

## Результат

Добавлен `analytics/materialized-summary.mjs`: последовательное обновление вклада одной instrument+wave, глобальные и cohort counters, отдельный переход зрелости. Query получает только материализованный агрегат; прошлые исходные записи и map всех исторических волн не читаются. Все wave states хранятся отдельно, исходные raw/карточки/квитанции остаются у ROOT.

Для синхронного ROOT atomicPair есть двухэтапный API: async `prepareOutcomeRecordEvent` вычисляет SHA256 и фиксирует вход до транзакции; **синхронный** `foldPreparedOutcomeRecord` вызывается внутри пары wave+aggregate. Введённый ROOT MemoryStore.atomicPair прямо вызван в новых тестах. Дополнительная source sequence column не обязательна: при отсутствии явной revision новый уникальный event_revision назначается внутри CAS. Дубликат immutable record ID — no-op. Счётчики не ограничены 40 волнами.

**27 новых проверок PASS / 0 FAIL.** На 42 независимых искусственных волнах materialized counters/cohorts совпали с batch `summarizeOutcomes`. На точных сохранённых 18 строках/18 когортах Б отдельный run-control также проверил полное равенство поддержанных счётчиков и хеш исходного файла по сохранённому манифесту. Принятые A–G батареи не повторялись.

Проверены replay, UNKNOWN→HIT→UNKNOWN, поздний SENT и запрет downgrade SENT, два raw card той же волны, все mode/delivery/map/rules/profile/evidence когорты, гапы/enclosing no-hit, HIT/MISS conflict, сохранение outcome issues, неизменность origin/asset/record ID, строгий порядок, сериализация/restart, pending early HIT, bounded due pages и clock idempotence, adverse unknowns и detach входов. Отдельно проверено игнорирование DELIVERY_DIAGNOSTIC / технического SENT239. Он не получает статистического origin/исхода. ERROR/FAILED до HTTP не превращается этим модулем в UNKNOWN-сигнал.

## Зрелость и ограничения эквивалентности

`dueMaturityWaves` выдаёт порцию активных due-волн; `advanceWaveMaturity` заменяет pending contribution на mature в той же atomicPair. Source event_revision и state_revision разделены. Без обработки due `readMaterializedSummary` явно возвращает `MATURITY_UPDATES_REQUIRED`, а не выдаёт cached зрелые счётчики за текущие. Нового ночного цикла/сбора нет; ROOT обрабатывает due в разрешённом дневном окне под своим бюджетом.

Эквивалентны counters и cohort partition принятого immutable нормализованного потока с frozen origin. Нарушения immutable ID/origin/asset или порядка отвергаются без изменения производного состояния; ROOT должен остановить source cursor и обозначить RECONCILIATION_REQUIRED до исправления, а не назвать неполный поток обработанным. Полные trace/wave_keys/holdout/training/readiness не копируются в lookup; для них остаются оригиналы и отдельный F-аудит. Численные вероятности, success rate, calibration/publication acceptance не вычисляются.

Adverse — счётчики известности и сохранённые исходные скаляры, не прибыль или вероятность. Неполный путь не даёт точного полного drawdown, intrabar HIT не даёт точного pre-hit drawdown, null не становится нулём. Исходные наблюдения не переписываются ради компактного состояния.

Глобальный агрегат содержит counters по когортам, instrument→asset binding и pending deadlines только ещё не зрелых волн. Компактное состояние конкретной волны хранит несколько представителей и record_id→SHA256 для replay/conflict проверки. Это логическая приёмка derived state, не доказательство байтов/устойчивой ёмкости/стоимости native D1; обе OWNER deferrals сохраняются.

## Подключение и подготовленный E

**Точное подключение, миграция старого индекса и transaction/cursor требования:** ROOT_WIRING_RU.md. Нужны новый bundle module и ROOT consumer; этот чат runtime не подключал. Нативные pair/admission/SQLite проверки делает ROOT отдельно.

Оставшиеся E01–E08/E11 адаптированы к публичной summary и signal.origin; убрано устаревшее требование внутреннего map_status и очереди для разделения cohort. Смысл проверок сохранён/усилен. E09/E10 из G оставлены строгими. Финальный runtime-acceptance.test.mjs прошёл **только синтаксическую** `node --check`, не запускался: один assembled E должен выполнить ROOT после H wiring. До-H байты теста сохранены и сверены с G-манифестом.

Команды H:

```sh
node --test pump-report/tests/analytics/materialized-summary.test.mjs
node pump-report/handoffs/analytics/package-h/run-control.mjs
```

Точные хеши/зависимости/TAP — qualification.json. Native/provider/SQL/Telegram/deploy/cron = 0. Искусственные данные не являются proof рабочего сигнала, доставки или калибровки. После закрытия H назначен пакет I с явно принятым владельцем native-relative volume форматом; он не меняет результаты H.
