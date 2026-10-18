# Почему weekly и хранение истории расходят четыре зеркала

Пакет — статический аудит на свежем `main` **a9d13e8dd5e7ed69953e3ed38af26596826affd9**. Код, workflow, статусы и действующие ограничения не изменены. Предложение для координатора: одним связанным исправлением перевести acquire, release и два cursor writer на атомарную запись четырёх `active_working_state`. Исправить только weekly helper недостаточно.

Исходные файлы, размеры, Git blob OID и SHA-256 перечислены в `source-receipts.json`. На этом SHA четыре active действительно одинаковы. Это не опровергает уже сохранённый дефект: координатор ранее восстановил зеркала. Новые jobs, тесты, provider acquisition, native SQL, deploy, MAIN и Telegram в этом пакете — **0**. Официальная документация GitHub прочитана отдельно; это не вызов мутации проекта.

Уже сохранённое доказательство — `checkpoints/expired-bound-delivery-20261018/weekly-mirror-drift.json`, run **39142329633**, main **911a1d9dbbca4c9c7416700843ae353127c24926**. Его точные байты скопированы в `original-weekly-mirror-drift.json`; хеш указан в receipts. После release phase содержал:

```json
{"owner":"CODEX:ACTIVE105_SOURCE_RELIABILITY:1792338678755","run_id":"39142329633","released_ts":1792338682353}
```

В `CURRENT_PROJECT_STATUS`, `OWNER_REVIEW_RESUME_POINT` и `FULL_OWNER_TASK_REGISTER` тот же `active_working_state.last_weekly_lease_release` был `null`. Это фактический phase-only drift одного старого запуска, а не новый запуск или доказательство drift каждого пути ниже. Старый job/каталоги/release для аудита не повторялись.

В `runner/github-bounded-phase-lease.mjs` acquire (строки 15–27) читает main ref и пять файлов: phase, fence, status, resume, generation. Из status/resume использует только weekly authorization, register вообще не читает. Меняет только phase: root `lease`, root `latest_own_bounded_continuation_lease` и active `owned_lease`, `owned_lease_expires_ts`, `lease_released`. Точный readback тоже только phase. Поэтому остальные три active остаются с прежними owner/expiry/released. Release (29–38) читает только свежие main+phase, сверяет owner, очищает phase lease и добавляет marker только в phase active. Сверки всех зеркал, полного объекта lease, актуального fence/generation и expiry на release нет. Проверка owner удерживает чужую аренду; её нельзя ослаблять или заменять автоматическим снятием истёкшей аренды.

Кроме того, Contents PUT связывает запись с blob SHA одного файла. Если между чтением и записью меняется другой файл main при прежнем phase blob, это не равнозначно CAS всего прочитанного main. Это ограничение проверено по коду; фактическая новая гонка не воспроизводилась.

Найдено ровно **три production caller** helper, не считая существующего unit fixture:

| Caller | Acquire/release и заимствование | Что реально проверяет и учитывает |
|---|---|---|
| `tools/weekly-htx-universe-refresh.mjs` | 31 / 83; всегда собственная аренда | Сверяет GITHUB_SHA при acquire, main и expiry перед каждой из шести source попыток. `makeGithubControl` вызван без счётчика fetch_impl. Unified budget резервирует шесть source HTTP, а GitHub control обращения, предварительный цикл refs и сохранение proposal/proof туда не входят. Текущий `whole_HTTP` нельзя выдавать за все transport HTTP workflow. |
| `tools/run-paid-sliding-history-20261018.mjs` | 31 / 69; borrowed ветка 26–29, borrowed не освобождает | Borrowed admission читает main+phase, затем guard читает main+phase+fence, сверяет task, expiry, RETAINED_HISTORY scope, полный latest lease и phase owner. Status/resume/register в этом пути не проверяются. GitHub+Cloudflare metadata имеют общий hard cap 40, bridge — 16. |
| `tools/recover-lossless-retained-history-20261014.mjs` | 72 / 155; borrowed ветка 64–69, borrowed не освобождает | Borrowed admission читает main+phase/fence/status/resume/generation, но не register и не all4 equality; status/resume — sequential authorization. Каждый mutation guard — main+phase+fence (3 HTTP), expiry, RETAINED_HISTORY scope, latest owner и phase owner. GitHub+worker/bridge metadata вместе ≤40; GitHub резервируется также в whole budget hot. |

Во всех трёх workflow уже заявлено `contents: write`. Weekly имеет свою concurrency group; оба retention workflow — общую relocation group. Это не заменяет owner/fence/CAS и не доказывает права конкретной GraphQL mutation.

