# Следующий проверяемый выпуск, 04.10.2026

Задание владельца уточнено: только активные криптофьючерсы HTX, без spot-only активов; общий all-family universe обязателен для всех основных блоков и последующей проверки каждого актива по всем восьми liquidation sources. Контракты без покрытия остаются в общей базе с явным статусом; не удалять их как будто отсутствуют на HTX. Не подставлять расчётные уровни. Сначала 15 основных блоков, затем liquidation, затем совместный MAIN и Telegram.

Локальная полная current-generation validation PASS; targeted scope/native/technical 14/14 PASS. Новые реальные первичные fixtures SOL batch mainnet/getSupply+exact-slot clock и HTX rolling market имеют provenance и SHA256. Replay не заменяет живое облачное подтверждение. N10 использует уже полученные transport: 20 закрытых свечей либо явно обозначенный rolling24h ценовой диапазон; context-only, без entry/target/raw24h flow claim. Нативный SOL принимает только mainnet genesis/finalized/getBlockTime, сохраняет uint64 точно до преобразования JSON number.

Повторная сверка полноты каталога включает default/all/cross/isolated margin modes и три семейства контрактов. Общий список строится из union, конфликты и неопознанные активы запрещают статус complete. Никакого ASCII ticker allowlist. Ранее подтверждены 119 crypto contracts/102 assets; новые итоговые числа должны следовать свежему облачному аудиту, а не этой записи.

Облачный live probe ограничен 13 sourceHTTP, существующими HTX_PUBLIC_RISK/CHAIN_RPC лимитами, только quota/cache writes; deep0/canonical0/Telegram0. NEAR first/second даёт два реальных finalized snapshots; N03 считается полезным только если действительно получена supply decrease, не из фикстуры. SOL и общий N10 проверяются отдельно.

15/15 ещё не приняты; inverse/delivery exact adapters, реальный signed raw24h flow, coverage8/weekly, freshMAIN и Telegram остаются незавершёнными. PRIMARY_TECHNICAL_CONTEXT pipeline audit не объявляется closed одним информационным диапазоном. Existing worker pin и golden вывод не менялись.

Первый cloud run37221516069: inherited checks PASS, живой probe остановился на isolated+business_type=all (неподдерживаемое сочетание HTX API), без merge. Исправлен режим isolated на documented business_type=swap; all/cross сохраняют all для delivery. Добавлено сохранение source receipts при любой аварийной остановке probe. Повторная проверка необходима именно из-за этого изменения, не для повторения уже принятого блока.

Второй run37221658156 сохранил оригинальные ответы: default378=all374+cross4; isolated swap отвечает точным1014 contract-not-found с source clock. Реестр default не содержит isolated-only контрактов и полностью сверяется с all/cross. Обработка этой scoped empty-query допускается только при такой полной сверке; любой другой code/stale/conflict/isolated-only primary row сохраняет PARTIAL. Реальные margin wire fixtures и provenance добавлены; не считать arbitrary HTTP error зелёным источником.
