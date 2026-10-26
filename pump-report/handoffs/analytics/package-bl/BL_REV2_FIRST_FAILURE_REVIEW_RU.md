# BL REV2 — первая ошибка сохранена, повторного запуска нет

Статус: **FAIL_NO_RERUN / ошибка искусственного oracle**. Ровно один запуск Node, один связанный affected case. ROOT runtime не изменялся.

Первая проверка OFF успешно вернула EVEN_DAY_CANDIDATE_ALLOCATION, состояние осталось прежним. Следующая ветвь manual_global ожидала allowed=false, фактически получила allowed=true; остановка bl-surplus-connected-once.mjs:82:43. Снимок artificial grant сохранён, реальных операций не было.

Причина в подготовленном ANALYTICS ожидании: clock=2026-10-26T13:30:00Z (16:30 МСК), будущие discovery slots начинаются в16:35 и заканчиваются в19:55: 41×2=82 HTTP. Значение84 в замороженной fixture/oracle неверно. Проверяемая сумма667+12+102+82+36=899≤900, поэтому этот ответ не доказывает дефект runtime. Для отказа по global в этом времени нужен расход≥669. Для plan при limit634 нужен charged≥505; исходный503 также не задаёт нужную границу. Это статическое вычисление Python, без повторного импорта/Node.

Замороженные тест/fixture/oracle не исправляются задним числом. Последующие ветви не выполнены: остальные blocker overlays, base3 REV2, competing CAS, idempotence, CORE/DELIVERY conversion, conservative CLOSED/UNKNOWN retention, bound late operation, real runner finally. Их результат НЕ PASS. Нужен конкретный следующий пакет ROOT с исправленным oracle/границами и отдельным разрешением на новую affected проверку. Новая ёмкость/активация здесь не доказаны.

Точные входы: ROOT frozen main036ee4135714f1acb4c0207a5a02ff0f479350b6, testSHA be6e8aea81c331a4adc5546560a2c81605f10c4a4448e854edde95fc3b959738, frozen-inputsSHA a44eb077caacb0b2a094fbc976cad6004b07fc36701a56873f8c12eae3acd029. Все5 ROOT SHA совпали до запуска. Полная зависимость:27 файлов. Первая ошибка affected-failure.json; состояние failure-state.json; положительный OFF и ошибочная ветвь в case-progress.json.

Node1 / case1 / project runtime edits0 / engine0 / old suites0 / real provider HTTP0 / MCP0 / nativeSQL0 / Telegram0 / deploy0. GitHub control-plane authority/own CAS отдельно. Live69 и feature OFF сохраняются; все caps/spent/unknowns/reserves/9пауз/2OWNERdeferrals сохранены. Никаких новых чатов/подагентов/автоматизаций и исходящих сообщений другим чатам.
