# Точная замена устаревшего admission читателя source budgets

Read-only аудит base `ccda8240ff90d61be57fd5c6010d365d3d3b9960`. Прочитаны исходники, сохранённый pointer и описание уже принятого historical witness. Tool, его `--plan`, helper modules, старый workflow, тесты, SQL и источники не запускались. Исходные17файлов и хеши — в `evidence.json`. Это предложение координатору; реализация и native qualification остаются отдельными действиями.

## Что действительно мешает

`tools/read-active-source-budgets-20261014.mjs:23` допускает только прежний LIQ task, а current phase — ALL_ACTIVE105_SOURCE_EFFICIENCY_IN_PROGRESS. Отказ происходит до создания DB. После исправления этой строки его atomic INSERT всё равно запрещает любой finalized unknown. Он не умеет различать отдельно подтверждённую старую стоимость и новые неизвестные операции.

Дополнительно строки32–33 не защищают следующий full59000R920W: проверяется лишь сумма дня +2500R32W. Строки36–40 не проверяют native usage до следующего SQL. Последний routes reply не проходит post-read usage check перед CLOSED. Journaling выключен, transport counter/beforeRequest отсутствует. `admitted=false` после отказа/неизвестного ACK INSERT оставляет понесённую стоимость вне finalize ветви. Одна замена phase не закрывает эти конкретные пробелы.

## Контракты, которые нужно переиспользовать точно

| Helper | Что он делает | Чего он не даёт |
|---|---|---|
| reserveRunBudget | Безусловный INSERT OR IGNORE, ACK и точный readback reservation | Atomic day limit,2/day,unknown gate и next-full protection в нём отсутствуют |
| loadDailyUsageAggregate | Читает общий day ledger; с opaque reconciliation добавляет exact source row к тому же scan и связывает receipt | Не резервирует ничего; stale snapshot не закрывает race до отдельного INSERT |
| evaluateDailyReservationBudget | Проверяет charged reserves и допускает только связанную in-process receipt для historical unknown | JSON-копия receipt не является токеном; true не заменяет atomic INSERT |
| loadVerifiedNativeDayReconciliation | Локально аутентифицирует сохранённые hashes/исходный failed run/native billing и выдаёт зарегистрированный opaque handle текущего UTC day/generation | Не читает нынешний ledger и не обнуляет old unknown; при rollover/неполном proof возвращает null |
| nativeReconciliationAtomicWitness | Из подлинного handle и current usage.unknown_ops===0 выдаёт точные поля для проверки внутри INSERT | Не выдаёт общий exception всем unknown и не принимает операторский флаг/готовый JSON |
| finalizeRunUsage | Один UPDATE RESERVED→FINALIZED, monotonic reserve/debt, known counters и unknown сохраняются; receipt ожидает finalization padding1R1W1request | Сам не делает последующий native readback и не проверяет, что фактическая стоимость UPDATE совпала с padding |

Сохранять прежние2500R32W,2 reservation slots/UTC day (включая неуспешные принятые попытки), общий3500000R70000W и резерв следующего full59000R920W. Reader резервирует только2500/32;61500R952W — проверяемое свободное место reader+next-full, а не новый размер reader reservation. Не возвращать старые reservations и не переименовывать family для обхода2/day.

## Минимальная замена atomic gate

Сохранить один conditional INSERT и его namespace ACTIVE_SOURCE_BUDGET_READ. **Не** заменять его цепочкой loadDaily→evaluate→reserveRunBudget и не вызывать reserveRunBudget второй раз после успешного conditional INSERT. Принцип точного witness уже используется в `cloudflare/public-collector/private-price-consumer.mjs:reservePrivatePriceBudget`; его PRIVATE_PRICE slot/ACK protocol сюда переносить нельзя.

Локально загрузить handle только через `loadVerifiedNativeDayReconciliation({root:repositoryRoot,now_ts,generation})`; затем получить witness через `nativeReconciliationAtomicWitness({handle,now:now_ts,current_usage:db.usageSnapshot()})`. Root здесь — checkout репозитория, а не runtime/parent по аналогии с другим caller. Не создавать handle через register-функцию, ENV, JSON или caller flags. Нулевой/неподходящий handle выбирает обычную SQL-ветвь.

