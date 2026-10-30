# BY / BY1 — первый холодный результат сохранён

Результат единственного разрешённого запуска: `COLD_PATH_BLOCK_PRESERVED`, первый блок `ANALYTICS_NOT_READY`, анализ `REJECTED / PLAN_INVALIDATED`, новая волна `CANCELLED`. Положительная цель coldstart→готовый предварительный план→карточка→revalidate→MOCK receipt не доказана. Это не фактический AUTO/SENT и не объяснение отсутствия сообщений Q/AIN.

Discovery исправна: при пустых candidate/wave/active/history настоящий runner создал очередь из явно ARTIFICIAL discovery20, настоящий source evidence и бюджетный admission пропустили одну проверку. Исходный observed closed-day growth прошёл настоящий порог; пять обязательных фактов сохранили значения, units, status и clocks исходного DOOD241. Mode/run_id и отсутствие previous — явный контрфактуальный сценарий. Historical reported_change_pct остаётся NOT_RETAINED, синтетический бюджет400 не переписывает actual ledger.

При холодном60мин поиске выбран единственный пригодный по объёму положительный импульс12:13–12:18МСК. Текущая цена ниже его собственного low; ещё17 закрытых свечей после него нарушили тот же low. Поэтому CANCELLED соответствует коду. Старая сохранённая волна11:32–11:37 находится78мин позади закрытого хвоста и холодным поиском исключена; на текущем хвосте доступны8 из её12 прежних5мин окон базы. Её прежний low не нарушен, что объясняет расхождение с принятым warm-проходом BS без его повтора.

Подробное статическое решение с code/TZ references — `BY1_STATIC_CAUSE_REVIEW_RU.md`. Ошибка выбора/инвалидации на этом кейсе не доказана; это ограничение позднего холодного старта без памяти первой волны. Других неотменённых кандидатов в60мин окне0, поэтому перестановка/фильтр кандидатов внутри него не даёт здесь исправления. Код, profile, пороги, priorities и инвалидация не менялись. Возможное отдельное требование восстановления ранней волны нуждается в настоящей достаточной истории, исходной базе/часах/сроке и review ROOT; READY ради карточки не форсируется.

Фактически: Node1, connected case1, AUTO_execute1, real engine1, MANUAL0, optional/map0, revalidate0, MOCK send0. SourceHTTP/nativeSQL/actualTelegram/build/deploy0. BY1 читает только сохранённый результат и125rows арифметически; дополнительных Node/engine/test/replay нет. Непригодность возникла до optional/card, поэтому runner не запросил три необязательных факта и не сохранял карточку. Immutable analysis сохранён, original once-lock остаётся.

Точный ROOT admission синхронизирован из опубликованного main `c26d5494a9bc413e9fb3617b26ff9ea9580e3767`. Его frozen parent authority_main=`52035b492ee8cf4067c4b7260bb75794a4677b42` сохранён отдельно от actual_current_main. До единственной команды fresh17/all4 и exact ownref/FULL выполнены в06:34:36UTC; запуск завершился06:34:41.981UTC, менее90сек после FULL. Own=`CODEX:OFFLINE_ANOMALIES:1793082674000`, acquired ref=`46afc9b5bc9d0f59b8237a70d7528401e9fa0e41`, expiry07:01:14UTC. Финальный своевременный CAS/FULL release фиксируется отдельно в `BY_EXECUTION_RELEASE_RECEIPT.json`; финальный manifest включает его без изменения замороженных результатов.

Основные точные SHA256:

- `BY_AFFECTED_RESULT.json`: `1c08657a1b654ee9e8fd0ba56575c868d03d408f48c65b0dbc0c949605f72a8b`.
- `BY_SAVED_RESULT_DIAGNOSTIC_V1.json`: `8fb69ce2ac02dc13c19c32e02d3fb02b8e91fe8b0431230e3dd60d5ee843cde9`.
- Original input: `14e18a8cd4c880de9916bcc55d2fa2e71b4d544f2ddbd8fb4f1f5310218a6d16`.
- Harness: `09f7ab5677e541571678fe2c0b3b69f61c1c7c4e40e9238d771d844e14cb1f64`.
- Frozen inputs: `57c487839b3e75797a43de1d3269fb7a7177ba77e5df7d9882a21d466a846bb0`.
- Exact72 module manifest: `2865f439466017f7b192d756c6e01e1469c5ec55232bf00dba94c354b601d93b`; artifact `6a1b27dad3a35324b73589593864cbcf1cd99bdca7239d993cd398177eeaeaf4`; installed pin `690fae17addd12ee60e111738b255dce267f6cf2af6827d506c4bd724d51f031`.

Все замороженные исходные файлы и72 модуля проверены до/после единственного запуска; байты не изменены. Raw input/output/store/точные low остаются только в ignored `.private`, их хеши включены как private-evidence references. Source24spent0left/no25, oldLOOKUP13/no14, manual3, старые caps/unknowns/issued floors/reserves,9пауз и2OWNERdeferrals сохранены. Принятые BS/BV/BW/719 не повторялись; рабочая независимая автоматика ROOT этим административным release не приостанавливается.
