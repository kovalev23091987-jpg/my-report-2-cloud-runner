# F614 — snapshot hook подготовлен, исполнение не разрешено

В sources/index.mjs добавлен необязательный on_catalog_snapshot=null. Ненулевое значение другого типа отклоняется в конструкторе до IO. После прежних array/wireRows проверок hook получает PUMP_CATALOG_INGRESS_V1 с provider/family/route и исходными response.received_ts, response.receipt_id, response.data. Это parsed JSON, не wire bytes и не нормализованный каталог. Callback ожидается один раз; ROOT writer читает payload без изменения исходного body.

Сохраняются ttl=0, свежий fetch, прежний cache key, нормализация, форма результата и native facts. Локальный маркер отличает ошибку callback от прежних source errors: callback rejection пробрасывается наружу без замены на coverage ERROR или нулевые расходы. Прежние ошибки источника обрабатываются как раньше. Нормальный callback return, включая SKIPPED, не меняет getCatalog output; ROOT отвечает за явные метаданные SKIPPED вне этого output.

ROOT writer и worker SOURCE не менял. Подтверждённый новый writer SHA — 4def57bf0f81db8bfd34a577a7cec907313878663f988fb47a79f57811e61d9b, заменивший preparatory71b79. ROOT writer ограничивает один текущий ключ pump:catalog:last-observed:v1, 2000 строк и 2097152 UTF8 bytes. Invalid/oversize → SKIPPED без store IO. Valid → set+get; это два интерфейсных вызова, не доказательство фактических billable R/W. Native ошибки и unknown должны сохраняться, отдельный фактический admission обязателен.

Подготовлен F614-catalog-snapshot-prepared.mjs с 12 affected cases, но Node, импорт, тесты и engine не запускались. Конечный план SOURCE+ROOT BV — F614_CALLBACK_CONTRACT_AND_FINITE_PLAN_V1.json. До исполнения ROOT должен заморозить все совместимые code hashes и выдать отдельный finite Node admission.

Старый полный fixture1278 остаётся private с исходным received clock 25 октября, 15:37:50.932 МСК; путь/SHA — F614_OLD_FIXTURE_PROVENANCE_V1.json. Он не доказывает latest1294,249 unresolved или current global N. Старые934/550 classifications не проверялись заново, registry/units/критерии/исключения не менялись. Raw body не опубликован; future fixture assertions сравнивают хеши без вывода raw payload.

Provider/native IO, SQL, Telegram, build/deploy — 0. Qualification24/24, остаток0; LOOKUP14 и расширение16/500/30 не разрешены. Все прежние spends/unknowns/caps/reserves, девять пауз и два OWNER deferrals сохранены. После freeze — только own release/FULL; исходный expiry не продлён.
