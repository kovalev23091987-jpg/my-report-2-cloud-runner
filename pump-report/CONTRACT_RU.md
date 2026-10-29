# Общий контракт нового Памп-отчёта

Последнее прямое уточнение владельца25.10.2026: сравнение движения монеты с BTC/ETH полностью исключено из нового пути. Для него нет запросов, расчётов, сроков пригодности, резервов, диагностических требований или текста карточки. Падающий рынок не запрещает сигнал по монете. Исходные записи и доказательства отменённой разработки сохраняются как история, без использования при новых решениях. Это уточнение имеет приоритет над относительной силой в строках75/889 исходного ТЗ v2; прочий полезный дополнительный контекст бирж оценивается по собственным фактам.

Уточнения владельца25.10.2026: BTC иETH исключены из новых проверок/карточек/доставки; их VERIFIED_CRYPTO identity сохраняется отдельно. Общие gates `ownerInstrumentExcluded` и `ownerPublicationRefusal` действуют также на старую очередь. Карточка допускается к отправке только с подтверждённым консервативным `plan.potential_pct.minimum>=10`, `basis=GROSS_ENTRY_TO_EXIT_NOT_EXECUTED_PROFIT`; неизвестный или частично подходящий план с minimum<10 не отправляется. Автопороги прошлого роста +20%24h/+10%5/15/60m прежние.

Из внешнего текста удалены фразы о максимальном размере по текущему стакану/негарантированной будущей цене и о неизвестной абсолютной единице объёма. Числовой объём показывается только при известной величине и подтверждённой единице; иначе строка отсутствует. Расчёты допустимого размера и relative activity сохраняются внутри; обязательная отметка отсутствия карты остаётся.

`input.run_purpose` задаёт защищённый runtime: PRODUCTION только в принятом production-stage, приёмочные запуски ACCEPTANCE_TEST, неизвестное UNCLASSIFIED. Режим MANUAL/AUTO и тест явно обозначаются. Исходная отправка240 — ACCEPTANCE_TEST; аддитивный exact-binding `contracts/run-purpose.mjs` и OWNER_PUBLICATION_AMENDMENTS.json не меняют её t0/P0/wave/правила/текст/hash/receipt. Производственная сводка — новый производный namespace production-v2 по прежнему append-only index, только explicitPRODUCTION+OBSERVED. Прежние исходные записи и агрегат сохраняются; тесты/UNCLASSIFIED не входят в рабочую калибровку.

Версия `pump-report-contract-v1`. Стратегия — ТЗ v2 от 25.10.2026, SHA256 `0674adf8bef087f63ddac8214b8e650ae14410f33970ed4f869c5ab2564975cc`. Владелец общих форматов и профиля — ROOT. Численные предложения профиля сохраняют экспериментальный статус. Этот контракт задаёт стыки, а не новую стратегию.

## Общие значения

Часы — integer epoch milliseconds UTC; рабочее окно отображается в Europe/Moscow. Значения нормализованы в number только после проверки единиц; неизвестное — null плюс reason. USD/USDT/USDC не взаимозаменяемы. Все факты привязаны к инструменту и исходной бирже. Скачивание не обновляет часы источника. Цены last, mark, index — разные виды фактов.

`instrument`: instrument_id, asset_id, venue=BINGX, native_symbol, market_type=PERPETUAL, base, quote=USDT, settle=USDT, classification_status=VERIFIED_CRYPTO; price_tick, quantity_step, contract_multiplier и identity_evidence_ref — при доказанности. Непроверенные инструменты остаются в отдельном списке каталога, а не проходят assertInstrument.

`Fact`: fact_id, instrument_id, kind, value, unit, event_ts, received_ts, expires_ts, source, primary_provider, venue, status, origin, coverage, reason, evidence_ref. Статусы и helpers — в contracts/index.mjs. Отсутствие optional факта не маскируется нулём.

