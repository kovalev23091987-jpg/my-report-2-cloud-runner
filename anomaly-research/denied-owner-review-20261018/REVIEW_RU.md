# Peer review уточнённого nonce/denied accounting

Проверен вариант, который координатор затем **отклонил** из-за неоплаченного заранее accounting tail. Standalone job/новый протокол/metadata-precheck architecture отменены; это сохранённый read-only verdict, не frozen implementation. Актуальное уточнение координатора: только RESERVED→FINALIZED; admitted/denied tag и cryptographic nonce в source_run_id; прежний ACTIVE_SOURCE_BUDGET_READ:run:attempt и2slots/day; atomic выбор business2500/32 либо accounting floor1/1; отдельный owned CAS finalizer сохраняет marker; до SQL — GitHub precheck двух созданных workflow runs/day и отказ rerun_attempt>1. Control≤40GET/bridge≤16/whole≤56 в прежнем164. Base `07703e786565eb2e0bbb4727f70ef6680115c07b`. Runtime, framework, schema/protocol, тесты, helper imports, jobs, SQL и provider calls не выполнялись.

Вердикт: уточнение снимает прежний конфликт нового DENIED state/нулевых резервов и может обеспечить владение. **Floor1/1 сам по себе не доказывает достаточный admission accounting tail или закрытие последнего unknown.** Native-ready статус, текущая schema/cost и реализация этим review не приняты. Source hashes, исходное историческое DDL evidence и точные ограничения — в `evidence.json`.

## Ownership и совместимость

Expected nonce создаётся один раз до transport и остаётся тем же в рамках invocation. Exact readback id+day+started_ts+nonce+tag+reserves отличает собственный совершившийся INSERT с потерянным ACK от duplicate другой invocation. Нельзя прочитать чужой marker из ledger и принять его за собственный expected nonce; новый процесс после restart не наследует владение только из совпадения run/attempt/id.

Обе ветви остаются в существующем state vocabulary. Shared day readers продолжают видеть RESERVED как unfinished и FINALIZED как measured/unknown. Nonzero1/1 удовлетворяет положительным CHECK **сохранённой исторической** DDL; это ещё не проверка нынешней native схемы или достаточности денег на SQL. Старый вариант DENIED0/0 снят координатором и не является замечанием к уточнённой ветви.

Branch tag должен соответствовать условию **того же atomic statement**, а не independently computed клиентскому допущению. Matched ADMITTED row при новом current unknown не даёт business grant. После ambiguous ACK разрешён лишь отдельно допущенный bounded accounting readback; подтверждённое владение не восстанавливает потерянные counters и не обнуляет unknown. DENIED, missing, unowned, malformed либо cost-unknown ответы не запускают business reads/source HTTP и не повторяют INSERT автоматически.

Owned finalizer должен проверять nonce/полный marker в самом WHERE вместе с id/day/started/state; сохранять тот же source_run_id tag+nonce и monotonic reserve/counters. Generic finalizeRunUsage для этого недостаточен: он WHERE id+RESERVED, перезаписывает source_run_id и не проверяет ownership. Своего custom CAS в новой реализации пока не проверял: frozen code не предоставлялся. Foreign duplicate никогда не финализируется даже после preceding SELECT; после finalized exact readback owner marker остаётся проверяемым. Historical witness старой строки не переписывается.

## Floor и полный accounting бюджет

1R1W — минимальный первоначальный bookkeeping marker, не upper bound полного accounting. Даже known successful INSERT+один successful finalizer требуют минимум двух row writes, а aggregate/readback требуют чтений; indexed native costs могут быть выше. Если DENIED admission проверит только current chargedW+1+next-full920≤70000, при ровно таком остатке ещё один UPDATE способен уменьшить защищённый next-full остаток ниже920. Monotonic MAX после факта честно показывает долг, но не делает исходный admission достаточным. Арифметический пример без исполнения: chargedW=69079;69079+1+920=70000 разрешает floor, а accounting2W даёт69079+2+920=70001. По existing finalizer contract один UPDATE уже добавляет1W; это не измеренный native upper bound.

