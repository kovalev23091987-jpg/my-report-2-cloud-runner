# BZ2 — конкретный итог и minimal recovery для ROOT

Подтверждённый AIN TTL defect: после READY оставалось6913ms до orderbook expiry; immutable original сохранился через251ms. До candidate-queue clock прошло5753ms, после него оставалось1160ms. Delivery gate уже увидел expiry; карточки нет. Gate clock не сохранён: точный интервал19:42:15.197–19:42:18.751МСК26октября, а не выдуманная точная длительность каждой feature/journal операции. Подробные clocks и hashes — `BZ2_AIN_CLOCK_BOUNDARIES_V1.json`.

Исторический AIN pin08ab относится к70модульному artifact. Нельзя называть целый runner неизменным: installed72 добавил selector diagnostics. Девять других critical modules полностью равны; три функции исторического runner recordPublished/rememberAnalysis/checkInstrument byte-identical installed72. Это доказано `BZ2_CRITICAL_MODULE_BINDING_V1.json`, не предположено из названия версии.

## Принятый ROOT lean-вариант — достаточен для temporal anchor

Выбранный ROOT порядок правильный:

`immutable original CAS → lean journal row CAS(defer_index:true) → прежний enqueue/dispatch/revalidate/ACK → indexAnalysis → recordPublished/ack`.

В просмотренном WIP outcome-journal.remember при defer_index пропускает journalWork.ensureReady/add и сохраняет только origin/analysis snapshot row. recorded_ts берётся из фактического clock до enqueue. В post-index повторном remember существующий row не перезаписывается (origin/hash проверяются), поэтому event.event_ts≥row.recorded_ts в anchors сохраняется без изменения anchors semantics, T0 или часов источников. Дополнительный переход original.saved_ts/journal_recorded_ts в этом варианте не нужен и не предлагается к реализации сейчас.

Это одна минимальная anchor CAS перед delivery, а не прежний тяжёлый features+state+work-index путь. features_known_ts остаётся максимумом исходных received_ts использованных фактов и≤T0. T0=1793032928284, оригинальные input/analysis/key/text/plan неизменны; horizon deadline=T0+4h.

Lean вызов имеет смысл guard-ить analysis.ready: для CANCELLED/not-ready snapshot publication anchor не создаётся. Без этого нынешняя ветка non-ready CANCELLED в observations.remember запишет terminal до index, а post-index повторит terminal CAS. Это необязательный лишний SQL/recorded clock, не причина прежнего AIN пропуска. Предлагается простой ready guard, без отмены обязательного последующего terminal bookkeeping.

## Обязательная маленькая доработка внешнего finally

Просмотренный WIP ловит indexAnalysis/recordPublished ошибку после существующего delivery result и возвращает bookkeeping_error. Это правильно. Но внешний finally checkInstrument всё ещё выполняет безусловный `await budget.closeCandidate(...)`. Если эта операция бросит после возвращённого dispatch=SENT, JavaScript finally перекроет готовый return. Тогда execute снова получит CANDIDATE_ERROR и не сохранит checked.delivery=SENT. Это подтверждённый control-flow обход нового catch, не утверждение, что такой сбой уже был у AIN.

Минимальное предложение: держать возвращаемый checked result во внешней переменной; closeCandidate оставить обязательно в finally и выполнить ровно один раз. При его exception, если delivery result уже получен, добавить отдельный safe bookkeeping_error к тому же result, сохранить delivery state и остановить дальнейшие candidates/drain/stats, как уже делает execute. Если delivery result ещё не получен — оставить прежнее propagation. Unknown/charged/reserved hold не закрывать фиктивно, не возвращать расход/квоту и не отправлять снова. Native finalization/запись run по-прежнему только при дозволяющем guard; подтверждённый card/receipt остаётся источником истины, если последующая запись run невозможна.

Внешний result можно присвоить до return: finally при необходимости изменяет этот же объект. Не return из finally и не глотать безусловно store errors. Это покрывает последний postpublication administrative await в checkInstrument, а не расширяет стратегию.

## Recovery проверяется одной фактической связью

1. Card/receipt и delivery pending reference сохранены до index. Crash после SENT перед index оставляет pending card; dispatch её снова не отправляет, потому что state уже SENT.
2. recordPublished восстанавливает features и journal index из ТОГО ЖЕ card.analysis.source_input_key/original PK. Нельзя использовать текущий latest-analysis другого run, менять latest/wave на старое состояние, заново анализировать или присваивать новые clocks. Lean snapshot row уже есть, повторная регистрация идемпотентна и сохраняет recorded_ts.
3. Только после успешной observations.publication/sync разрешён acknowledge delivery work. При ошибке оставлять reference для recovery и отдельный bookkeeping_error, не переписывать реальный SENT в ERROR/UNKNOWN.
4. Проверка ROOT affected case должна подтвердить не только SENT/repaired flag, но и отсутствие QUARANTINED, привязку publication к тому же original row, неизменные T0/reference_price/horizon и ровно один send. Ранее полученный ROOT PASS без этого assert остаётся недостаточным, а не второй независимой приёмкой.

Если legacy card неожиданно не имеет journal snapshot, нельзя просто создать после ACK row с текущим recorded_ts и считать repair успешным: anchors корректно отвергнет future snapshot. Для новых patched cards lean row до enqueue исключает эту дыру. Legacy missing-anchor случай сохраняется как явный failure/unknown provenance до отдельного решения; timestamps задним числом не подставлять.

## Неизменяемые пределы

Прежний min mandatory expiry ограничивает card.expires_ts; свежие price/book recheck2HTTP, window/price/plan overlap и final-before-send checks сохраняются. TTL не продлевается. Source upper bound и число HTTP не увеличиваются, original data не освежается задним числом. Native операции lean anchor — перестановка существующей journal CAS; index/recovery стоимость входит в прежний envelope и требует guard, unknowns/reserves не обнуляются.

Устранение лишнего prepublication пути не доказывает, что исторический AIN непременно успел бы пройти card persistence+recheck+send за6662ms. Это отдельная фактическая доставка после ROOT qualification/deploy. ANALYTICS здесь Node/engine/tests/API/SQL/TG/build/deploy0 и runtime edits0; private original сохраняется только ignored.

## Следующий конечный пакет после ROOT fix

Один STATIC Q-current72 case на уже сохранённом Q original10:16:58.718МСК: связать выбранный impulse/previous_wave/low и реальные нарушения до PLAN_INVALIDATED, проверить все подходящие импульсы только внутри действующего60мин поиска арифметически, затем на известных до as-of pivots/entry/exit границах указать, есть ли доказанный пробел построения предварительного плана. Ни engine replay, ни новая native/source операция, ни расширение поиска, ни обещание READY. Этот пакет даст конечный defect-or-expected-refusal verdict для Q; он не заменяет первоочередную приёмку доставки AIN-fix и не повторяет старый DOOD/BY кейс.
