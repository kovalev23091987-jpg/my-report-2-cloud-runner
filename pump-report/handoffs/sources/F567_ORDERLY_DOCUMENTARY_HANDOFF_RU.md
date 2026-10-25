# F567 — точные документальные gaps Orderly

Пакет завершён в пределах4 новых обращений:4/4 SPENT, включая поиск без результатов и недоступную страницу. Два уже прочитанных ROOT URL public-info overview/platform-positions не открывались. Рыночные API/RPC/SQL/Telegram/deploy/paid —0. Новых гарантий, достаточных для изменения producer, не получено; producer bytes и dormant routes/market_bindings сохранены. Runtime/offline affected tests —0, поскольку producer не менялся. Принятые тесты ROOT не повторялись.

Новая первичная находка — https://dashboard.orderly.network/webmcp, статическая документация возможностей dashboard. Она явно отделяет преобразованные dashboard market-поля USD/base от сырых upstream названий. Описанный symbol-scoped wrapper возвращает до1000 позиций; это иной контракт, чем наш один общий POST limit500. Входные account_id/broker_id — фильтры аккаунта, а не гарантированные выходные ID позиции или identity актива. Публичный каталог прочитан без вызова его инструментов.

Новые индексированные официальные материалы https://orderly.network/faq и https://orderly.network/blog/MultiColat подтверждают общий USDC settlement/cost-position контекст. Новая multi-collateral публикация отделяет валюты обеспечения от settlement. Это полезное уточнение, но не явная гарантия единицы конкретного сырого platformPositions.notional. Документация raw market configuration https://orderly.network/docs/build-on-omnichain/evm-api/restful-api/public/get-futures-info-for-all-markets оказалась недоступна; попытка списана, повторов нет.

Сохраняются четыре точных пробела:

- Stable position ID: имя реального выходного ключа и гарантия времени жизни/уникальности UNKNOWN. position_id в F565 — исключительно поле искусственной фикстуры; array index, amount/price hash и account-фильтр его не заменяют.
- Snapshot generation: новый фактический timestamp/гарантия не найдены. Сохранённый ts — время ответа; max-age5000ms остаётся явно документированным bound. Общий контракт интервала ведут ANALYTICS/ROOT; F567 его не проектирует и event_ts не подменяет.
- Raw notional: native field notional известен из прежнего endpoint descriptor, но его точная денежная единица/база для нашего aggregate пока не доказана. Dashboard USD и общий USDC settlement не дают автоматически переименовать raw value.
- Independent asset identity: новых проверенных BingX↔Orderly underlying bindings0. Symbol, account ID, broker ID и близость цены не являются независимой canonical identity актива.

Короткий список для будущего отдельно разрешённого actual source packet: success; native ts; data.rows (≤500, реальные ключи/типы/nullability); data.total_positions, если есть; data.next_cursor presence/type/has-next; для строки — symbol, side, margin_mode, mark_price, est_liq_price, notional, opened_at при наличии. Отдельно перечислить реально присутствующие candidate ID/clock/currency/instrument-reference keys; их имена заранее null. Сохранять original private bytes/hash/length и broker receipt/исходные часы, наружу — только безопасный shape summary и counts. Не переходить на следующую страницу или отдельный account/RPC запрос. Полный точный checklist: F567_FUTURE_ACTUAL_WIRE_FIELD_CHECKLIST_V1.json.

Один actual response покажет wire shape, но сам не докажет стабильность ID во времени, смысл валюты или независимую межбиржевую identity. Поэтому0 пригодных зон остаётся0; карта не удерживает готовый основной сигнал. Новые исследования/проверочные источники требуют нового конкретного bounded admission, четыре обращения не переоткрываются.9 пауз,2 OWNER deferrals, старые расходы/unknowns/резервы сохранены.

Ссылка на предыдущий окончательный пакет: F566 manifest SHA256860e3d9180e76ffa44739e2e8d7ab3348a398fa094bcb52b8462f61cdcc4c431; release ref6f048a1cf825659b40262c5dfdee3701a02f5a1b с FULL readback. Там6/6 SPENT, все9 package denominations UNKNOWN; этот бюджет не использовался повторно.
