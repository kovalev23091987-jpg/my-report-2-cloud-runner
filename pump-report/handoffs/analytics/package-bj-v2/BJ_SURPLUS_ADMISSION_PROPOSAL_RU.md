# BJ — surplus без изменения базового почасового банка

**STATIC PROPOSAL, не разрешение IO и не изменение policy.** Текущий код намеренно сохраняет равномерный базовый план: allocation фиксируется при создании, используется целочисленный candidates_per_period; переносятся только неиспользованные места уже прошедших часов. Отказ EVEN_DAY_CANDIDATE_ALLOCATION соответствует этой policy, даже если отдельная арифметическая компонента бюджета положительна. Это конкретный tradeoff: гарантированная равномерность и простая проверка против неиспользованной возможности проверить дополнительные подходящие текущие кандидаты. По BH это не доказанный программный дефект.

В frozen ROOT_CAPTURED_CAPACITY_ARITHMETIC_ONLY.json (SHA256 b543931c98e1374826e2350d2247c52a7c5076a61217228efb34bfd8f5714d0b) записано42 незакреплённых HTTP после будущих scans/base/manual/delivery/outcomes. Снимок старый; provider/month/native проверки не закрыты. Его арифметическое поле о возможных extra не является текущим допуском. BJ не утверждает доступность2/h или3extra, не пересчитывает текущий остаток и не выполняет новый readback.

## Один минимальный совместимый вариант

Сохранить действующие allocation/pacing/candidate_count, перенос, веса, приоритеты и все caps. По умолчанию поведение прежнее. После отдельного решения ROOT можно добавить **условный расход действительно незакреплённой ёмкости**, не расширяя базовую норму:

1. Если есть обычное накопленное место — использовать обычный admitCandidate.
2. Если отказ только EVEN_DAY_CANDIDATE_ALLOCATION, рассматривать один следующий кандидат по существующим due/source/priority/growth правилам. Иные отказы остаются отказами.
3. Проверить свежий вектор capacity: planned automatic allocation, project day, каждый нужный provider day/month, minute/backoff/route, per-run HTTP/hot/candidate и native SQL/run/shared-day. Защитить те же manual/delivery/outcomes, будущие light scans и будущие **базовые** candidate часы. Не занимать будущую ёмкость ради текущей.
4. До IO атомарно закрепить полный upper bound операции из **unassigned** части. Нужен отдельный idempotent surplus grant с run_id+candidate_id, вектором global/provider и outstanding hold. Старый base candidate_count не уменьшать и не перезаписывать; surplus grant не становится перенесённым base-местом.
5. Каждый HTTP по-прежнему проходит существующий reserve/assertTarget/finalize. Hold должен конвертироваться в фактически charged по тому же ресурсу, а не считаться одновременно свободным и уже потраченным. Другие admissions обязаны учитывать непогашенные holds.
6. Выданный logical grant навсегда spent независимо от READY/SENT/малого расхода. Доказанно неиспользованный HTTP hold можно освободить только при положительной полной финализации и согласовании attempted/charged/outstanding; это не возврат logical места. При неизвестном ACK/незавершённой операции верхний hold сохраняется. Можно выбрать более консервативное удержание до конца периода; цена — меньшая полезная ёмкость.

Никакой обязанности N кандидатов в час: без подходящего кандидата или при неполном доказательстве —0 extra. Базовый банк не повышается, cap не переименовывается, unknown/reserve не возвращается. Это **новое условное spending-решение ROOT**, а не формальная смена имени старого запрета. Текущая policy сама его не разрешает.

## Что уже есть и что реально надо прочитать/зарезервировать

