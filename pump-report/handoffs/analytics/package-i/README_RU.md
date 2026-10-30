# I — принятый владельцем native-relative объём

Authority base: `15bddf357cb54bfc6ee033e6140d70bcdb76270e`. Общий additive контракт `pump-report-contract-v1.1-native-relative`, прежние INPUT/ANALYSIS V1. ТЗ v2 SHA256 `0674adf8bef087f63ddac8214b8e650ae14410f33970ed4f869c5ab2564975cc` не менялся. Прямое решение владельца: `checkpoints/pump-report-20261025/OWNER_CANDLE_SEMANTICS_ACCEPTED.json`, ответ «Принять этот вариант». Смена стратегии/порогов или объявление абсолютной BASE/USDT единицы не выполнялись.

Изменены только `analytics/math.mjs`, `analytics/movement.mjs`, `analytics/index.mjs`; новые проверки — `tests/analytics/native-relative.test.mjs`. SOURCE/contract/runtime не менялись этим чатом. Код локальный; ROOT интегрирует. Точные baseline, diff, хеши, результаты и readonly SOURCE dependencies — qualification.json.

## Принимаемый вход

Новый режим явно задан `CANDLE_NATIVE_RELATIVE_UNIT=OHLC_USDT_NATIVE_REPORTED_QUANTITY`. Для BINGX/OBSERVED факта сохраняются прежние clocks/freshness и обязательны:

- status USABLE либо INCOMPLETE, coverage.time_qualified=true, relative_volume_qualified=true, volume_qualified=false;
- time_basis=CCXT_CONSUMER_OPEN_TIME, comparison_kind=SAME_NATIVE_REPORTED_QUANTITY, native_quantity_unit=UNKNOWN;
- coverage.volume_comparison_key и ключ каждой используемой строки совпадают с `candleNativeComparisonKey(instrument,60000)`;
- абсолютные BASE/USD flags и independent_vendor_guarantee_claimed не могут быть true; evidence_ref непустой;
- каждая строка имеет конечный volume_native≥0, сохранённый native_volume_decimal, native_quantity_unit=UNKNOWN, comparison_kind и exact volume_comparison_key; volume_base и turnover_quote остаются null.

Ключ:

```text
BINGX|USDT_M|<exact instrument_id>|/openApi/swap/v3/quote/klines|volume|60000
```

Проверяются decimal string↔numeric соответствие, закрытость, интервалы, OHLC, row scope и сохранённые clocks. При наличии исходных native_time/native_time_semantics проверяется соответствие open_ts/OPEN_TIME; time_evidence_ref, volume_evidence_ref и исходная decimal string сохраняются. Принятая consumer-конвенция не переименовывается в независимую гарантию биржи.

`closedCandles(rows,at,interval,{native_comparison_key})` — дополнительный необязательный четвёртый аргумент. analyzePump передаёт его только в новом named режиме. Прежние трёхаргументные потребители/price-only outcome совместимы; пригодные native metadata не меняют HIT/MISS/UNKNOWN по ценам.

## Сравнение и сохранённая волна

В новом режиме сравнивается только volume_native того же scope во всех текущих и фоновых закрытых окнах. Суммы/медиана внутренней quantity имеют **UNKNOWN_NATIVE_UNIT**, отношения — **RATIO**. Нет присваивания native в volume_base, пересчёта в BASE/USDT или сравнения количества между разными монетами/маршрутами/полями/интервалами.

`activity.volume_basis` и `next_wave.impulse` сохраняют field, unit, comparison_kind, comparison_key, interval_ms; impulse.ratio_unit и activity.ratio_unit явно RATIO. В activity сохранены coverage/исходные event/received/source/venue/evidence и time_basis. Неизвестный/нулевой знаменатель даёт null с причиной; численный overflow не даёт Infinity-подтверждение. У медианы обычный конечный путь арифметики оставлен прежним, добавлен безопасный fallback только для overflow сложения.

При переключении BASE↔native, quote↔BASE без прежнего поля либо изменении сохранённого native key исходная волна возвращается в WAITING с `WAVE_VOLUME_COMPARISON_BASIS_CHANGED`. Её wave_id, created_ts, expires_ts, qualification и исходный impulse не пересчитываются. Нулевой/неизвестный сохранённый impulse volume также ждёт пригодной базы. Смена единицы сама по себе не продлевает жизнь и не создаёт независимую волну, включая истёкшую волну без новой активности. При добавлении quote к уже существующему пригодному BASE ряду сохраняется BASE-сравнение исходной волны.

Пороговый рост, активность/объём, цена, стакан/ликвидность и самостоятельный план не ослаблены. При том же пригодном native basis сохранённая волна по-прежнему переживает откат ниже первоначального порога без сдвига срока. Самостоятельная новая волна после terminal/expiry остаётся возможной только по прежним условиям нового импульса, а не по факту смены unit.

## Карточка

В карточке нет абсолютных native sums как монет/USDT. Есть явная отметка: «Объём сопоставлен только со своей историей; абсолютная единица количества неизвестна». Размер позиции USDT продолжает опираться на отдельно квалифицированный стакан. Численная вероятность null. Новая отметка зарезервирована как обязательное ограничение в renderer G; проверен максимум трёх входов и 3+3 зон с контекстом ≤4096.

## Проверки и подключение

**26 новых случаев PASS / 0 FAIL**, включая проверку связи с реальным текущим SOURCE normalizer/factory через искусственный in-memory broker. Получены настоящий source Fact shape, null absolute fields, clocks/evidence и native scope; вызван анализ. Это доказательство совместимости кода, не provider/native proof. SOURCE/contract файлы сверены с опубликованным `7fc18dbad83576a7ced14df582fe2ed8bee45d36` по exact Git blob; детали — authority/qualification.

**10 прежних affected случаев PASS**: исходный BASE-план/retained wave, состояния отката, quote-null, короткая история, будущее подтверждение, временно пустая активность, обязательный объём и границы price-only исхода. Полные A–H не повторялись. После последнего сохранения прежнего finite median пути отдельно выполнены пять затронутых I-кейсов, все PASS. Результаты и команды сохранены.

Остальные новые случаи: named flags, cross-asset/route/field/interval, смешение BASE/quote строк, malformed/missing/negative/nonfinite quantity и decimal, нулевая база/текущий объём, переключение сохранённых bases в обе стороны, сохранённый key, retained retreat, gaps/stale/future bars, обязательные price/book/plan gates, quote/BASE совместимость, overflow/null reasons, expiry без возрождения и максимальная карточка.

ROOT должен включить frozen три analytics файла вместе с уже согласованными contract/SOURCE и выполнить **один final assembled E** после общего wiring H+I+SOURCE. E этим пакетом не запускался. Native/provider/SQL/Telegram/deploy/cron = 0; старые паузы, бюджеты/unknowns и две OWNER deferrals сохранены. Искусственный пример не объявлен реальным сигналом или доказанной калибровкой.
