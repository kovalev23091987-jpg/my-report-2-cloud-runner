# AS — edgeX V2 settled funding → optional consumer

**Рекомендация: сейчас не тратить новый actual-допуск на cold2GET.** Raw fraction-vs-percent serialization не доказана, а практическая возможность получить settled-строку в текущем пятиминутном окне пригодности не установлена. Документальный факт другой площадки потенциально добавляет контекст к рабочему BingX, но дополнительная польза для отбора/плана не доказана. F580 отдельно проверяет только документацию шкалы; AS её не ищет и не принимает самостоятельно.

Проверены frozen F579 manifest SHA `cf08104dc8cdfe6c06172183a482cd9b5c554d42eb4ccc0900bb72bf290b8fb3`, hashes всех7 payloads и по существу только EDGEX_V2 fields/единственный bounded proposal. Действующие consumer/contract/profile взяты в main `d9e1d07a7cc31465dacadc2135be29614c73063f`; funding ветка analytics/context.mjs:74–81, общий usable:4, factUsable contracts/index.mjs:58–59, funding TTL300000ms. Старые AR/AQ/actual не проверялись.

## Поля и допустимая нормализация

| Поле | Смысл и обязательная граница |
|---|---|
| fundingRate | Сохранить raw decimal и exact field/serializer evidence. Пока шкала UNKNOWN, нельзя назначить RATE_FRACTION_PER_ACTUAL_PERIOD или переводить raw в проценты по величине примера. Consumer сам умножает нормализованную fraction на100 |
| fundingRateIntervalMin | Фактический период именно этой строки. После доказанной нормализации minutes → period_ms=minutes×60000; конечное положительное значение и period_ms≤86400000. Для row240min это4h, не глобальные8h. Не годовая/next-period ставка и не агрегат из двух строк |
| fundingTimestamp | Source calculation clock, integer epoch milliseconds. Это event_ts; повторное получение, responseTime и settlement time его не заменяют |
| fundingTime | Отдельный native settlement clock; сохранить raw и его доказанную интерпретацию. Формат/единица строки не угадываются. Он не продлевает возраст расчёта |
| isSettlement | Проверить settled-значение в фактической строке по точной vendor semantics; query filter=true сам по себе не доказывает каждую строку. Future/contradictory settlement не называть уже состоявшимся |
| Identity/provenance | Native edgeX contractId/name/family, canonical underlying join, native quote/settle и venue сохраняются. Исторический4STOCK overlap не current native identity. Не подменять ими BingX или USDT; rate — безразмерная доля за native период, а не конвертация quote |

К этим полям нужны original receive clock, expiry, source/primary_provider, field/route/units evidence, settlement/calculation provenance и coverage выбранной строки. Время сохраняется в Fact, дополнительные native поля — в original provenance/coverage. Generic envelope это допускает; новый контракт не требуется.

## Когда settled history действительно пригодна

Обозначим C=fundingTimestamp, R=оригинальный received_ts, T=analysis_ts, E=expires_ts. Помимо qualified value/unit/status consumer требует:

`C ≤ R ≤ T; T − C ≤ 300000ms; T ≤ E`.

Все используемые clocks должны быть пригодными integer milliseconds. Значит фактическое окно использования — **от получения R до min(E,C+5min)**, если оно непустое. При доказанном settlement time S и фактической доступности после settlement окно дополнительно начинается не раньше S; settled-claim требует непротиворечивого прошлого settlement.

Если settled-строка становится доступна только после C+5min, она уже никогда не пройдёт этот профиль как свежий funding факт этого расчёта. Даже мгновенная загрузка после позднего settlement этого не исправит. Если C близок к S и получение своевременно, уже пригодный кандидат может использовать её лишь в остатке окна до C+5min. Новая загрузка не выдаёт ещё5минут.

**Период начисления240min не доказывает cadence расчёта/публикации или задержку C→S.** Нельзя обещать свежую строку каждые4h, придумывать частоту полезных окон или процент времени пригодности. F579 не устанавливает реальную задержку публикации и совпадение с analysis time рабочего кандидата. Если свежего окна нет, исторический settled record остаётся историей; TTL/профиль ради optional строки не увеличиваются.

## Смысл consumer и польза

Существующий value=`{rate,period_ms}` подходит **условно**, после точного scale proof и остальных source qualifications. Он формирует FUNDING_SNAPSHOT: процент за фактическое число часов, явно source/venue-specific, без направления будущей цены. Для этого пути допустимый смысл — **опубликованная уже settled ставка edgeX за её фактический период, с возрастом от calculation clock**. Это не текущая/будущая/next-period ставка BingX или edgeX, не ожидаемый платёж и не обещание движения.

Текст generic consumer не имеет отдельного phase/settlement-clock поля и retained optional_context оставляет только rate/period. Поэтому settled-смысл должен оставаться однозначным через уже существующий source identifier/provenance, например именованный settled-funding-history producer из proposal; иначе нельзя представлять generic строку как доказательство current/next rate. Показ двух clocks отдельными строками текущий renderer не обещает. AS публичный текст/формат не меняет. Конкретная несовместимость сейчас — **непроверенная шкала raw rate**, а не отсутствие schema для периодной fraction.

Относительно BingX это может дать только отдельный venue snapshot для доказанно того же underlying. Сам по себе знак/уровень settled ставки не создаёт направление, READY, подтверждение плана или независимый прогноз; история и ticker той же edgeX линии не два голоса. Абсолютная сопоставимость quote/settle не выводится из rate/name. При отсутствии дополнительной информации или свежего пригодного окна маршрут не оправдывает новый расход.

Cold2GET proposal умеет проверить доступ/форму/стоимость максимум двух settled rows; он **не доказывает** serialization/identity из значений и не является нормализатором/actual admission. V2/no-auth docs не равны current native/free access или выданной quota. ROOT отдельно решает цену/допуск; optional upper2 не увеличивается. До scale proof и содержательной возможности применить свежий settled факт **оставить маршрут выключенным и не выделять actual только ради заполнения optional поля**.

Imports/tests/web/provider/RPC/SQL/TG/Worker/observer/стратегических пересчётов — 0. Contracts/profile/strategy/public text/routes/runtime/producer не менялись. Карты0 и all550 NOT_CHECKED; отсутствие карты или этого funding не gate основного отчёта. Исходные0674/unified384e, spent/unknowns/резервы/caps/9 пауз/2 OWNERdeferrals сохранены. Один freeze и отдельная своевременная own release.
