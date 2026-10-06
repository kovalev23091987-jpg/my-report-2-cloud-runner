# Проверка каталога и фактического использования источников — 06.10.2026

Проверенный общий запуск: 37394649188, исходное время 06.10.2026 00:35:49.274 UTC / 03:35:49.274 МСК. Монеты LSK-USDT и NEAR-USDT. Этот документ не является новым живым запуском. Изменения PR169–170 проверены отдельно на сохранённых данных; их свежая общая приёмка ещё ожидается.

В 15 основных блоках назначено 32 логических маршрута (от одного до четырёх в блоке). Реализация маршрута не означает применимость к каждому из 102 активов. Это 32 назначения, а не 32 независимых источника или запроса. Дополнительно существуют старый каталог из 20 записей, политика 16 групп дополнительных источников и 15 описаний возможностей сервисов. Эти каталоги пересекаются, их числа нельзя складывать.

Обозначения в таблице: проверено / дало содержательные факты / использовано назначенным потребителем / показано. Проверка кеша может иметь 0 HTTP. Валидный ответ с нулевым поиском или отсутствующим инструментом проверен, но не является полезным фактом о монете. Показано — число маршрутов с фактом в тексте, не число строк.

| Блок | Назначено | Реализованные назначения | LSK: проверено / полезно / использовано / показано | NEAR: проверено / полезно / использовано / показано |
|---|---:|---|---|---|
| N01 | 3 | OFFICIAL_TOKEN_SCHEDULE, OFFICIAL_EVENTS, DEFILLAMA_PUBLISHED_CALENDAR | 0 / 0 / 0 / 0 | 1 / 1 / 1 / 1 |
| N02 | 4 | CHAIN_SUPPLY, BLOCKSCOUT_INDEX, COINMETRICS_SUPPLY, COINPAPRIKA_SECTOR | 2 / 2 / 2 / 2 | 1 / 1 / 1 / 1 |
| N03 | 3 | CHAIN_EVENTS, CHAIN_SUPPLY_COMPARISON, BLOCKSCOUT_INDEX | 0 / 0 / 0 / 0 | 1 / 1 / 1 / 1 |
| N04 | 2 | CHAIN_EVENTS, BLOCKSCOUT_INDEX | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| N05 | 3 | NANSEN_FLOWS, PRIMARY_HTX_FUTURES_FLOW, CHAIN_EVENTS | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| N06 | 3 | BLUESKY_PUBLIC, GDELT_NEWS_DISCOVERY, WIKIMEDIA_ATTENTION | 1 / 0 / 0 / 0 | 1 / 0 / 0 / 0 |
| N07 | 3 | OFFICIAL_EVENTS, HTX_OFFICIAL_ANNOUNCEMENTS, GDELT_NEWS_DISCOVERY | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| N08 | 2 | HTX_PUBLIC_RISK, OFFICIAL_EVENTS | 1 / 1 / 1 / 1 | 1 / 1 / 1 / 1 |
| N09 | 1 | HTX_PUBLIC_RISK | 1 / 1 / 1 / 1 | 1 / 1 / 1 / 1 |
| N10 | 1 | PRIMARY_TECHNICAL_CONTEXT | 1 / 1 / 1 / 1 | 1 / 1 / 1 / 1 |
| N11 | 1 | PRIMARY_EXECUTION_STRESS | 1 / 1 / 1 / 1 | 1 / 1 / 1 / 1 |
| N12 | 1 | HTX_LARGE_TRADES | 1 / 1 / 1 / 1 | 1 / 1 / 1 / 1 |
| N14 | 2 | DERIBIT_ALT_OPTIONS, DELTA_OPTIONS | 1 / 0 / 0 / 0 | 1 / 0 / 0 / 0 |
| N15 | 2 | COINGECKO_SECTOR, COINPAPRIKA_SECTOR | 1 / 1 / 0 / 1 | 0 / 0 / 0 / 0 |
| N16 | 1 | PRIMARY_EXECUTION_COST | 1 / 1 / 1 / 1 | 1 / 1 / 1 / 1 |

Данные источников по каждому блоку:

