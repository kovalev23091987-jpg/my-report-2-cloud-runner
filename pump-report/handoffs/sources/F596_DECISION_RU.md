# F596 — геометрия 0xArchive и сохранённая идентичность HYPE

Подготовлено 2026-10-26 13:50:59 UTC. Пакет доказательств для ROOT; адаптеры и активация источника не менялись.

## Результат

Operation reference и JSON Schema подтверждают центры корзин. Для сохранённого запроса `range_pct=50,buckets=100` точные границы, ширина выходной корзины и её выравнивание не доказаны. `source_bin_width` относится к сохранённой histogram; старый ответ `source=raw` этого поля не содержит. Границы по расстояниям между центрами не восстанавливались.

USD явно указан для модельного notional. Валюта цены маршрута остаётся UNKNOWN по просмотренным первоисточникам. Пересчёт в USDT не применялся. Operation schema указывает premium cost без численного значения: прежние «1 credit» требуют согласования до нового допуска.

Источники: [operation](https://docs.0xarchive.io/api-reference/hyperliquid--liquidations/get-hyperliquid-liquidation-levels), [schema](https://docs.0xarchive.io/schemas/operations/get-hyperliquid-liquidation-levels), [conventions](https://docs.0xarchive.io/rest-api/conventions). Поля и пределы вывода: F596_PRIMARY_DOC_PROOFS_V1.json.

## HYPE

Проверены сохранённые классификация, ROOT per-tuple decision и исходная metadata. BingX contractId100877 и metadata coinId2338 принадлежат разным namespace. В строке есть HYPE/name/display и icon URL; нет полного имени проекта, сайта, сети, token contract или общего canonical asset ID.

Принятая экономическая классификация и точная same-venue привязка не доказывают межбиржевой canonical join. Связи BingX HYPE ↔ 0xArchive HYPE и BingX HYPE ↔ Coinversa HYPE остаются UNKNOWN. Символ, иконка и внутренняя таксономия Coinversa квалификацию не повысили.

## Возможный контекст

Контекст в валюте источника в принципе полезен без USDT-конверсии, если отдельно доказаны идентичность, единицы и допустимый возраст. Представление центров и модельной экспозиции требует решения ROOT/ANALYTICS и не даёт исполнимых цен BingX или выдуманных зон. Сейчас кандидатная привязка не квалифицирована.

Снимок HYPE от11:48:21UTC — только устаревшее доказательство формата. Computed clock не доказывает свежесть исходных позиций; actual base-state time неизвестен. Модель Hyperliquid не является позициями BingX.

## Минимальный следующий шаг

Профиль разделяет шесть предикатов: canonical entity, валюта цены, геометрия, базовые часы, свежий actual и фактический бюджетный допуск. Новый IO требует отдельного допуска. Остаток2 квалификационных попытки сам по себе не разрешение.

После появления пригодных доказательств — один общий batch join для выбранных550; ручные500 конфигураций и поштучные probes не предлагаются. F592 матрица не пересчитана: canonical UNKNOWN550 и qualified maps0 не повышены.

DOCS-грант закрыт: 2 поиска без результатов и3 успешных чтения. Новых market/API/MCP/account/SQL/TG/продуктовых тестов/деплоя —0. Потраченные лимиты, unknowns, резервы,9 пауз и2 OWNER deferrals сохранены. LIVE68/AUTO/DELIVERY не изменялись.
