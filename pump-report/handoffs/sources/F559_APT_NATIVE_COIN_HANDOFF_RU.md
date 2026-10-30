# F559: COIN / native APT — минимальное первичное основание достаточно

Считаю сочетание переданных ROOT первичных сведений достаточным для узкой квалификации количества bidsCoin/asksCoin как native APT у exact BingX USDT-M contractId100164/APT-USDT. Это решение о единице данного инструмента, а не результат реального стакана или готовый CORE.

Связка доказательств: сохранённый native tuple указывает assetAPT и quote/settleUSDT; официальный perpetual UI в индексированном тексте подписывает Price(USDT), Amount(APT), Total(APT); официальная APTUSDT maintenance17Oct2026 подтверждает notional=MarkPrice×PositionSize с notionalUSDT. API descriptor определяет явные Coin-поля как quantity(coin). Вместе они связывают именованный vendor nativeAPT с единицей количества. Для этого same-venue вывода не требуется проектная универсальная или cross-venue canonical идентичность.

Первичная UI страница https://bingx.com/en/perpetual/APT-USDT известна через ROOT indexedsnippet с crawl lastmonth; прямой open у ROOT завершился ошибкой. Статья https://bingx.com/en/support/articles/18029352879503 была фактически прочитана ROOT с200. SOURCE сохраняет именно эту provenance и не заявляет собственный liveUI200. Текущие цены не использованы; новых source docs calls0, поиск/повторы не делались.

ROOT может принять exact per-tuple qualification из F559_APT_ORDERBOOK_QUALIFICATION_PROPOSAL_V1.json: fieldsCOIN/unitBASE_ASSET/nativebaseAPT. Парсер уже совместим. SOURCE не менял ROOT registry, multiplier/step/tick/canonical flags. STANDARD, CCXTsize1, отношения размеров полей и historicalBTC40/40 в доказательство не входят. Данная запись не копируется на1000SHIB, масштабированные baskets или остальных539.

До практического использования ROOT нужен отдельный фактический допуск и один актуальный ответ для exactAPT: обаCoinarrays, корректные исходныеT/receive, две стороны, уникальные цены, bid<ask, bounded<=1000/side и TTL15s. Полнота стакана не утверждается. Цены/свечи/план и остальные обязательные gates проверяются отдельно. СтарыеCONTROL6 и дополнительныйF550packetSPENT не оживляются. Этот review устраняет конкретный semantic gap; допуска native и запуска он не создаёт.
