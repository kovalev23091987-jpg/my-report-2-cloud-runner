# MY REPORT 2 — TRUTHFUL SOURCE CONNECTION MATRIX — 2026-09-25

The word "connected" is intentionally avoided as a single status. The columns separate implementation, runtime evidence, hot-cycle use and decision consumption.

| Source | Stage | Adapter/contract | V4 live/public proof | Hot cycle | Normalized fact | Decision consumer | Current effect |
|---|---|---:|---:|---:|---:|---:|---|
| HTX | PRODUCTION | yes | production/runtime | yes | yes | yes | execution + liquidity + market facts |
| Binance Live Public | PRODUCTION | yes | retained production | existing fallback | yes | yes | external Spot / market context |
| Binance Public Data Archive | CANDIDATE | yes | HTTP 200 + checksum/download proof | no | yes | maintenance/backcheck | historical only |
| Bybit | PRODUCTION | yes | retained production | yes | yes | yes | derivatives cross-venue |
| OKX | PRODUCTION | yes | retained production | yes | yes | yes | derivatives + Spot/relative strength |
| Gate | PRODUCTION | yes | retained production | yes | yes | yes | derivatives cross-venue |
| Hyperliquid | PRODUCTION scope + partial extension | existing recorder | HTTP 200 public info | bounded/existing | receipt-required | existing Smart Money consumer | only factual receipt metrics |
| DEX Screener | CANDIDATE | yes | HTTP 200 | no new hot call | candidate normalized pool context | advisory bridge partial | no final decision claim yet |
| GeckoTerminal | CANDIDATE | yes | HTTP 200 | no | candidate normalized pool context | advisory bridge partial | non-critical |
| DefiLlama | CANDIDATE | normalizer | HTTP 200 bounded endpoint | no | candidate context | supporting context partial | no inflow inference from TVL price move |
| GoPlus | CANDIDATE | yes | HTTP 200 keyless | no | yes | Supporting Risk partial | no Hard Gate |
| Solana Public RPC | CANDIDATE | yes | HTTP 200 | no | bounded event facts | on-chain context partial | not sole critical dependency |
| Bitget | SHADOW | yes measurement | HTTP 200; Futures overlap 87.25% | no | measurement | none for final decision | no voting/enablement |
| Coinbase Exchange | SHADOW | yes measurement | HTTP 200; Spot overlap 16.71% | no | measurement | none for final decision | absence is not negative |
| Deribit | SHADOW | yes measurement | HTTP 200 production endpoint | no | measurement | background only | disabled pending utility proof |
| ByKaranteli | SHADOW | existing path | receipt/key dependent | bounded | advisory | Smart Money/liquidation advisory | not critical without factual receipt |
| CoinGecko | NOT_CONFIGURED | partial/noncritical policy | no production-critical proof | no | no current critical receipt | none | keyless not critical dependency |
| Coinalyze | NOT_CONFIGURED | unverified current candidate | no | no | no | none | no claim |
| Etherscan | NOT_CONFIGURED | key path not configured | no | no | no | none | no claim |
| Alchemy | BLOCKED | candidate adapter contract | no owner-approved key | no | no live receipt | none | owner secret required |

Runtime usability is now separate from stage. A source is decision-usable only with a factual current runtime receipt/attempt and freshness/health/compatibility proof.
