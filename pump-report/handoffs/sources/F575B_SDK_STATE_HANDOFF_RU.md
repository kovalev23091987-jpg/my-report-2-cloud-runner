# F575B — Adrena read-path не даёт liquidationPrice

**Главный результат:** использованная вF574 README-зацепка не подтверждается закреплённым TS source. В [getPositionStatus](https://github.com/AdrenaFoundation/adrena-sdk-ts/blob/main/src/core/positionStatus.ts), blob `80124521f6df2652c9a3414c9c25964c91326343`, нет liquidationPrice в явном return. В связанном [464-byte Position layout](https://github.com/AdrenaFoundation/adrena-sdk-ts/blob/main/codama-generated/accounts/position.ts) именованного liquidationPrice тоже нет. liquidationFeeUsd — комиссия; entry/SL/TP prices не заменяют liquidation price. Новую модель из PnL не строить. F574 frozen остаётся неизменным историческим lead.

core.js оказался45-byte wrapper на dist/src/core; dist в прочитанном Git tree отсутствует. Исследован его кандидат build-source; parity опубликованного npm/dist с ним не доказана. Wallet типизирован как TransactionSigner, но pinned TS функция и её read helpers его не используют: signing/broadcast/simulation calls0. Код не исполнялся, кошельки/ключи не создавались.

## Реальная цепочка и часы

Успешный source path: single position fetch → main-pool fetch → custody batch fetch → один Hermes price fetch. Первые3 — account-read стадии (getAccountInfo/getMultipleAccounts interfaces); физический HTTP upper bound UNKNOWN из-за SolanaKit batching/transport и размера custody list. Это не один HTTP на SDK call. Position commitment не задан в caller; pool/custodies — confirmed. Согласованного общего slot/minContextSlot в этой цепочке не доказано.

Исходные position openTime/updateTime конвертируются как Unix seconds, но не являются временем генерации нового RPC snapshot. Interest helper использует локальный Date.now(), не chain clock. Hermes содержит publish_time/confidence/slot в типе ответа, но helper возвращает лишь adjusted price. Timestamp/confidence не сохраняются и не проверяются. JITOSOL→SOL и WBTC→BTC — substitutions в SDK; цена/asset equivalence не доказана.

Код нормализует price через10^10, sizeUsd/exitFeeUsd через10^6; RATE_DECIMALS=9. Это documentary code scales, не actual unit qualification. Interest описан как USD1e6, затем форматируется с collateral-custody decimals; точный formatter contract остаётся пробелом. Long preFeePnL использует abs, а native funding paid/received поля не входят в этот PnL. Этот helper не доказан полным risk/fee engine.

Position содержит id:u64, owner/pool/custodies и clocks, но текущий OPEN filter и id/PDA lifecycle не доказаны. Caller side!=1 автоматически трактуется SDK как short; протокольная enum validation здесь не установлена. main-pool задаётся явно; generated ADRENA_PROGRAM_ADDRESS ещё не прочитан и не приравнен по догадке к helpers constant.

## Текущий публичный RPC и Perennial

[Primary Solana docs](https://solana.com/docs/references/clusters) документируют mainnet `https://api.mainnet.solana.com` как публичный endpoint. Listed per-IP limits:100requests/10s,40дляsingleRPC/10s,40concurrent и40newconnections/10s; transfer100MB/30s не является per-response limit. Docs предупреждают, что limits меняются и public endpoints не предназначены для production SLA. Это current public/keyless access без обещания вечной цены; Worker reachability и реальная capacity не проверялись. SDK/Hermes/Pyth quotas и отдельные ROOT native admissions этим не заменяются. RPC/Worker test0.

Для Perennial прочитан новый [big6Utils.ts](https://github.com/equilibria-xyz/perennial-v2-sdk-ts/blob/main/src/utils/big6Utils.ts), blob `12a7895aeca55fdcdd707e66900e33fda871048e`: fixed6/BASE1e6 и явные mul/div. Null→0, divide-by-zero→0 и unsafe float — helpers, не source facts. F574 positionUtils переиспользован локально, web не повторялся. Raw snapshot/payoff/collateral binding всё ещё требует непрочитанных chain.ts/index.ts; native units/clock/Worker остаются NOT_CHECKED.

## Передача

F575B — отдельный допуск:10/10attempts,0/2searches; total остаток0. F575 остаётся EXPIRED_UNSPENT0, не возврат и не renewal. Все Git blobs/SHA256 проверены на bytes; vendor code не запускался. Native RPC/market/metadata/SQL/TG/Worker/privatecaptures/account discovery0, tests0. Production modules/routes/registry не менялись; новых карт/зон0; all550NOT_CHECKED. Старые расходы/unknowns/reserves/caps/9пауз/2deferrals сохранены.

ROOT получает точный gap: нужен другой реальный vendor liquidation-price output/full-risk implementation; текущий getPositionStatus не обосновывает native map probe. Исходные0674/unified384e прежние. Fresh main `711bbd2b163036fe949bc03760b330433aff0fb0`, own75min CAS `3ed3d00796179b19e7a386c364843ec48518db78` FULL; core guards/all4 совместимы, updated window прочитан. Итог — prerequisite correction, не готовый producer или native admission.
