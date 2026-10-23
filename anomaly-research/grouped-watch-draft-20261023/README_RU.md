# Один черновик на одну закрытую проверку

Новая конкретная задача очереди ANOMALY_WATCH_CONFIRM_OUTBOX после передачи PR628. ROOT отдельно разрешил узкое TEXT-предложение. База: свежий main7e6fd776f5f6a3576394a5805a43a96a48e8beec. Пакет не является частью текущего общего запуска SOURCE+628. Автор не выполнял Node/import/syntax/tests/SQL/SQLite/provider/native/deploy/MAIN/Telegram. Старые kernel/DUE/outcome/journal тесты не вызывались.

## Расхождение по существующему коду

В observer:191–196 один выход закрытой свечи выше исходного диапазона создаёт LONG CONFIRMED и SHORT REFUTED; ниже — обратную пару. advanceCapturedWatch в текущем anomaly-native-due-watch.mjs:159 превращает каждый transition в отдельный DRAFT. Таким образом, одна проверка может дать два черновика для одного события/snapshot. Это вывод из точных сохранённых функций, а не наблюдавшаяся двойная Telegram-отправка. Контракт outbox/ATOMIC_OUTBOX_CONTRACT_RU.md уже требует один DRAFT на группу переходов одной исходной проверки. Новый before/after controlled witness подготовлен, но ещё не исполнен.

Предлагается один приватный groupClosedWatchDrafts и замена ровно одного statement в существующем consumer. Прочие watch/outcome/prepare/parent функции побайтно сохраняются. Ни нового runtime-модуля, ни backend/reader/schema/scheduler/admission/sender нет.

## Поведение предложения

Ноль новых переходов — ноль новых сообщений. Один переход — прежний ключ watch:<transition_id>, прежний renderer, прежняя структура. Два перехода одной проверки — одно сообщение watch-group:<digest> с обеими полными исходными transition, их id и fingerprint фактической проверки. Порядок LONG→SHORT фиксирован, перестановка входных строк не меняет результат. Ключ связан с logical_event_id и уже вычисленным watch observation fingerprint; служебное форматирование ответа не становится отдельной проверкой.

Оба transition должны иметь исходный hash/id observer, правильный event/snapshot/source_ts/raw_sha256, разные LONG/SHORT направления, тот же закрытый интервал, processing clock и gap label. Несогласованные строки не объединяются и не обрезаются. Нынешний внешний catch откладывает watch; исходные записи остаются целиком. Это не новый валидатор provider/candle/epoch: группировщик принимает результат существующего observe внутри уже проверенного текущего consumer.

Сохраняется существующий draftNotice для фактов, часов, BACKFILLED, gap-предупреждения, отсутствия spot и запрета входа. В парном тексте заменяется только фраза об одном состоянии на две фактические фразы. Пример: «Сейчас подтверждён выход вверх; гипотеза движения вниз опровергнута по закрытой15m свече». Это новый НЕСОГЛАСОВАННЫЙ черновик отдельного блока; основная Telegram-форма не меняется. Нет SUCCESS/прибыльности/торгового разрешения.

Старые outbox entries, capture0, исходная card/first_known, обе гипотезы и16 ячеек плана остаются прежними. Уже записанные два черновика не переименовываются и не удаляются. Нынешние revisions32/outbox32/state65536/request131072/1600символов не повышаются. В будущем новом bundle две переходные записи помещаются в один DRAFT slot. Это не измеренная экономия байтов/SQL: старая и новая версия всё равно используют тот же domain commit/readback. Native расходы неизвестны.

## Одна будущая проверка ROOT

1. Проверить target-bindings.json; применить due-watch.proposed.patch только в отдельной интеграционной ветке. Автор общий target не менял. Полный proposed target сохранён для точной сверки.
2. Один раз вызвать runGroupedWatchDraftCases({repo_root}) из grouped-draft-cases.proposed.mjs. ONE callable, одна новая группа/18 задуманных controlled-вариантов, UNEXECUTED. Если центральная версия target уже отличается, ROOT сначала сохраняет точную производную привязку; frozen оригинал этого пакета не изменяется.
3. До исполнения helper проверяются полный after-target SHA, зависимости, прежний drafts statement, текущий lexical prelude и обе уникальные callsite-привязки. Извлекается только фактический новый приватный helper; используются настоящие публичные canonical/digest/hash/draftNotice в том же JS realm. Целиком private Worker/DUE/старые тесты не импортируются и не исполняются. Контролируемые transition заданы явно, это не новый market replay или full-DUE квалификация.
4. Проверка сравнивает действительный прежний drafts statement с новым helper для парного случая; отдельно проверяет ноль, обе single legacy формы, порядок, разные fingerprint,8 конфликтов связи, неверный id, более двух строк, gaps, обратную пару и неизменность входных объектов. Все выходы остаются DRAFT/NOT_APPROVED/actual_send=false. Файл миграции только читается для SHA: SQL не исполняется.
5. ROOT сохраняет фактический результат отдельно. До него PASS нет. Группировка не квалифицирует native atomicity/ACK/outbox durability/restart/retention/dispatch. Реальная отправка запрещена в этом пакете; native policyNULL и отдельный ACKUNKNOWN barrier сохраняются.
