# Source role matrix

| Source | Primary role | Direction policy | Runtime state |
|---|---|---|---|
| HTX | universe, execution truth, prices, book, OI, funding, candles, outcomes | authoritative for its market | ACTIVE_EXISTING |
| Binance / Bybit / OKX | independent depth/derivatives/live liquidation context | only mapped measured features; OKX units required | ACTIVE_EXISTING, bounded rotation |
| Coinalyze | historical liquidation/OI/funding baseline | counts do not select direction | ACTIVE_IF_FREE_KEY |
| Hyperliquid native | verified native positions/levels | observed levels only | ACTIVE_IF_EXACT_MARKET |
| LiqFlow | discovery of relevant Hyperliquid accounts | no independent duplicate vote | PUBLIC_PILOT_OR_KEY |
| Lighter / GMX / gTrade | native positions/fees/levels | exact venue identity required | ACTIVE_BOUNDED_ROTATION |
| 0xArchive | bounded projected HL level buckets | one-credit route only | ACTIVE_IF_EXISTING_KEY_AND_PROBE |
| CoinLobster | cached whale/liquidation context | advisory, symbol sliced | ACTIVE_EXISTING |
| DEX Screener / GeckoTerminal | exact address/pool identity and activity context | buy/sell counts are direction-neutral | ACTIVE_CONDITIONAL |
| DefiLlama | exact protocol TVL context | direction-neutral | ACTIVE_CONDITIONAL |
| GoPlus | exact token risk | adverse risk only | ACTIVE_CONDITIONAL |
| Solana RPC | exact mint/account facts | signature count is direction-neutral | ACTIVE_CONDITIONAL |
| Bitget / Coinbase | conditional independent market validation | price coincidence is direction-neutral | ACTIVE_CONDITIONAL |
| Deribit BTC/ETH | global market risk | risk-off may reduce suitability; no alt direction | ACTIVE_CACHED |
| HTX public risk | N08/N09/N11/N16 execution state and isolated/cross risk ladders | restriction is adverse risk only; normal state is context | LIVE_SMOKE_CLOSED run 36365551502; 3 sequential HTTP 200 calls, 60m cache, 144/day cap |
| Chain RPC / Official events | N01–N05, N07–N09, N13 | typed risk/context rules only | ADAPTER_FIXTURE_VALIDATED; LIVE_TRANSPORT/SMOKE_PENDING |
| GDELT / Bluesky | discovery/attention only | no headline/social direction | ADAPTER_FIXTURE_VALIDATED; SMOKE/BASELINE_PENDING |
| Snapshot / Sourcify | governance dates / ABI validation | no market vote | ADAPTER_FIXTURE_VALIDATED; SMOKE_PENDING |
| Deribit alt options | exact active alt option liquidity context | context only; no directional bonus | LIVE_SMOKE_CLOSED run 36368924281; exact SOL catalog/summary HTTP 200 |
| BLS / Fed calendars | macro recheck timing | no universal direction | LIVE_TRANSPORT_SMOKE_CLOSED run 36368211511; bounded-horizon correction local-closed |
| Blockscout | indexed fallback for exact on-chain facts | same event as RPC is one vote | WAITING_FREE_KEY |

Unavailable, stale, wrong-identity or unmapped data contributes exactly zero and is never redistributed to remaining sources.
