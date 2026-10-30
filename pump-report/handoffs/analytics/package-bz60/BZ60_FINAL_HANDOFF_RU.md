# BZ60 — операционный artifact/control mock

**PASS для controlled offline qualification. Разрешения на install/rollback и live-приёмки нет.** Проверены точные файлы main `1763bf68ccbf7b02b55462a42c39c43eac699b3d`; на свежем совместимом main `faf88ee8ba8519a2c2dda2fb238a046af003c8dc` все их Git blobs и 17 guards совпали, all4 равны.

Статическое сравнение двух явно указанных compiled source bundles подтвердило 78 одинаковых имён, ровно 9 изменённых модулей и 69 модулей с совпадающими байтами. Старый artifact `1b4403a02c6d93a3555c5e1a0ce623c1e907a0edd52ce563878791cb7eba4378`; новый `2a1154eeccaa453d96c7b1a471722f8767ae2f71704fb820ccdbc79ceaefcca4`. Оба pin и полные module-map hash совпали с frozen константами. Обратный контроллер фиксирует точные старые SHA, а не заново собирает приблизительную версию. Шаблоны требуют ровно девять overrides и полный readback всех модулей.

Числа доказательства согласуются с исходником: (11+11+11+5)×2 = 76 stub-запросов; (4+3)×2 = 14 вызовов; 6 отрицательных проверок отклонены до IO. Это wrong artifact, busy executor и extra override — по три в каждом направлении. После двух PUT и четырёх PATCH mock сравнивает модули и настройки с исходным состоянием. Все три frozen source SHA совпали с потраченным mock admission. Тест не повторялся.

Сохраняются 21 bindings и три коллекции расписаний: у hub один cron, две старые worker collections пусты. 18 bindings в mock являются заглушками, поэтому доказана логика inherit/readback, а реальные секреты и service bindings должны проверяться фактическим FULL. Это не три включённых cron.

Границы до реальной установки конкретны. Quiescence и admission в mock синтетические; шаблон проверяет free-owner, pin и возраст не более пяти минут, но не читает native executor или серверный spent-registry. ROOT отдельно получает новое фактическое наблюдение, текущий live preimage, совместимую own authority и одноразовые admissions для каждого точного действия. Истёкший №17 и потраченный mock не переиспользуются. Подготовленный обратный путь не разрешает rollback. Счётчик 76 относится к логическим mock calls; физический Cloudflare transport остаётся отдельной стоимостью с сохранением UNKNOWN_NONZERO_RETAINED.

Внутренняя квитанция шаблона содержит слова Actual/live даже при stub. Источник доказательства определяет внешний CONTROLLED_OFFLINE_NOT_NATIVE и actual_Cloudflare=0. Native установка, SQL, provider, Telegram или настоящий SENT из этих строк не следуют.

Контроллер не изменяет SQL/карточки/оригиналы/исходы/бюджет, не продлевает old TTL и не сбрасывает SENT/UNKNOWN. Старые расходы, unknowns, CLOSED holds, резервы/caps/manual3, 9 пауз и 2 OWNERdeferrals сохраняются. Runtime BZ59 не рецензировался повторно; его принятая квалификация остаётся отдельной. Live по контексту ROOT — DFD78/1b44 AUTO1DL1; нового live IO здесь не было.

Полные SHA, ссылки на строки и границы выводов — BZ60_STATIC_REVIEW_V1.json. Ревьюер: Node/import/engine/testcase/build/native/CF/OAuth/provider/TG/production changes = 0. Только статическое чтение и хеширование публичных исходников и compiled source bundles; raw/private16/recipient не читались.