Дополнение `pump-report-contract-v1.2-quote-notional`: у `kind=trades` две раздельные единицы. Прежняя `USDT_PRICE_BASE_QUANTITY` использует известные `price` и `quantity_base`. Новая `USDT_PRICE_QUOTE_NOTIONAL` использует документированное для точного recent-trades метода количество котируемого актива `notional_quote`, только при verified quote=USDT. Строки новой формы: `{trade_id,event_ts,price,notional_quote,aggressor_side}`; неизвестное количество BASE остаётся null/отсутствует и не восстанавливается делением. Исторический `historicalTrades.quoteQty=Turnover` этим не квалифицирован. Константы обеих единиц — в contracts/index.mjs.

Для новой формы нужны положительные конечные price/notional_quote, стабильный trade_id, проверенное BUY/SELL по точной документированной maker-семантике, исходные trade timestamp(ms)/received/expiry и точный instrument/route/field/unit evidence. Нельзя без проверки смешивать buyerMaker/isBuyerMaker или выбирать удобное конфликтное поле. Неизвестные/конфликтующие строки не создают directional claim. Source сохраняет returned/qualified/excluded counts, исходные clocks/receipt и неполноту: latest returned sample не означает полный рынок или заданное временное окно. Consumer использует прямой notional_quote, сохраняет дедупликацию/конфликты до фильтра и тот же квалифицированный набор для суммы и реакции цены; никакого поглощения, причинности или benchmark. Source HTTP остаётся в общем optional upper2, новый маршрут/код не является live admission.

## Источники → общее ядро

`createPumpSources({broker, identityRegistry, clock, profile})` возвращает методы:
- `getCatalog({run_id})` → `{instruments, unqualified, coverage}`.
- `getOverview({run_id, instruments})` → `{observations, coverage}`; пакетная дешёвая подготовка кандидатов, не окончательное аналитическое решение.
- `getCore({instrument, run_id, mode})` → `{facts, coverage}` с price, candles, orderbook; при необходимости trades для доказанного last/time. Дополнительные сведения допустимы без обязательной полной цепочки.
- Для повторной проверки публикации getCore принимает `force_refresh:true,only_facts:['price','orderbook']`: выбранные факты загружаются без готового кэша, исходные часы не переписываются. Обычный вызов продолжает возвращать все три обязательных факта. ROOT объединяет обновление с пригодными закрытыми свечами и повторно проверяет тот же план; изменившаяся карточка пересчитывается, старый текст не подменяется при отправке.
- `getOptional({instrument, run_id, mode, facts})` → дополнительные trades/open_interest/funding. Не задерживает готовую основную идею. Сравнение с BTC/ETH исключено владельцем.
- `getLiquidations({instrument, run_id, reference_price, deadline_ts})` → Map. Только после основной квалификации кандидата, внутри общего и специального бюджета.
- `getCoverage()` → таблица проверенного охвата и причин пробелов.
- `getOutcomeHistory({instrument,run_id,start_ts,end_ts})` → `{facts:{candles},coverage}`: тот же брокер и нормализация, закрытые 1m свечи для четырёхчасового исхода с охватом floor(start)..ceil(end); не новый независимый сборщик. Пограничный high не доказывает HIT внутри периода. Полностью охватывающие период свечи с high ниже цели могут доказать отсутствие достижения; неблагоприятный путь на границах отдельно остаётся неизвестным, если порядок/точное время не доказаны.

Имена ключей facts: price (числовой last в USDT/base), candles (массив), orderbook, ticker_24h, trades, open_interest, funding. PRICE usable имеет исходные часы. Candles: `{open_ts, close_ts, closed, open, high, low, close, volume_base, turnover_quote}`; неизвестный точный turnover_quote остаётся null. Границы свечей — [open_ts,close_ts), closed подтверждён адаптером; исходный open-time не выдаётся за close-time. Orderbook value: `{bids:[[price,base_quantity]], asks:[[price,base_quantity]]}` с доказанной конвертацией size. Trades: `{event_ts,price,quantity_base,aggressor_side}`; неизвестное направление null. ticker_24h value содержит last/open при доказанности соответствующего скользящего окна. Внешний context не переименовывается в BingX.

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


