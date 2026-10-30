# F684 — source mapping clocks: реализация и проверка

Точный F683-патч применён к двум source-файлам. Swole сохраняет mapping event/expiry и ограничивает expiry зоны минимумом срока модели и price mapping; HL сохраняет mapping clocks при прежнем min-expiry. Proof, source clocks, единицы, TTL и маршруты сохранены.

**Единственный связанный Node-case PASS** (exit0): clocks проходят normalizer→selected lineage, числовые строки не склеиваются при сложении TTL, устаревший/future/unknown mapping не повышается до пригодного, свежий receipt не обновляет source age. Старые suites и engine не запускались. Positive offline admission заранее сохранён с FULL readback: 5748b023c8aa73719172b1dd0271f64abec9ba5d.

**Реальный connected максимум — 2000 components, включая одну выбранную зону.** Swole возвращает один response с максимум1000 LONG+1000 SHORT rows. Синтетический connected проход действительно дал одну выбранную зону с2000 components; все2000 проверены. getLiquidations не складывает результаты разных routes или предыдущих вызовов. HL в connected пути ограничен1 HTTP и максимум1 target position (хотя standalone collector поддерживает до2 аккаунтов); Orderly даёт0 пригодных zones. Выбор до6 зон не умножает2000 на6. Validator должен проверять все компоненты, без обрезания до64/100; невалидный или превышающий доказанный bound lineage — отказ квалификации.

Source after SHA256:
- liquidations.mjs: d2014941a4c93ad472932180b4bb06114398b02d93bc2955da8f65c943a17002
- hyperliquid-observed-positions.mjs: e6315d844a183fecdc78bda293a248b19796d8ebd4a88a10b1ce3448dacf8c58

Patch SHA256: d970ed48f32024ce02520e0ec37141ddbd9712cddf8db8b8f848a2ce7b98b78f. Implementation commit: 5748b023c8aa73719172b1dd0271f64abec9ba5d. Base: 1441ae512b446187cec07da65988628cc2a466d5; qualification authority: f9e8db9662c821e32cbe21350a917c7d97f952a0.

Новых provider/native/CF/SQL/TG вызовов:0. HOLD SOL/BTC, ограничения и резервы сохранены. Final pre-send validator, runtime recovery и внедрение принадлежат ROOT; данный PASS не является доказательством native Telegram freshness или завершения всего ТЗ. Точный testcase/result, кодовые указатели и границы component bound — в JSON handoff.
