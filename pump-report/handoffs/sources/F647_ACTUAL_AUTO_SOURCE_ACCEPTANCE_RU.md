# F647 — фактические источники AUTO: Q/AIN и ограничение суточного structural context

ACTUAL_CAPTURE_REVIEW_COMPLETE_SOURCE_PRICE_STRUCTURE_PREPARED_UNEXECUTED_NOT_DEPLOYED; ACTUAL_AUTO_CHAIN_OPEN. Проверены исходные сохранённые input/analysis двух AUTO PRODUCTION originals, а не пересчитанные аналоги. На обоих mandatory price/candles/relative volume/book пригодны в момент их исходного analysis_ts. Q прошёл часовой рост, но самостоятельный план не обоснован; AIN отклонён по PLAN_INVALIDATED. Ни у одного initial READY не наступил, поэтому optional stage не запускался. Это не source timeout/UNSUPPORTED. Полная реальная цепочка AUTO→план→карточка→SENT/ACK и весь28Oct не приняты.

Authority первоначального этапа main56a0c5926fb4563d315ed21ae5b6faa34d4819c0; continuation main8938ced41ae3d357694e8e34ef5c81530a5de075. ROOT CODEX:PUMP_REAL_AUTO_RECONCILIATION_20261029:1793250725000 до06:12:05UTC. Первая own37db51b/FULL05:14:33UTC освобождена257d8c1b3745dc7eb1c19a44b21ecbae252e6452/FULL05:23:31UTC за173s доexpiry. Continuation own40dd7ea6d5694abbf1f7e1d97294e9de60546c8a/FULL05:24:29UTC, expiry05:36:21UTC, отдельный новый owner, не продление старой.

## Точные private evidence

- pump-report/.private/observations/oct29-saved-auto-one-result.json — SHA2563767db7e3816c883fe447875db10e9858529eb58f25b09dca88e790f29210698,88781B, ROOT FINALIZED8SQL8R4W0unknown, market0/TG0. One known run/queue, whole_history_or_day_claimed=false.
- pump-report/.private/observations/oct29-selected-qa-two-result.json — SHA256a78b90495a491e0d3699b31d5301cc6b717a09070eb73d350a10773fbf08e9b9,1102820B, ROOT FINALIZED11SQL12R4W0unknown, market0/TG0. Два selected originals/не более1card/до2linked run PK; whole_day_or_history_claimed=false, independent_SENT_acceptance=false.
- Live75 artifact pump-report/.private/native-20261026/pump-outcome-coverage-v1-75-artifact.json — SHA256ff675daea75e751ecc104f293c2dc4d2d076b1f5fd638940671335483d7e31b2; implementation2988e3fe8e5278d1b40baa25053a2a49e899d5414ead750181e1ed6bbf9aa5cc.

Raw OHLC/books/полные originals в Git не переносились; handoff содержит только ссылки, метаданные и выводы. Оба originals OBSERVED/current_implementation_bound=true и тот же live75 pin. SOURCE не исполнял analyzePump, Node, tests, native или market IO.

## Почему именно ready=false

| Original | Момент анализа Москва28Oct | Факт допуска | Сохранённый отказ | Optional/card |
|---|---|---|---|---|
| Q, run231d0efc-d9bf-46b5-9dec-0a8c432caeb8 | 19:02:00.680 | automatic_eligible=true/current_threshold_passed=true;60m+10.395519775988781%; CALM_PULLBACK | REJECTED/readyfalse; единственная причина INDEPENDENT_PULLBACK_PLAN_NOT_JUSTIFIED, plan=null | trades/OI/funding facts отсутствуют, map NOT_CHECKED/OPTIONAL_MAP_NOT_REQUESTED; card/trace=null |
| AIN, run4d0df418-ce91-4a2d-b175-882f56950493 | 11:06:58.596 | automatic_eligible=false/current_threshold_passed=false;60m+0.1293661060802087%,24h+14.768683274021344%; CANCELLED | REJECTED/readyfalse; PLAN_INVALIDATED, plan=null | тот же ready-only этап не запускался; card/trace=null |

