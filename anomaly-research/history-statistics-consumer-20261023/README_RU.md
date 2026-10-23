# Нулевое значение в существующей статистике источников

В действующем profile теряется допустимый ноль. createLiquidationSourceWeightStore.load читает p.ewma_accuracy AS predictive_accuracy из существующей таблицы. buildLiquidationSourceWeightProfile при положительном predictive_observations использует Number(row.predictive_accuracy)||null. Поэтому числовой0 превращается вNULL.

Это конкретный дефект представления producer→consumer, установленный по текущему коду main4969da83. Фактическая native-строка с нулём не читалась и такой инцидент не заявляется. Прежний тест poor accuracy проверяет вес, но не нулевое metadata-поле; его не запускали повторно.

Предложена одна локальная переменная reportedAccuracy и замена одного поля в existing liquidation-source-weighting.mjs. Допускается только конечное число от0до1. Числовой0 сохраняется при ненулевом числе наблюдений; при observations0 значение остаётсяNULL. SQL NULL, отсутствие поля, строки, пробелы, boolean, NaN, Infinity и значения вне диапазона даютNULL. Numeric text намеренно не превращается в число: producer заявляет REAL, а malformed carrier не должен создавать измеренный0.

Формулы reliability/predictiveFactor/selection_weight, порядок источников, SQL, схема и activation gates не меняются. За пределами добавленной переменной и metadata-поля полный исходный файл восстанавливается точно. Прежние SQL literals SHADOW/LEGACY_DISABLED и запись factor1/eligible0 сохранены. Shared runtime автором не менялся; здесь только TEXT-предложение и patch.

## Реальный путь потребителя

Runner создаёт createLiquidationSourceWeightStore на существующем DATA_DB. combined-runner-service читает healthRows через store.load, передаёт их planLiquidationSourceOrder, а тот — buildLiquidationSourceWeightProfile. Готовый profile уже находится в source_weighting.profile действующего summary. Правка меняет представление одного значения в этом существующем поле; новый отчёт или Telegram-форма не добавляются. Точные участки и хеши — producer-consumer-evidence.json.

## Какие совокупности нельзя смешивать

Принятые37контрактов/111рядов/3274находки/13096описательных ячеек прочитаны как сохранённая справка. В accepted-history-reference.json скопированы готовые panel fields и исходные cohort clocks, без повторного исследования. Для каждого timeframe остаётся свой eligible_windows;11 недостаточных недельных рядов не превращаются в нулевые находки. Эти ряды и пересекающиеся окна не являются независимыми прогнозами, current105 покрытием или оценкой точности.

Operational role utility относится к exactasset/role/source/priorrun и известному расходу загрузки. Explicit actual_http0 допустим для повторного использования; NULL остаётся неизвестным расходом. Этот путь и его приоритеты не меняются.

Исправляемый scalar — legacy source EWMA при существующем числе observations. Само число не доказывает независимый знаменатель, точный исходный window/asof, полную ценовую траекторию либо net profit. В legacy агрегате нет полного fee/slippage/funding accounting и точного source-fact cohort; вернуть0 вместоNULL не значит оценить прогностическую точность. Популяции и ограничения перечислены в source-populations-contract.json.

## Одна новая проверка для координатора

observed-zero-profile-case.proposed.mjs экспортирует runObservedZeroStatisticsProfileCase({repo_root}). Это один новый callable,1group/16типовых вариантов, UNEXECUTED. Он проверяет полные applied target/context hashes, использует настоящий store.load→buildLiquidationSourceWeightProfile, подставляет только CONTROLLED ответы DB methods и сверяет metadata вместе с неизменностью остальных profile-полей.

Вызовы prepare/batch/all в случае — методы CONTROLLED driver, SQL engine не запускается. Полный main, provider acquisition, settlement, старые policy/study/geometry/weekly/anomaly/journal/projection cases не вызываются. Даже вход с observations200 — контрольная декларация, а не200 принятых native наблюдений. Raw current native cost остаётся неизвестным.

Автор выполнил только текстовые/JSON/SHA проверки. Node/import/syntax/tests/nativeSQL/provider/CF/dispatch/MAIN/Telegram0. Runtime, веса, main, общие статусы и frozen631/logging37 не менялись. Будущий результат общего запуска и внедрение принимает ROOT. Этот пакет не объявляет весь блок статистики или HISTORY_TYPED_CONSUMERS завершённым.
