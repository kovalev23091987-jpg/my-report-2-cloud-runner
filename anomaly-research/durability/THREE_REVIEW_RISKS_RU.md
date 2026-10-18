# Три проверенных риска и точный контракт интеграции

Этот пакет исправляет исследовательский контракт отдельно от frozenPR458/461. `identity-retention-grid.test.mjs`:11новых PASS/0FAIL, включая три воспроизведённых counterexample на настоящих функциях frozen observer. Это контролируемые данные, не новые рыночные события. Старые26+23проверки и acceptedCT/BRdecomposition не повторялись. DB-схема, production adapter, cleanup, renderer и Telegram не изменены.

## Событие не должно зависеть от ссылки на доказательство

Вызов frozen `detectClosed` на одной и той же closedсвече/20фоновых барах с новым `instrument.binding_ref` действительно создаёт новый event_id и group_key. Смена rules_hash тоже меняет event_id. Если принимать каждый такой id как независимый случай, память/статистика задублируются.

`logicalEventIdentity` теперь отделяет стабильное место события от revisions. Логический ключ: origin venue + market + native_instrument_id + instrument_epoch + timeframe + native start/end + event_family. Он не включает binding_ref, identity_verified, внутреннее имя asset_id, хеш документа/ответа или версию правил детектора. Смена условий исхода не создаёт новую единицу знаменателя: logicalCohortKey = logicalevent+horizon+direction. Разные рынки/таймфреймы/листинги остаются раздельными; перекрывающиеся масштабы коррелированы.

Native instrument id и epoch должны приходить из квалифицированного native справочника и версионированного утверждённого mapping. Epoch обязателен: переиспользованный тикер после смены контракта/актива нельзя склеить со старым листингом. Одна одинаковая строка тикера не создаёт такое соответствие. `qualified:true` в controlled input не является самостоятельным доказательством; функция явно возвращает, что внешний native proof здесь не квалифицирован.

`registerRevision` хранит первую принятую canonical_card/first_known_ts неизменно. Новые binding/raw/rules refs дописываются отдельными provenance revisions, а повтор revision не расходует ещё одну ячейку. Изменение цены/объёма/материальных единиц/multiplier — CONFLICTING_NATIVE_FACTS, не ещё одно независимое событие и не автоматическая конверсия. Вместимость revisions ограничена; переполнение явно откладывается без удаления старого. Provenance conflict сохраняет защиту от очистки.

Контракт будущего адаптера: сначала stable native mapping и registerRevision; только REGISTERED создаёт watch и исходный outcome plan по canonical_card. PROVENANCE_REVISION не запускает второй capture или новый план. Сохранять alias старых detector event_id→logical_event_id→canonical_card. На обновлённом binding нельзя молча переписать старый instrument/cardhash; новая подтверждающая запись получает собственную provenance revision и проверяется по стабильному native market key и совместимым ценовым единицам. Raw frozen observer сам эту маршрутизацию не выполняет. Пока внешний адаптер не реализован/квалифицирован, считать его основным event store нельзя.

## Поздние исходы защищают уже опровергнутый watch

На frozen observer воспроизведена последовательность: LONG подтверждён, потом опровергнут; обе гипотезы REFUTED; simulated outbox помечен SENT. Его `protectedReferences` вернул пустой массив. Если30d/90d исходы ещё не завершены, такой список преждевременен.

`retentionDecision` требует readback полного исходного плана outcomes и состояния каждой запланированной ячейки. PENDING, отсутствие строки, retryablegap, неизвестный ledger, конфликт/незапланированная ссылка блокируют detail expiry. Даже закрытый watch и известный message_id не заменяют исходы. UNKNOWN_SEND/PENDING outbox, latest нужный source, active watch, незавершённый reference graph, native fact conflict и hot48h тоже защищают детали. Защищается union raw refs всех provenance revisions, а не только последняя ссылка.

CENSORED_FINAL допускается как окончательный исход только после отдельного обоснованного решения о конце наблюдения конкретной ячейки; неделя не ставит такой статус автоматически. План обязан перечислить все реальные горизонты/направления, не удобный укороченный набор. Полнота graph/plan должна быть доказана существующим trusted reader, а не произвольным caller boolean. Даже eligible_detail_expiry=true — только чистое предложение о старых подробностях: card/anchor/compact outcomes/statistics остаются. Hook в настоящем retention не установлен, SQL=0.

## У confirmation timeframe собственная native сетка

На frozen observer воспроизведён конкретный случай: исходная1dсвеча с offset16:00UTC и подтверждающая1wсвеча с MondayUTC offset345600000. Автоматическое eventoffset%week ошибочно отвергает корректную отдельную недельную сетку.

`confirmationVerdict` требует отдельный qualified grid receipt для точного native market key и confirmation timeframe. Нет fallback к offset события. Проверяются UTC start/end, duration, explicit offset, закрытие/свежесть, целиком пост-first_known окно, геометрия OHLC, source/received clocks, rawhash и ценовые единицы/multiplier. Тот же корректный Monday пример получает CLOSED_ABOVE/LONGconfirmed/SHORTrefuted. Подмена offset, отсутствующий grid, старый/будущий snapshot, иной ценовой unit или hash отвергаются.

Это новая pure функция для будущего адаптера, а не изменение frozen watch. Последний нельзя направлять на несовместимую сетку до интеграции явного grid API. Внешнее подтверждение native календаря и источника остаётся обязанностью ingest. Результат не даёт ENTRY и не меняет основной score.

Следующий независимый пакет — конкретная controlled модель CAS/atomic transition+outbox и потери ACK/UNKNOWN_SEND. Реальное persistent write/readback, reference graph и network delivery по-прежнему выполняет/принимает координатор.