Q original: pump:analysis:f5cf10bbc9343e2fd8dc83ed82f20a22be5f0ef850c04908cdd864daeb16f902.
AIN original: pump:analysis:bcb67743f55505862c02a178aa0803d1b0c08f9c645fd9c4fece8c67b9195311.

Это сохранённые причины, не искусственная новая оценка плана. Существование подходящей +10% exit zone не доказано SOURCE; thresholds и правила не менялись. У AIN current price оказался ниже основания наблюдаемой волны согласно saved analysis; новый источник не устраняет это аналитическое событие.

## Пригодность mandatory на исходных часах

| Original/fact | age at analysis, ms | remaining life, ms | Unit/охват |
|---|---:|---:|---|
| Q price | 8680 | 21320 | USDT_PER_BASE, USABLE |
| Q candles | 60680 | 29320 | OHLC_USDT_NATIVE_REPORTED_QUANTITY,125/125closed, gaps0 |
| Q book | 1090 | 13910 | USDT_PRICE_BASE_QUANTITY,273bid/349ask |
| Q growth24h | 60680 | 29320 | USDT_CLOSED_ROLLING_24H,1440included/grid complete |
| AIN price | 9596 | 20404 | USDT_PER_BASE, USABLE |
| AIN candles | 58596 | 31404 | тот же относительный unit,125/125closed, gaps0 |
| AIN book | 644 | 14356 | USDT_PRICE_BASE_QUANTITY,734bid/929ask |
| AIN growth24h | 58596 | 31404 | тот же24h unit,1440included/grid complete |

У всех перечисленных фактов event≤received≤analysis≤expiry, exact instrument_id и identity/evidence refs сохранены. Оба books двусторонние и uncrossed. Обе сетки125closed1m непрерывны, у каждой один comparison key и time/volume refs на строках. Relative_volume_qualified=true; volume_base во всех125rows=null, absolute_BASE/USD_qualified=false. Это принятая CCXT consumer open-time/native-relative convention, не новая vendor guarantee.

Q: impulse/baseline ratio5.22549842647483, baseline FULL12; current/impulse0.5658321414683337. AIN: ratio2.727758142627475, FULL12; current/impulse1.1471944575860566. В обоих сохранено сравнение SAME_NATIVE_REPORTED_QUANTITY, абсолютный неизвестный объём не публикуется.

Оба ticker_24h INCOMPLETE/ROLLING_24H_OPEN_UNQUALIFIED. Это не подменялось текущим ticker reported change: отдельный пригодный growth_24h связывает1440closed/grid/исходный receipt, endTime и accepted time proof. Q его24h return−0.8332023266781952%, поэтому рост доказан именно60m, не24h. Оба анализа исторические28Oct; повторное чтение29Oct не делает факты свежими. До publication/recheck не дошло, пригодность во время отправки не заявляется.

## Optional блоки и фактические расходы

Runner133–148 обогащает только initial ready, сначала map, затем trades/funding в одном deadline. У Q/AIN initial readyfalse: input.liquidations NOT_CHECKED/OPTIONAL_MAP_NOT_REQUESTED, facts.trades/funding/open_interest отсутствуют. Это не провал API/недоступность/UNSUPPORTED и не квалификация данных этих блоков. OI текущий ready-only runner всё равно не запрашивает: requested_kinds=['trades','funding']; для нового OI нужен независимый unit proof.

Q linked run checked3 (Q/BLESS/XAN), total14BINGX receipts, TG0/Swole0; AIN linked run checked1(AIN),6BINGX receipts, TG0/Swole0. Это расходы целых linked runs; не приписывать14Q-candidate или6толькоCORE. CORE-пакет каждого exact original имеет свои receipt refs в manifest. Сохранённые отказы/unknowns/holds не возвращались.

