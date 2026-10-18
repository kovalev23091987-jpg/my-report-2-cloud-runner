# N12: фактическое использование компонент и учёт источников

Read-only аудит на `03fafed3ef85e2e58f141b0fe6070fe3579a4490`. Это предложение координатору для подтверждённого разрыва; shared runtime не изменён, runtime tests не выполнялись. Форма исходных строк и отображение часов — отдельная задача второго исполнителя. Ниже не восстановлены отсутствующие provider bodies.

## Вывод

Одних additive component-origin receipts в `block-result-context.mjs` недостаточно. Есть две независимые точки потери: связь individual component с реально напечатанной строкой и ограничение `source_accounting` списком source checks, где для N12 сейчас только `HTX_LARGE_TRADES`.

Для точных APR/NEAR не требуется автоматически расширять `reviewBoundedMoneyFlow` на внешние источники или менять смысл `actuallyUsedIds`: сохранено по два нейтральных assessment receipts, поэтому проверенное component-aware `isRendered` позволит внешней строке пройти существующую ветку `assessedUseful && isRendered`. Это потребует проверки координатором на полном canonical/контролируемом входе: текущая projection не содержит самого массива evidence и score receipts. Отображение без assessment, настоящего score receipt или проверенного diagnostic review остаётся отображением, а не доказанным решающим вкладом. Если координатор добавляет отдельное информационное использование, оно должно иметь отдельное поле/status; нельзя называть его существующим UNSCORED_DIAGNOSTIC или задним числом создавать neutral/review receipts.

`source_role_publication_audit` — отдельная проверка имеющихся inherited metric receipts для OBSERVE. Она не является счётчиком фактически напечатанных N12-компонент. Подмешивать туда component origins нельзя: это изменит действующий публикационный gate.

## Точное сохранённое наблюдение

Источник: natural run `39133840839`, head `998020c564e0ff1d81046150df00d9ca2b1aedfe`, run_id `1792331883613-1792331891442`, artifact `12138787149`, SHA256 zip `91e315ecaf015fff224cfa828caf79b6c39e921e20d0695a3ef40ad4fb1d66cc`. Локальные оригиналы уже сохранены координатором; хеш report2-run-result и выбранные поля — в `saved-accounting-extract.json`.

| Факт | APR | NEAR |
|---|---|---|
| Внешняя напечатанная N12-компонента | Bitget spot, evidence `a839…b909` | OKX spot, evidence `7a41…11dd` |
| N12 observed / valid / assessed | 2 / 2 / 2 | 2 / 2 / 2 |
| N12 score application | 0, оба actual contribution 0 | 0, оба actual contribution 0 |
| N12 source checks | только HTX_LARGE_TRADES | только HTX_LARGE_TRADES |
| used / rendered providers | только HTX_SPOT_FUTURES_TRADES | только HTX_SPOT_FUTURES_TRADES |
| merged manual IDs / roots | 3 IDs / 1 HTX root | 3 IDs / 1 HTX root |
| N12 Telegram context receipts | 0 | 0 |
| Telegram payload status | APPROVED_PAYLOAD_TEXT_OBSERVED | APPROVED_PAYLOAD_NOT_CONFIRMED |
| Shared HTTP total = N05 + N12 | 5 = 5 + 0 | 5 = 3 + 2 |

Внешние IDs есть также в N12 impact rows со статусом VALID. Полные external provider/upstream/root/source/knowledge clocks из этого нельзя восстановить: projection намеренно не сохраняет canonical.metadata.internal_market_context.evidence_v2.evidence. Имя площадки в тексте не подменяет исходную строку. Три IDs включают отдельный N05 4h-факт; он не превращается в дополнительный N12-fact.

В обеих монетах `source_role_publication_audit` уже CLOSED с Gate/HTX/OKX. Это другие metric-role receipts, не доказательство N12 Bitget/OKX использования. APR OBSERVE SENT216 из другой exact delivery цепочки не означает, что именно N12 строка попала в Telegram. В сохранённых Telegram context receipts N12 отсутствует.

## Checklist существующего пути

Номера строк и SHA256 исходников зафиксированы в `source-manifest.json`; они относятся только к указанному audit head.

1. `consumeBlockResultContext`, block-result-context:370–420. Собирать component-origin записи из тех **конкретных исходных строк**, которые прошли exact contract, `validateEvidenceV2`, свой N12 validator, исходные часы и реально добавили фрагмент к итоговому `fact.value`. `related` служит связью, не самостоятельной авторизацией. Не сканировать затем все related IDs и не дописывать произвольную найденную строку. Primary, external recent N12 и N05 4h имеют разные роли/окна; не наследовать часы/root primary. Отсутствующие поля оставлять неизвестными, а не брать из текста/родительской компоненты.

2. `confirmedBlockContextFacts`:441–449. Повторно получать факт из exact canonical evidence на исходном observed_ts и проверять stored primary ID/root/label/value. Новый component receipt должен принадлежать этому заново полученному факту; исторические supporting_context receipts не считать доверенным самостоятельным доказательством. Старый сохранённый факт без additive полей может получить метаданные только из реально имеющегося полного raw canonical, не из projection и не через refresh timestamps.

3. `auditRenderedBlockResults`:454–462. Сохранить проверку конечной строки manual и отдельно Telegram после plain/omit преобразований и bounded output limit. Прикреплять компоненты к квитанции только после этой проверки. У каждой поверхности свой набор реально отображённых компонент: в частности короткий Telegram plain fragment может использовать подмножество данных merged manual строки. Нельзя копировать весь manual component список в Telegram, если конкретный fragment туда не вошёл. Оставить `telegram_delivery_proven:false`, `message_id:null`; payload receipt не является network ACK.

