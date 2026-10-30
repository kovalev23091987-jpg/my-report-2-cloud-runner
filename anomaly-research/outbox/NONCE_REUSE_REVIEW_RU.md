# Повтор nonce и запоздалый ACK: конкретное исправление модели

Координатор указал расхождение frozenPR464 с собственным контрактом: CLAIM принимал FAILED_KNOWN_NO_SEND и просто записывал m.nonce, не проверяя использованные значения. Новый пакет не меняет frozenheadcb824178 и не включает production/send/native.

Риск воспроизведён на самой frozenфункции: попыткаA с REUSED_N → known-not-accepted → новыйclaim тем же owner/nonce → START_SEND → старый simulatedACKA принят как ACKB. Состояние модели стало SENT/message101. Это CONTROLLED_MODEL_ONLY/actual_send=false, не реальная доставка. ExactsourceSHA733cd616311b6cbed6e51f2bc7d308886b6493df9e5134f7a2c007983411670b и результат — nonce-before.json.

Исправление добавляет ограниченный attempt_nonce_journal ко всему modelstore. CLAIM отвергает любой ранее использованный nonce независимо от owner/outbox и от того, был ли начат transport. Успешныйclaim и запись потреблённого nonce находятся в одной моделируемой CASгранице. Known rejection, истечение незапущенного claim, recovery и SENT не удаляют старые nonce. Retry принятой operation_id по-прежнему идемпотентен и не расходует вторую запись. Новая попытка должна использовать новый nonce; старый ACK тогда не проходит exactAck по attempt_nonce.

Предел4096nonce относится к исследовательской модели. При заполнении возвращается DEFERRED_ATTEMPT_NONCE_CAPACITY без изменения claim/event/outbox/pending90d и без удаления deduphistory. Это не повышение project caps и не native storage allowance. В production нужно измерить стоимость/хранение защищённого attemptjournal, обеспечивать атомарность и связывать его retention с разрешением всех ambiguous attempts. Слепая очистка истории в этой модели не реализована.

Шесть новых targeted controls прошли: lateACK после reuse; два исторических nonce/смена owner/restart; expired unsentclaim; capacity; beforecommit/lostACK/retry CASграница; восстановленный legacy snapshot без noncehistory. Последний не получает выдуманный пустой журнал: CLAIM отказывается ATTEMPT_NONCE_HISTORY_REQUIRED. Принятые15protocoltests не повторены, их неизменённые части переиспользуются по frozenhead.

restoreProtocol по-прежнему принимает только trusted-model snapshots: checksum помогает заметить случайное изменение байтов, но не доказывает полноту schema, подлинность источника, полноту исторического noncejournal или native durability. Явный комментарий и targeted legacycase фиксируют эту границу; общий framework/новая DBschema не создавались. Новых providerHTTP/productionSQL/MAIN/Telegram/deploy0.