Кодовые COST границы сохранены: trades+funding0..2 уже внутри BINGX10/global12candidate; optional map1 — не потраченная по умолчанию capacity. AUTO discovery2 отдельно/global14, MANUAL catalog1 отдельно/global13; forced delivery price/book2+TG1 physical3 внутри reserve4. Бюджет, cache hit и actual provider composition принимаются по ledger/receipt, nativeSQL по ACK; null actual cost в getCoverage не ноль.

## Конкретное ограничение source→plan: уже полученные1440rows

Подтверждено кодом live75 и обоими originals: day-growth.mjs16–53 принимает1440closed OHLC, проверяет high/low/сетку/границы, но included map сохраняет только open/close, а выходной value только open,last,start_ts,end_ts,window_ms. Полного high/low path или day pivots в growth_24h.value/derived_from нет. Исходный receipt и observed_closed_rows1440 сохранены, сами1440rows — нет.

В готовом original для текущей структуры остаются125CORE OHLC. Q next_wave содержит46confirmed pivots, AIN39; все привязаны к своему текущему candles fact, ни один не раньше CORE window_start. Previous waves у обоих уже EXPIRED по expires_ts исходного input; эти старые anchors не объявляются текущей пригодной structural exit. Полный raw day body в переданных originals отсутствует. Нельзя из open/last или числа1440 восстановить экстремумы, добавить target, переиспользовать неизвестный cache либо объявить Q READY.

Это доказанное ограничение представления и передачи уже полученного structural context; само по себе оно не доказывает ошибочность сохранённого plan refusal. ROOT утвердил shared contract27197268f6a3ffd0f98176191236855722d5d6fc. SOURCE подготовил additive price-only projection из ТОГО ЖЕ closed1440 response; ANALYTICS отдельно готовит causal pivots/plan-only consumer. Scalar growth24h и CORE125 сохраняют прежние поля и алгоритм; новое marketHTTP не добавляется. Дополнительные bytes/SQL/storage/capacity не объявляются0 и не обходят2OWNERdeferrals. Shared contract и structural selection принадлежат ROOT/ANALYTICS.

ROOT подготовил один общий affected case pump-report/tests/runtime/price-structure-connected-once.mjs, UNEXECUTED при source review. Он берёт реальные Q/AIN originals как CORE-only baseline, а старшую1440 историю создаёт явно SYNTHETIC с тем же CORE tail; это не actual Q reconstruction. SOURCE статически сверил interface: extra fact, те же clocks/receipt/cache,5pricecolumns и incomplete-grid отказ совместимы. Отдельные SOURCE runner/case/test файлы не создавались. Producer byte-overflow и full fact/original bytes отмечены ROOT как дополнительные границы того же общего case; Source их не исполнял. Старый original не обогащается, исходный отказ сохраняется. No repeated accepted tests/audit.

## Catalog/coverage: разные множества

Frozen75 registry прочитана как data, JS не запускался. retained13+reviewed539=552saved identities; BTC/ETH2 excluded→550saved selected;541имеют reviewed orderbook unit evidence,9не имеют. Все проверенные present artifact modules совпали с локальными SHA; operator sources/coverage.mjs отсутствует в graph75 и не выдан за native installed consumer.

Фактические срезы отличаются:

| Saved run | catalog total/qualified/unqualified | delivery послеBTCETH | eligible deep + units deferred | unresolved subset |
|---|---|---|---|---|
| AIN11:06 |1305/551/754|549|540+9|32|
| Q19:02 |1305/550/755|548|539+9|261|
| latest19:56 |1305/550/755|548|539+9|263|

550qualified catalog здесь включаетBTC/ETH, тогда как550saved selected исключает их; одинаковое число не одно множество. Current membership не берётся из frozen registry. Из exact frozen resolver следует, что runtime catalog вернул меньше552positive identities; IDs не вошедших строк полного catalog payload в packet не даны, не угадывались. Full CORE550/548 и global crypto N не доказаны.

