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
| D1 bridge E2E | read-only gate → bounded index → readback → повторный idempotent apply | PASS |
| Final-chain regression | exact-decision binding, dedupe и delivery uncertainty прежней цепочки | PASS |
| Owner safety | proof identity, safety flags, one-shot dispatch, rollback ownership, natural logs | PASS |
| Package route | порядок gates, exact production scope, live flags, additive preflight | PASS |
| Remote no-send diagnosis | run `35521665753` success; budget-block proof gate reproduced и исправлен | PASS |
| Remote R8.20 isolation | run `35522458529`: Telegram выключен; точный fatal R8.20 при остатке 559 reads; owner-only isolation проверена статически | PASS |
| Validation ordering | единственный delivery test выполняется до optional sidecars; schedule и обычный manual сохраняют прежний путь | PASS |
| D1 Telegram envelope | namespace 1024; preaction 1536 reads / 4 writes помещается в наблюдённый headroom | PASS |
| Git round-trip | commit → clone → полный package self-test без архивных log-файлов | PASS |
| Baseline targeted regression | 22 Fast Move, Multi-Wave, liquidation, pipeline и Telegram теста | PASS |

Локальные PASS относятся к байтам пакета, зафиксированным в `MANIFEST.json` и `SHA256SUMS`. Новый owner-only isolation ещё не запускался удалённо: это выполнит команда владельца до любого изменения `main`.