Общий indexed day scan внутри INSERT должен возвращать charged reads/writes как раньше: SUM(MAX(reserveR,measuredR+finalization-read-padding)) и SUM(MAX(reserveW,measuredW)); не заменять их одной measured суммой. В том же scan нужны число unknown rows, сумма unknown operations, количество RESERVED/некорректных rows и family_count. Null/неверный тип finalized counters, отрицательные значения и неизвестный state отказывают; они не становятся нулевой стоимостью. Для family использовать точный prefix/substr, а не wildcard семантику подчёркиваний LIKE.

Обе SQL-ветви сохраняют следующие условия; параметры не принимаются из пользовательского запроса:

```sql
charged_reads  + :reader_R + :next_full_R <= :max_day_R
AND charged_writes + :reader_W + :next_full_W <= :max_day_W
AND family_count < :max_runs_day
AND invalid_count = 0
```

В обычной ветви дополнительно `unknown_rows=0`. В exception ветви дополнительно:

```sql
unknown_rows = 1
AND unknown_operations = :w_unknown_ops
AND unfinished_count = 0
AND exact_verified_source = 1
```

`exact_verified_source` вычисляется **в этом же INSERT** как MAX(CASE…) для одного native ledger row. Все сравнения обязательны: reservation_id, day_utc, source_run_id, FINALIZED, started_ts; completed_ts — integer между witness.started_ts и completed_ts_max; reserves не меньше witness minima; measured R/W/requests и unknown_ops точно равны witness. Сам witness выбирает SQL-ветвь в доверенном коде, отдельного включаемого operator flag нет. До и после admission current invocation unknown обязан быть0. Новое unknown, другая historical row, дополнительный unknown row, другой UTC day или подмена любого поля закрывают grant.

Нынешний принятый pointer относится к UTC18/source39081512792, exact reservation R2RUN:1792281986592:65a2f7d46b6acfcc и15old unknown. Это происхождение известного proof, **не зашитые разрешающие числа для будущих суток**. Их исходные ledger значения и per-statement unknown сохраняются. Локальный loader здесь не переисполнялся и old proof заново не квалифицировался.

После known changes=1 требуется отдельный точный reservation readback с id/day/started_ts/state/reserves и closed current native usage. `changes=0` — отказ/duplicate, не дополнительный слот. Неизвестный changes/cost/readback — grant unknown, business queries запрещены. Optional loadDailyUsageAggregate+evaluate может дать диагностический snapshot в том же envelope, но не заменить atomic predicate; добавление SELECT требует включить его стоимость/guard в план.

## Guards и журналы до native приёмки

- Проверять checkout GITHUB_SHA = expected_main = fresh main; phase/fence/status/resume/generation по одному SHA. Current task/owner family, acquired/expiry≤90min, suffix owner=acquired, точные lease mirrors и явный native scope для этого reader обязательны. Offline worker lease и helper с именем OfflineReviewOwner сами по себе не дают live разрешения. Historical lease.expected_main не переписывать в latest head.
- На каждом transport до отправки проверять применимые main/owner/fence/expiry и неизменность UTC day. Оставить время и envelope на ledger accounting/readback; после expiry новой SQL нет. Изменение head/owner останавливает business reads, не возвращает reservation. Не продолжать новую старую дневную операцию после UTC rollover.
- RemoteD1Database включить с nativeQueryReceipts:true и bounded beforeRequest. Отдельно считать GitHub control HTTP и bridge HTTP; provider_HTTP=0 не означает total HTTP=0. Сначала объявить точный максимальный набор запросов/контролей, сохраняя общий/main/manual budget. Восемь SQL — только структурный пример: INSERT/readback/3business reads/finalize/readback плюс optional daily aggregate; это не native R/W bound или разрешение их выполнить.
- Проверять result shape, rows/body bounds, отсутствие business writes и evaluateWithinRunReservation до **и после** каждого read, включая последний routes. LIMIT128/64 не доказывает соответствующий native readcost. Missing source/cap/allowance остаётся UNKNOWN, отрицательный остаток — debt, не ноль с доступным grant.
- Сохранять metadata journal всех попыток, known partial counters и новые unknown. reconcileNativeQueryCosts должен совпасть с полным usage и не иметь overflow; client transport day не равен доказанному billing day или source clock. Raw SQL/params/credentials и полные cache payload не экспортировать.