**LSK-USDT**
- N01: использованы 0 поставщиков (нет); маршрутов с новыми HTTP — 0. Остальные: OFFICIAL_TOKEN_SCHEDULE: CAPABILITY_CHECKED_NO_EXACT_ROUTE; OFFICIAL_EVENTS: CAPABILITY_CHECKED_NO_EXACT_ROUTE; DEFILLAMA_PUBLISHED_CALENDAR: EXACT_ALREADY_VERIFIED_PROVIDER_ID_REQUIRED.
- N02: использованы 2 поставщиков (CHAIN_RPC, COINPAPRIKA_SECTOR); маршрутов с новыми HTTP — 2. Остальные: BLOCKSCOUT_INDEX: DEFERRED_SHARED_REQUEST_ENVELOPE; COINMETRICS_SUPPLY: EXACT_SUPPORTED_NATIVE_BINDING_REQUIRED.
- N03: использованы 0 поставщиков (нет); маршрутов с новыми HTTP — 0. Остальные: CHAIN_EVENTS: DEFERRED_SHARED_REQUEST_ENVELOPE; CHAIN_SUPPLY_COMPARISON: TWO_FINALIZED_SUPPLY_OBSERVATIONS_REQUIRED; BLOCKSCOUT_INDEX: DEFERRED_SHARED_REQUEST_ENVELOPE.
- N04: использованы 0 поставщиков (нет); маршрутов с новыми HTTP — 0. Остальные: CHAIN_EVENTS: DEFERRED_SHARED_REQUEST_ENVELOPE; BLOCKSCOUT_INDEX: DEFERRED_SHARED_REQUEST_ENVELOPE.
- N05: использованы 0 поставщиков (нет); маршрутов с новыми HTTP — 0. Остальные: NANSEN_FLOWS: NOT_EVALUATED; PRIMARY_HTX_FUTURES_FLOW: HTX_EXACT_FUTURES_FLOW_4H_NOT_CLOSED [WINDOW_FRESH]; CHAIN_EVENTS: DEFERRED_SHARED_REQUEST_ENVELOPE.
- N06: использованы 0 поставщиков (нет); маршрутов с новыми HTTP — 1. Остальные: BLUESKY_PUBLIC: CLOSED; GDELT_NEWS_DISCOVERY: EXACT_OFFICIAL_IDENTITY_REQUIRED; WIKIMEDIA_ATTENTION: EXACT_VERIFIED_PAGE_BINDING_REQUIRED.
- N07: использованы 0 поставщиков (нет); маршрутов с новыми HTTP — 0. Остальные: OFFICIAL_EVENTS: CAPABILITY_CHECKED_NO_EXACT_ROUTE; HTX_OFFICIAL_ANNOUNCEMENTS: SOURCE_ERROR; GDELT_NEWS_DISCOVERY: EXACT_OFFICIAL_IDENTITY_REQUIRED.
- N08: использованы 1 поставщиков (HTX_PUBLIC_RISK); маршрутов с новыми HTTP — 0. Остальные: OFFICIAL_EVENTS: CAPABILITY_CHECKED_NO_EXACT_ROUTE.
- N09: использованы 1 поставщиков (HTX_PUBLIC_RISK); маршрутов с новыми HTTP — 0. Остальные: нет.
- N10: использованы 1 поставщиков (PRIMARY_TECHNICAL_CONTEXT); маршрутов с новыми HTTP — 0. Остальные: нет.
- N11: использованы 1 поставщиков (PRIMARY_EXECUTION_STRESS); маршрутов с новыми HTTP — 0. Остальные: нет.
- N12: использованы 1 поставщиков (HTX_LARGE_TRADES); маршрутов с новыми HTTP — 1. Остальные: нет.
- N14: использованы 0 поставщиков (нет); маршрутов с новыми HTTP — 0. Остальные: DERIBIT_ALT_OPTIONS: NOT_APPLICABLE; DELTA_OPTIONS: NOT_IN_VERIFIED_DELTA_OPTION_CAPABILITY.
- N15: использованы 0 поставщиков (нет); маршрутов с новыми HTTP — 2. Остальные: COINGECKO_SECTOR: DEFERRED_SHARED_REQUEST_ENVELOPE; COINPAPRIKA_SECTOR: CLOSED.
- N16: использованы 1 поставщиков (PRIMARY_EXECUTION_COST); маршрутов с новыми HTTP — 0. Остальные: нет.

