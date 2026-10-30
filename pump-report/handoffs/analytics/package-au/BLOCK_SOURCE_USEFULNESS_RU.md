# AU: полезность источников для пяти действующих блоков нового отчёта

Локально исправлена потеря уже рассчитанной ликвидности при отказе: analytics/index.mjs теперь сохраняет liquidity вместе с fact_id/source_ts исходного стакана. Одна разрешённая проверка на новом точном KIMCHI AUTO дала PASS_EXPECTED_LIQUIDITY_ONLY_DELTA. Все остальные поля полностью совпали с сохранённым оригиналом. Полученная ликвидность INSUFFICIENT; READY=false, исходные причины, план, card=null, manual_text и часы неизменны. Это qualification нового consumer delta, а не повторное принятие всего оригинала или новый сигнал. Исправление не опубликовано и не deployed.

## Пять действующих блоков

| Блок ТЗ v2 | Фактическая полезность и пробел |
|---|---|
| 1: цена, объём, движение — обязательный | BingX bulk даёт цены550. Свечи питают рост, волну, активность и план; это переиспользование одного факта. ROOT связал10 уникальных production CORE;540 ещё не доказаны CORE. Семантическая пригодность541 не означает полный свежий анализ541. |
| 2: исполненные покупки/продажи — дополнительный | Существующий BingX trades consumer пригоден условно, но ранний ready-only gate исключает его из проверенных AUTO отказов. Реальных supplemental запросов в наблюдаемом AUTO0. Подготовлен точный, не применённый4-file proposal для одного selected кандидата с подтверждённым ростом, пригодной ликвидностью и единственным мягким отказом активности. |
| 3: ликвидность/исполнение — обязательный | Стакан с доказанной COIN/base семантикой используется. Пригодный факт не гарантирует достаточный размер исполнения. AU сохраняет уже рассчитанный результат отказа вместо null. Для проверенного KIMCHI insufficient: сделки и карты не устранят этот жёсткий недостаток. |
| 4: OI/funding — дополнительный | Парсеры существуют, но в текущей фабрике registry нет квалификаций единиц OI и source-clock/period funding. До запросов NOT_CHECKED. Это незавершённая настройка, а не COMPLETE или доказанная бесполезность. |
| 6: будущие ликвидации — дополнительный | Есть ветки адаптеров, но0 активных квалифицированных routes,0 actual maps; production policy допускает только BingX/Telegram. Для550 NOT_CHECKED, не UNSUPPORTED. Отсутствие карты не блокирует пригодный независимый план. |

Блок5 отменён владельцем; блок7 — после запуска. Порог консервативного плана≥10 и требования текущей волны/активности сохранены. Полная глубокая проверка включает больше mandatory CORE. Необязательный блок не обязан запрещать публикацию, но от этого не становится выполненным.

## Что передать ROOT

Подробная матрица из13 строк: block-source-matrix.json; пять блоков и ссылки на ТЗ: active-five-blocks.json. Конкретный runtime/source/consumer proposal: ROOT_BLOCK2_SELECTED_SUPPLEMENT_PROPOSAL.diff и ROOT_GATE_AND_BLOCK2_PROPOSAL_RU.md. AU не изменял общие ROOT/SOURCE файлы. Native proposal в ROOT_BLOCK2_ONE_SELECTED_EXISTING_ROUTE_PROPOSAL.json имеет NOT_ADMITTED/NOT_EXECUTED; только новый contemporaneous selected кандидат, новый exact admission ROOT, максимум1 существующий BingX GET внутри прежнего upper2. Текущий KIMCHI нельзя отправлять этим путём из-за INSUFFICIENT; PLAN_INVALIDATED также нельзя оживлять optional контекстом.

SOURCE F583 frozen packet получен при финальной сверке: SHA9ac424e202d5907108e7a2cf84fb9cb10b57c9fcf1d16dac2dcf03d84bc27dee; все7 payload hashes/bytes совпали. Его catalogue/provider audit не дублировался. Подтверждены10 production CORE/540 NOT_CHECKED/541 semantic+9 deferred/0 maps. SOURCE предложил один HL SOL account route со статусом HOLD до exact prerequisites, новым охватом0 и без admission; он относится к карте, AU proposal — к существующим BingX сделкам. Ни один маршрут AU не запускал. Здесь доказана точная текущая композиция/consumer path и ограниченные actual inputs ROOT, а не свежая полная provider coverage550. Семь других originals записаны только как metadata ROOT, без повторных ядер/переаудита. Исходные приватные значения не экспортированы.

Whole-day budget metadata сохраняет charged/unknown/reserves и пределы применимости: ROOT capture не закрывает весь аккаунт. Защищённые future scans/hourly full/3manuals не потрачены AU; остаток не является admission. Native market/RPC/SQL/TG/Worker/deploy/CONTROL0. GitHub guard/own lease control-plane использован отдельно. Дополнительных callbacks, fixtures, suites и старых AT/AS/AR replay0. Новых чатов, субагентов и автоматизаций0. Старый отчёт/9пауз/2OWNER deferrals сохранены.
