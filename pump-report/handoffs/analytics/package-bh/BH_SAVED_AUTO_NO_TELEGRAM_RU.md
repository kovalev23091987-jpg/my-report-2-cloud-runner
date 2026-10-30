# BH — почему сохранённый AUTO не отправил DARKSWAP

В AUTO **7de14263-15a1-4207-89d9-4fa8c942a04d** проверка DARKSWAP была **отложена до аналитики** из-за почасового распределения бюджета. Это не торговый отказ и не ошибка доставки.

Оригинал: SHA256 bc8c7fcc0bb17f58504052b8050d165eec34cc7e8a83be11937a6b6ef1131836. Снимок ROOT сделан 26.10.2026 в **15:58:17.958 МСК**, относится к BA pin 3bd0cbd96b9bdc1525fb6b06831749451cb612976632a4cb5d5c15c5f064f0aa. Executor этого AUTO уже освобождён в **15:50:50.679 МСК**. Это исторический конкретный запуск, не состояние нового BG после установки или последующих часов.

## Подтверждённая цепочка

| Стадия | Факт |
|---|---|
| Выбор кандидата | В deferred записан BINGX:USDT_M:104219:DARKSWAP-USDT |
| Бюджет до CORE | status=DEFERRED; source_coverage=NOT_CHECKED; reason=PROTECTED_DAY_RESERVE; detail=EVEN_DAY_CANDIDATE_ALLOCATION |
| Аналитика | checked=[]; сохранённый analysis original=null; saved_candidate=NO_SAVED_AUTO_CANDIDATE_IN_LATEST_RUN |
| Доставка | У deferred candidate delivery=null; у run delivery=[]; в его прочитанной цепочке нет карточки/квитанции SENT |
| Итог запуска | INCOMPLETE; discovery_result=INCOMPLETE_COVERAGE_OR_RESOURCES, а не NO_READY_IDEAS_IN_CHECKED_SCOPE |

Использованы **точные байты BA артефакта**, а не нынешний изменённый runner. В BA checkInstrument вызывает admitCandidate на строке108 и возвращает DEFERRED на109; CORE получается позже, первый analyzePump — на120. Enqueue/dispatch стоят на143–144 после готовности и публикационного допуска. В execute на232 такой DEFERRED добавляется в deferred и прерывает цикл **до** result.checked.push.

Следовательно, в этой попытке нет оценки текущей активности, ликвидности, плана, funding или карты DARKSWAP. Нельзя говорить, что монета не подходит стратегии, что её план плох, либо что карта/funding стали причиной отказа. Исторические проверки других запусков этим не опровергаются.

## Что именно остановило бюджет

В сохранённом allocation candidates_per_period=1. Строки банка на 12:00, 13:00, 14:00 и 15:00 МСК каждая содержат candidate_count=1, maximum=1, carried_in=0, charged=4. Точная причина совпадает с BA budget.mjs:177: candidate_count>=maximum → EVEN_DAY_CANDIDATE_ALLOCATION.

Это **счётчик выданных логических мест**, не число HTTP, успешных анализов или отправленных идей. HTTP charged и candidate_count учитываются отдельно; выданное место не возвращается из-за малого фактического расхода, отказа идеи или отсутствия SENT. Сами четыре строки не объясняют, какие монеты ранее заняли места и до какого результата дошли: их оригиналы этот пакет не изучал.

Project day467, BingX day466 и automatic_plan limit634/charged448 — разные сохранённые счётчики. Они не являются свободным остатком для немедленной повторной проверки. BH **не пересчитывал** бюджет, будущие резервы или размер банка и не менял policy. Из detail нельзя заключить, что исчерпана вся внешняя квота: зафиксирован конкретный отказ pacing. Provider day/month проверки ниже этого возврата не дают здесь нового положительного допуска.

На следующий час этот снимок не переносится: он не доказывает ни сохранение того же блока, ни новую проверку, готовую идею или отправку в 16:00 МСК.

## Почему INCOMPLETE не сводится к одной монете

В том же run сохранены ещё две причины: SOURCE_EVIDENCE_PENDING count9 (NATIVE_CORE_UNIT_EVIDENCE_REQUIRED) и UNIVERSE_QUALIFICATION_INCOMPLETE unqualified24. Поэтому общий итог INCOMPLETE включает неполноту источников/каталога вместе с бюджетным defer. eligible_for_deep_check=541 — допуск к попытке, не доказанные CORE или 541 анализа; current_CORE_proven=false.

Run resources.total=2 и два CONFIRMED BingX DISCOVERY receipts относятся к предварительному discovery. candidates={} согласуется с отсутствием глубокого запроса по DARKSWAP. Это не «запуск вообще ничего не делал».

Финальное resources.mode=STATISTICS не означает, что AUTO случайно запущен как статистика: BA checkOutcomes на157 переключает mutable budget mode перед итоговым summary. В run статистические HTTP=0/outcomes=[], его основной цикл остаётся AUTO.

## Граница доказательства Telegram

Для DARKSWAP стадия доставки **не достигнута**. Ошибку Telegram здесь установить нельзя: нет попытки enqueue/dispatch этой карточки и нет delivery ERROR/UNKNOWN. Пустой delivery=[] также не является подтверждением работоспособности Telegram.

ROOT сообщил health15:47 МСК HTTP200/AUTO ON/DL ON. Эти flags разрешают работу программы, но не создают бюджетное место, анализ или SENT. В снимке просмотрены3 карточки при limit20; статус NO_PRODUCTION_AUTO_SENT_IN_READ_SCOPE относится к этому ограниченному чтению, whole_history/whole_market=false. Это не заявление, что бот никогда ничего не отправлял.

Отдельные8SQL/92R/4W/0unknown — стоимость уже выполненного ROOT LOOKUP12. Его market_HTTP=0/Telegram=0 не заменяют счётчики исходного AUTO. Run unknown0 — только поле этого run, не whole-account-day и не сброс прежних unknowns.

Для доказательства восстановления нужна фактическая последующая цепочка: допуск кандидата → сохранённый анализ → при готовности сохранённый текст → попытка доставки → тот же message_id/readback. BH не выполняет эти действия и не обещает сигнал.

## Передача

Точные JSON pointers, исходные значения и BA module hashes — ACTUAL_STAGE_EVIDENCE.json. Raw capture/SQL/params/body не копировались. Код и настройки не менялись; Node/imports/tests/engine/new API/MCP/SQL/TG/deploy/LOOKUP=0. LOOKUP12 consumed/0left/default10, резервы/unknowns/9пауз/2OWNERdeferrals и старая пауза сохранены. ROOT параллельно управляет установкой BG и восстановлением AUTO; этот разбор не является изменением его runtime.
