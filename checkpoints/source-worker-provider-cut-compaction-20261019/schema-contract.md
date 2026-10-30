# Только technical schema V2

Поле completion `technical_provider_receipt_observations` сохраняется. Исторический schema `EXISTING_PROVIDER_LEDGER_OBSERVATIONS_V1` не переписывается и не улучшается. Новый runtime capture возвращает `EXISTING_PROVIDER_LEDGER_OBSERVATIONS_V2`; buildRunBudgetContext пропускает обе версии только при exact run_id. Никакой serialized объект не становится proof/admission token.

V2 заменяет `events` на `records`, `record_count`, `retained_observations` и фиксированный `cut_columns`. Это явное изменение технической сериализации; старый frozen545 harness с SHA-pinsV1 для новой квалификации **не использовать**. Current8 run-budget tests не изменены и здесь не запускались; старый central392523 case не повторяется. В новой центральной квалификации использовать только новый callable component.

Record common identity exact equality:

```text
source, run_id, contract, route, reference_key, attempt_sequence,
query_window_end_ts, day_utc
```

Фиксированный `cut_columns`:

```text
capture_order, phase, captured_ts, provider, row_presence,
reported_used_units, configured_cap, reported_own_reserved_units,
minute_bucket, returned_allowed, returned_status, native_usage_guard_passed
```

Каждый `record.cuts[i]` — массив **ровно12** primitive/null значений в этом порядке. NULL остаётся explicitnull, измеренный0 не превращается в missing. Четыре фазы различны, одинаковая phase может повториться и остаётся отдельной cut. `capture_order` — локальный порядок вызовов observe, включая возможные промежутки от invalid/overflow; это не provider timestamp. Восстановление порядка сохранённых срезов — по capture_order, не по query clock или record order. `captured_ts` каждой phase не заменён общей датой группы.

Existing validation/sanitization исходных полей сохранена: source/phase whitelist, exact safe contract/route/reference, day/query clock agreement, native_usage_guard_passedtrue, captured_ts>=query cut, strict nullable numeric counters. Private/unknown body/URL/credential/SQL keys не копируются. По-прежнему это local ledger/helper replies, не raw SQL body, источник всего account/day/month/minute budget или новое право запроса.

Bounds: исходная sanitized observation<=1024UTF8, каждый compact record<=1024UTF8, records<=16. Общий JSON array payload<=14336, ещё2048 зарезервированы для fixed header/counters/rootrun; финальный frame<=16384 проверяется защитно. Превышение добавляет `overflow_observations` за отброшенную observation; ранее retained cuts не удаляются/не обновляются, reservations/facts не возвращаются. Foreign count измеряется в omitted cuts, не groups. All-run complete всегдаfalse; даже18modeledcuts не закрывают native run/day.

Исходный392557 frame имеет2пропуска и остаётся OVERFLOW. Группировка новых будущих callbacks может предотвратить такой overflow, но не возвращает пропущенные данные старого запуска. Native unknown counts/query metadata не обнуляются; numeric account/month/manual/nextfull grant не выводится. Верхняя граница byte DTO не является измеренным полным heap/CPU/persistence/native wire/daycapacity bound.
