# F553: фактический recent trades1000 при limit100

Исправлен предел ответа: запрошенный limit100 сохраняется, допустимый response_rows_max1000. Предел1000 обоснован фактическим успешным ответом и retained official AI reference79–103 (максимум1000). Причина расхождения ответа с запрошенным лимитом UNKNOWN. Ответ не обрезается до100: все строки, дубликаты и конфликты передаются consumer до дедупликации;1001отклоняется. Покрытие остаётся latest bounded sample, complete=false/full_window=false.

Ровно один новый focused case:1PASS0FAIL78.146416ms. Проверены фактическая форма1000, неподтверждённый fillId,1001, конфликт и invalidquote за первой100, подключённый optional через mock broker с limit100. Старые шесть T3 не повторялись; в старом case механически обновлено ожидаемое предельное число101→1001, оригинальные байты теста сохранены.

Один офлайн разбор оригинала0170bba7...: sourceSUCCESS,1000нормализованных строк, все1000invalid_id, остальные invalid_price/quote/clock/side=0. Ответ имеет fillId, отсутствует документированный id. Уникальность1000fillId не доказывает стабильность; сохранённый официальный JS не содержит описания fillId. Поэтому alias запрещён, trade_id=null, qualified=false, statusINCOMPLETE, qualifiedevent_ts=null. Положительные quoteQty, булевый isBuyerMaker и time сохранены по T3 доказательствам; qty не читается, BASE/множитель UNKNOWN, ts не становится time. Никакие суммы направленного потока не квалифицированы.

ROOT заменяет `sources/recent-trades.mjs`; общий контракт и HTTP limit остаются прежними. `sources/index.mjs` F553 не менял, точная копия46321d... сохранена. Недоступность trades direction дополнительна и сама не блокирует CORE. Никаких новых HTTP/SQL/TG/deploy, старые SPENT/unknown/reserves сохранены. Исторический пакет T3 не перезаписан.
