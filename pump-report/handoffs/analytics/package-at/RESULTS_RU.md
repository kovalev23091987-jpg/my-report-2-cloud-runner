# AT — два новых реальных production originals: KIMCHI/APR

**Оба отказа полностью воспроизведены. Конкретных несовпадений нет.** Выполнены ровно два вызова принятого AG reader и два pure callbacks — по одному на KIMCHI и APR. 1INCH, fixtures и старые suites не запускались.

| Original | Полный analysis/plan/reasons | Card | Результат |
|---|---|---|---|
| KIMCHI, PRODUCTION/MANUAL | Полное serialized equality с immutable original и независимыми public hashes | Оба card_text=NULL, card digest отсутствует; это не проверка готового текста | ready=false, automatic_eligible=false, CURRENT_ACTIVITY_NOT_CONFIRMED |
| APR, PRODUCTION/MANUAL | Полное serialized equality с immutable original и независимыми public hashes | Оба card_text=NULL, card digest отсутствует | ready=false, automatic_eligible=true, PLAN_POTENTIAL_BELOW_OWNER_MINIMUM; вычисленный conservative plan minimum<10 подтверждён, значение/price levels в public handoff не выносятся |

KIMCHI: сохранённые данные и прежние правила не подтвердили текущую активность; повторный расчёт не создал пригодную карточку. APR: автоматическая квалификация волны сама по себе сохранилась, но консервативный потенциал плана остался ниже принятого владельцем минимума. Поэтому отказ публикации воспроизведён. Порог, коэффициенты, стратегия и исходные часы не менялись.

Выбран точный **receipt65 business artifact**, SHA256 `04203d493039d1bad3184951e48ddfe95b4d72f8d7c31f812592cfc85bfa979d`, pin `e75ecbf4a733202ba0864fae418a1986bce7e484c88420867b0f4976a0f75b8a`. Pin совпадает с обоими originals и двумя public confirmations; его digest независимо пересчитан из module map. Другой launch65 с pin5a2c не использовался. Все65 module bytes/hashes сверены с manifest; исполнены только 12 модулей чистого dependency closure analytics/contracts/profile, извлечённые в private snapshot. Runtime/SOURCE/provider/store/delivery не импортировались и не исполнялись. Принятый AG reader SHA `b643de03fa3fc0006466b95ad5d6b1572103e21932b395f3a2ad0d6546b3c2c8` не менялся.

Каждый callback получил исходный input.analysis_ts и профиль этого artifact65; profile value SHA256 `e557b045ce0c178d3b5fc54b47c65ee0b777335c6bfdcd8e051dc167d7173b5d`. Проверены полное равенство анализа, планов, причин, NULL card state и неизменность переданных input/profile copies. Analysis hashes повторного расчёта совпали с independent public readback:

- KIMCHI: `f1a1f095454341529a2310c571cf8b6b28b965249bdf24cb0cfc9a45ee836fea`.
- APR: `7b35354c5707be64dca009e050dd19efe157f862172c20a8bb64b979a2f8d745`.

Outer capture bytes, original/input/analysis hashes сначала связаны с ROOT_SECOND/THIRD_PRODUCTION_MANUAL_ACTUAL.json, затем AG reader получил каноническую launch_capture из тех же bytes. Источник body bindings — JSON.stringify уже сохранённых broker parsed full envelopes, **не исходные wire bytes**. Проверены 3 consumed source bodies для KIMCHI и4 для APR; семантика vendor/полнота истории заново не квалифицировались. Private captures и approved reader после replay сохранили SHA. Raw prices, inputs и plan levels остаются private.

AT добавляет две ранее отсутствовавшие независимые pure-проверки к принятому AG/1INCH; сам AG не повторялся. ROOT может обновить узкий учёт independent original matches с сохранённым прежним результатом. Это корректность **двух исторических отказов** на зафиксированных реальных данных — не доходность/вероятность, не READY/SENT, не новый текущий сигнал и не coverage550. Нового пригодного AUTO/SENT/outcome здесь нет; публикационный/native допуск reader не выдаёт.

Новых HTTP/RPC/SQL/TG/Worker/deploy — 0; сохранённые native/provider расходы не пересчитывались и не возвращались. Код shared ROOT/SOURCE, стратегия, public text и старый reader не менялись. Native HTTP запрещён preload guard; bare/dynamic IO dependencies внутри pure closure отвергались до импорта. Private snapshot сохраняется для review, без raw export. Старые spent/unknowns/резервы/caps/9 пауз/2 OWNERdeferrals и исходные0674/unified384e сохранены. Один freeze и своевременный own release.
