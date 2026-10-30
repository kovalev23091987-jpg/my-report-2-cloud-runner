# F580 — точные prerequisites edgeX V2

Решение: HOLD, actual admission не рекомендован. F579 остаётся неизменным frozen-пакетом; его условная рекомендация getTicker → funding заменяется документальным metadata-first порядком. Это не допуск и не готовый двухзапросный eligibility-check.

Сериализация: официальный SDK закреплён точным commit и Git blob. Поле fundingRate объявлено строкой JSON. Ratio против percent points не определены. Уже прочитанная формула vendor multiplier не закрывает это свойство, sample не доказывает собственную единицу. Дальнейший SDK-круг не выполнялся.

Identity: первичная статья edgeX публикует 4STOCKUSDC и называет BEP-20 адрес «часто цитируемым», с оговоркой о проверке live index. BingX-ссылка оказалась уведомлением о частоте funding, без проекта/сети/адреса. Общего канонического идентификатора нет. Сохранённая U3 экономическая классификация остаётся прежней и не становится cross-venue binding. Публичный адрес токен-контракта включён как кандидат, не как подтверждённая native связь; аккаунты не искались.

Metadata: точный public GET /api/v2/public/meta/getMetaData документирован. contractList ссылается baseCoinId/quoteCoinId на coinList; доступны environment, precision и торговые флаги. Это правильный первый шаг перед funding. Чтение не выполнялось. Явный per-contract settlement asset, crypto/RWA classification и underlying project identity остаются gaps. Данные cross-chain withdrawal, collateral, synthetic/starkEx IDs не доказывают адрес базового4STOCK. Тестовые примеры документации не являются текущими mainnet значениями.

F580_EDGEX_SERIALIZER_CANONICAL_ID_METADATA_DELTA_V1.json содержит точные новые факты и границы. F580_REVISED_METADATA_FIRST_PLAN_HOLD_V1.json описывает лишь eventual cold/warm lower bounds. Полная цена qualification неизвестна; текущего исполняемого native proposal нет. Квота V2 не читалась, V1 не переносилась.

Потрачено 5 из 6 попыток, включая 1 поиск. Одна попытка оставлена неиспользованной: отсутствие первичного основания не исправляется расходованием остатка. Неиспользованное не возвращает старые caps и не разрешает native IO.

Provider/market/metadata API, RPC, SQL, Telegram, Worker, deploy и private captures — 0. Код, source/vendor imports и runtime tests — 0. Для всех 550 остаётся NOT_CHECKED; новых routes/registry votes и квалифицированных future maps — 0. Выполнены только локальные JSON/hash bookkeeping-проверки. Секреты и sample account payloads не сохранены.

Authority и подготовленный release зафиксированы до заморозки. Далее выполняются только CAS освобождения и FULL readback с подтверждением в чате. Исходное ТЗ0674/unified384e и старые SPENT/unknowns/резервы/caps, девять пауз и два OWNER deferrals сохранены.
