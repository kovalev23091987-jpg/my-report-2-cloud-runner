# Исправление доказанного backfill starvation

Основание — frozen PR466/head0654dedee1b387d560b6b02e13e90c3790391f04, `new-admission-counterexample.json`:180 закрытых15m свечей с объёмом100×1.2ⁿ дают160 событий. Ранее oldest-first capture занимал128active историческими событиями, единственный своевременный event не принимался. Это был controlled offline дефект, основной runtime им не затронут.

В существующем `observer.mjs` теперь разделены **запись карточки** и **допуск watch**. Исторические карточки по умолчанию остаются в памяти без active/due. Своевременная карточка может начать watch, а при заполнении active — сохраниться pending. Историческое наблюдение допускается только явно, с неизменным BACKFILLED/first_known; оно тоже занимает общий128active. Поэтому deliberate исторический admission или legacy debt по-прежнему могут оставить новый watch deferred: гарантия безграничного наблюдения не заявляется.

Общие128active/512cards неизменны. Backfill admission использует только512−128=384 карточки; это внутреннее разделение прежней памяти, не новый общий/source/native ресурс. Остаток не является доказательством готового HTTP/SQL/storage admission. Защищённые карточки не удаляются. При полном card space исходный payload остаётся **caller-owned** и возвращается целиком с raw-ref/hash/first_known и `durable_ingress_required:true`; это не хранение вне пула. Внешний crash-safe ingress пока отсутствует.

Новый control использует тот же180-bar OHLCV recipe и отдельную явно controlled instrument fixture. Поэтому IDs не сравниваются с dummy instrument frozen466. Внутри нового прохода все160 исходных карточек/хешей/first_known сохранены точно:159BACKFILLED,1PROSPECTIVE,1active,0deferred. Старый дефект не выполнялся повторно. Новое evidence — `backfill-admission-evidence.json`, исходное frozen доказательство и его hash — в checkpoint.

Миграция старого snapshot выполняется явно. Она не закрывает исторические active, не переписывает outbox и caller outcome links, не повышает неизвестные/пропущенные limits до defaults. Legacy overage сохраняется как долг, возможен честный defer. Model checksum и caller-owned links не являются native schema/authentication/полной reference graph проверкой.

Все retained card refs защищены до отдельной полной квалификации retention/outcomes. Это консервативное временное правило ограниченного offline пула: при заполнении512 продолжение может быть отложено. Ни7дней, ни REFUTED, ни simulated SENT не удаляют карточку или незакрытый90d исход. `retentionDecision` остаётся отдельной невнедрённой границей.

Новые тесты11PASS выполнены как первоначальные10 плюс отдельный новый missing-limits boundary1. Из-за изменения capture/protection дополнительно проверены12 затронутых watch случаев и1pending90d reference случай. Старые nonce6/protocol15, provider replay, retained CT/BR и исторический benchmark не повторялись. Две существующие watch-fixture группы и benchmark harness теперь явно запрашивают HISTORICAL_REVIEW; старый измеренный файл не переписан и не выдаётся за текущую CPU оценку.

Детектор/исходные карточки, outcome formula/anchors, capacity arithmetic, durability policy и nonce protocol побайтно сохранены. Основные стратегия/score/паузы/источники/формы/лимиты/ENTRY неизменны. Реальные native admission, persistence, cleanup throughput, restart durability, delivery, predictive accuracy не приняты этим пакетом.
