# SOURCE: offline request clock contract

Статический контракт публичного клиента установлен по четырём уже сохранённым JS-файлам, без их выполнения. Точный метод, цепочка plugin→baseRequest→utility imports/exports и19 UTF-8 byte spans с полными file/span SHA256: `CLOCK_CONTRACT_STATIC_SPANS_V1.json`. Итог и неисполненный шаблон: `CLOCK_CONTRACT_RESULT_V1.json`. Предыдущий frozen пакет9b4fe68... неизменён.

`requestCoinInfoList()` вызывает GET `/coin/v1/display-info/list` без params. Common baseRequest добавляет `/api` и заголовки `od`, затем interceptor `r`. Именно `r`, а не сообщение100003, доказывает:
- `timestamp` — заголовок, `new Date().getTime()`, Unix milliseconds, без прибавления часового пояса.
- `traceId` — новый UUIDv4 без дефисов, lowercase32hex. Отдельного поля `nonce` в этом пути нет; серверная nonce-семантика traceId не установлена.
- `sign` — точное имя заголовка, uppercase hex SHA256 от UTF-8 строки, без HMAC и разделителей.
- `timeZone` — отдельный common header, `-getTimezoneOffset()/60`, часы восточнееUTC. Это не IANA zone, не миллисекунды и не часть подписи.

Порядок preimage:
`public_build_prefix + timestamp + traceId + device_id + platformId + app_version + (antiDeviceId || "") + normalized_payload`.
Для этого GET без query payload строго `{}`. URL/path, method как строка, timeZone, appSiteId и Authorization в preimage не входят; method выбирает только способ нормализации payload. Prefix публично встроен в этот build, не является ключом аккаунта/сессии/API. Точные части и независимый синтетический стандартный SHA256 vector — в RESULT; скачанный JS не запускался.

Pinned публичные defaults: version5.3.37, DESKTOP platformId30, main-site appSiteId0, appId30004/mainAppId10009, official channel/reg_channel, lang en. `device_id` берётся из app_device_id cookie либо appConfig.uuid; для анонимной ветки uuid создаётся как новый compactUUIDv4. `antiDeviceId` при отсутствии сохранённого fingerprint становится пустой строкой. Bearer добавляется только при наличии token-cookie. Ни cookie, ни токены, ни fingerprint пользователя не читались и не копировались.

Это доказывает возможность собрать публичную анонимную клиентскую форму, но не permission/минимальный набор заголовков на сервере и не успешность пустого antiDeviceId. Версия5.3.37 — header конкретного сохранённого web-build, не сброс версии/бюджета проекта. Для UTC Worker timeZone будет0 при фактическомUTC; часы Mac/Worker/TZ менять не нужно.

В исходном точном плане1GET есть только Accept:application/json. Отсутствуют timestamp/traceId/sign и common signing inputs. Это проверенное отличие плана от public client interceptor. В переданном actual wrapper нет outbound request headers; wire-level отсутствие SOURCE непосредственно не наблюдал. Для прямого wire-level утверждения достаточно одного уже существующего основания: точной request/header construction из развёрнутого ROOT34-module metadata-probe artifact либо сохранённого redacted списка имён outbound-заголовков. Новый сетевой запрос ради этого не нужен.

Фактический HTTP200/business100003 содержит server error timestamp1792942913044; broker received1792942913224, численная разница180ms. Это не измерение clock skew и не echo исходного request timestamp. Ошибка сама не доказывает, какое именно поле вызвало отказ. Никаких выводов об изменении часов, имени guessed-header или гарантий успеха нет.

`CLOCK_CONTRACT_REQUEST_TEMPLATE_V1.json` содержит тот же exact URL/GET/no query, публичные common headers и динамические timestamp/traceId/sign с согласованными входами. Он не исполнялся и не допущен здесь. ROOT может отдельно принять точный action после своего review/admission; max1attempt/no redirects/no host fallback/no retries/10s/2MB остаются предложенными границами. Старая1GETSPENT, расходы/2UNKNOWN/caps/reserves не изменены. Даже успешный ответ ещё потребует положительного type enum и native contract bridge; cryptoN остаётся неизвестным.

Одна affected static integrity-проверка: PASS_STATIC_CONTRACT_ONLY. Проверены точные4fileSHA/19spans, alias-chain, единицы/порядок подписи, пустой GET payload, один вручную переведённый синтетический hash vector, ошибка180ms и неизменность прежнего frozen manifest. Native PASS нет. НовыеGET/search/API/WS/SQL/TG/deploy0; скачанныйJS execution0; старые тесты/аудиты0.

