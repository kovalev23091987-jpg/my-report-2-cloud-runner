# X: готовый предлагаемый diff и storage API

PROPOSED / NOT_INSTALLED / UNEXECUTED. Текущий production materialized-summary.mjs не менялся. Готовый diff — materialized-summary-v3.proposed.diff; полный кандидат — materialized-summary.v3-proposed.mjs.txt; точные внешние cells, atomic protocol и read contract — ROOT_STORAGE_API_RU.md. Tests/imports/Node0, native HTTP/SQL/TG/deploy0.

Реально растут record_digests, pending_deadlines, instrument_assets. Указанный cohort.wave_keys в текущем materialized state уже отсутствует, scalar cohort counters сохраняются. Предложение V3 выносит три map в ROOT point receipts/bindings/maturity queue, держит один bounded durable queue intent и прежнюю atomic wave+global+cohort update. Исходная волна/replay fingerprint/cohort/HITMISSUNKNOWN/DD алгоритмы прежние. Receipt existence не равен APPLIED; source_cursor остаётся authority факта прохода ordinal.

Старый v2 state/digests/экспорты не трогаются, TTL/GC нет. Рост общего числа отдельных records не объявлен решённой physical capacity. До согласования хранения ROOT проверка намеренно не запускается — это прямой порядок текущего задания X. Далее одна connected affected qualification через реальный consumer, без повторения W9/V8/T4/старых батарей. Original240,9пауз,2deferrals, caps/unknowns/reserves сохранены.
