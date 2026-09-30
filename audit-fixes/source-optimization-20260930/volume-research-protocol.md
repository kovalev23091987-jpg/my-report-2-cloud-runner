# Volume profile: frozen research gate, 30 September 2026

The owner requested empirical and source checks before admitting horizontal volume into either report mode. This is research, not an enabled signal or a report target. No weights, quota ceilings, Telegram paths or entry conditions change.

## Evidence checked before the first data probe

Jozwicki and Trippner (2025), WIG20 January–June 2024, count 163 classified reactions, including overlapping patterns within one session. Table 1 has 48 consolidations and 100 rebounds. Their approximately 90% refers to categories of reactions, not 163 independent trades or a net profitable win rate. There is no comparable control-level trading backtest or demonstrated transfer to HTX crypto futures. Source: https://www.czasopisma.uni.lodz.pl/fipf/article/download/28410/27868/72359

Howard (2026), SSRN working-paper abstract, reports 6,284 ES breakout events across 13 months. Unfiltered mean is -2.20 ticks, day-clustered p=0.17; excluding one regime month gives -0.19 ticks, p=0.74. Full-text verification was unavailable, so this is limited abstract evidence, not independently reproduced research. Source: https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6350238

TradingView documents lower-timeframe construction and up/down-bar volume rather than actual aggressor-side volume. POC and the chosen value area describe past trading; row width and session selection matter. It states no public data/indicator API is available. Sources: https://www.tradingview.com/support/solutions/43000502040-volume-profile-indicators-basic-concepts/ and https://www.tradingview.com/support/solutions/43000474413-i-need-access-to-your-api-in-order-to-get-data-or-indicator-values/

The official HTX public-data repository documents daily linear-swap CSV archives, trade IDs, exchange timestamps, price, contract quantity, base quantity, quote turnover and checksum. This is the first source candidate because it matches the execution market. Current availability and completeness are not assumed. Source: https://github.com/hbdmapi/huobi_public_data

## Admission protocol

1. Probe one completed SOL-USDT UTC day (2026-09-28), at most one archive and one checksum, without retrying a denial. Also inspect one current minute-candle snapshot and one no-key exact JUP DexPaprika token response for feasibility. Each call is admitted within the existing audit envelope and durable source accounting. No production source is enabled by an HTTP success.
2. An archive must match exact venue/instrument/date and declared units, pass checksum, unique lossless trade IDs, bounded decompression and timestamp validation. Reconcile per-minute trade base volume and quote turnover with the exchange minute candles for the same completed day. A ZIP that merely parses is insufficient.
3. Use an explicitly specified UTC session and base-asset volume; keep quote turnover separate. POC is an interval, not a precise support price. Freeze bin width in tick units before evaluation; inspect half/double width sensitivity. A candle-spread profile is approximate and cannot stand in for executed volume at price. Capped REST trades cannot establish full-session coverage.
4. Before predictive use, preregister prior-session-only POC/VAH/VAL and first-touch events. Compare the existing report with and without the profile on the identical snapshots, plus equally distant price-only/random controls. Split training and untouched chronological test data; purge overlapping outcomes; cluster inference by day and asset; retain all missing and failed cases.
5. Measure incremental net expectancy after fees, funding and slippage, MFE/MAE, calibration, drawdown, delay, coverage and stability across long/short, liquidity and market regimes. Confidence intervals and multiple comparisons matter; a reaction percentage is not sufficient. Do not choose bins, assets or windows after seeing the best result.
6. Until both data and incremental-usefulness gates pass, keep score adjustment, entry permission and HTX target permission at zero. A historical volume cluster is not pending orders, open interest or a liquidation price. HTX tape, CVD and a profile of the same tape share a physical source and cannot become independent votes.
7. If admitted, first run an isolated comparison, then exact cloud CI, then full and standalone liquidation reports using the same canonical binding. The original thresholds, caps and publishing behavior must remain intact. Roll back the optional profile on source/data failure.

Current conclusion: a descriptive research layer is reasonable; stronger trade confirmation or predictive improvement is not yet demonstrated. Implementation into decisions remains blocked on the recorded gates, not on a new command from the owner.
