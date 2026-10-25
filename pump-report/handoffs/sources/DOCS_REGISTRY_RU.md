# Первичные доказательства и один реальный BTC registry

Это следующий пакет после А: документация и сохранённые доказательства. Новых market API/SQL/TG нет. Native/grants/стоимость/весь каталог не объявляются подтверждёнными.

`pump-report/sources/registry-btc-v1.json` содержит реальную сохранённую привязку contractId100/BTC-USDT/BTC/USDT, не synthetic fixture. Original catalog605854B / SHA256 `17e283eabf3c6bda448052b3925a8df4b52533990f698e92a1fca9138a0806ff`, один exact tuple проверен повторно по полным сохранённым байтам. Исторические original LAST87B/SHA `a2574a7a95d17987a845a3972083abc6fd89cac455206a69e59111dbcbf4baec` и candles684B/SHA `25070e6f41c376f11a3717fea1d451111a90d405535eaea139999ed29cad4034` также полностью сверены; в новый пакет не копировались raw цены/объёмы. Фактические свечи: шесть OBJECT rows с полями open/close/high/low/volume/time, сетка60s. Сетка не доказывает open-time или volume unit.

Identity основана на retained ROOT_BTC_NATIVE100_BITCOIN_CURATED_V1, конкретной [странице Bitcoin BTC/USDT](https://bingx.com/en/spot/BTCUSDT) и [правилах exact perpetual](https://bingx.com/en/tradeInfo/perpetual/contract-rules/BTC-USDT). Старое прямое открытие rules было navigation shell; margin basis остаётся явно указанным выводом из documented USDT-margin product/native currency/indexed settlement. Нового current rule readback нет. asset_id — venue-scoped BINGX_UNDERLYING:BTC; cross-venue/token equivalence не выдана. Перед использованием нужен новый допущенный каталог с exact100/assetBTC/currencyUSDT/status1. Весь status1 universe не классифицируется.

## Docs evidence

Повторно проверен полный сохранённый официальный static asset `https://bingx-api.github.io/docs/static/js/app.4dcba784df17c52faa47.js`, 1563628B, SHA256 `77094f2a99bdca9c1b8e41a260c3657a6ed6b8febe30818b486cb54fe0b14d8f`. Сохранённые literal sections скопированы рядом в evidence/ только после hash и проверки их точного вхождения в полный asset; JavaScript не выполнялся.

| Тема | Точный literal / SHA256 | Вывод |
|---|---|---|
| Depth | evidence/depth-doc.literal.txt / b4354f42e96becac9e68e9e3ce41b1869dfb60d4e7810a74d846b36fe2d3da9a | bidsCoin/asksCoin явно описаны как количества coin. Qualification registry относится только к этим полям. Для standard bids/asks единица не доказана. T — native system ms. Реальная текущая frame/shape ещё не получена |
| Object klines | evidence/kline-doc.literal.txt / 790e99ad10ae90084107df8317357bf4db4ccd9c0013a8320d22049184fa5b8c | time описан только как kline timestamp ms, volume как transaction volume. Open-time/base-versus-contracts **не закрыты**; qualifications.candles пустой |
| Ticker | evidence/ticker-doc.literal.txt / 892dce78644020cb8bdcfb3808e19e760dfa7c2a29dcb269f0d26347e765dbf8 | openTime/closeTime относятся к первой/последней сделке внутри24h, quoteVolumeUSDT. Это не автоматически цены в точных t−24h/t. Нельзя менять часы на received |

Текущий [API AI reference](https://github.com/BingX-API/api-ai-skills/blob/main/skills/swap-market/api-reference.md), Git blob `e61be4746c5bd5475e556146448c79f4c58b064f`, описывает kline как array с open/base volume, что расходится с native object literal и реальной сохранённой формой. Его утверждение OI base-unit также не снимает расхождение с native spec. LAST.time описан как matching-engine ms и совпадает по полю с сохранённой формой. Reference не используется для автоматического повышения object candle units/time.

В [rate-limits](https://github.com/BingX-API/api-ai-skills/blob/main/skills/references/rate-limits.md), Git blob `85d46b5198f61d3eae8329c66963b9eae13481c4`, разделены UID rate и IP group identifier. Поэтому аннотация1/s/per-IP из market reference и group1/500-per10s не становятся готовой текущей policy. Сохранённый native asset содержит UID5 и group1 для depth/contracts/ticker, UID5/group2 для v3klines; эти поля документальные, не тариф/проектная квота/измеренные weights. ROOT должен задать отдельные conservative caps/reserves и общий backoff, включая HTTP200/business100410. Timestamp policy тоже расходится: native tables требуют timestamp; текущий AI reference считает его optional для core. Перед native ROOT должен выбрать явный документированный request shape и сохранить его; source outbound timestamp нельзя принимать за event_ts.

## Ограниченный план native проверки для ROOT

Ничего ниже SOURCES не вызывает. Только после actual whole/provider/SQL/runtime admission, по одной BTC и с исходными receipts/hash/clock/cost.

Начальный потолок **5 GET** без автоматических retries/domain fallback:

1. `/openApi/swap/v2/server/time` — границы skew с host clocks, не часы всех фактов.
2. `/openApi/swap/v2/quote/contracts?symbol=BTC-USDT` — exact100/baseBTC/currencyUSDT/status1; отсутствие параметрической фильтрации не переименовывать в qualified whole N.
3. `/openApi/swap/v1/ticker/price?symbol=BTC-USDT` — LAST.price/time, bind source≤received, возраст≤30s.
4. `/openApi/swap/v3/quote/klines?symbol=BTC-USDT&interval=1m&startTime=...&endTime=...&limit=121` — фактическая object shape/grid/closed prefix, raw volume и time semantics не угадывать.
5. `/openApi/swap/v2/quote/depth?symbol=BTC-USDT&limit=1000` — два coin-поля, T≤received, bid<ask, положительная base quantity. Размер1000 запрашивается только в допущенном response/CPU конверте; при меньшем cap явно ограничить охват ликвидности.

Не использовать size=0.0001 как multiplier и не выводить единицы из отношения одной пары уровней. Просить core только после последнего depth, чтобы book≤15s. Строгую текущую скорость задаёт ROOT; single request success не доказывает quota.

Если object candle semantics не закрыты документацией, этот начальный проход остаётся INCOMPLETE. Отдельный последующий максимум **3 GET** может сопоставить одну законченную минуту с полным bounded historical-trades окном и повтором той же kline: нужны event-time сделок, независимые base/quote units, доказательство полного охвата окна и совпадение OHLC/volume. Один ответ trade-limit без доказанной полноты и равенство объёмов1m/3m сами по себе недостаточны. При неоднозначности — UNKNOWN и точный недостающий input, без расширения в массовый сбор. Параметры historical-trades нужно сначала закрепить по его exact native spec; маршрут не добавлен в source как действующий.

## Swole и остальные карты

[Developer page](https://swolecharts.com/developers) сейчас описывает бесплатный доступ без обязательного ключа, endpoint liquidation-levels/<coin>, attribution/cache requirements и отсутствие SLA. Для перечисленного metered history/export набора указаны30/min network и120/min key; liquidation-levels не входит в этот список, но это не проектный безлимит. Live доступ из рабочего runtime не проверялся. Source route остаётся bounded/optional, с собственным admission ROOT.

[Methodology](https://swolecharts.com/methodology/liquidation-heatmap) объясняет расчёт по OI/цене/объёму, распределение расстояний по наблюдениям Hyperliquid и проверку модели на Bybit. Номинальные USD модели завышают реализованные суммы; смысл величины — относительная интенсивность. Это не открытые позиции BingX, не гарантия полной карты и не точные доллары. Конкретный asset/market/time/basis должен сохраняться; одного тикера недостаточно. Бесплатность docs не доказывает доступность текущего API.

Orderly и native HL сохраняют статус NOT_CONNECTED_POST_CONTRACT. Нужны отдельные body-support broker контракт, qualified endpoint/policy/asset mapping и реальная проверка страницы/выборки; POST самостоятельно не запускался. Это не отсутствие данных у провайдера.

Firecrawl три чтения отказал до получения страниц из-за credits; повторов/покупок не было. Обычное web-чтение получило две страницы Swole; static JS новым веб-чтением недоступен, поэтому native literal evidence честно опирается на полностью сверённые сохранённые байты, а не на заявление о новом download. Численные расходы этих documentation connectors не выданы за0; рыночных HTTP/SQL/TG SOURCES0.

Расширение registry: только отдельный exact native tuple + независимая underlying/venue/family/settlement evidence; неизвестные строки unqualified, aliases/multipliers отдельно, units по каждому полю. Сохранить proof locator/hash/version и current catalog observation. Никакой автоматической классификации остальных935status1 или переноса старых HTX mappings.
