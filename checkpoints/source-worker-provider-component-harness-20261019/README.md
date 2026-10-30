# Provider capture: компонент для центральной проверки

Подготовлено по новому поручению координатора после frozen PR543. **Компонент не запускался.** Нет результата PASS, нового TAP, регистрации `test()`, импорта runtime при подготовке или повторения старых16/14+2/37 проверок. Shared production и PR543 не менялись.

Единственная точка входа:

```js
const {runProviderCaptureConnected} = await import(pathToFileURL(process.env.REPORT2_PROVIDER_COUNTERS_HARNESS));
const providerWitness = await runProviderCaptureConnected({runtime_root, runner_text});
```

`REPORT2_PROVIDER_COUNTERS_HARNESS` — абсолютный путь к `provider-capture-connected.mjs` из этого пакета. `runtime_root` принимает каталог собранных `files/` с `src/` или сам `src/`. `runner_text` — текст runner-main.mjs **того же** assembled runtime; при отсутствии аргумента файл читается рядом с src. Вызвать функцию один раз, последовательно внутри одного нового центрального affected-case вместе с SQL-компонентом координатора. Она возвращает JSON witness <=16384 UTF8 bytes и сама ничего не записывает. Наличие assert в исходнике не означает, что они выполнены.

Функция проверяет SHA двух assembled модулей543 и SHA двух точных участков runner. Выделяется реальное замыкание от `const providerBudgetReceipts` до `await installBykQuotaLedger`, исключая последнюю строку, и реальная строка `existingRunBudgetContext=buildRunBudgetContext(...)`. Полный runner не импортируется и не запускается. Изменение этих байтов требует явного разбора, а не обхода pin. Прочие изменения runner, включая отдельный sidecar, не запрещены; digest полного переданного текста попадает в witness.

Исполняемая впоследствии связь: реальный runner принудительно устанавливает callback после `...params` → **controlled collector adapter** → реальный assembled `createProviderReferenceReader` и старые reserve helpers → реальный capture → точное completion expression → реальный `buildRunBudgetContext` → JSON serialization. Это **не** полный V2/CG/CP factory и не сквозная проверка штатных sector normalizers. Прямой adapter повторяет только contract/run wrapper на этой границе. Его configured caps224/9 — controlled параметры, не подтверждение фактической политики CP/CG.

Один вызов компонента содержит три локальных режима одного нового linkage: диагностический callback выключен, реальный capture, callback бросает исключение. Каждый режим делает три controlled чтения: CG root, CP root и CG foreign run. Проверяется byte/equality результата, source receipts, SQL+bindings, HTTP shape, прежних reservations и новых cache payload; затем root completion должен содержать четыре CG cuts и два CP cuts, а четыре foreign cuts — исключить. Существующий cache HIT/denial/overflow и старые тесты543 здесь не воспроизводятся.

Fixture `dbFixture` скопирована побайтно из исправленного frozen543 `provider-budget.test.mjs`, без старых тестов и их hooks; её exact function hash и исходный file hash указаны в expected-anchors/provenance. Перенос fixture не является новым запуском. Сравнение трёх режимов использует **один assembled reader**, это не baseline старой production версии.

Canonical equality относится только к явно frozen CONTROLLED sentinel и его hash. Реальный canonical builder/analytical fingerprint здесь не исполняется. Source cache payload сравнивается по реальным mock SQL параметрам optional write. Не добавляются SQL/HTTP или новые reservations только ради metadata. Запросы reader выполняются только через controlled DB/fetch при будущем вызове координатором; фактические счётчики возвращаются после этого вызова, заранее они не объявлены измеренными.

Обязательные границы: LOCAL project ledger cuts не являются provider account/month/manual held reserve, whole-day headroom, новым admission или независимым proof token. Все соответствующие NULL/false должны сохраняться и после JSON serialization. Native SQL/provider HTTP/MAIN/Telegram отсутствуют. Native CPU/heap/persistence/wire/cache ACK/daycapacity не измерены. Полный runtime, реальные factories, native body/identity, факт sourceconnection/use105/delivery не квалифицированы.

Для точного сравнения существующих body/cache receipt часов функция временно фиксирует `Date.now` на controlled timestamp и восстанавливает его в `finally`. Центральный case должен вызывать компонент последовательно; использовать этот helper в параллельно работающем runtime нельзя. Политики ENTRY/TTL/cadence/physicalstorage не затрагиваются.
