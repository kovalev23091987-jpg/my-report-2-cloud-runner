# F621 — AIN READY: часы источников и минимальное исправление

Для первого patch поддержан выбранный ROOT порядок: immutable original CAS → enqueue/dispatch с существующими двумя DELIVERY price/book → остальные retained features/latest/wave/queue/journal. Source API менять не требуется. TTL, прежний card expiry и проверки сценария остаются прежними. Сокращение критического пути обосновано кодом; попадание в оставшиеся 6,662 секунды и реальный SENT ещё не доказаны.

Проверен один сохранённый AIN AUTO original `ed3642c7-0124-4354-9267-ae93d68085b1`: READY, automatic_eligible=true, minimum potential=11.490592574901148% — расчётный gross, не исполненная прибыль. Analysis 26 октября 19:42:08.284 МСК, original saved 19:42:08.535. Delivery trace: STALE / MANDATORY_FACT_EXPIRED_BEFORE_PUBLICATION, карточки нет. Private LOOKUP3 имеет SHA256 `3f9317ec7bbffc2461e05237d3b1b0da0c616bdcadd30ab703045929c88f7b85`; raw и рыночные массивы в пакет не включены. Original pin `08ab5e3f4b58cbbce2d5278ca956810fcf1f4f25cda23b033444f087846893a7` исторический, это не доказательство текущего AUTO72 SENT. Q — отдельный отказ PLAN_INVALIDATED.

|Факт|Event, МСК 26 октября|Received|Expiry|Остаток после optional, на analysis|Остаток на original saved|
|---|---|---|---|---:|---:|
|price|19:41:52.000|19:41:54.422|19:42:22.000|13 716 ms|13 465 ms|
|orderbook|19:42:00.197|19:42:00.225|19:42:15.197|6 913 ms|6 662 ms|
|candles|19:41:00.000|19:42:01.945|19:42:30.000|21 716 ms|21 465 ms|
|trades, optional|19:42:04.698|19:42:04.831|19:42:34.698|26 414 ms|26 163 ms|
|funding, optional|19:00:00.000|19:42:07.441|19:05:00.000|уже STALE|уже STALE|

На received trades стакану оставалось 10 366 ms, на received funding — 7 756 ms. От последнего received core candles до final analysis прошло 6 339 ms; это совокупный интервал optional/native/local работы, а не измеренная чистая HTTP latency. Начальные analysis/deadline optional и точное время publication-check не сохранены. Из branch STALE следует только, что проверка прошла не раньше 19:42:15.197. Какой отдельный последующий native вызов потратил остаток, не установлено. Устаревший funding не следует «чинить» переносом event_ts на received_ts.

Код разбирался по fresh main `888d10299bbcc639dda23fe6b1a23fd3124f3d09`, 13 файлов прочитаны с GitHub по этому SHA; их git blobs находятся в JSON evidence. Параллельный рабочий patch ROOT этим обзором не квалифицирован. Точки исходного кода:

- `runtime/runner.mjs:83–102`: после immutable CAS до возврата выполняются retained_features.remember, latest, wave, active-instruments, candidate-queue, observations.remember. `:139–149`: этот вызов стоит перед проверкой expiry и enqueue. Это конкретный устранимый участок.
- `runtime/worker.mjs:33–47`: revalidate получает исходный input, выполняет forced DELIVERY price/book, factUsable и тот же analyzePump со свежей ценой/ликвидностью, проверяет price move и пересечение entry/exit. Свечи берутся с исходными часами; price/book не продлевают их пригодность.
- `runtime/delivery.mjs:45–66`: исходный card expiry проверяется при claim и перед send. `runtime/telegram-send.mjs:5–17`: срок проверяется до TG reserve и сразу после durable reserve перед HTTP. Эти барьеры сохраняются.

Первый patch ROOT должен оставить immutable analysis/input с исходными fact IDs, clocks, implementation/evidence class до отправки. Отложенные derived записи обязаны дойти до существующих индексов/очередей и в отказных ветках; нельзя из-за перестановки потерять сохранение результата либо повторить отправку. Идентичность original→card text/hash→тот же TG/message_id/readback остаётся обязательной. Это не изменение ENTRY follow-up, статистики или физических storage deferrals.

Два DELIVERY-запроса уже укладываются в существующий upper: overview1 + day1 + core price(primary/fallback)2 + candles1 + book1 + optional2 + DELIVERY2 = **10 BingX**, плюс TG1 и максимум1 отдельно назначаемая optional map = **candidate upper12**. `force_refresh:true` в `sources/index.mjs:141–153` отключает fallback price, positive-cache TTL=0; `:277–288` ограничивает вызов выбранными price/book. Ошибка/negative cache/отказ бюджета могут дать меньше HTTP, но никогда не оправдывают новый третий refresh. BingX10/min,1/s,900/day,27900/month,164/run, manual3 и все прежние расходы/unknowns/резервы сохранены.

Очередь broker сериализует полный provider work; Promise.all не даёт гарантии параллельного HTTP. awaitProviderWindow(cost10) — прогноз, не эксклюзивная аренда минутных слотов. Каждому запросу нужны прежние atomic reserve/finalize. Default request deadline10s и pacing1/s не гарантируют суммарный send <6,662s: durable reservation/finalization и enqueue/readbacks могут занять больше. Если окно закрывается, правильный результат — STALE без TG; новая цена не разрешает продлевать старый card expiry.

Если affected-проверка первого patch покажет, что сокращения недостаточно, резервное предложение для отдельного решения ROOT: перенести те же два forced DELIVERY price/book до финального immutable published original, полностью пересчитать readiness/scenario/liquidity и только затем сохранить final input/text. Можно получить price, затем book двумя существующими getCore с only_facts по одному, чтобы короткий book TTL пришёл последним. Final dispatch тогда обязан проверять те же привязанные saved facts без второго refresh, со всеми исходными clocks и действительными candles; новый input/original должен иметь новый hash, старый original не менять. Это **не первый patch**, не внедрённый контракт и не разрешение на дополнительный HTTP/ослабление TTL. Для него отдельно потребуются защита от двойного refresh, exact original/receipt binding и affected-квалификация ROOT.

F621 — static offline evidence/proposal: Node/engine/источники/native SQL/TG/build/deploy не запускались; SOURCE/runtime code не менялся. Source qualification24/24, no25. Новые currentCORE/maps/cryptoN не объявлены. Собственная bounded CAS/FULL и артефакты отделены от фактических IO admissions.
