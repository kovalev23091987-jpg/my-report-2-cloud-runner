# Предложение: сохранять исходные флаги допуска факта

В новом оригинале39161429947 четыре публичные метрики Gate для BTW-USDT отклонены как `FACT_OR_IDENTITY_NOT_VERIFIED`. Компактный audit не сохранил поля, из которых получена эта объединённая причина. Поэтому в PR495 точный исходный дефект поля и первый lifecycle refusal оставлены UNKNOWN. Отдельные полезные N12 spot trades Gate не подставляются вместо этих метрик.

Это конкретный пробел наблюдаемости нового оригинала. Он не доказывает ошибку поставщика, identity mismatch, свежий второй primary source или сбой Telegram. Предложение не подключает источник и не ослабляет gate.

## Точная предлагаемая правка

В существующий receipt объекта `auditObservationSourceRoles` добавляется только `retained_fact_proof` с семью исходными полями:

- `decision_usable`: строго boolean, иначе NULL;
- `fact_contract_status`, `identity_status`, `identity_object_status`: строго CLOSED/NOT_CLOSED, иначе NULL;
- `source_compatible`: строго boolean, иначе NULL;
- `freshness_status`: один из пяти уже существующих результатов normalizer, иначе NULL;
- `normalization_status`: EXPLICIT_NORMALIZED_VALUE/LEGACY_VALUE_PASSTHROUGH, иначе NULL.

Они берутся из тех же исходных classified receipts, которые уже перечитывает существующий consumer. Строки, числа и truthy значения не превращаются в подтверждение. Не экспортируются новые числа метрик, raw body, provider messages, identity адреса, секреты или произвольные строки. Не создаётся новая причина отказа: `exclusion_reason`, assigned roles, origins, values, clocks, usable/status и gate остаются прежними.

Новая вложенная запись означает только наличие исходных полей. Она **не означает**, что проверка каждого поля исполнялась: ранний `SOURCE_NOT_CLOSED` по-прежнему останавливает consumer до проверки identity. Также `decision_usable=false` может быть результатом normalizer freshness; controlled case со STALE сохраняет прежний первый `FACT_OR_IDENTITY_NOT_VERIFIED` и оба исходных поля. По старому компактному оригиналу это различие не восстановить.

Существующий предел64 receipt details и omitted count не меняются. Максимальное добавление при всех64 экспортированных receipts —17536байт несжатого JSON: фиксированные7ключей и конечные множества допустимых значений. Это ограничение размера предложенных полей, не native cost/CPU/daybound и не разрешение расхода.

## Почему не нужны новые чтения

На exact base `a9d13e8dd5e7ed69953e3ed38af26596826affd9` `loadCanonicalRunOutput` уже получает canonical_json в существующем SELECT и вызывает `auditObservationSourceRoles(canonical)` при построении run artifact. Предложение использует этот же объект. Нового DB/provider чтения, cache write, reservation, lifecycle transition или вызова Telegram в правке нет. Общие runner, consumer, registry, gate и canonical persistence не изменены. Фактическое внедрение и общую проверку выполняет координатор отдельно.

## Проверка без подмены native фактов

`checks.mjs` загружает exact Git blobs pinned base через data URI, без сборки runtime/ключей/провайдеров. Четырнадцать новых controlled cases проверяют различимые отказы четырёх proof полей, отсутствие и неправильные типы, отказ без утечки произвольной строки, STALE при false usability, отдельную source incompatibility, ранний source refusal и предел70→64.

Для каждого случая удаление только нового поля даёт тот же прежний audit целиком; входной canonical не изменён. Сохраняются0HTTP/0D1/decisions_changedfalse. Это новые проверки metadata projection, а не повтор принятого source-role suite и не replay original391614. Все controlled данные помечены `CONTROLLED_NOT_NATIVE`; исходные флаги реального BTW по-прежнему NULL/UNKNOWN.

Команды:

```text
python3 checkpoints/source-worker-role-audit-witness-20261018/build-proposal.py
node checkpoints/source-worker-role-audit-witness-20261018/checks.mjs --check
```

Предложенный общий файл находится только в этом checkpoint prefix: `observation-source-role-audit.proposed.mjs`. Его imports сохраняют production путь; самостоятельное исполнение делает checks через pinned modules. `coordinator-proposal.diff` — точная предлагаемая правка общего файла. **Сам общий файл не менялся**; перед применением координатор сверяет baseline SHA `e197a38c8866b3f8c3b59b688797cd9477240452c37353467f4cfbeeea529e29`, затем проводит одну общую проверку новых изменений по своему допуску. Свои старые suites исполнитель не запускал.

## Допуск и оставшееся

Собственная ветка `work/report2-sources-role-audit-witness-20261018`, prefix `checkpoints/source-worker-role-audit-witness-20261018/**`. CAS `f1b33f519def2dab1be173654011acb64e9fa26b`, owner `CODEX:SOURCES:01a14e11:1792355758725`,80минут, exact readback на свежем maina9d13e8 и fencefalse. AGENTS/status.active_working_state/resume/3proofs прочитаны. PR495 заморожен; N04/N11/shared и третий0SQL receipts/493 не затронуты.

Нет providerHTTP/WS/nativeSQL/deploy/MAIN/Telegram. Стратегия, веса, формы,105/122/9пауз,70, caps, unknown и потраченные резервы прежние. Два разных qualified первоисточника и фактическая same-run доставка остаются открытыми. Даже после будущего внедрения новый audit не восстановит исчезнувшие поля прошлых архивов и не выдаст дополнительный admission.
