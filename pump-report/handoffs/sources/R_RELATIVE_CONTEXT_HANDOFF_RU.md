> OWNER CANCELLED: BTC/ETH comparison removed by direct owner command. Historical R draft below; do not integrate or execute it. Current package OWNER_NO_BTC_ETH_CONTEXT supersedes this draft.

# SOURCE R: producer блока5 — закрытая доходность кандидата и BTC/ETH

Текущая восстановленная точка: fresh main **cd32febb6be71e804b63f30e0299b6468a9c6dcd**, ТЗ v2 SHA0674adf8bef087f63ddac8214b8e650ae14410f33970ed4f869c5ab2564975cc. Code-only пакет R завершён; live provider/SQL/TG/deploy не выполнялись. Исчезновение видимых сообщений не привело к rollback/reset или повтору потраченных проверок. Предыдущие frozenT/FWD/U2/factory/clock/fulluniverse manifests сохранены.

## Поведение и точный способ подключения

Новый `sources/relative-context.mjs` и seam в `sources/index.mjs` реализуют `getOptional({instrument,facts})`. Candidate candles берутся только из уже полученного `facts.candles`. Текущий ROOT runner уже передаёт `facts:core.facts` в runtime/runner.mjs:103 после пригодной основной идеи; эта строка SOURCE не менялась. ROOT analytics/context.mjs использует опубликованный `qualifyRelativeContext`; SOURCE также вызывает этот же validator перед USABLE result.

End — original candidate candle event_ts, start=end−300000. Требуются6 закрытий ровно start,start+60s,...,end. Benchmark query: official existing v3klines, symbolBTC-USDT/ETH-USDT, interval1m, startTime=start−60000, endTime=end−1, limit6. Candidate повторно не скачивается. Только положительные close prices и approved owner/CCXT open-time basis; volume/quantity/turnover не читаются, не валидируются как абсолютный объём и не переименовываются. Native-price ratios не требуют придуманного коэффициента amount.

Каждая нога содержит role/exactinstrument из supplied independent curated registry/identity_evidence_ref, source/venue, start/end/start_price/end_price/return_pct, fact_id/evidence_ref, original received/expiry, exact price/time basis и complete_closed_window. Все ноги имеют одно5min окно. Общий kindmarket_context/unitRETURN_PERCENT_SAME_WINDOW/schemaBINGX_CLOSED_RETURN_CONTEXT_V1. OriginOBSERVED обозначает расчёт из observed closes, с явным derived_from/receipt/fact references; это не внешняя модель.

При2 пригодных benchmarks coverageBTC_AND_ETH; при1 — USABLE с coverageONE_BENCHMARK и точной причиной второго пробела. ВсеBINGX, independent_venue_count1; независимых площадок/intent/absorption/вероятности не заявляем. BTC/ETH используются здесь только как benchmark legs; candidateBTC/ETH producer не обрабатывает как новую идею, действующий report deny не менялся. Candidate identity/timebasis/provenance/windowgap failclosed до любых benchmark calls. Future receipts, malformed/open/outside/duplicate bars и stale replies отвергают соответствующую ногу. Истечение freshness за время await не создаёт пригодный контекст.

## Запросы, цена и бюджет

Источник использует только общий broker, без собственного durable cache/expense ledger. Exact URL/window cache keys не содержатcandidateID и пригодны для общего reuse; original broker clocks/receipts сохраняются. Candidate_id budget descriptor остаётся ID анализируемого кандидата, а payloadsymbol — benchmark. Нет retries/fallback/бесконечной пагинации. Timeout10s каждого запланированного запроса, фактическая очередь/rate/backoff/общий deadline принадлежит ROOT broker/runtime.

В одном getOptional строго≤2 broker calls, включая benchmarks/OI/funding. Benchmarks получают приоритет. Они занимают существующие2слота, не прибавляются кOI/funding. Если остался1слот, может работать только1 квалифицированный optional; если0 — FACT statusNOT_CHECKED, reasonNOT_CHECKED_BUDGET и budget_statusNOT_CHECKED_BUDGET, с сохранённым qualification_status. Current unqualified OI/funding не объявляются подключёнными, trades остаётсяNOT_CHECKED/BINGX_TRADE_ROUTE_NOT_QUALIFIED.

