# BT — статическая интерпретация следующего обычного AUTO71

Статус: **STATIC_REVIEW_COMPLETE_PREPARATION_CLARIFICATIONS_REQUIRED**. Существующий operator менять не требуется; ROOT принял уточнение preparation/postprocess oracle. Node/engine/tests/provider HTTP/native SQL/Telegram/build/deploy —0. Это не IO admission и не фактическая приёмка AUTO/SENT.

Проверен `ROOT_NEXT_NORMAL_AUTO_ACCEPTANCE_PREPARATION.json`, SHA256 `47ddac17bac9576fc99c533e334fb5b31f735815557b08beecf1340866c51325`. Все четыре перечисленных reuse-файла совпадают по SHA. Live71 pin `75fe60f7ddd92bc4c055a4d6865209ea0420f2218865ba6cb9a8f5e031c70e1a`, artifact `f84700dc6bb5a6446928be5edc8e6ab04a58106774729cd2e1f2b0866339f8bf`. Scope остаётся одной страницей20 карточек, одной выбранной карточкой и максимум двумя original при включённых обоих readers.

## Два независимых доказательства нельзя автоматически объединять

`saved-auto-observation.mjs`:12–30 получает executor/run, затем независимо выбирает первую SENT AUTO PRODUCTION карточку в ограниченной странице, сортируя по confirmed_ts. Строки31–53 проверяют её собственный original/pin/OBSERVED, mode/purpose, hash текста/анализа и фактическую receipt. Проверки равенства card.analysis.run_id последнему run нет. Такая карточка может честно доказать одну доставку собственного run на71, но не доставку последнего выбранного кандидата.

`saved-auto-candidate-observation.mjs`:16–30 отдельно выбирает первый подходящий `run.checked` AUTO PRODUCTION, проверяет его analysis_key/hash и original текущего pin с OBSERVED. Это доказательство кандидата последнего сохранённого run; `ready=true` само по себе не доказывает отправку.

Для совместной приёмки ROOT должен требовать одновременно:

```
observation.first_genuine_same_original_SENT_observed === true
candidate.saved_original_bound === true
card.analysis.run_id === candidate.original.analysis.run_id === observation.latest_run_id
observation.analysis_key === candidate.analysis_key === card.analysis.source_input_key
card.analysis.instrument.instrument_id === candidate.original.analysis.instrument.instrument_id
```

Здесь candidate.original означает уже прочитанный `candidate.private_evidence.original`. Сохранённые hash/pin/mode/purpose/OBSERVED/receipt проверки остаются обязательными; формула их не заменяет. При несовпадении — два отдельных результата, `latest_candidate_delivery_bound=false`; не переименовывать историческую доставку в текущую. Для утверждения именно о новом обычном событии нужны также его ожидаемый run_id/исходные часы из допущенного фактического evidence. Без них формулировка — «последний сохранённый run на момент наблюдения», а не «новый запуск следующего дня».

Минимальное уточнение ROOT preparation: явно записать joint-binding oracle и `maximum_selected_originals_total=2` при `read_latest_auto_candidate=true`; selected_card=1 и cards_page=20 сохраняются. ROOT-файлы в BT не изменены. Нового patch/test/reader не подготовлено.

## Native bounds: максимум11 запросов в успешной ветви, прежний cap16

| Участок | Число запросов |
| --- | ---: |
| reserveNativeRun: INSERT + PK readback, native-budget:49–58 | 2 |
| saved-auto-observation: executor PK + run PK + page + card PK + original PK, строки12–30 | 5 |
| optional latest-auto-candidate original PK, candidate:22 | 1 |
| project resources PK, operator:76 | 1 |
| finalizeNativeRun: UPDATE + PK readback, native-budget:62–72 | 2 |
| Итого при outcome=false | **11 из16; запас5** |

Оба original могут совпасть по ключу, но нынешние readers всё равно выполняют два get; они также могут относиться к разным run. Поэтому суммарный максимум —2 выбранных original/2 чтения original, не1. При отсутствии карточки/кандидата запросов меньше. Один business page не расширяется и не пагинируется автоматически. Outcome-reader выключен; его дополнительный маршрут не входит в эти11.

Это статический счёт statements успешной ветви, не фактические billed rows. Дневной ledger scan при reservation и реальные ACK определяют расход R/W; JSON rows/PK/calls не доказывают500R/30W. Исходные envelope500R/30W и жёсткий wrapper16 остаются; reserve/finalize входят в них, неизвестность/ошибка не дают возврата или retry. Запас5 не разрешает дополнительные чтения. LOOKUP13 уже израсходован,14 не допущен. Новый UTC-день сам по себе не доказывает доступный общий бюджет; нужна новая фактическая admission с сохранением расходов, unknowns и резервов.

## Что означают diagnostics и что не становится native SENT

В71 `runner.mjs`:74–81 selected выбирается после source-evidence predicate, но `leaders` — порядок всей due/prequeue очереди **до** source eligibility. Capture происходит до admitCandidate и до engine (`runner`:237–238). Selected может затем получить budget defer; лидер не обязательно пригоден к CORE/READY. `candidate-diagnostics.mjs`:17–50 ограничивает4 шага/5 leaders; это не пять разных монет, не wholequeue/550/day, не реконструкция старой очереди. NULL/отсутствующее поле не приравнивается к пустому списку.

Карточка другого pin возвращает `SENT_OTHER_IMPLEMENTATION_NOT_CURRENT_PROOF` (observer:31); этот ранний результат может скрыть другие карточки в той же странице и не доказывает их глобальное отсутствие. MANUAL карточки исключены на17/29; существующий MANUAL241 SENT, даже возвращённый через AUTO dispatch как дубликат, не считается AUTO-карточкой.

BS MOCK не проходит native oracle: original.evidence_class=ARTIFICIAL вместо OBSERVED; в MOCK receipt отсутствуют `http_started_ts/http_ack_received_ts/http_clock_basis`, обязательные observer:43–50; recipient не соответствует утверждённому hash. Сам флаг state=SENT/положительный id не достаточен. Подлинная receipt привязывает card_id, сохранённый text_hash, recipient hash, message_id и последовательность send/fetch/parsed-ACK/confirm; источник этих HTTP clock-полей — реальный sendSavedTelegram:12–21. Future real observation всё равно требует actual finalized native receipt/readback и текущую authority.

Охват остаётся одним ограниченным наблюдением; ни глобальный earliest SENT, ни весь рынок/день/общий account billing не доказаны. Старые unknowns/reserves/caps,9пауз,2OWNERdeferrals и business cron сохранены. SOURCEF612/cold case не выполнялись и не запрашивались. После freeze — только своевременный own release/FULL.
