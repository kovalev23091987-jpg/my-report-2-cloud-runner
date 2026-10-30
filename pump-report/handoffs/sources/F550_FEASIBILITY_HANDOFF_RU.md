# Фактическая пригодность источников при сохранённых лимитах

**BingX реально выдал обязательные исходные факты для одного SOL:** каталог, цену из пакетного ticker, точные закрытые24h, минутные свечи и стакан. Старый SOL-проход использовал5 provider-запросов, core был USABLE и day diagnostic usable. Это подтверждает работоспособность выбранных методов на этом инструменте в момент захвата. Это не проверка550 монет, не нынешняя свежесть, не готовый сигнал и не доказанная суточная производительность. Состав550 и операционный охват различаются.

Самый короткий следующий набор для ROOT — **3 новых BINGX чтения:** recent trades SOL, изменённый H125 SOL, полный bulk ticker для сверки сохранённых550. Численный остаток BINGX12 позволяет эти3 без увеличения cap24:12SPENT→15SPENT, останется9. Но **действующего исполнимого admission сейчас0**: предыдущий stage/expiry/allowlist не разрешают новые вызовы, а CONTROL5/5 и web metadata2/2 исчерпаны. Точный предварительный выпуск уже отдельно сохранён в `F550_MIN_NATIVE_PLAN_V1.json`; это главный файл для решения ROOT, не команда выполнить IO.

## Матрица выдачи

Полная матрица14 показателей, включая все единицы, часы, поля, byte/row guards, доказательства и gates: `F550_ACTUAL_SOURCE_FEASIBILITY_MATRIX_V1.json`. Точные receipt ID и provenance — `F550_NATIVE_RECEIPT_INDEX_V1.json`. Ни цены, ни объёмы, ни сырые ответы в пакет не экспортированы.

| Показатель | Точный метод / пакетность | Что реально подтверждено | Граница |
|---|---|---|---|
| Каталог / native tuple | `/openApi/swap/v2/quote/contracts`, весь список |1278 строк,934 activeUSDT в сохранённом ответе; contractId/asset/symbol/currency/status | Нет native crypto-type или multiplier из size/precision; это старый снимок |
| Цена / широкий preview | `/openApi/swap/v2/quote/ticker`, без symbol весь список | SOL price USABLE из bulk receipt | Полный payload550 не сохранён в SOL control; новая широкая сверка нужна. reported24h — предварительный признак |
| Основная цена / fallback | `/openApi/swap/v1/ticker/price?symbol=…`; затем symbol ticker | Успех bulk fallback-пути SOL; отдельный primary native clock не квалифицирован этим receipt | До2 попыток в худшем маршруте; новых primary-проб в минимуме нет |
| OHLC / рост5/15/60 / откат | `/openApi/swap/v3/quote/klines`, по symbol, limit125 | Native BTC125, старый SOL121; новый H125 wiring1PASS на контролируемых данных | Native time=OPEN_TIME принят владельцем по CCXT, не независимая гарантия BingX; новая SOL125 выдача ещё не получена |
| Текущий объём | Те же свечи, дополнительных HTTP0 | Сравнение одного native volume внутри того же инструмента/маршрута/интервала | BASE, USDT, multiplier и абсолютные dollar amounts не доказаны |
| Точные24h | Тот же kline, по symbol,1440 закрытых минут | Native BTC1440, SOL day diagnostic usable | Нужны обе границы/полная сетка; stale не становится свежим при скачивании. Стратегия OR допускает короткий рост; runner пока всё равно получает day |
| Спред / глубина / проскальзывание | `/openApi/swap/v2/quote/depth?limit=1000&symbol=…`, по symbol | BTC20 и SOL1000 уровней с каждой стороны; COIN-поля с принятой base-семантикой | Это ограниченная видимая глубина, не полный census; единицы каждого native scaled-контракта отдельно |
| Реальные сделки | `/openApi/swap/v2/quote/trades?limit=100&symbol=…`, по symbol | Первичная методика quoteQty и T3 producer6PASS; native ответа пока нет | ID и точный maker schema надо увидеть; mixed/buyerMaker-only UNKNOWN; выборка не полный5m tape |
| OI | `/openApi/swap/v2/quote/openInterest?symbol=…`, по symbol | Primary reference называет BASE; нынешние native/registry qualifications пустые | Нет usable native OI receipt в этом пакете; один numeric ответ сам не докажет единицу |
| Funding | `/openApi/swap/v2/quote/premiumIndex?symbol=…` | Документирован rate; reference допускает all-symbol batching | Source сейчас per-symbol; actual period и rate-event clock не квалифицированы, updateTime не заменяет их |
| Mark / index | Тот же premiumIndex | Документированы markPrice/indexPrice | Отдельные факты/consumer не подключены; новый сбор без потребителя не требуется |
| Будущая карта | `https://swolecharts.com/api/liquidation-levels/<qualified>` | Один native BTC ответ,4 model bins,0 пригодных карт | `usd` не доказан как долларовый notional; нет canonical identity/currency/venue/current mapping. Карта необязательна |
| Исход4h | Тот же kline по instrument/window | Код сохраняет original history и boundary ambiguity | Native реального4h исхода здесь нет;240/241 закрытый бар, request241/242. Не читать будущее и не собирать ночью |
| Устойчивость поддержки | Не подключена, profileOFF | Одного стакана недостаточно | Нет временного ряда заявок/исполнений; не заявляется как доступная функция |

