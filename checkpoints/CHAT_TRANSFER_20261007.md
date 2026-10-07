ПЕРЕДАЧА ПРОЕКТА «МОЙ ОТЧЁТ 2» — 07.10.2026, вечер МСК
Владелец: Владимир.
Репозиторий: https://github.com/kovalev23091987-jpg/my-report-2-cloud-runner
Этот текст — инструкция продолжить уже начатую работу, а не начинать проект заново.

1. ЗАДАЧА И ПОЛНОМОЧИЯ

Владимир разрешил вносить изменения и продолжать работу крупными связанными пакетами без подтверждения после каждой задачи. Приоритет: максимально полезный ликвидационный блок, автоматический поиск данных во время отчёта и улучшение остальных блоков. Нужны реальные факты и их использование, а не подключения ради подключения.

Нельзя решать задачу ручной настройкой уровней под отдельные монеты. Система должна работать по существующей общей базе криптофьючерсов. Стремиться к более чем 10 реально участвующим блокам, при возможности 12/13/15; искусственно увеличивать число нельзя. Проверенные нейтральные сведения полезны, но не равны ненулевому score или независимому голосу.

Предложение распределять источники по дням недели было предложением, а не обязательным ТЗ. Старые цены нельзя выдавать за текущие уровни. Допустимы сохранённые структурные подсказки с обязательной свежей повторной проверкой позиции.

2. ГДЕ НАХОДИТСЯ ДЕЙСТВУЮЩАЯ ВЕРСИЯ

Рабочая версия только свежий main. До checkpoint передачи main:
33af2beda9febe124557a47db7ddaa8011542048.
Последнее внедрение кода — PR227, squash:
5c809b24705264f627618cba186eb624972fe495.
Checkpoint передачи меняет документы/сохраняет доказательства, но не добавляет исправление следующего дефекта.

В начале прочитать по точному свежему SHA:
- AGENTS.md;
- MY_REPORT_2_STARTUP_CONTRACT.md;
- REPORT2_CURRENT_GENERATION.json;
- checkpoints/CURRENT_PROJECT_STATUS.json;
- checkpoints/CLOUD_PHASE_STATE_20261004.json;
- audit-fixes/source-optimization-20260930/execution-lock.json;
- checkpoints/FULL_OWNER_TASK_REGISTER_20261007.json;
- checkpoints/CHAT_TRANSFER_20261007.md;
- checkpoints/CHAT_TRANSFER_STATE_20261007.json.

Перед изменениями, тестами и живыми вызовами одним пакетом проверять свежий main, phase и fence. Получить собственный ограниченный lease через CAS и прочитать обратно. Чужой действующий lease запрещает работу. При передаче прежний собственный lease освобождается; всё равно проверить новое состояние, поскольку штатное обслуживание может получить другой lease.

Прежний owner:
HTX:20261007:1791394702919:connected-source-health.
Не присваивать его новому чату и не сбрасывать чужую блокировку.

Надпись current_phase=COMPLETE относится к ранее принятому ограниченному функциональному этапу. Полный проект НЕ завершён. project_complete=false, block_configuration_complete=false, new_connection_search_complete=false. Полный реестр: 86 исходных требований, 16 задач блоков (15 основных и ликвидации), 24 задачи/поправки владельца. Нельзя объявить всё выполненным из-за старого COMPLETE или успешного тестового workflow.

3. ЧТО УЖЕ СДЕЛАНО — НЕ ПОВТОРЯТЬ

3.1. Telegram и полезные веса

Telegram уже настроен. Сохранять утверждённый краткий формат: понятные существенные основания, направление/стадия/оценка, точные условия и отмена, подписанные уровни. В кратком Telegram до 2 уровней с каждой стороны, ручной формат до 4. Технический контекст, расписание и дата снимка скрыты в новых сообщениях; backend проверки действуют.

Есть исторически доказанные реальные доставки:
- AKE OBSERVE SENT152 после PR202;
- NEAR OBSERVE SENT153 после PR206.
Это не приёмка более поздних PR207–227. Не переписывать исходные canonical texts и не отправлять старый снимок повторно.

