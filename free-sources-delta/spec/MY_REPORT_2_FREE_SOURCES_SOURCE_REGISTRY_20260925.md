# MY REPORT 2 — FACTUAL SOURCE REGISTRY — FREE SOURCES DELTA — 2026-09-25

Status: `CANDIDATE_ONLY / FACTUAL_REGISTRY / NOT_PRODUCTION`

Production/main remains `08d98579c5ecbeb4de426ffeb1160f25ece52708`. A source is not called active merely because an adapter/file/allowlist exists. The status below requires the strongest factual proof currently available. Candidate live probes may lower/clarify a status, but they never auto-promote a source to production.

## Status contract

`PRODUCTION` = existing production runtime has a factual path/receipt for at least the stated scope.  
`CANDIDATE` = candidate code exists and is locally tested, but live runtime/storage/consumer proof remains open.  
`SHADOW` = measurement/advisory path only; not allowed to decide a final state by itself.  
`NOT_CONFIGURED` = no proven current runtime configuration/consumer.  
`UNSUPPORTED` = endpoint/asset/metric explicitly unsupported.  
`BLOCKED` = owner authorization/account/secret or other protected dependency is required.

## Registry

| Source | Status | Real producer / response | Identity + normalization | Storage/cache | Consumer | Runtime/report effect | Remaining proof |
|---|---|---|---|---|---|---|---|
| HTX | PRODUCTION | Existing execution/market runtime; official USDT-M public APIs | Existing HTX exact contract/execution identity | Existing D1/runtime receipts | Stage0/Deep Check/TZ execution/Hard Gates | Execution eligibility, turnover, fees only when factual receipt exists | Private `swap_fee` remains separately blocked without owner-approved read-only secret |
| Binance Live Public | PRODUCTION | Production cross-venue overlay uses Binance Spot fallback; historical public-WS microstructure path is recorded | Exact USDT Spot verification + timestamp/source receipts | Existing public-evidence/microstructure receipts | Cross-venue, early/microstructure chain | External Spot fallback, RS/flow/book evidence; can reach canonical result | Broader futures use remains per-metric; do not treat archive as realtime |
| Binance Public Data Archive | CANDIDATE | V3 probe exposed an incorrect kline filename; V4 uses official `SYMBOL-INTERVAL-DATE.zip` naming and verifies a downloaded Spot ZIP against `.CHECKSUM` | Spot vs USD-M split; sec/ms/us normalization; checksums | Maintenance artifacts/aggregates only; no raw trade D1 dump | Backcheck/history lane → later features/replay | No direct hot-cycle decision yet | V4 live checksum PASS + source→feature→priority proof |
| Bybit | PRODUCTION | Existing official public derivatives adapter | Venue/market identity in production public-evidence contract | Existing receipts | Cross-venue derivatives | OI/funding/flow context | Keep metric-specific source exhaustion/freshness |
| OKX | PRODUCTION | Existing derivatives + Spot public adapter | Exact instrument type/alias verification | Existing receipts | Cross-venue + primary external Spot verification | External Spot/derivatives facts | No new work except richer fact schema retrofit |
| Gate | PRODUCTION | Existing public derivatives adapter | Exact USDT-perp verification | Existing receipts | Cross-venue derivatives | Third/fallback derivatives context | Preserve conflict, never average |
| Hyperliquid | PRODUCTION (existing recorder scope) | Existing whale-event/Smart Money recorder; official public Info endpoint supports metadata/funding/book/user state | Metric receipt required; known addresses are a sample only | Existing recorder receipts | Existing Smart Money path | Only factual metric receipts can affect/explain; never a global HTX liquidation map | Extension methods must pass bounded candidate probe and existing-consumer audit |
| ByKaranteli | SHADOW | Existing advisory Smart Money/liquidation path recorded in checkpoints | Existing project-specific mapping | Existing advisory receipts where present | Supporting/Smart Money advisory | May support explanation; not proof of full market | Critical classification/coverage still open |
| DEX Screener | CANDIDATE | V3 bounded Node24 probe returned HTTP 200 | New chain+pool identity bridge prepared | Candidate probe/normalized pool observation only | Candidate advisory DEX context | No production decision effect | Factual storage + existing analytical consumer proof |
| GeckoTerminal | CANDIDATE | V3 bounded Node24 probe returned HTTP 200 | Same pool dedupe with DEX Screener | Candidate probe only | Candidate advisory DEX context | No production decision effect | Consumer proof; keyless remains non-critical/low-frequency |
| DefiLlama | CANDIDATE | V3 bounded Node24 probe returned HTTP 200; V4 uses smaller health payload endpoint | Protocol/network identity | Candidate advisory normalization only | Supporting context | No production decision effect | Storage/consumer proof; unlock/emissions Pro not claimed free |
| CoinGecko | NOT_CONFIGURED | Keyless public access exists but official docs warn against production polling/high frequency | Asset identity required | None as critical dependency | Optional low-frequency fallback only | No production-critical effect | Demo/free-key decision only if needed; no auto paid upgrade |
| Coinalyze | NOT_CONFIGURED | Mentioned historically, but no current factual adapter→consumer proof found in candidate/runtime lineage | Unknown | None proven | None proven | None | Re-audit only if an actual free route is needed |
| Etherscan | NOT_CONFIGURED | Mentioned historically; no current factual runtime consumer proof closed | EVM contract identity required | None proven | None proven | None | Keep unclaimed unless actual configured free route exists |
| GoPlus Security | CANDIDATE | V3 bounded Node24 probe returned HTTP 200 without secret; official support page states free API with 30 calls/min | Exact chain+contract; UNKNOWN/UNSUPPORTED != SAFE | Candidate probe receipt only; slow-changing cache/persistence still pending | Supporting Risk only | No new Hard Gate; no directional vote | Bind cached factual receipt to existing Supporting Risk consumer/canonical output; optional bearer may be used only if later needed |
| Alchemy Free | BLOCKED | Candidate EVM JSON-RPC contract prepared | txHash+logIndex, chain+contract, reorg/dedupe | None until owner-approved key | Bounded on-chain Supporting context | No production claim | Owner approval for free account/key in protected secrets |
| Solana Public RPC | CANDIDATE | `getSignaturesForAddress`/`getTransaction` bounded path prepared | Case-sensitive mint + network identity; supported program decoding only | Candidate bounded event records | On-chain Supporting context | Missing/unsupported never means no activity | Candidate runtime stability/quota/storage/consumer proof; never sole critical dependency |
| Bitget | SHADOW | Official public read-only market methods documented; measurement plan covers Spot + USDT futures | Category/symbol/quote/market type retained | CI measurement artifact only | Coverage measurement only | No voting/no final-state influence | Measure overlap/freshness against HTX universe, then decide whether it adds independent information |
| Coinbase Exchange | SHADOW | Public REST/WS Spot context documented | Product base+quote; USD/USDT/USDC distinct; sequence recovery | CI measurement artifact only | Independent Spot context measurement | No negative signal for absence; no “institutional buying” claim | Measure HTX overlap + live sequence/recovery before wiring consumer |
| Deribit | SHADOW | Public options summary; candidate uses production `www.deribit.com`, not docs’ testnet example | BTC/ETH option background only | CI probe artifact | Market-risk advisory only | Never direct altcoin trigger/Hard Gate | Keep disabled if incremental utility is not measurable |

## Required semantics retained

- `missing != zero`
- `stale != current`
- `rate limit != signal`
- `timeout != zero`
- `unsupported != zero / safe`
- `quota exhausted != data absent`
- `conflict != average`
- Source presence in code or allowlist is not runtime proof.
- Third venue does not automatically resolve a conflict by voting; the factual divergence must remain recorded.
