# MY REPORT 2 — OFFICIAL SOURCE VERIFICATION — 2026-09-25

Status: `DOCUMENTATION_VERIFIED / RUNTIME_AVAILABILITY_SEPARATE / NOT_PRODUCTION`

This document records what official documentation supports. It does **not** upgrade any source to production. Candidate runtime/live-probe proof remains separate.

| Source | Official starting point | Verified capability / important limit | Candidate interpretation |
|---|---|---|---|
| Binance Public Data | https://github.com/binance/binance-public-data and https://data.binance.vision | Spot and USD-M public archives; trades/aggTrades/klines including 1m/3m/5m; checksum files; archive delay; Spot timestamps from 2025 may use microseconds | History/maintenance only; checksum and timestamp normalization mandatory |
| Bitget | https://www.bitget.com/docs/catalog/market/market-data | Current public market docs expose instruments, orderbook, public fills and candles across Spot/Futures. Classic public futures docs expose OI/current+history funding/ticker with mark/index fields. Published limits are generally per-IP and endpoint-specific | Measurement-only until overlap/freshness/utility is measured against HTX; no auto voting |
| Coinbase Exchange | https://docs.cdp.coinbase.com/exchange/websocket-feed/channels | heartbeat/ticker have sequence context; matches can be dropped, so gaps must be detected and REST trades used for recovery; product quote currencies are explicit | Independent Spot context only; USD/USDT/USDC distinct; buys not labelled institutions |
| Alchemy | https://www.alchemy.com/pricing | Free tier advertised with 30M compute units/month; throughput expressed in compute units, not equal-cost request count | Key/account required; BLOCKED pending owner approval and protected secret |
| Solana | https://solana.com/docs/rpc/http/getsignaturesforaddress ; https://solana.com/docs/rpc/http/gettransaction ; https://solana.com/docs/rpc/websocket/logssubscribe | Account signatures and confirmed tx retrieval; logs subscriptions; public RPC has operational limits | Bounded candidate-only path; not sole critical dependency |
| GoPlus | https://docs.gopluslabs.io/reference/support and Token Security reference | Official support page states the Security API is free with 30 calls/min; token-security reference exposes an optional-looking Authorization header. V3 bounded candidate probe returned HTTP 200 without a secret | Candidate default is keyless free; optional bearer remains supported but is not required by current observed endpoint behavior. Still Supporting Risk only, never a new Hard Gate |
| Hyperliquid | https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint | Official Info endpoint documents `metaAndAssetCtxs`, `fundingHistory`, `l2Book`, user clearinghouse state and weighted rate limits | Extend existing recorder only; known addresses are samples; never a global/HTX liquidation map |
| DEX Screener | https://docs.dexscreener.com/api/reference | Public pair/token endpoints with explicit rate limits | Candidate pool context; chain+pool identity and dedupe required |
| GeckoTerminal / CoinGecko keyless | https://docs.coingecko.com/docs/keyless-public-api | Keyless access has significantly lower limits; official guidance says it is not suitable for production workloads, scheduled polling or high-frequency updates | Optional/low-frequency only; never critical production dependency |
| DefiLlama | https://github.com/DefiLlama/api-sdk | Free API/SDK includes core TVL/price/network and available volume/fees context; token unlock/emissions areas are Pro/keyed | Only actually free fields; TVL USD growth not automatically capital inflow |
| HTX | https://huobiapi.github.io/docs/usdt_swap/v1/en/ | `swap_contract_info` public; private read-only trading fee method `/linear-swap-api/v1/swap_fee` documented | No private fee call without separate owner approval; no zero fee substitute |
| Deribit | https://docs.deribit.com/api-reference/market-data/public-get_book_summary_by_currency | Public option summaries; documentation examples may use testnet | Candidate explicitly probes `www.deribit.com` production endpoint; second-priority market background only |

## Rule

Documentation proves only that a method is specified. It does not prove that the project executor can reach it, that the asset is supported, that the response is fresh, or that a downstream consumer uses the fact. Those are separate acceptance conditions in R067/R084/R085.
