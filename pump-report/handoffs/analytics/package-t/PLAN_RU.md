# T — до патча: отдельный quote-notional consumer

ROOT exact ref `0e6ecbe973f2b44c1ba80736fdaaf7e35a2ba736` прочитан полностью: contracts/index.mjs v1.2-quote-notional, константы TRADE_BASE_QUANTITY_UNIT и TRADE_QUOTE_NOTIONAL_UNIT. Дополнение CONTRACT_RU.md прочитано до патча. Это accepted normalized seam, не новый live admission.

ТЗ v2 SHA2560674adf8… Block2 строки72,250–259: optional executed trades/наблюдённая реакция, без намерений/поглощения. Новое owner уточнение benchmark removal остаётся выше исходного Block5. Прежние frozen S/P/Q/R и feature-v1 не меняются.

Две отдельные формы:

- BASE: price и положительный finite quantity_base; сумма=price*quantity_base. Полный старый trade_context и diagnostic semantics должны совпадать с before-oracle.
- QUOTE: price и положительный finite notional_quote; сумма прямо notional_quote в USDT. BASE неизвестен и нигде не восстанавливается делением. Новый внутренний amount_basis/base_quantity_qualified=false только для quote формы; публичной строки неизвестного количества нет.

Unit всего Fact выбирает один amount field для всего sample. Строка другой формы без нужного поля не дополняется догадкой. Конфликты stable-ID по event_ts/price/выбранному amount/aggressor выявляются до фильтрации некорректных строк. Совпадающие ID учитываются один раз; anonymous/непригодные часы/side/amount исключены с reasons. Суммы BUY/SELL/netflow и price-response используют один и тот же пригодный уникальный свежий набор. Endpoint ties/no time span/overflow сохраняют null/reason Q; min/max только observed sample, fullmarket/causality/absorption=false.

Новая ветка использует существующий assertInput binding verified crypto-USDT perpetual; source обязан доказать точный recent route/quoteQty/maker side и clocks по ROOT контракту. Consumer не переименовывает historicalTrades.quoteQty Turnover в recent и не квалифицирует native route. Ни новых HTTP/SQL/TG, ни нового source/runtime/common кода.

Один небольшой новый affected set: positive обеих единиц с полным BASE-before oracle; quote конфликты/partial/неполные строки/clock/ties/overflow; настоящий analyzePump→Q context→card по artificial quote sample и core oracle. Не повторять старые Q/S батареи. Не менять plan/readiness/rules/min10/BTCETH/t0/P0/target/mapline; никаких market_context/benchmark.

Отдельный feature-retention delta с parent S map/hash: original price/notional/selected-unit/evidence нужны для replay; normalized quote amount не становится BASE. TTL/feature schema-v1 не расширяются. Новая own33мин≤35, FULLreadback, freeze→timely onlyownrelease.
