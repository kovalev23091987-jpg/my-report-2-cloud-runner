# Новый сохранённый случай: отложенная статистика и отдельные исходы доставки

Read-only аудит **нового** natural `39136880005`, head `03fafed3ef85e2e58f141b0fe6070fe3579a4490`, run `1792334308196-1792334318400`. Использованы только уже сохранённые координатором файлы. Не выполнялись runtime tests, provider calls, SQL, повторная сборка или получение нового full canonical. Старые квалификации/аудит30хешей не повторялись.

## Конкретный недостающий факт

В completion accounting все три статистические ветви (`block_weights`, `discovery_recall`, `prospective`) имеют `DEFERRED_LOW_PRIORITY_CADENCE`. При этом prospective budget gate allowed=true: зарезервированные дополнительные3000R9W помещались в остаток16905R244W. Это означает **неисполнение этой статистической ветви в данном full**, а не нулевую выборку, отрицательный исход или отсутствие пригодного события.

`runner-main.mjs:1147–1148` получает `postV7MaintenanceClaim`, но сводит любой `claimed!==true` к общему cadence defer. Сам объект claim не входит ни в completion JSON (`1214`), ни в итоговый объект (`1210`); ответ `completeMaintenanceCadence` (`1193`) вообще не сохраняется в переменную. Это подтверждённая потеря конкретной диагностической причины в сохранённых артефактах. **Причина данного запуска остаётся UNKNOWN.**

В действующей сборочной цепочке `apply-all-runtime` применяет final-reconciliation, затем current-generation overlay. `src/scheduler-control.mjs` приходит из final-reconciliation manifest; current-generation не заменяет его. В этом источнике `claimMaintenanceCadence` различает:

| Возврат существующей функции | Что можно знать из него |
|---|---|
| NOT_DUE | due=false, last_success_ts и next_due_ts |
| LEASE_ACTIVE | due=true, действующий owner/expiry |
| CLAIM_RACE_LOST | due=true, claim не получен |
| CLAIM_READBACK_FAILED | due=true, запись/чтение claim не подтверждены |
| MIGRATION_REQUIRED / CLAIM_FAILED | ошибка получения claim; это не NOT_DUE |
| CLOSED / claimed=true | получен claim, но выполнение и completion подтверждаются отдельно |

В legacy режиме `postV7UnifiedEnabled=false` есть другая допустимая причина: scheduled minute !=2. В этом запуске completion не сохраняет и effective unified mode. Число `scheduled_minute_utc:38` — только минута started_ts; оно не раскрывает claim reason и не доказывает, что статистика обязана была выполняться в38-ю минуту. Нельзя объявлять cadence сломанным по этому полю.

## Узкое предложение координатору

Сохранить в существующий completion artifact компактные **уже вычисленные** effective mode, `lowPriorityCadenceDue`, claim и completion receipt. Для claim достаточно whitelist полей: status, claimed, due, job_key, interval_ms, last_success_ts, next_due_ts, lease owner/start/expiry; для completion — status, completed, success_recorded. Сам raw error/SQL/params копировать не нужно. Ответ complete надо сохранить из существующего await, не выполнять повторно.

Это additive observability:0 дополнительных SQL/HTTP по предлагаемому пути, без новой cadence, правил событий, квот, ретраев или влияния на основной отчёт. Нужны только проверки координатора на конкретном изменении; здесь они **не выполнялись**. Полезные cases: отличить NOT_DUE от due=true/LEASE_ACTIVE и CLAIM_FAILED при прежнем DEFERRED; отдельно сохранить NOT_UPDATED/COMPLETE_FAILED после состоявшегося вызова статистики. Ни один из них не должен превращаться в рыночный outcome или создавать новые попытки.

## Три разных оси в этом же сохранённом запуске

| Объект | Подтверждённый факт | Чего он не доказывает |
|---|---|---|
| Full ZEC/UNI | CLOSED, оба canonical сохранены; UNI OBSERVE, ZEC REJECTED | фактический ENTRY или новый same-current-canonical SENT |
| APR исходное наблюдение216 | terminal IDEA_REMOVED, ORIGINAL_TTL_EXPIRED; отдельная bound terminal публикация SENT217 | падение/рост цены, противоположный или неотработавший рыночный исход; доставку текущего UNI |
| UNI старый LONG G7 dispatch | FAILED_RETRYABLE, NATIVE_LIQUIDATION_SOURCE_STALE, sent=false | отрицательный рыночный исход или неисправность всех его источников |
| Статистика | три ветви DEFERRED, prospective capacity allowed | completed calibration, нулевые outcome counts, false anomaly |

Отказ UNI относится к старому LONG G7; текущая в этом full публикация UNI — другой SHORT G11. Этот отказ не доказывает состояние или свежесть текущего SHORT.

Для APR у bound delivery receipt `source_run_id` — нынешний исполнитель, но canonical run_id — `ORIGINAL-TASK-TERMINAL:RCHK:…`. `same-run-delivery-proof` корректно оставляет `NO_EXACT_SAME_RUN_SENT_CAPTURED`, reason `NOT_THIS_CANONICAL_RUN`, actual_ENTRY=false. Итого одно фактически отправленное terminal217 совместимо с нулём подтверждённых SENT нынешней пары. Не использовать aggregate delivery.sent=1 как успешную доставку UNI.

Нет исходных price-check/закрытых свечей APR→его сроку, complete anomaly event/plan/first_known/trajectory или full external EvidenceV2. Поэтому ни APR TTL, ни UNI retry, ни DEFERRED не записываются здесь как SUCCESSFUL/FALSE/OPPOSITE/UNWORKED/нулевой outcome. Также TTL обычного сообщения не является сроком удаления долгого anomaly события или его статистики. Самостоятельных новых anomaly rules или retention/admission policy не введено.

Предшествующий `39136414965` рассмотрен только по уже сохранённой exact no-work receipt: NOT_DUE + NO_FRESH_EXACT_SENT_TRIGGER, market_conditions_evaluated=false. Он не является дополнительным full, provider miss или отрицательным рыночным образцом. Не нужно повторять его запуск.

## Сохранённые границы

Original artifact12140187203 SHA256 `994ac1139a935d940c2ec526b0d93fcd3ac2fd8d4a889ce4ed1517073f5b7ba3`; выбранные member hashes совпали с review координатора. DATA_DB point702requests37098R598Wunknown0 относится к указанному completion scope после analytics lease release; это не общий остаток бюджета и не whole-day bound. Ни old unknown15, ни reservations не изменялись. Доказательства и строки исходников — в `evidence.json`.

Приложение `n12-successor-review.json` фиксирует отдельно прочитанную узкую delta `290e5224`→`042013378e45e560edeacdab20e0773adef0dd3f`: явные intrinsic physical_root/quote/contract поля, assertion, manifest hash/maintenancenote. Consumer predicates не менялись; блокирующих замечаний в этой delta нет. Сохранённые target6/output-freeze логи только прочитаны; это не повторный тест и не приёмка connected CI. Frozen review PR472/heada86e089b оставлен неизменным.
