# H: минимальный ROOT wiring

Путь модуля: `analytics/materialized-summary.mjs`. Shared/runtime не изменялись ANALYTICS. API совместим с текущим синхронным callback `store.atomicPair([waveKey,aggregateKey], change)`; SHA256 подготавливается **до** callback, никакого await внутри change не требуется.

```js
import {
  createMaterializedSummary, prepareOutcomeRecordEvent,
  foldPreparedOutcomeRecord, advanceWaveMaturity,
  dueMaturityWaves, readMaterializedSummary
} from '../analytics/materialized-summary.mjs';

// В runtime/outcome-journal.record ПОСЛЕ сохранения immutable summary record:
// record — фактически прочитанная сохранённая строка {record_id, recorded_ts,
// origin, publication, outcome}; origin — выбранный frozen anchor D, НЕ draft.
// revision можно не передавать: следующий номер новой уникальной записи
// назначится внутри atomicPair, после проверки immutable record_id.
const prepared_event = await prepareOutcomeRecordEvent({
  kind: 'OUTCOME_RECORD', event_id: record.record_id,
  record
});
const waveKey = 'pump:materialized-wave:' +
  JSON.stringify([record.origin.instrument_id, record.origin.wave_id]);
const aggregateKey = 'pump:materialized-summary:v1';

await store.atomicPair([waveKey, aggregateKey], ([wave, aggregate]) => {
  const now = clock();
  aggregate ??= createMaterializedSummary({
    materialization_id: 'ROOT_CHOSEN_STABLE_MATERIALIZATION_ID',
    as_of_ts: now
  });
  const folded = foldPreparedOutcomeRecord({
    aggregate, wave, prepared_event, as_of_ts: now
  });
  return {
    states: [folded.wave, folded.aggregate],
    result: {status: folded.status, maturity_due_ts: folded.maturity_due_ts}
  };
});
```

Подготовленный envelope — transient frozen object данного экземпляра модуля. Его не записывать в БД и не присылать снаружи вместо исходной строки. После рестарта подготовить заново из сохранённого immutable record. Это не допуск к provider/SQL/native и не аутентификация первичных фактов. `foldOutcomeRecord` — async convenience wrapper для offline вызовов; внутри синхронного atomicPair использовать именно `prepareOutcomeRecordEvent` + `foldPreparedOutcomeRecord`.

`expected.aggregate_revision` и `expected.wave_state_revision` возвращаются для аудита логического состояния. Текущий atomicPair ROOT дополнительно атомарно проверяет обе физические SQL revisions. Чтение и запись двух отдельных set/atomic вместо pair недопустимы: потерянный ACK между ними дал бы рассинхронизацию. В текущем фактическом MemoryStore.atomicPair сделан прямой H-тест успешного обновления и повторного события. Нативная D1/SQLite/размерная приёмка остаётся ROOT, этот пакет её не выполнял.

## Источник событий и порядок

- Применять только eligible, нормализованные записи из outcome-journal с неизменным origin: instrument+wave, t0/P0, mode/map, версия правил/профиля/класс происхождения. Первая возможная UNKNOWN или подтверждённая SENT и terminal UNSENT уже выбраны D. Не подавать каждый сырой анализ, новую карту или draft как новый origin.
- `event_id=record_id`, строка immutable. Монотонный event_revision начинается с 1 для каждой волны; новые уникальные записи идут без пропусков. Отдельный source sequence column не обязателен: без event.revision helper назначает следующий номер внутри пары. Если ROOT уже имеет source revision, можно передать его явно, и пропуск будет отвергнут. Recorded clock новой строки не раньше предыдущей; при переносе старых записей сначала упорядочить их по recorded_ts/record_id. Повтор той же строки — no-op, даже после более поздних событий. Повтор ID с иными байтами, иной origin/asset, пропуск явной revision или откат часов — ошибка сверки, а не новая победа.
- После ошибки не продвигать исходный cursor и не выдавать старый агрегат за полностью обработанную новую историю. Сохранить исходный record/ошибку, вернуть `SUMMARY_RECONCILIATION_REQUIRED` либо явный watermark последнего полностью обработанного потока. API не маскирует нарушения immutable журнала синтетическими данными.
- Для source event и clock transition разные номера: event_revision учитывает только новые journal records; state_revision меняется также при созревании. Не использовать state_revision+1 как номер очередного исходного события.
- Технический `DELIVERY_DIAGNOSTIC` / actual SENT239 без source_input_key не получает origin/wave/outcome и не попадает в этот поток. Helper явно игнорирует такой kind. `ERROR`/`FAILED` до HTTP — не статистический UNKNOWN; сначала ROOT/D выбирают исходную eligible карточку. Сам по себе провал draft не создаёт сигнал.

