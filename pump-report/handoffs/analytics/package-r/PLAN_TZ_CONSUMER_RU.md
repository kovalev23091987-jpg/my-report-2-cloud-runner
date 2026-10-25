# R — до патча: положительный consumer относительного ценового контекста

Прямое задание ROOT, свежий main `cd32febb6be71e804b63f30e0299b6468a9c6dcd`. ТЗv2 SHA256 `0674adf8bef087f63ddac8214b8e650ae14410f33970ed4f869c5ab2564975cc`. Только свой analytics/context+index, новые tests/handoffsR. ROOT-владение contracts/profile/runtime, SOURCE делает отдельный producer. NativeIO/SQL/TG0.

| Буквальная строка ТЗ | Ограниченный результат R |
|---|---|
|75: «Сила монеты относительно рынка… Дополнительный» | Сопоставление пригодных доходностей; не новый обязательный gate и не самостоятельный сигнал |
|117–141: инструмент/единицы/часы/происхождение; отсутствие не0 | Нормализованный факт и каждый leg проверяет ROOT qualifyRelativeContext; непригодный контекст→null/window и reason |
|65: падение всего рынка не запрещает сигнал | Знак BTC/ETH не меняет readiness/plan/порог |
|889: «Пригодные расчёты относительной силы… Сделать дополнительными» | Invalid/absent optional не блокирует пригодный основной план |
|811–817: подтверждённые выводы и главные основания | Старый код RELATIVE_RETURN остаётся возможной второй причиной через P/Q selector, без causation/вывода о намерениях |

До патча прочитан опубликованный ROOT `contracts/relative-context.mjs`: schema=BINGX_CLOSED_RETURN_CONTEXT_V1, unit=RETURN_PERCENT_SAME_WINDOW; price_basis=EXACT_CLOSED_1M_CLOSE_TO_CLOSE; 1m/CCXT consumer time; начальная producer-реализация SOURCE использует5мин. Consumer доверяет только valid-результату этого общего квалификатора с явными instrument/as_of_ts/profile.freshness_ms.market_context=90000. Его допустимые5/15/60мин не расширяются локальным обходом. Контракт/профиль не редактировать.

Семантика результата:

1. При valid сохранить полные возвращённые ROOT qualified legs с instrument identity/исходными fact_id/ценами/временем/базисом, общий start/end и исходный Fact provenance/event/received/expires/evidence_ref.
2. Coverage BTC_AND_ETH либо ONE_BENCHMARK и independent_venue_count=1 сохраняются. ONE_BENCHMARK→partial=true и явная короткая отметка одного ориентира. Количество legs не число независимых источников.
3. Текст использует только candidate и пригодные benchmark returns за exactsamewindow, проценты сверены квалификатором с first/last ценой. BTC/ETH здесь ориентиры, их уведомления по-прежнему запрещены.
4. Old label-only/value schema, неверные roles/identity/return, future/asynchronous windows/basis/clock и malformed legs не дают RELATIVE_RETURN или пригодный optional_context.market_context. Отдельный relative_context_diagnostic содержит valid=false, reason, null start/end, пустые returns; исключение квалификатора также NONBLOCKING.
5. Никаких confidence/score/causation/нового сигнала. Численные strategy/readiness/plan/min10/FX exclusions/BTCETH/rules/P0/t0/target/wave clocks неизменны. SOURCE-подключение, native data и полезность калибровки здесь не заявлять.

Старые P/Q манифесты/артефакты не переписывать. До-R context/index сохраняются как beforeoracles; остальные файлы сравнить с exact current main. Новый набор: positive2bench, positive1bench, wrongrole/identity/return, oldschema/future/asynch/basis, один connectedcard/mandatorygates. Дополнительно ровно один affected P06 relative fixture адаптировать в НОВОМ R-тесте к новому контракту; исходный P-тест и frozen proofs не менять и wholeP/Q не повторять. Freeze точные SHA/proofs/limits, своевременный ownrelease≤35мин/FULLreadback.9пауз/2OWNERdeferrals и расходы/unknowns/reserves сохранены.
