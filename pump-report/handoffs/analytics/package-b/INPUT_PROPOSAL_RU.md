# Предлагаемый вход сводки, без изменения общего контракта

Пакет А зафиксирован независимо: handoffs/analytics/qualification.json SHA256 a923236367b3ab4c8f1a8a591a34fdc98602ce986ad0e2159774169e4881a5b2, 44 PASS. Его файлы и analytics/index.mjs не изменяются пакетом Б.

Новый отдельный API: `import {summarizeOutcomes} from './analytics/summary.mjs'`. Чистая синхронная функция `summarizeOutcomes(records, {as_of_ts, sample_requirements?})`. Обязательное as_of_ts передаёт ROOT; часов/IO внутри нет. Это предложение собственного адаптерного входа PUMP_OUTCOME_SUMMARY_RECORD_V1, а не самостоятельно изменённая общая схема.

ROOT нормализует сохранённые original signal + analysis + publication + evaluateOutcome в запись:

```js
{
  record_id, recorded_ts, // неизменяемая запись и время доступности её сведений
  origin: {
    instrument_id, asset_id, wave_id, signal_id,
    t0, reference_price, rules_version, profile_version,
    mode: 'AUTO' | 'MANUAL',
    map_mode: 'NO_MAP' | 'PARTIAL_MAP' | 'MAP',
    evidence_class: 'OBSERVED' | 'ARTIFICIAL' | 'NON_NATIVE' | 'BACKFILLED' | 'UNCLASSIFIED',
    ready: true // готовая исходная идея; false не входит в прогнозную выборку
  },
  publication: {
    state: 'SENT' | 'UNSENT' | 'UNKNOWN',
    message_id: null, receipt_ref: null // для SENT оба должны быть известны
  },
  outcome: null | originalEvaluateOutcomeResult
}
```

origin — исходный неизменяемый снимок волны, не текущее обновление карточки. PARTIAL_MAP получается из исходного analysis.liquidations.status=PARTIAL при наличии пригодных зон; NO_MAP — при их отсутствии. Для проверки результата evaluateOutcome использует WITH_MAP для MAP/PARTIAL_MAP и WITHOUT_MAP для NO_MAP. При смене карты после публикации исходную группу не менять. rules_version/profile_version также исходные.

UNSENT означает доказанную неотправку; неопределённая отправка не превращается в UNSENT. receipt_ref должен ссылаться на сохранённое ROOT подтверждение, ранее проверенное по карточке/получателю/тексту. Сводка проверяет форму и согласованность, не подтверждает Telegram или рыночное происхождение заново. evidence_class тоже поступает из проверенной цепочки ROOT; одного ярлыка OBSERVED недостаточно для доказательства native-происхождения.

Волна учитывается один раз по instrument_id+wave_id. Повторы записей и последующие UNKNOWN не стирают известный HIT. Несовместимый исходный снимок или конфликт HIT/MISS цензурирует волну как UNKNOWN. Состояние доставки может дозреть до подтверждённого SENT, не создавая вторую волну. Записи из будущего относительно as_of_ts не используются.

Все статусы исходов видны отдельно. Для знаменателя зрелой оценки нужны завершённые4h; ранний HIT до конца периода показывается как известный HIT, но не смешивается с уже зрелыми случаями. UNKNOWN не победа/проигрыш. Пробелы, ожидающие, ошибки и неопределённая доставка имеют отдельные счётчики.

Предлагаемые sample_requirements берутся из ТЗ: 300 разрешённых зрелых волн,20 активов,14 дней с эпизодами,100 последних волн для последующей проверки. Эти числа — инженерный предварительный минимум; sample_floor_met не означает валидированную вероятность. Б не реализует калибровку, поэтому probability.value_pct и success_rate_pct всегда null, даже при достаточном количестве. Контролируемые/исторические/неидентифицированные примеры не смешиваются с OBSERVED.

Результат содержит machine-readable cohorts, явные denominators, mature/pending/HIT/MISS/UNKNOWN, gap/conflict/invalid/replay counts, readiness и status_text_ru. Хранение, SQL, расписания, публикация статистики и Telegram остаются ROOT.
