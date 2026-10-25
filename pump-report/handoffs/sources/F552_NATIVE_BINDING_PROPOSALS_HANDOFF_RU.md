# F552 — точные native bindings для сохранённых550, без автоматической активации

Генератор построил **550/550 согласованных предложений**,0 конфликтов сохранённого native tuple,0 автоматических VERIFIED_CRYPTO. По умолчанию resolver сохранил старые13 записей;11 из них входят в выбранный scope. Остальные539 — **не активированные предложения binding**, не539 неизвестных классов активов и не измеренное свежее покрытие. Никакой native/provider/SQL/TG операции не было.

Точный результат: `F552_PROPOSED_NATIVE_BINDINGS_550_V1.json`,1792804B, SHA256 `a1d1d8b96f6cf7106ba4224e1fbf4fe52059f4448cc4667e0332976b692eb66c`. Он компактен намеренно; все550 tuple/proposal ID/основания/неизвестные единицы сохранены. Генератор — `build-f552-proposed550-bindings.mjs`; pure API — `sources/native-binding-proposals.mjs`. Файл содержит только instrument metadata и предложения; private цены/объёмы/сырые тела не копировались.

## Что именно доказано сохранённой связкой

На каждую строку сверены exact native contractId/symbol/asset/currency/status из catalog snapshot и тот же contract_id/symbol/native_asset/metadata_coin_name из принятого selected economic scope. Native symbol=asset+`-USDT`, currencyUSDT иstatus1 относятся к исходному захвату. Смысл currency как settle AND margin опирается на сохранённый официальный catalog descriptor, PERPETUAL — на exact swap contracts method. Crypto underlying — отдельный принятый экономический вывод U3, а не поле native catalog и не универсальный coinType enum.

Это устанавливает историческую **same-BingX связь native-инструмента с выбранной строкой**. Числовое отличие contractId/coinId не ошибка: coinId не используется как contractId. Это не issuer/chain certificate, межбиржевая тождественность, текущая active membership, доказательство live clock/ликвидности или единиц исполнения. status1/launchTime старого ответа не обновлены до настоящего времени.

Исходные pins:

- catalog wrapper `7b683509fea9d5b3aa1d2612ddb8ad259680a3bc33cc4df5cc97f23b4555e9f5`, receive1792931870932;
- economic934 `540111a3d30a4a76064b1124a8d904864a4c52f051642f75e83cbc3ca0559057`;
- selected550 symbols `5e5610a579142fd19d2448b4d1834fe75498b8b4263ea41435ebd71b52b31920`.

Каждый proposal ID хеширует exact tuple и proof context. Crypto acceptance/classification не создаётся хешем. Несовпадающие или повторные native ID/symbol, отсутствующий/повторный economic row, неверныйasset/currency/status, unselected row и owner-excluded asset дают BLOCKED_SAVED_BINDING. Положительные остальные строки сохраняются, нет повторного объявления всего списка919UNKNOWN.

## Поле → proof → существующий consumer

