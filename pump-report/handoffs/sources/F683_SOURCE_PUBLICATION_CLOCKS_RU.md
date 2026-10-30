# F683 — часы ликвидационной карты перед отправкой

**Подготовлен неприменённый патч двух source-файлов.** Base: f90e82e647a566fe8b612aafb791b66fc80d15da. Amendment SHA256: 950fa8a4c1ef04b1be6a4ed50112b0190a5276d8a5aa82a37e739ee4811d602d.

Причина: Swole проверяет свежесть price mapping при получении, но теряет его event/expiry и оставляет срок зоны по TTL модели. После задержки модель ещё может быть свежей, а её сопоставление с ценой BingX — уже нет. Hyperliquid уже ограничивает expiry обоими сроками, но также не сохраняет mapping clocks в price_comparability.

Патч сохраняет mapping event/expiry в существующем price_comparability. Для Swole: expires_ts=min(source event+modelTTL, mapping expiry, mapping event+priceTTL), исходный срок — native_expires_ts. event_ts и received_ts зоны сохраняются. Timestamp-строки Swole сначала переводятся в числовые миллисекунды. Proof, единицы, TTL и маршруты не смягчаются.

Существующий analytics/zones.mjs копирует price_comparability целиком в components и берёт минимальный expiry компонентов. ROOT должен повторно проверить каждый отображаемый компонент непосредственно перед отправкой, включая mapping clocks; одного evidence_ref или проверки при enqueue недостаточно. Патч источника сам по себе не доказывает свежесть на момент Telegram/ACK.

Mapping received_ts в принятом route-контракте не установлен: он не выдуман и не заменён часами получения карты. HL event_ts — часы нативного account-state snapshot, не обновления отдельной позиции. Orderly остаётся диагностикой: event_ts/expiry=null, zones=[], usablefalse; bound/response/opened_at не превращаются в source event. HOLD SOL/BTC не включены.

Карта необязательна. Просроченный enriched-текст отправлять нельзя; ROOT/ANALYTICS отвечают за согласованную новую immutable версию без карты либо отказ именно этой версии. Удаление stale-зон не должно оставлять ссылки на них в тексте/плановом контексте. Поздний откат сам по возрасту >4ч не исключается, нового seed-end cutoff нет, остальные требования и прежние часы статистики сохранены.

13 точных синтетических векторов переданы ROOT: expiry mapping раньше модели, обратный порядок сроков, числовые строки, задержка после selection, старый source при свежем receipt, missing/future/unknown clocks, HL subset, устаревший неосновной компонент, legacy evidence без mapping clock, Orderly и допустимый WITHOUT_MAP. **Не исполнялись.** Канонические файлы не изменены; проверены исходные Git blobs и арифметика сроков.

Patch SHA256: d970ed48f32024ce02520e0ec37141ddbd9712cddf8db8b8f848a2ce7b98b78f. Полная матрица полей, указатели кода, ограничения и зависимость от publication guard — в JSON. Новые market/native/CF/SQL/TG/search/connections:0; бюджеты, резервы, unknowns,9пауз и2OWNERdeferrals сохранены.
