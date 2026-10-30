# F688 — следующий сохранённый future-map пакет

**Статус: HOLD до фактических prerequisites. Активации и нового допуска нет.** Base: 93462ee4f01d73aed7d240731fe84e492cfe93ba.

Следующий конкретный вариант — один уже сохранённый HL first-dex аккаунт для BingX native100028 SOL-USDT. F684 закрыл передачу mapping clocks/min-expiry, но не фактическую квалификацию маршрута. SOL registry всё ещё canonical=false/routes0; production admission допускает только BINGX/TELEGRAM.

Нужны: независимый общий underlying/project/oracle anchor для точной HL listing↔BingX SOL; текущий явно доказанный price-basis mapping с собственными event/expiry; ROOT finite admission ровно одного сохранённого аккаунта; отдельные положительные provider/whole-native admissions. При отсутствии любого из них —0HTTP. Одна clearinghouseState выдача сама не доказывает identity или независимые часы mark/basis.

F585 уже закрывает знак szi и native underlying unit. Цена первого dex SOL условно USDT, USDC margin не делает её USDC. positionValue currency остаётся UNKNOWN и может быть magnitude=null — это необязательный размер, не причина задерживать пригодный threshold. Factor1 и фиктивная USDC/USDT parity не предлагаются.

Условный пакет ROOT:1 POST существующего clearinghouseState/1аккаунт/безdex,1HTTP,0retry/0pagination,≤4KBrequest/2MBresponse/10s. Original receipt/hash/received + payload.time + ≤1000positions + максимум1 точный oneWay SOL/nonzero szi/positive liquidationPx; proofrefs/binding/mapping/accountref прилагаются отдельно. Raw и адрес остаются у ROOT. Возможный результат0или1 observed zone, только subset/PARTIAL; no-target не означает unsupported.

После ответа expiry=min(account event+120s,mapping expiry,mapping event+30s); final sender требует ещё15s. Не успевающая карта исключается из новой immutable версии, основной сигнал остаётся допустим. Никакого TTL-extension или повторных HTTP ради карты.

Batch: переиспользовать один действительно свежий exact-body response для заранее квалифицированного whitelist, не умножая аккаунты/запросы. Сейчас дополнительный canonical overlap0; начальный whitelist толькоSOL. Сохранённый denominator550: всеNOT_CHECKED,0qualified; BTC/ETH исключены. Swole имеет только старый исключённый BTC sample; Orderly остаётся bound-only диагностикой; F606HOLD сохраняется.

Будущая cold-стоимость≤1HL HTTP,0дополнительныхBingX/basis/TG. Текущие HL allowance/weight и native actual неизвестны. Исторический F67516SQL/5000R300W не выдаётся заново: ROOT предварительно считает точный native call graph и фактический остаток в существующих caps. До этого пакет не исполнять. SOURCE Node/HTTP/native/CF/OAuth/TG/activation/search/connections/canonical edits:0. Полный проверяемый контракт ответа и причины пробелов — в JSON.
