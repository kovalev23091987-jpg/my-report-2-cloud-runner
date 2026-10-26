# BV — connected catalog retention, одна локальная проверка

PASS_CONNECTED_CATALOG_RETENTION_ARTIFICIAL_OLD_FIXTURE. Один Node/один logical case;3 simulated broker requests,2 callback invocations,4 writer invocations. Engine/real source HTTP/native SQL/Telegram/build/deploy/старые BS и12 SOURCE cases:0.

Настоящий old71 getCatalog и новый F614 producer дали одинаковый catalog output и одинаковые request/cache параметры с ttl0. Новый callback передал исходный parsed body, receipt и received_ts в настоящий ROOT writer. Успех: ровно один SET ключа pump:catalog:last-observed:v1, один GET-readback writer и отдельный один PK GET private observer. Других ключей/history/cleanup нет.

Body/hash/UTF8 bytes/row count/receipt/clocks связаны; source_event_ts=null. Fixture — подлинный старый каталог1278 от25 октября15:37:50.932МСК, outerSHA7b683509fea9d5b3aa1d2612ddb8ad259680a3bc33cc4df5cc97f23b4555e9f5. Received clock не переносился. Saved clock является ARTIFICIAL fixture clock. Observer сохранил исходный received_age и вернул BOUND_CATALOG_NON_OBSERVED_NOT_NATIVE: native_source_response_bound=false, current_global_crypto_N_proven=false. Старый1278 не доказывает latest1294/249 или текущий global N.

Прямой writer вызов с receipt_id=null дал SKIPPED/CATALOG_INGRESS_UNBOUND без дополнительных store calls. Производная копия body с controlled padding ровно1950000UTF8 bytes (ниже2MiB) дала SKIPPED/CATALOG_RECORD_BYTE_BOUND до store IO; прежняя запись/часы не изменились. Record guard1900000, body2097152 и rows2000 остались точными константами. Полная матрица границ2000/2001 и2MiB не выполнялась.

В изолированной UNKNOWN-ветви mock SET мог сохранить значение, затем выбросил NATIVE_SQL_COST_ACK_UNKNOWN. Реальные writer→SOURCE callback пробросили тот же объект ошибки; unknown_ops=1 не сброшен. GET после неизвестного ACK, recovery HTTP, refund и подтверждение свежести не выполнялись. Interface counts не являются доказательством billed R/W или native admission.

Исполнены только final prepin v2 и harness9e7fee46e16e588be1f61e12882e07efcdfad2d969fc0e7eb58c42bb519cc738; frozen inputs4e2d5345a9945d799b68142fa4c5055fdd6174c3763dfc5bfc94b5fdc24331f8, ROOT prepin0886c36004f2e89832725370eb77e73c918f5a1f22cdb62ac0e145bee5b9375b, F61450043056ecb69267fcf2c922b7be401e525d4286f7fa664aa27dd22ae13287df. Старый prepin/harness сохранены как UNEXECUTED; повторов Node нет.

Это byte-extraction/prepin: нового build/live pin нет. Retained75 tag использовался только при evidence_class=ARTIFICIAL. Default worker/native environment и operator CLI не вызывались; worker/wrapper проверены только по frozen hashes/static wiring. Live71, actual ledgers/caps/unknowns/reserves/business cron,9пауз и2OWNERdeferrals не менялись. Новый native write/read cost и deployment требуют отдельной фактической admission ROOT. Raw fixture/output остаются в игнорируемых private файлах.

Result SHA256: 493e3a7ddc4693c0b36b9f826cffbe987b1a2ef1c68515eafc9654d1de32809e