Есть ещё **два writer того же active**:

- Paid tool, 63–65: после закрытых native costs и postflight вызывает guard и записывает `sliding_history_cursor` только в phase; затем меняет свой `expected` на commit. Canonical cursor710 этим путём не читается и не переписывается.
- `runner/canonical-retention-cursor.mjs`, 14–28: на закрытом известном результате, без manual override, сверяет предыдущий canonical cursor и свежую свою аренду, затем пишет `canonical_retention_cursor` только в phase. Caller — lossless tool, 154. Публичный статус receipt сейчас честно называется `CANONICAL_CURSOR_EXACT_PHASE_CAS_VERIFIED`, не all4.

Если исправить только acquire/release и добавить equalityguard, cursor promotion сам создаст drift до release. Если release без проверки просто разнесёт phase, он может затереть изменения в других зеркалах. Поэтому оба cursor writer входят в минимальное связанное исправление; неизвестный рассинхрон требует остановки и конкретного разбора координатором. Сохранённое специальное восстановление старого weekly marker не даёт общего разрешения «phase всегда главнее».

Минимальный предлагаемый путь, **не реализация и не выдача live допуска**:

1. Прочитать текущий main `h`, затем одним bounded GraphQL query получить current ref и 6 Blob по выражениям **`h:path`**: четыре root-файла, fence, generation. При необходимости AGENTS — седьмой Blob. Все объекты прикреплены к одному immutable SHA; выражения `main:path` для отдельных aliases неприемлемы. Ref в ответе должен совпасть с `h`. При известном caller expected head он тоже обязан совпасть.
2. Отклонить GraphQL errors/partial data, отсутствующий/не Blob объект, `text:null`, неустановленный/неверный тип, binary/truncated, несовпадение UTF-8 byteSize и Git blob OID. Проверять bounded поток ответа до накопления целиком, timeout и headers. Только HTTP 200 не является readback. Проверить актуальные task/authority/fence/latest generation, all4 active equality и точную собственную аренду; существующие caller scope/admission guards сохранить.
3. В acquire root `lease` и `latest_own_bounded_continuation_lease` — одинаковый объект только в phase. Owner остаётся **строкой** согласованного семейства, suffix=acquired_ts, expiry совпадает, lease ≤90 минут (нынешние 20 не увеличивать). Одинаковый новый active поставить во все четыре файла. В release использовать **свежий** общий active, сверить полный собственный lease/owner/срок/связь с receipt и не очищать чужой либо истёкший автоматически; снятие и `last_weekly_lease_release` записать all4. Не возвращать старый acquisition active поверх нового cursor.
4. В cursor promotion менять только соответствующий cursor в свежем общем active. Canonical и sliding — разные поля и основания. Сохранить existing closed-native checks, manual override, previous-cursor CAS и expected-head обновление caller. Остальные active поля, включая Paid/weekly marker/relocation и cursor710, сохраняются, пока именно cursor не разрешено продвигать по прежним правилам.
5. Существующий root span patch применить отдельно к исходным байтам каждого файла: phase — только разрешённые root lease/latest/active; остальные три — только active. Не сериализовать весь root JSON. Вне изменённых value spans байты и порядок ключей должны совпасть. Поля внутри active, которые операция не меняет, также должны сохранить значения и отсутствие/null.
6. Одна mutation [`createCommitOnBranch`](https://docs.github.com/en/graphql/reference/commits) с `expectedHeadOid=h` и ровно четырьмя `fileChanges.additions`, без deletions и прочих paths. Это даёт один commit и обновление ветки с ожидаемым head, вместо четырёх раздельных Contents PUT. Полные байты передаются RFC4648 base64; [контракт FileAddition](https://docs.github.com/en/graphql/reference/git) не нормализует charset или переводы строк. Это вывод о подходящем API из официального контракта, ещё не runtime qualification проекта.
7. Отдельный один bounded immutable readback нового commit: точные raw bytes/OID/размеры всех четырёх файлов, all4 active equality, parent и ref head. Несовпадение, чужой owner, продвижение main или неизвестный исход mutation закрывают дальнейшую работу. Не делать автоматический retry/repair/release поверх неизвестного результата. Для восстановления нужна уже зарезервированная control полоса и установленное владение; новая бесконтрольная цепочка не предлагается.

Точный conservative control расчёт: GET main **1** + pinned snapshot **1** + atomic mutation **1** + readback **1** = **4 HTTP** на успешную операцию. При известном expected head первый GET иногда можно убрать, но пакет **не опирается на эту экономию**. Нынешние acquire=8, release=4, canonical cursor=5, sliding cursor с его guard=5. Все GraphQL POST обязаны идти через тот же `fetch_impl` и те же счётчики попыток; отдельный прямой `fetch` обойдёт лимиты. Текущий transport жёстко добавляет `/repos/{repository}/`; для `/graphql` координатору нужен узкий фиксированный официальный маршрут, без расширения произвольных URL и без утечки токена/response body.

Для lossless сохранить `retentionMutationControlPlan`: `min(6,max(0,floor((40-used-cleanup-postflight)/3)))`, cleanup=**5 borrowed /10 self**, postflight=**4**, guard=**3**, cap=**40**. Candidate cursor4≤borrowed reserve5; cursor4+release4=8≤self reserve10. Увеличивать число native batches по экономии нельзя без отдельного основания. Старую проверку `used+13+pendingPost4>40` не ослаблять в этом пакете. Даже небольшое изменение числа cleanup calls требует проверки всех условных/ошибочных путей, не только happy path. Четыре последовательных Contents PUT не дают атомарности и не помещаются в прежние cleanup reserves при дополнительных all4 reads/readbacks. Git Database REST multi-call цепочка тоже не является доказанным решением при этих reserves.

Для Paid сохранить hard40, bridge16, прежние before-modify guards, before/after bridge metadata5/4 и existing closed costs. Ниже high-water — прежние metadata GET без SQL/admission/expiry. Для weekly требуется явный учёт GitHub control и bounded предварительных ref/receipt reads; нельзя объявлять его текущий source budget доказательством whole-job control headroom. Source6/day144/minute6, D1 reservation14000R160W и текущие whole/day/manual/nextfull ограничения не изменять. Минимальная правка зеркал не даёт права собирать каталоги повторно.

Измерены точные **исходные** байты на base SHA, не будущий patched body и не wire ответы GitHub:

| Файл | raw bytes | base64 bytes |
|---|---:|---:|
| phase | 632266 | 843024 |
| status | 661781 | 882376 |
| resume | 326622 | 435496 |
| register | 877623 | 1170164 |
| Итого | **2498292** | **3331060** |

Инертная representative JSON mutation с неизменёнными четырьмя файлами — **3331771 bytes**. Шесть Blob raw — **2571049**; семь с AGENTS — **2627749**. Локальная representative семи-Blob response serialization — **2821769 UTF-8 bytes**, либо **2995029** при ASCII escapes. Это конкретные локальные envelopes, не гарантированный maximum ответа сервера. Точные формулы, хеши и статус неизвестного в `transport-and-control-bounds.json`.

[Schema Blob](https://docs.github.com/en/graphql/reference/git) предоставляет byteSize, oid, isTruncated, isBinary, text; full response именно этих файлов ещё не наблюдался через GraphQL. [Официальные limits](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api) описывают server timeout10s и возможный partial result при resource limit, но не подтверждают приём измеренного mutation body. Документированный применимый body ceiling и безопасный запас роста из этих источников **не установлены**. Ни общий REST лимит, ни размер меньше некоторого номинального предела нельзя подставлять как доказательство.

[Permissions guide](https://docs.github.com/en/enterprise-cloud@latest/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app) требует проверять права конкретных GraphQL query/mutation. Поддержка [GitHub App authentication и POST `/graphql`](https://docs.github.com/en/graphql/guides/forming-calls-with-graphql), наличие workflow `contents: write` и успех старого Contents API сами по себе не подтверждают `createCommitOnBranch` установленным GITHUB_TOKEN. Фактические permissions, byte-perfect nontruncated snapshot, latency/rate-limit headers и приём patched body остаются **OPEN**. В аудите эти вызовы не выполнялись.

Перед live применением координатору нужны конкретные controls именно нового writer: воспроизведение сохранённого marker drift без запуска job; all4 equality после acquire/cursor/release; foreign/expired owner и moved-main/CAS rejection без записи; partial/null/truncated/oversized response и неизвестный mutation ACK; побайтная защита root spans и protected active; borrowed no-release и неизменённые control40/cleanup5/10/postflight4 во всех caller. Старые принятые тесты не запускались повторно. Существующий helper unit fixture представляет status/resume лишь authorization-флагом и не моделирует register/all4, поэтому его прежняя приёмка этот конкретный дефект не закрывает.

Ограничения пакета: **исправление не внедрено**, GraphQL не квалифицирован, storage/native budgets и сутки не закрыты; новые SQL/provider права, source coverage, anomaly activation, strategy/weights/forms/limits/пауз не изменены. Основной отчёт и встроенный LIQ сохраняются полностью. Дальнейшее общее исправление и qualification находятся у координатора.