## Принятое владельцем уточнение свечей 25 октября

Владелец прямо выбрал «Принять этот вариант» для exact pinned CCXT opening-time convention и безразмерного native quantity comparison. Решение: `checkpoints/pump-report-20261025/OWNER_CANDLE_SEMANTICS_ACCEPTED.json`. ТЗ v2 и его SHA256 остаются теми же; пороги/обязательность движения, активности, ликвидности и плана не меняются.

Новый дополнительный candle unit: `OHLC_USDT_NATIVE_REPORTED_QUANTITY`. Это не BASE и не оборот USDT. В каждой строке `volume_base=null`; исходный `native_volume_decimal` сохраняется, числовой `volume_native` допускается только для сравнения. Явные поля: `native_quantity_unit=UNKNOWN`, `comparison_kind=SAME_NATIVE_REPORTED_QUANTITY`, `volume_comparison_key=candleNativeComparisonKey(instrument,60000)`.

Сравнение допускается внутри одного exact BingX USDT_M инструмента/маршрута/поля volume/минутного интервала и одного сопоставимого определения величины. Входные текущие и предыдущие окна должны быть пригодны и полны по прежним правилам. Отношение имеет единицу RATIO; при нулевой или неизвестной базе результат null с причиной. Абсолютная сумма не становится количеством монет или денежным объёмом. Смешение quantity bases между окнами или с сохранённой волной не допускается; исходные t0/P0/дедлайн не передвигаются.

Coverage различает `volume_qualified=false` для неизвестной абсолютной единицы и `relative_volume_qualified=true` только при выполнении принятого scope. Абсолютные base/USDT qualified flags остаются false. OPEN_TIME интерпретация хранит `time_basis=CCXT_CONSUMER_OPEN_TIME` и ссылку на точный pinned code review. Это принятое основание consumer, а не утверждение о новой биржевой гарантии. Исходные event/received clocks и capture-closedness, grid/gaps/90s свежесть сохраняются.

Старый действительно квалифицированный BASE/quote режим остаётся совместимым. Новый enum не является разрешением для произвольного caller boolean: SOURCE связывает его с сохранённым решением, exact primary-code evidence и registry identity, ANALYTICS проверяет named unit/coverage/row keys. Цена, стакан и размер позиции по-прежнему требуют своих независимых единиц и свежести.


## Отдельное суточное окно роста

Аддитивный факт `facts.growth_24h`: `kind=growth_24h`, `unit=USDT_CLOSED_ROLLING_24H`, `value={open,last,start_ts,end_ts,window_ms:86400000}`. Его инструмент, venue BINGX, primary provider BINGX и источник должны соответствовать проверенной USDT_M привязке. Это точный расчёт по наблюдённым OHLC в пределах принятой CCXT-разметки времени, а не vendor-гарантия ticker24h.

Производитель читает отдельно 1440 закрытых минут, `start=end−86400000`, `endTime=end−1`, `limit=1440`; end округлён вниз до минуты. Для USABLE обязательны вся точная сетка1440 без пробелов, положительные известные open/last, начало и конец интервала. `event_ts=end_ts`, `expires_ts=end_ts+profile.freshness_ms.candles`, оригинальный received_ts не обновляется при cache-hit. Coverage явно сохраняет полную сетку, исходный receipt, accepted time basis и способ вычисления. `origin=OBSERVED` означает расчёт по наблюдённым ценам; самостоятельная derived_from/derivation ссылка отделяет его от сырого поля производителя. Неполное или устаревшее окно не подтверждает +20%; received_ts не заменяет исходное время.

Основные121 свеча, профиль, пороги, объёмная база и выбор уровней этим дополнением не меняются. Нативное количество остаётся относительным с неизвестной абсолютной единицей. Отдельный суточный факт влияет только на подтверждённое окно роста; старые замороженные сигналы и их t0/P0/цель/версия правил не переписываются. До отдельной нативной проверки поведения start/endTime этот путь не называется native-proven.


