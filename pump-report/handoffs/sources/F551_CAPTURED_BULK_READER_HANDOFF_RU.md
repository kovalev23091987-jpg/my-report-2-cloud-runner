# F551 — offline reader полного captured bulk

Реализованы pure API `sources/captured-bulk-price-coverage.mjs` и CLI `handoffs/sources/analyze-f551-captured-bulk.mjs`. Это операторский reader покрытия, не новый формат live facts/registry и не сборщик. Нет HTTP/SQL/TG, импорта runtime или изменений index/bingx/trades/H125. F550 frozen11eb64bf и прежние manifests не переписывались.

Вход capture строго `body.result.raw_responses[]`; каждый элемент содержит `request.url` и `response{data,received_ts,receipt_id,status,ok,semantic_status,cache_hit}`. Внутри response.data ожидается BingX envelope `{code:0,data:[...]}`. Выбирается ровно один GET bulk ticker на exact https/open-api.bingx.com/path `/openApi/swap/v2/quote/ticker`, без symbol/иных фильтров; timestamp/recvWindow допустимы. Trades/klines capture игнорируются. Если bulk0 — NOT_CHECKED_SOURCE; если bulk2 даже с равными ответами — AMBIGUOUS_MULTIPLE_BULK_RESPONSES, без выбора удобного последнего. Ошибка HTTP/business/semantic/receipt/receive также не превращается в550 missing.

CLI читает неизменённый `U3_SELECTED_550_SYMBOLS_V1.txt`, SHA256 `5e5610a579142fd19d2448b4d1834fe75498b8b4263ea41435ebd71b52b31920`, проверяет550 записей и exact fileSHA будущего capture. Raw symbol сопоставляется буквально: без uppercase/trim/NFKC/transliteration и без displayName alias. Unicode сохраняется; дубликаты всех видов полностью отвергаются для данного символа. Вне scope сохраняются только symbol/count с OUTSIDE_SAVED_SCOPE_NOT_CLASSIFIED.

Проверяются тип и положительность lastPrice (только конечное number либо десятичная string), исходный closeTime Unix-ms, event≤original receive≤analysis as-of и TTL30s от event. Нет fallback на Date header, request/capture clock или поле time. Cache hit не обновляет event/expiry. Per-symbol output содержит status, matched_rows, reason_codes, price_valid/type и исходные event/receive/expiry/receipt; **значение цены не экспортируется**. Статусы FRESH_PRICE/STALE_PRICE/MISSING/AMBIGUOUS/INVALID/NOT_CHECKED_SOURCE взаимоисключающие, totals дают ровно denominator. Отдельно сохранён fresh_at_original_receive для уже устаревшего ответа.

Выход разделяет:

- `saved_scope_price_coverage`: exact denominator550, свежие на выбранный as-of и полные только в этой оси;
- `current_membership`: NOT_CHECKED_CATALOG_NOT_UPDATED_BY_THIS_CAPTURE, count:null — в минимальном3GET нет нового каталога;
- `strict_asset_identity`: NOT_ASSESSED_BY_PRICE_PRESENCE, verified_count:null;
- `full_CORE`: NOT_ASSESSED_BY_BULK_PRICE, verified_count:null.

all550_operationally_verified=false. Количества/исполняемый multiplier null, scaled price basis не квалифицирован; ничего не копируется с SOL на1000-токены и другие контракты. Наличие550 строк не означает550 пригодных идей, стаканов, объёмов или текущую crypto membership.

Canonical hash считается над response.data: стабильная сортировка ключей, исходный порядок массивов; это не original wire bytes и не заявление о RFC8785. Pure API принимает синхронный SHA256 callback; Node CLI использует node:crypto. В CLI точно измеряются original capture file bytes/SHA и canonical UTF8 bytes. Wire bytes по умолчанию null. Опциональное расширение capture: `response.wire_bytes` вместе с `response.wire_bytes_basis='MEASURED_WIRE_BODY_BYTES'`; только такой явно заявленный измеренный показатель сохраняется как wire. Ни file length, ни JSON length, ни content-length не подставляются вместо него.

Опциональные `request.started_ts` и `response.latency_ms` сохраняют часы/заявленный duration, если предоставлены и валидны. Разность actual request start→original received даётся отдельно, с явной пометкой о включении body parse; она не называется чистой сетевой latency. Неизвестные метрики остаются null и не мешают проверить доступные цены. API не угадывает другие поля транспорта.

Вызов API: `analyzeCapturedBulkPrices({capture,expected_symbols,as_of_ts,sha256,file_evidence})`. Сам API не читает файлов. File evidence — данные caller; CLI проверяет реальный файл/хеш самостоятельно. Raw rows≤20000, captured response entries≤16; CLI ограничен8 000 000 bytes capture. Это offline ingress guard для суммарного wrapper3 ответов, не увеличение provider2 000 000B cap.

Будущий CLI-запуск после exact privatepath+SHA от ROOT:

```text
node pump-report/handoffs/sources/analyze-f551-captured-bulk.mjs --input <PRIVATE_CAPTURE_PATH> --sha256 <EXACT_FILE_SHA256> --output <NEW_COVERAGE_METADATA_PATH>
```

Без `--as-of` берётся фактическое время offline анализа, поэтому ответ может уже быть STALE. Для явного исторического анализа допустим `--as-of <Unix-ms>`; output маркирует его EXPLICIT_REQUESTED_AS_OF_NOT_WALL_CLOCK. Original receive/event не переписываются ни в одном режиме. CLI не перезаписывает существующий output и при неверном fileSHA не создаёт его. В stdout только metadata/totals/hashes, raw body/цены не печатаются и не добавляются в Git.

Новая проверка ровно1PASS/0FAIL, duration138.955833ms: literal Unicode/case, missing, равные/конфликтующие duplicate, price type/positivity, future/seconds/старые clocks, original cache age, несколько bulk captures, HTTP/semantic/receipt failures, wire metric UNKNOWN/явная basis, CLI exact frozen550/fileSHA и отказ неправильногоSHA без output; malformedJSON не печатает privatebody в error. Все данные этой проверки SYNTHETIC. Старые6/4/8 и F550 semantic checks не повторялись; native не было.

Готовый пакет — `PACKAGE_F551_CAPTURED_BULK_READER_FINAL_V1.json`. Реальный capture ещё не предоставлен: нативный результат reader не заявляется. Когда ROOT передаст privatepath+SHA, потребуется один offline разбор новых байтов под действующей собственной арендой; повторять HTTP для reader не требуется.
