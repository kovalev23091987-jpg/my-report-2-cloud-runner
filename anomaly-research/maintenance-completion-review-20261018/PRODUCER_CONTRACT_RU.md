# Точные границы диагностики maintenance

Прочитан main `2711cad6b83e07d2336445441d9811eaa9c0e766`. Это проверка существующих producer contracts перед отдельным review frozen изменения координатора. Runtime и тесты проверяющий не выполнял. Исходные файлы и хеши перечислены в `producer-contract.json`; его таблицы описывают варианты исходного кода, а не новые фактические native ответы.

Исполняемый scheduler поступает из `post-v7-consolidated/final-reconciliation/files/src/scheduler-control.mjs`: manifest after hash `ffdcde5a97aa58040e1bff4001bd3980e9e8799eaaa951e8ceeeecc4ba347cea` совпадает с файлом. `apply-all-runtime.mjs` применяет final reconciliation перед current-generation; current overlay scheduler не заменяет. Legacy `post-v7/src/scheduler-control.mjs` не определяет текущую сигнатуру completion.

| Возврат claim | claimed / due | Граница вывода |
|---|---|---|
| INVALID_INPUT |false / false| Вход не квалифицирован; это не успешный расчёт срока |
| NOT_DUE |false / false| Сохранены last_success_ts и next_due_ts |
| LEASE_ACTIVE |false / true| Есть owner/expiry; claim не получен |
| CLAIM_RACE_LOST |false / true| Claim не получен |
| CLAIM_READBACK_FAILED |false / true| Нет подтверждённого claim |
| CLOSED |true / true| Только получение claim с lease_started_ts; выполнение отдельно |
| MIGRATION_REQUIRED / CLAIM_FAILED |false / false| Ошибка могла прервать расчёт; due:false не доказывает NOT_DUE |

При complete статус CLOSED означает UPDATE одной строки, `completed:true`, а `success_recorded` равен запрошенному `success===true`. Поэтому CLOSED совместим с success_recorded:false: lease завершён, last_success_ts не продвинут. NOT_UPDATED и INVALID_INPUT имеют completed:false/success_recorded:false. MIGRATION_REQUIRED/COMPLETE_FAILED имеют completed:false, но **не возвращают** success_recorded; отсутствие поля не нужно превращать в доказанный false или true.

Runner заранее вычисляет effective unified mode. Его `lowPriorityCadenceDue` — gate выполнения: manual всегда true; schedule в unified требует claimed===true, в legacy — started UTC minute=2. Он отличается от claim.due: due=true при активном чужом lease не разрешает выполнение. Нулевой claim у manual/legacy означает отсутствие вызова claim в этой ветви. Сам gate не доказывает фактическую работу всех статистических ветвей: validation/capacity/configuration остаются отдельными условиями.

`maintenanceSucceeded` проверяет persisted recall со статусом CLOSED/PARTIAL/ALREADY_FILLED_THIS_HOUR и prospective CLOSED при enabled либо DISABLED при disabled. Block weights не входят в эту функцию. Его boolean или success_recorded нельзя переименовывать в успех всех трёх статистик, рыночный outcome, native cost closure, восстановление всего отчёта или Telegram SENT.

Для нового completion поля допустимы только заранее названные собственные scalar поля фактического ответа. Не spread исходного объекта и не копирование error/SQL/params/results/вложенных неизвестных полей. Не преобразовывать строку true в boolean, numeric string в receipt clock, отсутствие/null в положительный статус. Clock сохраняется из producer; started minute не заменяет claim time. Нужны отдельно effective mode/gate, observed status claim, факт вызова complete и whitelist фактического complete response. Запрошенный cadence boolean не заменяет ответ UPDATE и не доказывает запись успеха.

Complete следует присвоить из **единственного существующего await**, с прежним lease_started_ts и порядком sidecars→complete→finalization→analytics lease release→completion artifact. Никаких диагностических SELECT, нового claim/retry, изменения scheduler cadence/SQL/gates или бизнес-формы. Исходный потерянный claim natural39136880005 из PR473 этим не восстанавливается: его причина остаётся UNKNOWN. Приёмка новой диагностики в будущем natural run потребует его точного артефакта; code review не заменяет этот факт.
