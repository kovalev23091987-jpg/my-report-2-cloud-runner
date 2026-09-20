# Test matrix

| Область | Проверено | Результат |
|---|---|---|
| Реальная причина R3 | Архивная DDL отклоняет `FINAL_CHAIN_CANDIDATE`, разрешённые категории записываются | PASS |
| Dedupe / restart | повторный запуск, сохранённая SENT/RESERVED, отсутствие автоповтора | PASS |
| Concurrency | две независимые SQLite-сессии не резервируют разные waves одновременно | PASS |
| Failure injection | unknown/missing/string ACK, lost finalize ACK, prepare/read/write failure | PASS |
| Anti-look-ahead | future observation/update отклоняются | PASS |
| Partial/stale data | null, stale, malformed, expired строки не отправляются | PASS |
| LONG/SHORT symmetry | одинаковые результаты и сообщения для обоих направлений | PASS |
| Unicode identity | NFKC exact identity, опасные control/format символы отклоняются | PASS |
| Cooldown/fairness | 30 минут между waves; уже отправленный первый кандидат не блокирует следующий | PASS |
| Hard safety flags | output disabled, conflict with final auto, invalid test id | PASS |
| Schema | индекс обязателен; additive/idempotent; legacy CHECK не меняется | PASS |
| Final-chain regression | exact-decision binding, dedupe и delivery uncertainty прежней цепочки | PASS |
| Owner safety | proof identity, safety flags, one-shot dispatch, rollback ownership, natural logs | PASS |
| Baseline targeted regression | 22 Fast Move, Multi-Wave, liquidation, pipeline и Telegram теста | PASS |

Локальные PASS относятся к байтам пакета, зафиксированным в `MANIFEST.json` и `SHA256SUMS`.

