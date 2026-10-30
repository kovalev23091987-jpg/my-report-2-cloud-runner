# Статический request plan, LAST, reserve и ещё пять identity

Новый конечный пакет ROOT: whole HTTP/SQL plan, thin bulk-LAST freshness, эквивалентный OHLC/volume reserve и до5 новых underlying. Это **STATIC_NOT_MEASURED**, без market API/SQL/TG/deploy. Код А и общие runtime файлы не менялись.

Snapshot authority: `108a5dbdfc670d9a48fbf953811f5aa1b7bc2864`. Fresh AGENTS/all4/status/resume/window/phase/fence/generation прочитаны по одному SHA; all4 равны, fence inactive, generation latest-only. Новая own scoped lease acquire `fdee1fa4aa73d7f250c967b87ec7472e145c5996`, tree `6b7622c92cf49793c9794788513385ba5f01747c`, owner `CODEX:SOURCES:01a171fd:1792930283223`, expiry1792933883223, FULL server byte/ref readback. ROOT lease был замечен истёкшим и оставлен неизменным; он не использовался как live/native admission. Own offline lease разрешает только этот собственный префикс. Кодовый checkout head всё ещё PR639 `4b44d48836b9c26b1c9c8bb0830055ee279a608a`, новых code/main commits нет. Точные Git blobs прочитанного server runtime сохранены в JSON плана.

## HTTP: попытки по точным путям

`STATIC_WHOLE_REQUEST_PLAN_V1.json` содержит таблицу каждого core/optional/map/delivery/outcome маршрута, TTL, exact cache key, SQL формулы, bytes/time и текущие отсутствующие inputs. Положительные тарифы/weights/cadence не измерялись. Текущий snapshot worker — QUALIFICATION_ONLY с истёкшим admission: manual получает503 до services. Таблицы ниже описывают будущую отдельно допущенную цепочку.

| Один manual, без старого backlog | BingX | Swole | TG | Whole broker HTTP |
|---|---:|---:|---:|---:|
| Warm: все source facts пригодны, публикация |3|0|1|4|
| Cold: fresh bulk LAST, только mandatory, публикация |6|0|1|7|
| Cold: fresh bulk LAST, все qualified optional/map, публикация |8|1|1|10|
| Cold thin: bulk LAST старый, прямой LAST пригоден, full |9|1|1|11|
| Cold thin: ещё отдельный symbol ticker fallback, full |10|1|1|12|
| Full cold thin без публикации |8|1|0|9|
| Один последующий cold outcome attempt, прибавка |1|0|0|1|

Warm всё равно содержит catalog1: у него ttl0. Delivery всегда делает force-refresh LAST+book, ttl0, максимум2, без третьего fallback/candle download. Warm для карты/OI/funding условен: реальные registries эти routes/units пока не активируют. Без квалифицированных candles основная идея остаётся INCOMPLETE, доставка отсутствует.

Шесть независимых cold full manual: **BingX60 +Swole6 +TG6 =72 HTTP**. По одному последующему cold outcome на сигнал: ещё BingX6, суммарно **78**. Это только6 новых jobs/6 новых cards, без старых pending. Шесть независимых warm при всех source-фактах ещё пригодных дают24; поэтому24/run не является резервом на гарантированные6 checks. Дневной ROOT BINGX102+TG6 и отдельные delivery/outcome24/24 здесь не уменьшаются и не объявляются измеренными.

Один executor с6 pending jobs экономит5 catalog calls: cold full верхний план67 HTTP (BingX55/Swole6/TG6), затем outcomes+6. Нельзя автоматически считать общий bulk одним download на все6: ttl30s и source clocks могут истечь между последовательными анализами. Один и тот же exact inFlight key присоединяется к одному запросу; cache hit делает один SQL get и0HTTP. Ключ включает provider/cache_key/full URL. Bulk ticker URL отличается от per-symbol fallback; окна core/outcome различны; разные broker instances не делят inFlight. Никакой новый независимый collector/cache не добавлен.

К source HTTP добавить6 отдельных входных manual POST, если6 jobs пришли6 запросами; эти app-entry HTTP не входят в provider broker. Синхронизация clock/rules, будущие auth/control/deploy и extra stats trigger добавляются отдельно, если ROOT их реально подключит. Не переиспользовать bounded5 qualification как новый дневной grant.

## SQL, bytes и время

