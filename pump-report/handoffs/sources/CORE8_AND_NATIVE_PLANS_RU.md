# Восемь привязок и ограниченные native планы

Задание ROOT после OAuth владельца: небольшой доказанный crypto registry, точный max3 GET план object candles и отдельный бесплатный Swole route; source provider/SQL/TG0. Это законченный offline пакет документов/данных, не запуск отчёта и не заявление о пригодности свечей.

Authority main: `108a5dbdfc670d9a48fbf953811f5aa1b7bc2864`. Все guards/AGENTS/status/resume/window/phase/fence/generation/all4 прочитаны по этому SHA; all4 равны, fence inactive, generation latest-only. Собственная новая аренда: acquire commit `bf05ed532fe35ea4eb6bf11f748ef48c88eababf`, tree `d228e76c1174ef8a7d9910dc37da5e68c81a9759`, owner `CODEX:SOURCES:01a171fd:1792924622485`, expiry1792927922485; полный server byte/ref readback. Прежние аренды не оживлялись, ROOT owner1792924486000 не изменялся. Code checkout head остаётся PR639 `4b44d48836b9c26b1c9c8bb0830055ee279a608a`; нового source code commit нет, файлы пакета локальные. Контракт/профиль/код А не менялись.

## Малый registry

`pump-report/sources/registry-core8-retained-v1.json` SHA256 `d53dd25ad347a7fc9049cc1a48f1bb6af6c0b42c24a61c7d5297c761b72c27b5`.
Evidence: `handoffs/sources/evidence/SMALL_CRYPTO_PRIMARY_IDENTITY_V1.json` SHA256 `2f931d6fab2b3afcdfe62c2fcb7280bceb23dd5ea3fb5fb4977f6f8c9be36ea7`.

