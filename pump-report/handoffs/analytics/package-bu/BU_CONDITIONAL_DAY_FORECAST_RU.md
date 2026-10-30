# BU — условный бюджет полного дня10:00–20:00 МСК, версия71

Статус: **STATIC_ARITHMETIC_ONLY_NOT_ACTUAL_QUOTA**. Это арифметика над неизменёнными константами71, без импорта/запуска runtime, Node, engine, тестов, новых cases, HTTP/SQL/Telegram/build/deploy. Actual ledger не читался и не менялся. Pin `75fe60f7ddd92bc4c055a4d6865209ea0420f2218865ba6cb9a8f5e031c70e1a`; artifact SHA256 `f84700dc6bb5a6446928be5edc8e6ab04a58106774729cd2e1f2b0866339f8bf`. Точные SHA шести модулей и все величины — в `BU_STATIC_CONDITIONAL_ALLOCATION_TABLE_V1.json`.

## Когда определяется BASE

В `budget.mjs`:23–32 automaticPlan фиксирует дневной план при первом AUTO reserve. В33–70 candidatePacing вычисляет allocation, если его ещё нет; существующий дневной allocation валидируется и используется повторно. В127–131 **первый DISCOVERY reserve тоже сохраняет allocation, до increment текущего HTTP**. Поэтому начальный BASE нельзя вычислять так, будто catalog/ticker уже списаны перед freeze. Но их2HTTP обязательно входят в последующие проверки кандидата и полного дня.

В общей формуле `P` — сохранённый плановый limit, `C` — уже charged AUTO внутри него, `D` — глобальный day spend на момент первого allocation, `Bday/Bmonth/Tday/Tmonth` — provider spend. `F` — будущие light HTTP; `n` — оставшиеся часовые периоды, включая текущий. Если нового плана ещё нет, его исходный baseline `Splan` даёт:

```
P = floor(max(0, 900 - 102 - Splan) × 0.8)
102 = 54 manual-provider reserve + 24 delivery + 24 outcomes
b = min(
 floor(max(0, min(P-C-F, 900-D-102-F)) / (12n)),
 floor(max(0, 900-Bday-99-F) / (10n)),
 floor(max(0, 27900-Bmonth-99-F) / (10n)),
 floor(max(0, 27-Tday-3) / n),
 floor(max(0, 837-Tmonth-3) / n)
)
```

Для BingX99 =51 manual +24 delivery +24 outcomes. Telegram не является source для delivery/outcome context, поэтому его provider reserve здесь3. Whole-candidate bound12 включает BingX10, Telegram1 и ещё1 whole-budget для необязательного map; это не обещание вызова карты. Положительная admission/валидные policy/clock/state предполагаются формулой, а не создаются ею.

## Шесть условных строк полного дня

Только для таблицы: первый catalog в10:00 и ticker до10:05, оба вместе2HTTP; будущие119light ticks×2=238HTTP;9 будущих часовых слотов×12=108HTTP; `n=10`. До первого catalog нет сохранённых plan/allocation; synthetic global day/BingX day/month=S, Telegram day=0, Telegram month=T. Другие holds/backoff/outstanding отсутствуют лишь в модели. Это не объявление реальных unknown равными0.

| S до catalog | T за месяц | P | Frozen BASE/час при первом catalog | План нужен первому кандидату после2HTTP | Вывод только для этой модели |
| ---: | ---: | ---: | ---: | ---: | --- |
| 0 | 0 | 638 | 2 | 468 | Первый BASE forecast помещается |
| 100 | 0 | 558 | 2 | 468 | Первый BASE forecast помещается |
| 200 | 0 | 478 | 2 | 468 | Первый помещается; все20 проверок по полным12HTTP уже не гарантированы |
| 350 | 0 | 358 | 1 | 360 | Allocation1 сохраняется, но полный первый кандидат получает planned refusal |
| 0 | 815 | 638 | 1 | 360 | Telegram month снижает BASE до1 |
| 0 | 825 | 638 | 0 | 360 | Telegram month не покрывает кандидат+резервы; extra тоже не обходит этот отказ |

При BASE2 future-base protection становится216HTTP: базовые108 плюс дополнительные108 через `surplusBaseExtra`. Поэтому первый кандидат проверяет `charged2 + current12 + futurelight238 + futureBASE216 =468`. При BASE1 —360. При BASE0 guard сохраняет как минимум исходную будущую BASE-защиту; нет разрешения потратить её как extra.

Низкий synthetic baseline не даёт обещания3/час: только whole formula в первой строке дала бы3, но Telegram day ограничивает `floor((27-3)/10)=2`. Для S200 полный холодный день по верхним bounds стоил бы240light +20×12=480AUTO HTTP при плане478. Начальный allocation остаётся2, однако реальные lower costs/позднейшие capacity checks определят исполнимость; двадцать полных операций из этой строки не обещаются. Для S350 отдельно видно, что frozen logical1 не является гарантией очередного native/source допуска.

## Почему сегодняшнее1/час не переносится автоматически на новый день

Сегодняшний сохранённый base1 — свойство уже созданного allocation с его исходными baseline/часами/остатком дня, не константа71. На новом дне или при первом allocation позднее10:00 формула использует другие `C,D,F,n` и provider counters. Но после создания дневной base не пересчитывается вверх при каждом освобождении HTTP: `automatic_candidate_allocations[day]` сохраняется. Сам automaticPlan тоже не создаётся заново из уменьшившегося остатка. Actual charges, holds, unknowns, provider month/day, backoff и native capacity способны ограничить дальнейшую работу даже при сохранённых логических местах.

Carry учитывает только прошедшие периоды: `maximum=b×(elapsed+1)-issued_before`, `remaining=maximum-current_bucket.candidate_count`. Например, при b2 и0 использованных в первом часе второй может иметь4 места; заём из третьего часа не появляется. Выданное место не возвращается из-за NOT_READY, ошибки или меньшего фактического HTTP. Смена UTC-дня не доказывает доступный provider month/общий бюджет или отсутствие прежних unknown.

Conditional extra остаётся отдельным допуском: максимум24/day,1/run,200 retained records, без возврата logical_spent. Оно не увеличивает frozen BASE и не обходит whole/provider day/month,80%plan, будущие light/BASE,3manual/delivery/outcomes, OPEN/UNKNOWN и native floors600queries/600R/140W плюс finalization. Нужна собственная actual AUTO native admission с исходными clocks;200-history rollover не внедрён. Верхний предел24 не означает24 доступных extra или24 новых сообщений.

Фактическую квоту можно назвать только после нового дня, актуальных provider month/day/unknown/held и положительных whole/provider/native admissions с ACK. Сохраняются900HTTP/day,164/run, BingX27900/month,10/minute,1/second, native5000R/300W/800queries/15min, общие3.5mR/70kW и все прежние расходы/резервы. Три manual защищены прежними51BingX+3Telegram, а не пересчитаны в меньший резерв. Никакие числовые strategy thresholds/limits, business cron,9пауз и2OWNERdeferrals не менялись.
