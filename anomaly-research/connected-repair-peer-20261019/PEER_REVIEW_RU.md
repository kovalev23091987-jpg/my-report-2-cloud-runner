# Независимый обзор связанного исправления шести путей записи

Исполнитель: `01a14f2c-d037-7472-8f8f-76753a3a3bba`, 19.10.2026. Исходный пакет: `c3b83650882af83098866dac3ccda8ce5582ce8f`, branch `work/github-four-mirror-repair-20261019`, base `7c3044a0f27599315148ea60045b6131c521469f`. Прежний PR506/head `b4b7cd781d8c717151e1b72aea539822dfd7eab8` не менялся.

## Итог

Окончательный head — `148b2fbe2030ed8eb9b75fd762acad95b6fbe10d`, PR508. Оставшихся блокеров не обнаружено. Прочитаны все15 исходных changed paths, шесть неизменённых зависимостей и последующие конкретные corrections. Четыре замечания устранены: free-state coherence, path proof при rename, независимый native batch bound и сохранение cleanup при minimum0. Точные heads, исходные доказательства и статусы — в `peer-evidence.json`.

Тесты, приложения, qualifier, SQL, source acquisition, MAIN, Telegram и deploy этим worker не выполнялись. Тексты новых тестов прочитаны; их выполнение остаётся у координатора. Один итоговый integrity-check собственного пакета проводится после завершения всей сверки, без повторного исполнения runtime.

## Новые дефекты первого head

`runner/github-bounded-phase-lease.mjs:28–33`: busy-проверка была `phase.lease?.owner || active.owned_lease`. Поэтому при равных четырёх active mirrors с `owned_lease:null` можно было пройти acquire, даже если `lease_released:false`, expiry не null или latest lease ещё не освобождён. Новый acquire молча заменил бы несогласованные полномочия.

Контрпример установлен по коду, не выдаётся за выполненный тест или фактическое состояние production. Нужен явный free-state guard: active owner/expiry строго null и released true; latest отсутствует или явно released; phase lease отсутствует/null либо является согласованным legacy-объектом из трёх null полей. Корректный старый empty lease не следует запрещать. Foreign owner сохраняется при любом expiry.

Это новый дефект после общей проверки, поэтому допустимы только новые затронутые controlled cases. Прежний connected suite и уже выполненную main technical operation повторять из-за этого acquire-only изменения не требуется, если их реально исполненные writer/transport функции остались неизменными.

Исправлено в76bf2976: перед новым acquire требуется явное согласованное освобождение root/latest/all4; корректный legacy null-owner объект сохранён.