**NEAR-USDT**
- N01: использованы 1 поставщиков (OFFICIAL_TOKEN_SCHEDULE); маршрутов с новыми HTTP — 1. Остальные: OFFICIAL_EVENTS: EXACT_OFFICIAL_FEED_REQUIRED; DEFILLAMA_PUBLISHED_CALENDAR: DEFERRED_SHARED_REQUEST_ENVELOPE.
- N02: использованы 1 поставщиков (CHAIN_RPC); маршрутов с новыми HTTP — 2. Остальные: BLOCKSCOUT_INDEX: EXACT_EVM_IDENTITY_REQUIRED; COINMETRICS_SUPPLY: EXACT_SUPPORTED_NATIVE_BINDING_REQUIRED; COINPAPRIKA_SECTOR: DEFERRED_SHARED_REQUEST_ENVELOPE.
- N03: использованы 1 поставщиков (CHAIN_RPC); маршрутов с новыми HTTP — 1. Остальные: CHAIN_EVENTS: NATIVE_TRANSACTION_EVENT_ROUTE_REQUIRED; BLOCKSCOUT_INDEX: EXACT_EVM_IDENTITY_REQUIRED.
- N04: использованы 0 поставщиков (нет); маршрутов с новыми HTTP — 0. Остальные: CHAIN_EVENTS: NATIVE_TRANSACTION_EVENT_ROUTE_REQUIRED; BLOCKSCOUT_INDEX: EXACT_EVM_IDENTITY_REQUIRED.
- N05: использованы 0 поставщиков (нет); маршрутов с новыми HTTP — 0. Остальные: NANSEN_FLOWS: NOT_EVALUATED; PRIMARY_HTX_FUTURES_FLOW: HTX_EXACT_FUTURES_FLOW_4H_NOT_CLOSED [WINDOW_FRESH]; CHAIN_EVENTS: NATIVE_TRANSACTION_EVENT_ROUTE_REQUIRED.
- N06: использованы 0 поставщиков (нет); маршрутов с новыми HTTP — 1. Остальные: BLUESKY_PUBLIC: CLOSED; GDELT_NEWS_DISCOVERY: DEFERRED_SHARED_REQUEST_ENVELOPE; WIKIMEDIA_ATTENTION: EXACT_VERIFIED_PAGE_BINDING_REQUIRED.
- N07: использованы 0 поставщиков (нет); маршрутов с новыми HTTP — 1. Остальные: OFFICIAL_EVENTS: EXACT_OFFICIAL_FEED_REQUIRED; HTX_OFFICIAL_ANNOUNCEMENTS: SOURCE_ERROR; GDELT_NEWS_DISCOVERY: DEFERRED_SHARED_REQUEST_ENVELOPE.
- N08: использованы 1 поставщиков (HTX_PUBLIC_RISK); маршрутов с новыми HTTP — 1. Остальные: OFFICIAL_EVENTS: EXACT_OFFICIAL_FEED_REQUIRED.
- N09: использованы 1 поставщиков (HTX_PUBLIC_RISK); маршрутов с новыми HTTP — 1. Остальные: нет.
- N10: использованы 1 поставщиков (PRIMARY_TECHNICAL_CONTEXT); маршрутов с новыми HTTP — 0. Остальные: нет.
- N11: использованы 1 поставщиков (PRIMARY_EXECUTION_STRESS); маршрутов с новыми HTTP — 0. Остальные: нет.
- N12: использованы 1 поставщиков (HTX_LARGE_TRADES); маршрутов с новыми HTTP — 1. Остальные: нет.
- N14: использованы 0 поставщиков (нет); маршрутов с новыми HTTP — 0. Остальные: DERIBIT_ALT_OPTIONS: NOT_APPLICABLE; DELTA_OPTIONS: NOT_IN_VERIFIED_DELTA_OPTION_CAPABILITY.
- N15: использованы 0 поставщиков (нет); маршрутов с новыми HTTP — 1. Остальные: COINGECKO_SECTOR: DEFERRED_SHARED_REQUEST_ENVELOPE; COINPAPRIKA_SECTOR: DEFERRED_SHARED_REQUEST_ENVELOPE.
- N16: использованы 1 поставщиков (PRIMARY_EXECUTION_COST); маршрутов с новыми HTTP — 0. Остальные: нет.

