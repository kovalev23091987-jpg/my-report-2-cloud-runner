# Проверка GitHub-квалификации и границы принятого результата

Дата: 19.10.2026. Исполнитель: `01a14f2c-d037-7472-8f8f-76753a3a3bba`. Это один связанный offline-пакет для координатора. Production-код не изменён, тесты и приложения исполнителем не запускались. Исходные ZIP сохранены без перепаковки; точные SHA, размеры, Git-объекты и происхождение — в `review-evidence.json`.

## Вывод

В коде отдельного режима `FULL_PREPARED_RAW_BOUND_TO_NATIVE_GIT_BLOB_IDENTITY` не найдено препятствий для изолированной проверки при выполнении его guards. Это заключение относится к frozen `680865f9d6631d7ad0aba0604fcecc56784ee146` и точному обновлению basis `35ea3cf42bdb0c024c3b1f6516050cfee177742d`. Runtime, тест и workflow у этих двух heads побайтово одинаковы; в scope изменились только expected main, owner, lease base и expiry.

Фактический второй запуск имеет **LIMITED** результат. Он подтвердил положительную изолированную запись установленным `GITHUB_TOKEN`, но завершился `NOT_CLOSED / STALE_CAS_REASON_UNQUALIFIED`. Причина отказа отрицательного запроса осталась неизвестной. Последующее чтение координатора связывает четыре копии с полными исходными Git-объектами, однако выполнено другой учётной записью. Оно не превращает результат в полную восьмивызовную квалификацию установленного токена.

Production acquire/cursor/release остаются незавершёнными. Обнаружен ещё один действующий писатель phase — compact 4h — с фактическим захватом чужой истёкшей аренды и расхождением root lease, latest lease и четырёх одинаковых active mirrors. Минимальное связанное исправление и бюджетная арифметика даны в `PRODUCTION_PROPOSAL_RU.md`; это предложение координатору, не внедрение.

## Точные основания

| Объект | Head / run | Принято в этом пакете |
|---|---|---|
| Исходный fulltext-кандидат | `03e880036283e6f30c51a080adfd717437d1aed5`, run `39167719248` | Правильный fail-closed на усечённом чтении, ноль мутаций |
| Пересмотренный frozen код | `680865f9d6631d7ad0aba0604fcecc56784ee146`, base `11268da5d4fff6c846c27a052787395558957899` | Статическая проверка четырёх changed paths |
| Тот же код с новым basis | `35ea3cf42bdb0c024c3b1f6516050cfee177742d`, base `299441eb76df9e99909527d4f4954474ddb87bd9` | Только четыре поля scope отличаются; шесть checkout raws равны basis |
| Фактический Git-object запуск | run `39212806305`, head `35ea3cf4…` | Положительная запись принята ограниченно; отрицательная причина UNKNOWN |
| Compact 4h | run `39199992263` | Точная сохранённая цепочка из четырёх commits; новых live calls нет |
| Свежая точка перед окончанием review | main `7c3044a0f27599315148ea60045b6131c521469f` | После basis добавлены native evidence и общие статусы; reviewed runtime не менялся |

Разбор caller/runtime закреплён на `299441eb76df9e99909527d4f4954474ddb87bd9`. Более новый main не подменяет исходные часы и basis фактического запуска.

## Первый native результат: полный текст действительно усечён

Исходный ZIP run `39167719248`, artifact `12151502046`: SHA256 `12b12950a5510cebfc4d9be6a9149a62cc9303974fe965686f150bdcb088fd86`.

Единственный GraphQL HTTP 200 вернул 2 099 237 байт. Для phase, status и register поле `text` обрывается ровно на 512 000 UTF-8 байт; `isTruncated=true`. У resume, fence и generation текст полный. Native OID и byteSize всех шести объектов соответствуют полным Git-файлам по закреплённому main `0dc1c7e68064dd88f076546f12994603baba6199`; усечённые тексты — точные префиксы, но не полные файлы.

