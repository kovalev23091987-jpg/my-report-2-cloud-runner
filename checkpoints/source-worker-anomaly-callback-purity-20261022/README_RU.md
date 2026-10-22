# Callback-return: инертный snapshot до снятия SQL-deny

ROOT22Oct поручил конечную правку конкретного STATIC дефекта, документированного в608. Наблюдённого native incident нет. Этот пакет содержит только TEXT для одного существующего runner и один новый callable UNEXECUTED. Production/shared runtime автор не менял.

## Точная граница

В прежней предложенной DUE-функции `in_prepare` закрывал только вызов `prepare(origin)`. Затем `.then`, `.status`, `.request`, `.text`, вложенные поля и повторные чтения kernel выполнялись уже после снятия флага. Например `get status(){ db.prepare('SELECT 1').first(); return 'DUE_DEFERRED'; }` мог отправить недоменный SQL без фазового ticket; существующий usage comparison выполнялся раньше этого getter. Это бумажный контрпример, не native наблюдение.

До freeze THIRD уточнил второй конкретный вариант: Proxy trap может поставить SQL в microtask, который выполнится после снятия флага. Простого reflection под `in_prepare` недостаточно. Предложение поэтому сначала отклоняет ВСЕ Proxy, включая nested/transparent/revoked, trap-free через `node:util.types.isProxy`. Новый единственный standard Node import добавлен в тот же existingrunner и явно передан test-only compiled closure; backend/helper/reader/schema не добавлены.

Только затем snapshot читает own property descriptors plain/Object-prototype или null-prototype records. Accessors/symbol keys/функции/thenables/arrays/nonplain/cycles/undefined/nonfinite/negativezero отклоняются без вызова getter/toJSON. Значения копируются из descriptor.value, а не `original[key]`. Весь обход выполняется до снятия `in_prepare`; каждый record превращается в замороженный null-prototype объект. После флага source validation и kernel читают только эти инертные данные. Callback-owned последующая мутация исходного request/text не меняет effective snapshot.

Граница — returned-data purity для фактического plain-data consumer. Это не JS sandbox для произвольного callback body: прямые изменения globals/SDK/дескрипторов, заранее сохранённый transport или самостоятельные таймеры самого callback не квалифицированы. Прямой SQL и reentry во время callback по-прежнему пресекает существующий deny. CPU/heap/time отражения и обработки не измерялись; размер bound не является обещанием ресурсной стоимости.

## Совместимость и пределы

Actual607 consumer возвращает plain terminal data или существующий `prepareAnomalyCommit({…})`, то есть flat request с JSON-строками, text и request_bytes. Значения text/request/opid/хешей/исходных часов не заменяются. Новая копия имеет ДРУГУЮ JS-ссылку, чем raw callback result; этот узкий identity change заявлен явно. SAME effective snapshot/result сохраняется в reconciliationMap и возвращается при unknown-повторах, без нового opid/retry/SQL. Старый frozen605 harness с identity===resubmitted object не переписывается/не импортируется/не выдаётся за проверку новой семантики.

Snapshot ограничен depth4/root0,64 value nodes,32 own string keys/record и270336 aggregate UTF8 bytes строк+ключей (`2*131072+8192`: text и flat request из существующего request envelope плюс ключи). Это локальное ограничение возвращаемого DTO, не новая native квота. Строки card/state/plan остаются исходными JSON text, не раскрываются этим snapshot. Existing kernel заново проверяет их каноничность/свои131072/65536/прочие bounds.

SQL/templates/bindings/schema/index/HTTP/caps/default policy не меняются. ORIGIN→WRITE→READBACK, DUE, SAME instrumented DB/day/RESERVED receipt/live counters/statistics1HTTP каждый IO, SUM9448R244W/postV7, неизвестные расходы/known-overrun/late day/finalizer и metadata-only receipts сохраняются текстом вне новой вставки. Numeric policy по умолчанию отсутствует: никакого нового native hook/grant. Snapshot не исправляет текущий UTC22unknown1/LIQ/report/Telegram и не доказывает native epoch/global first knowledge/independent105/fs durability/pending journal/SENT.

## Сборка и новая проверка

Не применять patch к old606 напрямую. ROOT сначала строит точную согласованную DUE-сборку608 поверх current606 runnerc72, вместе с frozen607 Worker5d971/consumer224a/emitter82f0. Получается FULL618 baseline runner2bacab5b/182871B. Новый delta изменяет только runner: builtin import и snapshot block/одну строку callback. Все617 остальных файлов actual staged baseline/candidate должны совпасть. Исходные60811 и60711 файлов остаются byteexact.

`loadRunnerAnomalyCallbackPurityCapability({runtime_root,baseline_runtime_root,repo_root})` проверяет оба FULL roots ENDsrc, inventories/16actual dependency pins/fullROOT85c+f842/repoDDL+emitter/свои manifest payloads и полную TEXT recipe до application imports. Возвращает новый install и baseline_install, скомпилированные из actual runner blocks; main не импортируется. Никакой старый component/case не вызывается.

ONE `runAnomalyCallbackPurityConnected({runtime_root,baseline_runtime_root,repo_root})` содержит12 NEW CONTROLLED groups UNEXECUTED:

1. Короткий новый baseline getter→недоменный SELECT counterexample и candidate refusal.
2. Top-level then/status/text/request/bytes/toJSON accessors не исполняются.
3. Nested/nonenumerable accessors не доходят до kernel.
4. Proxy reflection не вызывается и не ставит delayed SQL.
5. Top/nested/revoked Proxy отказывают без traps.
6. Callback-owned mutation после return не меняет frozen effective bytes/opid.
7. Точные depth/key/node/string-byte boundaries.
8. Non-data/thenable/cycle/lossy формы отказывают.
9. Plain terminals и actual three-phase commit сравнивают exact wire/cost/text с before.
10. Unknown/lost/known-overrun сохраняют SAME snapshot/result, без retry; actual finalizer fenced при unknown.
11. Live parent/day/unknown/per-phase statistics остаются обязательны.
12. DefaultOFF/metadata-only receipt/exact close descriptor restore.

Database/schema/seeded cards/counters/parent receipts/cost policy CONTROLLED. Actual RemoteD1→LocalSQLite будет выполнен только будущей центральной проверкой; nativeSQL/provider/TG0 не означают all-commonSQL0. Global Date.now/fetch возвращаются в finally. Каждый возвращённый JSON сохраняется до wrapper assertions/следующего component; partial field `completed_new_callback_purity_groups` сохраняет completed list. При late failure completed components не replay.

Автор: Node/--check/import/tests/SQL/SQLite/semantics/gitapply/provider/native/CF/MAIN/manual/TG/deploy0. Выполнены только JSON/hash/text/Git packaging.12 — prepared CONTROLLED groups, не12TAP/PASS. Native cost/plan/savings/CPU/heap/latency/admission и delivery не квалифицированы.
