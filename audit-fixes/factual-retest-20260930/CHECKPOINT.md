# Мой отчёт 2 — source-to-Telegram binding

## Текущий статус: кандидат, рабочая версия не изменена

Production main: `36aeac2b048edb39b9fc6603cce32331ad849574` (PR41 runtime; последующий коммит только ручная команда).
PR43: `repair/factual-retest-observe-20260930`.

Последнее указание владельца: **стратегию и согласованную цепочку не менять**, исправлять только воронку передачи уже полученных данных к Telegram. Поэтому раннее предложение повторного подтверждения пересечённого уровня полностью исключено из кандидата. Observation plan, direction resolution, state selection, scores, thresholds, entries, targets, invalidation and format retain production rules.

Исправляется обнаруженный разрыв: canonical adapter не получает ACK-sealed Full Evidence bundle, а читает преимущественно public_evidence статусы. Worker передаёт существующий sealed bundle; новый конвертер проверяет exact contract/snapshot, registry digest и observation lineage, freshness, asset identity, alias and source health. HTX execution допускается только после повторной проверки измеренного factual orderbook. ACK не выдумывается. Старые OKX алиасы без явного crypto asset class не допускаются.

Локальные отдельные проверки: 24 PASS, синтетические unit-fixtures отмечены явно, Telegram network calls 0. Это не историческая приёмка и не внедрение.

Порядок обязательной приёмки: полный exact-runtime CI; одинаковая четырёхдневная D1 история 1790449221000..1790794821000 через реальные publication/binding/sender functions с транспортом-перехватчиком без сети; затем реальный отчёт кандидата в облаке с проверкой готовности цепочки Telegram; только после успеха merge/deploy. Исторический PREPARED bundle проверяется как фактический D1 readback, не как придуманный insert ACK. Ни один dry-run не получает фиктивный Telegram SENT/message id.

Следом автономно продолжить незавершённое ТЗ из `MY_REPORT_2_UNIFIED_EXECUTION_TZ_20260930.md` и `MY_REPORT_2_REMAINING_WORK_20260930.md`, не повторяя завершённые PR31–41. PR42 отдельный кандидат; не смешивать автоматически. Все этапы с проверками до внедрения. Новых команд и действий владельца не ждать.
