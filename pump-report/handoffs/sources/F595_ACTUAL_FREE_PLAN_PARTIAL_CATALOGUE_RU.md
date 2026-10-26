# F595 — фактический Free plan и первая страница Coinversa

Приняты два точных ROOTcapture: accountplan и cataloguepage. Оригиналы проверены по SHA. SOURCE не вызывал API/MCP и не повторял F594docs.

В плане фактически tierfree, requestsPerMin30, requestsPerDay1000. Это тарифные caps, не остаток. requestsPerMonth_raw0 сохранён с семантикой UNKNOWN: не unlimited, не zeroaccess и не нулевой расход. Остатки/used/reset/timezone/window-boundaries/credits/nativeclock не возвращены. ROOTreceivedtime — только транспорт.

Каталог фактически доступен этому Freeподключению. Получено50строк при totalCount294, count50, truncatedtrue, hasMoretrue, nextOffset50. includeInactivefalse/inactiveHidden175 сохранены без сложения в выдуманный полный census.

Точный локальный join:50уникальныхcoin/dex, всеdexhl;46совпадений названий с выбранными550,504инструмента не представлены на первой странице. У всех550 canonicalidentityUNKNOWN, qualifiedroutes0, UNSUPPORTED0. hasActivitytrue не превращается в isActive/crypto-подтверждение. Nativecrypto/units/period/clock отдельно.

Установленный list_markets принимает только dex/useToonFormat. Ответ предлагает backendoffset/limit<=500/search, но их нет в toolсхеме. Неподдерживаемые аргументы не передаются, первая страница не повторяется,500помонетных запросов не предлагается.

Price/funding/OI/volumeчисла в ответе есть. Исходные часы, fundingperiod/unit и OIunit в строках не возвращены; документированный hourlyfraction F594 не заменяет отсутствующие actualclock/period. Сырые marketvalues не экспортированы в пакет, в матрице только имена/venue/наличие полей и статусы.

Матрица F595_FIRST50_TO_SELECTED550_MATRIX_V1.json содержит50sourceстрок и550targetстрок. NOT_RETURNED_FIRST_PAGE не является отсутствием на всём источнике. Исторические0xArchive234/162activeoverlap и HYPEcontrol F592 сохранены отдельно, не подменены этой страницей и не объявлены полной картой.

ROOT может отдельно получить assetdirectory. Даже полный список экономических exposures не доказывает crypto-проектную идентичность и свежие rates/OI. Минимальные открытые входы и data-rowtemplate находятся в F595_NEXT_INPUT_GATES_AND_BATCH_JOIN_TEMPLATE_V1.json; это handoffdata, не новый framework/adapter.

По ROOT: два outerвызова, qualification21/24remain3; physicalhostedHTTPUNKNOWN_NONZERO и не возвращается в бюджет. LOOKUP12consumed0left/default10. СуществующийFreeдоступ доказан на захватах; regularproductiontransport/cost/freshness/binding ещё не qualified. Новых SOURCE docs/service/account/SQL/TG/deploy/Node/code/tests0, F594 не переписан, прежние расходы/unknowns/резервы/caps/9пауз/2OWNERdeferrals сохранены.
