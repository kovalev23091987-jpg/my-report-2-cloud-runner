# X: точный предлагаемый V3 API — до storage agreement

Статус: PROPOSED/NOT_INSTALLED/UNEXECUTED. `materialized-summary-v3.proposed.diff` только добавляет явные V3 exports к прежнему модулю. Production-файл и старый production-v2 state не изменены; Node/import/tests0. После согласования ROOT понадобятся новая own scope и одна связанная проверка через реальный OutcomeJournal consumer; существующие принятые проверки не повторяются.

## Факты по четырём структурам

1. `wave.record_digests` действительно растёт по числу записей. Его точный consumer — immutable same-ID fingerprint/replay guard в fold. В V3 он заменяется отдельной immutable receipt-строкой на запись, а не обрезается по возрасту.
2. `cohort.wave_keys` в текущем материализованном state отсутствует. Обычный summary вычисляет список, но `counters()` whitelist его не копирует, `replace()` хранит только descriptor/counters. Для одного contribution список содержит одну волну. Поэтому никакого нового cohort ledger/постраничного wave_keys writer не требуется: scalar cohort/global contributions остаются в той же atomic wave+aggregate транзакции. Легитимный набор когорт по правилам/профилям/режимам не объединяется и не переименовывается.
3. `aggregate.pending_deadlines` действительно растёт с числом pending waves. V3 использует ROOT maturity queue + один bounded durable pending intent в aggregate.
4. `aggregate.instrument_assets` действительно растёт с числом инструментов. V3 использует ROOT immutable point binding instrument→asset; конфликт не разрешается текущим latest.

Суммарное число отдельных receipts всё ещё растёт с историей. Ограничены размер отдельной строки и чтения страницы, а не заявлена доказанная физическая ёмкость. TTL/GC/physical capacity tests не входят в X. Старые карты/digests/history остаются целиком.

## Внешние point cells ROOT

Предлагаемые имена — на утверждение ROOT, только в новом namespace:

- `pump:materialized-record:production-v3:<record_id suffix hash>`: schema `pump-materialized-record-receipt-v3-20261025`, materialization_id, source_seq, record_id, fingerprint, wave_key. `prepareMaterializedRecordReceiptV3({materialization_id,prepared_event,source_seq})` строит точное тело из уже frozen prepared event. ROOT создаёт if-absent, сравнивает существующее целиком и делает FULL readback **до** fold. fingerprint — прежний stable full-record SHA, включая recorded_ts, а не только payload hash в summary_record_id. Same-ID другой fingerprint либо другой ordinal/wave/generation — конфликт. Наличие receipt само по себе НЕ APPLIED: только committed source_cursor доказывает пройденный ordinal.
- `pump:materialized-instrument:production-v3:<instrument hash>`: schema `pump-materialized-instrument-binding-v3-20261025`, materialization_id, instrument_id, asset_id. ROOT atomic create-if-absent/readback; mismatch fail, без last-writer-wins. Старый unqualified binding не становится новым evidence. Это сохранение прежнего instrument→asset consistency, не новая native identity qualification.
- ROOT current maturity reference по wave: schema `pump-materialized-maturity-reference-v3-20261025`, materialization_id, wave_key, wave_state_revision, active, deadline_ts, transition_id. ROOT хранит bounded ordered queue/index и точный current ref. Stale ordered entries сравниваются с current ref и реальной wave.state_revision. `active=false,deadline_ts=null` — завершение logical work reference, а не удаление исходных данных. Старые queue rows здесь не удаляются.

Namespace hashing/PK/ordered queue/protected refs/cost admission остаются у ROOT. До native IO нужны реальные расходы и envelope; этот proposal ничего не резервирует и не сбрасывает unknowns.

## Fold: прежняя atomic pair сохраняется

