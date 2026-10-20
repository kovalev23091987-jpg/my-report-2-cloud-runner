# Штатный полный запуск 393699: источники и отказ публикации

Сохранены два точных исходных ZIP и семь JSON из одного нового для этого аудита запуска: `schedule`, head `b014569068d113bcf578f7101b92ed3406f17832`, run `1792470686053-1792470696222`. Это POST556 / PRE565, не приёмка нынешнего runtime. Пакет документальный: изменений production, предложений patch, callable, тестов, Node/runtime imports, SQL, provider HTTP, MAIN, manual, Telegram и deploy нет.

## Существенный результат

BTW имеет canonical `OBSERVE`, направление `SHORT`, интерес 83/100. Точная сохранённая lifecycle-проверка отказала с `OBSERVE_SOURCE_ROLES_NOT_CLOSED`; dispatch не создан. PEPE имеет `REJECTED`, направление NULL и точный отказ `CANONICAL_DIRECTION_NOT_CLOSED`. Сохранённый INFO показывает CLOSED / два завершённых handoff, 121R0W, пять SQL, unknown0; разбиение `[50,8,3,18,42]`. Это не прежний отказ 182R, не доказательство экономии и не ошибка транспорта Telegram.

У BTW из 11 сохранённых role receipts пригоден только HTX execution. Четыре Gate PERP метрики свежие, но identity/fact contract NOT_CLOSED. Первый сохранённый код binding — `OFFICIAL_HTX_EXACT_TOKEN_REFERENCE_REQUIRED`. Исходный HTX reference `h` и точный провалившийся член OR-предиката не экспортированы. Старый известный boundary не превращён в новый fix.

Отдельно delivery выбрал прежний ZEC LONG retry: `FAILED_RETRYABLE / NOT_CLOSED`, `bound_refusal:null`, sent0. Его исходный binding и точная подпричина не сохранены. Нельзя утверждать, что ZEC вытеснил BTW: текущая BTW dispatch отсутствовала ещё до выбора очереди. SAME-RUN receipts пусты, message_id отсутствует.

## Источник → факт → consumer

У обоих финалистов сохранены и показаны N05, N10, N12, N15 факты с исходными IDs/окнами/часами. BTW: Poloniex SPOT 4h и повторное использование его 15m свечей; HTX futures/spot и Gate SPOT ограниченные выборки; два раздельных секторных контекста. PEPE: Bitfinex SPOT 4h в USD, HTX futures/spot ценовой контекст и Gate SPOT выборка; сектор CoinGecko. Разные окна и USD/USDT не складываются. Полные исходные массивы свечей/сделок и секторные корзины здесь отсутствуют; значения rendered receipts не выданы за raw API replay.

CoinPaprika bulk quotes получены один раз для BTW; PEPE использует `VALIDATED_RUN_MEMORY_REFERENCE` без второго bulk HTTP. PEPE делает один HTTP за собственной metadata; недостаток свежих секторных peers остаётся честным отказом. Его нельзя чинить ослаблением freshness. Cache HIT уже устанавливает network_calls0; route wrapper считает фактические guarded fetches. Нового повторного HTTP или потери пригодного факта не установлено.

LIQ сохраняет 3 PEPE и 6 BTW сценариев Swolecharts в USD с исходными source time, NULL exact notional USDT, target eligibility false. Это модели одного поставщика, не native позиции. У PEPE отдельно сохранён native service расход 4 HTTP; у BTW route diagnostics пусты. Эти границы не означают нулевого рынка или новый доступ к бюджету.

## Граница разрешения одного источника

Ограниченная информация от одной площадки уже доходит до ручного confirmed context: Poloniex/Bitfinex, точные свечи и ограниченные сделки. Автоматическая OBSERVE-публикация проходит отдельный существующий gate HTX execution + два пригодных origins в конкретных role receipts. Дополнительные факты имеют иные роли: Poloniex SPOT 4h/15m не Gate PERP identity; Gate SPOT bounded trades не подтверждают идентичность Gate PERP; секторные агрегаты не становятся новой официальной площадкой или независимым направлением. Этот пакет не доказывает противоречие owner limited-information policy и не предлагает ослаблять gate/менять форму.

Сохранённые execution bundles занимают 13041/13994 compact UTF8 bytes. Весь report 495420B не является SQL `stage392_proof_bundle_json`. Из этого случая нельзя вывести причину CHECK failure другого запуска 394236.

Raw receipts и hashes: `acquisition-receipt.json`, `delivery-acquisition-receipt.json`; факты и границы: `source-consumer-audit.json`, `publication-boundary.json`, `current-code-boundaries.json`. Следующее независимое исправление требует нового конкретного контрпримера или недостающего исходного carrier; старые Gate/alias/cap-pressure проверки не повторяются.
