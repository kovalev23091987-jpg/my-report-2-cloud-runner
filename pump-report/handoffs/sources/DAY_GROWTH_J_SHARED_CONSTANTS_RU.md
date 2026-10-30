# J: итоговое согласование с common

Итоговый SOURCE API: `createPumpSources(...).getDayGrowth({instrument,run_id,mode})` → `{facts:{growth_24h},coverage}`. Дополнительные run_id/mode не меняют источник: запрос остаётся CORE/candidate через общий broker. Явный force_refresh поддержан. Индекс и coverage из J-v2 сохранены; core121/parser/factory/registry/map routes не менялись.

day-growth.mjs теперь импортирует ROOT `GROWTH_24H_UNIT` и `GROWTH_24H_WINDOW_MS`; прежние SOURCE aliases DAY_GROWTH_UNIT/DAY_WINDOW_MS сохранены. Форма факта,1440/end−1/полная сетка/original clocks/OBSERVED+derived_from не изменены. Старый модуль до замены литералов сохранён в `.snapshot`.

Серверный common прочитан по main `b8e2715a2404e068e2f9159e29a4efeee4f14f57`: contracts Git blob `75e3b2700886fe8d891e20279947bd1490649737`, CONTRACT_RU `a4c931132fce1cdc0586962a2f96d200c03bfab4`. Локальные Git blobs совпали полностью. Проверены exports единицы и86400000, а также опубликованный automaticWindowOpen. Свежие all4/guards совместимы с новой ROOT lease1792937785000.

При замене на shared imports affected J-проверка прошла2/2,84.308333ms. После публикации выполнена только проверка byte identity/imports; старые группы не повторялись. ROOT сообщил30 своих affected PASS и опубликовал runner: отдельный day call после overview, до core, чтобы1440 запрос не старил стакан. Runtime/profile/policy/common SOURCES не редактировал. Для нового артефакта нужно включить day-growth.mjs по index import.

Это окончательный SOURCE J-пакет для следующего артефакта, а не изменение immutable c680/первого native SENT240. Реальное поведение1440/start/endTime пока NOT_NATIVE_PROVEN и требует отдельного ROOT допуска. Истёкшие native grants не переиспользуются. Отдельный Swole sample заморожен в PACKAGE_SWOLE_ACTUAL_ONE_PROBE_FINAL_V1.json:4модельные bins, но identity/currency/venue/current price mapping не квалифицированы и модель устарела; маршруты не активированы. SOURCE marketHTTP/SQL/TG/deploy0;9пауз/2deferrals/unknowns/reserves/caps сохранены.
