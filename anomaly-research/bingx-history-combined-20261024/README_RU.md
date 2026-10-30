# B04 — единый reader, Worker и before-first вход

Механическая сборка ещё не исполненных PR634 `dd6019dc7dd2a9006c0477c2e4da6abc1298d582` и PR635 `f0d33890e7aeda89a4fa9832c618d997dc483062`. Fixed main `6a5fe77903b50f7ee2b05a735cd7a8429707755d`. Исходные пакеты и18+22варианта не менялись/не выполнялись. Это не повторный обзор635 или accepted studies.

## Готовые целые targets

| Runtime target (только TEXT proposal) | Состав |
|---|---|
| market-contracts.mjs | Exact10450bytes634: price/receipt identity, clocks/units/NULL/gold guards. |
| market-snapshot-batch.mjs | Exact22541bytes635: ROOT expected pins, stable instrument refs, bounded compatible manifests, per-metric provenance, existing pack/persist/table/PK. |
| market-history-reader.mjs | Один26678byte reader:634 individual-contract venue guard +635 whole-targets registry/gen/actor path; старый HTX20min fallback отдельно. |
| worker.js | Один636110byte Worker:634 individual-history/3price-receipt calls +635 whole-history loader/historyMetrics/5selection expressions. |

`.combined.mjs.txt` и `.combined.patch` не применены в runtime. `composition-recipe.json` содержит точные input heads/manifests и уникальные контексты hunks. Проверено текстом: **634→635 ==635→634** по всем4целым файлам. `target-bindings.json` связывает их exact before/after bytes/hash. Это не JS syntax/behavior qualification.

Два actual caller: Worker.htxStage0History → readMarketHistoryForContract (явный BingX отказывает до DB); Worker.loadHistoryTargets → readMarketHistoryTargets → instrument_ref maps → пять historyMetrics calls. Их нельзя заменять двумя whole-file overwrites с потерей соседнего guard.

Whole Stage0 пока не переключён: htxUniverseScan всё ещё HTX acquisition/approved scope. Native current producer, post-capture decision asof и независимо квалифицированные registry/classification/units/admission остаются ROOT. SOURCE479 — только DTO contract reuse; адаптер не импортируется. Нет придуманного registry/cadence/native grant. Ограничения635, включая2MiB **post-receive** stop вместо доказанного wire/cost bound, сохраняются.

## ONE combined callable, UNEXECUTED

`runBingxHistoryCombined({repo_root,expected_closure_sha256,save_result,only_component:null})` в `combined.proposed.mjs`.

`expected_closure_sha256` берётся ROOT из независимо полученного frozen manifest, а не вычисляется из самого проверяемого файла. `save_result` — обязательный фактический ROOT filesystem/artifact writer.

- identity-case.bound.mjs:18исходных variant/fixture/assertion bodies634 unchanged. Только prefix к общему bindings и record-and-return wrappers над теми же actual functions, с теми же args/исходным return object; actual_returns сохраняется в result/partial. Не comparator/response shim. Обратная text recipe возвращает exact original11232bytes.
- targets-case.bound.mjs:22варианта635 unchanged; поменялся только один prefix bindings. Обратная recipe даёт exact original19625bytes.

Первый запуск — BOTH:2существующих component groups/40вариантов, без третьего semantic group. Обе копии проверяют один набор всех4фактических targets. Автор Node/import/tests не запускал.

Порядок: external closure pin → FULL filesystem attest → IDENTITY returned JSON → save_result → assertions/postpins → TARGETS returned JSON → save_result → assertions/postpins. Каждый actual return/partial сохраняется до assert/следующего consumer. Ошибка writer или postpins останавливает chain; `combined_partial_result` удерживает уже возвращённые значения. Callback ACK не считается crash durability/native persistence proof.

**Завершённые компоненты не повторять.** Только после точного сохранённого и принятого ROOT результата можно продолжить оставшийся через `only_component:'TARGETS'` или `'IDENTITY'`. Такой результат явно отмечает omitted component и all_two_components_in_this_invocation:false, не выдаётся за полные40. Caller passed:true summaries не пропускают проверки. Поздняя ошибка одних hash guards не основание повторять семантику; ROOT отдельно связывает actual receipts/уточнённый scope.

## Полный нужный import closure BEFORE_FIRST

`import-closure.json`:4targets (Worker — только whole-text input), entry,2cases, bindings, composition recipe =9полных файлов; actual reader→batch и dynamic case imports включены, external packages нет. Node builtins перечислены. Весь production Worker и его transitive imports здесь не импортируются/не квалифицируются.

ROOT перед импортом entry проверяет все candidate/entry/case/closure bytes против внешнего frozen manifest, устанавливает4candidate в **isolated qualification checkout** и использует свежий Node process без прежних app imports. Actual Node и код/путь существующего save_result writer входят в parent ROOT scope; этот packet не аутентифицирует произвольный callback. Entry повторяет все9pins до первого собственного application import и после каждого компонента; actual Node/V8 записываются. Это не гарантия против transient TOCTOU/старого module cache или глобальной crash durability.

Если ROOT добавит SOURCE/shared edits, нужны новые exact общий текст/closure/bindings доFIRST. Pins нельзя отключить для запуска. Original634/635 остаются историческими exact inputs; новый candidate — конкретная безопасная сборка, не absence-only документ.

## Границы

Автор: Node/import/syntax/tests/provider/SQL/CF/deploy/dispatch/MAIN/TG0; ни одного semantic PASS не заявлено. Shared runtime/main/status/phase/fence/generation0. DDL/backend/score/weights/caps/паузы не менялись. Native registry/grant/current producer/cadence отсутствуют/не приняты. Telegram/anomaly finalTZ hold, обе owner deferrals, Paid48h5/4/3.5GB, cursor710 и unknown/reservations сохранены. Финальный frozen packet/hash/PR/readback/release передаются ROOT.
