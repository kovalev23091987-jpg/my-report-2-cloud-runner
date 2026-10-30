# Конкретное предложение координатору: полный raw context для шести путей записи

Это offline-предложение по коду на main `299441eb76df9e99909527d4f4954474ddb87bd9`, с учётом LIMITED native run `39212806305` и фактического compact run `39199992263`. Общие файлы этим worker не менялись. Ниже нет разрешения на SQL, source acquisition или production activation.

## Исправлять одну связанную цепочку

Общий примитив должен заменить phase-only acquire/release в `runner/github-bounded-phase-lease.mjs`, paid inline cursor в `tools/run-paid-sliding-history-20261018.mjs:63–65`, `runner/canonical-retention-cursor.mjs:12–33`, оба phase-only участка compact workflow. Три helper callers — weekly, paid, lossless — должны передавать тот же context дальше до finally. Compact должен использовать тот же протокол и передавать собственный подтверждённый retain HEAD. Нельзя заменить helper и оставить cursor/finally/compact на прежних предположениях.

Четыре корня: phase, status, resume, register. Ещё два обязательных witness: fence и generation. Согласованность включает root phase lease, `latest_own_bounded_continuation_lease` и содержимое active state всех четырёх корней. Недостаточно сравнить четыре active объекта между собой.

## Явный context, без скрытого перечитывания mutable main

Предлагаемый контракт результата init и каждой успешной записи:

```
read_contract = FULL_PREPARED_RAW_BOUND_TO_NATIVE_GIT_BLOB_IDENTITY
context = {
  repository_id, expected_head, root_tree_oid,
  complete_raws[6], receipts[6]: {bytes, git_blob_oid, sha256},
  owner, acquired_ts, expires_ts, scope, authority_base,
  last_operation_receipt
}
```

Это интерфейс предложения, не готовый импортируемый production API. `complete_raws` — полные исходные UTF-8 байты, а не восстановленный `JSON.stringify` общего объекта. Четыре файла можно парсить для проверки и ограниченного patch; непредназначенные root spans сохраняются побайтово. Сохраняются различия отсутствующего поля и null, исходные часы, cursor710, Paid markers, weekly release/relocation и compact root receipts.

`authority_base`/старое `lease.expected_main` обозначает main до acquire. Оно остаётся прежним. `context.expected_head` обозначает последний подтверждённый HEAD и меняется после acquire/cursor/собственного retain/release. Смешение этих значений ломает release после cursor; прежний объект lease сам не содержит актуального HEAD и полных raw.

Для acquire/release обновляются допустимые root lease/latest поля phase и общий active state четырёх корней. Cursor изменяет только соответствующее поле в active state четырёх корней, сохраняя lease. Compact добавляет только свои явно разрешённые root markers phase при release. Старые корни целиком не копируются в другие файлы.

Foreign owner запрещает acquire даже после expiry. Только явно авторизованный owner может согласовать собственную истёкшую metadata отдельным действием. Если root/latest/active расходятся, обычный init прекращается: он не объявляет lease свободным по одному null owner и не стирает конфликт при acquire.

## Init: два ограниченных варианта

Предпочтителен уже имеющийся полный checkout. Один pinned metadata query связывает current main ref h, repository ID, immutable commit/tree и OID/размер всех шести локальных raw. Только после точного совпадения пригоден context. Само `GITHUB_SHA==expected_main` или наличие файлов недостаточно. И наоборот, иной code checkout допустим только при независимой квалификации executable code и доказанном равенстве всех шести raw basis.

Бюджетный bootstrap — отдельная предусмотренная ветка, а не неограниченный fallback:

1. Один запрос получает exact h, tree, шесть OID/размеров и, при необходимости, text. Малый text используется только после проверки полной длины/OID.
2. Для каждого отсутствующего полного большого raw выполняется один immutable `/git/blobs/{oid}`; decode и OID/byteSize/SHA256 обязательны. Сейчас таких файлов три: phase, status, register. Resume/fence/generation в сохранённой точке полные.
3. При `k>3` — отказ до дополнительных blob calls. Нет прибавления cap или займа из cleanup.
4. После полной проверки и patch: REST tree с четырьмя inline raws, REST commit parent h, exact beforeOid CAS h→c, один metadata readback c/tree/parent/четырёх OID и оставшихся witness.

Стоимость самостоятельного acquire: **5+k**, то есть 5 с полным local basis или 8 при текущем `k=3`, как прежний self acquire. Borrowed init без записи — 1 либо 1+k (сейчас 4). Для обычных workflow local binding предпочтительнее.