Frozen9 без unit proof:1000PEPE,10000SATS,1000BONK,1000000BABYDOGE,1000CAT,1000000MOG,1000CHEEMS,1000SHIB,10000NEX (exactIDs в manifest). source-evidence-admission3–12 проверяет tuple и orderbook evidence_ref, market_data_checked=false; это временный capacity refusal, не blacklist. Множитель числового префикса символа не выдумывается.

UNIVERSE_QUALIFICATION_INCOMPLETE — subset unqualified по четырём reason codes runner263: CRYPTO_ASSET_IDENTITY_UNQUALIFIED / CATALOG_REGISTRY_IDENTITY_MISMATCH / MISSING_OR_DUPLICATE_NATIVE_SYMBOL / INVALID_CATALOG_ROW. Packet содержит counts32/261/263, но не эти строки/их breakdown. Это не263 CORE failures и не все755 unqualified; конкретная классификация каждого незахваченного row неизвестна.

getCoverage() default перечисляет observed coverageRows; include_universe:true явно строит локальный selected registry denominator и ставит globalN=null/current_full_CORE_proven=false/current_fresh=null. producer_wired не actual-check. normalizeSourceCoverage сохраняет NOT_CHECKED с reservation receipt как skipped metadata, не checked/absent/UNSUPPORTED; historical check axes могут пересекаться. Старая capture не fresh550.

## Последний run и WHOLE_CANDIDATE

Known447a3146-e5b1-4b51-b5b1-8f65f087051f released28Oct19:56:11.622МСК: INCOMPLETE, checked[], delivery[], one selection CAP, queue16, только5leaders/leaders_truncated=true. CAP deferred NOT_CHECKED/PROTECTED_DAY_RESERVE/WHOLE_CANDIDATE_PLANNED_ALLOCATION до CORE. Доказаны2DISCOVERY receipts (catalog/overview), coverage548/548/invalid0, original/card=null. Q/AIN не checked в этом run; их exact originals относятся к отдельным связанным runs выше.

resources.mode STATISTICS — mutable последний budget mode: checkOutcomes209 его переключает, budget.summary245 возвращает его. Discovery coverage заполняется runner265 только при execute AUTO. Поэтому строкаSTATISTICS не доказывает отдельный STATISTICS executor. При этом один saved run не весь28Oct.

Ledger28Oct450project/BINGX, plan638/charged450/fraction0.8/protected_at_creation102. 10hour buckets по3logical base attempts, total30/charged120. Всего surplus rows53 across days;28Oct23CLOSED/logical_spent, original276/consumed90/remaining186. Эти186не возвращены; grants не успешные53CORE. TELEGRAM.days28Oct key absent — не глобальный доказанный0. Старые2unknown сохранены.

Budget191 оценивает plan.charged+whole upper12+held+baseExtra+future discovery/candidates против638 ДО pacing/provider checks. Поэтому450<638 не доказывает ещё один whole candidate. Точный held/future на момент отказа нельзя получить из позднего snapshot одной арифметикой. SOURCE не меняет ROOT-owned бюджет/лимиты/holds.

SOURCE data clock/unit failure в2originals не найден. Конкретный дальнейший joint code gap — не переданный day structural context, а не повод убрать PLAN/10% gate. Live75 AUTO1DL1/2988/ff675 не менялся; no sourcequalification25, Node/tests/build/provider/nativeSQL/CF/TG/search/newconnections=0. TZ0674/unified384e/719/10групп, старые расходы/unknowns/holds/manual3/caps/9пауз/2OWNERdeferrals сохранены.

## Подготовленный SOURCE код и утверждённый interface