| Существующее место | Нужные точные данные/граница |
|---|---|
| pump_report_state_v1, state_key=pump:resources | value_json **и revision**: days; providers.days/months/recent/backoff; automatic_plans; allocations/pacing; outstanding/unknown. Старый snapshot или только total недостаточен |
| runtime/production-policy + provider-policy | Точный approved version, planned fraction, selected candidate upper/vector, manual reserve3, routes/free quota, day/month/minute/second caps, active backoff и expiry. Глобальный запас не заменяет отдельный запас Telegram/BingX/другого включённого provider |
| native runner ledger report2_runner_budget_ledger_shadow | Текущий UTC day, собственная RESERVED запись PUMP:AUTO:run_id, исходный envelope; shared r/w/unknown/unacknowledged и manual obligations. Использовать существующий reserveNativeRun с day index/положительным PK readback; не изобретать свободный native остаток из HTTP |
| Текущий D1Store admission/usage | expires_ts, remaining requests/R/W после всего нового CAS/readback и обязательной финализации; существующий runner.capacity для CORE+delivery, текущий native envelope и shared-day floors/futureScheduledSQL |
| Текущий выбранный candidate/источниковые admission | Проверенный instrument/source scope и точный состав маршрутов. Upper12 и вектор BingX10/Telegram1/unassigned map1 — сохранённый общий bound, а не положительный допуск неизвестному map-provider |

Точные существующие SQL формы: SELECT value_json,revision FROM pump_report_state_v1 WHERE state_key=? LIMIT1; UPDATE ... value_json=?,revision=revision+1 ... WHERE state_key=? AND revision=?; для отсутствующей строки INSERT OR IGNORE. Суммы native ledger и INSERT...SELECT reservation выполняются уже имеющимся reserveNativeRun, затем SELECT собственной reservation_id. BJ **эти SQL не выполнял** и не выдаёт новый lookup/control grant: LOOKUP12 spent, CONTROL6 spent сохраняются.

## Атомарность и недостающая реализация

Сейчас admitCandidate:162–194 — forecast, **не whole-operation IO reservation**: resource CAS повторно проверяет состояние и увеличивает логический count, но не удерживает весь upperHTTP. Простое удаление строки177 или второй вызов с другим именем небезопасны.

Минимальная будущая реализация должна держать surplus grant/holds в той же pump:resources строке: один SELECT revision → проверка всех global/provider/period constraints с актуальным clock → один revision-predicated CAS с debit/hold/idempotent grant. CAS loser повторно оценивает свежий state; потерянный ACK не даёт повторного grant. Нельзя сначала записать grant, а потом отдельно списать бюджет.

Existing D1Store.atomic имеет до5 попыток CAS; их worst-case queries/R/W и readback тоже должны помещаться в admission. Его atomicPair объединяет только state rows; это **не** атомарность с report2_runner_budget_ledger_shadow или внешней provider quota. Native reservation и resource hold — разные границы: native допуск сначала, затем resource CAS, перед каждым IO прежние guards. На частичном/неизвестном исходе не возвращать выдачу и не считать0. Нужны native proof взаимного учёта holds/charges, конкуренции, retry/idempotence и finalization; этого у BJ нет. Внешний provider баланс/другие потребители также не доказаны project ledger.

## Сценарии на бумаге (не tests)

| Условие | Решение |
|---|---|
| Базовое прошлое/текущее место ещё есть | Обычная ветка; surplus не нужен |
| Base исчерпан, свежие все caps/native/protected floors проходят, grant CAS выигран | Условно одна допроверка из unassigned; не обещание идеи/отправки |
| Старые42 HTTP есть только в frozen arithmetic, либо provider/month/native неизвестен | Extra запрещён; текущего admission нет |
| Два претендента видят один surplus | Только выигравший revision CAS получает hold; второй перечитывает, не использует старый остаток |
| Проверка расходовала мало HTTP, но не дала READY/SENT | Logical grant spent; будущие base часы и manual-reserves не трогать |
| Неизвестный ACK, недостаток native finalization/query envelope | Fail closed/hold retained, без refund/reset/новой семьи CONTROL/LOOKUP |
| Нет подходящего кандидата |0 extra; никакой нормы «обязательно N» |

BH не повторялся: использовано только принятое доказательство бюджетного defer перед CORE. Никаких runtime/code/policy изменений, Node/imports/tests/engine/providerHTTP/MCP/nativeSQL/TG/deploy. LIVE funding AUTO1/DL1, LOOKUP12/default10, CONTROL6, qualification22/24, бюджеты/unknowns/reserves/9пауз/2OWNERdeferrals/старая пауза сохраняются. ROOT принимает дальнейшее spending-решение и отдельные actual admissions.
