# SOURCE T: trades literal и corrected metadata snapshot join

Конечный связанный offline-пакет. Новых provider/SQL/TG/deploy0; source production-код не менялся. Trades primary literal оказался недостаточен для пригодного исполнения блока2, поэтому пустой parser/framework и новый HTTP не добавлялись. Corrected metadata API реально доступен, но типы underlying и canonical bridge ещё не квалифицированы. Старые frozen пакеты9b4fe68/c1a556/00170ce не переписаны.

## Corrected metadata: что доказано

ROOT supplied private `/private/tmp/pump-corrected-metadata-actual.json`, fileSHA25666c3afe4e3f2d967050fdfbb34fb09741b4612780f1ba264cf504410dc0a3cf9. Original control-response rawSHA07c2af588d54cd8633b020f05308152abd6691d36f2f4961b5d9a35f9c3c8f12; ROOT normalized responseSHAfb6f7cd100a0b2d3a5a9a537b81fba632f1c732de397c07493014a51d7d03f63. Эти разные hash scopes не подменяются друг другом.

HTTP200/businesscode0, путь **body.response.data.data.result**,5673 rows, уникальны5673coinName и5673coinId. У всех есть coinId/coinName/coinDisplayName/coinType/coinIconUrl; rawcoinType целое, explicit property. Распределение0:3788,1:2,2:100,3:3,4:888,5:889,6:2,99:1. searchResult — booleantrue. Receipt9c3ba708-0e31-4ebb-b128-3c09ba22cb8b; provider metadata response timestamp1792945802180, original broker received1792945802427. Это response metadata time, не событие цены/актива и не per-asset freshness.

Все934 exact native tuple сохранённого activeUSDT каталога получили уникальный case-sensitive **именной кандидат** native asset=coinName, без transliteration/strip/case folding.554rawtype0 и380rawtype5. Native catalog membership capture1792931870932 старшеmetadatareceived на13931495ms: это snapshot join, не fresh live catalog/market coverage.

## Что не доказано и потому не повышено в квалификации

В12 сохранённых JS нет установленного определения именно этого coinType enum или canonical OpenAPI contractId↔display coinId bridge. Consumer `coinId:d.id||""` не соответствует фактическому rawfieldcoinId; consumer `coinType:d.coinType||0` содержит fallback0. Фактический explicit0 тоже нельзя назвать crypto без значения enum. Отдельная найденная карта quotationType1forward/2indices/3commodities/4forex/5stocks относится к другому полю, её нельзя переносить на coinType.

ID-пространства различны: BTC coinId1 против native contractId100, ETH242 против101. Есть2 численных совпадения IDs, но оба относятся к другим native asset; это не bridge. Совпадение имени служит поисковым кандидатом, а не запрещённым ticker-only proof.

Классификация осталась:13 ранее verifiedcrypto,2 ранее доказанных gold-backed исключения,919UNKNOWN. Внутриtype0 —13knowncrypto/2gold/539UNKNOWN; type5 —380UNKNOWN. Новых promotions0 и новых exclusions по имени/type5 нет. Owner BTCETH excluded2 внутри13, delivery-eligible11. Full cryptoN=null; значение552 не объявляется. Масштабные1000... native symbols/contractId/base сохраняются точно; factor/true-underlying-price/execution units UNKNOWN. Новым строкам не копируются qualifications13curated. Один nonASCII coinName во всёмmetadata не исключается по языку и не становитсяcrypto без type/bridge proof.

Полная нормализованная934-row audit matrix: `T_METADATA_934_SNAPSHOT_JOIN_V1.json`; metadata evidence/status/gaps: `T_CORRECTED_METADATA_ACTUAL_REVIEW_V1.json`. Экспортированы только необходимые идентификационные метаданные/часы/покрытие; исходные полные ответы/ценовые значения не копировались. Для новой классификации нужен один конкретный primary evidence bundle: официальный смысл coinType плюс authoritative mapping display identity→native contract/asset, с отдельной scale qualification где нужна. Новых запросов/допусков здесь нет.

## Trades: positive поля до любого patch

Сохранённый официальный `historical-trades-docsv3-current.literal.txt`, SHA8bb60afd6eafb6496ad86941330ce27b20b383f135a61c3aa2572cf5a5ef6dc9, endpoint GET/openApi/swap/v1/market/historicalTrades:
- price — string, transaction price.
- id — string, transaction ID.
- isBuyerMaker — boolean: покупатель является maker, true/false. Это положительно описанная роль; aggressor-side/absorption/intent не выдумываются.
- qty — string, transaction quantity, но BASE/CONTRACTS/multiplier не указаны.
- quoteQty — string, turnover, но explicit quote currency/notional semantics не указаны.
- time — int64, transaction time, но единицы именно response time не указаны. Request timestampms и13-digit sample не переносятся на это поле.

Параметр fromId означает начало с transactionID/defaultlatest, но direction/order/page-completeness не доказаны. Таблица limit default50/max100, пример payload500 — конкретное расхождение;100trades не становятся полной5min/15min историей. start/end time params вliteral отсутствуют. Полевая проверка и точные byte spans — `T_TRADES_LITERAL_QUALIFICATION_V1.json`.

Для полезного блока2 «цена+исполненнаясумма+время» не хватает positive executed-amount units/notional и response clock qualification. SourcegetOptional честно остаётся NOT_CHECKED/BINGX_TRADE_ROUTE_NOT_QUALIFIED. Вызов с заведомо непригодным результатом ради framework запрещён поручением ROOT и не добавлен. Native trade tests0, старые батареи не повторялись.

## Условное влияние будущего trades на общий бюджет

Current optional_http_upper_bound2 **не менялся**. Только после qualification и согласования ROOT одинtradepage дал бы optional3 и+1HTTP на проверку; пагинация сP страницами пока не измерена/не допущена. Полный холодный manual сDAY в прежнем worst scope:11BINGX +1Swole +1TG =13HTTP. С однойtradepage:12BINGX +1Swole +1TG =14;6manuals=84, ещё6outcomehistory=90. Общая формула: BINGX66+6P, immediateall78+6P, с6laterhistories84+6P. P=1 не доказывает полноту flow. SQL/CPU/time/bytes native-six envelope остаётсяunknown. Никакие164/run,900/day,96/56/12,manual24,50deep,map8/native4,SQL3.5m/70k,nextfull59k/920/reserves не повышались.

## Расходы, owner exclusions и authority

Correctedmetadata1attempt CONFIRMED SPENT, native11requests21R8W0SQLunknown FINALIZED. ROOT latest cumulative metadata2of2SPENT, provider22, native365requests761R235W0SQLunknown; прежние2providerUNKNOWN сохранены. SOURCE новыхHTTP/SQL/TG0. Доступность исправленной factory на сервере не является positive type enum/bridge и не восстанавливает старый grant.

Latest owner literal: **«Фьючерс на валюту также не нужен никакой»**. Только positive cryptoUSDTperpetual любого алфавита; FX/fiat, stocks/tokenizedstocks, metals/gold/gold-backed, commodities/noncryptoindices исключены. USDT/status/тикер/язык не positive crypto evidence.9пауз/2OWNERdeferrals не снимались.

Acquire main67892c0..., own06060954... сFULLreadback. После ROOTrenewal fresh maincc42a97.../all4/fencefalse/generationlatest-only прочитаны; ROOT явно подтвердил продолжение действующих offline scopes. Собственная boundedlease не продлена; closing receipt оформляется отдельно. ROOT интегрирует только этот audit/required-input пакет; source index/runtime/provider/registry не патчились. Реальная полная приёмка отчёта остаётся открыта.

