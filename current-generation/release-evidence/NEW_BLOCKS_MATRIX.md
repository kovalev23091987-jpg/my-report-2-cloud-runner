# N01–N17 block matrix

Updated 2026-09-30 09:50 UTC. PR23, PR24 and PR25 are deployed. Runtime release 764f0aae36225d452ce73cae25b927c14c2cac82; exact PR25 CI 36697924721 passed all current-generation tests/syntax, 20 early and 37 integration cases. Full report 36698165774 correctly returns PARTIAL_DATA_UNAVAILABLE for DEEP_DATA_INSUFFICIENT, while its rejected canonical candidate is persisted. Standalone SOL 36698380288 is CLOSED and explicitly labels unknown source-state times. Both verification modes had Telegram disabled. These are engineering acceptance receipts, not all-data/all-sources acceptance. See POST_RELEASE_20260930.json.

Volume-profile research has zero score/entry/target permission. One exact day of minute OHLCV and exploratory sensitivity are verified; complete executed volume-at-price and incremental predictive usefulness remain unproven.

| Block | Existing consumer | Local state | Live state |
|---|---|---|---|
| N01 Unlocks | supporting risk / recheck | NORMALIZER_ONLY | OPEN: verified exact vesting schedule and live adapter not available |
| N02 Mint/supply | supply risk | LIVE_TRANSPORT_CLOSED_EXACT_SUPPLY_OBSERVATION | Run 36370188170 closed PublicNode; matched finalized mint tx remains required for directional/risk use |
| N03 Buyback/burn | money-flow context | Finalized ERC20 burn decoder and exact Solana supply delta; score remains zero | JUP supply decreased 35539 raw units in run36694180827; this is not a verified buyback or causal directional event |
| N04 Transfers | transfer investigation | CHAIN RPC plus key-gated Blockscout exact-token runtime wired | BLOCKSCOUT LIVE_CLOSED run 36385987034; indexed rows remain provisional until primary finality check |
| N05 Exchange flows | market-flow confirmation | NORMALIZER_ONLY | OPEN: no official verified exchange-address labels; arbitrary transfer is not exchange flow |
| N06 Social activity | early-interest priority | RUNTIME_WIRED_EXACT_ADDRESS_BLUESKY, direction-neutral | ACCESS_BLOCKED_403 run 36371075809; global backoff active, then 7D/30 windows required |
| N07 Official news | official-event risk | EXACT_DOMAIN_RSS_ATOM_ICS_RUNTIME_WIRED; versioned exact identity/domain registry active; registered parser format enforced; unsupported HTML explicitly disabled; GDELT discovery cannot score | LDO exact `FIXED_RSS_V1` live transport closed in run 36374990210; LINK/LDO registry inputs closed; GDELT HTTP 429 backoff active |
| N08 Listing/delisting | execution gate | VALIDATED, live HTX state path wired | HTX transport smoke closed; no adverse N08 event occurred naturally |
| N09 Margin/risk limits | execution eligibility | VALIDATED, live HTX isolated/cross ladders wired | LIVE_SMOKE_CLOSED run 36365551502, NEAR-USDT, all three routes HTTP 200 |
| N10 Stop scenario | target/path invalidation | VALIDATED, score cap 0 | existing technical engine |
| N11 Liquidity durability | execution stress | VALIDATED, HTX rules context wired | partial existing books; HTX rules transport smoke closed |
| N12 Real large trades | money-flow diagnostic | PR23 bounded actual HTX trades deployed; lossless IDs and units | run36692544063: live bounded context; complete CVD and predictive baseline remain open |
| N13 Calendar | recheck scheduler | VALIDATED, score cap 0, BLS/Fed runtime wired with shared 6h cache and bounded 24h-back/90d-forward horizon; exact Snapshot governance dates wired | BLS/Fed live run 36368211511; exact Lido Snapshot HTTP 200 run 36375243163 returned only stale proposals and correctly added zero evidence |
| N14 Alt options | options risk context | VALIDATED, Deribit exact active-instrument runtime wired, no new directional bonus | LIVE_SMOKE_CLOSED run 36368924281; SOL market present but liquid count was truthfully zero |
| N15 Sector relative strength | sector benchmark | PR23 exact CoinPaprika adapter; registry disabled | LINK functional membership not closed; UMA peers valid but UMA absent HTX universe; JUP ambiguous provider IDs |
| N16 Execution/liquidity risk | execution cost gate | VALIDATED, HTX rules context wired | partial existing books; HTX rules transport smoke closed |
| N17 Source deterioration | evidence admission | Exact ABI context plus PR24 bounded operational journal, production readback logged by PR25 | Live storage/readback36695962137 and production36698165774 verified. Last10 attempted responses per exact market; score0. Longitudinal deterioration, predictive weights and quarantine remain unactivated |

Applicable full-report EvidenceV2 roles enter the existing canonical path through `internal_market_context.evidence_v2`. Standalone liquidation collection has its own existing scoped source lanes; this does not prove every N block is called in both modes. Receipt-only foreign-venue samples are displayed with unknown source-state time and excluded from dynamic score/target evidence. No second score owner is introduced.
