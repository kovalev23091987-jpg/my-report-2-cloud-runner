# F608 — RabbitX: конкретная code-дельта, current public API всё ещё HOLD

Повторных чтений F607 repo/ToC/ошибочных страниц не было. Из двух целевых поисков первый пустой, второй дал source-кандидат. Четыре новых первичных чтения — metadata репозитория, закреплённое дерево, const.py и market.py. Это чтения исходников GitHub, не рыночные API-вызовы.

Положительная дельта относительно F607: найдены точные literal адреса и batch-метод с опциональным фильтром ID, response envelope и передачей session headers. Значения, пути и доказательства — F608_RABBITX_SOURCE_CONTRACT_DELTA_V1.json; blob SHA и UTF8 SHA256 — F608_PINNED_SDK_SOURCE_PROOFS_V1.json.

Сам репозиторий явно помечен Unofficial; последний repo push — 28 февраля 2025, не дата deployment и не дата изменения каждого поля. Временной разрыв не доказывает прекращение сервиса; он запрещает выдавать код за текущий production-контракт. Значение константы не связано доказанно с session.api_url: инициализация session/client не читалась. Абсолютный текущий URL не синтезирован, version-prefix не придуман. Общие headers в методе не доказывают ни обязательную авторизацию, ни свободный доступ без неё.

Typed market result, единицы OI, funding scale/period, исходные as-of, поля quote/margin/settle, полнота/пагинация и request/IP/day/month limits остались UNKNOWN. Видимый один get() не принят за доказанный wire-cost: retry/adapter policy session не прочитана. Не подготовлен runnable SDK probe.

Канонический путь возможен только после текущего authoritative native catalogue с самостоятельным carrier идентичности. F605 CoinGecko ID сам по себе не связывает RabbitX market_id с BingX instrument_id. Другие venue price/book не становятся обязательными фактами BingX; USD/USDT и numeric-prefix equivalence не подразумеваются.

ROOT получает F608_ROOT_EXACT_HOLD_V1.json: точный порядок незакрытых условий, ready native requests = 0, call25 не предлагается. Нужна конкретная текущая официальная source/OpenAPI/service contract evidence, а не новый широкий поиск или проба адреса из кода. Даже после её появления квалификационный лимит не возвращается автоматически.

2/2 поиска и 4/4 чтения исчерпаны; код не импортировался, SDK не устанавливался, examples/tests/private env не выполнялись/не читались. Market API/MCP/SDK execute, signup/keys/paid/protectedendpoint, SQL/TG/deploy = 0. Квалификации 24/24, остаток 0. F607 остаётся замороженным; новых CORE/future-map/recurring routes = 0. Все прежние расходы, unknowns, резервы, 9 пауз, 2 OWNER deferrals и пауза старого отчёта сохранены. ROOT live71, delivery и ночные настройки не менялись.
