# F705 — focused static review denial witness

**STATIC_ACCEPTED_PENDING_ROOT_CONNECTED_QUALIFICATION.** Frozen ROOTproposal принят статически; новый connectedcase ROOT ещё требуется. SOURCES Node/import/tests не выполнял.

Проверены ровно3файла по frozenSHA: budget `9b74aa1abb0f28289d59e96e4938f269a9feeb39ef7c4e74d1ef30cabc2f6b5a`, runner `8ee9e67d3e1cea0256bdfbc8e02af7d25cc35faa6af0289d7f3f780d8725c08e`, helper `3ae8ec6d966a756b02b4728da6ceba48a0206d5d75b979f14947f7be4718f63f`. Baseline — существующий83; старые F703/F704/BZ78/BZ79/cases не повторялись.

Пять исходных предикатов сохранены точно, как и порядок отказов. Изменений reserve/finalize/closeCandidate, charges/holds, sourcequote verify/commit и grant/idempotency-веток нет, кроме stage-метаданных assessment. Runner только переносит готовое поле в прежний DEFERRED/NOT_CHECKED результат, не меняя reason/detail/delivery.

Witness берёт тот же state и cached now текущего assess. При первомglobaldeny plan ещё не оценён, auto_charged остаётсяnull; поздние проверки ради witness не запускаются. Atomic quote re-assessment помечен отдельно и берёт его current state/operation. Число вызововclock(),store.get/store.atomic не меняется; helper не имеет import/await/clock/IO.

Формат фиксированный:15числовых/nullableterms, до4числовыхpacingполей, enumстроки, nonnegative safe integers. Структурная верхняя граница compactUTF8JSON — **978байт**, включая все максимальные поля. Это не обещание равных CPU/байтов хранения: witness добавляет ограниченный payload, а не новые IO-вызовы.

Слагаемые выбирать по equation: GLOBAL_DAY включает fixed_http, PLANNED_ALLOCATION его не включает; provider equation использует только provider_*terms. Остальные значения — контекст. PACING operatorGTE, остальныеGT. Не суммировать все поля terms вместе.

Отмечены границы для ОДНОГО нового ROOTcontrolledcase: old/newdecision+resource-state parity, те жеclock/quote hooks/IO counts, раннийglobal без поздней оценкиplan, atomicNEW11, providerday/month/PACING, invalidreserve/nonfinite/unsafe input, boundedhelper и перенос существующего runner-result. Приinvalidreserve capture может повторно сформировать непригодную числовую сумму; helper вернётnull, исходный отказ сохраняется. Арифметическая сумма на отказе вычисляется повторно синхронно безawait на том же JSONstate/now; это ограниченное CPUдобавление.

Только5equationотказов получают witness. Остальные validation/admission/native/backoff/surpluslimitотказы могут его не иметь. Summary/UI не рассматривался — ANALYTICS. Статическое принятие не заменяет connected qualification, build/readiness и отдельные live admissions; текущаяlive83 не менялась.

Actualданные, квитанции, auth и CFproof отсутствуют в пакете; только genericcode/diffs/coordinationmetadata. Native/CF/providerHTTP/TG/Node/import/tests/build —0. Бюджетных/стратегических исправлений по статическомуreview не требуется. Собственная аренда освобождается с FULL отдельно.