Новая code own72cd8e69999da308498d95c801310b61bc84c2bd/FULL05:36:48UTC, owner CODEX:SOURCES:01a171fd:1793252200000, expiry05:48:40UTC; свежие17guards/all4 exact по27197268. Предыдущая continuation own освобождена073b20ef6963d2e2d302c4831a23c2b05d482808/FULL05:35:06UTC за75s доexpiry. История ранних F647 leases сохранена.

Scoped code freeze3b23a1baa03698739a0fce695019bab3fc6cd3dd, FULL всех2own files/current ref05:39:31UTC. Только source+diff изменены относительно own parent; branch не самостоятельный production artifact. Зависимость ROOT shared contract351f9ab9dc21918574c7a23824f68f46b828d7f9c8937e31453d8e02a7b8b025 / CONTRACT3ba03eff162c9336f2c333fed799bd7f13f43f3bc46eea72842c568cbc9148a1 и decision43a3b6fa5b3e03d79a9a4971091e30b4212d39b545674c531ec0e6389e980ee1.

- pump-report/sources/day-growth.mjs — SHA256ae3051009290114cde7c71d7304c18e31cd0a0c3739e85967106f8ace37b5c7f,11313B; baseline live75 SHA6e397080a7fd99fb466b286d916e7df97ce17eedea244ac9cdf3230d3f0c8b93.
- pump-report/handoffs/sources/F647_PRICE_STRUCTURE_SOURCE.diff — SHA2563ad9a55a61de5bea31290d1d1e42a39e5505e10fb8e55418e0efd2f88becf1b2,5595B.

Единственный source change: included map сохраняет также high/low и после прежней exact-grid квалификации строит1440ascending arrays [open_ts,open,high,low,close]. finish создаёт второй факт price_structure с unitUSDT_OHLC_MINUTE_PRICE_ONLY из той же response, identity/source/provider/venue, event/received/expiry/cache и receipt; derived_from связывает parent growth fact. Existing growth_24h object construction/coverage и request route/params/count не менялись; отдельно125CORE не затронут.

Утверждённый предел131072UTF8bytes относится к JSON МАССИВУ value, как записано в CONTRACT_RU97, а не ко всему envelope; раннее SOURCE предложение whole-fact limit не применено. Один final JSON/TextEncoder подсчёт, никакого prefix serialization. Точно1440rows либо optional context value=null/statusINCOMPLETE/PRICE_STRUCTURE_BYTE_BOUND_EXCEEDED; truncation запрещён. Если исходный day не USABLE, новый факт также не USABLE/value=null с исходной причиной. Scalar growth24h при дополнительном byteoverflow не меняется. Не добавляются quantity, guessed units, HTTP, отдельные keys или source SQL.

Полный fact/original больше value из-за envelope; native bytes/capacity ещё НЕ измерены. ROOT должен измерить их в одном общем case и соблюдать существующие D1/native guards до установки. Source не поднимаетcap и не вызывает storage acceptance. Rawcontext остаётся private в existing original и не попадает в Git; diff содержит толькокод.

Consumer ROOT/ANALYTICS проверяет envelope/identity/unit/source/clocks/полную сетку и совпадение OHLC на перекрытии CORE. Одни совпадающие ranges недостаточны. Исторические pivots толькоcausal/known≤analysis_ts, толькоplan-level pool; они не меняют seed/reclaim/wave/volume/baseline/invalidation/thresholds/10%/liquidity. Q READY не обещается. Shared assertInput делегирует новый optional kind этому consumer; mandatory facts остаются строгими.

Статический review общего ROOT case: source loader signature/result совпадают; synthetic history явно не actualQ; CORE-only Q/AIN snapshot,8consumernegativefallback, cancelledAIN, incomplete sourcegrid и fakeACK проверяются только ROOT после отдельного admission. Отдельного source case нет. Node/import/tests/build/native/provider/TG выполненоSOURCE0; PASS и deploy не заявлены. Ожидается ROOT freeze совместного пакета/один connected qualification/дальнейшие actual admissions.
