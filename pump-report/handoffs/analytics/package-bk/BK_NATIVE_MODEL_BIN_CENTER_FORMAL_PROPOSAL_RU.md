# BK — центр ценовой корзины внешней модели

**Условно да:** после отдельного положительного закрытия identity, цены/единиц, actual cost и применимых возрастных предикатов центр корзины можно честно представить как **«центр ценовой корзины внешней модели»** в валюте источника. Для этого не обязательно знать её края. Это отдельный точечный модельный контекст; он не является зоной, точной ценой ликвидации позиции, заявкой, ценой плана или ликвидацией BingX.

**Сейчас публиковать сохранённый HYPE response как текущий факт нельзя.** Снимок остаётся stale format proof. F596/F597 не закрывают все предикаты. BK не меняет contracts/code/card/strategy/age gates и не выдаёт admission.

## Что подтверждено именно этими frozen inputs

| Сведение | Статус и предел |
|---|---|
| price в levels — центр корзины | F596: CENTER_CONFIRMED_BY_OPERATION_AND_SCHEMA. Для center-context этого семантического основания достаточно; это не доказательство edges |
| lower/upper/output width/alignment | UNKNOWN. Нет источникового правила для запрошенного range_pct/buckets. Соседний шаг, midpoint между центрами и lower=upper=center не заменяют границы |
| long_notional/short_notional | USD_DOCUMENTED, модельные величины корзин; не сумма точных приказов/наблюдаемых BingX позиций. USD-notional не доказывает валюту price |
| Native Hyperliquid HYPE-USD contract | F597: USDC-denominated, USDC_PER_HYPE по native contract specification; не вывод из залога и не правило всех HL контрактов |
| Price axis 0xArchive HYPE | USDC_PER_HYPE — DERIVED_NATIVE_AXIS_INFERENCE_REQUIRES_ROOT_REVIEW. Прямого 0x currency field и actual unit/conversion validation нет; BK не повышает статус |
| BingX100877 / metadata2338 → Hyperliquid / 0x HYPE | Exact bridge UNKNOWN. Project page сильнее имени, но не связывает точный native contract/entity. Совпадение HYPE не даёт канонический join |
| snapshot_ts | Время расчёта модели; не время базовых позиций. Event clock нельзя подменить receive/cache time |
| base block1197850000 | Block reference; base_state_timestamp UNKNOWN. Не timestamp и не FRESH позиций |
| Стоимость/текущий result | Numeric premium/hostedHTTP bounds/account reserves и свежий authorized actual не закрыты; оставшиеся2 qualification attempts не являются admission |

F596 содержит отдельные visible-bin sums и whole-book totals; их не смешивать и не суммировать повторные snapshots как независимые деньги. Counts не доказывают число независимых участников. source=raw — ветвь модели, а не превращение projected forced-liquidations в OBSERVED_POSITION.

## Почему текущий путь не подходит

В contracts/index.mjs createFact:49–55 kind/value/unit технически расширяемы; это **контейнер**, не семантическая квалификация нового вида данных. assertInput:67–75 проверяет target instrument_id у каждого факта. Присвоить ему BingX ID при ещё UNKNOWN canonical bridge нельзя: одинаковый текст ID удовлетворил бы проверке, но не доказал связь.

Именно существующий **Map/Zone** требует lower/upper (CONTRACT_RU.md:41). selectZones:36–40 проверяет положительные границы, asset identity, clocks и USDT price comparability, затем выбирает стороны относительно BingX reference. Попытка передать туда native center нарушает смысл независимо от того, допускает ли код нулевую ширину. Не создавать фиктивные края/width, не переименовывать USDC/USD в USDT, не использовать native mid для стороны относительно BingX цены.

explainOptionalFacts сейчас потребляет trades/open_interest/funding; новый произвольный Fact kind будет проигнорирован. explainMapPlan использует только пересечение пригодных zones_up/down с entry/exit. Final renderer выводит две выбранные причины, план, отдельный квалифицированный funding и пригодные зоны; произвольный center finding автоматически в карточку не попадает. Значит, одного заполнения generic Fact или coverage недостаточно для работающего point consumer.

## Одна минимальная формальная поправка ROOT

**Предложение: документировать один дополнительный optional Fact kind/ключ facts.liquidation_model_centers, не менять Zone и Map.** Это одна совместимая типовая добавка к текущему Fact envelope; не новая обязательная стадия/карта или стратегический gate. Текущий contract-v1.2 остаётся неизменённым до решения ROOT.

Точный нормативный текст для добавления ROOT в CONTRACT_RU:

> liquidation_model_centers — optional Fact внешней модели, origin=ESTIMATED, basis_type=EXTERNAL_MODEL; предлагаемый envelope unit=MODEL_BIN_CENTER_BUNDLE обозначает только составной формат, не валюту и не конверсию. value.geometry=BIN_CENTER; value содержит только опубликованные центры и их модельные величины, native market identity, явные раздельные price/notional units, model lineage и model/base clocks. Центр не является Zone и не содержит придуманных lower/upper/width. Факт допускается только по отдельно квалифицированным identity/unit/clock/cost predicates. Он может давать явно подписанный native model context, но не заполняет liquidations.zones, не меняет map_mode/ready/automatic_eligible, не участвует в merge/confluence или построении входа/выхода. UNKNOWN base clock не становится FRESH из-за computed timestamp.

Минимальные **именованные поля** нового value; это предложение формата, не инстанцированный USABLE Fact:

| Поле | Требование |
|---|---|
| geometry | BIN_CENTER; не POINT_POSITION/INTERVAL |
| native_market | provider/family/venue/native_symbol/market_id с exact evidence. BingX target instrument_id в envelope — только после canonical join |
| price_currency, price_unit, price_unit_evidence_ref | Явно доказанная ось этого provider method; USDC_PER_HYPE допустимо только после принятия конкретного F597 inference/другого доказательства ROOT. Не выводить из modeled USD notional |
| centers[] | center_price, modeled_long_notional_usd, modeled_short_notional_usd, long_count, short_count по полученным строкам, с конечными значениями/исходным row ref. Никаких lower/upper/width |
| model_id/model_version, source_mode | Реальные lineage; неизвестная version=null, не подменять API version или snapshot clock |
| computed_ts, base_block_number, base_state_ts, base_time_status | Сохранить раздельно. UNKNOWN base_state_ts=null с явным статусом; block не переводить во время |
| coverage/limitations/evidence | Только опубликованный диапазон/корзины, неполнота и границы модели; исходный evidence_ref, provider dedup. Без обещания полного рынка/успеха |

Общие envelope поля event_ts/received_ts/expires_ts/status сохраняют действующие правила: event_ts может ссылаться на computed_ts лишь с явной семантикой MODEL_COMPUTED_AT; это не FRESH исходных позиций. Упаковка в Fact не закрывает P4/P5. До принятого bounded-base-age доказательства/действующей отдельной ROOT политики текущий UNKNOWN не повышается в usable current-position context. Нового TTL или разрешения игнорировать возраст BK не предлагает.

Для center-context барьер edges является **неприменимым именно к этой геометрии**, а не объявляется закрытым. Для существующих Zone/USDT/plan/confluence требования геометрии и сопоставимости полностью сохраняются. USDT-conversion не нужна, чтобы честно назвать native число; она обязательна, если позднее хотят сравнивать цену с BingX USDT reference/планом. Даже наличие FX курса само по себе не доказывает отсутствие межбиржевого basis.

## Что будет нужно для будущего consumer

После формального принятия ROOT отдельно согласует normalization/validator и одну именованную optional branch, которая сохраняет provenance и разрешает только описанный native center-context. Это зависимость будущей реализации, **не сделанная BK правка**. Нельзя просто ослабить selectZones, вставить center в Zone или протащить его как funding/OI. Layout/выбор числа строк/карточка здесь не меняются; отсутствие point-context по-прежнему не блокирует самостоятельную основную идею.

Одна допустимая смысловая подпись после закрытия предикатов: «0xArchive / Hyperliquid, внешняя модель: центр ценовой корзины … [доказанная валюта]; модельная величина корзины … USD». Это описание вида сведений, без цены из старого snapshot и без утверждения о текущих BingX позициях, притяжении цены, цели/сопротивлении, точном ордере или вероятности.

Невозможность закрыть exact canonical bridge, provider price-axis meaning, actual cost/admission либо возрастные условия сохраняет статус непригодности. Достоверный center semantic сам по себе эти пробелы не лечит. Существующий HYPE snapshot не публикуется/не освежается, baseclock остаётся UNKNOWN.

## Граница работы

Читались только текущие consumer/contract файлы и frozen F596/F597. Нового source search/docs/credit/native calls не было; private raw не переоткрывался/не копировался. Node/imports/tests/engine/HTTP/MCP/SQL/TG/deploy и code/card/contract/strategy changes —0. AUTO-summary privacy case не повторялся. Результат — один formal proposal; qualified routes/maps/550 coverage не повышены. Бюджеты/unknowns/reserves/9пауз/2OWNERdeferrals/старая пауза сохранены.