PR207/208 внедрили индивидуальные полезные потолки блоков и ограниченный еженедельный статистический механизм, а также распределение ликвидационных запросов. Факт внедрения доказан; полная эмпирическая эффективность весов не доказана.
Доказательство:
checkpoints/USEFUL_WEIGHTS_AND_LIQUIDATION_PAIR_RELEASE_20261007.json.
Основные семейства 35/30/20/15, дополнительные 32/30/20/18 и порог70 сохраняются. Нельзя менять веса наугад ради количества сигналов.

3.2. Native ликвидации и повторное использование

PR209–216: повторное использование свежих исходных native данных, ограниченная weekly маршрутизация и структурные подсказки, официальный discovery, оригинальные часы, точное чтение кошельков/позиций и защита квот. Swole/официальные Hyperliquid discovery-маршруты используют тот же Hyperliquid upstream, а не новые независимые источники. Есть реальные сохранённые native позиции, включая FIL/PENGU; не повторять эти source probes без нового дефекта.

PR217–221: проверяемая условная модель dYdX, pinned runtime, точные полные аккаунты, плотная страница и общий снимок для двух выбранных активов.
Реальная сохранённая проверка 37625020734:
200 полных аккаунтов, 166 позиций, 33 проверенных условных уровня по 18 активам.
Это ограниченная выборка, не перепись всего рынка. Условная цена на текущем состоянии аккаунта не гарантирует будущую неизменность остальных позиций/обеспечения.
Доказательства:
- checkpoints/DYDX_DENSE_NATIVE_PAGE_RUNTIME_RELEASE_20261007.json;
- checkpoints/DYDX_SHARED_PAIR_DENSE_CONSUMER_RELEASE_20261007.json.
При повторном анализе использовать исходные часы этого факта, а не делать старые данные свежими.

PR222–224: gTrade — общая discovery/структурная маршрутизация и точная проверка выбранного актива, правильный полный расход полезного чтения. Реальные native данные ранее проверены. Доказательства:
- checkpoints/GTRADE_STRUCTURAL_THREE_READ_RUNTIME_RELEASE_20261007.json;
- checkpoints/GTRADE_EXACT_SELECTED_NATIVE_CONNECTED_RELEASE_20261007.json.
Каталог или HTTP200 не считаются доказанными ликвидационными уровнями.

3.3. PR225 — автоматический поиск в отчёте, N05/N15

Внедрено:
- автоматическое чтение ограниченной страницы dYdX до 200 полных аккаунтов без заранее сохранённой подсказки для конкретной монеты;
- точная идентичность по замороженной базе;
- общий снимок для выбранной пары, повторное использование второй монетой без новых HTTP при вызове соответствующего маршрута;
- bounded cursor обновляется только после проверенной полной страницы;
- полезный gTrade запрос оценивается по полному расходу 3/4 чтения, а не по одному каталогу;
- отсутствие/пропуск выборки не маскируется под закрытый факт;
- N05 получил исходные часы/причины закрытия;
- N15 может обновить недостающую/устаревшую точную котировку выбранного актива в уже разрешённом бюджете, сохраняя исходные часы остальных сравнений.

PR225:
production head 9553b767201075011276b3e9c5925ea1f33d24a5.
Cloud 37646042120 SUCCESS.
Проверки: 151 routing, 5 automatic-report, 14 gTrade, 32 core, 18 CoinGecko, 3 sector, 35 delivery, 37 integration scenarios.
Доказательство:
checkpoints/AUTOMATIC_REPORT_SOURCE_SEARCH_AND_N05_N15_RELEASE_20261007.json.
Повторять этот неизменённый полный пакет не нужно.

3.4. PR226 — реальные primary факты ETH/BNB для N03/N04

Внедрено чтение финализированного native состояния:
- ETH, chain1: execution burn=baseFee*gasUsed, с явной оговоркой, что это не net issuance;
- BNB, chain56: настоящие native переводы из финализированного блока;
- назначенные потребители N03/N04 проверяют proof заново и отклоняют подмену.

BNB проверен через официальный dataseed; прежний PublicNode BNB давал403. ETH и BNB фактические ответы сохранены. AVAX не активирован, пустой кандидат не принят.
В одном захвате максимум2 физических HTTP/4 RPC; bounded 2000 транзакций/2MB; исходный TTL20мин, отрицательный backoff30мин. Нет независимого голоса только за повторное чтение одной сети; контекст нейтральный, не самовольный ENTRY.

