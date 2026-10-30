# BC — общий bulk провайдера и единые потребители550

**Нормальный production использует один START_PROFILE и один analyzePump для всех инструментов.** Артефакт LIVE66 AZ pin87420e4ab27f582faf3cd8502ce54703ac126dd2f06db1b0d7a4a70aae975af2 прочитан как сохранённый вход:66 модулей,65 pin-digests совпали (self-module исключён по формату). Новый серверный readback не выполнялся.

worker:140 передаёт START_PROFILE в общий runner, runner:119/133 вызывает тот же engine, index:135 использует тот же default. Критерии роста, сроки, размеры, spread/slippage и owner10 общие. Normal range, pivot-уровни и доступный размер вычисляются из данных конкретной монеты. Native ID/tick/quantity step/единицы — сведения каталога, а не500 ручных настроек стратегии. SOURCE может квалифицировать один provider-route/family semantic profile и автоматически заполнить данные точным full-catalogue join. Неизвестные исключения остаются неизвестными.

| Блок | Универсально уже есть | SOURCE proof pending | Что требуется реально наблюдать |
|---|---|---|---|
|1: цена/объём/движение|Один engine, собственные свечи и baseline каждого инструмента|Native identity;1m closed-time/grid; единицы; отдельное точное24h окно|Bulk catalogue→550join с per-row status; реальные закрытые окна и выбранный consumer. Ticker не доказывает550CORE|
|2: исполненные покупки/продажи|Один trade sample consumer, stable-ID dedup, сторона/суммы/реакция цены|Trade ID в namespace provider+market; maker/aggressor и amount semantics; row clocks/partial sample|Настоящий допустимый bulk либо параметризованный candidate read, пригодная выборка и её применение; не обещание поглощения|
|3: ликвидность|Общие700/1000/1500/2000/3000USDT и одинаковые ограничения|BASE/COIN/contracts и множитель, native book/time/depth; tick/step когда доказаны|Свежий правильный book каждого реально проверенного инструмента; семантический допуск не равен фактической проверке|
|4: OI/funding|Общий typed optional consumer, исходный source/time, контекст без направления|OI units; funding fraction vs percent, реальный период и rate-known clock|Официальные пригодные строки и consumer use. F588preparedinactive не является production; F589 проверяет bulk/free entitlement|
|6: будущие ликвидации|Общий asset-bound selector, comparability, dedup/coverage|Реальные open-position levels либо документированная модель; market IDs, units, source/model as-of|Фактические qualified rows и550coverage. Prints/обычные уровни не заменяют карту|
|Самостоятельный план|Один AZ алгоритм: известные anchors, width/отмена,10-before-cap, прежняя вершина/препятствия|Те же собственные identity/units/clocks входных фактов|Реальный выбранный анализ, revalidation, сохранённый текст и тот же SENT. BC этого заново не исполняет|

Блок5 сравнения с BTC/ETH отменён; он не возвращался. Блок7 поддержки после запуска не добавлен. Блоки не требуют шести разных сервисов.

## Обязательная граница нормализации

Общий bulk response разделяется на факты с собственным instrument_id. assertInput:72–74 отклоняет явно чужой instrument_id; инструмент обязан быть verified BingX USDT crypto perpetual. Но engine не распознает неверную native строку, которой нормализатор ошибочно присвоил ожидаемый ID. Поэтому SOURCE обязан доказать точный provider/native market/family/base/quote/settle→canonical join и сохранить row identity/response evidence. Одного совпадения тикера недостаточно.

Для каждого пригодного факта сохраняются kind/unit/value, source/primary_provider/venue/origin, event/received/expiry, fact ID/evidence и per-row coverage. Схемы окон, rate period, модель/scale и исходная market identity остаются в typed value/coverage/provenance. Другую площадку нельзя переименовать в BingX. Bulk200 или общий updatedAt не доказывают свежесть всех строк. Cache hit не обновляет часы. Несколько wrappers одного upstream используют общий primary lineage/cache/quota.

Для свечей native quantity допустимо сравнивать только в одном инструменте/route/поле/интервале по собственному comparison key; абсолютные BASE/USDT не выдумываются. growth_24h отдельно требует точные1440 закрытых минут и полное происхождение границ. Для trades quote notional не умножается повторно на цену; stable IDs дедуплицируются после корректного разделения по рынкам. OI snapshot не доказывает изменение/сторону; funding требует реального периода и времени знания ставки, не next settlement. Карта требует OBSERVED_POSITION/EXTERNAL_MODEL, а не выполненные ликвидации, и честной USDT comparability/partial coverage.

Coverage matrix различает listed→exact join→semantics→actual fresh fact→useful consumer. Её UNKNOWN/UNSUPPORTED_EXPLICIT/BUDGET_DEFERRED не передаются напрямую как несуществующие FACT_STATUSES. UNKNOWN остаётся в матрице и даёт непригодный typed fact с причиной; VERIFIED_ACTUAL становится USABLE только при действующей свежести. Пустые/непроверенные факты могут содержать null, не0. Точная раскладка полей и статусов — per-instrument-field-requirements.json.

## Итог и границы

Нового analytical consumer-format defect на этой boundary не установлено; proposed case0. Проверка одного DOOD/SOL sample не доказывает полный550join или coverage. Provider capabilities, pagination, free entitlement, actual bulk/cache wiring и полный budget остаются за SOURCEF589/ROOT. Production policy в прочитанном артефакте допускает BINGX/TELEGRAM; F588 preparation не объявлена активной.

Owner clarification SHA ddfaa5a490904692f0a9811ba99d16f331f51bc00eabb67fdeb9f5d0dfb0cedf проверен. Исходный0674/unified384e, профиль/пороги/entry, сегодняшняя цена банка, spent/unknown/reserves/3manual/future/delivery/outcomes/9пауз/2OWNERdeferrals сохранены. BA proposal рассматривает ROOT отдельно и не объявлен причиной реальных отказов DOOD/KIMCHI.

Фактически BC: код/веб/source collection/imports проекта/tests/callbacks/native/RPC/SQL/TG/Worker/deploy/CONTROL0. Только текстовая проверка сохранённого артефакта и хешей; это не новый live/market/550coverage proof.
