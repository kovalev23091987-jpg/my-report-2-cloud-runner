Центральный вход: один новый связанный affected case

Этот source пакет не выполнял Node, runtime, callable, SQL, tests или git-apply. Старые fixtures/suites не импортируются и не повторяются. Новый компонент export async runNativeAvailabilityConnected({runtime_root, baseline_runtime_root, repo_root, original_root}) в availability-connected.mjs не зарегистрирован как test и не имеет top-level исполнения. Он ждёт ОДНУ общую квалификацию координатора. runtime_root и baseline_runtime_root — реальные assembled src, repo_root — checkout с этим frozen пакетом; original_root опционально задаёт его originals явно, иначе вычисляется из repo_root. Точный baseline helper SHA4782dde4b525619cfefd54e4c99516cdf7922e04808e28effebae29fdf544a23; candidate SHA из proposal-target.json.

1. Применить единственный native-availability.proposed.patch к helper из exact base. Изолированная production/shared копия sourceworker не менялась.
2. Отдельная центральная правка существующего Worker callsite (не второй target sourcepatch):

```js
const approvedScope=bindApprovedHtxAnalysisScope(allContracts,{observed_ts:now,include_native_availability_diagnostic:true,native_catalog:{...contractsR,observed_ts:Date.now(),classify:classifyHtxInstrumentScope}});
```

До этого original call такой же, но без include_native_availability_diagnostic:true. Defaultfalse сохраняет прежнее отсутствие technical поля. Existing worker env.REPORT2_CURRENT_CYCLE_UNIVERSE_AUDIT=approvedScope.audit уже передаёт audit в runner failure.partial_cron_failure.approved_universe_audit (runner1064) и completion approved_scope (1225), без reader/call/SQL. Новую raw metadata копию/producer/runner exporter добавлять не нужно. Область scope для центрального optin/квалификации подтвердить собственной арендой.

3. Вызвать новый компонент только внутри общей central affected-проверки. Он сравнивает baseline/new default/new optin analytical objects и classifier call sequence на НОВЫХ CONTROLLED inputs, требует actual assembled Worker optin, exact source hashes и сохранённый failure-original. Контроли:13 общих first-failed terms в исходном порядке, точные row/count/identity/status/types/partition/labels/classifier-throw branches; prior-analysis presence/duplicates; raw0/2rows; firstterm order; строгий booleanoptin; UTF8/privacy/8record pressure. Saved6IDs используются как имена CONTROLLED fixture, а не как восстановленные исходные аргументы. 105-row pressure также CONTROLLED, не nativecoverage.

4. Сохранить actual common output целиком. PASS/byte-delta/native-cost/sourcecoverage не заявляются заранее. Если новый case упадёт, сохранить first output и исправить/повторить только его failed NEW часть. Не запускать old549/561/56519vectors/8primarycontrols/69/2084 или иные принятые suites вручную.

Диагностика ограничена8records/1024UTF8perrow/8192frame, safe primitive fields64UTF8, explicit omitted/value overflow. Счётчики metadata arrays измеряются только из уже загруженных inputs; неисполненный raw-row count NULL. Глобальный отказ сохраняет один firstterm и пустой records: per-contract predicates тогда НЕ выполнялись. Первое failed term — порядок ИМЕННО helper, не первая глобальная source authority. Body completion/hashNULL, исходные часы не обновляются. Отказ classifier сохраняет код без текста exception. Никаких market prices/body/headers/URL dump/error text, SQL/HTTP, classification/gate/score change или source admission. Memory/CPU/native persist/wire/daycapacity не измерены.