## Что дают существующие receipts

SOL run `pump-j-integration-sol-20261025-one`, private wrapper SHA `14d8767e7ddd9144302a177bc3c91f66a0abadb7583c41da2b9c8884089dda53`:

- catalog `f7413dc3-2c0e-4615-9f73-df1da997dab2`;
- bulk ticker / price `04b3d8f5-c7bb-4e40-ba14-c9af47fb1ffe`;
- day `f0b1c6c7-5100-4817-878c-537172f1b090`;
- candles `767cc36e-ed8c-41a2-ae87-aa5b65a491ed`;
- book `f6aa506f-f82d-4d39-821d-9743194407d1`.

Свечи/стакан выполнялись параллельно; порядок reservation не используется для угадывания kind. Привязка проверена по exact fact IDs и порядку selected_facts/receipt_ids. Native ledger FINALIZED:77 SQL requests/70R/45W/unknown0. Весь control wrapper занял7431ms; это не latency отдельного API, не worst-case и не пропускная способность. Старый run целиком INCOMPLETE и ready=false; usable core/day не превращены в успешный сигнал. Exact price/book event clocks в control не возвращены: они не придуманы из capture time.

BTC day receipt `a6bf7659-19c6-41a9-8319-0b764550deda` подтверждал1440 закрытых минут в исходном захвате, теперь stale. Native Swole receipt `5113a908-f118-4f2b-875f-c6a913bde255` дал4 модельных бина; identity, currency/venue и цена сопоставления не квалифицированы. Новый повтор того же Swole запроса не закроет эти семантические пробелы, его не предлагаю.

## Внешние и внутренние лимиты

Сохранённый официальный BingX reference — commit `7b1c40d29c248b18fcf418767c8e49760d1f6ef0`, blob `e61be4746c5bd5475e556146448c79f4c58b064f`, SHA `fd667b1da678c2a74f6660fe4301562f0ef6b3cc8e736d9afe0694ac0709453a`. Для contracts/ticker/depth/klines/trades/OI/premium он указывает **1 запрос/сек на IP**. Это сохранённое первичное ограничение для соответствующего метода, не новое подтверждение сегодняшней квоты/общего IP и не обещание free monthly entitlement. Для exact v1 price, web simple-list и Swole внешние лимиты в выбранных доказательствах неизвестны. Их нельзя приравнять к внутреннему лимиту проекта.

Внутренний BINGX:1/s по поставщику, rolling10/min,900/day,27900/month,24 qualification attempts;12SPENT и2 старых HTTP UNKNOWN сохранены.164/run, hot96/background56/statistics12, manual24, protected day156,6 настоящих ручных проверок и native3.5mR/70kW не повышены. Source-описание B550486HTTP — только счётный план, не доказательство внешнего API throughput.

Обычный broker ограничивает ответ **2 000 000 байт**, timeout10s, redirects/retries0. Endpoint byte maximum обычно не документирован. Catalog/ticker имеют source guard20000 rows; kline vendor1440, core125; depth выбран1000/сторона; trades producer100, хотя reference допускает1000. Файл wrapper812308B или37115B не является размером исходного provider wire payload. BODY_LIMIT/timeout/неизвестный ACK не возвращают потраченную попытку.

## Минимальный новый native-план и настоящие остатки

`F550_MIN_NATIVE_PLAN_V1.json` задаёт точные три запроса, параметры, schema acceptance и clocks. Сначала recent SOL:1 попытка, cap24 не меняется,12→13SPENT/11remaining, TG0. Затем изменённые SOL125 и полный bulk ticker:всего3,15SPENT/9remaining. Если требуется новый **активный** universe, дополнительный contracts1 назван отдельно:всего4/остаток8. Проверка full bulk — наличие/дубликаты/часы символов, не массовая квалификация CORE или автоматическое заполнение registry550.

CONTROL5/5 подтверждён пятью отдельными FINALIZED reservations в свежем `NATIVE_QUALIFICATION_ACTUAL.json`, включая два503. Поэтому routeA для одного bounded3GET bundle требует явного нового **+1 CONTROL operation** (эффективно5→6), с неизменными прежними5, и отдельного native envelope; это не разрешено этим документом. Называть его LOOKUP/DAY/MAP или менять family/version ради обхода нельзя. BINGX provider budget сверху оставшихся12 при этом не нужен.

