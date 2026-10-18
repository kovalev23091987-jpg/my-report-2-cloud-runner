# Tree + commit + короткий CAS: схема подтверждена, выполнение не квалифицировано

**YES:** официальная схема предоставляет `updateRefs` с `RefUpdate.beforeOid`; REST `createTree` принимает массив entries с inline `content`. Поэтому при заранее известном актуальном head возможен документальный план **5 HTTP**: pinned snapshot → tree → commit → exact ref CAS → readback. Это новая проверка конкретных API-контрактов, не повтор аудита четырёх writer из PR496 и не runtime-реализация.

[GitHub GraphQL Git reference](https://docs.github.com/en/graphql/reference/git#updaterefs) прямо связывает beforeOid с прежним значением ref и описывает атомарность updates. Поля:

| Тип | Поля |
|---|---|
| UpdateRefsInput | repositoryId: ID!, refUpdates: [RefUpdate!]!, clientMutationId: String |
| RefUpdate | name: GitRefname!, beforeOid: GitObjectID, afterOid: GitObjectID!, force: Boolean |

В API beforeOid optional; **в предлагаемом контракте он обязателен** и равен известному `h`. Единственный ref — `refs/heads/main`, afterOid — созданный commit `c`, force=false. Нулевые OID и другие refs исключены. Это отличается от обычного updateRef/REST PATCH с force:false: само ограничение fast-forward не сравнивает ref с исходным `h`. Результат updateRefs предоставляет clientMutationId, поэтому самостоятельный readback обязателен; clientMutationId не считается механизмом дедупликации.

[REST Git trees](https://docs.github.com/en/rest/git/trees?apiVersion=2022-11-28#create-a-tree) задаёт один POST `/repos/{owner}/{repo}/git/trees`, `tree` array и `content` string внутри entry. GitHub создаёт соответствующий blob сам: четырёх отдельных POST blobs не требуется. У каждой из ровно четырёх записей — фиксированный root-file path, mode100644, typeblob, content с полным подготовленным JSON. Одновременно sha и content не передаются; sha:null не используется. Нужен **base_tree = root tree OID commit h**, а не сам commit OID: без base_tree остальные файлы не наследуются. Root span preservation остаётся обязанностью подготовившего четыре raw файла кода.

[REST Git commits](https://docs.github.com/en/rest/git/commits?apiVersion=2022-11-28#create-a-commit) затем создаёт объект с `tree=newTreeOid`, `parents=[h]`, message. Пустой/пропущенный parents означает root commit и неприемлем. Полученные tree/parent/commit OID проверяются до CAS. Tree и commit ещё не публикуют файлы на main; при отказе CAS могут остаться недостижимые объекты. Это не освобождённая память и не основание вернуть израсходованные HTTP.

Дополнительно прочитан именно [официальный OpenAPI2022-11-28](https://raw.githubusercontent.com/github/rest-api-description/755ee33b4a81d51f6f07a902cce26cbec3b822f2/descriptions/api.github.com/api.github.com.2022-11-28.json), snapshot755ee33b…, SHA-256309e30296b212d220ed143beeba216dbb0df11915daf79ee2ed01e06c6c9a586. Из него сохранены только типы/required/enum двух endpoint в `official-openapi-fields.json`: tree — array, content — string; схема массива не исключает четыре entries; родители commit — массив SHA. Отсутствие maxItems не является разрешением неограниченного запроса. Это чтение документа, не обращение к исполняемому tree/commit API проекта.

Точный расчёт **успешного** пути:

| № | Обращение | Что уже должно быть известно или получено |
|---:|---|---|
| 1 | Один GraphQL snapshot | Caller передал точный expected h. В одном ответе: repository.id, main ref OID, commit h с root tree OID, четыре root Blob + fence + generation (и AGENTS при необходимости). Все object expressions прикреплены к SHA h. main должен равняться h. |
| 2 | Один REST createTree | base_tree из шага1; ровно4inline content entries. |
| 3 | Один REST createCommit | Новое дерево и единственный parent h; ответ даёт c до попытки обновления ref. |
| 4 | Один короткий GraphQL updateRefs | repositoryId из шага1; before=h, after=c, force=false. Большие file contents в эту mutation не входят. |
| 5 | Один GraphQL exact readback | Immutable commit c и его четыре Blob, raw UTF-8 bytes/byteSize/Git blob OID, parent/tree, одинаковые active и текущий main ref=c. Чтение только immutable c без проверки main не доказывает публикацию. |

[Commit.tree](https://docs.github.com/en/graphql/reference/commits) позволяет получить root tree в первом query. Все GraphQL POST и REST calls проходят тот же bounded fetch/counter; ошибки, timeouts и попытки тоже расходуют бюджет. Ни дополнительного GET repository ID/tree, ни предварительного GET main в цифре5 нет.

**Критическое caller-условие:** после собственного acquire и cursor promotion caller должен передать обновлённый expected head в следующую операцию, в том числе release. Старый receipt.head после cursor не подходит. Если helper сначала сам получает свежий main отдельным GET, получается **6**, borrowed cursor6>reserve5, self cursor6+release6=12>reserve10. Нельзя исправить это пропуском CAS/guard или повышением лимита.

При known head: borrowed cursor5≤5; self cursor5+release5=10≤10. Сохраняются cap40, postflight4, прежние три guard HTTP перед native mutation, max6 native batches и существующая формула control plan. Резервы **не уменьшаются**, новые native batches не добавляются. Запаса для произвольного retry/fallback/tree walk эта арифметика не выдаёт.

Из того, что c известен до CAS, следует полезное ограниченное свойство: если ACK шага4 неизвестен, запланированный шаг5 может проверить ref=c и точные четыре raw файла без нового GET head. Это предложение обработки неопределённости, не квалифицированный recovery. Если readback тоже неполон/неизвестен, main другой, owner чужой или expiry истёк — продолжение/новые writes запрещены; подтверждённое освобождение собственной аренды не объявляется. Нельзя слепо повторять mutation или снимать чужой lease. Успешные5calls не доказывают closure всех отказных путей.

Первый snapshot по-прежнему обязан проверить all4 active equality, собственные lease/latest/owner-string/expiry/scope, phase/fence/generation и разрешение операции. CAS привязывает изменение к прочитанному состоянию main, но не заменяет эти guards. Все четыре writer и защита cursor710/Paid/weekly marker/relocation остаются связанным заданием координатора из496; здесь их код не менялся.

Ограничения и permissions:

- Для tree и commit официальные REST pages требуют **Contents repository write** и допускают GitHub App installation tokens. [GraphQL permissions guide](https://docs.github.com/en/enterprise-cloud@latest/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app#choosing-permissions-for-graphql-api-access) требует проверить конкретные query/mutation для app. Наличие contents:write, мой CLI token или прежняя другая mutation не квалифицируют installed GITHUB_TOKEN/updateRefs/main branch rules.
- [API versions](https://docs.github.com/en/rest/about-the-rest-api/api-versions) по состоянию чтения поддерживает проектную2022-11-28; менять header на2026-03-10 ради примеров документации не предлагается.
- Большая base64 mutation createCommitOnBranch не нужна, **но большое тело остаётся в REST createTree**, а большой ответ — в snapshot/readback. UTF-8/JSON encoding, точные raw bytes/OID, nontruncated response, реальные размеры/latency/rate headers/body acceptance должны быть квалифицированы. Документированный7MB предел recursive GET tree нельзя переносить на POST createTree. Пустой/partial/oversized ответ не оправдывает дополнительные незарезервированные чтения.
- REST commit documentation не обещает автоматическую GitHub подпись как createCommitOnBranch; содержит optional signature и verification. Фактическая допустимость commit при правилах main отдельно не проверялась. Успех на иной ветке не доказывает допуск защищённого main.

Вывод ограничен **существованием документированных полей и условным control расчётом**. Ни SQL, ни provider acquisition, ни application modules/tests, ни GraphQL/tree/commit/ref project probe не выполнялись. Единственные проектные записи — собственные разрешённые review/checkpoint и обслуживание своей отдельной CAS-аренды. Runtime/helper/workflow/main/status/generation/стратегия/веса/формы/лимиты/паузы не изменены. Actual token/body/nontruncated read/CAS и интеграция остаются у координатора в отдельном scope.
