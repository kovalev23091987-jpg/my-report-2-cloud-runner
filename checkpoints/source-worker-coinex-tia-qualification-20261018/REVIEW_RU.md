# Один редкий кандидат TIA: точный следующий допуск CoinEx

По сохранённому оригиналу уточнена нативная ссылка CoinEx для TIA и подготовлена последовательность квалификации одного редкого кандидата. Текущих данных фьючерса,21 закрытой свечи и полного taker-окна этот пакет не получил. Запросы, SQL и подключение источника остаются недопущенными.

## Что действительно найдено

Оригинал38069197541/head1b719a4f5f982a4c3fc7014182c1a7c2a6713308 содержит ровно одну строку CoinEx `short_name=TIA`, `full_name=Celestia`, `website_url=https://celestia.org/`, `chain_name=CELESTIA`, `identity=utia`. Gzip SHA253b57dc7405555ac91580c89031d93e5e53518fa4d8698a155c78d87a373cbc, исходное тело SHA3179b70a3f6ad960e028b66f2f6f3365648633e9b5bbed109b83df59ebfa5604; его фактическое получение1791650973347 сохранено. Explorer в этой строке пустой, RPC/genesis-проверки нет.

Сохранённая HTX currency reference имеет TIA с `chainType=0`, сетью`tia` и без contractAddress; действующая native policy связывает TIA с`celestia` и доменом`celestia.org`. Это не только ticker/name. Сопоставляются native network namespace, тип нативного актива и официальный проект. Исходный transport clock HTX в этом fixture отсутствует и оставленNULL; контролируемые часы старогоCT replay не переиспользованы.