PR226 merge:
cbf0b3b81a88772735c24821cec0211b55c6eeba.
Фактические cloud proofs 37650500853 и37651164902.
Доказательство:
checkpoints/NATIVE_EVM_PRIMARY_CONNECTED_RELEASE_20261007.json.
Реальные source inputs и controlled consumer проверены; нельзя утверждать, что новый естественный выбранный актив автоматически получил эти факты или SENT.

3.5. PR227 — source health, часы и ошибки сохранения

Это последнее внедрение кода.

Исправлена неверная классификация dYdX:
проверенная текущая pinned страница без подходящего уровня означает рабочий transport/schema и EMPTY_BOUNDED_SAMPLE, а не поломку источника. При этом пустая выборка не становится ликвидационной картой, направлением или разрешением входа.

Source state допускается только после реальной проверки pinned snapshot; привязан к run/contract, исходным height/hash/receipt hashes и времени, защищён проверкой доверенного runtime state. Скопированное/подменённое/чужое/устаревшее состояние не закрывает health. Возраст native состояния≤120сек.

Добавлен внутренний liquidation_source_acquisition_audit в canonical artifact:
до 16KB, до двух выбранных монет, ограниченные маршруты, исходные native часы/height/hash, real HTTP/reservations, coverage и skip outcomes. Сам audit не делает новых HTTP или D1 запросов и не меняет entry.

HTX signed tape: точные диагностические этапы ошибок:
D1_ADMISSION, INSTALL_EVIDENCE_SOURCE_STORE, READ_PREVIOUS_RING,
MERGE_VERIFIED_MINUTES, WRITE_MERGED_RING, READBACK_MERGED_RING.
Сохраняются первоначальные часы захвата и безопасный error code/name, без выдуманного повтора, доказательства сохранения или обновления timestamp.

PR227 cloud:
37661995768 SUCCESS, tested head23991d26e5625967c516dc491bea4e17335c8b5f.
74 direct/runtime tests +37 integration scenarios PASS; full assembled validation PASS; утверждённые delivery goldens35PASS.
SourceHTTP0,D1=0,MAIN=0,Telegram=0 у контролируемой проверки.
Artifact11501246776:
sha256:bbe29c58f95a6e39cba2e37745c27435a2acb9442543b3957f0a38ff6b5cbb62.
Merge5c809b24705264f627618cba186eb624972fe495.
Доказательства:
- checkpoints/NATIVE_SOURCE_HEALTH_CONNECTED_RELEASE_20261007.json;
- checkpoints/NATIVE_SOURCE_HEALTH_CONNECTED_VERIFICATION_20261007.json;
- checkpoints/native-source-health-tests-37661995768/.

4. ПОСЛЕДНИЙ ФАКТИЧЕСКИЙ ШТАТНЫЙ ОТЧЁТ ПОСЛЕ PR227

Workflow37663457675 SUCCESS, запуск по расписанию, head33af2beda9febe124557a47db7ddaa8011542048.
Run1791396042828-1791396051751.
Generated2026-10-07T18:02:14.378Z =21:02:14 МСК.
Canonical status CLOSED; решения по обеим монетам REJECTED, direction=null.

QNT-USDT:
snapshot S392:QNT-USDT:1791396129446.
11 участвующих блоков:
N02,N03,N04,N05,N07,N08,N09,N10,N11,N12,N16.
13 checked,0 score_applied.

龙虾-USDT:
snapshot S392:龙虾-USDT:1791396093323.
11 участвующих:
N02,N03,N04,N05,N08,N09,N10,N11,N12,N15,N16.
14 checked,0 score_applied.

Оба получили полное проверенное N05 окно240 закрытых минут:
1791381600000→1791396000000.
Возраст окна относительно observation:
QNT129446мс; 龙虾93323мс — в допустимой свежести.
QNT сохранённый ring1618минут, observed1791396101108.
龙虾 ring1306минут, observed1791396068081.
Это факты последнего снимка, не вечное обещание полноты следующих окон.
BR в этом запуске не выбран; актуальная причина прежнего пропуска BR не установлена. Нельзя объявлять BR исправленным.
24h остаётся отложенной метрикой, даже когда отдельный источник дал полный24h.

Новые будущие ликвидационные уровни:0 у обоих.
Новый Telegram SENT:0.
Причина передачи: CANONICAL_DIRECTION_NOT_CLOSED.
Нельзя ради приёмки обходить направление/сценарий или отправлять REJECTED.

