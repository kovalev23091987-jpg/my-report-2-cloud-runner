# F605 — фактическая identity-привязка CoinGecko → BingX

ROOT получил один полный HTTP 200 batch: 819 896 байт, 1302 строки; SHA256 оригинала 3a4e08cf0014128d82267542f2b64cbfd30b7f36ecc1fedc059e52c088d3a29a. SOURCE прочитал оригинал ровно один раз и проверил хеш/полноту JSON. Исходное тело остаётся private. Все дальнейшие действия использовали только проекцию identity-полей и сохранённые native tuple.

Результат для F589 selected550: **519 EXACT, 0 CANDIDATE, 31 UNKNOWN**. EXACT означает, что CoinGecko явно приписывает coin_id/target_coin_id одной точной неизменённой паре BingX: совпали native symbol и base, тип perpetual, target USDT и ID tether; в принятом native tuple доказаны margin/settle USDT. Все URL используют HTTPS и BingX host. Коллизий vendor symbol и конфликтов выбранных пар не обнаружено. Это provider-attributed identity, без автоматической активации в ROOT.

Из 31 UNKNOWN две пары присутствуют, но coin_id=null: 10000NEX-USDT (строка 4) и PHAROS-USDT (856). Ещё 29 точных пар отсутствуют; список и причины полностью сохранены в summary и matrix550. Это UNKNOWN, не UNSUPPORTED. Доказанных alias для этих пар нет; новые alias, удаление цифровых префиксов, вставка/удаление дефисов и сопоставление только по base не применялись. Фильтра ASCII нет; в этом capture и selected550 не оказалось не-ASCII символов.

Во всём batch: 1233 USDT, 49 USDC, 20 USD; все 1302 строки объявлены perpetual. У 679 строк отсутствует хотя бы один ID, несмотря на required string в документации. Не-USDT строки исключены из target, отсутствие ID не исправлялось.

| Native pair | Строка, с нуля | CoinGecko ID | Статус |
|---|---:|---|---|
| DOOD-USDT | 360 | doodles | EXACT |
| HYPE-USDT | 555 | hyperliquid | EXACT |

Обе строки получены тем же общим правилом batch, без отдельных запросов или ручных настроек. HYPE-USD (554) не подменяет HYPE-USDT. Ни одна строка не создаёт готовую future-map route.

Для интеграции ROOT: проверить хеши manifest → projection → identity digest/rowindex; взять только EXACT из matrix550, перепроверить instrument_id по своему принятому реестру и явно принять provider attribution. UNKNOWN оставить null с причиной. Native contractId и metadata coinId сохраняют разные пространства имён; CoinGecko ID не используется как multiplier, execution unit или текущая принадлежность native каталогу. Привязка по прямому совпадению symbol не требует разбора concatenated trade_url: URL сохранён как происхождение, не как придуманная нормализация.

Числовые OI, funding, цены, объёмы и BTC-агрегаты не экспортированы и не использованы. Qualified CORE/future maps = 0, runtime registry и recurring routes не менялись. Время получения capture — только receive clock, оно не обновляет исходные часы других сохранённых фактов. F568 и F571 используются как сохранённые доказательства своих областей; прежние проверки и классификации не повторялись.

Одна механическая проверка actual identity-проекции: 14 утверждений пройдены. Исходный capture не перечитывался, старые suite не запускались. Новых docs/search/API/MCP/SDK/SQL/TG/deploy действий = 0. После ROOT capture лимит квалификаций исчерпан: **24/24, остаток 0**. Call25 требует отдельного direct owner exception; fallback или новый день не возвращают лимит. Исторические расходы, unknowns, резервы, 9 пауз и 2 OWNER deferrals сохранены.
