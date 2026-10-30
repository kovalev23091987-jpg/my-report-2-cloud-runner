# Независимая проверка PR499: исходные поля source-role receipt

**После исправления подписи размера оставшихся blocker не найдено.** Проверен код **6f57993bef3f8dd31c251f21d3b41dacd9c7c6f6**, base **20cd5e3ff05c4c2a8b906b61611996836ae1ed4b**, затем окончательный head **f705faa941239c2bfe960b7e8ab0d7347b443aaa**. В окончательном head изменён только `checkpoints/source-role-proof-witness-20261018/scope.json`: переименован один ключ и перенесён в конец объекта. Значения остальных полей сохранены. Runtime, test, workflow и baseline fixture побайтно равны проверенному CI head.

Это чтение точных Git objects, producer/consumer и уже сохранённого CI artifact. Собственных запусков тестов, runtime assembly, provider/native SQL, deploy, MAIN, Telegram или CI dispatch — **0**. Ветка координатора и frozen PR498 не изменялись. Подробные хеши, provenance и CI receipts находятся в `review-evidence.json`.

Production audit равен предложению PR497/head5562b34a063cb0235e3551d3f9b7d92650cc560a: SHA-256 **4eeeea2465a62f71bca34d70d0ac08a1e9eca49a628e57b7a337b3c5446cf776**. Baseline fixture — точная копия audit с base, SHA-256 **e197a38c8866b3f8c3b59b688797cd9477240452c37353467f4cfbeeea529e29**. После удаления только нового helper и `retained_fact_proof` старый исходный текст audit совпадает побайтно. Поэтому новая запись не меняет существующий расчёт reasons, usable, origins, clocks, values, counts, status или detail cap64.

Поля действительно доступны на существующем пути:

1. `inherited-fact-contract.mjs`, 95–138, нормализует CEX факт и выдаёт strict boolean/enum поля. `buildInheritedCexIdentity` выдаёт nested `identity.status` и `identity_status` CLOSED/NOT_CLOSED.
2. `canonical-runtime-adapter.mjs`, 157–163 и429–440, использует `normalizeInheritedFactEnvelope` для public evidence и execution-role facts, затем `buildRoleEvidenceView`. Полный view сохраняется в metadata.source_role_view. Синтетический HTX_EXECUTION_SNAPSHOT без этих доказательств не становится квалифицированным благодаря новой диагностике; отсутствующие значения будут null.
3. `source-role-consumer.mjs`, 59–78, возвращает `{...receipt,...classification}`. Он сохраняет эти поля, не нормализует их заново. Повторный audit использует тот же contract и **исходный c.observed_ts**, а не текущее время.
4. `canonical-publication.mjs`, 245–253, уже сохраняет весь JSON.stringify(canonical) и сверяет readback; `runner-main.mjs`, 224–244, уже читает canonical_json и вызывает audit. Новых чтений или изменений записи canonical для семи полей не требуется.

| Поле в retained_fact_proof | Допустимый тип/значения | Что оно доказывает |
|---|---|---|
| decision_usable | boolean либо null | Сохранённый результат normalizer; false не заменяется на unknown, unknown не становится false/true. |
| fact_contract_status | CLOSED / NOT_CLOSED / null | Состояние нормализованного fact contract. |
| identity_status | CLOSED / NOT_CLOSED / null | Верхнее сохранённое состояние identity. |
| identity_object_status | CLOSED / NOT_CLOSED / null | Именно nested identity.status, который также проверяет consumer. |
| source_compatible | boolean либо null | Сохранённое нормализованное поле совместимости. |
| freshness_status | CURRENT_AT_OBSERVATION / STALE / FUTURE_SOURCE_TIME / NOT_CLOSED / OBSERVED_NO_SLA / null | Один из пяти результатов прежнего normalizer, без нового вычисления часов. |
| normalization_status | EXPLICIT_NORMALIZED_VALUE / LEGACY_VALUE_PASSTHROUGH / null | Прежняя ветвь нормализации значения. |