LSK: 7 участвующих блоков, 6 нейтральных оценок и 1 ограниченная диагностика N12 без баллов. NEAR: 9 блоков, 8 нейтральных оценок и 1 диагностика N12. Ненулевых баллов — 0 у обеих монет. Доказанного отдельного применённого ограничения — 0. Это не означает, что все отображённые данные изменили торговое решение.

N02 LSK использует сеть и CoinPaprika: сетевое предложение и оценка предложения провайдера остаются разными величинами. Они не усредняются и не считаются двумя голосами о направлении. N02/N03 NEAR переиспользуют финализированное наблюдение сети. N08/N09 переиспользуют одну HTX-оценку риска. N10/N11/N16 используют HTX-цену и исполнение: это разные потребители общей площадки, не независимые подтверждения.

Общие причины потерь и исправления:

- N05: все 240 закрытых минут фактически были сохранены, но окно было привязано к часовому OI и к моменту отчёта устаревало. PR169 использует последнее полное проверенное окно сырого потока с прежним пятиминутным пределом свежести; нет послабления 240 минут или проверки исходных сделок. Проверка сохранённого запуска: LSK 731 сделка, NEAR 1025. Это не новый живой результат.
- N15 LSK: фактический контекст 19 сопоставимых peers отображался, но не имел назначенной оценки при отсутствующем базовом счёте. PR169 добавляет проверяемую оценку секторного наблюдения без баллов. Повтор сохранённого LSK показал использование N15; свежая приёмка ожидается.
- N15 NEAR: запрос начат, но общий допустимый бюджет не дал завершить маршрут. PR170 приоритизирует указанные владельцем блоки, сохраняя 164 HTTP, дневные ограничения, резерв и доступность кеша всех маршрутов. Увеличение свежих counts не объявлено.
- N01: часть активов не имеет подтверждённого общего маршрута официального расписания. Нельзя считать это отсутствием событий. Добавлен общий опубликованный календарь DefiLlama по заранее проверенной точной идентичности; реальный APT-ответ проверен исторически, а не как доказательство LSK/NEAR.
- N02/N03: нужна поддерживаемая точная сеть/контракт и два финализированных наблюдения. CoinMetrics — дополнительная история BTC/ETH, а не универсальная замена сети.
- N04: поддержка native-событий не универсальна; для NEAR нужен отдельный общий сетевой адаптер, а не произвольная замена токеновым.
- N06: пустой узкий Bluesky-поиск проверяется, но не считается отсутствием общего интереса. Wikimedia требует проверенной страницы.
- N07: фактический HTX support запрос вернул transport fetch failed без HTTP-кода. Повторный кандидат переиспользовал ту же ошибку без нового запроса. Это не отсутствие объявлений и не ошибка Telegram. Нужен пригодный фактический ответ; резерв и дневной cap не сбрасываются.
- N14: отсутствие инструмента в каталоге Deribit / неподдержанный Delta route не означает отсутствие опционного риска на всех площадках.

Старый free_sources.registry.consumer_proven является статическим признаком наличия потребителя в коде. Даже при runtime_current=false он бывает true. Его нельзя использовать для приёмки этого запуска. Аналогично decision_usable — допуск закрытого receipt, а не доказательство баллов. Авторитет фактического использования — block_decision_use, связанный с точным фактом и текстом этого же запуска. Старый NOT_CONFIGURED для CoinGecko не описывает новый действующий N15-маршрут.

Незадействованные записи возможностей COINFUTY, TRADER_PRO, DEPTH_RADAR, VYX, COINMARKETCAP, TOKEN_TERMINAL не имеют доказанного вызова и назначенного основного потребителя в этом запуске. Возможность в каталоге не является подключением. Новые сервисы сейчас не устраняют обнаруженные общие потери N05/N15 лучше исправлений существующей цепочки.