RouteB — новый **подлинный полный MANUAL acceptance** изменённой T3/H125/consumer/feature/queue цепочки, publish=false/TG0, в прежнем BINGX/USDT_M и дневном конверте, только после точной регистрации нового fixed acceptance ID и positive native admission ROOT. Это реальный полный разбор и сохранённые analysis/source clocks/receipts/readback, а не три probe с labelMANUAL. Старые IDs/SPENT/control5, история и6 production-manual reserve сохраняются. Если анализ NOT_READY, optional trades не вызывается: результат честный, но trade gap не закрыт; нельзя принудительно объявить ready. Конкретная альтернатива/число вызовов и SQL-конверт5000R/300W/max800 находятся в минимальном JSON. Измеренная стоимость новой сборки неизвестна.

Старые_SOL5 не предлагается повторять ради семантики. Полный нынешний pilot6GET с freshbook/day есть в расширенном плане только при отдельной необходимости genuine connected current CORE; приоритетное предложение сейчас3 изменённых/неисполненных чтения. OI/funding/map/support в минимум не добавлены. Реальный due outcome — отдельное будущее событие, не немедленная проверка «через4h» без времени/сигнала.

ROOT сообщил, что minute forecast и guarded wait до overview/day/core уже реализованы локально,2 новых controlledPASS; старые12SPENT→22 в synthetic ledger безreset. Это **локально квалифицированный ROOT код**, ещё не native/deploy и не внешний rate-limit тест. SOURCE его не пересобирал и не повторял. Main6b7c750b содержит общий frozen пакет; новый45-module Worker только собран локально, сервер по824c остаётся39-module. Для следующего реального вызова нужны exact runtime artifact/readback и фактический admission; не считать эти состояния одним.

## Category simple-list: польза и необходимый новый бюджет

Exact GET: `https://api-app.acc-de.com/api/coin/v1/quotation/simple-list?bizType=20`. Сохранённый официальный клиент связывает PERPETUAL_U20 с этим методом, TradFi22 отдельно, standard futures10 отдельно. Это перспективный один market-set ответ для положительного экономического контекста и same-venue bridge, **если** фактические поля/полнота это позволяют. До ответа не обещается, что он содержит contractId/полный native universe или охватывает все550. Полный список может быть отфильтрован, неполон либо превышать2 000 000B; после одной попытки нет автоматических страниц/повторов.

При code0/result[] проверять raw поля и уникальность, точное имя/символ BingX к native catalog, product/currency/venue context, intersection/missing/extra/ambiguous. Разные contractId/coinId — разные пространства сущностей, не доказательство mismatch. quotationId нельзя объявить contractId без доказательства его смысла. Exact unique name bridge одной биржи учитывается; универсальный coinType enum не придумывается. Gold/BTCETH исключаются отдельно, Unicode/4STOCK/SPX/STONK не запрещаются по названию. Один такой ответ не даёт issuer/chain certificate, multiplier, units, свежую книгу/ликвидность или все CORE-факты550.

**Сейчас web-metadata остаток0:** bare1 + signed1 =2/2SPENT. Минимальный новый бюджет — **+1 HTTP того же BINGX_WEB_METADATA**, с сохранением2 прежних попыток, новым exact path/URL и одноразовым operation ID. Для нынешних gates это явное увеличение эффективных daily/monthly/qualification caps **2→3**; скрывать это новой family/version или переносить запрос в остаток BINGX REST12 нельзя. Сам лимит project900 повышать не нужно, но +1 должен поместиться в фактический общий ledger/резервы и отдельный nativeSQL operation slot. Это предложение ROOT, не внесённое изменение лимитов и не допуск.

Альтернатива при нулевом новом бюджете — categoryGET0: оставить saved934+5673 и принятый практический scope550 с явным выводом по экономическому контексту; оставшиеся BINGX12 использовать для выбранных реальных источников. Полная native completeness550 остаётся недоказанной. Новый UTC-day не возвращает месячные/qualification2SPENT и unknowns. Request signer обязан подписывать query `{"bizType":"20"}`, а не старый display-info payload `{}`; старую pinned фабрику/путь не менять молча. Anonymous category acceptance тоже ещё не подтверждена.

Пакет даёт14-строчную feasibility-матрицу, конкретные receipts, минимальный fixed план и честные недостающие допуски. Новых marketHTTP/docs/search/SQL/TG/deploy0; source code, caps, паузы и2OWNERdeferrals не менялись. Выполнена только новая проверка целостности сохранённых metadata/пинов/арифметики планов, старые6/4/8 и целый аудит не повторялись.
