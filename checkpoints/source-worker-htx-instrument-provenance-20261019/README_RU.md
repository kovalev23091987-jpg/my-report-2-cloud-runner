# Уже сохранённые HTX instrument metadata

Найден конкретный retained native witness: unfiltered HTX catalog391236, source1792323140029, recorded receipt1792323140215, полный body191341B/SHA `e184d100b36d405a576f6dbb2b2ce24e9e446569c994f272b81750ffdb0ea828`. Новых provider запросов/SQL нет. Это snapshot на исходном cut18Oct, не свежая проверка19Oct.

| Exact native contract | contract_size | price_tick | create_date lexeme | role/status |
|---|---:|---:|---|---|
| AAVE-USDT | 0.1 | 0.001 | 20201120 | swap/swap/USDT, status1 |
| BTC-USDT | 0.001 | 0.1 | 20201021 | swap/swap/USDT, status1 |

Поля contract_code/symbol/business_type/contract_type/trade_partition/contract_size/price_tick/create_date/contract_status присутствуют в обеих exact native строках. Их pointers, native receipt/hash и исходные часы сохранены в `retained-native-witness.json`. Там же отдельный новый current-local full retained input read/hash/parse marker1792413991290 — conservative known-by этого чтения, не original/native ACK и не настоящее первое знание.

Approved105/122 manifest уже содержит structural contract_size/price_tick/role/source_ts; current Worker scan сохраняет size/tick, а instrument_scope.evidence — роль. Это не потеря всех полезных метаданных. Но create_date/native bodySHA/точная chronology completion не экспортируются вместе как отдельный current-instrument receipt. Original unfiltered catalog не попадает в existing signed-tape capture, поскольку тот требует exact contract_code query. В `existing-code-path.json` даны точные файлы/хеши/anchors.

Два BTC typed input — **Binance** spot и USD-M BTCUSDT. HTX BTC-USDT metadata не связывает их venue/instrument/epoch/size. HTX AAVE4h input содержит окно1774785600000→1774800000000, значительно раньше имеющегося catalog snapshot; create_date не доказывает неизменность size с момента создания. Оба BTC и AAVE сохраняют прежние blocked card/memory/watch, identity/epochfalse и historical contractsizeNULL. Exact граница по каждому input — `typed-consumer-boundary.json`.

Из существующего native body можно повторно использовать **обсервацию current native metadata**, но нельзя перенести HTX size в Binance, заменить contractsize на conversion1, придумать historical interval/native epoch или закрыть projectidentity по symbol. Старый approved manifest и новый сохранённый catalog не создают continuous history между двумя точками. Native contract_size field unit в данном пакете независимо не квалифицирована.

`current-instrument-hook-proposal.md` задаёт один optional completed-fetch hook и bounded DTO для уже полученного payload, без нового reader/framework/index/SQL/HTTP. Это инженерное предложение координатору: production/общие файлы не менялись, executable patch/helper не добавлялись. Поэтому новой runtime-проверки нет; старые typed1/14swaps/543/545/normalizers не запускались. Проведена только provenance-сверка нового metadata witness с сохранённым receipt и code anchors.

Native qualification/историческая continuity/current19Oct metadata/реальный independent anomaly consumer/native IO/CPU/heap/persistence/delivery остаются OPEN. ENTRY/physicalstorage отложены владельцем. Стратегия, score, формы105, caps и резервы не менялись.
