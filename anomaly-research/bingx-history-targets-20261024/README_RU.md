# B04 — отдельная история BingX для первичного отбора

Конечное офлайн-предложение по поручению ROOT24Oct, база `665362d98296c2c86aa99cd0c7085b33bb337cf9`. Старый PR634/dd6019dc и его18вариантов сохранены неизменными и не выполнялись. Изменения только в этой новой папке. Общий runtime, DDL, main, стратегия, веса, caps и паузы не меняются.

## Реальная цепочка

- `market-snapshot-batch.mjs`: существующий **packSnapshotShards** получает явный `history_context`, нормализует точную BingX cohort и формирует прежнюю batch JSON/PK. Существующий **persistSnapshotShard** остаётся побайтно прежним: тот же INSERT/immutable-key/readback. Новый SQL backend/table не создаётся.
- `market-history-reader.mjs`: существующий **readMarketHistoryTargets** при явной BINGX ветке читает тот же `report2_market_snapshot_batch_v1`, проверяет полный набор shards/hash/metadata/cohort, возвращает5целевых окон. **Без HTX scan_runs fallback.** Старый HTX body/20min fallback остаётся отдельно без изменений.
- `worker.js:3902`: реальный **loadHistoryTargets** передаёт серверный `REPORT2_BINGX_HISTORY_BINDING` только при явном `REPORT2_PRIMARY_VENUE=BINGX` (имена PROPOSED, не установлены).
- `worker.js:4473,5039–5089`: реальный **historyMetrics** и все пять существующих выражений первичного отбора выбирают BingX точку по `instrument_ref`, затем сравнивают **собственные часы и единицы каждого показателя**. HTX остаётся на прежнем key/body. Никакой normalize-to-USDT или join по тикеру для BingX.

Эта цепочка готова как DATA-integrity proposal. **Текущий htxUniverseScan всё ещё получает HTX и применяет approved HTX scope.** B04 не объявляет готовыми новый Stage0 source producer, реестр всех BingX контрактов, ранжирование нового universe, native admission или production cutover. ROOT должен подать квалифицированные текущие строки по `PRODUCER_CONTRACT_RU.md`, заменить HTX acquisition/admission в своей общей интеграции и поставить decision asof после фактического capture. Скрытого HTX fetch или нового unadmitted fanout в B04 нет.

## Доверие и непрерывность

Самостоятельного native registry/admission artifact пока **нет**. Обязателен REQUIRED_ROOT_BINDING: точные serialized registry bytes + **внешний** expected SHA/Git-blob locator + expected venue/actor/schema/закрытый accepted generation set. Проверка SHA доказывает целостность относительно ожидаемого значения; она не аутентифицирует источник и не выдаёт native grant. Fixture expected помечены CONTROLLED. ROOT обязан независимо квалифицировать admitted catalogue+classification+units и защитить expected carrier вне самого ответа/параметров пользователя. `verified:true`, имя файла или совпавший selfhash этим не становятся.

Stable `instrument_ref` определяется venue/market/product/family/native contract ID/symbol/base/quote/settle/margin, linear/inverse, token binding+epoch+scale, instrument и unit revision, metric units/basis. **Received time, весь catalogue body SHA, registry revision и proof locator в него не входят.** Поэтому новая листинговая строка или обновлённый каталог не обрывают24h историю остальных контрактов.

Старый BingX manifest допускается только через отдельный точный ROOT descriptor (максимум2compatible плюс current) и явный набор поколений (максимум3). Сначала проверяется полнота **старой** cohort, затем в current map попадают лишь неизменные stable instrument refs. Новый актив без старого окна остаётся UNKNOWN. Изменение token epoch/scale/contract multiplier/units revision обрывает reuse именно этого инструмента. USDT_M и COIN_M разделены даже при одинаковом base/native symbol.

## Показатели и пробелы

Raw `value_decimal`, original response payload SHA и receipt/body proof_ref сохраняются; числовая проекция используется для аналитических изменений без конвертации единиц. NULL source time/units/period остаются NULL. Старый OI не становится текущим из-за свежего received. Отсутствующий OI не превращается в0, размер0 не становится1, USD не превращается вUSDT. Для funding сравниваются только известные одинаковые реальные периоды; default8h нет. Quote turnover требует известного собственного rolling24hwindow. Price basis LAST/MID/MARK/INDEX связан реестром и не смешивается.

В результате каждого окна видны actual source/received clocks, фактическая длительность и отдельный статус показателя. B04 сравнивает две фактические snapshot-точки: это не доказательство закрытой OHLC свечи, полного taker flow или непрерывного покрытия между ними. Для свечей/потоков сохраняются собственные строгие контракты SOURCE/N05/N10. Нативный0сохраняется; процент относительно0 не определён. `state` направления остаётся insufficient без обеих пригодных price/OI переменных. Partial price information не закрывает execution/score/gates. `target_coverage` считает совпавшие и отсутствующие точки current **заданной** cohort; это не охват всех BingX активов и не полнота всех метрик.

## Границы расходов

Не более5новых SELECT; принятая группа не больше24shards/target (sentinel25), producer payload64KiB/shard. При суммарном полученном payload>2MiB reader прекращает новые запросы и не принимает oversized группу. Это **post-receive stop**, не доказанный pre-receive wire bound; SQLite substr ограничивает символы, JSON wire/Unicode overhead нужно квалифицировать отдельно. Registry<=2MiB/current+2compatible;20k instruments — parser bound, не целевой universe. Stored keys/schema прежние; accepted generations/actor точные. SQL использует прежний range index, но row LIMIT не доказывает native rows_read, wire/heap/latency или свободный shared budget. Ошибка transport/явный unsuccessful reply/рост unknown прекращают дальнейшие запросы. Измерения и actual admission остаются ROOT.

Новый pack bound не отменяет прежний collector count guard (с обеими price lanes count-only максимум10shards), source/whole caps или body/wire ограничения. Настроенные имена и JSON row/manifest contract — PROPOSED, native schema/install/config0.

## Квалификация

**Один** новый callable `runBingxHistoryTargetsConnected({repo_root})`,22именованных контролируемых варианта, **PREPARED_UNEXECUTED**. Он после exact target pins импортирует фактические batch/reader, вызывает фактические pack/persist/reader и извлечённые реальные Worker loader/пять selection expressions. DB — только CONTROLLED транспорт с сохранением реальных bound INSERT/SELECT arguments; SQLite/D1 engine не запускается. Полный Worker, старый634 и accepted suites не вызываются. Каждое возвращённое значение добавляется в `actual_returns` **до assert/следующего consumer**; throw несёт partial_result. Это не crash-durable journal, parent ROOT сохраняет returned JSON перед дальнейшими действиями.

Автор: Node/import/syntax/tests/providerHTTP/SQL/CF/deploy/dispatch/MAIN/TG0. Проверены только text/hash/JSON/Git связи из static-receipt. ROOT перед FIRST объединяет реальные target файлы: Worker с SOURCE/PR634/B04 и **market-history-reader с guard readMarketHistoryForContract из PR634 плюс новым targets reader B04**. Полные предложенные тексты нельзя последовательно перезаписать друг другом, потеряв соседний guard. ROOT связывает точный общий текст и полный import closure, обновляет after pins на его точные согласованные байты; не отключает проверки и не повторяет завершённые старые компоненты.

Paid48h/5GB4GB3.5GB, cursor710, caps/unknown/reservations,9пауз,70/веса/формы, ENTRYfollowup/physicalstorage deferrals и ожидание итогового Telegram/anomaly ТЗ сохраняются. Данные не удалялись, физически освобождено0.