| Файл | Полный размер | Вернувшийся text | Усечён |
|---|---:|---:|---|
| phase | 647 405 | 512 000 | да |
| status | 675 049 | 512 000 | да |
| resume | 339 890 | 339 890 | нет |
| register | 890 891 | 512 000 | да |
| fence | 701 | 701 | нет |
| generation | 72 056 | 72 056 | нет |

Код завершился `EXACT_NONTRUNCATED_BLOB_REQUIRED` до create ref/tree/commit/CAS. Старый fulltext-вариант для этих файлов имеет конкретное отрицательное доказательство. Frozen код и его артефакт не исправлялись; старый job и двенадцать принятых проверок не повторялись.

## Что проверено в новом коде

Четыре changed paths: отдельный модуль `tools/qualify-four-mirror-git-object-20261018.mjs`, его тест, scope и изолированный job в weekly workflow. После удаления ровно добавленного job и его branch exclusion обычный weekly workflow равен базе. Job использует только `GITHUB_TOKEN`, `contents:write`, ручной запуск на точной ветке; Cloudflare/DB/Telegram secrets ему не передаются.

Перед мутацией обязательны шесть полных локальных raw строк. Native запрос возвращает для закреплённых файлов `Blob.oid`, `byteSize`, `isBinary`, без поля `text`. Код вычисляет Git blob SHA1 как SHA1(`blob <byteLength>\0` + UTF-8 raw) и SHA256 полных байтов, сверяет тип, размер и OID. В артефакте сохраняются шесть полных sidecar-файлов. Само наличие sidecars ещё не означает их квалификацию: guards обязаны пройти до записи.

Проверяются точный main/ref/repository ID/root tree, отсутствующий новый qualification ref, fence, generation, task, owner/acquired suffix/expiry/lease base, `latest_own_bounded_continuation_lease` и четыре active mirrors. Мутации ограничены новым `qualification/report2-four-mirror-<RUN>-1` и четырьмя inline-копиями под отдельным checkpoints prefix. Корневые файлы остаются нетронутыми.

План успеха — восемь API-попыток: metadata snapshot; новый ref; REST tree; REST commit; положительный `updateRefs.beforeOid`; commit-потомок с тем же tree; отрицательный stale-before запрос; точный metadata readback. Отрицательный потомок является fast-forward от уже опубликованного commit: одного запрета non-fast-forward недостаточно для объяснения отказа. Guard требует оба SHA и признак expected/current/before mismatch; его нельзя ослаблять после generic error.

Transport-counter и guard-блок мутаций/отрицательной проверки побайтово совпадают с исходным режимом. Максимум — 12 попыток; запрос до 8 MiB, поток ответа до 12 MiB, timeout 20 секунд, redirects запрещены. Журнал хранит размеры/SHA и известность транспортного ответа, без токена и headers. Unknown ACK останавливает работу без повторной мутации и очистки.

Названия результата явно отделены от старого fulltext-контракта: `native_fulltext_readback:false`, main branch rules и production writer correctness не квалифицированы. Git SHA1 используется в качестве native content identity GitHub вместе с полными сохранёнными raw и локальным SHA256; native SHA256 этим не доказан.

Новые шесть тестов просмотрены как текст, не исполнялись этим worker. По сообщению координатора, в job они прошли; это не независимый повтор. Два названия шире фактического тела: «missing basis or wrong contract» проверяет missing basis, «main drift or active mismatch» — main drift. Эти варианты нельзя объявлять заново проверенными по одному названию. В явном коде guards присутствуют; отдельного блокера изолированного режима это не создаёт.

## Второй native результат: положительная запись и неизвестная отрицательная причина

ZIP run `39212806305`, artifact `12168242626`: SHA256 `0276525c3b53b79843af3cc851269329446ec1039f5f3713563e3b3ea7316548`.

Установленный job token выполнил семь попыток с полученными транспортными ответами. Начальный metadata reply — 1 002 байта; все шесть полных sidecars совпадают с Git basis. REST tree принял один inline request размером **2 747 141 байт** и четыре копии. Create ref/tree/commit, положительный beforeOid CAS и создание unpublished descendant получили ACK.

