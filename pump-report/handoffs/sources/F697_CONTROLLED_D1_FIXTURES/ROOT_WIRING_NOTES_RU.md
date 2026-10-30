# F697 — обязательный ROOT wiring, UNEXECUTED

Замороженный F696 не изменён. В его private copy ROOT должен передать `store,budget,guard` в существующий `f.makeSources({...selected,run_id,clock,emptyCatalog,store,budget,guard})`. Это прямо согласованный ROOT seam: без него adapter отказывает до запросов. Проход без настоящего broker не допускается.

Подключение после отдельного положительного frozen offline admission:
```js
import {createF697Adapter} from './adapter.mjs';
const adapter = await createF697Adapter({modulesRoot});
const result = await runF696ConnectedCase(adapter);
```
`modulesRoot` — точный собранный pump-report graph ROOT с F696 + согласованными BZ70/BZ71 исправлениями; абсолютный путь либо URL каталога. Factories не читают private packets/originals. Implementation pin вычисляется из фактических .mjs в analytics/contracts/profile/runtime/sources перед case. Это один connected case в одной Node, четыре bounded native invocations и изолированные fault phases, без real IO и без повторения qualification limits.

Функции `openControlledD1/buildFixtures/clock/verifyConcurrentAndUnknown` экспортированы. buildFixtures после конфигурации создаёт полные fixtures; никаких передаваемых makeSources/input/run ids/recipient/manual symbol stubs нет. Clock начинает 12:00:02 Москва, между native runs продвигается61s, внутри broker — фактическое controlled pacing; предел12:14 Москва.

SQLite API: `prepare().bind().all()`, `peek(stateKey)`, `inspect(sql,args)`, `snapshot()`, `counters()`, `seed`, `seedLedger`, `barrierNext(match)` -> {entered,release,cancel}; `ackUnknownNext(match,error)` -> тот же error. Есть aliases db.faults.ackUnknownNext и db.barriers.next. Один armed barrier и один ACK fault; match — substring либо (sql,args)=>boolean. Barrier останавливает SQL до исполнения; ACK fault бросает после фактического commit. snapshot содержит строки, revisions, ledger, SQL trace, attempted/executed/acknowledged и отдельные administrative statements. ROOT BZ70 driver может использовать эти hooks на том же controlled DB после F696 phases.

Показатели rows_read — явная controlled logical model (SELECT returned rows, mutation1, atomicPair4), rows_written/changes — фактические SQLite changes; DDL0. Это не physical D1 rows, latency, capacity, throughput или whole-account accounting. Administrative schema/seed/inspection отдельно посчитаны, они не являются разрешённым production SQL.

Публичная основа: tests/analytics/fixtures.mjs SHA256 b8f48cac69d813a3ba025cf364145b96db4d7449914f5ba119ad9bb89c898fed. Переиспользованы121 закрытая минута и baseline factory. По свежему ROOT уточнению tail заменён на [102,105,110,115,117,118,117.5,116,115,109,110,111,112,113,114], после i106 base volume3000 против исходного baseline1000, текущая цена114/book114±0.1. Последние5m open109→114, полный1h около100→114. Подтверждённая вершина118.1 и прежняя поддержка около102 дают структурный entry→exit более10% при baseline halfwidth около1; пригодность пересчитает actual engine. Artificial identities/rebase/row evidence явны. Engine не подменяется; ready/automatic_eligible проверяет настоящий analyzePump во время будущего ROOT case. Full4h/24h coverage не утверждается. Growth24h отсутствует явно, discovery25% — только controlled hint. SENT/UNSENT/MANUAL — разные инструменты/волны; saved repair использует прежний SENT.

productionPolicies/productionAdmission/PROTECTED_HTTP/START_PROFILE берутся из modulesRoot. Старые synthetic qualification totals24/1, UNKNOWN и CLOSED holds, прежний FINALIZED native spend и RESERVED unknown предыдущего дня сохранены; окончательный hook утверждает их неизменность. Это fixtures, не восстановление private actual ledger. caps800Q/5000R/300W, manual3, BingX900/27900/10min/1sec, TG47/1457 не повышаются.

Fake BingX fetch работает только через настоящий createRequestBroker reserve/finalize/cache и тот же D1Store. Cold SENT максимум10 BingX: catalog1, bulk overview1 (CORE cache hit), day1, core price/candles/book3, optional2, forced delivery2. Empty saved repair0. Optional HTTP учтены, но не выдумывают funding/trades facts и не переквалифицируют normalizer. Forced price/book свежие, cached bulk сохраняет received/event clock.

Обязательные faults: реальный actual D1Store pending1 до await и required hold1 при cap4+finalize2; optional отказ без увеличения DB counters; foreign/expired token до IO; SQLite committed write с потерянным ACK -> unknown_ops1, ledger RESERVED, настоящий finalizeNativeRun отказывает без IO. Возвращаемые witnesses следуют assertions, а не фиксированному PASS.

BZ71 REQUEST_CHANGES не снят этим adapter. F697 не меняет F696 runtime и не исправляет R1–R5. ROOT отдельно интегрирует исправления до единственной qualification. Node/import/syntax/tests/engine/build/provider/native/CF/OAuth/TG execution при подготовке0. Оставшийся gap: реальная совместимость graph/SQLite/engine/полная arithmetic проверяется будущим case; подготовленный assertion не PASS.
