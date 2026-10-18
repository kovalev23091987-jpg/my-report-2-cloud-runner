# Существующие механизмы и недостающие данные

Аудит на main `6f2610f30942b4eddbb0829d1ec5a5eb912d77a7`, 18 октября 2026. Только чтение кода и сохранённых доказательств, без новых рыночных запросов. Все 17 исходных файлов и их SHA256 — в `inputs.json`. `verify.mjs` проверяет неизменность и конкретные опорные утверждения; он не повторяет принятые runtime-тесты или replay CT/BR.

## Что уже можно использовать

| Механизм | Точное место | Полезная существующая роль | Предел переноса |
|---|---|---|---|
| Признаки свечи | `current-generation/files/src/opportunity-intelligence-engine.mjs`, `candleFeatures`, `scanAnomalousEvents` | Объём/median/mean/MAD, диапазон, тело, обе тени, положение закрытия; фон строго раньше события и смежный | Рабочие эвристики, не доказанная вероятность. Цвет не выбирает LONG/SHORT. Нулевая MAD даёт unknown |
| Закрытие и агрегация | Там же, `normalizeCandles`, `aggregateCandles`; `unified-entry-signal-delta/overlay/src/closed-minute-decomposition.mjs` | Проверки сетки и точное 1m→3m/5m только при полноте | Дневной HTX offset 16:00 UTC явный; нельзя молча перенести на другую биржу. Крупный native интервал не требует месяцы 1m |
| Гипотезы и эпизоды | Engine, `classifyCompetingHypotheses`, `deduplicateMarketMoveEvents` | Раздельные наблюдения и объяснения, защита от будущего контекста, объединение перекрывающихся событий | Existing cluster может объединять масштабы; новому наблюдателю нужны отдельные карточки по timeframe с общей group_id |
| Своевременное наблюдение | `prospective-opportunity-view.mjs` | Только уже обнаруженное точное HTX событие, лаг до 10 минут, receipt до 5 минут, score0 | Не универсальный ingest и не долговечная независимая очередь. Историческая находка не становится ранней |
| Исходы | Engine, `computePostEventOutcome` | Полная смежная траектория до target; unknown при пробелах; return, MFE/MAE, отсутствие направления отдельно | Горизонты 1h/4h/12h/24h/3d/7d; нет 30d/90d и нет права закрывать активное событие в 7d |
| Deep wiring | `current-generation/files/src/worker.js`, вызов `runOpportunityShadowCycle` | Передаёт фактические primary/futures/spot/external inputs | Максимум 8 вычисленных событий, 1 сохраняемое и 4 обновления исходов на Deep. Это популяция Deep, не все105 |
| Ранняя память | `selected-early-evidence.mjs`, `early-wave-continuity.mjs` | Привязка выбранной исходной волны и сохранение квалифицированного контекста | Выбор до двух ранжированных контрактов; независимый watch до top24/top2 не доказан |
| Проспективная статистика | `runner/r8-20-prospective-validation-sidecar.mjs` | Пагинация фактической истории, разные recent/retained lanes, один early outcome за цикл, отдельные entry samples | Extrema по наблюдаемым снимкам, не максимум/минимум между ними. Поздний исход требует исходной первой цены/часов |
| Долгая история | `cloudflare/free-history/hourly-archive.mjs`, `history-read.mjs` | Пакетные точные HTX снимки, payload hashes, явные gaps, ограниченное чтение до 7d за запрос | План retention270d не доказательство270d данных. Цена/rolling24h/OI/funding не OHLCV. Пагинированные месячные чтения ещё не квалифицированы |
| Относительный паттерн | `cloudflare/free-history/relative-pattern.mjs` | Сопоставленные часовые доходности coin/BTC/ETH, оба режима рынка | `report_ready:false`, score0; не ранний сигнал и не прибыль сделки |
| Адаптация блоков | `block-weight-calibration.mjs` | Ex ante фактически использованные вклады, net4h analytical return, независимые волны, 60/20/20 и 24h embargo | Минимум200/30дней/20активов/50LONG/50SHORT плюс40validation/40test. Наличие функции не означает наличие выборки; веса здесь не меняются |
| Полезность источника | `liquidation-source-weighting.mjs` | Точная операционная пригодность по активу/роли, exploration floor | Reader явно SHADOW/LEGACY_DISABLED для predictive; доступность не предсказательная точность |
| Честный знаменатель | `missed-opportunity-denominator.mjs` | Отсекает неподтверждённое направление/decision binding/неполный future path; conflict duplicates censored | Не оценивает recall всего рынка без независимого baseline всех допущенных наблюдений |