Седьмой HTTP 200 содержит generic `Something went wrong…` с incident/timestamp, без expected/current SHA. Код правильно оставил `STALE_CAS_REASON_UNQUALIFIED`. Generic GraphQL error — известный транспортный ответ, но не доказательство причины отказа. Нельзя объявлять expected-before семантику доказанной лишь потому, что ref позже не изменился.

После остановки координатор выполнил один отдельный read-only GraphQL запрос. В сохранённом ответе:

- main всё ещё `299441eb76df9e99909527d4f4954474ddb87bd9`;
- qualification ref указывает на `0e523ea0d64f505b37a6ca4defbdc31689833b27`, его parent — basis main;
- unpublished descendant `9fb312879f31f8aff07296c6c267da6c5f2f2235` имеет parent `0e523e…`;
- tree обоих commits — `4db0433bbaf5e1bdf61c545929f34487f09de68a`;
- четыре OID/byteSize совпадают с полными сохранёнными prepared raws.

SHA256 отдельного ответа: `97a3157e2394ecb4c755040a201445abadec185bb289eaab53c5f592d164a8d9`, 1 044 байта. Всего **7 job + 1 coordinator = 8** попыток, но с разными actors. Различие credentials установлено явным сообщением координатора; само тело GraphQL не доказывает actor. Повтор stale мутации, третий изолированный negative job и новый native probe не выполнялись.

Ограниченно приняты installed-token положительная изолированная запись/body и отдельная content binding проверка координатора. Не приняты: полная восьмивызовная qualification установленного токена, причинное доказательство stale отказа, main branch permissions/rules, будущий размер production body, корректность production all4 writer, D1/HTTP admission и устойчивая ёмкость.

## Дополнительный действующий писатель: compact 4h

В `.github/workflows/htx-compact-4h-daily-20261010.yml:62` занятой считается только ещё не истёкшая чужая аренда. Строки 67–75 меняют только phase и подтверждают owner. Acquire читает mutable `main` по отдельным запросам; затем checkout/push перемещают HEAD, а finally в строках 136–156 снова меняет только phase. Это требует связанного исправления, а не ещё одной проверки равенства active mirrors.

Фактическая цепочка run `39199992263`:

1. `11268da5d4fff6c846c27a052787395558957899` — прежний coordinator owner уже истёк.
2. `7340a0efcd01826d06a1341cc16d268067b6e939` — только phase, чужой owner заменён `GH_ACTIONS:HTX_COMPACT_4H:39199992263:undefined`.
3. `8f7f9e4c93532c9f134c9dfad3d2b5303b943c14` — только 19 файлов результатов; все шесть control raws неизменны, но main HEAD продвинулся.
4. `ae5c476d04cb73e134e74f5fb07b4b02d3a43241` — только phase; root owner обнулён, latest lease и все четыре active mirrors по-прежнему содержат прежнего coordinator owner и `released:false`.

Все четыре active mirrors равны между собой на каждом из этих шагов. Следовательно, **равенство all4 не гарантирует согласованность с root lease/latest lease**. Истёкший foreign owner не должен очищаться автоматически. Null owner в старом объекте lease при противоречащем active state тоже не является безопасным свободным состоянием. Согласование собственной истёкшей metadata координатор уже сделал отдельно; worker main не исправлял.

Минимальный перечень путей записи полномочий/курсора теперь включает шесть: acquire/release общего helper, paid inline cursor, canonical cursor, compact acquire/release. Отдельный compact retain — дополнительный переход HEAD с неизменным raw basis, который надо передавать в context. Старый review PR496 был верен в своей области трёх helper callers/четырёх связанных writers; он не покрывает этот дополнительный workflow.

## Окончательная граница работы

В этом пакете нет нового провайдерского HTTP, SQL, workflow dispatch, запуска qualifier, MAIN, Telegram, deploy, изменения shared runtime или лимитов. Одна заключительная проверка касается только целостности сохранённых доказательств, исходных Git-байтов, арифметики и собственного diff. Следующий этап — один связанный production repair координатора и его отдельная фактическая main GitHub-only проверка под новым scope. Принятые тесты и старые jobs повторять ради этого review не требуется.
