# Цена защищённых inactive карточек

После разделения backfill/watch все retained cards защищены до отдельной квалификации полного reference graph и expiry. `estimateCapacity` по-прежнему считал полный card/watch/raw только для active, а остальные карточки заменял compact rows и hot raw за два дня. В новом controlled before сохранены два пропуска: при обычном потоке не учитывались полные доказательства 796 inactive карточек; при годовом среднем наблюдении модель показывала 900 карточек при 3650 active. Это арифметические контрпримеры, не измерение реального потока или базы.

Модель `ALL_RETAINED_CARD_WATCH_PROOF_V2` сохраняет card+watch+один raw body каждой retained карточки. Inactive component выделен отдельно; compact outcomes считаются дополнительно. Hot raw остаётся справочным компонентом внутри retained proof и не добавляется второй раз. Retained count не меньше active и потока за больший из явно заданных projection/hot windows. Поле `stored_cards_before_archival` оставлено для совместимости; автоматическую архивацию/expiry оно не разрешает. Projection window также не ограничивает возраст активного события.

При прежних условных card4755B, raw65536B, watch512B, compact512B, D10/F20 и D100/F200:

| Сценарий | Active / retained | Защищённые inactive card+watch+proof | Суммарная сериализованная оценка |
|---|---:|---:|---:|
| Обычный |104 / 900|56 359 188 B|64 130 252 B|
| Устойчивый пик |1040 / 9000|563 591 880 B|641 302 520 B|

Это условная стоимость предложенного спроса до admission, а не вместимость уже принятой памяти: действующие research caps128active/512cards остаются прежними, дефицит900−512 и9000−512 не скрывается. Один raw body на карточку — допущение без дедупликации; у события могут быть несколько proof revisions. `additional_proof_revisions_storage_bytes`, physical database bytes и общий native бюджет остаются null. Размер всех реальных proof refs, outcome/transition/outbox journals, snapshots, CAS/резервов, индексов/WAL и transient restore buffers нужно измерять отдельно. Эта оценка не верхняя граница и не утверждение о свободной памяти.

Пять новых controls прошли: ordinary inactive storage; peak/unknown native boundaries; годовое событие за пределами90дней; hot window длиннее projection без двойного raw; прежние HTTP/watch/caps/activation false. Первый draft имел две неверно записанные ожидаемые константы; после независимого целочисленного расчёта они исправлены. Добавлен учёт сохраняемого inactive watch. Финальный набор5/5 PASS сохранён; промежуточные логи явно помечены draft/before-watch. Принятые старые suites и CPU/provider/replay benchmark не повторялись, `measured-scenarios.json` не менялся.

`arithmeticHeadroom` и прежние provider/main/manual/next-full лимиты не менялись. Номинальные5GB и эта новая арифметика не доказывают общего свободного бюджета, native cost closure или возможность включения. No provider HTTP/SQL/MAIN/Telegram; production imports отсутствуют. Реальные sourcefeed и native storage/admission остаются в полосах источников и координатора.
