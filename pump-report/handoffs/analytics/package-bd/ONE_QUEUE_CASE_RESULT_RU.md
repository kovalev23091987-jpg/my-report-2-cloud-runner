# BD — один исполняемый affected case очереди

**PASS.** Один новый искусственный сценарий выполнен через настоящий `createPumpRunner.execute`: baseline1 и fixed1. Принятые runner suites, полная аналитика и старые AX cases не повторялись. ROOT runtime не изменялся ANALYTICS.

## Точные входы

Baseline runner SHA806c9bc83a69d125d1b72eaaf8495d7342912e0fc92776d776e7db3078f97dfd взят из frozen LIVE AZ artifact d2b4c796497bc90e550ef6b3066199597da7bf75447cb26c7b9cd950baca16b2, pin87420e4a. Fixed runner SHA03f8f0cfb13ed86e64500b681f9b33e500bee7630d67b955296c316597bce722 предоставлен ROOT. В каждом дереве66 модулей; остальные65 совпали с точными байтами артефакта. Пути и все hashes/bytes — frozen-inputs.json.

Положительный ROOT_BA_ONE_AFFECTED_CASE_ADMISSION.json прочитан по immutable main6a47168180df5674b3fae4122b7a3e381c641a16 и git blobcf7ece73e5ee92c5db9773bf5fc3788d4b670d52. Own scoped CAS/FULL и свежая authority подтверждены до Node. Локальный affected-start записал SPENT_BEFORE_EXECUTION; ROOT admission helper не менял и не переиспользовал.

## Единственный fixture

Все данные ARTIFICIAL, встроены в замороженный test-файл. Два фиктивных инструмента BINGX:USDT_M:ARTIFICIAL_BD_ENDED и …NEW; цена1, искусственный clock12:00МСК. Они не являются DOOD/KIMCHI, котировками или native registry proof.

ENDED: завершённая/отменённая волна, current day0/short0, inactive, due, возраст120мин, остальные priority bonuses0 → score120. NEW создаётся текущим discovery: day20/short0, first_seen=now, movement freshness1, без прежнего CORE/entry proximity → score20. История обзорных снимков сохранена в fake store, поэтому реальные updateDiscovery и ranking выполняются на этих двух строках.

В каждой ветке новый MemoryStore и stub budget с ровно одним логическим местом. Sources/budget/delivery — изолированные stubs; `getOptional`, map, HTTP reservation, Telegram enqueue/dispatch и outcome callback запрещены. Full analytics index/engine и source modules не импортировались; импортирован только необходимый frozen dependency graph runner/MemoryStore. MemoryStore используется без D1Store/db.

## Что реально проверено

| Ветка | Выданный fake ticket | Реальный выбранный stub CORE | Результат |
|---|---|---|---|
|Baseline|ENDED|ENDED|NEW отдельно deferred после исчерпания одного fake места|
|Fixed|NEW|NEW|ENDED остаётся в store и не пытается получить место|

У реального `admitCandidate` нет аргумента instrument ID. Атрибуция не выдумана как новое поле API: trace связывает немедленно предшествующий source-evidence callback настоящего checkInstrument с принятым ticket, затем с candidate overview и getCore той же монеты. В обеих ветках порядок evidence < admission < overview < CORE подтверждён. Принято ровно одно место на ветку.

Fixed сохраняет marker/history/first_seen старой записи, её прежние last_checked_ts/next_check_ts, current day0/short0 и active=false. Новая монета проверена и её last_checked обновлён. Оба run сохранены в fake store, executor owner освобождён. Результат baseline сохранён до запуска fixed, fixed — до итоговых assertions; полные искусственные ответы также лежат в private temporary receipts.

В том же case receipt статически проверены: общий точный near predicate0.8, OR active_wave, побайтно неизменённые manual functions/execute tail и остальные65 модулей, включая priority/profile/budget/carry. Отдельных active/manual/carry cases не было. Порогов, весов, пауз или нового порядка работы manual не добавлялось.

Счёт: executions1, controlled-case1, runner.execute baseline1/fixed1, analysis stub1 на ветку; full engine0. Fake admission attempts baseline2 (1принят/1отказ), fixed1 (принят). Это не реальные HTTP расходы и не повторная проверка native банка.

## Ограничения

Проверка доказывает конкретную замену выбора и атрибуцию логического места на искусственной очереди. Она не доказывает actual AUTO/SENT/550coverage и не объявляет BA причиной реальных отказов DOOD/KIMCHI. Реальный сервер в момент разрешения оставался AZ; deploy/native route admission этим пакетом не выдаётся.

Provider HTTP/MCP/nativeSQL/TG/Worker/deploy/CONTROL/LOOKUP0; GitHub использован только для authority/own lease. LOOKUP10/10spent не сбрасывался,11-го запроса не было. Caps/unknown/reserves/9пауз/2OWNERdeferrals и старый report pause сохранены. ROOT решает интеграцию frozen fixed runtime отдельно.
