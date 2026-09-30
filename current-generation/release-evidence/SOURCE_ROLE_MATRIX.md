# Source role matrix

2026-09-30 final stage: PR25 release764f0aae36225d452ce73cae25b927c14c2cac82 after exact CI36697924721. PR24 full36696678060 exposed an unknown-source-clock canonical failure; this is a failed acceptance observation, not a healthy no-idea proof. PR25 full36698165774 persists a rejected candidate and reports insufficient data honestly. Standalone36698380288 is CLOSED with explicit GMX/Lighter unknown-state-time labels. Telegram verification sends0. The historical table below preserves earlier scoped evidence only.

| Source / role | Latest scoped result | Admission |
|---|---|---|
| HTX actual taker trades | Bounded exact SOL/LINK samples, lossless IDs, actual quote turnover | Context only; not full CVD, no independent extra direction vote |
| CoinPaprika sector | LINK membership failed; UMA peers usable but no current HTX market; JUP ambiguous IDs | Registry remains disabled |
| Chainlink RSS | Transport fetch failed in36692544063 | Not a working feed claim |
| Ethereum finalized events / Aave | LDO126 logs with1 timed event; LINK Aave0 in last256 finalized blocks in36694180827 | Neutral bounded context; empty sample is not whole-market zero |
| Solana finalized supply | Exact JUP source clock, supply delta -35539 raw units in36694180827 | Context; no verified burn transaction/price direction |
| HTX daily trade archive | Legacy host transport failed; current official host returned404 for SOL-USDT2026-09-28 in36694848271 | Not admitted to volume profile |
| HTX minute candles | Exact1440 minutes for2026-09-28 after correcting size/from/to exclusivity | Valid OHLCV; intraminute volume-at-price remains unknown |
| DexPaprika free | Exact JUP mint/chain and fresh aggregate DEX metrics, two bounded probes | Research only; does not provide HTX executed volume-at-price |
| Source operational health | PR24 live journal36695962137 and PR25 production36698165774 persist/read actual-attempt observations; cached reuse and quota skips are excluded | Diagnostics only; predictive activation remains T16.5 gated |


## Historical and scoped role inventory

Rows retain their original run IDs; newer scoped findings above supersede earlier pending statuses.

| Source | Primary role | Direction policy | Runtime state |
|---|---|---|---|
| HTX | universe, execution truth, prices, book, OI, funding, candles, outcomes | authoritative for its market | ACTIVE_EXISTING |
| PublicNode / Solana RPC | finalized exact-address total-supply observations and deltas | context only until a matching finalized mint/burn transaction closes the event; Solana address case is preserved | LIVE_PUBLICNODE_CLOSED run 36370188170; Solana transport remains pending |
| Sourcify v2 | exact EVM contract ABI/schema verification | N17 quality context only; never a market-direction vote and never proof that a ticker owns an address | LIVE_CLOSED run 36370644221, exact LINK ABI, HTTP 200 |
| Bluesky public search | exact contract/mint-address unique-author attention | N06 priority context only after 30 windows over seven days; no ticker-only matching and no direction vote | ACCESS_BLOCKED_403 run 36371075809; no bypass, global six-hour backoff |
| Binance / Bybit / OKX | independent depth/derivatives/live liquidation context | only mapped measured features; OKX units required | ACTIVE_EXISTING, bounded rotation |
| Coinalyze | historical liquidation/OI/funding baseline | counts do not select direction | LIVE_HISTORY_CLOSED run 36369369843, AKE-USDT, 2 HTTP / 5 provider units |
| Hyperliquid native | verified native positions/levels | observed levels only | ACTIVE_IF_EXACT_MARKET |
| LiqFlow | discovery of relevant Hyperliquid accounts | no independent duplicate vote | PUBLIC_PILOT_OR_KEY |
| Lighter / GMX / gTrade | native positions/fees/levels | exact venue identity; receipt-only contexts cannot score or supply targets | LIVE_BOUNDED_ROTATION: Lighter SOL run 36375513014; gTrade SOL run 36385863377 (22 positions, 5 zones); GMX XRP run 36386584847 (HTX-active alt selected from open-position census, 3 zones) |
| 0xArchive | bounded projected HL level buckets | one-credit route only | LIVE_READINESS_CLOSED run 36369369843; existing key, one-credit route, 5,000 monthly cap, no automatic top-up |
| CoinLobster | cached whale/liquidation context | advisory, symbol sliced | ACTIVE_EXISTING |
| DEX Screener / GeckoTerminal | exact address/pool identity and activity context | buy/sell counts are direction-neutral | ACTIVE_CONDITIONAL |
| DefiLlama | exact protocol TVL context | direction-neutral | ACTIVE_CONDITIONAL |
| GoPlus | exact token risk | adverse risk only | ACTIVE_CONDITIONAL |
| Solana RPC supplemental activity | exact mint/account activity context | signature count is direction-neutral and is not supply proof | ACTIVE_CONDITIONAL |
| Bitget / Coinbase | conditional independent market validation | price coincidence is direction-neutral | ACTIVE_CONDITIONAL |
| Deribit BTC/ETH | global market risk | risk-off may reduce suitability; no alt direction | ACTIVE_CACHED |
| HTX public risk | N08/N09/N11/N16 execution state and isolated/cross risk ladders | restriction is adverse risk only; normal state is context | LIVE_SMOKE_CLOSED run 36365551502; 3 sequential HTTP 200 calls, 60m cache, 144/day cap |
| Chain RPC / Official events | N01–N05, N07–N09, N13 | typed risk/context rules only | CHAIN LIVE; versioned LINK/LDO identities and domains active; LDO exact RSS HTTP 200 in run 36374604763; unsupported HTML pages remain explicitly disabled rather than guessed |
| GDELT / Bluesky | discovery/attention only | no headline/social direction | GDELT exact-name/domain runtime wired but still externally rate-limited 429 in run 36386110377 after a delayed retry; Bluesky access blocked 403; neither fabricates evidence or retries during backoff |
| Snapshot / Sourcify | governance dates / ABI validation | no market vote | BOTH LIVE_TRANSPORT_CLOSED: Sourcify LINK run 36370644221; exact Lido Snapshot run 36375243163 (HTTP 200, stale-only payload, zero evidence) |
| Deribit alt options | exact active alt option liquidity context | context only; no directional bonus | LIVE_SMOKE_CLOSED run 36368924281; exact SOL catalog/summary HTTP 200 |
| BLS / Fed calendars | macro recheck timing | no universal direction | LIVE_TRANSPORT_SMOKE_CLOSED run 36368211511; bounded-horizon correction local-closed |
| Blockscout | indexed fallback for exact on-chain facts | same event as RPC is one vote; provisional indexed rows trigger verification only | LIVE_CLOSED run 36385987034: LINK exact address, HTTP 200, 50 transfers, 30 credits, 99,970 remaining; 96 requests/5,000 internal credits per day |

Unavailable, stale, wrong-identity or unmapped data contributes exactly zero and is never redistributed to remaining sources.