Здесь **SQL statement counts**, не D1 rows. Для TTL-positive network miss: обычно6 SQL (cache-get1, reserve2, finalize2, cache-set1), successful CAS5 path≤22. При известном сбое первой finalize catch может ещё раз finalize UNKNOWN: максимум31 без cache-set. Для ttl0: обычно4, one-finalize≤20, с error cleanup≤30. TG budget reservation/finalization —4/20/30, card/state operations сверх этого. InFlight joiner0 SQL; cache hit1. Эти числа получены чтением вызовов, а не native измерением.

Один worst cold full manual: provider broker+TG budget64 statements номинально, до368 при CAS5/error cleanup. Шесть —384/2208 **до** runner/card/очередей/native lifecycle. При успешном worker добавляются5 фиксированных SQL: native reserve+readback2, install1, finalize+readback2; known finalization error может дать повторную попытку. Остальные store.get/set/atomic перечислены по стадиям в JSON: get/set по1 statement, atomic change обычно2/до10, unchanged1.

Полный SQL счёт **не замкнут числом6 jobs**. Нужны Q manual-queue включая COMPLETE, D старых delivery entries/states, O outcome-pending и U due UNKNOWN. Они сканируются повторно; SENT repair тоже читает/проверяет старые rows. Native budget SUM и actual D1 meta/индексы/размер value_json дают отдельную неизвестную стоимость. Проектные5000R/300W на worker и profile500R/80W+delivery30R/15W — конфигурации допуска, не доказанные расходы; precheck может узнать превышение после actual SQL. Rows/cost/unknown ACK остаются null, не0. Две deferrals не снимаются; очереди/данные здесь не удалялись.

Broker source response stream cap2,000,000B; worst cold full source11 ответов≤22MB, шесть66 ответов≤132MB, с6 outcome≤144MB. Это потолки размеров тел, не измеренные байты и не максимум cache JSON/RAM. TG JSON response имеет timeout15s, явного byte cap в snapshot нет; поэтому whole response bytes=null. Source timeout10s, map outer deadline10s. Serial network timeout allowances у worst6 —750s, **не end-to-end upper bound**: SQL/CAS/сериализация/очереди не имеют такого общего предела. CLI90s и executor120s не гарантируют завершение6 reports.

## Thin bulk LAST и конкретные стыки ROOT

`BULK_LAST_EQUIVALENT_BACKUP_REVIEW_V1.json` фиксирует поля/статусы/отрицательную проверку резерва. Bulk `lastPrice` использует исходный `closeTime`, пригодность30s, expiry=closeTime+30s. Свежий received/HTTP200/cache не меняет source age. Старое значение остаётся STALE/SOURCE_FACT_STALE и не входит в reusable overviewPrices. При missing clock — INCOMPLETE; future clock — ERROR/value null.

Core при stale bulk запрашивает direct LAST именно BingX-инструмента. Его matching-engine time — часы новой last-price snapshot, не утверждение о свежей сделке. Один per-symbol ticker fallback допустим для того же смысла LAST, со своим исходным closeTime; stale fallback остаётся stale. Identity/access/rate/budget/future-clock errors не создают допустимый fallback. Forced delivery fallback выключен, чтобы сохранить2 requests.

В snapshot108a `updateDiscovery` сохранял price.value в предварительную историю без factUsable. **ROOT сообщил об исправлении**: last/reported_change_pct только при usable price, event_ts/status сохранены. Исправление ROOT/его проверки не повторялись здесь. Ещё нужен общий контракт purpose для delivery: source force-refresh сейчас сохраняет familyUSDT_M, budget освобождает deliveryProtection только familyDELIVERY. ROOT должен решить точный seam, сохранив market family и reserve; самовольный adapter patch не сделан.

## Бесплатный эквивалентный OHLC/volume reserve

Квалифицированный reserve **не установлен в проверенных primary материалах**. Это конечный отрицательный результат по уже имеющемуся docs-v3 blob61480e09/SHA4f4ec6e6, official AI blobe61be474 и saved official WS SHA8b03a128; общего поиска заново нет. Документированные kline route families перечислены в JSON review.