4. `usedContext` / `isRendered`, block-decision-use-audit:56–58. Общее membership `receipt.evidence_ids.includes(id)` небезопасно. Сопоставлять revalidated component receipt с exact current row: evidence ID, originating block, contract и реальные provider/root/clocks, причём receipt обязан быть дочерним элементом подтверждённой напечатанной строки. Существующий fallback для primary и полного `immutable_evidence_ids` не расширять на случайный subset. Учесть два исходных времени аудита: render использует canonical.observed_ts, decision use — context.decision_ts; не обновлять их до now. Related N05 нельзя считать внешней N12 строкой только по parent block.

5. `actuallyUsedIds`:59–60. Сохранить `valid && meaningful` и нынешние независимые основания: exact nonzero score receipt, verified diagnostic review или exact neutral/useful assessment вместе с isRendered. В actual APR/NEAR assessed2/score0, значит нужен точный mapping, а не новый score. Не менять nonzero counts, participation status по другим блокам, BASE_SCORE_MISSING, consumer назначение или формировать review задним числом из печатного текста. Printed valid but unassessed факт может добавить rendered provider, но не должен автоматически пройти decision-use predicate.

6. `sourceDetails` bound:62–69 и `auditCandidateBlocks`:271–290. N12 сейчас `all:['HTX_LARGE_TRADES'], supplemental:[]` (candidate-evidence-v2-runtime:160). Внешние N12 rows приходят через уже имеющийся `EXTERNAL_N05_FLOW.evidence` (external-n05-flow-collector:88–91), но этот owner отсутствует в N12 source checks. Поэтому даже correct actuallyUsedIds исчезнут при `bound = valid ∩ check.valid_evidence_ids`. Узкое предложение — отразить **уже собранный** EXTERNAL_N05_FLOW как supplemental accounting owner N12, не меняя all/any, route planner, fresh admission или HTTP. В source check оставить только same-block rows, реально принадлежащие source.evidence и финальному canonical evidence. Другой вариант координатора допустим лишь с теми же raw membership гарантиями. Один aggregate owner может содержать несколько providers; не выдавать один owner за одну биржу или каждый component за новый вызов. Legacy alias применять только при реальном наличии и с защитой от дубля.

7. `summarizeAssignedSourceUse`:11–27. Использовать unique provider/upstream/root sets. `used_provider_ids` и `rendered_provider_ids` считаются раздельно; нельзя расширять nonzero_provider_ids от новых origin receipts. Provider count не становится числом независимых голосов. Если внешняя строка valid, но ей не найден captured route owner, явно оставить gap; не приписывать её HTX и не синтезировать successful transport.

8. `attributeSharedN05N12Http`:320–327 и audit passthrough:76. Не суммировать N05 и N12 `details.EXTERNAL_N05_FLOW.actual_http`: это один transport envelope. Сохранить оригинальную общую стоимость и adapter allocation: actual APR5=5+0, NEAR5=3+2. Нулевой incremental N12 HTTP совместим с полезным N12 reuse. Отсутствующий adapter detail/invalid number остаётся UNRECONCILED; root count и printed providers не восстанавливают HTTP. Не делать новых network/SQL вызовов для заполнения audit полей.

9. `auditObservationSourceRoles`, observation-source-role-audit:5–15, source-role-consumer:41–96, observation-source-role-gate:3–10. Не менять для этого N12 provenance fix. Там собственная схема identity/metric/units/coverage/SLA/origin и reclassification в исходное время; N12 origin descriptor ей не соответствует. Сохранить exact output, source roles и результат earlySourceRolesClosed. Расхождение used N12 providers и verified OBSERVE origins само по себе допустимо и должно оставаться объяснимым разными назначениями.

10. `runner-main`:232–245. Он вычисляет block_decision_use из полного canonical, но в выход отдаёт только compact canonical. Сохранить эту границу: новые compact receipts должны нести достаточно проверенной provenance для аудита, но старый compact output не становится полным input для повторного runtime-аудита. Block decision-use сейчас принимает только manual; Telegram proof отдельно в block_rendered_results. Не подменять один другим.

## Проверки, предложенные координатору

См. `proposed-cases.json`. Это новые точечные proposals для конкретного исправления, **не выполненные тесты** и не требование повторять принятые suites. Положительные controlled cases нельзя называть исходными APR/NEAR raw replay. Их значения/схемы брать из принятого source-worker mapping; actual missing поля не додумывать. Сначала устранить найденные две потери, затем одна общая проверка затронутого output/accounting пути у координатора.

Приёмка пакета не доказывает новые provider facts, устойчивый бюджет, прогностическую полезность, production activation или доставку. Основная стратегия, форма, лимиты и паузы сохранены.

## Ответ о supplemental и сборе

В tracked current-generation overlay найдено единственное runtime чтение `BLOCK_SOURCE_REQUIREMENTS`: `auditCandidateBlocks` на строке282. Оно формирует owners/source_statuses/source_checks; `proofForRequirement` (252) и `proofForFreshRequirement` (263) используют лишь all/any. `supplemental` не становится обязательным источником. `planCandidateEvidenceRoutes` (338), `collectEvidenceRouteBlock` (201) и `collectCandidateEvidenceV2` (349) строят/исполняют отдельные routes и не читают эту таблицу. Остальные найденные ссылки — tests и исторические audit scripts, которые выводят assignments. Значит добавление **только** `EXTERNAL_N05_FLOW` в N12 supplemental при неизменных all/any/planner/collectors не создаёт дополнительного collection/HTTP в этом коде. Это статический вывод о конкретном overlay, не новая native квалификация. Добавленный network_calls5 — второе представление прежнего envelope, не пять новых запросов.
