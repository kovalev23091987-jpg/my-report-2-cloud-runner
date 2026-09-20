# Финальный технический отчёт

## Статус

`READY_FOR_OWNER_RUN`

Production на момент отчёта не изменён. Пакет подготовлен для одной защищённой команды владельца.

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
2. **ТЕСТ ПРОШЁЛ:** да, 17 SQLite/runtime, полный D1 bridge preflight E2E, 4 schema/contract, 7 owner-safety, 4 package-route, final-chain regression и 22 targeted baseline tests.
3. **ЛОКАЛЬНАЯ ИНТЕГРАЦИЯ ПОДТВЕРЖДЕНА:** да, реальная SQLite DDL, две соединённые сессии, restart и failure injection.
4. **PRODUCTION ПОДТВЕРЖДЁН:** нет; production не менялся. Это проверит owner chain после запуска команды.
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

До owner run не доказаны текущая удалённая D1 schema/readback, реальная тестовая доставка кандидата, exact production SHA и три естественных production-цикла. Установщик проверяет эти пункты последовательно и завершает работу без заявления успеха при отсутствии доказательства.

Remote preflight `35521643482` полностью прошёл. Последующий no-send run `35521665753` также завершился `success`, ничего не отправил и сохранил live-функции выключенными. Owner gate затем выявил ошибку proof-представления: при D1 budget-block fallback не переносил фактические `enabled=false` / `info_enabled=false`. Исправление формирует proof из реальных env-gates и использует bounded informational envelope 1536 reads / 4 writes; наблюдённый run имел 2462 reads и 164 writes headroom. Production остался на точном SHA `f12d7c12441c3ddd710b2fd333d90ab402fa6785`.

Статистическая результативность ранних наблюдений и Decision Layer этим пакетом не доказывается. Нельзя переносить в live probability, validated signal, execution либо автоматическую настройку весов.