Документация [GitHub Get a blob](https://docs.github.com/en/rest/git/blobs?apiVersion=2022-11-28#get-a-blob) допускает чтение по immutable `file_sha`, base64/raw. Это документальное основание предложенного bootstrap; на практике этот вариант здесь не запускался. Номинальная максимальная величина blob не доказывает свободный общий бюджет. Поля `Repository.object` закрепляются immutable OID/expression по [официальной GraphQL схеме](https://docs.github.com/en/graphql/reference/repos#repository).

## Cursor и release: ровно пять контролей

После init caller обязан переносить полные prepared raws и expected HEAD. Каждый cursor/release занимает: metadata guard 1 + tree 1 + commit 1 + beforeOid CAS 1 + exact metadata readback 1 = **5**. Ни bootstrap, ни свежий GET main после потери context внутрь cleanup не помещаются.

В paid нужно заменить **весь** прежний cursor block: guard3 + PUT1 + readback1. Если сохранить старый guard3 перед новым writer5, получится 8 и прежний cleanup reserve будет нарушен. Release должен получать context результата cursor, а не изначальный lease. Borrower никогда не освобождает coordinator lease.

Результат известной записи содержит head c и четыре обновлённых полных raw; два witness переносятся после проверки неизменности. После собственного compact retain h1→h2 context можно передвинуть только по подтверждённому собственному commit с parent h1 и неизменными шестью control blobs. Без такого доказательства — остановка. Чужой/неожиданный HEAD нельзя присвоить context через новый mutable `origin/main`.

## Unknown ACK и отказ CAS

Commit c известен после REST create commit, ещё до CAS. Последний запланированный metadata readback может разрешить потерянный CAS ACK без новой мутации:

| Наблюдение | Допустимый вывод |
|---|---|
| ref=c, parent/tree/четыре OID/размеры точно ожидаемые, scope ещё действителен | `PUBLISHED_EXACT`, context можно передвинуть на c |
| ref=h, исходное состояние по immutable h известно | `NOT_PUBLISHED` в момент чтения; успеха и возврата расхода нет |
| иной ref, неполный/unknown readback, истёкший scope | fail-closed; не повторять мутацию, не перечитывать новый basis, не объявлять release |

При HTTP 200 GraphQL errors нужно отдельно записывать transport reply и semantic ACK. Ошибка может не доказывать причину. Неизменный ref после generic error не доказывает stale-before отказ. Строгий qualification guard на expected/current SHA сохраняется; разрешение неоднозначного состояния или собственная recovery операция требуют отдельного scope, если запланированного чтения недостаточно.

## Матрица callers

Машиночитаемые строки и арифметика — в `caller-matrix.json`.

| Caller | Init / basis | Что переносить дальше | Особое ограничение |
|---|---|---|---|
| Weekly | `GITHUB_SHA`, обычный checkout; self acquire | context acquire до release | proposal/evidence branches сохраняют parent PRE-acquire `lease.expected_main`, чтобы не возродить lease; source-only summary не закрывает GitHub control |
| Paid | `GITHUB_SHA`; self или borrowed | cursor context в release, borrowed без release | early reservation всех оставшихся controls до первого SQL; прежний guard3 заменяется внутри writer5 |
| Lossless ordinary | `EXPECTED_MAIN || GITHUB_SHA`; self или borrowed | canonical cursor context в finally | workflow `archive` не ограничен main-only, checkout может отличаться от supplied expected main; обязательна raw binding либо отказ |
| Lossless dated qualification | квалифицирован executable checkout, затем expected main отдельно | отдельный control context | code qualification не включает шесть checkpoint raws; старый UTC16 путь не даёт нового разрешения на запуск |
| Compact 4h | default checkout на event SHA, текущие отдельные main reads заменить | acquire h1 → собственный retain h2 → release context | не захватывать foreign expired; сохранить compact markers; убрать слепое принятие `origin/main` |

Конкретный достижимый static counterexample: `retained-history-maintenance.yml` может checkout ветку со старыми roots, получить свежий `EXPECTED_MAIN` input и borrowed owner, пройти нынешние remote guards. При этом локальные шесть raw не становятся актуальными автоматически. Это не выполненный job. Второй counterexample — dated qualifier сверяет executable files, но шесть control raws в этот список не входят. Оба требуют явного init contract.

## Арифметика без повышения caps

Все GitHub и Cloudflare metadata попытки учитываются в прежнем control cap **40**. Unknown/ошибочные попытки тоже потрачены. Bridge cap16, общий164, дневные3500000R70000W, ручные/следующий full59000R920W, source budgets, два shared retention slots/day и прежние unknown/reserves сохраняются. Экономия init не разрешает больше native batches.

Для canonical lossless остаётся действующий план:

```
cleanup = borrowed ? 5 : 10
post = bridge_postflight_pending ? 4 : 0
b = min(6, max(0, floor((40 - used - cleanup - post) / 3)))
used + 3*b + post + cleanup <= 40
```

`used` включает все preflight/worker metadata и уже потраченные controls. Self cleanup10 — cursor5+release5; borrowed cleanup5 — только cursor5. Дополнительный GET на каждую операцию превратит их в 6/12 и нарушит договорённость. Нынешний early check `used+13+post` нельзя ослаблять. Последующая проверка перед каждой native batch остаётся; число batches не увеличивать из-за savings.

В `full_evidence` ветке есть **ещё шесть** control calls сохранения отдельной archive branch (`tools/recover-lossless-retained-history-20261014.mjs:126–130`) и до шести mutation guards по3. Они должны быть включены в `used`/early reservation до SQL. Там нет canonical cursor, self release5 остаётся. Нельзя выдавать одну canonical формулу за доказанный whole-job bound этой ветки. Конкретный консервативный план для этой ветки: `b=min(6,max(0,floor((40-used-future_archive_controls-post-cleanup)/3)))`, где `future_archive_controls=6` до сохранения originals и0 после, а cleanup по прежнему договору5borrowed/10self сохраняется даже без canonical cursor. Перед каждым вызовом остаток и expiry проверяются заново; уже потраченные archive controls включены в used и второй раз не резервируются. Archive raw fetches дополнительно проходят общий HTTP budget; не входят в GitHub40 как бесплатные операции. Минимальное исправление должно дать той же ветке явный остаточный план до первого SQL; иначе отказ до SQL, а не поздний cap error без cleanup.

Для Paid максимальный допускаемый expiry path имеет **два** before_modify guards: canonical ids и full-evidence ids, каждый по3. Следовательно, guards6, а не12. Точная верхняя оценка control calls существующих ветвей с новым writer:

| Режим | Init | initial guard | account metadata | bridge before | native guards | bridge after | cursor | release | Итого |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Self, полный local basis | 5 | 3 | 2 | 5 | 6 | 4 | 5 | 5 | **35** |
| Self, bootstrap k=3 | 8 | 3 | 2 | 5 | 6 | 4 | 5 | 5 | **38** |
| Borrowed, local basis | 1 | 3 | 2 | 5 | 6 | 4 | 5 | 0 | **26** |
| Borrowed, bootstrap k=3 | 4 | 3 | 2 | 5 | 6 | 4 | 5 | 0 | **29** |

Это арифметика пути, не actual usage. До первого D1 reservation self bootstrap уже потратил18; надо зарезервировать ещё6 guards +4 post +10 cleanup, сумма38. Borrowed —11/14 уже потрачено +6+4+5 =26/29. Ранний admission обязателен: hard counter сам по себе не гарантирует деньги на finally. Прежний borrowed init2 давал максимум27; новый fallback4 имеет добавочные2, их надо явно допустить заранее. При `k>3`, unknown расходе или недостатке whole/control остатка — отказ. Режим ниже high-water остаётся metadata-only, без SQL и reservation; принятый below-threshold probe повторять не нужно.

Для compact прежние phase API acquire5 + перед retain2 + release2 заменяются на local acquire5 + pinned pre-retain query1 + release5 = **11**, либо bootstrap14. Это только control API, не весь job: git fetch/push, Actions checkout и plumbing должны учитываться/измеряться отдельно. Не заявлять свободную квоту по этой цифре. Для weekly source summary сейчас не измеряет весь GitHub control; необходимо ограничить поиск prior refs/receipts и включить полный control counter. Шесть source requests не доказывают whole-job closure.

## Что проверить один раз после связанного исправления

Координатору достаточно одного итогового набора по изменённым цепочкам: полный/устаревший init basis; self/borrowed; phase/latest/all4 semantic mismatch; foreign expired deny; cursor→release с новым head; compact acquire→retain→release; сохранение root spans и markers; отказ до SQL при исчерпанном резерве; потерянный ACK с точным planned readback и без blind retry. Переиспользовать прежние принятые logs по точным SHA. Новый actual main GitHub-only point — отдельный scope координатора; изолированная ветка не доказывает main rules. SQL/source/MAIN/Telegram из этого пакета не следуют.
