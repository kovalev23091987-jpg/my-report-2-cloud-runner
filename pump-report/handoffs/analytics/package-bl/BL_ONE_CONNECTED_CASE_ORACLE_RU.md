# BL — один связанный affected case (PREPARED, NOT EXECUTED)

Общий fixture ARTIFICIAL_ONLY, не actual native admission. ONE future Node invocation, no oldtests/engine/nativeIO. ROOT frozen main424e3dc8dbefd54943aacc0bf8ed71dda59f44a2. Изменения ROOT не применять.

1. Production policy export остаётся OFF/null; без fixture enable прежний EVEN_DAY_CANDIDATE_ALLOCATION и весь state неизменён.
2. Та же синтетическая насыщенная base bank: один conditional grant12/BX10/TG1 из свободной ёмкости; original base allocation/carry/candidate_count/issued_before не изменяются.
3. Fresh clones до выдачи: manual/global, future plan, provider day/month, backoff и каждое native unknown/expiry/remaining constraint блокируют grant без новых logical records. Оверлеи в fixture, caps не меняются.
4. Два бюджета с per-run ARTIFICIAL native views и одним shared revision/CAS backend конкурируют за один full hold. Один выигрывает; проигравший оценивает уже held state. Повтор тех же run+candidate/cost — тот же OPEN grant, без второго hold; mismatch cost/closed grant не переиздаются.
5. Каждый reserve реального budget видит чужие holds. Own CORE и DELIVERY конвертируют remaining->consumed, state.days/provider/plan увеличиваются ровно на cost; remaining+consumed=original глобально и по provider. Не double-count. Другой потребитель не расходует защищённый остаток.
6. Положительные finalize receipts дают known closure; CLOSED unused остаётся held до original UTC day-end. После day-end known CLOSED может перестать учитываться held, но original record/logical_spent остаются. Это не ранний refund.
7. UNKNOWN receipt/outstanding оставляет UNKNOWN/OPEN и hold, включая следующий день. Native usage unknown может запретить запись closure и оставить OPEN: безопасный outcome — retained hold, не invented positive ACK.
8. После close поздние CORE/DELIVERY для ended candidate не принимаются. Старые logical counters никогда не возвращаются; новые денежные charged растут только по фактическому synthetic reserve.
9. Один real createPumpRunner.checkInstrument с realbudget/fake sources, source error после выдачи grant: finally обязан вызвать closeCandidate. Full analyzePump не исполнять; fake source ошибка не native request.

Подготовленная более консервативная ROOT семантика принята: known-unused не освобождать до day-end; UNKNOWN/OPEN не expire в heldsum. Общая future/native policy не становится currentIO proof.

Точный интерфейс уже дан ROOT: createUnifiedBudget(...).admitCandidate({candidate_id,http_upper_bound:12,http_by_provider:{BINGX:10,TELEGRAM:1}}) ->surplus_grant_id; closeCandidate({candidate_id,surplus_grant_id}). Nativeguard использует store.admission/usage/finalization_reserve, evidence_ref suffix #PUMP:AUTO:runid, expiry>=now+120000, floors Q600/R600/W140. В тесте только ARTIFICIAL native views, shared fakeCAS не доказывает D1 atomicity.

До единственного запуска: новая/действующая ownCAS/FULL, freshguards, exact frozeninput hashes, отдельная запись SPENT_BEFORE_EXECUTION и once-lock. Первый failure сохранить до любых дальнейших действий; rerun только после конкретного ROOT исправления. No providerHTTP/MCP/nativeSQL/TG/deploy/source search. Oracle сейчас не исполнялся.