Оговорка о смысле нужна при использовании результата: это **поля сохранённого нормализованного receipt**, а не восстановленные raw-флаги API поставщика. Например, прежний normalizer ставит `source_compatible:row.source_compatible!==false` и вычисляет decision_usable с учётом freshness. Их наличие не доказывает отдельный явный provider flag. Ранний SOURCE_NOT_CLOSED по-прежнему завершает consumer раньше проверки identity; новая запись не означает, что каждая проверка была выполнена. CURRENT_AT_OBSERVATION также не заменяет отдельный source-clock/SLA guard при исходном времени решения. Это ограничения интерпретации, не новые отказы или изменение gate.

Nullable contract выполнен строго: строки `"true"`,0, объекты и неизвестные enum не приводятся к truthy значениям; они дают null. Объект содержит только два boolean/null и конечные enum/null. Не добавлены raw_value, provider error/body, URL, ключи, полная identity или binding/address. Имеющийся controlled secret case в сохранённом CI проверяет отсутствие экспорта произвольной строки. Новые имена и значения полей не выводятся в manual/Telegram.

Границы решения сохранены: source-role gate, consumer, registry, normalizer, canonical adapter/persistence, runner, generation, formatter и unified budget равны base побайтно (12 явно захешированных защищённых файлов). Новое поле формируется при создании внутреннего run audit **после существующего чтения**; оно не передаётся как новый допуск, не добавляет источник, числовой вклад или независимый origin. Верхние часы и исходные event_ts/received_ts/max_age_sec не изменены. Оригинал39161429947 не перечитывался и не дообогащался: его конкретный потерянный Gate-флаг/первая lifecycle причина остаются UNKNOWN.

CI действительно подключён к собранному runtime:

- `current-generation/apply-runtime-overlay.mjs`,73/158, уже копирует audit, consumer и normalizer в runtime; overlay не изменён.
- Workflow добавляет только точную новую ветку, три относящихся к пакету path trigger и новый test в существующий command. Если удалить эти точные дополнения, остальной workflow равен base побайтно: owner/fence/authority guards не ослаблены.
- Test использует `REPORT2_TEST_RUNTIME=$PWD/runtime`; оба audit импортируют один и тот же consumer из собранного runtime. Исторический audit привязан к полному fixture hash. В каждом из14 случаев удаляется **только** retained_fact_proof, затем deepEqual сравнивает полную старую проекцию и проверяет отсутствие изменения input.

Прочитан существующий [CI39165052886](https://github.com/kovalev23091987-jpg/my-report-2-cloud-runner/actions/runs/39165052886), attempt1, head6f579…, success. Artifact **12150735042**, SHA-256 **2294bf3b587ff0aba70722afa964946a8f555e866faae5ef9d8ee40705097cd8** совпал с точными загруженными ZIP bytes. Во всех21 файлах с расширением `.tap` фактический reporter — **Node SPEC**, не TAP. Сумма заявленных summaries: **2084 tests /2084 pass /0 fail**. В `active-source-headroom.tap`:403/403/0, среди них найдены все14 новых named cases. Их точный текст извлечён в `CI-witness-cases.txt`; полный исходный файл и архив однозначно связаны хешами в evidence. Ничего не выполнялось повторно.

Единственное замечание при первичном чтении было о единицах `scope.json:17`. 17536 =64×274 — максимум **compact JSON** добавляемых полей. Существующий runner-main:1141 пишет JSON.stringify(output,null,2). Инертная локальная сериализация literal-объектов на том же nesting candidates[].source_role_publication_audit.receipts[] даёт26432 дополнительных байта при64 receipts. Это отдельный representative расчёт, не native/wire/whole-artifact bound. Координатор исправил ключ на `max_metadata_added_compact_JSON_bytes_64_receipts:17536` в finalf705…. Замечание закрыто. Повторная CI из-за этого metadata-only изменения не требуется; байты четырёх исполняемых/проверочных файлов сохранены.

Приёмка здесь ограничена безопасностью и подключением **диагностической проекции**. Новый factual source, восстановление прежних потерянных флагов, изменение причин отказа, фактическое postmerge наблюдение полей, live source-role admission и доставка не квалифицированы этим review. Внедрение и общий статус остаются у координатора.
