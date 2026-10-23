# Новый естественный отчёт 39161429947: BTW и 龙虾

Архив привязан к native head `07703e786565eb2e0bbb4727f70ef6680115c07b`, business run `1792353732784-1792353743745`, artifact `12148887893`, SHA-256 `a3ea8666f2329b63accdd6c353dc53268703d3fc86ce09b8f2a4bc8c9d0ac47a`. Оригинал уже был скачан координатором; исполнитель сделал точную локальную копию ZIP и metadata. Нового получения GitHub run/artifact, рыночных HTTP, SQL или Telegram здесь нет. Исходный порядок кандидатов `龙虾-USDT`, затем `BTW-USDT` сохранён.

## Почему BTW OBSERVE не доказывает Telegram failure

BTW: `SHORT / OBSERVE`, интерес82, snapshot `S392:BTW-USDT:1792353804311`, publication `PUB:c6e9f21e5f5b806e4718749bf82542c264b6e361`. Сохранены рабочая область2.408662USDT, триггер цены<=2.408662 на5m, отмена>2.48 и исходные сроки. `lifecycle_event=NULL`, actionability `UNASSESSED`, reasonNULL. Оба delivery-артефакта показывают0 exact same-run SENT; cases пуст, message_id отсутствует. Это не квитанция ошибки Telegram.

Сохранённый `ORIGINAL_OBSERVATION_SOURCE_ROLE_AUDIT_V1` проверял факты на исходном времени кандидата. Он прямо показывает `FEWER_THAN_TWO_VERIFIED_DISTINCT_ORIGINS`, gatefalse, usable1: только `HTX_OFFICIAL / EXECUTION_TRUTH`. Четыре публичные метрики Gate — funding, OI1h, price4h, taker balance1h — исключены как `FACT_OR_IDENTITY_NOT_VERIFIED`; числовые значения не экспортированы. Это совокупная причина проверки нескольких обязательных полей: конкретный недостающий флаг или identity envelope из компактного тела установить нельзя. Причину нельзя переименовать в устаревание, ошибку Gate или несовпадение монеты без оригинального envelope.

Exact native code требует HTX execution и как минимум два проверенных разных origin. `canonical-lifecycle-authority.mjs` отказывает `OBSERVE_SOURCE_ROLES_NOT_CLOSED` перед созданием нового lifecycle, если дошёл до этой проверки; publication и bound delivery повторяют это условие. Поэтому необходимое условие публикации BTW доказанно не закрыто. Но **точный первый runtime отказ остаётся UNKNOWN**: compact canonical не содержит metadata.direction_resolution/source_role_view, полной строки с created_ts, handoff/early/prior-visible/removal context и самого authority return receipt. Их нельзя достроить из итогового текста и прогнать урезанный canonical как исходный. Более ранние identity/time/direction и sidecar guards также могут остановить цепочку.

Надпись о свежем Gate в ручном отчёте и полезные N12 сделки Gate относятся к другим фактам и потребителям. BSC transfer, агрегированный сектор и две компоненты HTX также не заменяют требуемый publication role. Изменения gate/стратегии/формы этим пакетом не предлагаются.

## Полезные факты и действительные ограничения блоков

| Блок | 龙虾-USDT | BTW-USDT |
|---|---|---|
| N05 | Одно полное4h окно HTX futures, покупки42091.81/продажи97923.64USDT. 24h tape остаётся warming/gapped:806 проверенных/634 непроверенных минут. | HTX4h не закрыт, но сохранён отдельный полный4h Poloniex spot:2411.13/2386.59USDT. Подмена его фьючерсным потоком недопустима. |
| N10 | Три нейтрально оценённых факта: диапазон20 закрытых60min и два пути15 закрытых1m HTX futures/spot. | Четыре таких факта: дополнительно Poloniex15 закрытых1m,12 активных минут. HTX spot/futures расходятся; Poloniex согласуется с futures в своём окне, без усреднения цен. |
| N12 | Использованы ограниченные HTX samples38futures/84spot и отдельный Gate spot1128 сделок. | Использованы HTX158futures/163spot и Gate spot1357 сделок. |
| N15 | Один CoinGecko meme basket50, `lobster-2`, исходный token key `bsc:0xeccbb861c0dda7efd964010085488b69317e4444`. Actual score+1.2. | CoinGecko `bitway`, bsc0x444045b0ee1ee319a660a5e3d604ca0ffa35acaa, DeFi50, actual+0.2999; CoinPaprika `btw-bitway`, DeFi50, actual−0.0186; итого+0.2813. |

N05 у обоих показан в ручном отчёте, но decision use остаётся `USE_NOT_PROVEN`, score0. N10 имеет3/4 neutral assessment receipts, N12 по2; ненулевых баллов нет. N12 raw sampled flow и N05 полное4h окно сохраняются раздельно; окна не складываются, HTX остаётся одной биржей. Наличие2used provider IDs не означает2qualified OBSERVE roles.

У N12 сохранены выбранные exact evidence IDs, raw_hash, upstream, asset, first_known и expiry. На исходном времени кандидата эти receipts известны и не истекли. Возраст source clock: HTX51348/48584ms, Gate62606/85893ms для 龙虾/BTW соответственно; это не transport latency. У HTX multi-market компонентов часть полей окон/quote/receiptNULL — они оставлены NULL. Полные исходные тела в этом ZIP отсутствуют, raw_hash не заменяет replay.