Source HTTP upper2 и profile.optional_http_upper_bound2 не повышены. Source http_plan отражает только консервативно scheduled broker calls/remaining; actual spent/UNKNOWN — только ROOT_BROKER. Cachehit/ошибка/denial не дают скрытого третьего/четвёртого запроса. Обязательные price30s/book15s/candle90s и опубликованный market_context90s не менялись.

Worst cold route plan сDAY:2bulk +5core/day +2optional +2delivery =11BINGX/manual. Для6manuals:66BINGX +6Swole +6TG =78immediateHTTP; +6lateroutcomehistory =84. Двенадцать benchmark calls входят в прежние optional12, а не добавляются сверху. Это прежний верхний route-plan envelope, не фактически доказанные6полноценных native проверок. В текущих unqualifiedoptional0 могло быть меньше расходов; теперь допустимо до2, поэтому прежний actual manual cost нельзя переносить как measured Rcost. Дополнительные SQL/CPU/response/cache/storage bytes дляR native не измерялись. ROOT retained164/run/900day/96-56-12/manual24/deep50/map8native4/3.5mR70kW/nextfull59kR920W/reserves/unknowns сохранены.

## Проверка и ограничения

Одна новая controlled-wire батарея: **8/8PASS**, duration73.6705ms. Это8 уникальных тестов с table variants, nativeIO0:
1. Golden6close returns: synthetic candidate+10%, BTC+2%, ETH−1%, exact roles/identities/common validator; benchmark volume deliberately unqualified и не используется.
2. Нет/дырка/duplicate/forming/future-received/wrong-timebasis candidate —0benchmarkcalls.
3. Одна плохая нога — честныйONE_BENCHMARK.
4. Future/shifted/duplicate/unclosed benchmark — rejectleg без retry/candidatefetch.
5. Даже synthetic-qualified OI/funding после2benchslots получаютNOT_CHECKED_BUDGET.
6. НетBTCregistry — толькоETH и максимум1 residual optional; ложная роль rejected общимvalidator.
7. Cachehit сохраняет originalreceipt/received/end/expiry и stable keys.
8. Expiry duringload failclosed; budgetdenial не расширяет2slot envelope.

Фактические реальные Rданные/текущая native signature/worker-run acceptance/новыйTelegram не проверялись. Не повторялисьA33/97+7/прежниеU/factory/analytics/runtime батареи. Shared contracts/profile/runtime/registry/provider/budget не менялись. Контракт относительных данных SHA080e0080a0c4e46854c68d48b9e431f2ffed5cda06a3074db9fe956a7b9aa8a2, профиль SHAb1d342570b3c5208a658a5461e4ff0d8b77965a2319741e569975ce1bc0d9806 сохранены.

## Что остаётся ROOT

Взять exact новый sources/index.mjs + sources/relative-context.mjs + новый SOURCE test по manifestSHA; сохранить published common contract/profile hashes. Выполнить собственную integration/artifact readback и отдельно precise positive provider/whole-budget/nativeSQL/runtime admission для единственной новой R native проверки. Current nightAUTO/statistics/delivery OFF; SOURCE не поднимает expired stage. Проверить фактическую latency/freshness/context сохранение и реальные costs, не используя codefixtures как native proof.

Классификация отR не меняется:13retainedcrypto/2gold/919UNKNOWN, ownerBTCETH excluded2/11eligible, fullcryptoNnull. Тип0/5/nativebridge/scaledunits gap прежний; block5 не обходит его. «Фьючерс на валюту также не нужен никакой»: FX/fiat/stocks/metals/gold/commodities/noncryptoindices исключены, любойалфавит разрешён только приpositivecrypto.9пауз/2OWNERdeferrals и legacyreport/Actions/cron/automations сохраняются. Последние ROOT-reported365native761R235W/provider22/old2providerUNKNOWN/metadata2of2SPENT/BINGXacceptance12of24SPENT не переиспользованы как новый grant.

Все точные файлы/байты/SHA/base/proof/остаток — `PACKAGE_R_RELATIVE_CONTEXT_FINAL_V1.json`; собственный timely release/FULLreadback — отдельная квитанция.

