# Ограниченные рабочие индексы — пакет ROOT

Основа: main3871bac5, ТЗ v2 и OWNER_NO_MARKET_COMPARISON; S retention-consumer-map и protected-reference-edges. Реальные потребители: manual claim/finish, delivery enqueue/drain/receipt repair, journal terminal recovery, outcome collection. Старые массивы pump:manual-queue / delivery-queue / journal-index / outcomes-pending растут или читаются целиком.

В существующей pump_report_state_v1 вводятся отдельные versioned head/member/ready-reference ключи для четырёх видов. Legacy читается один раз bounded≤40 элементов/10000B, hash/order/count сохраняются, исходный массив не изменяется. Большой/изменившийся legacy не обрезается. Modern range-read≤40 ссылок; cursor вращается только среди активных ссылок. Enqueue имеет двухэтапную ACK allocation→pointer commit recovery, membership обеспечивает идемпотентность.

После durable terminal target+необходимой summary/result/receipt записи member становится DONE, и удаляется только новая производная ready-reference. Store DELETE ограничен точным новым префиксом+16-значным sequence; raw analyses/cards/signals/outcomes/journals, исторические массивы и UNKNOWN-аудит не удаляются. Процесс, прервавшийся после ACK DONE до удаления pointer, восстанавливает только derived pointer cleanup. SQL UNKNOWN останавливает работу; повторных HTTP/Telegram ради миграции нет.

При миграции pending ещё не принятая новая задача не должна теряться между сохранением target и индексом. Manual сначала доводит bounded migration до ready, затем сохраняет job. Delivery/journal/outcome callers сохраняют исходники до add и продолжают идемпотентно после прерывания. Frozen journal anchor сам по себе не доказывает сохранение signal/summary: terminal repair повторяет безопасный sync; HIT/MISS после прежнего прерывания восстанавливает summary до закрытия pending reference.

Новые проверки только связанные: restart/duplicate/add-close recovery и active-only bounded scan после длинной завершённой истории; bounded legacy/несовместимый source; реальный SQLite indexed range/строгий derived-only DELETE; connected manual priority, UNKNOWN no resend, frozen-anchor/terminal outcome summary repair. Принятые summary5+2 и старые батареи не повторяются.

Никакого нового runtime/provider/SQL допуска: server824c9fc и потраченный summary-once остаются неизменны до отдельного точного артефакта/проверки. Общее full-day/six-manual измерение, остальные per-wave arrays/aggregates и TTL/retention остаются открыты. Сроки удаления оригиналов не назначаются. Старые ENTRY followup и physical capacity tests не возобновляются.