До native приёмки нужно отдельно проверить/удержать весь bounded accounting tail и его следующий full reserve. Пока RESERVED row держит только1/1, разница до фактической стоимости также не удерживается общими sum readers. Без доказанного исключения параллельного расходования **всеми** общими actors поздний MAX не заменяет предварительную защиту этой разницы. Это вопрос существующего бюджета, а не разрешение новой квоты, parent namespace или изменения shared readers. Reader2500/32,2slots/day,3500000/70000,next-full59000/920 и прежние main/manual/source резервы остаются прежними.

При отсутствии admitted accounting headroom не обещать ledger row для каждого отказа. Same family_count<2 обязан охватывать обе ветви: после двух занятых слотов третью accounting row создавать нельзя. Неизвестный/zero-change INSERT может уже стоить native reads, но journal+NOT_CLOSED не выдаёт grant, не возвращает слот и не делает стоимость нулём. Резерв с1/1 не делает эту SQL бесплатной.

## Что даёт GitHub precheck

Два created workflow runs/day и запрет rerun_attempt>1 — полезный консервативный отказ **до** D1. В metadata нужно проверить точный repository/workflow/run/attempt/current head, включить queued/in-progress/failed/cancelled runs, подтвердить присутствие текущего run и полноту выбранной дневной выдачи. Missing/truncated/mismatched metadata отказывает. Не фильтровать только successful/completed попытки. Created UTC day и день native SQL не должны расходиться; очередной run с предыдущих суток не добавляет свежий дневной слот молча.

Этот GET сам не является linearizable native reservation. При race/eventual consistency нельзя обещать, что он гарантированно исключит любую третью SQL попытку. Окончательный hard bound двух **созданных ledger rows** остаётся в atomic day statement; отсутствие возможности записать третий failed attempt всё равно обрабатывается journal+NOT_CLOSED. Control40/bridge16/whole56 — предложенные client bounds, их фактический path/branch count и соблюдение прежнего164 нужно проверить на коде; здесь они не измерялись и не увеличивались.

## Retained DDL: точное происхождение и граница

В `audit-fixes/t00/fixtures/d1-schema.json` сохранена sqlite_schema row. SHA256 `dd9856e3b46ba04495f9e35e3b903bafa2bb525981a49036f6269247bb04fc5a` совпадает с FIXTURE_MANIFEST. Receipt указывает production read-only capture36359630895, captured_at1790552597585, changed_db=false. Capture выбирает SQL из sqlite_master; materializer не переписывает обычный CREATE TABLE string.

Эта DDL требует reserveR>0/reserveW>0, только RESERVED/FINALIZED и согласованность completed_ts/финальных measured fields. Она подтверждает несовместимость **прежнего**0/0/new-state предложения со своей исторической схемой и допустимость положительных значений по этим CHECK. Более поздняя native DDL/current bindings не квалифицированы здесь: координатор сверяет actual retained schema отдельно. Упрощённые test fixtures не заменяют эту проверку. Возможные trigger/index/column особенности и actual R/W из CHECK не выводятся.

## Unknown tail и честный конечный статус

Ledger UPDATE принимает snapshot **до** transport. Новое unknown в ответе самого finalizer не попадёт автоматически в уже отправленный unknown_ops. Postreadback может сам стать последней операцией с timeout/partial counter. Повторение UPDATE→readback не гарантирует исчезновения такого хвоста: последняя операция снова может иметь неопределённый ответ.

Сохранять нужно полный journal, known partial costs, expected owner marker, before/after cutoff и NOT_CLOSED без business grant. Нельзя обещать, что неподтверждённый SQL уже записал свою неизвестность в ledger, либо что локальный artifact автоматически заблокировал все другие actors. Даже row state FINALIZED и совпавший nonce не доказывают cost closure. Новому unknown не подходит historical witness15old операций; последующий новый business admission требует отдельного trusted reconciliation/применимого общего gate. Это предел приёмки, а не просьба создать бесконечный retry/protocol framework.

Решение координатора после этого review: standalone denied accounting и metadata-precheck вариант отклонены, потому что tail не prepaid, а floor не admission. Новая CLI архитектура, ledger state, schema и квота отменены. Следующая независимая работа — только точные поля уже полученных runner source/day/minute/month receipts и возможность их0SQL projection либо отдельно квалифицированный parent-owned контекст. Старый budget reader, savednatural39161429947 и принятые tests здесь не запускаются/не аудируются повторно; source balances/pilot/native разрешение не выданы.
