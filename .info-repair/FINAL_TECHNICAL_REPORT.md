# Финальный технический отчёт

## Статус

`READY_FOR_OWNER_RUN`

R6 был автоматически и полностью откатан защитой. Production сейчас находится на rollback-коммите `06456805eded133965324b1e5786daf1ad783575`; его tree SHA `cd07411c57bb1cc5f5d905d4035a3dad6de44d47` точно совпадает с исходным production `f12d7c12441c3ddd710b2fd333d90ab402fa6785`. R7 подготовлен, но не запускался.

## Что установлено

Сбой R3 воспроизведён на фактической архивной D1 DDL. Категория `FINAL_CHAIN_CANDIDATE` не входит в разрешённый `CHECK`. Старая конструкция `INSERT OR IGNORE` скрывала ошибку ограничения; последующий readback не находил строку и сообщал `RESERVATION_CONFLICT_WITHOUT_ROW`.

Исправление не ослабляет схему. Информационный транспорт использует допустимые legacy-категории, а семантическая изоляция задаётся префиксами `info:*` и `INFO_*`. `ON CONFLICT(dispatch_key) DO NOTHING` подавляет только конфликт primary key; CHECK/trigger ошибки остаются видимыми. Lifecycle читается через новый additive index с обязательным `INDEXED BY`.

## Архитектурные свойства

- Вход: максимум 24 WAIT + 24 OBSERVE, затем строгая нормализация и дедупликация.
- Freshness: 12 минут; future, expired, partial, null и malformed факты недопустимы.
- Identity: точный NFKC contract/wave/direction, без alias guessing.
- Выход: утренний обзор либо один ранний WAIT за цикл.
- Reservation: атомарный dispatch key; cooldown учитывается в том же INSERT.
- Delivery: SENT только при явном `delivery_state=SENT` и числовом Telegram message id.
- Неопределённая сеть: запись остаётся RESERVED с `DELIVERY_UNKNOWN_NO_AUTORETRY`.
- Storage: максимум 1024 строки namespace `info:*`; переполнение закрывает отправки.
- D1: Telegram preaction envelope ограничен 1536 reads / 4 writes. Перед индексом проверяются точная legacy-схема, отсутствие неизвестных triggers, lifecycle cardinality ≤2048 и дневной бюджет; одноразовый индексный резерв 8192 reads / 2304 writes.
- Network: максимум один Telegram POST за цикл; mutation dispatch и push не повторяются вслепую после неоднозначного ответа.

## Уровни доказательности

1. **КОД РЕАЛИЗОВАН:** да, локальный кандидат и защищённый owner installer.
2. **ТЕСТ ПРОШЁЛ:** да, 17 SQLite/runtime, полный D1 bridge preflight E2E, 4 schema/contract, 8 owner-safety, 4 package-route, final-chain regression и 22 targeted baseline tests.
3. **ЛОКАЛЬНАЯ ИНТЕГРАЦИЯ ПОДТВЕРЖДЕНА:** да, реальная SQLite DDL, две соединённые сессии, restart и failure injection.
4. **PRODUCTION ПОДТВЕРЖДЁН:** R6-кандидат не подтверждён и откатан; восстановление прежнего production-tree подтверждено. R7 не запускался.
5. **СТАТИСТИЧЕСКИ ВАЛИДИРОВАНО:** нет. Информационный канал не является подтверждённым торговым сигналом.

## Safety invariants

- Strategy weights: `35/30/20/15`, без изменений.
- Live probability: NO.
- Live/validated signal: NO.
- Trading execution: NO.
- Automatic weight tuning: NO.
- V3 Telegram network: NO.
- Final-chain automatic output: NO.
- Worker payload: неизменный SHA-256 `7a3c73770e516db9e7ef17ca3e582947769c0fa3f8cb2814e915ee0303695a83`.

## Что остаётся недоказанным

Для R7 ещё не доказаны повторный remote preflight, повторная тестовая доставка, новый exact candidate SHA и три естественных production-цикла. Установщик проверяет эти пункты последовательно и завершает работу без заявления успеха при отсутствии доказательства.

Remote preflight `35521643482` полностью прошёл. Последующий no-send run `35521665753` также завершился `success`, ничего не отправил и сохранил live-функции выключенными. Owner gate затем выявил ошибку proof-представления: при D1 budget-block fallback не переносил фактические `enabled=false` / `info_enabled=false`. Исправление формирует proof из реальных env-gates и использует bounded informational envelope 1536 reads / 4 writes; наблюдённый run имел 2462 reads и 164 writes headroom. Production остался на точном SHA `f12d7c12441c3ddd710b2fd333d90ab402fa6785`.

Следующий owner no-send run `35522458529` подтвердил исправный пакет, полный scan и выключенный Telegram, но workflow упал на независимом low-priority R8.20 smoke assertion: после остальных sidecars осталось 559 reads, тогда как R8.20 запросил ещё 1200. Это корректная capacity-defer семантика R8.20, а не дефект Telegram. R6 добавляет явный owner-only validation mode: установщик всегда передаёт `isolated_telegram_validation=true`; workflow только в этом режиме выключает manual R8.20 assertion и не запускает дорогой сторонний discovery-recall observer. Единственный delivery test запускается сразу после полного Worker scan и до optional sidecars. Schedule и обычные manual runs получают прежнее значение R8.20=`1`, выполняют discovery observer и сохраняют прежний порядок Telegram слоя. Эти ветви закреплены package-static тестами.

R6 дошёл до candidate `c123a431d9eda5257b1b34dd9191a5a7af776155`: preflight `35523550365`, no-send `35523572043`, delivery `35523609289`, rehearsal `35523642974` и production no-send `35523676121` прошли. Естественные runs `35524118026` и `35524705787` завершились success. Во втором run штатный D1 budget-block пропустил отдельную строку `TELEGRAM_OUTPUT_LAYER`, но финальный `telegram_output` сохранил `enabled=true`, `info_enabled=true`, `final_chain_auto=false`, а delivery sidecar — `network_send=false`. Старый string-gate ошибочно классифицировал это как отсутствие safety-маркера и выполнил revert `06456805eded133965324b1e5786daf1ad783575` в 17:05:31Z. Rollback сработал строго по проекту и восстановил исходный tree.

R7 устраняет только этот ложный veto: standalone-строка и точный fail-closed summary считаются двумя допустимыми формами одного доказательства. Проверка требует связанных маркеров в одной строке объекта и по-прежнему отвергает fatal, unsafe network, final auto, отсутствующий runner success и все informational failure tokens. Базовый commit обновлён на точный rollback SHA; candidate production bytes не менялись.

Статистическая результативность ранних наблюдений и Decision Layer этим пакетом не доказывается. Нельзя переносить в live probability, validated signal, execution либо автоматическую настройку весов.
