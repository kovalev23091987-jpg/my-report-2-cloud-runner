# Два конкретных дефекта входа summary

Исходный `outcomes.mjs` на head e1decc92e2243453162bf763dcd3c26d8010c5ef проверял в summary только совпадение digest и непустой event_id. Два новых controlled вызова сохранены в `outcome-integrity-before.json`:

1. Из настоящего model-produced PENDING удалён instrument, digest пересчитан. Summary упал TypeError при чтении asset_id вместо учёта invalid row.
2. У PENDING заменены status=SUCCESSFUL/complete=true, digest пересчитан, as_of остался **до target**. Summary посчитал1 successful/complete. Это невозможный итог относительно сохранённого горизонта, а не измеренная успешная аномалия.

Это не actual market replay и не доказательство порчи живой БД: данные синтетические, network/SQL0, native admission/commit не квалифицированы. Раньше принятые проверки не повторялись для получения этих before facts.

В существующем модуле добавлен приватный валидатор текущей producer schema: typed exact-instrument descriptor, schema/card/plan digests/cell/cohort/scope, first_known/target/as_of, pending/mature/complete flags, основные числовые terminal поля, endpoint lag и исходные first-passage clocks. Пустые identity labels не образуют новую популяцию. После структурной проверки digest всё равно должен совпасть. `evaluateOutcome` теперь не принимает as_of раньше первой осведомлённости.

Invalid строки учитываются только как `invalid_rows` с ограниченными reason codes. Они не становятся FALSE/OPPOSITE/UNWORKED/censored market observations и не увеличивают знаменатель пригодных ячеек. Валидные PENDING, INCOMPLETELY_OBSERVED и terminal outputs сохраняют прежний смысл.

Прочитанный до работ контракт уже требовал **только последние frozen results**, а не append-only историю PENDING→final. Это не объявлено дефектом и не менялось: summary не выбирает «последнего победителя», разные результаты одной ячейки по-прежнему конфликтуют, идентичные не удваиваются. Ни durable revision journal, ни новый temporal framework не созданы.

Сохранены исходные commitOutcomePlan/anchor/cohort функции, формулы цены/барьеров/first-passage в evaluateOutcome (кроме нового аргументного clock guard), sourceUtility, detector, стратегия/weights. Native provenance не возникает из флага identity_verified, hash или формального matching: нужны реальные first-known/plan ACK, исходные данные и полный связанный путь. Поэтому empirical_predictive_accuracy/recall/independent_sample_count остаются null, native qualification false.

Проверено9новых integrity controls (первые7, отдельный blank-label boundary1 и JSON cell-type boundary1) и3затронутых старых summary checks. Остальные первоначальные23 tests, nonce6/protocol15, provider replay и native проверки не повторялись. Raw logs разделены. Никаких production imports, provider calls, SQL/schema, MAIN, Telegram, новых лимитов или активации нет.