N10 source_ts диапазона20часов — исходное поле receipt, а не восстановленный конец последней свечи; у минутного пути source_ts — закрытое окно. Эти часы не обновлялись. Цели или причинное control effect по нейтральным фактам не объявлены.

N15 использован и отображён. Presentation receipts с score0 не отменяют actual score receipts. CoinGecko и CoinPaprika дают разные rolling24h корзины/котировки: BTW−7.69%/медиана−5.19% против−3.62%/−6.20%; нельзя усреднять их или считать независимыми первичными биржевыми голосами. Прежнее shared предложение различать coverage max0.6 и resolved per-fact cap2 не является новым дефектом, вес не менялся. Raw current asset binding envelopes здесь отсутствуют: exact retained key сохраняется, новая квалификация идентичности не заявляется.

## Порядок, fallback и общий бюджет

У 龙虾 сохранён public venue order Gate→Backpack→Bitget→Poloniex→Gate futures N12→KuCoin N12; у BTW Poloniex→Gate→Backpack→Bitget→Gate futures N12→KuCoin N12. N15 очередь 龙虾 начинает CoinGecko; BTW — joint flow/large trades, затем CoinGecko. Это уже сохранённая операционная история полезности и порядка, не новое покрытие и не predictive weight.

В обоих случаях EXTERNAL_N05_FLOW имеет5actualHTTP; тот же результат указан в N12 и **не суммируется до10**. У 龙虾 итог `CALLER_FIVE_REQUEST_CAP`, у BTW `CLOSED_NATIVE_TAKER_CANDLES_FOUR_HOURS`. Экспорт содержит17/16 receipt counts, но только ограниченные детали с routeNULL; полный текущий порядок попыток и provider headroom **UNKNOWN**. Каталог очереди, HTTP200/RECEIVED_NOT_QUALIFIED или пропуск collector не дают права объявлять провайдера полезным/сломавшимся или обходить5HTTP. Проверенный single-source информационный факт сохраняется при незакрытом общем межбиржевом выводе.

## LIQ и китайская идентичность

BTW имеет4 расчётных Swolecharts сценария с исходным clock1792353793370, возраст10941ms на решении, reference2.43181USD. Четыре цены2.38925/2.3163/2.17039/2.62027USD сохранены полностью. В ручном выводе показаны1уровень выше и2ниже с объединением близких; это не4наблюдаемые позиции. Их notional/position_countNULL, exact USDT amount отсутствует, target eligibilityfalse, future factual zones0. Текущая HTX цена2.423459USDT не используется как FX или знаменатель расстояния для USD модели. `displayed_zone_count=0` относится к factual panel и не отменяет ручные model строки.

У 龙虾 уровней и сценариев нет. CoinBoss сохранён как exact identity unverified: прежний запрос `龙虾` вернул `BTC`, current network_calls0, automatic repeatfalse. Это доказанный отказ конкретного маршрута; не основание исключать монету из других блоков. Native symbol сохранён побайтно, без транслитерации или догадок по имени. HTX local model у обоих отключена по указанию владельца. Пустой acquisition routes audit не доказывает отсутствие всех upstream обращений: фактический model source и его clock сохранены, но транспортная квитанция в compact export не раскрыта.

Во время анализа исправлена локальная ошибка типов: N04 physical root `bsc|64hex transaction hash|log index` сначала ошибочно сопоставлялся с N15 `bsc:40hex token address`. Это разные сущности; конфликта token identity не установлено. Координатор получил исправление до каких-либо shared изменений. Проверка длины/типа roots включена в новый audit; N04 не менялся и повторно не проверялся.

## Проверка и продолжение

`python3 checkpoints/source-worker-btw-cjk-natural-20261018/audit.py --check` проверяет новый оригинал, все6member hashes, metadata, exact run/head/snapshot/clocks, отдельные fact/consumer/role пути, пределы вывода, типы roots и воспроизводимость analysis.json. Используются pinned Git blobs exact native head; runtime функции с неполными входами не вызываются. Принятые391583/391552,2053/2062/489/491 suites не повторялись. Третий исполнитель сохраняет своё0SQL receipts направление; completion accounting только копируется внутри immutable ZIP и не подменяется нашим аудитом.

Изменения ограничены этим checkpoint prefix. Общие файлы, runtime, веса/формы/70,105assets/122contracts/9пауз, caps, unknown и потраченные резервы не менялись. Собственный CAS `d423910562c4d18a707ecf943ebf52081b29baa2`, owner `CODEX:SOURCES:01a14e11:1792354722098`, expected main `5cdb0b2f62c7fa3f189beb7046adb6b83449cec3`, working base exact native07703; release передаётся координатору отдельно.

Следующее решение координатора: принять этот новый retained-case разбор; для **точного первого** lifecycle отказа использовать уже сохраняемую authority-return квитанцию, если она есть, иначе оставить UNKNOWN. Не выполнять новые market/SQL/Telegram запросы только ради закрытия этого пробела без отдельного допуска. Квалификация второго primary source/publication role и фактическая same-run доставка остаются открытыми. Этот пакет не закрывает все105активов или общие семь направлений приёмки.
