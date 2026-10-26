# AW — ёмкость сегодня и первый фактический AUTO банка

**Ожидание1место/час на8 периодов подтверждено сохранёнными native metadata первого AUTO.** Это приёмка банка в прочитанном запуске, а не полная приёмка стратегии,550CORE или SENT. AW не выполнял новый LOOKUP, market/source collection, callbacks, imports проекта, tests, deploy или правки ROOT.

## Расчёт на26 октября,12:10МСК

Исходный snapshot SHA1b0312…: день355HTTP, BingXmonth385, automatic plan limit634/charged350/baseline5, unknown2, outstanding0, allocation ещё отсутствует. Сохранённый automatic limit634 не пересоздаётся и не умножается ещё раз на80%.

До20МСК остаётся8 часовых периодов. Текущий scan стоит2HTTP. Будущие слоты09:15–16:55UTC:93×2=186HTTP; текущий tick не входит. До текущего scan automatic remaining634−350=284.

Формула initial base по automatic allowance: floor((284−186)/(8×12))=1. Остальные ограничения не ужесточают результат: globalday даёт2/h, BingXday3/h, BingXmonth340/h, Telegramday3/h, Telegrammonth104/h. Минимум —1. Allocation создаётся первым DISCOVERY, не первым кандидатом; first_period09:00UTC, remaining_periods8, whole upper12=BingX10+TG1+непривязанный map1.

После текущих2 остаётся282:186 future scans +96 на все8 целых проверок. Семь будущих full slots защищают84HTTP отдельно от текущего кандидата12. Консервативный automatic остаток сверх этой модели0. Это capacity, не обязанность найти/проверить8 и не разрешение на новые провайдеры. Карты фактически не допущены, но их непривязанный1HTTP/кандидата удержан в upper12.

Отдельно защищены3manual:51BingX+3TG; delivery24 и outcomes24 —102HTTP всего. Worst envelope с текущим snapshot: global355+188scans+96full+102fixed=741≤900; BingXday722≤900, BingXmonth752≤27900; TGday11≤27/TGmonth13≤837. Unknown2 уже сохранены в исходных расходах, их нельзя вернуть или прибавлять повторно как новые попытки. Это проектный ledger, не полный расход аккаунта и не бюджет всех будущих календарных дней.

## Сопоставление с фактом

Второй private capture SHAb3481f… содержит сохранённый run08029a99-7574-43ef-aebd-2ce125a5350b с новым pin3f872be… и saved_original_bound=true. Allocation создана12:10:50МСК: remaining8, base1, whole12, BingX10/TG1, first_period12:00МСК, baseline_auto_charged350 — всё совпало с расчётом.

Первый KIMCHI: READY=false, CURRENT_ACTIVITY_NOT_CONFIRMED, liquidity=INSUFFICIENT. Выдано1 место, remaining0, never_refunded=true; bucket candidate_count1/charged4. Физически6HTTP:2DISCOVERY+4CORE, TG0. День361, BingXmonth391, automaticcharged356, unknown2, outstanding0. Неиспользованные8HTTP первого upper12 не возвращают потраченное место.

APR сохранён отдельно как DEFERRED/NOT_CHECKED/PROTECTED_DAY_RESERVE, detailWHOLE_CANDIDATE_PLANNED_ALLOCATION. После6HTTP automatic remaining278, а ещё один whole forecast потребовал бы12+186+84=282. Поэтому данный guard срабатывает раньше проверки часовой квоты. Это ожидаемый budget deferral, а не исключение или вывод о непригодности APR. Run INCOMPLETE также содержит9source-evidence deferrals и20unresolved catalogue rows. Он сохранён, executor COMPLETED_RUN_AVAILABLE/owner=null. Отсутствие TG при READY=false не означает неисправность доставки.

## Риски и следующие наблюдения

Нулевой банк на сегодня в факте НЕ возник: persistedbase1. Узкое место до первого сохранения было конкретным: на12:10МСК automaticcharged353 (ещё3 до первого DISCOVERY при том же будущем расписании) дал бы floor((634−353−186)/96)=0; сохранённая нулевая allocation сама не пересчиталась бы позже. Наблюдавшийся baseline350 прошёл этот порог. Это условие чувствительности расчёта, не обнаруженная поломка данного AUTO и не основание менять состояние AW. При первом scan12:15/12:20 с тем же charged350 base тоже1, а пропущенные обзоры не считаются потраченными.

После потраченного места первый текущий час не имеет carry. В13МСК ожидается одно новое место; если оно не использовано, в14МСК возможно2. Будущие часы не заимствуются. Накопленные места не гарантируют времени на полные запросы при откладывании до последних минут20МСК: source TTL, minute caps, run envelope и окно остаются ограничениями. Старые отказавшие кандидаты не должны считаться новыми готовыми идеями; возможную монополизацию очереди проверять отдельным AX, без нового ядра.

## Условная модель полного27 октября

При отсутствии ранних расходов новый день имеет baseline0 и limit floor((900−102)×0.8)=638; месячные counters и unknown не обнуляются. Первый обзор2 плюс future238=240. Automatic bound3/h, projectday4/h, BingXday5/h; **Telegramday floor((27−3)/10)=2/h** ограничивает base до2. Полных мест максимум20, upper240HTTP; scans+full480, automatic margin158. Fixed включённый global envelope582; BingXday539, TGday23. Даже с консервативным сегодняшним расходом месячные примеры BingX1291/TG36 значительно ниже caps, но завтрашняя allocation ещё не наблюдалась. Пустой первый час при base2 должен дать4 места во втором; forced selection не требуется.

Точные скаляры, формулы и все metadata match conditions — capacity-arithmetic.json. Условия первого нового AUTO, которые уже наблюдены: exact current pin/original binding, persisted allocation8/base1/upper12/baseline350, квота1 без refund, charge6, unknown2/outstanding0, отдельный deferral и завершённый executor. Не наблюдены AW: завтрашний base2, будущий carry и отсутствие монополии очереди. Новых native операций для их проверки AW не выполнял. ROOT исходные LOOKUP receipts перечислены только как переданные расходы; остаток LOOKUP не является новым допуском.
