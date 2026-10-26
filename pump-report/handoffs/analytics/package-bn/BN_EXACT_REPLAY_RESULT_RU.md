# BN — точный replay 18:00, EXPECTED_REFUSAL

Результат: EXPECTED_REFUSAL для фактически сохранённого input KIMCHI-USDT запуска1372a2e6-3736-448e-b32d-846e37bafc80. Выполнен ровно1Node/1analyzePump. Полный replay analysis совпал с сохранённым analysis, включая REJECTED/ready=false/CURRENT_ACTIVITY_NOT_CONFIRMED; critical differences=[]; input не изменён. Ошибка runtime или конкретный дефект input этим replay не установлены.

Original clock сохранён: 26октября2026,18:01:58.122МСК. Название запуска18:00 не подменяло analysis_ts. Последняя закрытая минута закончилась18:01:00, lag58.122s при допустимых90s. Получены125 нормализованных закрытых минут с15:56 до18:01; normalized.reason=null. Все61 конца5m окон последнего часа имеют полное сравнение с12предыдущими5m окнами. Неполная база/дырки в необходимых окнах не являются причиной данного отказа.

| Проверяемая величина | Фактический производный результат |
|---|---|
|5m окно с наибольшим ratio|17:00–17:05МСК|
|Сумма native-volume этого окна|661436.7000000001|
|Медиана12предыдущих сопоставимых окон|420894.85|
|Максимальный ratio за61окно|1.5715010530539875 при необходимом≥2|
|Доходность наиболее объёмного окна|+2.1505376344086002%|
|Положительная5m доходность|22из61окна|
|Окна одновременно ratio≥2 и return>0|0|
|Последнее5m окно|17:56–18:01МСК|
|Его сумма / медиана|226751.9 / 376615.1|
|Его ratio / return|0.602078620851899 / +0.11148272017835748%|
|Пригодный новый impulse / выбранный impulse|0 / отсутствует|
|original.input.previous_wave|отсутствует|

Это volume_native с UNKNOWN_NATIVE_UNIT и тем же canonical comparison_key. Числа не подписываются как монеты, USDT или денежный оборот; ratio допустим только в исходной сопоставимой native основе.

Growth gate отдельно был пройден:24h+29.208633093525194%≥20%. Короткие окна:5m+0.11148272017835748%,15m−1.318681318681325%,60m−2.9189189189189113%; они не достигли10%. current_threshold_passed=true не заменяет проверку актуального объёмного импульса. При отсутствии пригодного previous_wave и любого5m impulse сratio≥2/return>0 выполнение дошло до movement.mjs:160–166, выбрало CURRENT_ACTIVITY_NOT_CONFIRMED и index.mjs:114 вернул REJECTED.

Предварительный pullback plan в этом input не вычислялся: selected impulse отсутствовал, plan=null, automatic_eligible=false. По BM static-ветвям предварительный план допускается до RESUMING/подтверждённого возврата; фактический BN отказ вызван отсутствием требуемого2×импульса в полученных данных. Гипотетический план при ослабленном gate не строился. Нельзя утверждать, что такой план был бы пригоден, или что нужно менять2×. Этот replay проверяет конкретный input и текущую формулу, а не прибыльность/оптимальность профиля.

Retained-wave predicate: previous_wave в сохранённом input=null, поэтому пригодной сохранённой волны для обхода нового импульсного поиска не было. Проверка не доказывает, что никакой волны никогда не существовало в более ранних запусках/базе; новых чтений для этого не выполнялось. CONCRETE_INPUT_OR_RUNTIME_DISCREPANCY не установлен.

Точные входы и воспроизведение

- Original container SHA899f557c1a352d42e1a242e0ab7459df542a6f799645d20d762a9ee67420acd4; original.input SHA983b29950920e6db4d7b0ed6be15ca474a659c35a4186ab17de3938d857885dc (SHA256 UTF8 JSON.stringify исходного input).
- Native13 ROOT подтвердил EXACT_RUN_AND_ORIGINAL_ANALYSIS_BOUND/OBSERVED и FINALIZED8queries127R4W0unknown. Это расходы ROOT; новых native-операций BN нет.13использован,14/CONTROL7/METADATA3 не разрешены.
- Artifact69 SHAaee90f2b5cd0d240f949dd896dc7a5cad1485fb10a6a3447dac503f7f3e31a06; implementationd984187530314079e626b426bd2e356826369ba62d86224e840f5f752fa88daf. Все69manifest-хешей сверены;12analytics/profile/contracts dependencies извлечены побайтно. Node импортировал только эти private69копии.
- ROOT отдельно установил70 и восстановил AUTO/DL; текущая70не подставлялась вместо исходной69 в replay. Аналитика/источники/профиль70 совпадают с69по подтверждению ROOT; нового server readback BN не делал.
- Driver SHA3130f77b6a67d691e9ac8d0d03e4ac5b661dbf015358fa614a6e026ec9c3f4a8. Public derived result SHA cc9e9d224f2becbef13d0b67fef490176e224973ff4a592db37078f3cc7fd985.
- Полный replay result private: .private/replay-full-result.json SHA7f745bfc1f9059f391cba45e06a815c067e79225cac2744147c5aea374c78341.
- Все61числовых predicate/window private: .private/replay-predicates.json SHAe937aea50fe24740dc096227012fd9216b751a11c7dc1973f52081964ea23059.
- Частный reproducer descriptor: .private/private-reproducer.json SHAa266d34a1de805bc9e82f8e416cd715acaab828dfdc57f2e0707d47d97378b19. Он ссылается на неизменённый original path/SHA и точные модули/driver/config. Raw input не вынесен в public artifacts/чат/Git; private replay папка игнорируется через собственный .gitignore.

Ограничения: один связанный original case; отсутствие historical-retention-аудита и hypothetical-plan расчёта; калибровка стратегии/вся550coverage/будущее исполнение не проверялись. Тесты старых пакетов не запускались, BM/BL frozen не перезаписаны. Node1/analyzePump1/new nativeSQL0/sourceHTTP0/MCP0/TG0/deploy0/codefix0. Все сохранённые расходы/unknowns/резервы/9пауз/2OWNERdeferrals остаются. GitHub authority/own CAS — отдельный control-plane. Timely own release/FULL приложен отдельным receipt.
