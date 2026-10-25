# SOURCE: анонимная фабрика exact display-info GET

Реализован отдельный `sources/bingx-anonymous-display-info-request.mjs`; старые source index/registry/runtime/provider/budget не менялись. Это описание запроса, без fetch/IO/import-time действий и без допуска расходов. Предыдущие frozen пакеты9b4fe68... и c1a556... сохранены без изменений.

API:
`createAnonymousDisplayInfoRequestFactory({clock, uuid, sha256, time_zone_hours}).build()` возвращает Promise от frozen `{url,method,headers}`.
В Worker ROOT передаёт собственные clock/UUID и `sha256:createSubtleSha256(injectedCrypto.subtle)`. Node crypto используется только в новом test-файле. Модуль не ищет global crypto, не читает process/env, cookies, token или fingerprint. Единственное локальное состояние — один свежесгенерированный анонимный device UUID на экземпляр; trace UUID и timestamp новые для каждого build.

URL/GET без query, публичный prefix, version5.3.37, platform30/site0 и common headers закреплены по19 exact spans принятого CLOCK_CONTRACT. App version — значение public web-build, не reset проекта/квоты. Timestamp — текущие Unixms из зависимости; factory rejects seconds/microseconds/noninteger/NaN, принимает только13-digit contemporary ms. UUID canonical/compact v4 нормализуется в lowercase32hex; malformed/repeated device/trace отклоняются. SHA256 должен вернуть64hex; подпись и header timestamp используют одно значение. time_zone_hours явно задаёт фактические часы offset, не меняет часы или timezone. Результат и headers заморожены, чтобы случайно не поменять signed inputs после вычисления.

Проверена ровно новая батарея factory:6/6 PASS, duration54.517708ms. Независимый прежний synthetic preimage даёт16878C74854E8BC1784A92E8A50C9D424D8757DBCCB3E58F9468A45847A5C2BC; тот же vector прошёл через реальный Node webcrypto.subtle как проверку стандартного Worker-compatible API. Проверены malformed clock/UUID/hash/dependencies/timezone, отсутствие auth/cookie/nonce/signature и стабильный anonymous device при новом trace/time. Production JS не содержит Node imports. Это code-only, не Cloudflare deployment/native signature acceptance. Скачанный JS не выполнялся; прежние тесты/аудиты не повторялись. Лог `display-info-factory-tests-v1.log` — штатный textual Node test reporter, не выдаётся за TAP-format.

Будущий corrected request описан в `DISPLAY_INFO_FACTORY_ONE_ACTION_READINESS_V1.json`: ровно1 отдельно допускаемая попытка,10s,2MB, no redirects/retries/hostfallback, тот же exact endpoint. Создавать headers непосредственно перед фактической попыткой. Runtime/provider/SQL/whole-budget/request counters и точный новый reservation/admission реализует ROOT. Старая1metadataGET уже SPENT; расходы/unknowns/caps/reserves не сбрасываются и не переиспользуются как новый допуск. Серверная допустимость анонимного empty antiDeviceId, успешность sign и enum/native bridge не доказаны. При любом исходе1attempt остановиться; никаких secret/cookie/login/fingerprint fallback.

## Классификационная граница

Последнее прямое уточнение владельца: **«Фьючерс на валюту также не нужен никакой»**. Только положительно проверенный crypto underlying с USDT-margined perpetual независимо от языка/алфавита. FX/fiat, stocks/tokenized stocks, metals/gold/gold-backed, commodities и noncrypto indices исключены. USDT settlement/status1/тикер/язык/displayName/coinType default0 не являются positive crypto evidence.919 UNKNOWN не переклассифицированы и не объявлены noncrypto; полныйcryptoN неизвестен. Source factory вообще не классифицирует монеты. Старые9пауз/2OWNERdeferrals сохранены.

## Коды неподдерживаемой монеты для общего negative cache ROOT

В проверенных сохранённых endpoint literals `catalog-docsv3-current.literal.txt`, `kline-docsv3-current.literal.txt`, `historical-trades-docsv3-current.literal.txt` error.list пуст; они отсылают к отдельному error reference. Ни одного точного доказанного HTTP/businesscode «эта монета/контракт не поддерживается» для автоматического UNSUPPORTED mapping здесь не установлено. Итоговый список `proven_unsupported_codes=[]`, статус UNKNOWN, не угадывать.

Business100003 на BINGX_WEB_METADATA `/api/coin/v1/display-info/list` — фактически полученная ошибка времени, не coin support. Existing source maps100410→rate limited и100421→clock mismatch; это существующие code interpretations, не новые primary unsupported definitions. HTTP500/503/timeout — temporary policy ROOT, не UNSUPPORTED. Один HTTP404 без точного provider/path/body семантического доказательства также не классифицирует монету. Новых docs/network не было; прежний frozen реестр не переписывался.

Последнее сообщение ROOT о SOL и расходах записано как ROOT_REPORTED, без independent SOURCE raw-readback:5BINGX200/coreUSABLE(price/121bars/book1000), PLAN_INVALIDATED/cardnull/TG0; BINGXacceptance12of24spent, total provider attempts21, native354requests740R227W0SQLunknown, productionoff. Это не источник новой identity для919UNKNOWN и не проверка factory native. Исходные2providerUNKNOWN не отменяются нулём SQLunknown.

Точные файлы/байты/SHA и зависимости — новый `PACKAGE_ANONYMOUS_DISPLAY_INFO_FACTORY_FINAL_V1.json`. ROOT может импортировать только новый source module в свой отдельно проверенный exact runtime artifact; никаких автоматических действий из этого пакета.

