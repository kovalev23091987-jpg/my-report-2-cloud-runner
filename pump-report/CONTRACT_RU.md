# Общий контракт нового Памп-отчёта

Версия `pump-report-contract-v1`. Стратегия — ТЗ v2 от 25.10.2026, SHA256 `0674adf8bef087f63ddac8214b8e650ae14410f33970ed4f869c5ab2564975cc`. Владелец общих форматов и профиля — ROOT. Численные предложения профиля сохраняют экспериментальный статус. Этот контракт задаёт стыки, а не новую стратегию.

## Общие значения

Часы — integer epoch milliseconds UTC; рабочее окно отображается в Europe/Moscow. Значения нормализованы в number только после проверки единиц; неизвестное — null плюс reason. USD/USDT/USDC не взаимозаменяемы. Все факты привязаны к инструменту и исходной бирже. Скачивание не обновляет часы источника. Цены last, mark, index — разные виды фактов.

`instrument`: instrument_id, asset_id, venue=BINGX, native_symbol, market_type=PERPETUAL, base, quote=USDT, settle=USDT, classification_status=VERIFIED_CRYPTO; price_tick, quantity_step, contract_multiplier и identity_evidence_ref — при доказанности. Непроверенные инструменты остаются в отдельном списке каталога, а не проходят assertInstrument.

`Fact`: fact_id, instrument_id, kind, value, unit, event_ts, received_ts, expires_ts, source, primary_provider, venue, status, origin, coverage, reason, evidence_ref. Статусы и helpers — в contracts/index.mjs. Отсутствие optional факта не маскируется нулём.

## Источники → общее ядро

`createPumpSources({broker, identityRegistry, clock, profile})` возвращает методы:
- `getCatalog({run_id})` → `{instruments, unqualified, coverage}`.
- `getOverview({run_id, instruments})` → `{observations, coverage}`; пакетная дешёвая подготовка кандидатов, не окончательное аналитическое решение.
- `getCore({instrument, run_id, mode})` → `{facts, coverage}` с price, candles, orderbook; при необходимости trades для доказанного last/time. Дополнительные сведения допустимы без обязательной полной цепочки.
- Для повторной проверки публикации getCore принимает `force_refresh:true,only_facts:['price','orderbook']`: выбранные факты загружаются без готового кэша, исходные часы не переписываются. Обычный вызов продолжает возвращать все три обязательных факта. ROOT объединяет обновление с пригодными закрытыми свечами и повторно проверяет тот же план; изменившаяся карточка пересчитывается, старый текст не подменяется при отправке.
- `getOptional({instrument, run_id, mode, facts})` → дополнительные trades/open_interest/funding/market_context. Не задерживает готовую основную идею.
- `getLiquidations({instrument, run_id, reference_price, deadline_ts})` → Map. Только после основной квалификации кандидата, внутри общего и специального бюджета.
- `getCoverage()` → таблица проверенного охвата и причин пробелов.
- `getOutcomeHistory({instrument,run_id,start_ts,end_ts})` → `{facts:{candles},coverage}`: тот же брокер и нормализация, закрытые 1m свечи для четырёхчасового исхода с охватом floor(start)..ceil(end); не новый независимый сборщик. Пограничный high не доказывает HIT внутри периода. Полностью охватывающие период свечи с high ниже цели могут доказать отсутствие достижения; неблагоприятный путь на границах отдельно остаётся неизвестным, если порядок/точное время не доказаны.

Имена ключей facts: price (числовой last в USDT/base), candles (массив), orderbook, ticker_24h, trades, open_interest, funding, market_context. PRICE usable имеет исходные часы. Candles: `{open_ts, close_ts, closed, open, high, low, close, volume_base, turnover_quote}`; неизвестный точный turnover_quote остаётся null. Границы свечей — [open_ts,close_ts), closed подтверждён адаптером; исходный open-time не выдаётся за close-time. Orderbook value: `{bids:[[price,base_quantity]], asks:[[price,base_quantity]]}` с доказанной конвертацией size. Trades: `{event_ts,price,quantity_base,aggressor_side}`; неизвестное направление null. ticker_24h value содержит last/open при доказанности соответствующего скользящего окна. Внешний context не переименовывается в BingX.

