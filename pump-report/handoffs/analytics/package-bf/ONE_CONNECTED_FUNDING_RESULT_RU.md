# BF — один connected funding case

**PASS**, ровно один новый искусственный connected case, одна Node invocation, exit0. Связь проверена от настоящего ROOT registry binder через настоящий createPumpSources/getOptional с fake broker до существующего explainOptionalFacts. Полный analyzePump/runner/worker не исполнялся; worker и runner сверены статически.

## Точные входы и допуск

ROOT module hashes:
- registry/funding-quote-profile.mjs: 2c784ba354ef78ec257267db834417081bc4e7040a1b5b5f03dad5df0a8dd858;
- runtime/worker.mjs: c56f14d2ab7d42e2ed69c031268f3350bee8ccb319a6e67d3b33830d40e9d7ec;
- runtime/runner.mjs: 08de29670f7cafec7efbbe76caba66138129fb2ace667730ea7a0a096a8de31e.

F593 profile SHA256 1e385bc060fe8ee3216166da97374201a805c768c3bdfd3f5033cffbf1e5d110; точное полное candidate_profile совпало с export REVIEWED_FUNDING_QUOTE_PROFILE. Все 28 read-input hashes/bytes проверены внутри единственной invocation до project imports; 24 модуля входят в чистую dependency closure. Sources/qualifier/parser не вызывались напрямую отдельными cases.

Prepared artifact ROOT: implementation eb1dd4c6e91c6d026522fd4b5e66e94081e0f4c9e142828de899cc5695bd561b, artifact SHA256 57ab43c95058e44541f98d9539186d57364b02259ba368c7720a5324f2fbe089, 68 modules. До исполнения проверено точное совпадение 26 относящихся сюда module bytes с локальными входами. Builder не повторялся; ROOT record о 7 delta/61 unchanged сохранён как его evidence, весь старый suite не запускался.

Положительный ROOT_BF_OFFLINE_CONNECTED_ADMISSION.json прочитан по immutable main e5f20d5ff80b4e192df4c23d8566ffc5e68adf83, git blob 9afdbf40cf962c24fcfc27763ba7f5c4660a7c2e, SHA256 6e6c98ded94441a96d84bec943a908b41dcf99b0e0487df5fe7a31b85a9d349e. Начальная локальная подготовка была до его публикации; исполнение — только после серверного чтения, собственной новой bounded CAS/FULL и fresh authority. affected-start отмечает SPENT_BEFORE_EXECUTION; ROOT admission helper не менял.

Test: pump-report/tests/analytics/bf-funding-binder-connected-once.mjs, 13716 bytes, SHA256 49be524377ae1da25a3b25cdcd0910635b89d3e619d3a3b6efa7b49053720906. Встроенный fixture ARTIFICIAL, отдельных saved market originals нет. Перед Node записаны predeclared/authority/start, затем EXECUTION_ONCE.lock не допускает повтор. Preload запрещает fetch. Команда и exit/stdout — one-command-result.json.

## Связанный результат

Использован реальный lazy-resolved DOOD identity из frozen native registry, но все возвращённые цены/сделки/funding/часы искусственные. Это не текущий funding DOOD и не повтор F588 fixture.

Fake funding row: lastFundingRate="-0.0100", fundingIntervalHours="2", updateTime=T−1000, receive=T−100, nextFundingTime=T+7200000; T=1793016000000 — искусственное время. Настоящий source сохранил rate=-0.01 без умножения/деления; period_ms=7200000; native decimal="-0.0100"; event_ts=rate_snapshot_ts=native_rate_quote_update_ts=1793015999000, received_ts=1793015999900. Next schedule не заменил quote clock.

Существующий consumer вернул точный finding:

> Фандинг BINGX_OFFICIAL_PUBLIC_API / BINGX: -1% за 2 ч; это контекст, а не направление будущей цены.

funding_payment_event_ts=null на верхнем уровне факта, внутри value и coverage; native_metadata_update_ts=null; rate_event_clock_proven=false. basis=ADAPTER_BASED_INFERENCE, vendor unit/quote-clock guarantees=false. В consumer сохранены правильные rate/actual period/source clocks/fact_id. Нормализованный Fact.origin=OBSERVED — обычное поведение источника для имитированного broker response; внешний evidence_class всех receipts ARTIFICIAL, поэтому это не native observation proof.

Ровно два fake broker requests: trades и premiumIndex, в этом порядке, оба для того же instrument ID. Trades USABLE, funding USABLE в искусственном контексте. OI NOT_CHECKED/OPTIONAL_KIND_NOT_REQUESTED, OI attempts0. Existing optional_total_max=2/optional_http_upper_bound=2/automatic_retries=0. Никаких настоящих HTTP, MCP, SQL, Telegram, Worker или deploy.

Source result сохранён до конечных assertions; consumer result — тоже до assertions. affected-result.json — итог после всех assertions. Новый binder/consumer gap не обнаружен.

## Офлайн-привязка всех выбранных записей

Проверены 552 native identities: seed13 + lazy539. Funding profile прикреплён к выбранным 550: seed11 + lazy539; BTC/ETH остались без funding binding. Для каждой выбранной записи профиль полностью равен F593 candidate_profile, прочие поля entry/instrument сохранены, исходный base registry не мутировал.

registry.resolveCatalogDecision сохранил ту же функцию/closure; registry.summary — ту же функцию и тот же результат. Выбранные записи действительно прошли resolve; это не только проверка exports или .instruments seed13. Полный inventory 550 IDs с путём SEED13/LAZY539 сохранён в registry-bindings-result.json. Он не содержит котировок или private market data.

Worker factory binding и runner requested_kinds=['trades','funding'] после existing ready gate проверены только текстом. Worker не импортировался и не вызывался. Эта часть не доказывает native Worker lifecycle, deployment binding или 550 доступных текущих funding responses.

## Граница приёмки

Проверено: один connected consumer path и офлайн-профиль 550. Не проверялись повторно старые qualifier/parser/suite cases. Нет нового live rate/HTTP coverage 550, AUTO/SENT, outcome или независимой vendor гарантии. Production BA и prepared BF pin этим тестом не активировались; дальнейшие native maintenance/deploy admissions принадлежат ROOT.

ANALYTICS менял только свой test и package-bf handoffs; ROOT/SOURCE/analytics runtime code не менялся. Сохранены LOOKUP11 spent/0 left при default10, provider19/24 и physicalHTTP UNKNOWN, бюджеты/unknowns/reserves/3manuals/9пауз/2OWNERdeferrals и старая пауза. BE остаётся историческим; center-only/дополнительная служебная строка карточки не внедрялись.
