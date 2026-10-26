# F593 — consumer fraction proof для funding

Недостающий F591 unit-premise закрыт новым официальным примером CCXT Team. Вызов fetch_funding_rates даёт entry.fundingRate; пример умножает его на100 и печатает знак процента. Порог0.0005 подписан как0.05% за период. Это явное потребительское соглашение fraction, а не предположение по малому размеру числа.

[Точный первичный файл](https://github.com/ccxt/ccxt/blob/373c05278144578818098d9aac82204de934b803/docs/website/content/blog/crypto-arbitrage-strategies.mdx#L86) — commit373c05278144578818098d9aac82204de934b803, Gitblob5c2cb16776237eb30f20a3f9658d4d0d4b7ce397, SHA2564516fca6b9b6ea730c3b90c5091ee4642475891c0b6e3489b93302acea873858. Pythonстроки86–90; JavaScript70–74 и Go138–144 показывают ту же конвенцию.

Отдельное сохранённое доказательство pinned BingX напрямую переносит lastFundingRate в unified fundingRate без масштаба. Его SHA94bcede8e332f7c877fa6099708d3ce9e0642463366e13e09a068f116ffc98b0 переиспользован, код не скачивался повторно. Новый consumer-пример и adapter trace вместе дают ограниченное ADAPTER_BASED_INFERENCE: это не независимая гарантия единиц BingX и не доказательство одинаковой версии двух источников.

F593_F588_COMPATIBLE_CONSUMER_FUNDING_PROFILE_V1.json содержит точный candidate_profile для F588. Unit proof помечен VERIFIED/RATE_FRACTION со ссылкой на новый пример; normalized fact остаётся RATE_FRACTION_PER_ACTUAL_PERIOD. Файл — только handoff, в runtime он не подключён. SOURCE не менял шаблон или registry.

Часы и период сохранены: RATE_QUOTE_SNAPSHOT/updateTime по соглашению CCXT, фактический fundingIntervalHours строки, без8hпоумолчанию; payment_eventnull, nextFundingTime отдельно, received не становится временем ставки. Исходная ставка сохраняется без масштабирования; умножение100 применяется только для отображения процентов. Zero и знак не отбрасываются.

Порог0.0005, truthinessfilter примера, перечень бирж, его торговая стратегия и годовая нормализация не переносятся. Значение DOOD, включая минус1%, не объявляется фактом. Новых actualfundingfacts0, покрытие550 по свежим ставкам не доказано.

ROOT может рассмотреть этот конкретный профиль через существующий F588 способ подключения qualifications.funding в instruments и lazyresolve. Все общие файлы, budgets, интеграция, affectedcase и возможный будущий native/deploy остаются ROOT и требуют своих допусков. F593 не активирует binding и не добавляет backgroundscan или лимиты.

Из лимита1поиск+2чтения потрачены1поиск+1первичное чтение. Второе чтение не понадобилось и закрыто без переноса разрешения. Manual.md и pinnedBingXmapping повторно не читались из сети. Code/tests/providerMCP/API/nativeSQL/TG/deploy0. Все прежние бюджеты/unknowns/резервы/паузы сохранены.
