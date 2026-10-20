# Сохранённые свечи: закрытость на исходный as-of и допустимая геометрия

Готовое offline TEXT-предложение для одного существующего research consumer. Canonical target — anomaly-research/saved-candle-typed-input-20261019/typed-input.mjs, buildResearchInput. Первым зафиксирован протокол c6b744c4; before SHA bc9d1ea6, after eca907df, точные значения в proposal-target.json. Автор текущую цель не изменял, patch не применял, модули/Node/tests не исполнял. Frozen585 и старые accepted originals сохраняются.

## Воспроизводимая по коду причина

В прежнем HTX branch выбранные20 prior и target связываются с оригинальным channel/ts и native id/OHLC/trade_turnover. Проверяется4h duration, но end_ts не сравнивается с provider.ts. Впоследствии проверяется конец target относительно usable_research_known_by_ts — момента гораздо более позднего локального чтения. Это позволяет использовать значение свечи, ещё открытой в исходном ответе, как позднее историческое окно. Позднее время не доказывает, что сохранённое значение стало окончательным.

Ещё один конкретный недостаток этого consumer: каждый OHLC обязан быть положительным числом, но high может быть ниже open/close или low выше open/close. Чистая features допускает такие аргументы и может вернуть отрицательные тени. Это дефект валидации research-пути, не доказанный дефект сохранённых3real samples/3274findings. Последние не пересчитываются и их результаты не отзываются без факта повреждения.

## Минимальный patch

В HTX branch добавлены safe-integer original as-of и end<=исходный provider.ts для каждого выбранного бара. Ровно end==as-of допускается. Прежний generic future-source/local-clock guard остаётся; NULL sourceasof для HTX теперь явно отказывает, а BTC-derived source_ts=NULL сохраняет прежнюю допустимость при исходных ограничениях карточки. Нет подстановки Date.now в source clock.

После прежнего преобразования лексем toBar проверяет low<=min(open,close), high>=max(open,close), low<=high. Это одинаковая базовая OHLC-инварианта для HTX и двух существующих BTC-derived рынков. Лексемы, quote turnover обеих сторон, factor1, документарный NULL futures unit, observed0, все source/body/local knowledge clocks и output shape успешного пути сохраняются. Новые timeframe/UTC alignment assumptions не вводятся. annotateLaterArchivedBar и features не меняются.

В after-file всего333 дополнительных байта. Нового I/O, SQL/HTTP, runtime helper, reader, schema, backend, dispatcher или source quota нет. Это canonical research-module proposal; production import/score/weights/лимиты/LIQ/Telegram не меняются.

## Один новый affected callable

runClosedAsofTypedConsumerConnected({repo_root,baseline_repo_root}) из connected.mjs. Оба аргумента — полные разные repo trees. Coordinator оставляет настоящий старый canonical module в baseline, а к candidate применяет TEXT patch. Before/after module pins, неизменная observer.features SHA и обе policy SHA проверяются до import.

Callable создаёт21 CONTROLLED4h бара и синтетический HTX JSON с нужными channel/source_row_index. Применяются настоящие verifyReadJson/buildResearchInput/observer.features и pinned документарные policies. Декларативный CONTROLLED raw_ref нужен только существующей проверке формы local marker: никакого файла по этому пути не пишется, provider original не заявляется. Старые rawgzip, реальные BTC cards, qualification3sample outputs,37cohort и3274/13096 studies не читаются и не воспроизводятся.

В одном entry7 групп:

1. Ровно end==sourceasof: baseline/candidate typed view и признаки равны; epoch/card/watch блокировки остаются.
2. Target был открыт на исходный sourceasof: старый consumer принимает, новый отказывает.
3. Один из выбранных prior ещё открыт на исходный sourceasof: проверяется весь21bar набор.
4. Исходный HTX asof=NULL: нет продвижения local known_by в source closure.
5. Положительные malformed high/low target/prior и synthetic BTC-derived spot: старое число не считается допустимым OHLC.
6. Фактический volume0 и лексема'0' сохраняются, ratio0 не превращается в missing.
7. Sourceasof позже local knowledge: прежний generic отказ остаётся в обеих версиях.

Авторский статус всех сценариев UNEXECUTED. Подсчёт7 — подготовленные assertion groups, не PASS. Вызов/сохранение первого результата/общая affected квалификация принадлежат координатору. Старые suites повторять не требуется.

## Что остаётся открытым

Никакой prospective accuracy, native инструментальной эпохи, полного provider body clock, server/domain ACK, event first_known, memory/watch/outbox или actual admission. Этот пакет не включает detector и не создаёт event card. Он не исправляет текущий Telegram/day-budget отказ и не выдаётся за его причинный ремонт. Исходная legacy/retained неопределённость и все NULL остаются явными. ENTRY-followup/anchors/TTL и физическая capacity-проверка остаются отложены владельцем.
