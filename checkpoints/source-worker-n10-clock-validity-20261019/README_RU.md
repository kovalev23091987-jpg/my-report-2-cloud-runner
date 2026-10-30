# N10: проверять часы новой metadata, сохраняя полезный диапазон

Отдельный followup по конкретному замечанию независимого исполнителя, согласованный
координатором. Frozen PR522 `c2ee68155d137af7c1e061c43188c146a4fea453` не меняется.
Production/shared файлы и принятый runtime521 не редактировались.

Новая metadata `original_clock` из 522 прикреплялась ко всем N10 фактам.
Существующий consumer диапазона `CLOSED_CANDLE_RANGE_CONTEXT` допускает сам
полезный диапазон при некоторых несовместимых полях времени. Например, точные
сохранённые CT source/observed равны1792397520111/1792397520261; подстановка
first_known1792397520110 не меняет evidence ID или raw_hash и проходит прежние
проверки диапазона. Attachment из522 тогда переносит невозможный порядок в новую
техническую квитанцию. Это контролируемая мутация сохранённого описания,
**не доказательство повреждения native данных**. Полный исходный range evidence
и двадцать оригинальных свечей в compact ZIP не сохранены.

Исправляется одна строка в proposal: metadata создаётся только если четыре поля
имеют строгий тип safeinteger и `source <= first_known <= observed <= expires`.
Иначе `original_clock` отсутствует. Исходное evidence не исправляется и не
переписывается; пригодный диапазон, его текст, score, срок и прочие старые
условия не меняются. Глобальный validator и range describe byte-exact.
Корректная metadata сохраняется целиком. Никакого Date.now/default0/refresh.

В пакете две **альтернативные**, а не последовательные формы:

- `range-clock-validity.followup.patch`: одна строка одного файла поверх
  точного522 proposal; block-result-context afeb69e1… → a42c8145… .
- `original-clocks-cumulative.proposed.patch`: accepted521 на ee91c481 плюс
  exact522 и это исправление; две цели. HTX primary clock часть522 остаётся
  `6613c9db…` byte-exact. Не применять обе формы подряд.

Один новый связанный тест — **1 PASS / 0 FAIL**, один запуск. Внутри него
контроль корректного clock и восемь вариантов: firstknown раньше source,
позже observed, numeric string, fractional; fractional source/observed;
numeric-string/fractional expiry. Для каждого старый диапазон остаётся пригодным,
ручной отчёт и approved V5 Telegram проходят реальные formatters и audits.
Тексты и scores/trigger/targets совпадают до/после. После controlled
JSON INSERT/readback consumer также не возвращает неверную metadata. По два
mock SQL вызова на вариант, всего18; **nativeSQL0**, durable ACK не установлен.
На null/missing поля по-прежнему распространяются прежние schema-проверки;
новое условие не ослабляет их и не восстанавливает отвергнутый старым validator факт.

Тест импортирует actual current source modules, с точным522 patch в before
и одной новой строкой в after. Замыкание необходимых импортов проверено до
запуска. Полный расшифрованный runtime этим не квалифицирован. Старые8/559,
15/34/40/25+1 и другие принятые cases/suites/probes не выполнялись.
Новых sourceHTTP/nativeSQL/WS/MAIN/deploy/Telegram-network0. Сохраняются все
роли, исходные часы, стратегия/веса/формы/паузы/caps/unknown/резервы. Native
стоимость, wire/CPU/heap и суточная ёмкость здесь не измеряются.

Центральный вход — только новый `range-clock-validity.test.mjs`:
`REPORT2_RANGE_CLOCK_BEFORE=<assembled521+frozen522>/src`,
`REPORT2_RANGE_CLOCK_AFTER=<assembled521+522+followup>/src`,
`REPORT2_RANGE_CLOCK_WITNESS=<newoutput>`.
Вызывать один новый тест в следующем связанном центральном пакете; старые тестовые
модули он не импортирует. Оба варианта должны сохранять текущие прочие изменения
координатора. Временные module copies в публикуемый пакет не входят.
