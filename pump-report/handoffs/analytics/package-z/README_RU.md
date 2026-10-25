# Z — actual saved-capsule audit reader,8PASS

Реализован auditSavedCapsules:≤10 saved summary rows, только exact read по связанным ROOT keys, explicit call/byte/evidence bounds и cache. Он проверяет actual frozen anchor/publication/card/receipt refs и действительно вызывает существующий W v2 audit. Новая интеграция с actual retained writer/journal/MemoryStore:8PASS с первого запуска; accepted W/V/T/X2/ROOT батареи не повторены.

Без forecast/model/train manifests результат NOT_CALIBRATED/null; missing refs не прячутся, read errors/overflow прекращают весь вызов. Raw/private bodies не попадают в результат и handoff. Нет CURRENT/full-history/native authentication claims, TTL/GC0.

Один конкретный store-format gap: implicit UNSENT expiry без сохранённого terminal остаётся unbound. Exact proposal для ROOT — ROOT_UNSENT_EXPIRY_TERMINAL_PROPOSAL.diff, не применён к runtime. Explicit terminal поддержан. Полный API/ключи/ограничения — ROOT_INTEGRATION_RU.md.

Production изменён только новым analytics/saved-capsule-audit.mjs. ROOT route/sourcepage/native admission не менялись. В этом пакете HTTP/SQL/TG/deploy/cron0, новые чаты/подагенты/автоматизации0; originals240/9пауз/2deferrals/capsunknownreserves сохранены. Манифест qualification.json, own release receipt отдельно после freeze.