| Поле / решение | Proof и реальная область | Consumer / что остаётся недоказанным |
|---|---|---|
| native_contract_id | Exact catalog.contractId, единственность ID и symbol | `getCatalog` сравнивает ID с native row; это ID контракта, не coinId/chain address |
| native_symbol/base | Exact catalog.symbol/asset и selected row; alias/display не используется | Request symbol и source row match; Unicode не нормализуется,1000PEPE остаётся1000PEPE |
| instrument_id | `BINGX:USDT_M:<nativeID>:<nativeSymbol>` | Registry key, broker candidate_id, candle comparison key; никакой подмены соседнего native ID |
| asset_id | `BINGX_UNDERLYING:<nativeAsset>` | Venue-scoped identity; не CA и не одноимённый актив другой биржи |
| PERPETUAL/USDT settle+margin | Exact method + catalog.currency + primary descriptor9d9da782… | `assertInstrument`, registry/getCatalog gate; не доказывает crypto nature/underlying multiplier |
| Economic crypto scope | Selected true/INCLUDE_CRYPTO_SCOPE, exact metadata coinName и сохранённое U3 inference basis | Только proposal/review. `PROPOSED_ECONOMIC_SCOPE` не проходит `assertInstrument` |
| classification_status / identity_evidence_ref | Только отдельное уже принятое ROOT per-tuple classification decision | Generator не назначает VERIFIED_CRYPTO; исходный draft ref:null |
| Price | Native identity+положительная actual price+exact source symbol/clock/freshness | В source нет отдельного `qualifications.price` token. После ROOT review применяется существующий parser; единицы цены относятся к native price-base, префикс1000 не делится на1000 |
| Relative candles | Существующий owner-approved factory, CCXT basis/ownerblob8004c6b4…; exact native instrument | Только after-reviewed `createNativeRelativeCandleQualification`. time consumerOPEN_TIME, volume UNKNOWN_NATIVE, сравнение того же route/field/interval |
| Closed125 window | Согласованный profile60+5+60 и H125 | Не становится данными от одного binding: actual closed grid/clocks/coverage проверяются producer; H125native receipt ещё не заменён предложением |
| Orderbook quantity | Из этой saved tuple/economic связки НЕ следует | Новые reviewed price-relative entries не получают orderbook qualification. Нужны применимое поле/единица/scale и native clock/shape |
| contract_multiplier | Catalog.size не квалифицирован как multiplier underlying | null;1000 в имени не формула; SOL коэффициент/units не копируются |
| price_tick/quantity_step | Precision/min quantity не дают автоматически исполняемый шаг | null; `10^-precision`/tradeMinQuantity как step не выводятся |
| OI/funding/map | Нет отдельного unit/clock/period/identity proof в этом генераторе | Для новых записей их qualifications/routes не добавляются; старые13 остаются точными |
| current membership / full CORE | Новый каталог/live native данные отсутствуют | NOT_CHECKED_HISTORICAL_CAPTURE/full_CORE_qualified=false; lease и proposal не native admission |

Машинная таблица того же соответствия — `F552_FIELD_PROOF_CONSUMER_MATRIX_V1.json`.

## Предлагаемый API и существующий resolve seam

`generateSavedNativeBindingProposals({native_rows,scope_rows,expected_symbols,evidence,sha256})` возвращает proposal bundle; никакого live IO. Все draft instruments имеют `classification_status:'PROPOSED_ECONOMIC_SCOPE'`, identity ref:null и execution values:null. В текущий Source assert они не принимаются.

`createProposalAwareIdentityResolver({existing_entries,proposal_bundle,reviewed_entries=[]})` — синхронный seam для существующего `identityRegistry.resolve`:

- `resolve(query)` по умолчанию возвращает только неизменённые old entries. Проверяются все переданные tuple поля и native_contract_id/family; ambiguous match возвращает null.
- `resolveProposal(query)` возвращает отдельное предложение/причины, включая blocked запись. Это метод анализа, Source его автоматически не вызывает.
- `reviewed_entries` принимаются только с **уже ROOT-classified instrument**, nonempty identity evidence, exact tuple и `binding_review{proposal_id,decision:'ROOT_REVIEWED_NATIVE_SCOPE_PRICE_RELATIVE_ONLY',decision_ref,classification_evidence_ref,catalog_file_sha256,economic_scope_file_sha256}`. Это данные явного ROOT review, не булев caller-grant и не доказательство происхождения сами по себе. ROOT отвечает за содержание и authority этой записи.
- Новому entry добавляется только factory-generated candles qualification, native_base/family и пустой map route. Переданный copied SOL orderbook/OI/funding/map scope отвергается; nonnull multiplier/tick/step и cross-venue claim вне этой области отвергаются. Нельзя заменить existing entry тем же ID; old13 не переписываются.

`proposeReviewedRelativeCandlePatch({proposal,reviewed_instrument})` материализует конкретный candle patch только для уже отдельно классифицированного instrument. Сам он не создаёт classification decision, не обновляет membership, не выдаёт provider/SQL/runtime admission. Полученный comparison key строится из **этого** ID/symbol, а не копируется из SOL. Time basis — owner-accepted CCXT, не новая независимая гарантия BingX; BASE/USDT суммы из volume не возникают.

ROOT может передать overlay объект в существующий `createPumpSources({identityRegistry:overlay,...})` после своего решения. Без reviewed additions число owner-eligible resolve остаётся11. Source index/shared registry/runtime этим пакетом не изменены. Исторические old13 evidence и receipts не заменены U3 или proposed rows.

Для price/relative-only ступени нужно пользоваться существующим getOverview либо `getCore({only_facts:['price','candles']})`. Полный default getCore также запросит book и затем вернёт непригодную книгу при неизвестных units; такой GET нельзя считать необходимым или успешным только потому, что550 identity proposals существуют. Full runner/liquidity-ready для новых строк требует отдельной unit qualification. Это важная граница budget/coverage, не ослабление обязательного блока ликвидности.

