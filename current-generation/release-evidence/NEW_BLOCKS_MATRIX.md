# N01–N17 block matrix

| Block | Existing consumer | Local state | Live state |
|---|---|---|---|
| N01 Unlocks | supporting risk / recheck | VALIDATED | WAITING_ADAPTER_SMOKE |
| N02 Mint/supply | supply risk | VALIDATED | WAITING_ADAPTER_SMOKE |
| N03 Buyback/burn | money-flow context | VALIDATED | WAITING_ADAPTER_SMOKE |
| N04 Transfers | transfer investigation | VALIDATED | WAITING_ADAPTER_SMOKE |
| N05 Exchange flows | market-flow confirmation | VALIDATED | WAITING_VERIFIED_LABELS |
| N06 Social activity | early-interest priority | VALIDATED, direction-neutral | WAITING_7D_BASELINE |
| N07 Official news | official-event risk | VALIDATED | WAITING_ADAPTER_SMOKE |
| N08 Listing/delisting | execution gate | VALIDATED | WAITING_ADAPTER_SMOKE |
| N09 Margin/risk limits | execution eligibility | VALIDATED | WAITING_ADAPTER_SMOKE |
| N10 Stop scenario | target/path invalidation | VALIDATED, score cap 0 | existing technical engine |
| N11 Liquidity durability | execution stress | VALIDATED | partial existing books |
| N12 Real large trades | money-flow diagnostic | VALIDATED | WAITING_7D/100_TRADES |
| N13 Calendar | recheck scheduler | VALIDATED, score cap 0 | WAITING_ADAPTER_SMOKE |
| N14 Alt options | options risk context | VALIDATED, no new directional bonus | WAITING_AVAILABLE_MARKET |
| N15 Sector relative strength | sector benchmark | VALIDATED | WAITING_LIVE_PEER_SET |
| N16 Execution/liquidity risk | execution cost gate | VALIDATED | partial existing books |
| N17 Source deterioration | evidence admission | VALIDATED, score cap 0 | local quality logic; live history pending |

All blocks share the frozen canonical manual/Telegram path through `internal_market_context.evidence_v2`; none creates a new user-visible section or a second score owner.