PR227 health подтверждён естественным запуском:
для 龙虾 gTrade SYMBOL_UNSUPPORTED, actualHTTP1;
dYdX DYDX_NO_ELIGIBLE_SAMPLE_LEVEL, actualHTTP3,
transport/schema CLOSED, operational_success=true,
coverage EMPTY_BOUNDED_SAMPLE, role_usable=false.
Проверено200 полных аккаунтов, не весь рынок.
Source1791396085552, observed1791396087033.
Height108474180.
Block hash5BB76D99ED8EE8B5238A401EBA6FF82B04F5A526CD4E6D8E5F030FF263D2C6A7.
Shared native budget: reserved4,actual4,max5.

Оригинальные артефакты:
report11502056801,
digest d41f63bf0e68f55e9c1baacdb39940d42d749416501b4c0437f5ad4ca045a1db;
Telegram proof11502311118,
digest80b8eb61f525055acb6e14598602fe570de5f46d963b5a5148099db94953d5e6.

Доказательства сохранены:
- checkpoints/POST_PR227_NATURAL_REPORT_37663457675.json;
- checkpoints/source-inputs/post-pr227-natural-37663457675.json.gz;
- checkpoints/POST_PR227_TELEGRAM_37663457675.json;
- checkpoints/POST_PR227_NATURAL_RETAINED_READBACK_20261007.json.

Readback review:
codex/post-pr227-natural-readback-20261007,
proof head ed705f78474574e2a77daf32147c676d760d5cfc.
Успешное сохранение cloud37665278637.
Предыдущий readback37664832621 упал на GitHub createBlob HTTP500. Это проблема сохранения артефакта, не сбой штатного отчёта/источника. Устранено проверкой content-addressed blob SHA и безопасным идентичным повтором. Штатный отчёт/source probe ради этого не повторяли.

5. ГДЕ ОСТАНОВИЛАСЬ РАБОТА — ПЕРВЫЙ НОВЫЙ ДЕФЕКТ

В последнем реальном отчёте найден пропуск повторного использования dYdX для второй монеты, QNT.

CANDIDATE_SOURCE_CONFIRMATION_ROUTE:
interest_score64, cross_exchange4HTTP,
liquidation_http_cap0,
liquidation_lane_reserved=false,
liquidation_collection_started=false,
liquidation_context_returned=false.
Coverage admission разрешал автоматический dYdX поиск.
Общий текущий dYdX снимок уже был получен для первой монеты:
его возраст для QNT около44сек, в пределах120сек.
Но вызывающий worker вообще не запускает native collection при cap0, поэтому уже имеющийся свежий снимок не используется за0новыхHTTP.
В audit только два маршрута первой монеты, у QNT нет native route.
Это обнаруженный caller gate, а не доказанный дефект transport/deadline в combined service.

ИСПРАВЛЕНИЕ ЕЩЁ НЕ ВНЕСЕНО.

Следующий пакет:
- изучить current-generation/files/src/worker.js возле CANDIDATE_SOURCE_CONFIRMATION_ROUTE;
- изучить combined-runner-service и wiring runtime collector;
- дать второму точному выбранному активу безопасный доступ только к уже проверенному свежему same-run native snapshot при нулевом бюджете новых HTTP;
- не запускать новый source HTTP, не увеличивать лимиты, не снимать interest/entry gate, не обновлять исходные часы;
- не допускать чужой run, stale/future/tampered snapshot;
- сохранить distinction: отсутствие подходящего уровня — честное отсутствие в выборке, не успешная карта;
- проверить на сохранённом реальном dense snapshot и на actual post227 пустой выборке;
- проверить полноценную assembled цепочку и неизменность Telegram/score/entry.
Не настраивать исключение конкретно для QNT: дефект воспроизводится общим маршрутом второй монеты.

Worker — большой frozen producer (~601KB). До изменения прочитать текущие проверки ожидаемого хэша/overlay и сохранить согласованность; не обходить validate и не регенерировать утверждённые golden тексты ради прохождения теста.

6. SYNFUTURES: ПРОВЕРЕНО, НЕ ПРИНЯТО, НЕ ПОВТОРЯТЬ СТАРЫЙ ЗАПРОС

Новый кандидат проверен фактически:
cloud37664319184, source head22b2cc192ebed18333858f1e9e7059ce71dfa187.
Workflow SUCCESS означает, что доказательство неудачи сохранено.
Источник ACTUAL_SYNFUTURES_CANDIDATE_NOT_CLOSED:
"The operation was aborted due to timeout".