## Failed admission и finalization: отдельная ось от business grant

| Ситуация | Business grant | Что требуется сохранить/сделать |
|---|---|---|
| Preflight отказ до native transport | Нет | Control HTTP отдельно; native SQL не считать выполненной |
| INSERT changes=0, native counters known | Нет | Billable read/write/request и journal сохраняются; cost не равен0 из-за отсутствия reservation |
| INSERT timeout/неизвестный ACK или native counter | Не подтверждён | Known subtotal+unknown сохраняются; не повторять INSERT и не считать slot возвращённым |
| Own INSERT known1, но later readback/business read unclosed | Нет новых business reads | Сохранить fixed reservation и unknown; только отдельно разрешённое ledger accounting собственного подтверждённого reservation |
| Finalizer нет ACK / unmatched row | Не доказывает finalized | Journal/known counters/unknown и pending debt сохраняются; blind retry запрещён |

При changes=0 строка нового reservation может отсутствовать. При неизвестном ACK она может существовать. Поэтому `admission_attempted=true → finalize(id)` без проверки собственности неверно: UPDATE может затронуть прежнюю RESERVED row с тем же id. Readback для accounting обязан отличать подтверждённую собственную строку с точным started_ts от прежнего duplicate; новое unknown не превращается в business exception.

В текущем standalone tool **нет определённого ledger owner для стоимости denied/ambiguous admission до admitted=true**. Журнал делает эту стоимость видимой, но не доказывает её отражение в общем ledger. Для полного покрытия координатору нужен заранее допущенный parent/control accounting либо отдельный строго ограниченный accounting-only протокол, который не создаёт business grant, не возвращает2slot и не повышает caps. Без такого binding нельзя ставить cost_ledger_closed=true. Это выявленный пробел, а не предложение запускать ещё один job для его обхода.

Для known owned reservation finalizeRunUsage оставить одноразовым и без возврата резерва. Его параметры включают usage.unknown_ops **до** UPDATE: новое unknown в ответе самого UPDATE не может автоматически попасть в уже отправленное поле unknown_ops. Поэтому after snapshot и журнал обязательны, а новый finalization unknown не получает historical exception. Сохранить before/receipt/after snapshots и фактический native delta UPDATE, проверить token/id/day/state/source run/measured fields/reserve monotonicity. Одного client receipt status=FINALIZED недостаточно как физического readback. Последующий SELECT сам имеет стоимость: его нужно оставить внутри2500/32 и journal, указав exact cutoff ledger measurements и tail usage. Если tail получает новое unknown или выходит за envelope, нельзя объявлять общий учёт закрытым; нужен отдельный admitted accounting/reconciliation, без повторного business action. Возможный readback в том же UPDATE reply требует отдельной проверки поддержки/семантики bridge; здесь такая поддержка не утверждается.

## Что будет означать успешное чтение

Daily table — внутренние source attempts с текущими policy caps. Monthly table — сохранённые LIQ allowances. Они не включают всю rolling60s/provider credit/manual/common consumer картину: например, public venue guards читают report2_provider_minute_ledger_v1 отдельно. Catalog eligibility также не даёт ни source acquisition, ни OHLCV, ни фактические позиции. Успешный snapshot остаётся точечной наблюдаемой информацией; последующий CoinEx/TIA либо иной1asset probe требует свежего отдельного admission всей цепочки с manual/main reserves, identity/units/clocks и своими ограничениями.

Нужные будущие controls координатора: current phase против stale/expired/foreign scope; ordinary и exact opaque witness; клонированный JSON/подменённая row/new unknown/UTC rollover;2slots/duplicate/day+next-full предел; zero-change/unknown ACK accounting; последний read unknown; finalize missing/mismatched ACK/readback и tail. Здесь они **не создавались и не запускались**. Старые accepted tests/probes не повторялись. Actual balances, свободный native бюджет и возможность source pilot по этому документу не приняты.
