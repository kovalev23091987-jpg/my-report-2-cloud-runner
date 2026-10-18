# Поля existing receipts для0SQL technical projection

Прочитан exact base `07703e786565eb2e0bbb4727f70ef6680115c07b`,17source hashes — в `field-contract.json`. Это статическая сверка существующих returns/callers, не исполнение helper/SQL/тестов или новый balances snapshot. Natural39161429947 оставлен координатору, его аудит здесь не повторялся. Standalone source-budget reader и denied-accounting CLI/protocol отменены.

## Узкий доступный срез

| Уже существующий объект | Точные поля для metadata | Что он означает |
|---|---|---|
| unifiedHttpBudget.summary() | used.hot/background/statistics,total,remaining,limits.whole_job/hot/background/statistics | Память **зарезервированных слотов этого запуска**, не actual provider HTTP |
| Existing usageSnapshot после analytics lease release | requests,rows_read,rows_written,unknown_ops | Native client counters текущей invocation в прежнем completion cutoff |
| d1DayAdmission | allowed/status/reasons,daily.day_utc/run_count/reserved R/W/measured R/W/unknown_ops/unfinished_count,next_reservation,projected_reserved,limits | Уже вычисленный **pre-reservation** admission view; не новый остаток на момент completion |
| d1RunReservation / d1ReservationReceipt | rows_read,rows_written,budget_mode/status,reservation_id/day_utc там, где соответствующий producer их возвращает | Прежний envelope и reservation receipt; metadata не создаёт ещё один grant |

Effective unified limits брать из уже созданного объекта: runner527 объединяет HTTP_LIMITS с TWO_NODE_HTTP_LIMITS. В текущем merge whole164/hot96/background56/statistics12. Defaults unified-budget.mjs сами по себе не определяют этот runtime. Summary — чистая память; повтор reserve/collect/read для projection запрещён. Отсутствующий или некорректно типизированный scalar — null, реальный0 сохраняется.

Existing inline after-release usageSnapshot нужно сохранить **один раз** и использовать тот же объект для прежнего поля usage_after_analytics_lease_release и нового technical блока. Не мутировать исходный snapshot. Новый блок берёт только named scalar counters; raw targets/unmeasured payload/error/SQL/params туда не расширять. Старое existing поле не переписывается ради нового формата. Не добавлять ещё один snapshot с другим cutoff и не выдавать projected day numbers за fresh actual balances. Поле RemoteD1Database.requests считает попытки SQL statements (каждый member batch отдельно), не число bridge HTTP transports и не provider HTTP. Usage snapshot может включать delta подключённых private readers; не переименовывать его в отдельную primary-database billing квитанцию.

Current invocation unknown0 и day unknown15 относятся к разным scopes и могут одновременно быть правдивыми. Day historical reconciliation сохраняет исходное15 и свой status/manifest metadata, не превращает его в0. Сериализованная JSON receipt не воспроизводит registered opaque proof и не авторизует следующие операции. Новый technical блок должен явно оставлять admission_authorized=false,whole_day_closed=false; input allowed=true остаётся фактом прошлого admission, не новым правом.

## Какие producer returns существуют, но не являются полным балансом

| Producer | Реальный возврат | Доступность и ограничение |
|---|---|---|
| installSourceAllowances | status,generation,window_start/end,bindings scope/fingerprint,providers,provider_operational_caps,access flags | allowanceSetup block-local в runner774; это config/setup, **used/remaining не возвращаются** |
| createD1SourceAdmission success | allowed,new_reservation,reservation_id,reserved[{scope_id,provider,units}],atomic_batch_ack,exact_readback,automatic_topup | Результат одной неизменной reservation; shared wrapper имеет его во время вызова. cfg.used_units/allowance_units/version остаются внутри producer |
| createD1SourceAdmission deny | allowed,new_reservation,reason,reservation_not_created | reservation_not_created=true — отдельный producer факт; new_reservation=false без него не доказывает отсутствие возможной записи/расхода |
| reserveEvidenceSourceAttempts/Credits | allowed,status,source,day_utc,attempts либо credits | Собственная reservation quantity; **не** весь дневной used или remaining |
| evidenceSourceAttemptHeadroom | allowed,status,requested_attempts,attempts=0,source,day_utc,used,cap,read_only | Advisory read, если он уже был вызван. На HTX reference его полный headroom отдаётся в admission только на denied ветви; успешный caller его не возвращает |
| reserveProviderMinuteUnits | allowed,status,provider,minute_bucket,reserved_units,rolling_units,cap на успешном read path | В N12 collector minute — transient local; наружу обычно уходит только status. Нельзя восстановить rolling units из этого status |
| publicVenueHasMinuteHeadroom | Только boolean | Не возвращает used/cap snapshot. Не добавлять вызов для диагностики: это SELECT |
| liquidationSources.summary().shared_budget | reserved_http,gross_reserved_http,claimed_http,actual_http,max_http,phase_started_ts,per_minute_limits и policy flags | Локальные counters **этого source service/run**, не общий monthly или provider остаток |
| collectCandidateEvidenceV2 result | decision_ts,route_accounting,shared_http_envelope{cap,reserved_attempts,actual_http},source_health,sources | Runner679 уже получает result; это exact candidate/route slice. Частичные actual counts нельзя автоматически суммировать как полный provider HTTP всех consumers |

Наличие RETURN поля в helper не означает, что оно доживает до completion. В узкой frozen projection native LIQ вход берётся из уже построенного canonical acquisition audit.shared_budget: он отдаёт reserved_http,actual_http,**max_http_per_run**; gross/claimed в этом промежуточном producer отсутствуют и остаются null. Имя из прямой service summary max_http нельзя автоматически перенести на audit input. При будущей отдельной задаче возможен typed capture результата в прежнем caller до его потери, с0SQL; это изменение metadata API/caller, а не право вызвать helper ещё раз. В текущий узкий unified/native projection такие дополнительные captures не предложены.

Для этой правки actual_provider_HTTP, unread source/day balances, provider month balances, rolling-minute pools и общий доступный бюджет должны остаться **null**. Номинальный cap, scope binding, local request count, пустой/неисполненный return и cache hit не заменяют отсутствующий ledger read. Константы BYK/provider plan также не являются фактическим остатком. KuCoin minute units имеют весовую семантику; minute_bucket не превращает rolling60s pool в минутное автоматическое обнуление.

## Границы приёмки будущего frozen head

Проверить pure typed whitelist без coercion/ошибок/raw payload; один прежний native snapshot и его точный cutoff; unchanged reservations/day unknown15; effective reserved slots вместо actual HTTP; unread pools=null; отсутствие новых helper/SQL/HTTP/clock-acquisition calls и неизменность gates/forms. Новый блок не доказывает provider coverage, source acquisition, статистику исходов, новый grant или Telegram SENT. Read-only reviewer не запускает tests/native; code и новые тесты координатора будут проверены по exact frozen head и сохранённым логам.
