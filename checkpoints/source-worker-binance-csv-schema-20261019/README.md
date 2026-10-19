# Схема шести сохранённых Binance CSV

Документальная привязка к existing BTC research PR534/frozen `963c6aa885784010925d656833a17d492b120527`. Его расчёт и результаты не повторялись и не менялись. Состав шести архивов и их полные hashes взяты из готовой531 inventory `cc69eb7c09df8cb29ce92eff78703d9d249ce10a`. Новых market-запросов и загрузок архивов нет.

[Официальный Binance public-data README](https://github.com/binance/binance-public-data/blob/master/README.md) связывает CSV Spot с `/api/v3/klines`, USD‑M с `/fapi/v1/klines` и задаёт общий порядок12 полей. [Spot REST schema](https://developers.binance.com/docs/binance-spot-api-docs/rest-api/market-data-endpoints#klinecandlestick-data) независимо подтверждает позиции. Индексы ниже отсчитываются с нуля.

| Индекс | Что подтверждено для обоих CSV-типов | Конкретная единица Spot BTCUSDT | Конкретная единица USD‑M в этом новом documentary пакете |
|---|---|---|---|
|5|Поле общего объёма с неуточнённой в выбранной CSV/REST таблице базой|NULL|NULL|
|7|Объём в котируемом активе|USDT|NULL; quote-asset basis подтверждён|
|8|Количество сделок|сделки|сделки|
|9|Количество базового актива для taker-покупателей|BTC|NULL; base-asset basis подтверждён|
|10|Количество котируемого актива для taker-покупателей|USDT|NULL; quote-asset basis подтверждён|

Конкретные Spot-единицы опираются на **явный пример BTCUSDT** в [официальном Spot glossary](https://developers.binance.com/docs/binance-spot-api-docs/faqs/spot_glossary): базаBTC, котировкаUSDT. Это не вывод из суффикса. Glossary предупреждает, что его определения относятся к Spot. В старом сохранённом USD‑M qualification уже записаны BTC/USDT; эти декларации сохранены отдельно. Новая независимая нормативная привязка USD‑M здесь не закрыта: старые REST/WS URLs перенаправляют на общую страницу, ссылка нового API-каталога вернула пустое содержимое. Попавшая через navigation страница Spot Testnet исключена из доказательств USD‑M. Поиск остановлен после ограниченной сверки; неизвестное не заполнено предположением.

Поле5 нельзя назначить BTC, contracts или USDT только по имени `volume`, величине, такер-подмножеству или правдоподобному отношению к цене. Поля9/10 нормативно названы taker-buy quantities; в CSV нет отдельных per-trade aggressor flags и native taker-sell колонки. Вычитание taker-buy из общего объёма не выполнялось и не объявляется новым native sell evidence. Никакой causal trading direction/ENTRY отсюда не следует.

README **явно** задаёт микросекунды для Spot-архивов начиная с2025-01-01. Для этих трёх Spot файлов native open имеет16 цифр, шаг1m равен60 000 000; перевод open вms точный через1000. Inclusive close нужно сохранять исходно: end-exclusive ms получается как `(native_close+1)/1000` при нулевом остатке, а не молчаливым отбрасыванием микросекунд.

У трёх сохранённых USD‑M файлов native open13-значный, шаг60 000 и inclusive close+1 точно даёт следующую минуту2026 UTC. Это source-specific подтверждение из saved qualification и первых двух строк, а не универсальное правило всех futures API в2026, которого доступные страницы сейчас не дали. Смена Spot precision не переносится на futures и REST-default не подменяет archive policy.

**Одна новая bounded-проверка:**52PASS/0FAIL, по2data-строки и3headers всего. Проверены exact saved URLs, привязка reused hashes к старому qualification,12fieldarity, first native timestamp/ordinal samples, calendar/time quantum и сохранение старого статуса. Полные264 960 строки не сканировались, hashes всегоCSV/архива не пересчитывались, старые normalizers/450/455/replay/observer suites не выполнялись. ВложенныйZIP читается в память для seek; это не измерение physical/native IO стоимости. Исходные raw строки и timestamp lexemes сохранены в `structural-crosscheck.json`.

Колонку7 можно теперь описывать как **native quote-asset volume**, а её отношение к предшествующему фону того же рынка — как отношение одной и той же физической величины. Это не два независимых провайдера и не разрешение складывать Spot и futures, преобразовывать в FX, сравнивать разные периоды или называть поле5 контрактным количеством. Не нужно переписывать frozen534, объявлявший эти единицы pending: новая документальная точка дополняет его отдельно.

Old `trade_content_qualified:false`, `signed_flow_qualified:false`, `decision_replay_eligible:false` сохранены. Schema mapping и12 примеров не становятся полной квалификацией всех264 960 значений. `available_at` остаётся исходным October9 acquisition clock, `source_ts`/native publication timestamp остаютсяNULL; June–August history не получает exante first-known. Production/shared imports, score/ENTRY, SQL/WS/MAIN/deploy/manual/TG —0. Owner-deferred ENTRY followup и physical-storage не затронуты.
