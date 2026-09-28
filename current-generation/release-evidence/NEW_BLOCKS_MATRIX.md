# N01–N17 block matrix

| Block | Existing consumer | Local state | Live state |
|---|---|---|---|
| N01 Unlocks | supporting risk / recheck | VALIDATED | WAITING_ADAPTER_SMOKE |
| N02 Mint/supply | supply risk | LIVE_TRANSPORT_CLOSED_EXACT_SUPPLY_OBSERVATION | Run 36370188170 closed PublicNode; matched finalized mint tx remains required for directional/risk use |
| N03 Buyback/burn | money-flow context | VALIDATED | WAITING_ADAPTER_SMOKE |
| N04 Transfers | transfer investigation | CHAIN RPC plus key-gated Blockscout exact-token runtime wired | BLOCKSCOUT LIVE_CLOSED run 36385987034; indexed rows remain provisional until primary finality check |
| N05 Exchange flows | market-flow confirmation | VALIDATED | WAITING_VERIFIED_LABELS |
| N06 Social activity | early-interest priority | RUNTIME_WIRED_EXACT_ADDRESS_BLUESKY, direction-neutral | ACCESS_BLOCKED_403 run 36371075809; global backoff active, then 7D/30 windows required |
| N07 Official news | official-event risk | EXACT_DOMAIN_RSS_ATOM_ICS_RUNTIME_WIRED; versioned exact identity/domain registry active; registered parser format enforced; unsupported HTML explicitly disabled; GDELT discovery cannot score | LDO exact `FIXED_RSS_V1` live transport closed in run 36374990210; LINK/LDO registry inputs closed; GDELT HTTP 429 backoff active |
| N08 Listing/delisting | execution gate | VALIDATED, live HTX state path wired | HTX transport smoke closed; no adverse N08 event occurred naturally |
| N09 Margin/risk limits | execution eligibility | VALIDATED, live HTX isolated/cross ladders wired | LIVE_SMOKE_CLOSED run 36365551502, NEAR-USDT, all three routes HTTP 200 |
| N10 Stop scenario | target/path invalidation | VALIDATED, score cap 0 | existing technical engine |
| N11 Liquidity durability | execution stress | VALIDATED, HTX rules context wired | partial existing books; HTX rules transport smoke closed |
| N12 Real large trades | money-flow diagnostic | VALIDATED | WAITING_7D/100_TRADES |
| N13 Calendar | recheck scheduler | VALIDATED, score cap 0, BLS/Fed runtime wired with shared 6h cache and bounded 24h-back/90d-forward horizon; exact Snapshot governance dates wired | BLS/Fed live run 36368211511; exact Lido Snapshot HTTP 200 run 36375243163 returned only stale proposals and correctly added zero evidence |
| N14 Alt options | options risk context | VALIDATED, Deribit exact active-instrument runtime wired, no new directional bonus | LIVE_SMOKE_CLOSED run 36368924281; SOL market present but liquid count was truthfully zero |
| N15 Sector relative strength | sector benchmark | VALIDATED | WAITING_LIVE_PEER_SET |
| N16 Execution/liquidity risk | execution cost gate | VALIDATED, HTX rules context wired | partial existing books; HTX rules transport smoke closed |
| N17 Source deterioration | evidence admission | LIVE_SOURCIFY_SCHEMA_CONTEXT, score cap 0 | Run 36370644221 closed exact ABI; longitudinal health series remains pending |

All blocks share the frozen canonical manual/Telegram path through `internal_market_context.evidence_v2`; none creates a new user-visible section or a second score owner.
