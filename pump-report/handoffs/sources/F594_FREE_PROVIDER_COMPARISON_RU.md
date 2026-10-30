# F594 — три дополнительных провайдера и реальная квота

Выбран документированный FREE-кандидат Coinversa: один общий каталог с funding/OI-контекстом Hyperliquid и отдельная квота провайдера. Текущее подключение и остаток не проверены; работающий fallback ещё не принят. MidasFlow — второй вариант для произошедших ликвидаций. Coinfuty пока UNKNOWN по первичной бесплатности/квоте.

| Провайдер | Бесплатно подтверждено | Предел / пригодность |
|---|---|---|
| Coinversa | plan, list_markets, list_assets | Free30req/min,1000/day; существующий key/OAuth. Bulk-discovery и hourly-fraction funding; OI-unit/sourceclock маршрута требуют факта |
| MidasFlow | /v1/usage1unit; /v1/liquidations1unit |200weightedunits/day, не200любых вызовов. Реализованные ликвидации, bandednotional, неполный marketwide/top-поток |
| Coinfuty Derivatives | Только metadata заявляет free | Первичная страница недоступна, поиск пустой. Rate/day/month/credits/authUNKNOWN; top100 без cursor не доказывает550 |

[Coinversa README](https://github.com/Coinversaa/mcp-server), [исходный обработчик](https://github.com/Coinversaa/mcp-server/blob/HEAD/src/coinversaServer.ts), [MidasFlow API](https://midasflow.ai/docs/api).

Нужная FREE futuremap среди этих3 не квалифицирована. Сохранён прежний Coinversa FIL Pro-denied; повторного запроса не было. MidasFlow funding/OI — PRO, heatmap — VIP; бесплатная headline-реклама не переопределяет конкретную таблицу endpoints. Произошедшие ликвидации, стены стакана и TP/SL не подменяют будущую карту.

Важное уточнение квоты Coinversa: опубликованный stdio handler делает1 APIread при успехе, но MAX_RETRIES2 даёт до3попыток на429/timeout/reset, с30sна попытку и backoff. Hosted OAuth server не собирается из этого репозитория: одинаковые tools не доказывают одинаковый retry/fanout. Его верхний HTTPрасход UNKNOWN. Не объявлять1MCP=1HTTP или переносить3как проверенный upper hosted. Существующий10sdeadline не повышен.

Конкретный следующий proposal — ровно один pulse_my_plan({useToonFormat:false}) под отдельным допуском ROOT; currentkey/tier/remaining и transportcost пока UNKNOWN. Для уже имеющегося serverkey отдельная RESTальтернатива GET https://api.coinversa.ai/api/public/v1/plan допускает1request/retries0/10s после фактического допуска; автоматического обхода MCPнет. Затем отдельный условный bulk list_markets, а не500настроек. Все stop-условия и цены находятся в F594_MINIMAL_NEXT_ROOT_ADMISSION_PROPOSAL_V1.json.

Два Coinversa wrapper делят vendor/key quota; Coinfuty wrappers тоже не считаются новыми квотами. MidasFlow REST/MCP используют одну200-unit квоту. Разные поставщики могут дать отдельный бюджет доступа, но Hyperliquid/Binance/Bybit как общий первичный источник не превращаются в независимые рыночные голоса.

План550: один полный источник-каталог → локальные rawcandidate → независимая canonicalidentity → отдельные units/period/sourceclock/coverage → необязательный consumer. Provider economic taxonomy не доказывает идентичность токена. Внешний USD/USDC/USDH/USDE контекст сохраняется, целевые инструменты по-прежнему BingX USDT-M; для точных заявок нужна конверсия. Кэш не обновляет возраст фактов. По новым3provider canonicaljoin550 и фактическое покрытие UNKNOWN, новых маршрутов0.

Старый широкий проект проверен первым: Coinfuty был объявленным sanitycheck без доказанного полного signedflow, Coinversa имел сохранённый paid отказ. Принятые отрицательные тесты и0x/ByK/BingXManual не повторялись.

3поиска+4чтения закрыты; недоступный Coinfuty read потрачен. Переданный ROOTunknownmarker не повторялся, расходы/unknowns не сбрасывались. Никаких sourceMCP/API/account/SQL/TG/deploy/code/tests/signup/key/pay. Квалификация19/24, LOOKUP11spent0left, все резервы/caps/9пауз/2OWNERdeferrals сохранены.