1. Новый aggregate: `createMaterializedSummaryV3({materialization_id,as_of_ts})`. Новый materialization_id и новые storage keys обязательны. Нельзя открыть old v2 как v3 или скопировать только старые totals без полного доказанного replay.
2. ROOT берёт следующий existing summary ordered item, проверяет исходный hash, production purpose и создаёт прежний `prepareOutcomeRecordEvent`. Затем durable record receipt и instrument binding с readback.
3. В реальном synchronous atomicPair(wave,aggregate), под прежним условием общего source_cursor, вызвать `foldPreparedOutcomeRecordV3({aggregate,wave,prepared_event,source_seq,record_receipt,instrument_binding,as_of_ts})`.
4. Для нового record нужен exact source_seq=source_cursor+1. Функция сама возвращает source_cursor=source_seq; не прибавлять второй раз. При source_seq<=cursor только exact receipt и существующая immutable wave разрешают no-write REPLAY_BEHIND_COMMITTED_CURSOR. Gap/other fingerprint/asset/origin fail. Excluded-purpose cursor advances ROOT должны также соблюдать pending-intent barrier.
5. Существующий witness/contribution/HIT/MISS/UNKNOWN/cohort/DD код вызывается без изменений через transient shadow maps:≤1record digest/≤1instrument/≤1deadline. Они не переносятся в durable V3. Global/cohort counters по-прежнему заменяются одной atomic pair с wave, поэтому нет отдельной многострочной cohort commit проблемы.
6. Та же atomic pair возвращает `aggregate.maturity_pending` — один exact durable intent с transition_id/kind/materialization_id/wave_key/state_revision/source_cursor/active/deadline. Пока он не закрыт, новые source folds и maturity transitions запрещены. Это bounded recovery запись, не растущий массив.

Root `source_cursor` уже проверяется им в атомарном consumer; proposal сохраняет эту проверку и добавляет собственную последовательность. Scalar expected revisions остаются в return. Существование source membership/receipt не разрешает пропустить ещё не применённый source_seq>cursor.

## Crash-safe maturity reference

После committed fold ROOT читает exact maturity_pending, idempotently устанавливает соответствующий current maturity reference и durable ordered queue entry, перечитывает exact reference. Затем atomic aggregate вызов `acknowledgeMaterializedMaturityV3({aggregate,maturity_reference,as_of_ts})` проверяет все поля включая transition_id и только после этого очищает bounded pending и увеличивает aggregate.revision.

Crash до queue write: pending остаётся, следующий заход сначала повторяет queue install. Crash после queue write до ack: exact reference допускает idempotent повтор/ack. Crash после ack: pending=null; повтор ack no-write. Нельзя продвинуть scan/currentness boundary мимо ещё не установленного committed intent; нельзя считать отсутствующую provisional queue запись окончательно пустой. SINGLE pending barrier применяется и к восстановлению/исключённым records. Нужны реальные queue+reference readbacks, не подставленный callerboolean.

`advanceWaveMaturityV3({aggregate,wave,as_of_ts,maturity_reference})` принимает только active ref точной wave_state_revision и исходного t0+4h. Прежний maturity algorithm меняет те же counters; возвращает новый pending intent для deactivation queue pointer и тот же ack protocol. Старый pointer с предыдущей wave revision не меняет counters.

## Read API и честное состояние сводки

`readMaterializedSummaryV3(aggregate,{as_of_ts,maturity_boundary})` сохраняет прежние counters/cohort descriptors, NULL probability/calibration/publication. Pending intent -> MATURITY_QUEUE_SYNC_REQUIRED. Если pending_waves>0, для CURRENT нужен actual ROOT complete maturity boundary, привязанный к materialization_id/aggregate_revision/exact as_of_ts, с due_count>=0 и source_ref. Без него MATURITY_BOUNDARY_REQUIRED и pending_clock_transitions=null. Due_count>0 -> MATURITY_UPDATES_REQUIRED. При pending_waves=0 отсутствие due computable из totals, внешнее сканирование не требуется.

ROOT boundary — результат фактического bounded queue reader/complete watermark, не намерение и не native admission. Если страница имеет has_more/непроверенные старые refs/неполную очередь, complete не выставляется. Не называть частичный lower-bound точным due_count. Старые physical-capacity и ENTRY deferrals этим не снимаются.

## Cutover и будущая проверка после согласования

Старые exports/library version/production-v2 namespaces остаются историческими reader+evidence. Новый V3 replay идёт страницами existing source index с новым cursor0; промежуточная сводка CATCHUP_REQUIRED, не сумма old+new. Не менять record clocks/P0/t0/rules/status/DD и не перебирать old full tests. Никаких новых HTTP для replay. Source original, V/W capsules, UNKNOWN, acceptance240 и внешние protected refs сохраняются.

Предлагаемый единый следующий connected check: реальный ROOT OutcomeJournal с V3 namespace, old/new scalar parity на одном новом искусственном corpus; same-ID conflict/replay, crash до/после queue install/ack, maturity due/stale ref, instrument conflict, несколько волн/когорт, partial boundary honesty и статическая независимость размера одной wave/aggregate от числа record receipts. Это только план, НЕ executed/PASS. После storage agreement ROOT подтвердит имена cells/queue boundary/cost+recovery wiring; тогда будет применён production patch и одна связанная qualification.
