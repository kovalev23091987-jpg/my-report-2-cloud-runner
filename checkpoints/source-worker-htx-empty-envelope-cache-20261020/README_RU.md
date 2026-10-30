# HTX N12: пустой same-run envelope не доказывает отсутствие точного кеша

556 NORMAL/PERSISTENCE_NOT_CLOSED → runner → INFO/manual проверен статически: существующий source_read_costs передаётся целиком. Исправление этой корректной цепочки не предлагается и старые проверки не повторяются.

Новый конкретный дефект находится в HTX collector. Worker всегда передаёт объект с futures/spot, даже когда пригодного payload нет. Прежний ранний return не достигает уже существующего exact positive cache. В предложении настоящий завершённый same-run check, включая валидную пустую выборку, и полезная частичная сторона остаются на прежнем пути без SQL. Необычные legacy envelopes сохраняют прежний результат.

Только для неуспешного пустого обычного объекта предлагается один существующий cache SELECT после существующего source-health/run-budget admission. Схема не устанавливается. Пригоден лишь положительный CLOSED_BOUNDED_SAMPLE, прошедший неизменённый exact cache validator. Промах, отрицательный/чужой/просроченный/будущий/повреждённый кеш не создают zero fact и не ведут к provider fallback или grant. Исходный same-run отказ и его receipt statuses сохраняются технически.

Все факты и исходные часы кеша остаются прежними. Текущий HTTP равен0; check_completed:false запрещает выдавать кеш за новый strict-manual acquisition. Поздний неизвестный расход не удаляет уже возвращённые валидные факты и не разрешает дополнительную работу. Новая стоимость чтения честно открыта: максимум одна попытка существующего SELECT на ранее нулевой ветке, native rows/cost NULL. 500R/0W — существующая консервативная N12 read-envelope проекция, не billing bound/новый лимит.

Изменён ТОЛЬКО этот ownprefix. collector.before/after и .patch — TEXT; production/shared runtime не изменён. Один новый callable и12 групп подготовлены и НЕ ИСПОЛНЕНЫ. Node/import/syntax/LocalSQLite/nativeSQL/providerHTTP/MAIN/manual/Telegram/deploy/gitapply0. Протокол зафиксирован отдельным первым commit до callable. Центральная общая проверка допустима лишь после review всего связанного пакета и точного root scope. См. protocol.md, target-bindings.json, provenance.json и central-entry-plan.md.

Новая ветка требует scoped HTX_N12_RESULT_CACHE_SCOPE_V1; unbound legacy positive cache ею не допускается. Старый вызов без same-run envelope сохраняет прежнюю legacy cache-совместимость. Runtime pin checks предшествуют imports, global network/Date.now блокируются и восстанавливаются в finally; запускать компонент последовательно.
