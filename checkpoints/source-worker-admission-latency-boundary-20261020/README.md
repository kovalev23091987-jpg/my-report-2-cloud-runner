# Оставшаяся задержка внутри одного provider get

Новая отдельная статическая граница после frozen PR572. Даже caller с `clock:Date.now` получает одно readTs при входе в get; затем тот же timestamp проходит через несколько await. Это не повтор 36 подготовленных groups572, не их запуск и не изменение572.

## Конкретный допустимый по коду delay witness

1. T0: live clock возвращает T0; текущий CG ledger пуст.
2. Cache SELECT завершается через35сек с известным расходом, unknown0. Cache miss.
3. Daily preflight завершается ещё через35сек, также с известным расходом, unknown0. Обе операции короче45сек configured timeout одного RemoteD1 запроса. Общего provider-get deadline нет.
4. Другой корректный caller в T0+69сек резервирует9 CG units. Наш caller ещё не резервировал собственную единицу, поэтому concurrent9 не превышают свободный остаток.
5. Наш старый rolling preflight/atomic INSERT используют `created_ts>T0-60000 AND created_ts<=T0`, не видят concurrent rows изT0+69сек, вставляют свою единицу с created_ts=T0. Exact readback находит её; total с прежними bounds возвращает1<=9.
6. Whole grant допускает один запрос, native unknown остаётся0. Fetch dispatch выполняется послеT0+70сек, без новой проверки часов. В текущем реальном rolling window уже9 других единиц, а наша timestamp row к этому времени старше60сек.

Это **code-derived CONTROLLED timeline, UNEXECUTED**, а не измеренный native перерасход. Порядокawait, predicates и отсутствие guard подтверждены текстом действующего кода. Индивидуальный timeout не ограничивает сумму последовательных успешных операций. Нет необходимости предполагать один65сек запрос, который уже превысил бы45сек timeout.

UTC day/month вариант: T0=23:59:40 предыдущего дня; два успешных35сек await переносят reservation/fetch на следующие сутки. day_utc и created_at всё ещё производятся изT0. Факт ответа получает честный received_ts после транспорта; это не исправляет более ранний admission timestamp. Никакой новый месячный grant или возврат старого расхода не следует из смены даты.

## Что уже ограничивает путь

- Native unknown прекращает цепочку при неизвестных расходах. Этот witness сохраняет все расходы известными; unknown0 не доказывает свежесть reservation clock.
- Whole HTTP grant ограничивает количества и дубликаты, но не содержит времени/deadline.
- Atomic minute INSERT предотвращает гонки только внутри переданного временного диапазона; future-to-readTs rows явно исключены.
- Новый12сек provider timeout создаётся после admission и не ограничивает предыдущие SQL await.
- Точный cached source/identity/quote clocks и последующая нормализация защищают факт. Они не являются подтверждением admission/actual dispatch.

## Почему здесь нет мнимого минимального исправления

Перечитать clock перед minute reserve уменьшает задержку, но внутри reserve остаются await и старый bound. Проверка sameUTCday/возраста перед fetch могла бы остановить конкретный большой delay или rollover и сохранить расход без возврата, но сама по себе не закрывает конкурентный rolling60s даже при меньшей задержке. Переписать timestamp ранее созданной reservation «в памяти» нельзя. Отказ при любом изменении миллисекунды фактически выключит нормальный remote SQL путь.

Полная actual-dispatch гарантия требует явного контракта: допустимая задержка между reservation и dispatch, консервативное время удержания/видимости concurrent reservations либо подтверждённый dispatch timestamp, общие provider callers, и admission дополнительных SQL/writes если они нужны. Пример bounded hold математически требует учитывать возможную задержку сверх60сек, но выбирать новую длительность/пропускную способность без измеренного обоснования этот пакет не разрешает. Общий minute ledger используется многими действующими N05/N12 collectors; локальная правка одного reader не должна выдаваться за глобальное решение.

Поэтому это готовая точная **документальная граница и требования к следующему контракту**, без speculative runtime patch, нового reader, SQL/schema, framework или callable. Для новой affected проверки сначала нужен конкретный корректный и принятый repair contract. Текущий central пакет572 сохраняет заявленный узкий get-entry scope.

Production/shared файлы, frozen570/572 и их manifests неизменны. Source Node/syntax/runtime imports/semantic/SQLite/apply/provider/nativeSQL/MAIN/manual/TG/deploy0. Native cost/overrun/grant/SENT/savings не заявлены. ENTRY и physical storage не исследовались.