## Unicode и числовые имена

Нативные ID/symbol/asset сохраняются буквально. BNLIFE/HAJIMI имеют китайские display names, они сохранены как display, не превращены в другие symbols. Отдельный controlled native Unicode symbol также проверен.1000PEPE/1000000MOG/прочие числовые префиксы не снимаются и не используются как quantity/price multiplier.4STOCK/SPX остаются selected economic scope по принятым основаниям; слово stock/index не формирует blacklist. Gold/BTCETH отрицательные owner exclusions сохраняются отдельно.

## Проверка и состояние

Один новый targeted case:1PASS/0FAIL, duration76.302542ms. Проверены exact binding, разные пространства ID, Unicode/display alias,1000 unknown units, сохранность13, default resolver refusal новых записей, настоящий source catalog seam на controlled broker, explicit review/tuple-bound refs, candle comparison key, отсутствие copied execution qualifications, native duplicates/status/proof mismatches и blocked diagnostics. Первая версия этого же case сохранена; после исправления только просмотра blocked proposal по symbol выполнен узкий повтор. F551/F550/T3 и старые6/4/8 не запускались.

Генератор один раз создал реальные предложения550 на сохранённых pinned metadata:550proposed/0blocked, default scope resolved11, auto promotions0. Это не native market run и не полнота данных550. Стратегия/капсы/unknowns/резервы/9пауз/2OWNERdeferrals не изменены. Raw provider/API/SQL/TG/deploy0.

Точный пакет — `PACKAGE_F552_PROPOSED_NATIVE_BINDINGS_FINAL_V1.json`; own lease/readback и closing receipt рядом. F551 frozence04d97b и его API/CLI не переписывались; ROOT-added body_bytes/old receive measurement остаются отдельным broker evidence, wire bytes по прежнему неизвестны без измерения.

## Дополнение ROOT: exact negative TradFi380 и минимальный index API

Старый getCatalog называл каждый отсутствующий в registry TradFi CRYPTO_ASSET_IDENTITY_UNQUALIFIED, и runner видел unresolved даже после550 positive bindings. Новые `saved-nontarget-decisions.mjs` и `F552_KNOWN_NON_TARGET_380_V1.json` дают380 exact отрицательных решений:363stock/ETF,8index,8commodity/metals,1FX. OwnerGold/BTCETH правила ими не заменены. Это предложение, не активное изменение.

`generateSavedNonTargetDecisions` использует frozen negative scope_reason+original basis и точное совпадение contractId/symbol/asset/currency/status. Название, язык, NC-префикс и coinType не классифицируют новую строку. `createExactSavedNonTargetClassifier({decision_bundle}).resolveCatalogDecision(nativeRow)` возвращает решение только при совпадении всех5полей; изменённый tuple или новый похожий ряд возвращаетnull/UNKNOWN.

Предлагаемый index patch проверяет `isExactSavedNonTargetDecision` и ставит KNOWN_NON_TARGET_EXACT_SAVED_TUPLE только при отсутствии positive entry. Невалидное решение или противоречие positive/negative дают существующий CATALOG_REGISTRY_IDENTITY_MISMATCH и остаются unresolved. Duplicate native row не пропускается. Поэтому старый runner4-reason filter менять не нужно; неизвестные строки не теряются.

Valid diff: `F552_INDEX_NON_TARGET_API_PROPOSAL_V1.diff`, text-generator `propose-f552-catalog-index-patch.mjs`; proposed snapshot рядом. Source index46321 не менялся, ROOTschema/runtime не менялись. Новый отдельный negative-case проверил временную предложенную версию wiring с local mockbroker:1PASS/0FAIL,85.520041ms. Проверены exactnegative, изменения всех5полей, новая похожая строка, Unicodeбезname-rule, duplicate/invaliddecision и сохранность активного index. Положительныйcase/F551/T3 не повторялись для этой щели.

Только после явного ROOT review нужных positive bindings и принятия negative API условный разбор неизменённого1278-row saved catalog:552positive(550+oldBTCETH2),726unqualified=380knownTradFi+2gold+344inactive/nonUSDT; eligible target550. Это identity-only расчёт, не новый native capture и не fullCORE/единицы550. Без reviewed additions defaultscope11 и539 неактивированных positive proposals сохраняются; известные380 не должны прибавляться к неизвестным классам активов.