Официальный старый Graph:
https://api.synfutures.com/thegraph/v3-base.
Фактически1HTTP; зарезервировано2.
До native RPC дело не дошло.
0 пригодных позиций,0 уровней; production_enabled=false.
CHAIN_RPC счётчик100→102, лимит720; возврат/сброс квоты не делался.
Shared minute reservation2/6.
D1 usage65reads/11writes/16requests, unknown_ops0; finalized record64reads отличается на дополнительное чтение финализации.
MAIN0,Telegram0,newSENT=false.

Proof/review:
codex/synfutures-native-capability-20261007,
head93c8ad2c8f71607b9bf185de9c2cae1af021f9f6.
Artifact11501544231:
digest3ccd535eedf165f12ee02c3986ff5e6e004dc591166fafc59f6a68e8072dc6ec.
Файлы:
checkpoints/synfutures-native-candidate-37664319184/
  synfutures-native-candidate-proof.json
  synfutures-native-candidate-raw.json.gz
  synfutures-candidate-model.tap
checkpoints/synfutures-candidate/
  official-source-manifest-20261007.json
  observer-pinned-readonly-abi.json
  base-pinned-config.json

5 модельных тестов прошли; они не заменяют реальную позицию и не дают разрешения активировать источник.

Исследованы первичные официальные репозитории:
SynFutures/oyster-sdk, tree aa43ccbf84fde833473552e1d65db2543cd4f178, последний commit2025-11-24, SDK0.2.33.
SynFutures/ts-sdk, tree a09a3ed460c1fa727ed4df9db0218fd5aa949409 — более новый SDK.
Новый API https://mainnet-api.monday.trade:
v4 position/list требует chainId,address и подпись/auth; это не открытая глобальная страница позиций. Не подставлять случайный wallet для обхода авторизации.

Старый pinned Base config:
chain8453,
Observer0xDb166a6E454d2a273Cd50CCD6420703564B2a830,
USDC0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913,
официальный публичный RPC https://mainnet.base.org.
Observer ABI содержит getAllInstruments(), getInstrumentBatch(), getAcc().
Сохранённый маленький readonly ABI сейчас содержит только getInstrumentBatch/getAcc; getAllInstruments ещё не добавлен/проверен живым вызовом.

Возможный НОВЫЙ путь — пока только проект решения:
- ограниченный native catalogue через readonly Observer;
- ограниченная свежая страница Trade/Adjust logs по проверенным инструментам для поиска активных аккаунтов;
- pinned getInstrumentBatch/getAcc на одном исходном block/hash;
- точная полная позиция/обеспечение, проверенная текущая SDK математика, отказ при неучтённых orders/ranges;
- точная связь с общей CEX базой, не ticker-only;
- ограничение размера/страницы/аккаунтов и предварительный общий дневной/минутный admission.
Новый путь должен отличаться от уже провалившегося Graph. Не повторять идентичный Graph/subgraphProxy.

Не использовать устаревшую версию формулы/контрактов без актуальной проверки.
Avantis мигрировал в Veranta v2 в2026; старые v1 constants нельзя переносить вслепую.
Ранее неудачные Ostium Graph проверки также не повторять без нового обстоятельства.
Нельзя объявить SynFutures/Veranta работающим источником до фактической позиции, исходного времени, проверяемого уровня и назначения потребителя.

7. ЧТО ОСТАЛОСЬ, ПОМИМО ДВУХ ПРИОРИТЕТНЫХ ПАКЕТОВ

- Общая настройка/полезность всех15 основных блоков и ликвидационного блока по полному реестру; не ограничиваться только LIQ.
- Расширение фактической coverage и source identity для неподдержанных активов, с ролями primary/confirming/additional/fallback.
- Более чем10 участников при реальной доступности информации;11 уже фактически подтверждено, но12/13/15 для каждого актива не доказаны и не обязательны.
- N01,N02,N05,N12,N15 — повышенный приоритет. Не включать N13/N17 обратно ради счётчика.
- BR N05: известен прежний stale/missing acquisition, точная причина ещё не установлена. PR227 добавляет диагностику, но исправление конкретной причины нельзя заявлять заранее.
- Дальнейшая независимость: повторные данные одного HTX/Hyperliquid/chain upstream не новые независимые подтверждения направления.
- Полная история30–90дней по всем102 активам пока частична.
- Prospective статистика весов/сигналов/пропущенных возможностей не завершена; нужные будущие наблюдения нельзя выдумать или заменить backtest. В реестре есть критерии30дней/200наблюдений — проверить точный scope.
- Новая полная приёмка текущего выпуска требует свежего same-run canonical→утверждённый Telegram SENT/message_id при естественно выполненных условиях. Последний отчёт дал REJECTED, поэтому отправки нет; не обходить фильтры.
- Сохранить фактические original-clock proofs, source cost, artifact digest, run/head/snapshot и отдельную приёмку каждой монеты. Не смешивать разные запуски.

