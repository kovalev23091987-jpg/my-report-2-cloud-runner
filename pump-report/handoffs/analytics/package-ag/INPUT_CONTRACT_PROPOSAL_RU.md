# AG — предлагаемый контракт private capture; требуется подтверждение ROOT

Это подготовка, а не окончательный envelope или допуск к IO. ROOT подтверждает точную форму до actual IO. До фактического входа `review-launch-capture.mjs` не импортирован, ядро не запущено, тестов и synthetic capture нет. Окончательный адаптер может потребовать согласованной поправки после подтверждения ROOT.

Предварительно ожидается строка **точных байтов private JSON** со `schema=PUMP_LAUNCH_READINESS_ACTUAL_V1`, boolean `publication_allowed` и `analyses:[{analysis_key,analysis,original:{analysis,input,implementation_sha256,evidence_class,saved_ts}}]`. `raw_responses` и реальные receipts остаются private, их формат здесь не фиксируется. `original` — сохранённый readback; `analysis_key` должен быть `pump:analysis:` + SHA256(JSON.stringify(analysis)), как в существующем runner. Ключи объектов не сортируются и не преобразуются перед вычислением этого digest. Saved input/time/identity не заменяются current/latest или удобной новой ценой.

Предлагаемая независимая private привязка ROOT `confirmation`:

| Поле | Значение/назначение |
|---|---|
| `schema` | `AG_ROOT_CONFIRMED_CAPTURE_BINDING_V1` |
| `envelope_schema` | Подтверждённая ROOT строка `PUMP_LAUNCH_READINESS_ACTUAL_V1` |
| `capture_sha256` | SHA256 точных UTF-8 байтов capture из actual ROOT receipt, не самодекларация envelope |
| `implementation_sha256` | Exact pin actual frozen implementation, подтверждённый ROOT по artifact/deployed readback |
| `profile`, `profile_value_sha256` | Исходный профиль этой реализации и SHA256(JSON.stringify(profile)); ROOT отдельно связывает значение с exact profile-файлом в artifact |
| `review_ts` | Реальный час проверки из ROOT; используется только для отдельного freshness результата, не перезаписывает original analysis_ts |
| `originals` | Массив `{analysis_key,analysis_sha256,input_sha256,original_sha256}` из независимого сохранённого original readback; digest каждого объекта по JSON.stringify |
| `source_bindings` | Массив `{fact_id,evidence_ref,fact_sha256,body_sha256,qualification_sha256}`; полный original fact, исходные body bytes и фактический source/parser qualification proof, привязанные ROOT. Сам хеш не доказывает истинность source semantics |
| `retained_facts`, если нужны | Только фактические сохранённые original facts прежних pivots/baseline того же инструмента, с исходными часами; для них те же source bindings. Не конструировать отсутствующие факты из уровня |

Два callback передаются ROOT **только после получения actual input**:

- `recompute:{implementation_sha256,analyze(input,profile)}` — точный проверенный pure core `analyzePump`, без providers/store/delivery; pin связывается с независимой привязкой ROOT. Повторный расчёт использует JSON-копию **исходного** input и исходный analysis_ts, сверяет весь анализ и карточку с original digest. Это prospective offline приёмка фактического пакета; её запуск в AGprepare отсутствует.
- `readSourceBody(evidence_ref)` — только чтение уже переданных private raw bytes из local capture, возвращает string/Uint8Array. Никаких URL fetch/RPC/SQL/store/current/latest/fallback. Для ссылки с fragment ROOT адаптер сопоставляет exact сохранённый body; неизвестная ссылка остаётся причиной отказа. ROOT подтверждает этот адаптер вместе с окончательным envelope.

Проверка READY включает исходные clocks и units обязательных фактов, native-relative UNKNOWN без выдуманного BASE/turnover, verified crypto USDT perpetual identity, noBTCETH, preknown basis levels, полный conservative potential≥10% по худшей границе всей области, согласованную ликвидность, probabilityNULL и factual card. Существующее полное recomputation сравнение связывает selected findings/план/карточку с исходными фактами; reader не создаёт новую стратегию и не выбирает stage thresholds. Optional map/trades/данные не создаются. Input digest охватывает исходные optional/map facts, а фактическая map/source qualification остаётся отдельным proof ROOT/SOURCE, не новым nativePASS reader.

Boolean `publication_allowed` сохраняется в результате только как **claim**, а не разрешение. Даже совпавший READY original может быть уже stale на review_ts; он не пересоздаётся как current сигнал. ACCEPTANCE_TEST не объявляется production original. Пустой `analyses` означает только отсутствие analyses в переданном capture, а не NO_EVENT по550. Реальные receipts/message_id/readback проверяются отдельно ROOT; этот consumer всегда возвращает `SENT_proven:false`.

Результат содержит только индексы, enum статусы/причины, хеши input/analysis/original/card, технические counts и booleans. Он не содержит symbol, instrument_id, raw, карточку, private цены/объёмы/области/источниковые тела. Ошибки callback не печатаются. Consumer не пишет файлы, не читает filesystem, не отправляет сообщения и не обращается к сети; внешние callback должны соблюдать тот же scope. Весь actual input/confirmation/raw/receipts остаётся вне Git.

Границы памяти — только технические ограничения подготовленного reader: capture≤16MiB, analyses≤32, facts≤32 на input, source bindings≤512, body≤8MiB и суммарно≤32MiB. Это не стратегия/квота/admission и не полный census. Превышение означает отдельную конкретную зависимость, а не скрытое усечение.

До actual приёмки обязательны новый fresh authority/compatible own bounded lease/FULL, подтверждение exact envelope и независимых private bindings. Current preparation lease после заморозки освобождается; ожидание capture не удерживает аренду и не создаёт automation.