## Зрелость без полного чтения истории

Агрегат содержит pending_deadlines только ещё не созревших волн. Он не содержит map всех исторических wave states или исходные наблюдения. Каждая компактная wave хранится отдельной строкой. Удаления исходных cards/analyses/observations/receipts этим кодом нет.

В разрешённом дневном цикле ROOT:

```js
const aggregate = await store.get(aggregateKey);
const due = dueMaturityWaves(aggregate, {as_of_ts: clock(), limit: 5});
for (const item of due) {
  const waveKey = 'pump:materialized-wave:' + item.wave_key;
  await store.atomicPair([waveKey, aggregateKey], ([wave, aggregate]) => {
    const tick = advanceWaveMaturity({aggregate, wave, as_of_ts: clock()});
    return {states: [tick.wave, tick.aggregate], result: tick.status};
  });
}
// Только агрегат и компактные состояния due-волн; без summary-record-index scan.
const result = readMaterializedSummary(await store.get(aggregateKey), {
  as_of_ts: clock()
});
```

Page limit ограничивает один проход, **не число учитываемых волн**. При нехватке budget продолжить следующей порцией в дневном окне. Ночью автоматический сбор/статистический цикл не включать. До завершения due-переходов read возвращает `MATURITY_UPDATES_REQUIRED`, maturity_current=false и число переходов; cached mature/pending counters нельзя назвать точными на новое as_of. После переходов — CURRENT и точные счётчики на запрос. Ранний HIT всё это время находится в pending_known_hits и не попадает в зрелый знаменатель. Повтор clock tick — no-op.

## Перенос существующего индекса и запрос сводки

1. Однократно, bounded страницами и под фактическим SQL budget ROOT, прочитать существующие immutable summary records. Упорядочить внутри каждой волны по recorded_ts/record_id; применить все исходные записи с event_revision 1…N в новый materialization_id. Raw/index не удалять. Не перезапускать рыночную историю ради этого переноса.
2. Пока backfill cursor не догнал устойчивую границу источника и due-переходы не завершены, внешний маршрут обозначает MIGRATING/PARTIAL; неполный счётчик не называет полной сводкой. Новые записи после границы должны идти тем же упорядоченным надёжным outbox/cursor-путём, без потери события при restart/ACK unknown.
3. После сверки внешняя summary-ручка читает агрегат, а не все immutable records. Записей/волн может быть больше 40: в H проверены 42 независимые волны; лимита глобального числа волн в модуле нет.
4. Агрегат содержит counters по когортам, instrument→asset binding и только активные pending deadlines. Это компактная производная статистика, не вся история. ROOT сам учитывает фактические bytes/rows/CAS retries и разрешает нативный envelope; логический тест 42 волн не является capacity/throughput proof и не снимает OWNER storage deferral.

## Что эквивалентно batch summary

Для принятого immutable нормализованного потока с замороженным origin: independent/mature/pending, HIT/MISS/UNKNOWN, зрелые знаменатели, early HIT, гапы/неизвестное покрытие/enclosing no-hit, публикации и cohort key по mode/delivery/map/rules/profile/evidence, outcome conflicts и reason_counts. На каждом control-проходе эти поля сравниваются с `summarizeOutcomes` по всей контрольной истории. Replays source event не являются новыми snapshot-победами. Поздний SENT переносит **один** вклад из UNKNOWN в SENT, вычитая прежние counters перед добавлением новых.

Не материализуются audit-trace поля batch-функции (полный список wave_keys, input_records/invalid_record_details каждого исходного наблюдения), а также списки temporal holdout/training и readiness/calibration. Они остаются в сохранённых оригиналах и отдельном bounded F/ресурсно допущенном аудите. Не следует ради малого lookup заново читать всю историю. success_rate/probability/publication_allowed остаются null/false.

Компактное состояние одной волны хранит несколько представительных нормализованных записей (latest HIT/MISS/valid/last/SENT и по одному представителю каждого обнаруженного outcome issue), а не полный массив наблюдений. Для точного replay/conflict контроля сохраняются только record_id→SHA256. Это метаданные одной волны, не глобальная история. Предыдущие raw-свидетельства ROOT сохраняет независимо. Per-wave witness selection повторяет правило batch «подтверждённый HIT не стирается поздним UNKNOWN»; HIT/MISS conflict остаётся UNKNOWN.

Добавлены отдельные целочисленные adverse counters и последние выбранные исходные adverse scalars: известное/неизвестное снижение, известное снижение до HIT и факт HIT после отмены. Пробел не становится нулём, неполный/пограничный путь не даёт точного полного drawdown, intrabar HIT не даёт точного pre-hit drawdown. Прибыль/исполнение пользователя не оцениваются.