| Ликвидационный маршрут | Что предоставляет | Точный предел пригодности |
|---|---|---|
| HYPERLIQUID_NATIVE | Условные будущие цены ликвидации текущих открытых позиций площадки | Исторически приняты уровни для 55/102 активов; выборка позиций, не HTX и не гарантия будущего исполнения. |
| BYK_TRACKED_HL_BANDS | Агрегированные ценовые корзины Hyperliquid | Исторически 68 отказов доступа, 30 без принятых чисел, 4 ошибки; центры корзин не равны точным ценам позиций. Общий upstream с Hyperliquid. |
| LIGHTER_NATIVE | Поля открытых позиций и условные будущие цены | Фактические исторические ответы есть. Нет подтверждённого времени снимка позиций; время последней транзакции не подходит. Допустим помеченный receipt-only контекст, без баллов/разрешения входа. Выборка по активным аккаунтам неполна. |
| GMX_NATIVE | Расчётные цены по реальным открытым позициям и комиссиям | Принят помеченный receipt-only контекст. В проверенном NEAR 3 уровня; исходное время состояния неизвестно. Не непосредственные уровни HTX. |
| GTRADE_NATIVE | Официальный расчёт по реальным открытым позициям, динамическим комиссиям и точным парам | Расчёт разрешён, фактический исторический пакет дал уровни для 52/102 активов; не новая live-приёмка. Каталог переиспользуется только с исходным временем и точной привязкой. |
| BYKARANTELI_FUTURE_MAP | Прогнозная модель/карта | В прежнем аудите отклонена модельная семантика. Нет принятого exact-пакета исходных позиций и проверенной методики для новой разрешённой расчётной политики; включать только по такому доказательству. |
| COINLOBSTER_FUTURE_MODEL | Модель будущих уровней; отдельные API также дают прошедшие события | Прошедшие ликвидации не заменяют будущие уровни. Нет принятого exact position/method/time proof модели для общего отчёта. Бесплатный общий контекст не равен полной бесплатной карте. |
| OXARCHIVE_HL_BUCKETS | Корзины, производные от позиций Hyperliquid | Нужны ключ/кредитный допуск, методика, исходное время и пригодный фактический ответ. Не независимая площадка относительно Hyperliquid. |

Пять процентов объединения означают ограниченный диапазон сопоставимых исходных цен одной стороны. PR168 дополнительно запрещает объединять неизвестные состояния только из-за одинаковой надписи UNKNOWN_SOURCE_AGE. Нужна одна доказанная исходная временная группа, валюта, reference price и методика. Показывается более дальняя исходная цена, сохраняются происхождение и прочие цены; пересекающиеся объёмы не складываются. До четырёх фактически пригодных уровней в каждую сторону.

Дополнительные бесплатные источники расчётов Drift/dYdX изучены как кандидаты; без фактического полного ответа по точной позиции и проверки передачи в отчёт они не считаются подключёнными. Непроверенное добавление ради количества увеличит HTTP и риск ошибочного объединения. Сейчас существующие GMX/gTrade/Lighter уже дополняют Hyperliquid при честном обозначении их ограничений.

Telegram: в указанном запуске нет SENT/message_id. LSK: WAVE_NOT_CURRENT; NEAR: CANONICAL_DIRECTION_NOT_CLOSED. Обе канонические строки REJECTED. Направление, порог 70, волна и сценарий не подменяются. Доставка остаётся незавершённой до принятого свежего сигнала и SENT/message_id того же снимка.

Доказательства: checkpoints/ACTUAL_SCHEDULED_0335MSK_20261006.json; checkpoints/actual-scheduled-source-result-37394649188.json.gz; PR169 cloud37396757549 (SHA256 534ef11df4ab422f3d17f3db3248832c00c9de9254fbafbfa95d32674cb50b13); PR170 cloud37397580284 (SHA256 aa830b3e8152a58cdfb5ca82a02959aa4a05d71198bc82bbe424b2839542a1a6). Анализ этого документа sourceHTTP=0, MAIN=0, Telegram=0.

Дополнительный разбор старого каталога по тому же фактическому запуску. «Текущие receipts» подтверждают только пригодность нормализованного ответа для его роли; таблица не прибавляет основные блоки и не доказывает применение к баллам.

