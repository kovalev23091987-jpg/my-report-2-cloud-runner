# Точный технический носитель Gate из уже имеющейся памяти

Предложение для координатора. Production imports false: все файлы этого PR находятся только в `checkpoints/source-worker-gate-memory-diagnostic-20261019/`. Shared-файлы, main, базы и источники исполнитель не меняет.

Новое прямое указание владельца: сопровождение идей до входа отложено до отдельной команды; physical storage expiry/throughput также отложен. Этот пакет относится только к технической проверке полезных источников действующих блоков. Existing runtime521/527 не отключается; ENTRY/recheck/TTL/general-refresh задач здесь нет.

В сохранённом естественном39235810465 BTW четыре Gate FUTURES факта не прошли исходный identity/fact contract. CT в том же запуске прошёл, хотя оба имеют `LEGACY_VALUE_PASSTHROUGH`. Четыре нормализованных флага и отсутствие первичных тел не доказывают первый отказ. Уже принятый разбор: `checkpoints/natural-39235810465/source-consumer-inventory.json` в свежем main. Нового исходного отказа BTW этот пакет не восстанавливает.

В текущем коде результат `bindGateOfficialAssetIdentity` уже содержит `status/reason`. Его отказ логируется, но не переносится в canonical. Нормализованные Gate identity/scalars уже находятся в загруженном canonical; runner выбрасывает их при compact-проекции. Нативное повторное чтение private LEGACY не разрешено самим наличием reader-функции: независимого prepaid допуска до первого SQL для этой операции не найдено. Потраченный резерв исходного cold-copy не является новым допуском.

## Один предложенный путь

Точный textpatch касается только трёх shared-файлов: существующего `observation-source-role-audit.mjs`, `worker.js` и `runner-main.mjs`. Новый production-модуль, таблица, validator, route или источник не добавляется. Сначала runner сохраняет только уже возвращённые `status/reason` в invocation-local memory. Worker после построения canonical передаёт callback только contract/run/snapshot/observed_ts/fingerprint. При существующем чтении canonical runner сопоставляет весь tuple; только точное совпадение даёт техническую проекцию. Повторный attempt или tuple неоднозначен, latest-wins нет.

Диагностика находится ВНЕ canonical metadata, source_receipts и analytical fingerprint. Она не передаётся в gate, score, formatter, trigger, task или source admission. `canonical-runtime-adapter.mjs`, canonical builder/publication, исходный binding helper, SQL и ручной/Telegram текст не меняются. Worker callback не мутирует canonical. Старые сообщения/ревизии не переписываются. Отсутствие invocation-local carrier при чтении истории даёт UNKNOWN, а не новый отказ.

Техническая проекция берёт только четыре известные Gate FUTURES метрики из уже сохранённого `metadata.source_role_view.classified`. Включаются нормализованные identity/quality/coverage/clocks и существующий `reason_code`; они не являются raw API. `raw_value`, `normalized_value`, URL, body, адрес токена, nested asset binding, note/error исключены. `CAPTURED` означает сохранённые технические поля, не пригодность факта или разрешение публикации. Существующий audit499 и его reasons/nullableflags не меняются.

## Ограничения размера и доверия

- First-binding status/reason: максимум512 UTF8 bytes; каждая строка максимум128 bytes. Invalid/missing/foreign дают UNKNOWN; overflow — OVERFLOW с пустым reason. Исходный объект не обрезается и не мутируется.
- Нормализованная проекция: максимум4 строки и8192 UTF8 bytes включая exact canonical tuple и first-binding. Duplicate/foreign/invalid строки исключают всю новую проекцию; исходные полезные факты остаются. Это техническая проверка сериализации, не новый source validator.
- Invocation-local memory: максимум6 записей по существующему пределу output SELECT; key<=256 bytes, tuple<=512 bytes, binding<=512 bytes, без eviction. При переполнении новые диагностические записи отсутствуют/OVERFLOW, сам binding producer продолжает работать. Сумма UTF8 размеров шести key+tuple+binding<=7680 bytes ДО обрамления; это не общий memory/wire upperbound. JS object/Map overhead, обрамление и CPU не измерены.
- Все источники/SQL остаются прежними. Новый app/native IO upperbound, private durable ACK, размер всего финального artifact/HTTP ответа и дневная стоимость этим не квалифицируются. Добавляется только технический экспорт; его фактический native размер/сохранение нужно наблюдать в штатном запуске, если координатор внедрит proposal.
- Exact tuple — доверие уже исполняемому producer и existing persisted canonical, не криптографическая квитанция API. Диагностика не восстанавливает исходный API predicate trace. Binding.reason — только фактический возврат существующей функции; thrown error не превращается в reason.

## Проверка

`build-proposal.py` готовит exact patch и временные источники из fixed main857ff3f65ad95e25ad7e5e9028ef54d1f715eadf. `verify-package.py` один раз проверяет применимость/синтаксис/сохранность и запускает один новый connected controlled testcase. Он выполняет реальные новые функции, exact runner closure, exact Worker callback и exact output loader с локальными зависимостями. Остальной Worker/runtime не импортируется, DB/HTTP нет. Нормализованные строки — явно CONTROLLED missing-field fixture, не выдуманный native BTW carrier. Варианты одного случая включают уже возвращённые первые отказы, отсутствие, throw, подмену tuple/contract, дубликаты, утечку лишних полей и переполнение. Старые499/8/559/1/6 suites не запускаются.

Фактический результат:32 provenance/apply/syntax/preservation PASS. Первая попытка одного нового testcase завершилась0PASS/1FAIL: adversarial fixture ещё помещался в8192 bytes и правильно получил CAPTURED. Изменён только fixture, код proposal остался byteexact. Повторён исключительно этот failed new testcase:1PASS/0FAIL,31 связанных vectors. Исходный NODE_SPEC и его receipt сохранены; последующий `connected-tests.tap` — настоящий TAP13. Полный32-check проход не повторялся. Нормальная CONTROLLED diagnostic JSON4379 bytes, first-binding175 bytes; это не размер реального отчёта, HTTP или native сохранения.

Координатору: после проверки применять только `shared-memory-diagnostic.proposed.patch` к совпадающим before hashes. Не накладывать устаревший metadata/fingerprint-вариант: он был отвергнут до единственной проверки и отсутствует в patch. Whole-runtime/новый native carrier acceptance остаются центральными. Никакой forced MAIN ради этого пакета не нужен.
