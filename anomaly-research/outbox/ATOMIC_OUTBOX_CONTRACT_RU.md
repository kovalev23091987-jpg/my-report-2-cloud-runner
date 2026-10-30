# Controlled контракт атомарности и неопределённой доставки

`protocol.mjs` — конечная модель состояния для проверяемого контракта будущего адаптера. Это не DB-схема, сервер, транзакционная библиотека или Telegram sender. В каждом результате network_calls=0/native_writes=0; state содержит network_enabled=false/native_persistence_qualified=false.15новых controlled failure-boundary tests прошли, полный output — validation.txt. Старые принятые тесты не повторялись.

## Одна граница фиксации

Один логический commit сохраняет canonical card и её первый known-time, watch/переход, все ссылки исходного плана30d/90d и один DRAFT outbox для группы переходов одной исходной проверки. Так, LONGconfirmed и SHORTrefuted одного snapshot не создают два отдельных сообщения. Полный snapshot rawhash входит в fingerprint. Неизменное состояние на новом снимке не создаёт уведомление. Отмена гипотезы терминальна для этого episode; новое событие имеет другой логический ключ.

У commit есть expected_revision, operation_id и digest операции. Повтор принятой operation_id с тем же digest возвращает ALREADY_APPLIED даже при старой expected_revision. Другой digest под тем же id отвергается. Старая CASrevision не меняет ни один объект. Модель ограничивает journal/outbox и явно откладывает новую работу при заполнении; старые dedup receipts не удаляются молча. Размер4096/1024 относится только к модели, не является новым production cap.

Проверены две точки сбоя. BEFORE_COMMIT оставляет исходное состояние целиком. AFTER_COMMIT_BEFORE_REPLY сохраняет весь новый bundle и возвращает UNKNOWN_COMMIT_ACK; после сериализации/восстановления повтор той же операции находит старый результат и не создаёт вторую outbox. Это доказательство поведения чистой модели, не доказательство D1 atomicity, fsync или native readback. В реальном адаптере граница должна обеспечиваться настоящей транзакцией/условной записью и проверяться фактическим независимым readback; разделённые SQL без общей атомарности этому контракту не соответствуют.

## Жизненный цикл отдельного сообщения

Модель: DRAFT → READY → CLAIMED → SENDING → SENT либо FAILED_KNOWN_NO_SEND/UNKNOWN_SEND. READY требует exact form hash подготовленного сообщения; это controlledreview, не финальное согласование Telegram формы. CLAIMED содержит отдельные owner/nonce/lease; чужой или истёкший claim не разрешает START_SEND. До возможного внешнего вызова должен быть сохранён SENDING intent с устойчивым attempt nonce. Ни одного внешнего вызова этот код не выполняет.

Истёкший CLAIMED без сохранённого send intent возвращается в READY. Истёкший SENDING или timeout превращается в UNKNOWN_SEND: процесс мог упасть как до запроса, так и после приёма сообщения внешней стороной. Повтор не разрешается по одному истечению lease, отсутствию локального ACK или фразе «не найдено». Такой outbox остаётся защищённым от retention, а основной отчёт продолжает свой независимый путь.

Известный отказ без приёма сообщения допускает отдельную повторную попытку после указанного retry_after только при сохранённом точном no-acceptance proof. Native transport adapter должен доказать смысл этого proof; произвольный enum caller не является доказательством, что сообщения не было. Старый nonce не может обслужить новую попытку.

ACK привязывается к logicalevent/outbox key/attempt nonce/chat binding/message_id/reply hash. Просто api_ok=true недостаточно. Неопределённый результат разрешается только совпавшим доказательством точной доставки; без него UNKNOWN_SEND сохраняется. В тестах любой ACK имеет явный класс CONTROLLED_SIMULATED_ACK и actual_send=false, даже когда состояние модели называется SENT. Ни одно такое состояние не является фактическим Telegram SENT проекта.

Идемпотентность локального журнала не доказывает отсутствие сетевого дубля. При реальной интеграции нужны отдельная роль/активация, текущая форма/40минутный выпуск, фактическая связь exactepisode→message_id и процесс разрешения ambiguous sends. Не обнулять unknown и не пересоздавать outbox с новым id ради обхода неопределённости. Основное сообщение и встроенный LIQ остаются в прежнем виде.

## Что ещё нужно от координатора

Использовать stable logicalnative key/immutable canonicalcard и explicitnativeconfirmationgrid из PR462 перед этим протоколом. Сохранять полный исходный outcome plan; отсутствие его поздней ячейки не даёт права очистки. Между DRAFT и внешней сетью должны пройти реальные shared budget/day/month/minute/manual admission и native persistence/readback. Протокол пока не пишет реальную статистику исходов и не создаёт общую SQL-схему.

Для production потребуются: indexed due/outbox scan вместо fullstate clone; фактическая атомарность и CAS; integrity/authenticated ingest и native id/grid доказательства; source-clock/readback/native counters/unknown reconciliation; реальные retention graph guards; ограничение release40минут и проверенный single-message renderer. Реальный first-known и поздняя цена для CT/BR/APR/TIA пока отсутствуют, поэтому раннее обнаружение и predictive accuracy не заявлены.
