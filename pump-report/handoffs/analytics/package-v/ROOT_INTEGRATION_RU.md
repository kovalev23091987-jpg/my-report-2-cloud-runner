# V: подключение ROOT к действующему writer

Готовая реализация: `analytics/feature-capsule.mjs`. Она не импортирует runtime и не пишет в store; SOURCE/общие contracts не менялись. Восемь новых V-проверок приняты одним запуском. Старые T4/S/P/Q/R/E не повторять.

## Исходный feature sidecar

В точке ROOT `rememberAnalysis` после durable `pump:analysis:<sha>` читать именно сохранённый `{analysis,input,saved_ts}` по исходному ключу. Проверить его analysis hash. Не подставлять latest-анализ/текущий input. `prepareFeatureCapsule({analysis:saved.analysis,input:saved.input,analysis_key,implementation_sha256,recorded_ts:saved.saved_ts,evidence_class})` возвращает `{key,sha256,capsule}`. `implementation_sha256` должен ссылаться на реально pinned build/module manifest, а evidence_class — на реальный run admission; константа a*64 и ARTIFICIAL в примере только тестовые. Digest не аутентифицирует внешний источник сам по себе.

Предлагаемый явный namespace `pump:feature-capsule:v2:<analysis_sha>` нужно принять ROOT в своих runtime/storage ключах. Atomic put-if-absent; при существующей строке полный exact readback/проверка её SHA и совпадения исходных input/analysis/implementation/feature версии. Никакого overwrite. Если одна analysis SHA связалась с иным input SHA, это конфликт исходных байтов, а не повод обновить признаки. Для idempotent retry брать persisted saved_ts, не новый clock(). Сохранять исходный analysis/input до доказанной reference closure и verified archive reader. Sidecar сам не заменяет originals.

`readFeatureCapsule({capsule,sha256})` — готовый явный v2 читатель скаляров, плана и trade sample provenance с SHA/clock/whitelist проверками. Старый `cohort-audit.mjs` принимает только pump-initial-features-v1 и намеренно не изменён. Не подавать новый sidecar в старый audit как v1 и не заявлять calibration/probability. Для нового model/audit consumer нужен явный v2 маршрут ROOT; source/body authentication остаётся отдельной задачей.

## Outcome revisions

После freeze исходного anchor выбирать feature sidecar именно `selected.anchor.analysis_id`, а не latest. `prepareOutcomeCapsule({feature_capsule,feature_sha256,outcome,publication,recorded_ts,summary_record_id})` возвращает отдельную content-addressed revision `pump:outcome-capsule:v2:<digest>`. `recorded_ts` — persisted timestamp конкретного outcome/publication revision; повтор не меняет его. Отсутствие outcome даёт UNKNOWN/null, HIT/MISS проверяются на исходный P0/t0/+10%/4ч и наличие доказательства. Текущий numeric DD, coverage, scenario и5 скаляров entry-area lower bound сохраняются; это не исполнение и не прибыль пользователя.

Publication сохраняется отдельной revision. Поздний SENT не переписывает исходные features или прежний UNKNOWN. Формальный SENT без positive message_id/receipt_ref становится UNKNOWN в проекции; оригинал publication SHA остаётся. Подтверждение same-run Telegram требует реального readback ROOT, не этого модуля.

## Protected references

`await projectProtectedReferences({analysis_key,analysis,input,card,journal,signal,summary_head,ordered_items,members,summary_records,external_audit_refs,owner_original_refs})` читает только переданные сохранённые строки одной ограниченной порции. Обязателен точный analysis hash. Результат — конкретные protected edges и причины; это не global inventory/GC admission. Список external audit/model refs должен предоставляться реальным resolver/registry ROOT; его отсутствие не означает отсутствия ссылок. Acceptance240 добавить точными сохранёнными refs через owner_original_refs; искусственные имена теста не являются ими.

Реальные переходы: card.source_input_key→analysis; journal.analyses/frozen_anchor→analysis; publication→card/receipt; signal→analysis/outcome; summary head.pending/ordered/member→raw record; record→signal/receipt; original fact/basis/evidence refs. UNKNOWN/possible-send и pending allocation остаются защищены после4ч/EXPIRED/HIT/advancing cursor. Bounds:64 journal/publication/item rows,256edges,65536B. При overflow/invalid input ошибка — ROOT обязан остановить cleanup, не усечь inventory. `delete_allowed=false`, TTL=null, archive_reader_verified=false всегда. Sidecars сами также требуют явного reverse-reference registry ROOT.

Сохраняются S матрица35групп/28описаний/19edges и T delta, оригиналы240,9пауз,2OWNERdeferrals. Никакого TTL/physical capacity/ENTRY work/admission/GC в V нет. Work-index migration выполняется ROOT независимо; V не менял shared runtime/store/queues/schema. Native/source HTTP, SQL, TG, deploy, cron0.
