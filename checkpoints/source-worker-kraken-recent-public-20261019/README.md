# Kraken RECENT_PUBLIC: ещё один bounded N12 carrier и точный scope N10 guard

Подготовлен отдельный provider normalizer/верификатор на **сохранённых** DOT/ATOM телах38066590063. Не запущены новый REST/WS/SQL и прежние квалификации. Frozen504/505/507 и их code/test файлы не менялись. Этот carrier не вызывает full240/SINCE normalizer и не ослабляет его: HTTP запрос с since здесь, наоборот, отказывается как другой тип входа.

Положительные исходные сведения:

| Поле | DOT | ATOM |
|---|---|---|
| Exact pair | DOTUSDT / DOT/USDT | ATOMUSDT / ATOM/USDT |
| HTX native chain | polkadot:mainnet, dot1 chainType0 | cosmos:mainnet, atom1 chainType0 |
| API receipt |1791648649620 |1791648650537 |
| Последняя выбранная сделка |1791648486861 |1791648477674 |
| Исходный cutoff |1791648600000 |1791648600000 |
| Последние закрытые5m trades |8 |4 |
| Число строк всей страницы |1000, saturated |1000, saturated |

Окно привязано к исходному плану batch, а не вычислено из последней сделки. Точное request URL — `/0/public/Trades?pair=...USDT&count=1000`, без since. Времена source/received/known различаются. Тела и квитанции двух статических native references тоже сохранены: HTX currencies receipt1791632635640 и Kraken AssetPairs1791633897537. Это менее6 часов до поздней точки квалификации и соответствует действующей TTL этих ссылок; receipt каталога не превращается в время рыночного события.

**Первый известный момент:** immutable raw input lower bound для paired direction proof1791648650537 ещё не доказывает момент его обработки. Поэтому новая историческая replay row консервативно использует `broad-summary.completed_ts=1791648709892`, SHA256e3610013fc73174abea0459cceccd22d798b238f20a198b93dd79213f5e19edc. Это сохранённая отметка завершения результата, а не реконструкция первого выполнения предиката/authority return. Оба trade samples на этом cutoff ещё моложе5 минут. `source_ts` остаётся временем native сделки, а исходный `received_ts` сохраняется отдельно. Вызов с поздним now не обновляет эти часы; после срока факт недоступен. Replay output не является существовавшим тогда N12 producer receipt, новым prospective сигналом или текущим покрытием.

Квалификация raw сохраняет exact namespace/instrument/native identity, wire body SHA отдельно от parsed JSON hash, raw IDs/order/taker side/положительные price+base quantity и явный window plan. Никаких дополнительных разборов старого WS/REST direction matcher не выполняется: принятый reference переиспользован по ID/неизменяемым квитанциям и сохранённому completion marker. Сумма USDT — произведения исходной цены и количества, **не отдельное native quote-volume поле**. Это только bounded диагностический buy/sell context: coverage0, directional/risk NULL, score0, entry/targetfalse, whole5m/4h coveragefalse, Kraken один upstream.

Новый N10 hardcoded15 guard уточнён **предложением**, не runtime изменением. Исходное решение явно относится к N15/hourly archive; новый глобальный запрет ordinary N10/N05 из этого не установлен. Exact patch снимает только hardcoded list как причину обычного N10 отказа, оставляя approved105 и проверку уже полученного fresh exact HTX spot reply/raw Kraken cache. Без пригодных входов archived15 всё равно не допускаются. Сам список сохраняется как исторический archive cohort. Нужна центральная корректировка прежнего504 test expectation; старые27 tests здесь не запущены. Производственная версия504 и рабочие маршруты не менялись.

Весь код, provenance и proposal подготовлены до одной общей новой проверки. Результаты и hash — verification.json / first-new-check-receipt.json / n10-proposal-targeted-repair.tap / new-carrier-witnesses.json. Дополнительных sourceHTTP/WS/nativeSQL/deploy/MAIN/Telegram0; shared registry/consumers/imports остаются только предложением. Нельзя считать это новым подключением/all105 coverage/cache ACK/фактической доставкой. В отличие от504/505, сегодняшний N05 collector сам RECENT_PUBLIC URL не собирает: возможный будущий запрос требует отдельного централизованного admission в прежнем общем5HTTP, и нулевую дополнительную стоимость runtime acquisition этот пакет не доказывает.

Первая общая новая проверка дала30PASS/1FAIL: только proposed N10 rejection wrapper не имел явного runtime_input_qualified=false. Исправлен этот wrapper в proposed copy; повторён только его НОВЫЙ case —1PASS/0FAIL. N12 module и остальные30 cases byte-exact, их успешные результаты сохранены без повтора. Полный исходный TAP первой попытки остался в выводе инструмента беседы, в Git сохранены точный структурный failure receipt и фактический TAP targeted repair; файл полного успешного повторного прогона не заявлен. Положительные witnesses перенесены из первого stdout с явной отметкой происхождения.
