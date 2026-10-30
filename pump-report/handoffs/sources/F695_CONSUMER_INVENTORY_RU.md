# F695 — inventory потребителей feature capsule

Проверен точный предварительный workergraph:82 модуля, pin fbb1225b374a7619208e3a14598d4d0fe8fa7b1e32054cdbba927445371bc5f9, до B1 fix. Все81 payload hash pin совпали, self-module учтён отдельно; относительных import edges вне82 нет. Exact base1941/proposal SHA каждого модуля и ссылки/call sites сохранены в inventory JSON.

Новых blockers и patch proposals нет. Потенциально опасные ещё не рассмотренные места безопасны в этом графе: retained writer игнорирует возвращённый facade view только после строгого запрета legacy schema и использует raw envelope для immutable origin/digest, не scalar decision; внутренний legacy outcome reader потребляет только origin/T0/P0, не seed features. Прямых импортёров frozen v2 codec ровно два — facade и dispatcher. Других downstream imports/reexports legacy reader не найдено.

Матрица field→consumer→validatedview содержит все8 seed fields, raw digests/origin/plan, pointer/PApin, codec/rebuild, writer, adapter, original outcome/presentation, isolated historicalmetadata и legacy-worker lexical false positives. Raw fc.features в cohort заменён view.features до downstream. Saved/cohort вывод F694 использован как ранее проверенная граница без повторного whole review; F694-B1 остаётся отдельной задачей BZ68, inventory его не снимает.

Два operator module находятся рядом в stage, но вне82 workergraph; formatter читает только derived audit labels и оставляет PnL/profit/probability=null. Local-only scenario-frequency вынесен отдельной условной строкой: не в pin/workergraph и автоматически не включается.

Actual Node/import/tests/engine/build/native/provider/CF/TG=0. Root stage/canonical/main не изменены, F691 constructor case не повторён, F693 guard не внедрён. Текущий1941 и все caps/spends/unknowns/holds/reserves/9пауз/2deferrals сохранены. Final compatible main356a48db добавил толькоROOT admission/normalAUTO evidence; все17guards неизменны, all4/rootowner/expiry/fence/generation совместимы. Новый artifact после BZ68 потребует своих exact hashes/единственного ROOT case; этот inventory не native capacity proof.
