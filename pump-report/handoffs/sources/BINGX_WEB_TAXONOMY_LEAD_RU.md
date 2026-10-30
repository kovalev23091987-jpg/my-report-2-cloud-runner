# Конечный web-taxonomy lead

В пределах трёх новых primary-поисков и15мин положительная bulk-классификация всего cryptoN не доказана. Состав **13 проверенных /2 gold-excluded /919 UNKNOWN** сохранён; current complete cryptoN=null. API-docs/NCSK/CCXT аудит не повторялся.

Новый конкретный lead найден в статическом [BingX frontend dependency](https://bin.bb-os.com/growth_nuxt/f22v5Ol3.js), связанном imports с [официальной Bitcoin price HTML](https://bingx.com/en/price/bitcoin): `common.requestCoinInfoList()` читает result[] с id/coinName/coinDisplayName/coinIconUrl/coinType. Клиент преобразует id→coinId и подставляет0 при отсутствии coinType. **Enum coinType, точный host/path метода и связь с native contractId не установлены.** Ноль/default не является положительным crypto доказательством.

Статическая HTML/Nuxt schema содержит5 spot metadata rows coinId/coinName/slug/quotationId/bizType, без native contractId и без coinType/assetType; JSON-LD тип Product общий. Price frontend имеет hasContract/unifiedName и конструирует perpetual-ссылки, но это не underlying taxonomy. CoinGecko/ranking/slug либо наличие контракта не квалифицируют неизвестные native assets.

Выполнены3 поиска и7 успешных статических document GET (HTML+6JS), без браузера, исполнения JS и вызова найденных API. Полные файлы остались private; в пакет вошли SHA/схема/ссылки и конечный вывод, без цен. Одна offline integrity-проверка —PASS, около9мин43с от acquisition. Новых marketHTTP/WS/SQL/TG/deploy0. Полезный точный API GET-план не выпущен: URL/enum/native bridge нельзя придумывать.

Реально исполнимый вариант сейчас: владелец явно принимает ограниченный запуск по уже проверенным13 с неполным глобальным охватом. Для полногоN нужны либо официальный BingX export/spec (native contractId/asset↔canonical coinId+положительный underlying type enum), либо выбранная владельцем конечная партия UNKNOWN для поштучной положительной identity-проверки. Самостоятельного промоушена UNKNOWN, новых сообщений BingX или продолжения бесконечного поиска нет. Старые паузы/deferrals/caps/reserves/unknowns сохранены.
