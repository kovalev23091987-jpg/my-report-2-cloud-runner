# SOURCE U: forwarding purpose для общего DISCOVERY reserve

Малый отдельный delta после frozenT59c466...; T и прежние manifests не переписаны. Fresh maincc42a97ce02760f1768a5fdca0fb33115b88f75f; Source index доpatch точно совпал с server gitblob32820f91b312a9aed8303f11f45e39cf33bf2565, SHA256d95e5b120f927e1dd89c7a3061764efcde631b6343e7c98e40f296806a269e9f. Рабочая база checkout4b44d48836b9c26b1c9c8bb0830055ee279a608a.

В sources/index.mjs изменены только4 строки:
- `getCatalog({purpose='CORE'}={})` передаёт `request('catalog',{purpose})`.
- `getOverview({instruments=[],purpose='CORE'}={})` передаёт purpose в существующий bulk ticker request с прежнимTTL.

Это внутренний trusted ROOT descriptor, не wire query/header и не client-body override. URL/GET/provider/family/cachekeys/TTL/HTTPcost/callcount, thresholds, sourceversion/registry/qualifications не менялись. CORE по умолчанию сохранён; manual/candidate callers остаютсяCORE, еслиROOT не назначаетиное. Sourcefactory не создаётbudget admission.

Новый test-file содержит только2 affected случая с offlineSOLfixture: defaultCORE и explicitDISCOVERY для обоих методов, exactURL/cachekey/cost/callcount и неизменная preliminary fact semantics.2/2PASS, duration63.356875ms; штатный textual log, не TAP-format. Старые батареи не запускались. SourceHTTP/SQL/TG/deploy0.

ROOT отдельно добавляет разрешённый purposeDISCOVERY в свой budget/runtime, использует его только в currentAUTO getCatalog/updateDiscovery и защищает оставшиеся2mandatorybulkHTTP за5min отdeepcalls. Этот пакет не меняет common budget/profile/runtime/provider, не повышает164/900 или caps/reserves и не сбрасывает понесённые/неопределённые расходы. Проверки fakebroker не являются native допуском/production acceptance.

T остаётся конечным отрицательным поtradesunit/clock и поpositivecoinTypeenum/nativebridge. Currentoptionalbound2 не менялся, metadata2of2SPENT сохранены. Root additional primary search не далenum; названная статья проUSDT TradFi не доказывает0/5enum. Никаких новых источников/поисков отсюда не было. Owner FX/fiat exclusion, anyscriptpositivecrypto,9пауз/2deferrals сохранены.

Подключение: ROOT берёт exact новый sources/index.mjs по новому manifesthash, применяет вместе со своим common DISCOVERY-admission/2bulkreserve delta и собственной affected-проверкой/точным artifact readback. До этого фактическую работоспособность нового purpose не заявлять. Snapshot before и exact4line diff сохранены дляreview. Native IO не выполнен; lease release/readback — отдельная квитанция.

