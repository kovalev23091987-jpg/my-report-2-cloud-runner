# X2 — аналитический V3 реализован,9PASS

ROOT утвердил X storage contract; в materialized-summary.mjs добавлены V3 exports. Full record fingerprint receipt+source_seq и immutable instrument binding находятся в ROOT point cells; wave/global/cohort scalar updates остаются атомарными. Один maturity_pending запрещает новые folds до фактического queue/currentref readback+ACK. Старый prefix/exports и v2 data не изменены.

Исправлен один статический дефект предложения до теста: partial/has_more/противоречивый due boundary не даёт CURRENT даже при пустом pending counter. Snapshot, diff и точный proof сохранены. Одна новая related qualification на искусственном корпусе:9PASS0FAIL0SKIP с первого запуска, старые тесты не повторены.

Pure analytic consumer и100-record structural growth проверены; actual ROOT OutcomeJournal/runtime/native storage не проверялись и не объявлены подключёнными этим пакетом. ROOT integration/queue/cost admission остаются отдельными. Подробности — ROOT_INTEGRATION_RU.md. Общая история всё ещё растёт отдельными receipts, physical capacity не доказана. TTL/GC0, HTTP/SQL/TG/deploy0; original240/9пауз/2deferrals/capsunknownreserves сохранены.

Манифест qualification.json, receipt своей bounded lease после freeze — lease-release.json. Не повторять принятые9 без нового конкретного дефекта.