| Exact retained native contractId | Symbol | BingX name | Independent primary crypto identity |
|---|---|---|---|
|100|BTC-USDT|Bitcoin|[Bitcoin](https://bitcoin.org/en/faq)|
|101|ETH-USDT|Ethereum|[Native ether/ETH](https://ethereum.org/what-is-ether/)|
|100028|SOL-USDT|Solana|[Solana native SOL](https://solana.com/learn/introduction-to-solana-tokens)|
|100005|XRP-USDT|Ripple|[XRP Ledger cryptocurrency](https://xrpl.org/docs/introduction/what-is-xrp)|
|100035|DOGE-USDT|Dogecoin|[Dogecoin](https://dogecoin.com/)|
|100004|ADA-USDT|Cardano|[Cardano ada](https://cardano.org/what-is-ada/)|
|100085|BNB-USDT|Binance Coin|[BNB Smart Chain native BNB](https://docs.bnbchain.org/bnb-smart-chain/developers/quick-guide/)|
|100245|SUI-USDT|Sui|[Sui native SUI](https://www.docs.sui.io/develop/sui-architecture/tokenomics-overview)|

По каждой записи сверены: exact native tuple из полного retained catalog605854B/SHA256 `17e283eabf3c6bda448052b3925a8df4b52533990f698e92a1fca9138a0806ff`; конкретная BingX spot pair/name; собственная BingX price/coin-info страница с объяснением underlying; первичный документ проекта о crypto asset. Proof содержит URL, короткий точный rendered literal, область захвата и явное curator conclusion. Это не совпадение одного символа и не CoinGecko symbol/HTX join. В частности [BingX XRP explanation](https://bingx.com/en/price/ripple) связывает XRP с XRP Ledger; [BingX BNB explanation](https://bingx.com/en/price/binancecoin) раскрывает Binance Coin как native BNB Chain asset. Совпадение общего fallback BTC HTML не использовано: возвращённые пары и имена у всех восьми различны и соответствуют exact retained tuple.

Положительная классификация — **curated venue-scoped underlying**, через явно изложенную связь нескольких первичных документов. Это не exchange-issued token certificate, не проверка contract/mint, не разрешение переводов и не межбиржевая эквивалентность. asset_id остаётся BINGX_UNDERLYING:<base>. Specific perpetual страницы дали корректные product titles, но body — navigation shell; current rules не объявлены прочитанными. Currency semantics settlement AND margin подтверждена exact current docs-v3 catalog literal; реальная membership/status/правила требуют ROOT native readback.

По сохранённому snapshot:935 activeUSDT =8 малых доказанных underlying +2 owner-excluded PAXG/XAUT +925 UNKNOWN. Это не полный qualified universe. Current native verified rows0; current qualified crypto N=null. Старый полный inventory1/935 сохранён как историческая предыдущая проверка; новый registry расширяет только семь конкретных привязок. Никаких иных строк автоматически не включать.

Все candles qualifications по-прежнему пустые. COIN depth qualification относится только к смыслу явных bidsCoin/asksCoin; actual shape/T/цены/объёмы/ликвидность этим пакетом не проверены. Tick/quantity_step/multiplier=null. OI/funding/trades дополнительные qualifications не выданы. Все liquidation routes пустые.

Подключение ROOT: явно загрузить registry JSON и передать объект identityRegistry в существующий createPumpSources. Перед real getCore получить current admitted catalog и проверить совпадение contractId/asset/currency/status по каждой нужной записи; current статусы не брать из вчерашнего snapshot. Общие provider/whole/SQL/runtime admissions отдельные. Test broker ниже возвращает старый оригинал и не выдаёт current admission.

## Object candles: точный максимум3 дополнительных GET

`CANDLE_MAX3_NATIVE_PLAN_V1.json` SHA256 `e29783f84619a7e201c48982f16c75586e282b4f2ee408a912b9a89cc22dcd92` содержит параметры/шаги/stops/расходы.

Маршрут exact: `GET https://open-api.bingx.com/openApi/swap/v1/market/historicalTrades`. Параметры symbol=BTC-USDT,limit=100,fromId=<actual anchor>,timestamp=<host UTC ms>,recvWindow=5000. startTime/endTime/page/offset не документированы. Example500 противоречит maximum100 в таблице — использовать100. ID хранить строкой, не угадывать назад арифметикой.

Условная последовательность: первая page от известного actual pre-window anchor; при необходимости вторая forward page по документированному cursor/overlap; только после доказанной полной tape — один маленький UTC1m object-kline request с соседними метками. Максимум2 trade pages+1kline, без retries/другого coin/domain fallback. Если page1 уже закрывает окно, page2 пропускается. Нет полного окна за две page — STOP_INCOMPLETE, не третья trade page. Отдельная unseeded diagnostic alternative — лишь recent100, max1 попытка из того же max3, затем остановка при отсутствии anchor/full window.

Минимально недостаёт независимых qty/base и trade-time ms/event semantics; гарантии непропущенных последовательных fills и fromId inclusivity/order; actual pre-window anchor для выбранной текущей минуты. У текущего native spec generic quantity/turnover/time и fromId; полного минутного окна он не гарантирует. Видимые IDs/overlap/quoteQty≈price×qty и OHLC совпадение недостаточны. **До этих inputs план HOLD, дополнительный IO не разрешён этим документом.** Даже уникальное совпадение одной полной минуты — конечная empirical support, не нормативная гарантия всего route; соседние одинаковые свечи дают AMBIGUOUS. Не возобновлять общий исчерпанный docs поиск и не повышать candle qualifications из этого плана.

## Swole: один отдельный кандидат

`SWOLE_BTC_ROUTE_PLAN_V1.json` SHA256 `6914d1154d74ef4468a3903d1988f5dbdaa4059e01d6291a99d5619e7e6dcce7`.

Exact documented free route для проверенного BTC underlying: `GET https://swolecharts.com/api/liquidation-levels/BTC`, без ключа и range override, максимум1 попытка, deadline10s. [Developers](https://swolecharts.com/developers) явно перечисляет этот route; actual доступ/shape не проверены. Range defaults не квалифицированы. [Model methodology](https://swolecharts.com/methodology/liquidation-heatmap) — external model и relative intensity; не открытые позиции BingX и не фактические доллары.

В плане перечислены prerequisite поля: actual canonical provider asset mapping, model/version/source venues, original as_of ms semantics/age≤5min, bin bounds/sides, model-relative amount scale, source currency и свежий отдельный price-basis proof≤30s к BingX. Отсутствие currency/basis не заменять multiplier1. Actual body обязан соответствовать frozen A interface; при расхождении сохранить exact path/receipt и согласовать минимальный patch с ROOT до изменений. Документация не доказывает live schema, поэтому route **не активирован** в registry и не вызывается getLiquidations с фиктивными proof refs. Optional map остаётся nonblocking. Orderly/HL POST не подключались.

## Проверка и ограничения

Одна affected offline qualification `qualify-core8-retained.mjs` подключает новый registry к реальному замороженному createPumpSources с broker, возвращающим сохранённый catalog. Проверяет exact8/1278, исходные tuple/proof refs/hash, отсутствие current/candle/map grants и неизменность А. Вывод — `CORE8_RETAINED_OFFLINE_QUALIFICATION.json`. Это проверка подключения данных, не native provider или текущих цен. Принятые33 source tests и старые97+7 не повторяются.

SOURCES actual market provider HTTP0, SQL0,TG0,CF/deploy0. Были только documentation reads и own scoped GitHub CAS. Денежная стоимость connectors, native weights/latency/bytes и whole SQL стоимость неизвестны; не0. Потолки новых планов3 и1 — требования будущего отдельного ROOT admission, не grant из существующих5/164/manual24. Исчерпанные/unknown расходы не возвращаются. Старые9пауз, два OWNER deferrals, резервы и настройки не менялись. После фиксации проверки — only-own release; ни main, ни чужая аренда не изменяются.
