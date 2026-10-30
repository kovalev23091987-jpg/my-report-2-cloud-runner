# W: существующий auditCohortSample теперь потребляет V2

Production изменён только `analytics/cohort-audit.mjs`. Реальный существующий экспорт `auditCohortSample(records, options)` теперь имеет явный v2 маршрут. Вызов:

```js
const audit = await auditCohortSample(savedSummaryRows, {
  feature_schema_version: 'pump-feature-capsule-v2-20261025',
  as_of_ts,
  split_plan: {split_ts, declared_ts, plan_ref},
  resolve_evidence: async row => ({
    link, feature, outcome, saved_analysis, anchor_meta,
    // Только реальные сохранённые forecast/training artifacts, если есть:
    forecast, forecast_readback, training_manifest
  })
});
```

`resolve_evidence` — ROOT store reader, не provider fallback. В W qualification он реально вызывался публичным consumer, загружал искусственные wrappers и originals, проверка закончилась результатом аудита. В inspected main отдельного native runtime audit endpoint ещё нет: ROOT владеет этой маршрутизацией, store и admissions. Допустима передача того же evidence как `row.capsule_evidence` для уже гидратированных сохранённых файлов. Caller может всегда использовать await: исторический v1 по-прежнему возвращает объект синхронно. Без option v2 старые поля не повышаются до новой схемы; неизвестная версия отвергается.

## Точный формат существующего ROOT writer

`link` — прочитанная строка `pump:summary-capsule-link:v2:`+row.record_id.slice(-64), schema `pump-summary-capsule-link-v2-20261025`, с исходными summary_record_id/analysis_key/feature_key/feature_sha256/outcome_key/outcome_sha256/protected_refs{key,sha256}/originals_required=true/global_reference_closure=false. `feature` и `outcome` — реальные prepared wrappers `{key,sha256,capsule}` по этим ключам. `saved_analysis` — реальный сохранённый `{analysis,input,saved_ts,implementation_sha256,evidence_class}` по link.analysis_key. Старый unpinned original без actual implementation/evidence pin отвергается; подставлять текущий compiler SHA в прошлую запись нельзя.

Входные `savedSummaryRows` — исходные durable raw summary records с origin/publication/outcome/recorded_ts. SHA record_id сверяется с точным JSON `{origin,publication,outcome}` по действующему writer. Нельзя брать latest pump:outcome вместо исторического row.outcome: consumer сверяет его SHA с конкретной capsule revision. Outcome capsule использует точный persisted row.recorded_ts, summary_record_id и digest исходного feature. Feature capsule воспроизводится из оригинальных сохранённых analysis/input/saved_ts/implementation/evidence и должна совпасть целиком. Аналогично воспроизводится конкретная outcome/publication projection. Это W data consumer integrity, а не повтор V8.

`anchor_meta.origin_anchor` — фактический frozen anchor исходного journal/его нового ограниченного reader, а не anchor из latest. Нужны immutable=true, исходные analysis ID/hash/origin и selection. Для UNKNOWN `possible_send_ref` — реальная сохранённая ссылка. Для UNSENT `unsent_terminal` — реальный terminal со state, event_ts, evidence_ref и known_ts либо recorded_ts; selection FIRST_READY. Для публикации — FIRST_POSSIBLE_OR_CONFIRMED_SEND. Отсутствующее readback не заполнять выдуманной меткой. UNKNOWN может разрешиться поздним SENT того же исходного anchor; прежние записи и protected refs сохраняются.

## Что именно делает W

Явно проверяются V schema/envelope SHA/keys и link, original analysis/input/plan/outcome/publication hashes, code/evidence pin, immutable origin/P0/t0/rules/profile/mode/map, original known clocks/null reasons. V2 whitelist не содержит BTC/ETH сравнения. Неизвестные / future / unbound данные карантинируются. Изменение feature/code snapshot внутри одной instrument+wave блокирует всю волну. Конфликт HIT/MISS не разрешается выбором последней записи.

По каждой волне сохраняется первый valid persisted resolved label и его SHA/record ID/recorded_ts, numeric DD/scenario. Поздний полный DD/coverage не переписывает первый известный label. Все updates этой волны остаются в одной временной группе. До исходного4ч deadline — PENDING; без разрешённого label — UNKNOWN. Пересечение horizon с split и label, записанный после split, получают отдельные PURGED partitions. Holdout начинается с origin>=split. Plan declared_ts должен быть<=split<=asof и иметь настоящий plan_ref.

Структурно пригодные feature/label данные не означают fitted model. Без original precommittedforecast/model/trainingmanifest — NO_PRECOMMITTED_FORECAST/NOT_CALIBRATED. При supplied forecast отдельно проверяются readback/training digest, created/cutoff/label clocks и cohort; даже правильная декларация не означает выполненную calibration. Во всех результатах probability/successrate/benefit null, feature_usefulness_proven=false, publication_allowed=false. Не выводить полезность из числа доступных признаков.

## Границы и расходы

Максимум2048 входных records / 2000000B исходного массива. Для async resolver дополнительно максимум2000000B суммарно возвращённого evidence за вызов; overflow бросает AUDIT_EVIDENCE_BOUND_EXCEEDED без частичной сводки. Это лимит памяти/объёма анализа, не SQL/native admission или доказательство стоимости. ROOT должен заранее допустить реальные reads: link+2capsules+savedoriginal+anchor и нужные publication refs, без provider requests. Пагинация сырых originals, admission/cost ledger и возврат честной ошибки остаются у ROOT. Не заявлять, что40records автоматически вписываются в D1 envelope.

Protected original refs возвращаются в каждой волне. Сроки/GC/архивreader не разрешены: retention.delete_allowed=false, TTL=null, originals_required=true, global_reference_closure=false. V writer и W audit не снимают S refs/9пауз/2OWNERdeferrals. Старые v1 metadata/body/paired analysis path сохранены побайтно, один новый синхронный sentinel совпал; старые батареи не выполнялись.

Первый W запуск:8PASS. После выявленного отсутствующего bound на async hydrated evidence добавлена только эта защита и новый W09:1PASS в отдельном focused запуске, остальные8 не повторялись. Всего9 уникальных новых cases,0FAIL,0SKIP,2 запуска. Это не native calibration или production acceptance. Frozen V8/T4/S и исходные240 не менялись; новые HTTP/SQL/TG/deploy/cron0.
