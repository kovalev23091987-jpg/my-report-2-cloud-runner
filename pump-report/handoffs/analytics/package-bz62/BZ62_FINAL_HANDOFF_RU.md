# BZ62 — одна affected-квалификация seed provenance

**PASS_CONTROLLED_NOT_NATIVE: 1 Node-процесс, 1 connected case, 35 векторов, повторов и failed Node в BZ62 — 0.** Исходный proposal BZ61 прошёл без изменения байтов. Canonical analytics/feature-capsule.mjs не менялся.

Три положительных вектора подтвердили полные исходные seed+12 baseline окон и текущий numerator: native reported quantity с UNKNOWN units, квалифицированный BASE и USDT turnover. 29 отрицательных векторов дали всем восьми seed-dependent features bound=false/value=null/source_window_status=UNKNOWN: отсутствующие/частичные старые окна, чужая comparison identity, fact/evidence/clock mismatch, future received, недоказанные единицы/row proofs, конфликтующий дубль/decimal, изменённые saved scalars, иной профиль, SHORT_HISTORY и overflow1441. Два вектора изолировали неверный текущий диапазон/numerator в UNKNOWN только у current-to-seed ratio. Отдельный чужой fact.instrument_id отклонён assertInput; капсула с ложной привязкой не создана.

В тесте воспроизведён исходный дефект: базовый writer связывает retained seed-скаляры по свежему заголовку при отсутствии старых строк. Proposal в том же контролируемом оригинале возвращает UNKNOWN. Все fixtures заморожены; после проекции проверены неизменность analysis/input/card, T0/P0, исходных digest и плана. Все non-seed features и retention-поля совпали с base. Engine/analyzePump не импортировался и не запускался. Native SQL/provider/CF/Telegram/build/production changes = 0.

До Node записан собственный positive actual offline admission: свежие17/all4/fence/generation, совместимый ROOT owner, точный own CAS/FULL, frozen SHA base/proposed/dependency closure/test/authority. Attempt создан с flag=wx, original admitted bytes сохранены отдельно, admission переведён в SPENT_ONE_NODE_ONE_CASE_PASS_NO_RETRY. Exit0, длительность процесса0.103082416s. Все прежние чужие и собственные расходы/failed/unknowns остаются в своей истории; текущие нули относятся только к BZ62.

Точные SHA256:
- base: `6f3ad60c9f235512bd762133c56f5e662fe9b78cbc8eec0cf76b76dc44942ec9`
- proposed: `e329280fa138a3a01e98cb99713dc5e93b3f2cee4d1dae95f7c937ec371b6de7`
- qualified patch: `0f1a81de45c0adf987d5332a2af2a0e71fd552ceab5917197637ca1a87b1ee95`
- testcase: `38e1ecf1050a21da46aff58472c356db727192ebdf954b9286cb2582113e3bc1`
- result: `79a8e29be6e8c9c2f48ceb3d33686db9742153006249d2ceda6fc63f828116ba`

Пределы вывода: это проверка новой feature projection на ARTIFICIAL originals; внешняя аутентификация/история фактического рынка не доказана. Поддерживается точный текущий профиль и FULL baseline; внешнего resolver нет. Старые immutable capsules не переписываются и не переквалифицируются; versioning/read-path накопленной истории остаётся отдельным решением ROOT. Только ROOT отдельно интегрирует canonical код и новый artifact после фактической приёмки publication-пакета; этот case не изменяет его статус.

Private first-IDOL/sourcepackets/raw16/recipient не читались. Хранение, delete TTL, reference closure и entry сопровождение не менялись. Сохранены все расходы/unknowns/CLOSED holds/резервы/caps/manual3,9пауз и2OWNERdeferrals. Детальные frozen hashes и расход — в manifest/admission/result; release FULL сохраняется отдельной административной квитанцией.
