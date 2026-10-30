# BZ2 — точный review для немедленного изменения ROOT

Подтверждённый дефект critical path: пригодный AIN original уже сохранён, но перед delivery gate последовательно выполняются retained capsule+protected refs, latest/wave/active/candidate state и журнал/индекс. Они съели оставшийся срок стакана; gate вернул STALE до создания карточки. Не менять TTL, T0, критерии готовности или source upper bound.

AIN original pin `08ab5e3f4b58cbbce2d5278ca956810fcf1f4f25cda23b033444f087846893a7`; это исторический AUTO26октября, не новый72-сигнал. Historical artifact содержит70модулей. Из10 просмотренных9модулей полностью равны installed72; целый runner отличается поздней диагностикой selector. Его критические функции rememberAnalysis/checkInstrument/recordPublished отдельно сверены byte-for-byte и равны. Freeze — `BZ2_CRITICAL_MODULE_BINDING_V1.json`.

## Сохранённые часы, 26 октября МСК

- Финальный READY/eligible, potential minimum11.490592574901148%:19:42:08.284.
- Immutable original.saved_ts:19:42:08.535, через251ms.
- Минимальный mandatory expiry — orderbook:19:42:15.197; после READY оставалось6913ms, после saved_ts6662ms. Price expiry19:42:22.000, candles expiry19:42:30.000.
- Candidate queue.last_checked_ts=19:42:14.037, priority_evidence_ts в той же row равен original.analysis_ts. До этой записи ушло5753ms от READY /5502ms от saved_ts; до book expiry осталось1160ms. Это время внутри атомарной записи, не подтверждённый ACK.
- Delivery trace STALE/MANDATORY_FACT_EXPIRED_BEFORE_PUBLICATION, card=null. Gate clock не записан: он не раньше19:42:15.197 и не позже grant.closed_ts=19:42:18.751. То есть задержка READY→gate6913–10467ms, saved_ts→gate6662–10216ms. Пооперационных timings features/journal нет; нельзя приписать им точные отдельные миллисекунды.

Delivery queue не достигнута; candidate queue — другой этап. Оригинал/trace из `Q-AIN27-analysis-result.json` SHA256 `3f9317ec7bbffc2461e05237d3b1b0da0c616bdcadd30ab703045929c88f7b85`; queue clock сверяется с `known-auto27-one-result.json` SHA256 `a580da8043606ae81ef62bbc5f27883bd02a03bbd7f6ad9e6822790d9fadec0e` по AIN и priority_evidence_ts.

## Минимальная правильная перестановка

1. Разделить rememberAnalysis: `saveOriginal(analysis,input)` сохраняет тот же content-hash key и immutable input/analysis/pin/evidence_class/saved_ts. Это обязательная операция до enqueue. Не менять analysis_ts/reference_price/card_text при последующем bookkeeping.
2. Сразу после original save — прежние publication eligibility/window/expiry проверки, затем прежние delivery.enqueue/dispatch: saved card text/readback, duplicate suppression, fresh price/book revalidate, expiry/window непосредственно перед send, bound ACK. Не расширять card.expires_ts относительно исходного min mandatory expiry и не переименовывать refreshed facts в исходные. Если короткого окна всё равно не хватает, честный STALE сохраняется.
3. После попытки dispatch, включая STALE/ERROR, выполнять feature capsules, latest/wave/active/candidate state и journal на том же original, затем recordPublished(card_id). Нынешний observations.remember нельзя просто перенести без исправления snapshot clock, описанного ниже. Не терять публикацию/SENT из возвращаемого checked result, если последующее bookkeeping отказало; это отдельная ошибка учёта, не повод отправлять второй раз.

## ДОПОЛНЕНИЕ ДЛЯ ROOT: обязательная temporal-связь anchor

В `analytics/anchors.mjs:35` publication отвергается, если `event.event_ts < row.recorded_ts` (PUBLICATION_NOT_BOUND_TO_SAVED_READY). Сейчас outcome-journal.remember берёт row.recorded_ts из clock(). После переноса за SENT ACK он будет позже события отправки. Простая перестановка поэтому создаст quarantine, даже сохранив T0. Это подтверждено кодом, без нового engine.

