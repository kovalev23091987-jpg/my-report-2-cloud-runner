# O — наблюдаемая нижняя оценка ухода ниже entry area

Перед кодом зафиксирован `PLAN_RU.md`, SHA256 `70823ad8b47eb7e6826077c21c296a63094a149a92be99a60309c70a5ce9f011`. ROOT разрешил именно чистую статистику §15строки672–680 по уже имеющимся plan+свечам/точкам исходного4h окна, после frozenN/ownrelease. Новая собственная ограниченная аренда получена отдельно, с freshmain/all4/FULLreadback.

Добавлен только `scenario_outcome.entry_area_excursion` с пятью scalar fields: `area_floor_price`, `contact_confirmed_by_ts`, `post_confirmation_low_observed`, `below_area_pct_lower_bound`, `reason`. Полная семантика в плане. Нижняя граница области не называется ценой фактического входа. Подтверждение свечой требует хотя бы одной OHLC-компоненты внутри области; простого min/max crossing недостаточно. Первая область не угадывается при неоднозначном порядке.

Минимум берётся из полностью последующих закрытых баров и точек после подтверждения. Начальный бар касания и бары за исходными t0/deadline не дают нового post-contact low. Даже полный набор минутных свечей не делает эту величину точным максимальным DD после фактического входа: неизвестный путь начального бара и gaps могли скрыть более глубокое снижение. Поэтому численное значение всегда маркировано `OBSERVED_LOWER_BOUND_AFTER_CONFIRMED_CONTACT`. Если последующих наблюдений нет, low/bound=null, а не0.

Причины отсутствия пригодного значения: PLAN_UNAVAILABLE, ENTRY_AREAS_UNQUALIFIED, NO_OBSERVED_ENTRY_CONTACT, RANGE_TOUCH_ONLY, BOUNDARY_CONTACT_UNCONFIRMED, FIRST_ENTRY_AREA_ORDER_UNKNOWN, FIRST_ENTRY_AREA_HISTORY_INCOMPLETE, NO_POST_CONFIRMATION_OBSERVATIONS. Пять полей не меняют ни один прежний scalar/flag в outcome.

## Проверки

Два новых affected случая с11 небольшими вариантами; начальные2 PASS/0 FAIL. Затем расширена только отрицательная O02 ветка на low свечи, выходящей за deadline, и повторена только O02 —1 PASS. Это2 разных теста, не3. Все прежние поля нового outcome, после удаления единственного добавочного объекта, глубоко равны сохранённому варианту функции для тех же новых fixtures. Проверены прежние HIT/MISS/UNKNOWN, t0/P0/target/deadline, original rules, gaps, intrabar uncertainty, no-plan/no-data; входы не мутируются.

`baseline/outcome.before.mjs` — **необходимый test-only oracle** этого нового теста. Он совпадает по Git blob с опубликованной до O функцией и должен передаваться вместе с тестом; runtime не должен импортировать этот baseline. Это не повтор старой батареи. Ни M/L/N, ни старые E/F/H/I/J/K тесты не запускались.

## Границы и следующая ответственность

Никаких старых ENTRYfollowup, cadence, TTL, anchors, readers, дополнительных market/SQL запросов, ордеров, позиционного управления или реальной прибыли. Срок — только исходные4h. Обе OWNER deferrals сохранены. HIT/MISS/UNKNOWN, цель1.10*P0, исходные часы/rules и старая price-scenario часть не изменены. `execution_proven=false`/`user_profit=null` остаются.

Ограниченно закрывается M-G04: есть проверенная чистая bounded-метрика, а не доказанное фактическое исполнение или точный entry-DD. Native/production применение не заявляется. L/M/N frozen manifests и их артефакты не изменены. M по-прежнему отражает состояние до ремонтов; сведения передаются отдельными delta.

`G06_BREVITY_PROPOSALS_RU.md` содержит конкретные предложения: два основания, один существенный риск, не дублировать snapshots, общее происхождение карты группировать только при фактическом совпадении. Без trades/price-impact нет absorption. Это только предложение, renderer в O не менялся.

Для ROOT: внедрить добавочный объект и сохранить reason вместе с числом; не подписывать lower_bound как точную просадку от цены входа. В общий materialized summary/публичную вероятность ничего не добавлялось. Native HTTP/SQL/TG/deploy/cron=0; чужих файлов и common formats не меняли.
