# F573 — новые первичные направления и точные ограничения

Два содержательных новых API-направления: Variational и Decibel. Nado изучен до official protocol overview и отложен без API-квалификации. В bounded dedup4331 retained JSON/Markdown обнаружен старый Derive/Lyra currency-API receipt: его не выдавали за новую lineage и не перечитывали API. F56226/F570GRVT–Defx–Reya и прежние источники не переаудировались. Язык/география/известность не служили фильтром; японский и испанский использовались как поисковые линзы, не доказательство domicile.

## Variational — важна именно v2

[Текущая первичная страница](https://docs.variational.io/technical-documentation/api) задаёт GET `/metadata/v2/stats`. Старый индексированный результат поиска описывал v1; direct read нашёл новую migration-семантику. V1 может быть неполным/устаревшим; его funding_rate соответствует annualized_rate, а не ставке одного интервала. V2 отделяет perpetual/swap и annualized/interval funding, заменяет placeholder0 для swap на реальные условия либо null.

Новая польза сверх BingX — собственные native OI/funding/USDC-volume facts другой площадки. Per-listing long/short OI — trader-only USDC, global OI включает trader+OLP и является double-sided: суммы не смешивать. Indicative size-tier quotes не являются standing orderbook depth. Quote-cache может достигать600s; quotes.updated_at — время получения котировок, не универсальное время генерации OI. Funding next_timestamp — будущее время платежа, не snapshot clock; next у perps пока совпадает с last и не становится независимой моделью/картой.

Public read-only example не содержит auth headers; trial не заявлен, постоянная бесплатность hosted API не гарантирована. Лимиты10/IP/10s и1000global/min общие дляv1/v2; Worker access не проверялся. ticker/name/contract_type не доказывают независимую crypto identity или соответствие BingX. num_markets может превышать listings: отсутствие строки — не UNSUPPORTED. Предложение для отдельного допуска ROOT — один GET `https://omni-client-api.prod.ap-northeast-1.variational.io/metadata/v2/stats`,0retry/followups,2MBmax; сейчас не разрешён и не выполнен.

## Decibel — OPEN positions есть в индексе, доступ с gate

[Официальный doc index](https://docs.decibel.trade/llms.txt) отдельно документирует `/api/v1/account_positions`: открытые perp positions одного account с liquidation price/margin; старый user_positions deprecated. Страница позиции недоступна инструменту, повтор не делался. Поэтому exact query schema, stable position ID, generation time, единицы size/notional/liq price и auth account-route остаются UNKNOWN. Это новая приоритетная зацепка будущей карты, не полученные позиции и не whole-market census. Ни одного account не допущено; адреса из поисковой UI-выдачи не сохранялись и не стали account set.

[Market guide](https://docs.decibel.trade/quickstart/market-data) подтверждает mainnet host `https://api.mainnet.aptoslabs.com/decibel`, APIv1 markets/prices/orderbook/trades и product-specific market_addr. Spot/perp одного base — разные адреса. Существенный gate: guide называет endpoints public/no OAuth-JWT, но всё равно требует Decibel Node API key в Bearer header. Free/no-expiring-trial entitlement, quota scope и Worker access не подтверждены. Ключи/аккаунты не создавались и не угадывались.

Минимальный условный следующий native шаг — один GET `/api/v1/markets`, только если у ROOT уже есть явно допущенный подходящий node key с доказанными условиями и отдельными provider/whole/native admissions. Иначе HOLD. Account positions, RPC, WS, регистрация и последующие запросы в этот шаг не входят. Decibel SDK/REST/WS/Move и AptosLabs hosting — одна линия native данных, не дополнительные поставщики и квоты.

## Nado — не раздувать число готовых API

[Official overview](https://docs.nado.xyz/) подтверждает native CLOB/unified margin на Ink и упоминает USDT0. Это не доказательство единиц raw positions или USDT0→USDT factor1. Новый llms index оказался недоступен; повтор не делался. API route/free/auth/quota/units/clock/ID не получены, native proposal URL=null. Nado не входит в два выбранных API-направления.

## Расход и передача

Новый F573 cap10/10 SPENT, включая3/3 single searches и2 неудачных doc opens. Каждый заранее списан;0retry/0fanout/0execution. Сохранены hashes пяти успешных parsed-doc responses и версии/URL; это hashes текста, возвращённого web-инструментом, не raw HTTP или server digest. Полные docs/UI market values/account addresses не помещены в Git. Старый F572 отдельно:2SPENT/4unused, не6SPENT и не native budget; его прежний deadline не возобновлялся.

Новых пригодных карт/зон0, verified permanent-free hosted access0, all550 по этим источникам NOT_CHECKED. Actual provider/market/metadata/RPC/SQL/TG/deploy/privatecaptures0; tests0; production files/registry/routes/policy не менялись. Не создано собственных моделей/зон/collector/send-path, BTC/ETH benchmark и account-discovery не выполнялись. Отсутствие optional maps не блокирует основной BingX report. Caps/unknowns/reserves/старые9пауз/2OWNERdeferrals и пауза старого отчёта сохранены; live66, TG и бюджет ведёт ROOT.

Acquisition main `5ae958abdacb9cd46fed95eb36af8f78d2891e8c`; свежий finish main `2d9ac1be2058e95e355c973ddcc628dac41f30b8`; own bounded CAS `a412bc27d3f32d6113f5fde4a60662de13900b1b` FULL. All4/fence/generation совместимы, изменившийся coordinator window прочитан целиком. SOURCE HEAD4b44 без нового коммита. ТЗ0674/unified384e неизменны. ROOT читает matrix/routes только как proposals: никаких runtime imports или автоактивации.