Второе замечание, P2: `tools/compact-history-github-control.mjs:23,26` использует `git diff --name-only` с обычной rename detection. По [официальному Git diff.c v2.50.0, строки5962–5968](https://github.com/git/git/blob/v2.50.0/diff.c#L5962-L5968), этот режим печатает post-image `p->two->path`. Поэтому rename запрещённого root в разрешённый compact prefix может скрыть исходное удаление от prefix-проверки. Обычный workflow stage только compact prefix ограничивает достижимость; фактическое повреждение main не утверждается. Для самого CLI proof нужны `--no-renames` в обоих diff либо точная локальная проверка шести blob IDs перед push/adopt. Git fixture и другие новые tests этим peer не выполнялись.

Исправлено вf920c76a: оба CLI места вызывают один `compactChangedPaths`, который использует `--no-renames --name-only -z`. Координатор выполнил один новый case с настоящим локальным Git rename.

Третье замечание, P1: сохранённый `checkpoints/ACTIVE105_RETENTION_SQL_BRIDGE_PROVENANCE_HANDOFF_20261016.json`, поле `scope.borrowed_max_mutation_batches`, ограничивает ordinary borrowed native qualification тремя batches. Старый путь тратил6+3+8+5=22 control до SQL; post4/cleanup5 оставляли9 на три guard. После borrowed init1 measured used становится17; одна только формула headroom даёт4. Нужен отдельный `admitted_batch_bound3`, независимый от фактически измеренных17, в pre-SQL admission, actual plan и before_modify. Paid/full-evidence сохраняют свои границы. Native SQL этим peer не выполнялся.

Исправлено в10e3c813: actual measured used17 сохранён, ordinary canonical native caller передаёт bound3 до SQL, в actual plan и before_modify; compactor получает максимум3. Default bound6 остальных режимов не изменён.

Четвёртое замечание, P2, возникло в самой correction: сравнение только `plan.max_mutation_batches < minimum` теряет отрицательный остаток после обрезания max к0. При minimum0 подготовка могла формально пройти с used40/self и обязательным cleanup10. Текущие обычные preparation пути имеют меньший used; фактический недорезерв в production не утверждается. Общему guard нужны оба условия: допустимый admitted bound и `used+reserved+3*minimum<=40`, включая minimum0.

Исправлено в148b2fbe: оба условия проверяются вместе. В тот же новый admitted-bound case добавлены used31/40 с minimum0, которые отказываются до SQL, и ровно помещающийся used30/self cleanup10. Координатор повторил только этот новый case после изменения самого pure guard.

## Полный context и запись четырёх mirrors

`runner/github-four-mirror-cas.mjs` удерживает шесть полных UTF-8 raw: phase/status/resume/register и fence/generation. Snapshot привязан к exact main h, repository ID, immutable commit/tree и Blob OID/byteSize/isBinary. Git blob OID вычисляется по полным байтам с правильным `blob <length>\0` заголовком. Усечённый text не используется как целый файл.

При самостоятельном init разрешено не более трёх immutable blob reads. Сначала проверяется число недостающих файлов и общий размер; четвёртый недостающий файл прекращает работу до дополнительного GET. Local init даёт acquire5, bootstrap максимум8. Borrowed init допускает только уже имеющиеся точные локальные raws: metadata1, без REST fallback до SQL.

Writer делает tree с четырьмя inline roots, commit parent h, точный beforeOid CAS h→c и один metadata readback c. Проверяются current ref, repository ID, commit/tree/parent и все четыре OID/размера против полных prepared raws. Cursor и release занимают по5 контролей. Root patch сохраняет остальные root-value spans; active state заменяется одинаковым значением во всех четырёх файлах. Сохраняются cursor710, Paid, weekly/compact markers, исходные часы, unknown и действующие паузы.

Owned update требует текущий task, fence/generation, all4 equality и согласованную живую аренду: root/latest owner/acquired/expiry/base/scope, acquired suffix, active owner/expiry/released. Проверка clocks повторяется перед tree, commit и CAS. Release меняет только свою аренду; все три callers самостоятельно исключают release borrowed lease.

## Неизвестный ACK и перенос HEAD

После известного REST commit c исходный h и четыре prepared raws остаются в context/attempt. Generic GraphQL error или потерянный CAS ACK не вызывают новую мутацию. Единственный уже запланированный readback разрешает результат, только если current ref точно c и commit/tree/parent/четыре Blob bindings совпадают. Иной head или unknown readback прекращают работу без продвижения context, повторного CAS и заявления об освобождении.

Старая причина отрицательного stale CAS run39212806305 остаётся UNKNOWN. Положительный exact-main readback не делает её доказанной. Изолированные negative jobs больше не нужны.

Canonical и paid callers передают `r.head` одновременно в local expected и `lease.head`, затем finally использует обновлённый receipt. Старый cursor guard3 не добавлен поверх нового writer5. При потерянном cursor readback старый receipt не освобождает продвинувшийся main: точный snapshot останавливает release.

Weekly proposal/evidence ветви сохраняют PRE-acquire parent `lease.expected_main`. Их merge не должен возродить уже освобождённую аренду. Старый неограниченный поиск prior refs и source-only HTTP summary не объявляются доказательством полного GitHub/164 бюджета.

## Compact 4h

Workflow удаляет оба прежних phase-only writer и использует общий helper. После acquire checkout закреплён на точном leased head h1. Context и счётчик находятся в `/tmp`, сохраняются при checkout. Перед retain выполняется один pinned guard.

Persist допускает только один commit с parent h1 и изменениями под `checkpoints/htx-compact-4h/`. Собственные clocks проверяются непосредственно перед git push с exact force-with-lease. Published head записывается только после известного успешного push. На release разрешён adopt только этого известного source-only h2; начальный snapshot связывает неизменные шесть raw с native h2/tree. Чужой head или потерянный push ACK не дают слепого повторения и не позволяют объявить release.

В прямом source acquisition tool нет проверки старого `GH_ACTIONS` owner prefix, поэтому смена owner на общий корректный CODEX suffix не ломает этот вход. Source cap6, существующие SQL/D1 admission и price-only/no-ENTRY ограничения не изменены.

API-контроль compact: acquire5 + guard1 + release5 =11. Git fetch/push/checkout — отдельный native protocol; число11 не является whole-job HTTP closure. Реальное обслуживание и устойчивость хранения требуют своей обычной фактической приёмки.

## Расходы по фактическим callers

| Путь | Расчёт GitHub + CF metadata control | Верхняя сумма |
|---|---|---:|
| Paid self, local | init5 + initial guard3 + account2 + before5 + native guards6 + after4 + cursor5 + release5 | 35 |
| Paid self, bootstrap k3 | тот же путь, init8 | 38 |
| Paid borrowed local | init1 +3+2+5+6+4+cursor5, без own release | 26 |
| Full-evidence self, bootstrap k3 | acquire8 + initial guard3 + archive6 + mutation guards18 + release5 | 40 |
| Full-evidence self, local | тот же путь, acquire5 | 37 |
| Full-evidence borrowed local | init1 + initial guard3 + archive6 + mutation guards18 | 28 |

Full-evidence не допускает `native_qualification` по `canonicalExecutionMode`; CF pre/post этого режима относятся к canonical. Поэтому нельзя механически добавлять эти расходы к full-evidence и объявлять новый cap необходимым. Всякая ошибочная/unknown попытка остаётся потраченной.

Числа40/37 описывают полный прежний граф при шести guards, а не обещанный throughput итогового пакета. Новый консервативный общий cleanup10/5 может остановить full-evidence раньше; подтверждённые originals и оставшиеся hot bodies сохраняются. Scope3 применяется только к соответствующей canonical native qualification, не к Paid/full-evidence.

Для canonical сохраняется прежний reserve: cleanup5 borrowed/10 self, postflight4, guard3 на batch, cap40; число native batches не повышается из-за savings. Bridge16, общий164, D1/day/manual/next-full/source limits и unknown не обнуляются. Предварительный резерв проверяется до SQL; номинальная арифметика не является новым разрешением на native SQL или общей свободной квотой.

## Граница фактической квалификации

Сохранён исходный ZIP run39216135115 на c3b83650: artifact12169642586, SHA256 `799f88a72a1a2a0633905b131b1d3201d0e77c6a81efa5c1fafd4d9f67f8fc39`. Внутри37PASS/0FAIL общего affected check, шесть полных basis, четыре prepared raws и пять native response/journal receipts. Новая main metadata запись дала `a4b41da462b43956dc40d6873b8e2769db96d7a6`; её inline body2 750 541байт принят, положительный ACK известен. Все пять calls выполнены тем же установленным job token. Provider/SQL/MAIN-analysis/Telegram0; source/reconcile job пропущен.

Оригинал прочитан из уже скачанного файла, повторного HTTP к job/artifact этим peer нет. Координатор отдельно сохранил review полного Git readback, OID/byteSize и неизменённых root spans. Последующие acquire/reserve/path corrections не меняют native CAS module и функцию makeGithubControl, что проверяется по байтам. One-off driver/scope и special workflow job исключены из production diff; immutable c3b остаётся доказательством фактического запуска.

После новых конкретных замечаний координатор выполнял только новые затронутые cases. В пакете сохраняются37 исходных cloud PASS, отдельные7 follow-up PASS, rename case и admitted-bound case. Первый rename прогон упал из-за неверного ожидаемого error label в самом тесте; исходный FAIL и исправленный PASS сохранены раздельно. Старые37/7/rename и main job не повторялись при следующем изменении pure budget guard. Эти логи переиспользуются по происхождению, без независимого исполнения worker.

Такая операция подтверждает main GitHub permissions/body/точный путь записи в своей точке. Она не подтверждает устойчивое хранение, native ёмкость, успешную очистку подробностей, полную финансовую цепочку или аномальный сигнал. Новое поле — техническая metadata. Стратегия, score, формы и источники этим пакетом не меняются.