| Запись старого каталога | Статус каталога | LSK: receipts / текущие | NEAR: receipts / текущие | Назначение |
|---|---|---|---|---|
| HTX | PRODUCTION | 1 / 0 | 1 / 0 | EXECUTION_PRIMARY |
| Binance Live Public | PRODUCTION | 0 / 0 | 0 / 0 | MARKET_STRENGTH_SPOT |
| Binance Public Data Archive | CANDIDATE | 0 / 0 | 0 / 0 | HISTORICAL_CONTEXT |
| Bybit | PRODUCTION | 1 / 0 | 1 / 0 | CROSS_EXCHANGE_DERIVATIVES |
| OKX | PRODUCTION | 10 / 9 | 12 / 12 | CROSS_EXCHANGE_DERIVATIVES_AND_SPOT |
| Gate | PRODUCTION | 4 / 4 | 4 / 4 | CROSS_EXCHANGE_DERIVATIVES |
| Hyperliquid | PRODUCTION | 0 / 0 | 0 / 0 | SMART_MONEY_SUPPORTING |
| ByKaranteli | SHADOW | 0 / 0 | 0 / 0 | SMART_MONEY_SUPPORTING |
| DEX Screener | CANDIDATE | 0 / 0 | 0 / 0 | DEX_CONTEXT |
| GeckoTerminal | CANDIDATE | 0 / 0 | 0 / 0 | DEX_CONTEXT |
| DefiLlama | CANDIDATE | 0 / 0 | 0 / 0 | PROTOCOL_CONTEXT |
| CoinGecko | NOT_CONFIGURED | 0 / 0 | 0 / 0 | NONE |
| Coinalyze | NOT_CONFIGURED | 0 / 0 | 0 / 0 | NONE |
| Etherscan | NOT_CONFIGURED | 0 / 0 | 0 / 0 | NONE |
| GoPlus | CANDIDATE | 0 / 0 | 0 / 0 | SUPPORTING_RISK |
| Alchemy | BLOCKED | 0 / 0 | 0 / 0 | ONCHAIN_CONTEXT |
| Solana Public RPC | CANDIDATE | 0 / 0 | 0 / 0 | ONCHAIN_CONTEXT |
| Bitget | SHADOW | 0 / 0 | 0 / 0 | BITGET_CONTEXT |
| Coinbase Exchange | SHADOW | 0 / 0 | 0 / 0 | COINBASE_SPOT_CONTEXT |
| Deribit | SHADOW | 0 / 0 | 0 / 0 | SECOND_PRIORITY_MARKET_BACKGROUND |

В LSK дополнительно фактически получены Bitget (цена, funding и текущее OI), DEX Screener и GeckoTerminal (ликвидность, объём и количество покупок/продаж пулов). Это отдельные вспомогательные сведения, не подтверждённое использование назначенным N-потребителем в этом запуске. У DEX двух сервисов совпадает один активный pool_key: они описывают один пул, их объёмы нельзя суммировать. Цепочка передачи этого дополнительного DEX-контекста в основной потребитель пока не подтверждена; эту потерю нельзя скрыть общим CLOSED. Для NEAR этот вспомогательный слот был сохранён под ликвидационный блок.

В исходной цепочке ликвидаций NEAR реально проверены Hyperliquid (1 HTTP, кандидатный бюджет не позволил продолжить) и GMX (4 HTTP, получен контекст). Lighter/gTrade не допущены остатком бюджета, ByKaranteli model требует отсутствующий API key, CoinLobster future model отложен из-за защищённого бюджета, OXArchive не был вызван. Поэтому семь отсутствующих числовых результатов в этом запуске не означают семь успешных пустых ответов.

Дополнение N07, 06.10.2026 01:21 UTC: облачные фактические проверки 37398550713/37398705610 установили причину transport fetch failed — официальный HTTP301 с локализованного /en-us/support/list/360000039942/ на /support/list/360000039942/. Выполнено 2 HTTP суммарно с существующим дневным допуском N07, MAIN0, Telegram0. Это объясняет техническую ошибку, но пока не доказывает получение пригодного каталога или сведения по монете. PR171 проверяет прямой канонический адрес; никакого сброса caps/reservations или следования произвольным redirects.


## Later actual run: 06 October 04:26:40 MSK
Same fresh scheduled37398950554: actual 牛来/OKB each10 main blocks N02,N04,N05,N08,N09,N10,N11,N12,N15,N16. 牛来8neutral+2unscored diagnostic, score-effect0; OKB8neutral+N12(-0.0457)/N15(+0.3429) nonzero. N05 full240minutes actual246/735 fills, no waiver. OKB3GMX receipt-only estimates rendered; original source state clock unknown; accepted exact-map levels0. Telegram0, 牛来 WAVE_NOT_CURRENT, OKB CANONICAL_STATE_NOT_PUBLISHABLE. Same-run exact plan diagnostic: old anomaly high131.72 below current133.995; no closed existing or fallback plan. Detailed source accounting is in ACTUAL_SCHEDULED_0426MSK_20261006.json and its immutable source gzip; do not combine with historical LSK/NEAR proof.

