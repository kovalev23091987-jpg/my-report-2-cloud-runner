# Executed volume profile — explicitly authorized 2026-09-30

User removed the empirical usefulness prerequisite and explicitly requested influence on the block score and decisions, then cross-exchange confirmation. This supersedes earlier research-only gates for this feature. No profitability or superiority claim is made.

## Actual runtime route

HTX existing futures HTTP responses → lossless trade parser → replacement-only in-memory endpoint snapshots → per-minute reconciliation → exact 60-bin profile → MARKET_STRENGTH_SPOT supplemental score → existing canonical state/publication gates → manual and Telegram formatters. Worker core and formatter layout remain unchanged.

HTX local venue profile is not an all-market profile. Confirmations use separate Binance and Bybit USDT linear perpetual profiles, exact cached listed symbols, own trades and candles, equal closed periods and USDT price units. No volumes are added across venues and no peer level is relabelled as an HTX target. Multiplier symbols (1000...) and inverse/spot markets are not silently substituted.

Full reports reuse HTX responses (0 additional HTX calls). The runner's existing cross-exchange callback also collects peer snapshots, at most 2 HTTP per venue, 4 total, reserved in the existing 28-background/164-whole-job budget. Peer failure preserves the prior cross-exchange risk result. Standalone liquidation requests can read the 3 ready HTX endpoints; disclosed supplemental cap becomes 8 projected + 3 risk + 3 profile + 4 peer = 18. Existing paid budgets and 5-call specialist lane do not change. No additional polling or history accumulation. Normalized cache replaces its prior snapshot; raw endpoint snapshots are process-local and replaced, never merged.

## Admission and methodology

Only complete 240-, 60-, or 15-minute windows, longest comparable first. HTX count, contracts, base quantity, quote turnover and price extrema reconcile for every closed minute; exact long trade IDs are retained. Peers reconcile every minute's base and quote volumes and extrema, reject duplicate trade IDs; Binance IDs must be exactly representable. Candles supply coverage checks, not synthetic volume allocated to price. Missing data stays unavailable. All contributing snapshots and windows expire within 180 seconds. Last two confirming minute candles must have nonzero executed volume. Current reference price must agree with recent profile price; empty candles do not count as acceptance.

60 bins (HTX fewer if tick range requires), base volume, 70% contiguous value area, lowest-bin POC tie, greater-adjacent-volume expansion with upper tie. The row that reaches/exceeds 70% is included. This explicit convention is not claimed bit-identical to TradingView.

## Weight and decision effects

The profile is one responsibility family in MARKET_STRENGTH_SPOT (existing supplemental weight 30, chain adjustment cap ±3 points). Its own maximum is ±1.5 points for 4h, ±1 for 1h, ±0.5 for 15m, multiplied by 0.5 for HTX only, 0.8 for HTX plus one confirmed peer, 1 for two confirmed peers. A comparable conflicting peer sets this family's contribution to zero. Missing peers give no confirmation. These are conservative engineering allocations, not learned profitability weights.

Two active closed minutes accepting above VAH/below VAL yield positive/negative market direction; a confirmed POC recapture/loss yields half strength. Inside value area is neutral; price dislocation is rejected. The vote is inverted for a short thesis. POC proximity alone is not a directional signal. Existing physical-root/family dedup, all chain caps, total ±10 adjustment, score threshold, hard veto, targets and entry authorization remain authoritative. No automatic execution.

Peer confirmation requires identical start/end, compatible price, POC distance within a bounded 0.1–0.5% tolerance and at least 60% value-area intersection/union, plus same directional interpretation. Profiles can differ legitimately because venues have different trades. Multiple venues are separate evidence, not proof that reported volume is economically genuine or free of wash trading.

Liquidation panels retain original notional, prices and target eligibility. POC/VAH/VAL confluence reorders existing zones for review, with reduced single-venue priority and no priority boost under conflict. It contributes no second directional score in the derivatives block.

## Source choice

HTX is the execution-venue anchor, not established as globally best. Binance/Bybit direct ready histories supplement it. TradingView documents calculation from lower-timeframe bars; its newer official MCP (Essential+; trials excluded) documents OHLCV, screeners, news/calendars but no Volume Profile endpoint. CMC public endpoint catalogs and exposed technical tools document market totals/OHLCV/technical levels, not volume-at-price. They cannot honestly be treated as confirmed profile feeds. No subscription purchase, screen scraping or undocumented connector.

Official documentation checked 2026-09-30:
- https://www.tradingview.com/mcp/docs
- https://www.tradingview.com/support/solutions/43000502040-volume-profile-indicators-basic-concepts/
- https://coinmarketcap.com/api/documentation/pro-api-reference/endpoint-overview
- https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Compressed-Aggregate-Trades-List
- https://bybit-exchange.github.io/docs/v5/market/recent-trade
- https://bybit-exchange.github.io/docs/v5/market/kline

## Verification boundaries

Existing QNT wire, GitHub run 36704685645, replays to 1257 unique trades / 240 minutes / 967.36 QNT for the rolling 4h window ending 10:49 UTC. POC 284.9975 is historical evidence, not a current recommendation. One confirming minute has zero trades, so that snapshot is correctly neutral. A separately labelled controlled peer-agreement scenario validates actual canonical score changes and preserved veto; it is not an observed historical multi-venue agreement or a backtest. Bounded live acceptance checks ready endpoints once, no production DB writes, Telegram, trades, or new statistical campaign.