## Последний снимок каталога контрактов

`createPumpSources` принимает необязательный `on_catalog_snapshot=null`. После прежней проверки успешного BingX `code=0` и массива каталога callback получает `PUMP_CATALOG_INGRESS_V1`: provider=BINGX, family=USDT_M, route=/openApi/swap/v2/quote/contracts, исходные broker receipt_id/received_ts и body=response.data. Параметр ttl=0, число HTTP, результат нормализации, классификация и фильтры сохраняются.

ROOT writer сохраняет один текущий record `pump:catalog:last-observed:v1`: максимум2000 строк контракта и2MiB сериализованного JSON. Полный record ограничен1 900 000 UTF-8 байт до любого SQL; запас учитывает [предел D1 для строки2 000 000 байт](https://developers.cloudflare.com/d1/platform/limits/). Это SHA от broker-parsed JSON.stringify UTF-8, а не исходных wire bytes. Время источника неизвестно (`source_event_ts=null`); received_ts не обновляется при сохранении. Record содержит implementation pin, evidence_class, saved_ts, исходный receipt и полный body. Снимок не доказывает классификацию всех строк, CORE или текущий global crypto N.

Один пригодный снимок добавляет один store.set и один store.get для readback в прежнем положительном native envelope. Фактические SQL/R/W определяются D1 ACK, неизвестности сохраняются. Пустой, несвязанный или слишком большой payload даёт SKIPPED без SQL и не мешает прежнему результату каталога. Ошибка/UNKNOWN native callback пробрасывается; её нельзя скрыть успешным source result. Не создаётся растущая история и не очищается прежнее хранилище; лимит200 записей surplus и обе OWNERdeferrals не затрагиваются.

Read-only operator читает этот фиксированный ключ только при явно допущенном `read_catalog_snapshot=true`: ещё один PK-read внутри прежних16SQL/500R/30W, без рынка и Telegram. Body остаётся private. Hash/clock/pin binding и OBSERVED проверяются отдельно; ARTIFICIAL не становится native. Изменение требует одной affected qualification и точной сборки/установки; сама подготовка не означает, что снимок уже существует на сервере.


## Дополнительная ценовая структура — 29 октября 2026

`facts.price_structure` — необязательный факт `kind=price_structure`, `unit=USDT_OHLC_MINUTE_PRICE_ONLY`. `value` — ровно 1440 закрытых последовательных строк `[open_ts,open,high,low,close]` с шагом 60000 мс; максимум 131072 байта UTF-8 JSON массива. Источник — уже выполненный запрос суточных свечей BingX; новых HTTP, подписок или абсолютных единиц объёма нет. Growth24h и прежние 125 CORE-свечей сохраняют свои значения и правила. Статус, original receipt/evidence, event/received/expires, квалифицированная разметка времени, полная сетка и точная identity сохраняются от исходного ответа; кэш не обновляет возраст.

Consumer проверяет envelope/identity/venue/provider/source/unit/размер/полную сетку/OHLC/исходные часы и совпадение OHLC на перекрывающихся закрытых интервалах с CORE. Отсутствие, устаревание, повреждение, иная identity или несовпадение истории дают явную диагностику и прежний CORE-only результат. Проверка этой identity находится в plan-only consumer; общая проверка обязательных фактов остаётся строгой.

Только подтверждённые и известные к analysis_ts pivots могут дополнить набор уровней существующего конструктора плана. История не меняет отбор роста, baseline объёма, seed, reclaim, состояние/границу отмены/срок волны, обязательные 10% потенциала, ликвидность и доставку. Обычные уровни не называются ликвидациями. Реальные старые originals не достраиваются; синтетическая история в проверке не доказывает готовность Q или AIN. Перед установкой — один связанный affected-case с отсутствующей/пригодной/повреждённой историей и неизменностью старых Q/AIN результатов без добавленной истории.