8. НЕИЗМЕНЯЕМЫЕ ОГРАНИЧЕНИЯ

Universe119контрактов/102актива/3семейства;17inverse/delivery ограничения.
Threshold70; family35/30/20/15, supplemental32/30/20/18.
Не ослаблять direction,entry,scenario,freshness или approved Telegram.
Полный анализ40мин, collector5мин.
Лёгкая5минпроверка — цена/отмена уже отправленного OBSERVE/WAIT из штатного collector; не полный анализ/ENTRY/новые source HTTP.

Whole HTTP cap164.
D1/day3.5млн reads/70тыс writes.
Native ordinary cap5, manual8, weekly120; сверять точный контекст квот в current main.
CHAIN_RPC720/day; shared native EVM minute6.
GTRADE4000/day, DYDX1000/day по существующему admission.
Резервы/счётчики не обнулять, не возвращать для прохождения теста.
Nansen0 — отложен.
Отложен только exact signed raw24h; N05полное240мин окно остаётся обязательным, свежесть≤5мин.
Будущие native уровни исходный age≤120сек.
Реализованные ликвидации не будущие уровни.
Расчётные оценки разрешены только на реально полученных точных входах и проверенной методике с явной подписью. Произвольные HTX уровни из выдуманных плеч запрещены.
Близкие уровни объединять в пределах5% отдельно сверху/снизу, показывать дальний исходный уровень, суммы между перекрывающимися источниками не складывать.

9. ПРАКТИЧЕСКИ КАК ПРОДОЛЖИТЬ

Не зависеть от памяти предыдущего чата или transient V8 store. Все важные факты читать заново из main/review proof по точному SHA.
В предыдущей среде shell exec зависал; основная работа выполнена GitHub connector +облачные GitHub Actions.
Production:
.github/workflows/report2.yml
current-generation/apply-runtime-overlay.mjs
current-generation/files/runner-main.mjs
current-generation/files/src/worker.js
current-generation/files/src/liquidation-extension/combined-runner-service.mjs
current-generation/files/src/liquidation-extension/dydx-runtime-collector.mjs
current-generation/files/src/liquidation-source-acquisition-audit.mjs
current-generation/files/src/htx-signed-tape.mjs.

GitHub fetch structuredContent.content:
generic fetch — JSON string;
fetch_file/job logs — raw text; проверить isError перед использованием.
Workflow dispatch может отсутствовать; proof workflows ранее запускались push в подготовленную review branch.
Перед merge/CAS всегда свежий main+lease+fence; merge squash с expected head.
Masked logs не источник точных чисел. Не восстанавливать замаскированные digits; использовать canonical artifact/raw proof.
Не повторять завершённые проверки «на всякий случай»: после конкретного изменения — связанные тесты и одна assembled проверка.
Source connectivity, fact verification, controlled consumer, natural report и SENT — разные степени доказательства.

Не создавать chat automations, отдельные старые FIL/AKE monitors, тестовые Telegram сообщения. Не обещать агентную работу после завершения ответа: штатные jobs продолжаются независимо, активный агент — только в текущей сессии.

БЛИЖАЙШИЙ ПОРЯДОК:
1) Прочитать свежий main/документы/guard, взять свой lease.
2) Исправить общий zero-new-HTTP reuse caller gate второй монеты.
3) Связанный пакет проверок на уже сохранённых real inputs +assembled cloud validation.
4) Исследовать и проверять только новый bounded native путь SynFutures/Veranta, с текущим SDK и честным no-activation при отсутствии полезного факта.
5) Продолжить остальные блоки и полный реестр крупными пакетами.
6) Существенные результаты сохранять в main/current status/phase; полный проект не объявлять законченным без фактической приёмки.