## Реальные сохранённые данные

Пакет `checkpoints/source-worker-anomaly-source-feasibility-20261018` уже принят координатором. Его исходные hashes сверены, сам replay не повторён: CT/BR содержат30 нормализованных 1m фьючерсных свечей, производные10x3m и6x5m. Совпадающего спотового окна и полного tape нет. APR/TIA в компактном артефакте не содержат оригинальных массивов свечей. Нет исходного ex ante first-known и пригодного общего знаменателя для predictive accuracy. Это исторические факты, не текущее покрытие105 и не четыре прогнозных успеха.

Естественный отчёт39128011580 с NIL OBSERVE/SENT214 доказывает основной отчёт и точную доставку своего run. Он не доказывает независимый наблюдатель, early-entry или статистическую выборку. Существующие recall1h/4h/24h имеют `BASELINE_SNAPSHOT_MISSING`; готовность prospective — `NOT_VALIDATED_INSUFFICIENT_PROSPECTIVE_SAMPLE`. Их нельзя заменить расчётом по поздно найденным победителям.

## Конкретные пробелы перед включением

1. Независимое durable событие: exact asset/native binding, рынок/контракт/multiplier/единицы, native open/close UTC и offset, raw hash/полезные числа/фон, неизменяемый first_known_ts и availability каждого факта. Backfill получает фактический момент обнаружения и отдельную группу.
2. Закрытые15m/30m/1h/4h/1d/1w с достаточным предшествующим фоном того же масштаба. Снимки105 не обнаружат все свечи большого объёма. Spot preferred/nonblocking, противоречие показывается без суммирования разных единиц.
3. Независимый active watch с восстановлением после restart; несколько эпизодов одной монеты, monotonically processed source clocks, gap accounting, исходный anchor через недели/месяцы. Ограничение очереди откладывает новые задачи, не удаляет старые активные.
4. Заранее зафиксированные LONG/SHORT условия подтверждения и опровержения. Направленные гипотезы оцениваются раздельно; выбор победившей стороны после движения запрещён. Условие в sampled price и settlement закрытой свечи — разные факты.
5. Атомарное сохранение карточки/перехода/outbox и readback, точный transition id, UNKNOWN_SEND при неопределённом ответе Telegram. Одна идемпотентная outbox сама по себе не гарантирует exactly-once network delivery.
6. Реальная retention-защита event/card/anchor/pending outcome/outbox/доказательств до записи в production. Новый event family пока не входит в общий retention; это предложение координатору, не готовая защита.
7. Поздние исходы30d/90d как отдельные точки, pending/censored/false/opposite/no-move отдельно. Lifetime зависит от класса, 7d не autoexpiry. Исторический replay — отдельная описательная группа.
8. Общие дневные/месячные/минутные residuals, next-full59000R920W/manual reserve, native row/index/CPU/byte costs и backlog age. Номинальные Paid5GB и новые provider caps не доказывают свободный бюджет.

## Следующий независимый пакет

Изолированный модуль без production imports: closed-candle detector с явной provenance и6масштабами → immutable card → reducer активного watch → честные исходы. На сохранённых реальных данных проверять только те утверждения, для которых достаточно полноты/фона. Положительные сценарии LONG/SHORT, задержки месяц, restart/gaps/dedup/no-move проверять контролируемыми данными с явным `CONTROLLED`, не выдавая за рыночную точность. Глобальный поиск provider выполняет второй чат.

## Непрочитанная граница

`opportunity-intelligence-runtime.mjs`, `fast-move-watch-runtime.mjs` и `v3-early-persistence-runtime.mjs` поставляются encrypted payload и не заменяются текущим overlay. В открытом Git видны imports/вызовы и audit receipts; полный SQL/cleanup этих модулей пока не объявлен проверенным. Запрошен уже имеющийся точный расшифрованный runtime у координатора, новый export не выполнялся. Эта граница не мешает изолированному reducer/replay.
