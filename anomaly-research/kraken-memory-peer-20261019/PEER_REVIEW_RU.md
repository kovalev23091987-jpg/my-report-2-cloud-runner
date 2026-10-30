# Независимый обзор Kraken memory integration

Итоговый head `eee03b691f2c99910fcd92e9fb89a9c9b84e9d5b`, база `43a2441864c746cf188e1820a029db63c0bf689f`. Оставшихся блокеров в проверенной кодовой области не обнаружено. Исполнитель `01a14f2c-d037-7472-8f8f-76753a3a3bba`, 19.10.2026, только readonly peer и собственные evidence-файлы.

Проверялась новая связанная интеграция уже собранных Kraken originals: N05 producer → ephemeral capsule → N10 price context и N12 bounded trades → общий consumer/formatter. Прежние source-пакеты504/505/507/509 и их тесты повторно не исполнялись; глобального поиска поставщиков не было. Три новых конкретных замечания переданы координатору до окончания пакета и исправлены в нём.

## Найденные и устранённые замечания

1. **Часы compact N10.** Первая версия verifier сравнивала first-known с component observed и decision clock, но не запрещала first-known раньше конца закрытого окна. Даже после самосогласованного пересчёта hashes это логически невозможная доступность данных. В069447c2 введена цепочка целых часов `window_end/source_ts <= component.observed_ts == first_known_ts <= row/price_path.observed_ts <= now`. Source clock не обновляется на время повторного использования.
2. **Native alias в N12 receipts.** Producer использует `krakenNativeMarketCode`, где DOGE→XDG и BTC→XBT. Первый N12 URL validator подставлял простой contract string и отвергал настоящие alias-URL как чужие. В069447c2 оба пути используют один существующий helper; контроль исходного URL и cursor сохранён. Новые alias cases имеют статус CONTROLLED, не доказывают текущее подключение DOGE/BTC.
3. **Согласованность вложенного DTO.** Первая compact-проверка передавала `price_path` в fact reconstruction целиком и могла принять пересчитанный raw hash при чужой nested identity, иной version или candle_count. ВEEE явно проверяются `price_path.identity == component.identity`, точная версия и15 свечей. После общей CI координатор выполнил только один новый self-consistent-rehash case по этим инвариантам.

Эти выводы получены чтением кода. Worker не запускал reproduction scripts, приложения, unit tests, workflows или native probes. Сохранённые тестовые логи принадлежат координатору.

## Что проверено в связанной цепочке

Producer сохраняет прежний N05 payload: version/observed/instrument/candles/pages. Новые trade receipt fields и capsule остаются в памяти. Capsule — nonenumerable property возвращаемого component; JSON projection не может выдать её за durable handoff. Внешний N05 wrapper копирует result поверхностно и сохраняет ссылки на components. Его baseline map клонирует только Gate/Binance, поэтому Kraken capsule там не теряется.

N12 создаётся только при сохранённых исходных trade receipt URL/status/received time/body hash/parsed-payload hash/next cursor и точном совпадении страниц. Старый cache HIT без таких receipts сохраняет прежний N05 результат и может дать N10 из полного payload, но не придумывает N12 fact. Повторных HTTP или новых cache read routes не добавлено.

N10 producer заново сопоставляет полный240m raw grid с компонентом и execution prices, выбирает15 закрытых минут и требует уже имеющийся точный HTX spot reply того же окна. HTX futures/spot window и Kraken не усредняются; расхождения показываются отдельно. Futures-анализ сохраняется при отсутствии пригодного spot context.

Stored N10 consumer проверяет компактные15 bars, счётчики, clocks, identity/schema и hashes при явном `COMPACT_PRODUCER_RECEIPT_NOT_NATIVE_CACHE_ACK`. Он не объявляет повторное чтение всех240 raw minutes или native cache ACK. Это сознательная граница доверия к producer receipt.

Kraken memory вынесена из прежнего набора SQL groups: она не занимает один из четырёх slots и не вытесняет старые venues. После неизвестного native расхода новые SQL прекращаются; уже проверенные в памяти факты не удаляются из-за optional cache write failure. Полезность таких фактов и storage ACK различаются.

Порядок worker clocks проверен: decision time обновляется после получения исходных inputs. Новый context не считается будущим только из-за первоначального cycle start; фактические source/first-known/expiry остаются оригинальными. N12 TTL1min действует независимо от N10 TTL5min. JSON-serialization намеренно теряет capsule и не может заново авторизовать memory path.

Formatter проверяет специализированные N10/N12 validators перед выводом. Короткие факты доходят до manual и обеих Telegram policies в контролируемом каноническом примере. Покупки/продажи берутся из подтверждённой raw taker side; цвет свечи не используется как доказательство потока или манипуляции. Contribution0, coverage0, directional/risk null и запрет самостоятельного ENTRY сохраняются.

Import graph не создаёт цикл: collector → memory reuse → N12 sample → pure N10 preparation → pure flow normalizer. N10 context и formatter не возвращаются импортом в collector. Capsule не сериализует полный240m cache в N10 row: там только выбранные15 bars, component и hashes.

## Точное переиспользование проверки

Единственная общая CI `39222245111` выполнена на `069447c2dadbf6361eb1fdfb59b4cd9ec749b78b`: **25PASS/0FAIL**, artifact `12172510952`, ZIP SHA256 `46fc1d05c1fa0f3069056b79c1b9bc086ab754afc270b2e9032d6c4479d27c3e`. Старый2084 job пропущен. В исходном ZIP пять members: assembly, controlled originals proof, before/after guards и connected-tests log. Повторного GET или job dispatch этим worker нет.

EEE меняет из квалифицированного runtime только N10 compact verifier. Остальные runtime-файлы совпадают с069 по байтам. Новый nested DTO case отдельно завершился1PASS/0FAIL; исходные25 и source-worker cases не повторялись. One-off workflow job/guard/scope исключены из production diff;069 остаётся неизменяемым доказательством CI.

Paired old/new collector cases используют точные исторические ALGO/XMR bodies и CONTROLLED transport/HTX envelopes. Они сверяют прежние provider requests, SQL log и N05 payload bytes, в том числе optional write failure/unknown. Это проверка кода с контролируемым DB, а не новая production SQL-квалификация.

Все исходные receipts, source hashes и сохранённые логи перечислены в `peer-evidence.json`. Одна итоговая проверка собственного evidence-пакета касается целостности и точной Git-привязки; runtime worker не исполняет.

## Ограничения

Новые current105 coverage, независимое фактическое HTX/Kraken сравнение, native cache ACK, native storage throughput и exact Telegram delivery здесь не приняты. Исторический Kraken оригинал и CONTROLLED HTX envelope не заменяют эти доказательства.

Равенство N05 cache payload не означает равенство всего canonical/private body size. Дополнительные информационные rows могут увеличить сериализованное тело. Общие memory/CPU/wire/storage/provider/day residuals и следующий full требуют своего actual admission; номинальные caps не являются свободным бюджетом. Стратегия, score, формы, лимиты, паузы и основной LIQ этим peer не менялись.