Все HTTP только через `broker.request({provider, family, cache_key, url, method='GET', timeout_ms, ttl_ms, estimated_cost:{http:1}, headers?})`. Ответ `{ok,status,data,headers,received_ts,cache_hit,receipt_id}`. Доступные credentials добавляет защищённый runtime; в отчёты/fixtures не попадают. При отказе допуска broker бросает ошибку с code; источник возвращает честный статус. Broker владеет бюджетом, предварительным резервированием, фактическими/unknown расходами, общими in-flight запросами, сохранённым кэшем и backoff. Источники не вызывают fetch самостоятельно и не принимают boolean за live admission.

Map: `{status,reason,zones,checked_sources,coverage}`. Zone: zone_id, asset_id, source, primary_provider, venue, market_id, lower, upper, event_ts, received_ts, expires_ts, basis_type=OBSERVED_POSITION|EXTERNAL_MODEL, magnitude_value|null, magnitude_unit|null, relative_scale|null, coverage, limitations[], position_ids[], overlap_group|null, usable, evidence_ref. Вся исходная lineage сохраняется. SOURCES нормализует и квалифицирует каждую исходную зону; ANALYTICS объединяет совместимые и выбирает до3 с каждой стороны без удвоения. Отсутствие пригодных зон = режим без карты.

## Ядро и карточка

`analyzePump(input, profile=START_PROFILE)` — чистая функция без IO. INPUT_SCHEMA, run_id, mode=AUTO|MANUAL, analysis_ts, instrument, facts, liquidations=emptyMap(), previous_wave=null. Цена/свечи/стакан/план обязательны; optional факты не становятся общим запретом. Для ручного запроса автоматический отбор отражается отдельно.

Результат ANALYSIS_SCHEMA: run_id, instrument, analysis_ts, reference_price, wave_id, wave_state, previous_wave/next_wave при необходимости; automatic_eligible (boolean), ready (boolean), status=READY|WAITING|REJECTED, reasons[], findings[{code,text,fact_ids}], plan|null, liquidity, liquidations, probability, card_text|null, rules_version, profile_version, fact_ids[]. `automatic_eligible` — действующий подтверждённый автоматический допуск волны, который не исчезает при пригодном откате ниже первоначальных порогов; текущее прохождение порогов хранится отдельно в `current_threshold_passed`. Оно не продлевает исходный срок волны.

Зоны дополнительно могут содержать `price_currency`, `model_id`, `model_version`, `price_comparability` с evidence_ref. Неизвестная совместимость запрещает объединение между моделями/рынками, а не основную карточку. Желаемый потенциал10% хранится как `desired_plan_potential_pct`, сравнение с реальным потенциалом — отдельное объяснение, без нового универсального gate. Технические параметры определения структуры/отката/слияния включены ROOT в предлагаемый инженерный профиль; это не доказательство оптимальности.

plan: entry_zones[{lower,upper,basis_fact_ids,explanation,confirmation_status}], exit_zone{lower,upper,basis_fact_ids,explanation}, invalidation{kind,price|null,explanation}, position_limit_usdt. liquidity содержит проверки sizes и явные unit/спред/проскальзывание. Никаких автоматических ордеров/утверждений о входе пользователя.

liquidations результата: status,reason,zones_up,zones_down,coverage; неполнота видна. probability: `{value_pct:null,event:'PRICE_PLUS_10_PERCENT_WITHIN_4_HOURS',reason:'NOT_CALIBRATED'}` до доказанной калибровки данного режима. card_text короткий по разделу18ТЗ; без карты явная отметка; нет необоснованных намерений, процентов или зон. ROOT сохраняет точный текст/hash/card_id и доставляет его; ANALYTICS не отправляет.

`evaluateOutcome({signal, price_points=[], candles=[], as_of_ts})` — чистая функция. signal содержит signal_id,wave_id,t0,reference_price,rules_version,mode,map_mode,plan. price_points: `{event_ts,price}`; candles как выше, с фактическим покрытием. Результат target_price=1.1*P0,deadline_ts=t0+4h,status=HIT|MISS|UNKNOWN,hit_ts|null,drawdown_before_hit_pct|null,drawdown_total_pct|null,coverage,reasons[],scenario_outcome. Неполный период без достоверного hit не даёт MISS. Пограничный high не доказывает внутрипериодное касание. Обновления волны не новые независимые успехи. Хранение/сбор и периодический исполнитель исходов — ROOT.

## Следующие пакеты

А: реальные обязательные данные → один пригодный сценарий → сохранение → подтверждённая доставка, карта optional. Б: широкий каталог/очередь/все сценарии/ручной запуск/новое расписание. В: накопление исходов и доказанная калибровка/полезность; ожидание статистики не блокирует первую версию. Полная старая батарея и принятые97+7 без нового дефекта не повторяются.
