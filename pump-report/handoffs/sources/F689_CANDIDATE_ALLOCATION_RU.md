# F689 — точная причина отказа ON

**В сохранённый момент13:30:52.938МСК новый кандидат превышает planned allocation на1HTTP:**

195charged +12candidate +62CLOSEDhold +154future discovery +216future candidates = **639 >638**.

Остаток638−195=443; защищено62+154+216=432; для нового кандидата доступно11, требуется12. Limit638=floor((900−102)*80%).

62hold=108original−46consumed. Providerостатки44BingX+9TG дают53, ещё9 — сохранённый unassigned optional-map reserve. Все85retained grants CLOSED, today9; старых OPEN/UNKNOWN surplus holds нет. Два unknown request keys этим не обнуляются.

Discovery:77 будущих5минутных ticks13:35→19:55 ×2=154. Future candidates:6часов14→19 ×12=72 +baseExtra(3−1)×72=144; всего216 для18будущих base places. Это не двойной учёт одной позиции. Consumed46 повторно вholds не добавлен; fixed102 повторно вplanned не добавляется.

Отказ срабатывает budget.mjs:191 до pacing/provider checks. Current3base/hour уже использованы, но emitted cause именно planned639>638. Поэтому surplus branch для EVEN_DAY не достигается. Queue12/checked0 — не исчерпание источников и не Telegram failure.

Другие контрольные прогнозы не упираются в cap: project742/900, BingX680/900, TG34/47. Это не новая свободная квота. CLOSEDholds/80%/3manual/caps не меняются.

Дефект двойного счёта не установлен. Следующий5мин tick не обязан помочь:charged+2 иdiscovery reserve−2 взаимно компенсируются. В14МСК future base reserve условно уменьшается на36; при остальных неизменных данных forecast603≤638, но остальные actual gates сохраняются. Частота/стратегия не меняются, дополнительный сбор не нужен.

Минимальное полезное улучшение — существующая aggregate-диагностика сразложением иdeficit1, без новойоперации. Полный расчёт иSHA вJSON. SOURCE Node/native/CF/provider/TG/main:0; всеunknowns/holds/резервы/9пауз/2OWNERdeferrals сохранены.
