# F597 — валюта HYPE и точная идентичность

Найдено новое первичное доказательство: [Hyperliquid contract specifications](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/contract-specifications) прямо выделяет HYPE-USD как USDC-denominated perpetual. Это доказательство валюты native контракта, а не вывод из USDC-залога. Нельзя распространять его на все Hyperliquid perps: обычная схема описана отдельно как USDT price / USDC collateral.

Для 0xArchive mid/levels возможна связанная native-axis интерпретация USDC per HYPE: F596 описывает native mark-centered price, а [официальная mark formula](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/robust-price-indices) объясняет цену ликвидации контракта. Профиль явно оставляет это DERIVED_NATIVE_AXIS_INFERENCE для ROOT review, не утверждает наличие прямого currency поля или проверенной конверсии у 0xArchive. USD modeled notional остаётся отдельной единицей. USDT-пересчёт не выполнен.

[BingX project page](https://bingx.com/en/price/hyperliquid) даёт полное имя Hyperliquid, сеть Hyperliquid Layer1 и официальный сайт app.hyperliquid.xyz. Это сильнее совпадения тикера. Однако страница не связывает проект с contractId100877 или metadata coinId2338. Futures link ведёт в общий perpetual index. Поэтому strict exact-contract canonical join пока UNKNOWN; новая project-level информация не стала разрешением на runtime binding.

Шесть прежних барьеров не объявлены закрытыми. Снимок11:48:21UTC остаётся только stale format proof. Границы из центров не выведены, computedclock не стал временем свежих позиций, premium cost numeric UNKNOWN сохранён.

Минимальный следующий документ: первичная BingX listing/instrument запись, связывающая именно HYPE-USDT perpetual /100877/2338 с проектом Hyperliquid. Затем один общий batch по выбранным550; без500 ручных настроек. Текущий DOCS-грант исчерпан:2 поиска (один без BingX результатов),4 успешных чтения (одно generic, не закрывает связь).

Qualified maps0; квалификация22/24, осталось2. Market/API/MCP/account/nativeSQL/TG/product tests/deploy0. F596 не изменён. LIVE68/AUTO1/DL1 и все бюджеты/unknowns/резервы/9пауз/2OWNERdeferrals сохранены.