COIN-M/spot klines — другой продукт; markPriceKlines — другие цены и не эквивалентный trade volume. Official BingX WS — тот же venue candidate, t/T документированы, но v generic, нет доказанного полного121-bar recovery/history и действующего WS broker/admission/учёта сессии. Другая библиотека над тем же v3 endpoint не резерв. Другие биржи/совпавший TradingView symbol не подменяют BingX perpetual. Сохранённые qualified закрытые bars могут переиспользоваться только в своей исходной полной области; это cache, а не новый источник. Нужен exact alternative contract того же инструмента с independently known units/clock/full-window/recovery и ROOT route/budget admission; до этого обязательные gaps остаются INCOMPLETE.

## Ещё пять exact underlying

`registry-next5-retained-v1.json` — **delta5**, SHA256 `b30f795497a67dacc6719581e6ff7bae26843a6af9ed34a3add396cf62fe7db1`; evidence `NEXT5_CRYPTO_PRIMARY_IDENTITY_V1.json` SHA256 `8b20c43870a35d925a76f0dcfda7b8c4cef3b85eba8bb93465aff4bcd8baf002`.

| Symbol | Native contractId | Independent primary crypto source |
|---|---|---|
|AVAX-USDT|100009|[Avalanche native AVAX](https://docs.avax.network/docs/primary-network/avax-token)|
|LINK-USDT|103|[Chainlink native LINK](https://chain.link/faqs)|
|LTC-USDT|100006|[Litecoin Core](https://github.com/litecoin-project/litecoin/blob/master/README.md), Git blob002598ee09fe37c2d442fb73e786554095244c76|
|DOT-USDT|100008|[Polkadot native DOT](https://docs.polkadot.com/reference/polkadot-hub/consensus-and-security/relay-chain/)|
|TRX-USDT|100039|[TRON native TRX](https://developers.tron.network/docs/token-standards-trx)|

Каждая запись связана с exact retained native tuple, конкретной BingX named-underlying страницей и specific perpetual title, затем независимым primary crypto документом. Spot pair/name вернулись для4; **LTC spot показал --/-- и не использован как положительное доказательство**. Для LTC binding основан на exact native perpetual tuple, [явном BingX Litecoin/LTC explanation](https://bingx.com/en/price/litecoin), specific LTCUSDT perpetual title и official project README. Текущее spot listing не утверждается. LINK — underlying-classification, без смешения ERC677/bridged representations или присвоения contract address.

Модель доказательства остаётся curator review нескольких primary документов, venue-scoped BINGX_UNDERLYING, без on-chain/cross-venue certificate. CORE8 неизменён: ROOT объединяет base.instruments + delta.instruments после disjoint checks и затем current admitted catalog readback. Итого13 retained crypto underlying,2 owner exclusions,920 UNKNOWN среди прежних935 activeUSDT. Current verified0/N=null; candle qualifications и map routes пустые. Никакого full935 из символов.

## Проверка и остановка очереди

Одна связанная offline qualification `qualify-request-plan-next5.mjs`: arithmetic/SQL paths, новый thin bulk→direct LAST сценарий и подключение только delta5 к замороженному источнику. CORE8/А33/старый аудит повторно не запускаются. Вывод `REQUEST_PLAN_NEXT5_OFFLINE_QUALIFICATION.json` содержит точные file hashes и результат. Fixtures не native proof.

После этого разрешённые4 темы исчерпаны: план сохранён; источник не требует патча по LAST; primary reserve не квалифицирован; предел5 новых identity достигнут. Следующие missing inputs для ROOT: current bounded Q/D/O/U + actual native SQL meta/whole ledger, delivery budget-purpose contract, exact candle units/full-window contract, новые реальные provider receipts после ROOT admissions. До них SOURCES прекращает поиск/вызовы и закрывает только own lease. Старые unknowns/reserves/caps/9пауз/2deferrals сохранены; market/SQL/TG/CF/deploy0, docs connector costs unknown.

Последнее сообщение ROOT: stale discovery исправлен в a9e82fc22b27c9f2badab723ae67c996ee3aa634; ROOT подтвердил26-module deployed readback. Два qualification вызова остановились до provider на edge redirect:error TypeError; ROOT оставляет2 UNKNOWN, из первоначального5 только3 попытки. Исправление на manual redirect с отказом3xx находится у ROOT. Эти расходы не возвращаются, собственных provider вызовов SOURCES0. Статическая таблица привязана к108a и не переименована в измерение нового deploy. Следующий приоритет — минимальная нормализация новых native candles после передачи ROOT реальных private shapes/clocks/receipt metadata; до этого новые поиски/пробы не выполняются.
