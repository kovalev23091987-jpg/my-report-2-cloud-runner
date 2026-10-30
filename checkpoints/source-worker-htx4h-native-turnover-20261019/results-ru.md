# Результат нового связанного source-пакета

Из 37 exact сохранённых HTX USDT-M 4hour оригиналов выделены **35 634 закрытые свечи с native quoted turnover**. Исключены37 forming-строк, без досоздания свечей. Все18 162 строки старого price-only представления сопоставлены с оригиналом: OHLC и границы сохранены. Старые27 COMPLETE90d/10 PARTIAL статусы и файлы не менялись.

Производные полные UTC buckets: **5907 дней и815 недель**. У26 контрактов есть как минимум20 полных UTC-недель; у остальных baseline короче. Это815 buckets разных инструментов и времён загрузки, не815 независимых источников или событий. BILL имеет22 полные недели, BTW18, BR3; длинные1200-row originals дают27/28 полных недель в зависимости от календарных краёв. Все индивидуальные количества и incompleteness указаны в summary/archive.

Одна новая связанная qualification: **31 PASS /0 FAIL** (whole actual37 cohort и30 controlled adversarial deltas). Полный первоначальный TAP сохранён, исправлений после запуска и повторных runtime/normalizer/suite проверок не было. Нативные market requests/SQL/WS/deploy/MAIN/manual/TG —0; старые450/455/native37/probes —0.

Восстановлен именно отсутствовавший source input для имеющегося offline anomaly observer: quote turnover из rawbody, включая оригинальную числовую лексему и SHA/row pointer. Объём не высчитан по нынешнему contract multiplier, не разделён пополам и не превращён в signed flow. Pure source adapter, полный квалифицированный архив и минимальный mapping передаются третьему и координатору; их consumer code/test/activation не дублируются.

Все строки исторические. Original receipt first-known сохранён, но старый acquisition фиксировал его до полного body-read: точный full-body completion/causal ACK неизвестен. Нет prospective event/accuracy, current105 coverage, nativecache ACK, online admission, production persistence/CPU/heap/daycapacity или Telegram delivery proof. Числовые суммы derived buckets — строки exact decimal; их возможная дальнейшая floating-point проекция должна сохранять исходный exact evidence.

`qualified-cohort.json.gz`:2 025 414bytes / SHA256 `cd8b11110d39d801767462ec4b49c660de10f1aa1c2893479370f95141ac1f54`; uncompressed11 498 780bytes / SHA256 `bd28bbaa4c9efe32b00b33219b54bb09a632453ca83b49ac031757c236e13c11`.

TAP SHA256 `9bfb237d1bdde8db067c1282eba16f247f95008030ee30d6e5599dcf10fcd723`.
