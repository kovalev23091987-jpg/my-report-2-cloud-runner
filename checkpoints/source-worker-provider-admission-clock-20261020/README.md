# Время admission после ожидания ответа поставщика

Новый статический контрпример относится к двум существующим вызовам общего reader: CoinGecko sector и CoinPaprika HTX identity. Оба передают `now` начала сбора, но не передают `clock`; reader наследует `clock:()=>now`. Последующие get после ожидания предыдущего ответа проверяют cache, day ledger и rolling60s по прежнему времени. CoinPaprika sector и Gate binding уже передают живые часы.

Это конкретный путь до настоящих production reserve/fetch функций, а не вывод о случившемся native перерасходе. Source локально не выполнял runtime, Node, syntax check, SQLite, provider HTTP или тесты. Новые данные поставщиков не запрашивались. Исходные vectors UNEXECUTED; PASS не заявлен.

## Связанные контрпримеры

- UTC day/month boundary: первый запрос начат до полуночи, его ответ завершён после. Следующие запросы получают старую `day_utc` и `created_at`. Предлагаемый вызов относит их к текущему дню. Старый расход не сбрасывается и не возвращается; новую месячную квоту это не доказывает.
- Rolling60s: первый запрос занимает одну единицу. Пока читается его ответ, другой допустимый caller занимает оставшиеся восемь CG единиц либо одну CP identity единицу. Старый следующий get исключает новые строки через `created_ts<=старый now` и может дать ещё один grant. Живое время видит заполненное окно и отказывает. CONTROLLED конкурент не превышает свободный остаток сам.
- После первого ответа может появиться пригодный reference cache с исходным receipt позже начала candidate. Старый clock считает его будущим и делает лишний HTTP. Обратный случай: cache уже истёк в реальном времени, но прежний clock ещё допускает его. Это reference TTL; не ENTRY TTL и не обновление исходного времени факта.

## Точная правка

`admission-clock.proposed.patch` добавляет только `clock:Date.now` в два существующих callsite. Default общего reader, остальные два live-clock callers, SQL, schema, grants/caps/backoff/reservations и нормализаторы не меняются. Исходные source_ts, received_ts, originalObserved/max receipt, first_known и expiry факта остаются у существующего producer. Production/shared файлы source worker не редактировал: это TEXT proposal для координатора. Hash before/after — в `target-bindings.json`.

Живое readTs берётся **при входе в каждый get**. Это не доказательство, что все последующие SQL/transport задержки не пересекут ещё одну границу. Более широкий reader/dispatch clock repair здесь не предлагается. Native grant/overrun, provider balance, daily closure, экономия и восстановление Telegram не заявлены.

## Одна будущая общая проверка

`runProviderAdmissionClockConnected({runtime_root,baseline_runtime_root,repo_root})` — единственный export callable, без autorun/test registration. Оба runtime roots заканчиваются на **src** реального assembled tree. Baseline — полная копия того же assembled tree, где заменены только два target исходными before bytes; helper overlay не является baseline. Hash pins проверяются до импорта.

Подготовлены 36 assertion groups: actual CG и CP identity collectors → actual reader/atomic SQL в LocalSQLite, UTC day/month attribution, rolling60s concurrent grant/refusal, late/expired cache, стабильные normalized facts и original clocks, ordinary224/manual256 cap, whole denial, unknown без source queries, второй CP same-run memory reader. Все payload/ledger/concurrent/time inputs CONTROLLED; SQL/counters локальные, не D1 billing. Existing technical budget observer проверяется по новому get-entry readTs. Source ничего из этого не запускал.

CG stable output должен остаться byte-structure равным baseline. Для whole denial сохраняются прежние schema/cache/preflight reads; новых durable attempts/fetch быть не должно. Только начальный unknown требует нуля source queries. Не заявляется универсальный «нулевой SQL до HTTP admission».

Manual HTTP24, whole164, background56, provider day/month/minute caps и защищённый reserve не увеличены. Direct collector case не выдаёт новый manual/native grant и не повторяет старые budget suites. Источник→consumer/manual исходного393699 сохранён отдельно в frozen PR570; native transport arrays там отсутствуют, поэтому его receipt не используется как synthetic сырьё этих vectors.

Outer runner fetch проксирует только BYK, CG/CP идут к nativeFetch; дополнительного CG/CP clock-correcting guard выше reader не найдено. Подробные bound paths и limits — `counterexamples-and-scope.json`, точный central entry — `central-entry-plan.md`.
