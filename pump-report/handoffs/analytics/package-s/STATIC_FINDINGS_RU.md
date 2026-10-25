# S — доказанные статические ограничения

Нового численного дефекта analytics этим пакетом не заявлено. Ниже конкретные storage/projection gaps из текущего кода; изменений соответствующих алгоритмов и повторных регрессий не делалось. Точные строки и SHA — evidence IDs в матрице.

| ID | Наблюдение | Доказательство | Следствие |
|---|---|---|---|
| S-G01 | Journal `analyses[]/publications[]`, journal-index и outcomes-pending читаются/перезаписываются целиком | E005–E012, E039 | Work limit после get не ограничивает размер чтения; нужна миграция ссылок, не обрезание истории |
| S-G02 | `audit_meta.features/implementation_sha256/forecast` читает offline audit, но runtime writer их не создаёт | E039,E054–E057; поиск writer в runtime/analytics дал только audit readers | Нельзя объявлять summary records готовой базой калибровки или удалять analysis/input ради счётчиков |
| S-G03 | `record_digests` получает каждый уникальный record; `instrument_assets` и pending deadlines находятся в едином aggregate | E046–E052 | Raw record paging исправляет source index, но ещё не ограничивает все materialization state values |
| S-G04 | `summary-record` содержит полный outcome, aggregate считает adverse known/unknown, не переносит entry-area scenario scalars | E035–E040,E048 | Для DD/scenario distribution и аудита сохранить численные per-wave outcome labels |
| S-G05 | Overview-index фильтруется до1ч, тела старых overview/cache ключей физически остаются | E060–E070 | Live-window pruning не равно cleanup; actual DELETE/expiry job в inspected new store отсутствует |
| S-G06 | Latest-analysis содержит duplicate full analysis; `pump:run:*` имеет writer без get-reader в inspected runtime | E002,E066 | Возможна будущая projection, но только после проверки внешних audit refs |
| OWNER | Relative compare удалён из active context/index/presentation; старые offline cohort whitelist поля не являются разрешением нового benchmark collector | owner-removal manifest + S35 | Никаких новых consumer TTL/reserves для BTC/ETH сравнения; исторические originals защищены |

Важное ограничение: даты свежести15/30/90с — проверка пригодности для нового анализа, не срок хранения первоначального доказательства. Horizon4ч и wave expiry тоже не разрешают очищать ещё неизвестный исход или отправку. Код/data shared/runtime не менялись; nativeHTTP/SQL/TG0.
