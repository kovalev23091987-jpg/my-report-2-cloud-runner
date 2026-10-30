# Дополнение к единственному ROOT connected case, НЕ ВЫПОЛНЕНО

В том же Node после freeze/admission добавить bounded controlled invocations, а не отдельные квалификации:
1. AUTO с заранее сохранённым initialized manual job publish:false. До claim захвачен QUEUED_MANUAL ticket; actual SQLite trace показывает выбранный id и только его. Внести bounded CAS contention до пятой попытки. До/после finishManual снять stageStatus RUN_AUTO: его остаток не уменьшается от completion, в нём оплачиваются run row/executor; native finalize проходит только после healthy закрытия holds. Собранный driver использует тот же D1Store, не mock booleans.
2. Два queued unqualified/owner-excluded jobs: ровно один claim/completion, второй PENDING с прежним ACTIVE pointer; INCOMPLETE carry. noteCandidate может остаться0, но второго claim нет. В AUTO без job дополнительный51/72/54 hold отсутствует.
3. Недостаток headroom для QUEUED_MANUAL: refusal до claim SQL, query counter не растёт от claim, job PENDING, существующий end/finalize floor жив. Не повышать800/5000/300 или сроки ради fit.
4. Между preflight page и completion поставить реальный initialized head.pending другой сохранённой job; recovery внутри complete укладывается в дополнительные13Q33Rhint20Whint с atomicPair CAS≤5. Проверить сохранённые targets/member/pointers, а не status=true. Legacy migration вне этой envelope; preflight ready=false переносит work без claim.
5. R3 выполняется совместно с ANALYTICS proposal: expired SENDING/READY/RETRYABLE saved-only settlement, actual additional SQL≤A+G в hint model; TG/source refresh0, original clocks/receipts/pins неизменны. Failed/pending/unknown этап удерживается и не маскирует первичную ошибку.

Это требуемые будущие witnesses. Ни один не исполнен и не объявлен PASS; физические Cloudflare rows и throughput этим не доказываются.