Новый недостающий первичный документ [Celestia: TIA overview](https://docs.celestia.org/learn/TIA/overview/) подтверждает, что`utia` — нативная staking denomination, миллионная доляTIA. Его точный content SHA9b63cb5c6b5558fce0c787284fe78ea78a04b684cdd33562316ce801b315cffc сохранён отдельно. `utia` не интерпретируется как EVM token contract.

Класс результата — **совместимая историческая native provider reference**. Это не текущее market binding, не onchain finality и не новый firstknown. Старое получение тела не превращено в время нынешней квалификации/события. Нативная denomination также не задаёт масштаб CoinEx trading amount/volume/value: нельзя умножать их на1e6 или переносить HTX multiplier.

Отдельный старый spot-каталог содержит TIAUSDT/TIA/USDT. Он не доказывает наличие, тип, эпоху или размер текущего фьючерса. Чужие LINK/AAVE trades и пустые старые candles не подменяют отсутствующие оригиналы TIA futures.

## Последовательность из условных пяти HTTP

Все формы запросов переиспользованы из принятого459. Новая часть — точное сопоставление native reference, конкретный TIA gate и разделение результата/расходов. Принятые447/459/489 и их тесты не запускались.

| Порядок | Запрос | Что допускает следующий шаг |
|---|---|---|
|0 | Без market calls: собственная новая live scope координатора и actual admission | Текущий зарегистрированный source pool, source/provider/IP/day/month остатки, main/manual/nextfull резервы, известный nativeSQL/R/W/finalizer план. |
|1 |`GET /futures/market?market=TIAUSDT` | Один активный linearUSDT perpetual с точными base/quote/status; отсутствующие epoch/multiplier остаютсяNULL. Identity ещё ожидается на шаге2. |
|2 |`GET /assets/info?ccy=TIA` | Свежая точная native-ссылка в связи с market row. Несовпадение/неоднозначность останавливает числовые запросы. |
|3 |`GET /futures/kline`, latest_price/15min/limit24 |21 contiguous closed native15m:20prior+1event, точные UTC IDs/grid/quote/epoch, исходные volume/value и проверка единиц. |
|4 | Тот же endpoint, latest_price/1min/limit40 | Отдельные15 минут native event endingE15 и sliding path endingE1; их объединённый диапазон15–29 минут. |
|5 |`GET /futures/deals?market=TIAUSDT&limit=1000` | Только одна ограниченная recent page с исходными clocks/decimal strings/IDs/side. `last_id` не передаётся, pagination отсутствует. |

При отрицательном market/native identity gate расход ограничен двумя первоначальными запросами; автоматического дополнительного identity endpoint/другого источника нет. Полный5HTTP — условная форма first packet, а не уже доказанная стоимость или разрешение его исполнить. Ключи, WS, spot, OI, retry и fallback не входят. Пример URL в`analysis.json` построен на явно контролируемом planning cutoff; это не текущий source timestamp и не выполненный вызов.

## Какие факты могут остаться ограниченными

Если volume/value scale не доказан, сохраняются raw strings и максимум отдельно пригодный OHLC-only информационный контекст. Аномальный объём не квалифицирован. Native candle start не заменяет provider-asof или transportreceived, а local cutoff не создаёт отсутствующий closed/freshness proof. Недостающие значения остаютсяUNKNOWN/NULL.

Минутные OHLC описывают структуру15-минутной свечи на минутной сетке; они не показывают порядок high/low или всех сделок внутри минуты. Одна latest1000 page может вовсе не перекрыть историческое событие или покрыть только его часть. Без отдельного доказательства completewindowtaker/trades нельзя объявить истинную сторону свечи, полныйCVD, снятие заявок, намерение участника, манипуляцию, поглощение или ловушку. Partial не превращается в нулевую активность.

Начальная история —BACKFILLED. Новый prospectivecase требует отдельного нового закрытия, своего source/received/firstknown, реального ingestACK и лага≤10минут. Existing HTX5m sampled watch сохраняет собственный venue/quote/basis и правила anchor/censor; он не восстанавливает внутрисвечную историю CoinEx.

## Реальный оставшийся блок допуска

На привязанных code snapshots043a3177d/07703e78 нет явной CoinEx политики в `evidence-source-adapters` и реализации в externalN05 collector. Это не полная инвентаризация deployed runtime/DB. Budget-reader читает **все** текущие UTCday daily rows (LIMIT128): существующая CoinEx row может попасть в вывод, хотя её policy cap останетсяNULL. Старый квалификационный source ID`N05_OFFICIAL_FLOW:COINEX`/provider`COINEX` сохранён для происхождения, но не объявлен текущим grant. Отсутствие записи не означает нулевой расход или свободную квоту. Новый`ANOMALY` alias не создан; документированный shared IP rate400/s не превращён в project/day allowance.

Текущие source/day/month/minute balances, зарегистрированный pool и полные nativeSQL/R/W границы остаютсяNULL. Coordinator/third repair reader не является live admission этого источника. Первое необходимое действие координатора после такой квалификации — получить точные актуальные market/native reference тела в собственной отдельно допущенной полосе; не использовать текущую offline-аренду, старый job или неизвестный остаток. Общий164HTTP, shared5N05/N12,18supplement, manual24,3500000R70000W и nextfull59000R920W сохранены.

Рабочая база043a3177d, exact main на получении lease07703e78; весь пакет guards/AGENTS/status/resume/generation/трёх доказательств07703 прочитан до изменений. Разница до рабочего snapshot — только уже принятые6 файлов489; общий код одинаков. Своя CAS аренда3bedbd4a, owner1792353455696, expiry21:17:35.696UTC, exact readback/fencefalse. Изменён только собственный checkpoint-префикс.

Новый audit проверяет исходные hashes, единственную TIA-строку, тип denomination, границы плановых окон и остановок. Это анализ реального оригинала/запроса, без новой runtime-системы или production imports. Рыночных HTTP/WS/nativeSQL/deploy/MAIN/Telegram0. Фактическое подключение,21closedbars, taker completeness, native budget и все семь направлений ещё не закрыты.
