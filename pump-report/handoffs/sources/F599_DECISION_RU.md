# F599 — два новых кандидата и один минимальный следующий допуск

Короткая дедупликация исключила уже подробно разобранные Variational/Avantis/gTrade/StandX/edgeX и существующие маршруты. В ограниченном корпусе1427 документов не найдено разбора Toobit API и Vest API. Это не утверждение мировой новизны.

**Лучший следующий шаг — один GET каталога Toobit**, а не500 ручных вызовов. [Официальные market docs](https://api-docs.toobit.com/api/usdt-m-market-data.html) задают exchangeInfo с weight1 и отдельным массивом contracts. [Базовые правила](https://api-docs.toobit.com/api/basic-information.html) задают weighted limits и response headers; [market automation docs](https://api-docs.toobit.com/agent/mcp-server.html) прямо разрешают market data без API key. Ничего не устанавливалось и не запускалось.

Полезность Toobit — собственные funding/OI/mark/book данные как дополнительный контекст, а не будущая карта. Later sections funding/OI/mark доступны только как первичные поисковые excerpts, поскольку direct market page вернулась частично. Поэтому funding numeric scale, часть field clocks/weights и book quantity не объявлены закрытыми. 3000weight/min опубликованы в разделе API Key limits; anonymous/shared scope, day/month caps и actual remaining неизвестны. Это не безлимит и не готовый recurring route.

**Vest удержан.** [Официальный API](https://docs.vest.exchange/vest-api) найден как первичный поисковый excerpt: v2 publicREST, catalogue/funding/trades/depth, USDC numeraire, ms timestamps и обязательный account_group header template. Прямое чтение получило403 и не повторялось. Полные response schemas, source clocks, auth/header value, free entitlement и квоты не доказаны. Ошибка документа не означает отказ market API. Допуска на native Vest не предлагаю.

Предложение ROOT: ровно1 прямой HTTP GET https://api.toobit.com/api/v1/exchangeInfo, weight1,0retry/redirect/followup,2MiB/15s. Это проверка actual catalogue/access/headers/schema и начало одного batch join для550, а не обещание canonical coverage. Нужны отдельные положительные provider/whole-budget admissions и обеспеченные ceilings; в этом пакете вызов не разрешён и не выполнен.

DOCS2search+4read исчерпаны, включая1failed403. Все550 остаются NOT_CHECKED для новых провайдеров, новых routes/maps0. Service qualification22/24,remaining2 сохранены. SourceMCP/API/account/market/SQL/TG/Node/tests/deploy0. LIVE69d984 AUTO1/DL1,17:25 hourlydefer до анализа, старые spent/unknown/caps/reserves9пауз2OWNERdeferrals не изменялись.