Рекомендуемый вариант с исходным original-save-only critical path: saveOriginal должен вернуть/передать также действительный saved_ts сохранённой immutable строки (при existing row — её прежний saved_ts). Journal snapshot row получает recorded_ts именно из этого доказанного original.saved_ts; отдельное поле journal_recorded_ts фиксирует фактическое clock() записи журнала. И normal index, и repair используют один и тот же source_input_key/original. Проверить original.saved_ts>=analysis_ts, original.saved_ts<=card.created_ts<=send_started_ts/receipt при publication, origin и content hash неизменны. T0 остаётся analysis_ts. Это явное разделение двух настоящих часов, не присвоение прошлой даты фактическому append и не clock override. Нельзя подставлять T0, min(clock,ACK) или произвольный caller timestamp.

Для normal path timestamp можно получить из результата того же immutable CAS без нового PK read; repair уже читает original. Существующие journal rows не переписывать новым временем. При повторном remember сохранять прежний row и его snapshot timestamp, отдельный append clock не использовать в identity immutable snapshot. Legacy происхождение recorded_ts описать явно, не менять anchors проверку на разрешение будущего snapshot.

Альтернатива без изменения семантики row.recorded_ts: до enqueue сохранить только минимальную journal snapshot row (одна CAS, без feature capsules/work-index migration/add), а ensureReady/add/index выполнить после dispatch. Тогда recorded_ts действительно предшествует ACK; pending delivery pointer обеспечивает repair после crash. Это добавляет минимальную CAS в короткий TTL, поэтому при original-save-only варианте предпочтительно явное разделение original.saved_ts и journal_recorded_ts. Полностью оставлять нынешний тяжёлый observations.remember до enqueue не нужно.

## Обязательная зависимость repair — не просто move одной строки

Сейчас `observations.publication` требует уже созданный journal и иначе бросает SAVED_ANALYSIS_JOURNAL_REQUIRED. Если перенести journal после send, существующий `recordPublished`/repair loop обязан уметь восстановить его из `card.analysis.source_input_key` и immutable saved original перед publication/sync. Иначе crash между SENT ACK и journal создаст новую дыру. Для обычного успешного прохода можно передать уже имеющийся original; для repair нужен точный original PK, никакой re-analysis/new send.

Не acknowledge delivery work до journal/publication registration. Уже сохранённые card/receipt и pending delivery pointer обеспечивают восстановление без повторной отправки; сохранить этот порядок. Postpublication failure не должен превращать SENT в ERROR/UNKNOWN или удалять pending reference. Нужен сохранённый/возвращённый delivery result и отдельный bookkeeping-error, а не слепой retry.

## T0 и бюджет

Feature origin.t0 и outcome journal origin.t0 сейчас берутся из analysis.analysis_ts; recorded_ts — отдельное время фактической записи. Сохранять T0=1793032928284, reference_price, original key/plan, version, features_known_ts и исходный horizon deadline=T0+4h. Нельзя сдвигать T0 на enqueue/send/postprocessing либо задним числом назначать feature-known clocks. Задержка записи сама по себе не делает исходные факты будущими.

Перестановка не требует нового source HTTP: остаются прежние fresh price/book2 recheck, все source upper bounds и квоты. Repair original PK — native accounting, его возможную дополнительную стоимость ROOT должен поместить в текущий envelope; unknown/charges/unused grants не возвращать. Внешний ctx.waitUntil/fire-and-forget для перенесённой работы не нужен: дождаться bounded postwork в том же owned runner, сохранив executor/native fences.

Это устраняет доказанную лишнюю работу до gate, но не доказывает ретроспективно, что AIN точно успел бы пройти card persistence+recheck+Telegram за оставшиеся6662ms. Реальную доставку нового кандидата нужно подтвердить отдельно. Q current72 PLAN_INVALIDATED — иной случай, на AIN не переносится. Пороги/priority redesign отложены; runtime правит ROOT, ANALYTICS в BZ2 код не меняет и engine/Node/IO не выполняет.
