# BZ50 — PASS_STATIC связанного postlaunch-пакета

Кандидат: pin `dfd7b37b9ce06ba3ce6b7a06ae0f7e17e2fafffc198aaa292185c97d18450452`, artifact SHA256 `1b4403a02c6d93a3555c5e1a0ce623c1e907a0edd52ce563878791cb7eba4378`. Точные байты и pin сверены независимо:78модулей,5изменений,73сохранены. Аналитика, source-код, profile, outcome journal и saved-view совпадают с рабочей265. Производственная265 этой квалификацией не менялась.

V1 SHA4de661… остаётся FAILED: десять сравнений диагностических admission-state/storecall, один mocked runner→savedDEFERRED→summary и девять projection guards прошли до позднего fixture failure. В artificial originalInput отсутствовал run_id; saved-view корректно вернул QUARANTINED. Guard не ослаблялся.

V2 SHAa7a8c1… также остаётся FAILED: после исправления run_id старый BEFORE-путь UNKNOWN→saved-view RESULT прошёл. В заранее созданных providers отсутствовал recent:[]; новый AFTER дошёл до p.recent.filter и остановился до mock fetch. Это дефект формы fixture, не отказ реальной source qualification.

V3 SHA34d2cd… — PASS только оставшейся AFTER-ветки. Добавлены recent:[] и1001мс между предыдущим запросом и отдельной проверкой дневного резерва; использован тот же готовый артефакт, build0. Принятые группы и BEFORE не повторялись.

В ARTIFICIAL сценарии T0=29октября19:07МСК, P0=100, цель110 и дедлайн23:07 сохраняются на следующем рабочем запуске30октября10:00. Source запрашивает исходное окно, broker отдельно списывает один statistics HTTP. Затем journal→runner.checkOutcomes→readSavedOutcome дают RESULT/HIT. Исходные байты, reference старой волны, CLOSED grant/hold, старые расходы и unknowns сохранены. Замена current-wave и более ранний expiry волны не сдвигают T0 или deadline. После дедлайна высокий бар не становится HIT; при полном периоде ниже цели получается MISS, при отсутствующей истории — UNKNOWN.

Проверены шесть отказов неверного контекста и отдельно ночное окно/суточный резерв — восемь guards. Исключение ограничено ровно STATISTICS/statistics/BINGX/USDT_M/CORE; повторный AUTO, MANUAL, Telegram, другая family, DELIVERY и hot сохраняют отказ. Диагностические retained200/day24/run1 поля не становятся eligibility и не меняют caps/состояние.

Суммарно сохранённые расходы этой квалификации: ROOT Node3/build1/analyzePump0/evaluateOutcome5; реальный market/nativeSQL/CF/Telegram0. Мнимая карточка SENT987 — только ARTIFICIAL запись в памяти. Ни фактический PARTI original/outcome, ни native ACK/message_id, ни private16 этим пакетом не проверены. Разрешение на native17, новые источники/поиск/подключения или установку отсюда не следует. Последняя команда владельца: работать только с сохранёнными вариантами источников.

Итоговые точные refs/SHA и границы — BZ50_FINAL_NARROW_ACCEPTANCE_V1.json. ANALYTICS не исполнял Node, импорты, движок, tests/build/native/provider/CF/TG и не менял продуктовые/ROOT файлы. Старые бюджеты, unknowns, CLOSED holds, manual3,9пауз и обе OWNERdeferrals сохранены.