## N07 general repair PR171 (after this actual run)
Unchanged source daily cap4/global admission key. Three admitted source evaluations in total: original URL failed UNEXPECTED_REDIRECT, manual no-follow response301 revealed official canonical /support/list/360000039942/, canonical official URL returnedHTTP200 and88205-byte actual HTML parsed20entries. Exact NEAR bounded query matched0; this is a bounded check, not useful project news or proof of no events. No more N07 probes required. PR171 preserves original successful cache row observation and6h expiry rather than rewriting query clocks on reuse. Cloud generation/binding/frozen37 plus3 actual-body/cache tests passed sourceHTTP0 MAIN0 Telegram0. PR171 was not in04:26 report head; its next fresh joint use remains pending.


## Detailed same-run actual provider use: 04:26:40 MSK
Both real Top2 have the same source counts below. Assigned routes are logical declarations; route counts are not provider totals or additive HTTP. Shared HTX/CHAIN_RPC responses contribute to multiple blocks. No independent confirmation count is inferred.
| Block | Assigned routes | Actually checked | Routes with meaningful facts | Used provider IDs |
|---|---:|---:|---:|---|
| N01 | 3 | 0 | 0 | none |
| N02 | 4 | 2 | 1 | CHAIN_RPC |
| N03 | 3 | 1 | 0 | none |
| N04 | 2 | 1 | 1 | CHAIN_RPC |
| N05 | 3 | 2 | 1 | HTX_FUTURES_RAW_FLOW |
| N06 | 3 | 0 | 0 | none |
| N07 | 3 | 0 | 0 | none |
| N08 | 2 | 1 | 1 | HTX_PUBLIC_RISK |
| N09 | 1 | 1 | 1 | HTX_PUBLIC_RISK |
| N10 | 1 | 1 | 1 | PRIMARY_TECHNICAL_CONTEXT |
| N11 | 1 | 1 | 1 | PRIMARY_EXECUTION_STRESS |
| N12 | 1 | 1 | 1 | HTX_LARGE_TRADES |
| N14 | 2 | 1 | 0 | none |
| N15 | 2 | 2 | 1 | COINGECKO_SECTOR |
| N16 | 1 | 1 | 1 | PRIMARY_EXECUTION_COST |

Unused N01: no official vesting/feed route; exact token CG reference was not available before the earlier calendar lookup. The later same-run N15 metadata is actually retained and hash verified; PR173 dependency repair is under test, not a calendar fact. N03: finalized transfers were checked but supplied no burn/mint fact, and two comparable finalized supply observations are not yet retained; Blockscout deferred by envelope. N06: Bluesky deferred by envelope, verified official-name/domain and Wikipedia binding absent. N07: first candidate existing reservation, second daily cap; actual URL/cache repair PR171 is later than this run and does not erase those outcomes. N14: Deribit verified no supported instrument, Delta not in verified capability. These are distinct route/limit/availability causes, not universal absence of information.

## PR172 supporting data bridge (after the fresh run)
Saved exact LSK responses at original03:35cutoff now pass through existing consumers and assembled canonical adapter into approved manual context. Bitget funding0.00005fraction shown; OI6407142 omitted because native unit unknown. DexScreener506507.99USD and GeckoTerminal550072.7802USD describe the same Ethereum pool; one selected observed liquidity550072.7802USD, supplier values retained, amounts not summed, independent confirmation1. Maximum2distinct pool facts prevents crowding. All new facts advisory, score0, entryfalse, no new N-block participation. Cloud37400642572, generation/binding/frozen37+4actual regressions PASS, sourceHTTP0 MAIN0 Telegram0 D10. This is original-clock component proof, not newer live acceptance.

PR173 now merged/cloud verified: exact token calendars follow their existing CoinGecko metadata route and use monotonic current collection time; native ordering unchanged, one dispatch, original first-known clocks/expiry and source envelope unchanged. Actual retained two-token reference reuse proven; no calendar fact asserted. New naturally admitted live acceptance pending.
