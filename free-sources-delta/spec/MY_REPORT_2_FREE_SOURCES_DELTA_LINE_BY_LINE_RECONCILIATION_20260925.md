# MY REPORT 2 — FREE SOURCES DELTA — LINE-BY-LINE RECONCILIATION — 2026-09-25

Status: `CANDIDATE_ONLY / FULL_ORIGINAL_ADDENDUM_RECONCILED / NOT_PRODUCTION`

Priority used: freshest confirmed cloud checkpoint `MY_REPORT_2_FREE_SOURCES_DELTA_START_CHECKPOINT_20260925.md` + the full original user addendum. R001–R066 are preserved and not silently renumbered; only genuinely new semantics are appended as R067–R086.

Explicit clauses mapped below: **150**. This is the semantic line-by-line acceptance map; one original line may map to multiple durable R rows where it refines an existing rule.

| addendum_clause | full-original requirement | mapped requirement(s) | current status | reconciliation / evidence |
|---|---|---|---|---|
| 1.1 | Прочитать MASTER STATE / LATEST CHECKPOINT / CHANGELOG / matrix / текущее ТЗ / последние checkpoints и active rules | R001 + R065 + checkpoint | RETAINED | Fresh cloud state was read; FREE_SOURCES_DELTA_START is the base freeze. |
| 1.2 | Продолжать от самой новой подтверждённой версии; 08d98579 только историческая опора, без rollback | R001 | RETAINED | Current confirmed production remains exact 08d98579; no newer production proof was found. |
| 1.3 | Создать единую таблицу requirement→status→code→test→source→storage→consumer→report effect | R054 + R067 | IMPLEMENTED_PARTIAL | Merged 86-row matrix created; remote/live evidence remains open where marked. |
| 2.1 | Только отдельный candidate; без main/promotion/D1 migration/recipient/canary/Cloudflare/force push | R001 | RETAINED/EXTENDED | Implemented in package/workflow safety and resource policy; key-required paths blocked. |
| 2.2 | Не менять веса, стратегии, Decision Layer, Hard Gates, Telegram eligibility/final-chain | R061/R062 | RETAINED/EXTENDED | Implemented in package/workflow safety and resource policy; key-required paths blocked. |
| 2.3 | Не включать auto trading, validated signal, live probability | R004/R063 | RETAINED/EXTENDED | Implemented in package/workflow safety and resource policy; key-required paths blocked. |
| 2.4 | HTX остаётся execution; анализ может начинаться с лучшей площадки | R009/R013 | RETAINED/EXTENDED | Implemented in package/workflow safety and resource policy; key-required paths blocked. |
| 2.5 | Только бесплатные/public/permanent-free; no auto paid overage | R082 | RETAINED/EXTENDED | Implemented in package/workflow safety and resource policy; key-required paths blocked. |
| 2.6 | Ключи не слать в чат; key-required only protected store after owner approval | R070/R071 | RETAINED/EXTENDED | Implemented in package/workflow safety and resource policy; key-required paths blocked. |
| 3.1 | Не подключать повторно HTX/Binance/Bybit/OKX/Gate/Hyperliquid/DEX/Gecko/DefiLlama/CoinGecko/Coinalyze/Etherscan/ByKaranteli | R031 + R067 | IMPLEMENTED_PARTIAL | Registry audits existing lineage and creates no duplicate router. |
| 3.2 | Проверить реальный adapter, а не allowlist | R054 + R067/R080 | IMPLEMENTED_PARTIAL | Source Registry + producer/storage/consumer map; candidate live probes/CI still required for non-production sources. |
| 3.3 | Проверить нужен ли key | R054 + R067/R080 | IMPLEMENTED_PARTIAL | Source Registry + producer/storage/consumer map; candidate live probes/CI still required for non-production sources. |
| 3.4 | Проверить fresh real response from executor | R054 + R067/R080 | IMPLEMENTED_PARTIAL | Source Registry + producer/storage/consumer map; candidate live probes/CI still required for non-production sources. |
| 3.5 | Проверить identity/market/units | R054 + R067/R080 | IMPLEMENTED_PARTIAL | Source Registry + producer/storage/consumer map; candidate live probes/CI still required for non-production sources. |
| 3.6 | Проверить normalized fact | R054 + R067/R080 | IMPLEMENTED_PARTIAL | Source Registry + producer/storage/consumer map; candidate live probes/CI still required for non-production sources. |
| 3.7 | Проверить storage | R054 + R067/R080 | IMPLEMENTED_PARTIAL | Source Registry + producer/storage/consumer map; candidate live probes/CI still required for non-production sources. |
| 3.8 | Проверить analytical consumer | R054 + R067/R080 | IMPLEMENTED_PARTIAL | Source Registry + producer/storage/consumer map; candidate live probes/CI still required for non-production sources. |
| 3.9 | Проверить effect on selection/decision/explanation | R054 + R067/R080 | IMPLEMENTED_PARTIAL | Source Registry + producer/storage/consumer map; candidate live probes/CI still required for non-production sources. |
| 3.10 | Проверить Telegram/manual evidence | R054 + R067/R080 | IMPLEMENTED_PARTIAL | Source Registry + producer/storage/consumer map; candidate live probes/CI still required for non-production sources. |
| 3.11 | Проверить freshness/quota/retry/gap/error control | R054 + R067/R080 | IMPLEMENTED_PARTIAL | Source Registry + producer/storage/consumer map; candidate live probes/CI still required for non-production sources. |
| 3.12 | Статусы только PRODUCTION/CANDIDATE/SHADOW/NOT_CONFIGURED/UNSUPPORTED/BLOCKED | R067 | LOCAL_WIRED | source-registry.mjs enforces exact status set. |
| 3.13 | Переиспользовать capability registry/router/Stage0/V3/FMW/OI/MultiWave/scheduler/microstructure/opportunity/cost/canonical/formatters | R031 + R061 + R067 | IMPLEMENTED_AND_WIRED | Free summary plugs into existing canonical runtime; no second architecture. |
| 4.1.1 | Binance archive official data.binance.vision/github public data, trades/aggTrades/1m/3m/5m Spot/USD-M | R068 | IMPLEMENTED_PARTIAL | Adapter/history plan/tests created; remote checksum/download proof pending. |
| 4.1.2 | Archive delayed; checksum; sec/ms/us; Spot/Futures separated; no maker/taker overclaim; no full hot-cycle history | R068/R069/R082 | LOCAL_WIRED | All encoded in archive module/resource policy; live candidate proof pending. |
| 4.2.1 | Alchemy Free bounded networks/contracts/pools/addresses/logs/tx/liquidity | R071 | BLOCKED | Adapter/semantic tests prepared; owner key/account required. |
| 4.2.2 | EVM txHash+logIndex, reorg/dedupe, transfer/bridge/liquidity/multihop classification; known wallets not automatically smart | R086 | IMPLEMENTED_PARTIAL | Classifier tests pass; real storage/consumer proof pending. |
| 4.3.1 | Solana full identity: network+mint+coin+market; mint case preserved; ticker-only forbidden | R069/R072 | LOCAL_WIRED | Identity and RPC request tests pass. |
| 4.3.2 | getSignaturesForAddress/getTransaction/logsSubscribe as needed; unsupported explicit; public RPC not sole critical | R072/R086 | IMPLEMENTED_PARTIAL | HTTP request builders/classifier done; live stability/consumer proof pending. |
| 4.4.1 | GoPlus Token Security supporting risk; sale/transfer/mint/owner/concentration etc where available | R070 | IMPLEMENTED_PARTIAL | V3 Node24 keyless live probe returned 200; V4 keyless adapter contract prepared. Persistence/consumer proof remains open. |
| 4.4.2 | GoPlus unsupported/unknown != safe; cache slow facts; no new Hard Gate | R070/R080 | LIVE_REACHABILITY_PASS_PARTIAL | Keyless reachability proven; UNKNOWN/UNSUPPORTED remains fail-closed; no Hard Gate. Cache/consumer proof pending. |
| 4.5.1 | Bitget public read-only instruments/trades/candles/book/OI/funding/mark/index | R073 | IMPLEMENTED_PARTIAL | Measurement plan expanded to Spot + USDT-Futures methods; no hot wiring. |
| 4.5.2 | Measure HTX overlap/gaps/freshness/limits/independent value before enable; third source not voting | R073/R085 | IMPLEMENTED_PARTIAL | 4-call incremental coverage measurement created; candidate live run pending. |
| 4.6.1 | Coinbase matches/level2/ticker/heartbeat + REST gap recovery; quote normalization/sequence | R074 | IMPLEMENTED_PARTIAL | Probe plan/sequence tests done; live overlap/recovery proof pending. |
| 4.6.2 | Coinbase buys != institutions; absence not negative | R074 | LOCAL_WIRED | Semantic rule encoded/documented. |
| 4.7.1 | Hyperliquid extend existing recorder with metaAndAssetCtxs/fundingHistory/l2Book/clearinghouseState | R057/R075 | IMPLEMENTED_PARTIAL | Official methods verified; extension plan only; existing recorder retained. |
| 4.7.2 | Position increase/decrease/close/collateral/transfer/liquidation price observation separated; known addresses sample only | R075 | IMPLEMENTED_PARTIAL | Sampling/global-map restrictions encoded; exact position-delta extension still pending existing-recorder audit. |
| 4.8.1 | DEX Screener/GeckoTerminal pool/liquidity/turnover/buys/sells/new/trending context | R076 | IMPLEMENTED_PARTIAL | Pool normalizer/deduper and live probes prepared; no production consumer proof. |
| 4.8.2 | Same pool seen twice != two confirmations; buys != net inflow; ads != organic; chain+pool identity; no visuals | R076/R064 | LOCAL_WIRED | Focused tests pass. |
| 4.8.3 | CoinGecko/GeckoTerminal keyless not production critical/high-frequency; Demo key limits explicit if used | R077/R082 | IMPLEMENTED_PARTIAL | Registry policy set; no key or paid path used. |
| 4.9.1 | DefiLlama free only TVL/history/network/prices/available volume/fees; TVL USD growth != inflow; unlocks/emissions Pro not free | R077 | IMPLEMENTED_PARTIAL | Normalizer semantics + docs audit done; live consumer pending. |
| 4.10.1 | Bounded official site/blog/RSS/JSON/exchange/verified distribution event checks; source/publish/event/contract/type/confidence | R078 | IMPLEMENTED_PARTIAL | Receipt schema/test done; bounded fetcher/allowlist pending. |
| 4.10.2 | Rumors/unverified calendars excluded; limited coverage stated honestly | R078 | LOCAL_WIRED | Receipt requires official source/confidence. |
| 4.11.1 | Deribit BTC/ETH options second priority, public production not testnet, market-risk only, disable if no benefit | R079 | IMPLEMENTED_PARTIAL | Production endpoint probe plan created; utility proof pending. |
| 5.1 | Coverage map for candles/history anomaly volume: primary→fallback→third→history→freshness→normalization→storage→consumer→effect | R009/R010/R042/R054/R067/R080/R081 | IMPLEMENTED_PARTIAL | Producer/storage/consumer map created; per-block live closure remains source-specific. |
| 5.2 | Coverage map for spot flow: primary→fallback→third→history→freshness→normalization→storage→consumer→effect | R009/R010/R042/R054/R067/R080/R081 | IMPLEMENTED_PARTIAL | Producer/storage/consumer map created; per-block live closure remains source-specific. |
| 5.3 | Coverage map for futures flow: primary→fallback→third→history→freshness→normalization→storage→consumer→effect | R009/R010/R042/R054/R067/R080/R081 | IMPLEMENTED_PARTIAL | Producer/storage/consumer map created; per-block live closure remains source-specific. |
| 5.4 | Coverage map for funding/current+history: primary→fallback→third→history→freshness→normalization→storage→consumer→effect | R009/R010/R042/R054/R067/R080/R081 | IMPLEMENTED_PARTIAL | Producer/storage/consumer map created; per-block live closure remains source-specific. |
| 5.5 | Coverage map for OI/current+trajectory: primary→fallback→third→history→freshness→normalization→storage→consumer→effect | R009/R010/R042/R054/R067/R080/R081 | IMPLEMENTED_PARTIAL | Producer/storage/consumer map created; per-block live closure remains source-specific. |
| 5.6 | Coverage map for order book/depth/liquidity: primary→fallback→third→history→freshness→normalization→storage→consumer→effect | R009/R010/R042/R054/R067/R080/R081 | IMPLEMENTED_PARTIAL | Producer/storage/consumer map created; per-block live closure remains source-specific. |
| 5.7 | Coverage map for positioning/large participants: primary→fallback→third→history→freshness→normalization→storage→consumer→effect | R009/R010/R042/R054/R067/R080/R081 | IMPLEMENTED_PARTIAL | Producer/storage/consumer map created; per-block live closure remains source-specific. |
| 5.8 | Coverage map for realized liquidations: primary→fallback→third→history→freshness→normalization→storage→consumer→effect | R009/R010/R042/R054/R067/R080/R081 | IMPLEMENTED_PARTIAL | Producer/storage/consumer map created; per-block live closure remains source-specific. |
| 5.9 | Coverage map for projected liquidation zones: primary→fallback→third→history→freshness→normalization→storage→consumer→effect | R009/R010/R042/R054/R067/R080/R081 | IMPLEMENTED_PARTIAL | Producer/storage/consumer map created; per-block live closure remains source-specific. |
| 5.10 | Coverage map for mark/index/basis: primary→fallback→third→history→freshness→normalization→storage→consumer→effect | R009/R010/R042/R054/R067/R080/R081 | IMPLEMENTED_PARTIAL | Producer/storage/consumer map created; per-block live closure remains source-specific. |
| 5.11 | Coverage map for relative strength BTC/ETH: primary→fallback→third→history→freshness→normalization→storage→consumer→effect | R009/R010/R042/R054/R067/R080/R081 | IMPLEMENTED_PARTIAL | Producer/storage/consumer map created; per-block live closure remains source-specific. |
| 5.12 | Coverage map for fees/slippage: primary→fallback→third→history→freshness→normalization→storage→consumer→effect | R009/R010/R042/R054/R067/R080/R081 | IMPLEMENTED_PARTIAL | Producer/storage/consumer map created; per-block live closure remains source-specific. |
| 5.13 | Coverage map for entry area/invalidation: primary→fallback→third→history→freshness→normalization→storage→consumer→effect | R009/R010/R042/R054/R067/R080/R081 | IMPLEMENTED_PARTIAL | Producer/storage/consumer map created; per-block live closure remains source-specific. |
| 5.14 | Coverage map for Supporting Risk: primary→fallback→third→history→freshness→normalization→storage→consumer→effect | R009/R010/R042/R054/R067/R080/R081 | IMPLEMENTED_PARTIAL | Producer/storage/consumer map created; per-block live closure remains source-specific. |
| 5.15 | Coverage map for events/unlocks: primary→fallback→third→history→freshness→normalization→storage→consumer→effect | R009/R010/R042/R054/R067/R080/R081 | IMPLEMENTED_PARTIAL | Producer/storage/consumer map created; per-block live closure remains source-specific. |
| 5.16 | Coverage map for price reaction to volume: primary→fallback→third→history→freshness→normalization→storage→consumer→effect | R009/R010/R042/R054/R067/R080/R081 | IMPLEMENTED_PARTIAL | Producer/storage/consumer map created; per-block live closure remains source-specific. |
| 5.17 | Coverage map for candidate outcomes: primary→fallback→third→history→freshness→normalization→storage→consumer→effect | R009/R010/R042/R054/R067/R080/R081 | IMPLEMENTED_PARTIAL | Producer/storage/consumer map created; per-block live closure remains source-specific. |
| 5.18 | OI trajectory from time series; one snapshot != trajectory | R042/R081 | IMPLEMENTED_PARTIAL | New OI semantic normalizer + inherited OI trajectory; full per-source unit migration pending. |
| 5.19 | Do not average OI across venues; separate contract quantity vs USD price effect | R012/R081 | LOCAL_WIRED | Conflict no-average retained; OI semantic test passes. |
| 5.20 | Execution fees/liquidity/slippage from HTX only | R007/R009/R081 | RETAINED | No external venue substitutes HTX execution costs. |
| 6.1 | Do not create second CrossVenueProviderRouter; choose primary per metric by quality/freshness/cost/instrument fit | R009/R031/R056/R080 | RETAINED/EXTENDED | Existing registry extended; new sources are candidate receipts only. |
| 6.2 | Every fact stores provider/venue/symbol/identity/contract/market/unit/multiplier/interval/event/receive/freshness/coverage/quality/raw/normalized | R010/R069/R080 | IMPLEMENTED_PARTIAL | New fact contract supports all fields; inherited rows need gradual retrofit. |
| 6.3 | Distinct states NOT_APPLICABLE/NOT_CONFIGURED/BUDGET_EXHAUSTED/SOURCE_EXHAUSTED/CROSS_VENUE_DIVERGENCE | R011/R012/R080 | LOCAL_WIRED | Capability registry/status semantics extended. |
| 6.4 | “Нет данных” only after all applicable sources; quota exhaustion = check incomplete | R011/R080/R082 | LOCAL_WIRED | Tests cover budget/rate-limit/timeout/stale/unsupported semantics. |
| 6.5 | Conflicts not averaged; verify identity/market/time/unit/multiplier/freshness before divergence | R012/R069/R080/R081 | IMPLEMENTED_PARTIAL | No-average closed; richer identity contract local, inherited retrofit pending. |
| 6.6 | No HTX Spot okay when HTX Futures + confirmed external Spot + actually used external Spot | R015 | IMPLEMENTED_AND_WIRED | ONG production fixture retained. |
| 7.1 | Build factual funnel candidate→early→Deep Check→state→exact blocker | R053/R083 | IMPLEMENTED_PARTIAL | Read-only funnel replay created; remote D1 run pending. |
| 7.2 | Check blocker class: missing sources | R005/R007/R008/R054/R083 | IMPLEMENTED_PARTIAL | Funnel diagnostics/category extraction prepared; exact production counts need read-only replay. |
| 7.3 | Check blocker class: stale data | R005/R007/R008/R054/R083 | IMPLEMENTED_PARTIAL | Funnel diagnostics/category extraction prepared; exact production counts need read-only replay. |
| 7.4 | Check blocker class: stored-but-unused data | R005/R007/R008/R054/R083 | IMPLEMENTED_PARTIAL | Funnel diagnostics/category extraction prepared; exact production counts need read-only replay. |
| 7.5 | Check blocker class: duplicate/conflicting checks | R005/R007/R008/R054/R083 | IMPLEMENTED_PARTIAL | Funnel diagnostics/category extraction prepared; exact production counts need read-only replay. |
| 7.6 | Check blocker class: entry area | R005/R007/R008/R054/R083 | IMPLEMENTED_PARTIAL | Funnel diagnostics/category extraction prepared; exact production counts need read-only replay. |
| 7.7 | Check blocker class: fees | R005/R007/R008/R054/R083 | IMPLEMENTED_PARTIAL | Funnel diagnostics/category extraction prepared; exact production counts need read-only replay. |
| 7.8 | Check blocker class: holding plan | R005/R007/R008/R054/R083 | IMPLEMENTED_PARTIAL | Funnel diagnostics/category extraction prepared; exact production counts need read-only replay. |
| 7.9 | Check blocker class: funding | R005/R007/R008/R054/R083 | IMPLEMENTED_PARTIAL | Funnel diagnostics/category extraction prepared; exact production counts need read-only replay. |
| 7.10 | Check blocker class: Smart Money | R005/R007/R008/R054/R083 | IMPLEMENTED_PARTIAL | Funnel diagnostics/category extraction prepared; exact production counts need read-only replay. |
| 7.11 | Check blocker class: Supporting Risk | R005/R007/R008/R054/R083 | IMPLEMENTED_PARTIAL | Funnel diagnostics/category extraction prepared; exact production counts need read-only replay. |
| 7.12 | Check blocker class: execution gate | R005/R007/R008/R054/R083 | IMPLEMENTED_PARTIAL | Funnel diagnostics/category extraction prepared; exact production counts need read-only replay. |
| 7.13 | Check blocker class: immutable receipts | R005/R007/R008/R054/R083 | IMPLEMENTED_PARTIAL | Funnel diagnostics/category extraction prepared; exact production counts need read-only replay. |
| 7.14 | Check blocker class: formatter limits | R005/R007/R008/R054/R083 | IMPLEMENTED_PARTIAL | Funnel diagnostics/category extraction prepared; exact production counts need read-only replay. |
| 7.15 | Check blocker class: state routing | R005/R007/R008/R054/R083 | IMPLEMENTED_PARTIAL | Funnel diagnostics/category extraction prepared; exact production counts need read-only replay. |
| 7.16 | Confirmed tz101 behavior: future settlement crossing stays UNKNOWN because current funding not extrapolated | R007/R083 | CONFIRMED_CODE_BEHAVIOR | Verified in tz101-cost-assessment; not claimed as cause of every missing signal. |
| 7.17 | Measure how many real candidates blocked by that logic | R083 | IMPLEMENTED_PARTIAL | Replay explicitly refuses fabricated exact count; remote prospective context needed. |
| 7.18 | HTX private swap_fee only after owner approval/read-only no trade/withdraw | R007 | BLOCKED | No private call made. |
| 7.19 | Without key prepare versioned conservative fee proposal; do not use zero | R007 | BLOCKED/PENDING_OWNER_METHOD | No zero substitution; owner decision still required for approved schedule. |
| 7.20 | Future funding estimate methodology stays shadow until approved; factual vs estimate separated | R007/R083 | RETAINED | No future rate prediction promoted as fact. |
| 8.1 | Reuse Stage0/V3/opportunity/early bridge/scheduler; cheap universe anomalies then deep for best | R031/R033/R034/R049 | IMPLEMENTED_AND_WIRED | Existing early architecture retained. |
| 8.2 | Analyze 15m/1h/4h/day; history 30d and 60–90d if budget | R038/R039/R068 | IMPLEMENTED_PARTIAL | Hot periods existing; archive maintenance supports bounded history but live replay pending. |
| 8.3 | Only complete closed 1m/3m/5m; no fabricated gaps | R040/R068 | IMPLEMENTED_AND_WIRED | Existing strict decomposition + archive validation tests. |
| 8.4 | Four competing hypotheses accumulation/distribution/two-sided/futures-liquidation noise | R041 | IMPLEMENTED_AND_WIRED | Existing Opportunity Intelligence retained. |
| 8.5 | Red high-volume candle not automatic accumulation; use flows/OI/funding/basis/book/liquidations/RS/price hold/on-chain | R042/R068/R086 | IMPLEMENTED_PARTIAL | Core hypotheses existing; new history/on-chain inputs not yet live-wired. |
| 8.6 | Prove new source→storage→feature→priority→Deep Check→result; changed/no-change/negative controls | R054/R084 | IMPLEMENTED_PARTIAL | Existing Binance receipt reaches canonical/both outputs; brand-new source priority effect/replay pending. |
| 9.1 | Only real HTX Futures trade candidates | R013 | RETAINED | No thresholds were weakened. |
| 9.2 | HTX rolling 24h turnover >=100k inclusive | R014/R016 | IMPLEMENTED_AND_WIRED | No thresholds were weakened. |
| 9.3 | Pump starts at +20%; 19.99 not pump; 30/50/70 pump | R024/R043 | IMPLEMENTED_AND_WIRED | No thresholds were weakened. |
| 9.4 | Pump projected strong zones both sides incl distant; realized separate; never invent | R025/R026 | IMPLEMENTED_AND_WIRED | No thresholds were weakened. |
| 9.5 | If no entry explain why interesting/confirmed/missing/trigger/recheck/cancel | R006/R019/R020 | RETAINED/PARTIAL_OUTPUT_PROOF | No thresholds were weakened. |
| 10.1 | Manual command and Telegram: one snapshot→one engine→one canonical result→two formatters | R028/R029/R059 | IMPLEMENTED_PARTIAL | Local parity/canonical E2E pass; actual downstream remote proof still pending. |
| 10.2 | Same snapshot same coins/facts/state; different time shows snapshot/explain changes | R030/R060 | IMPLEMENTED_PARTIAL | Timestamp/fingerprint local; previous-snapshot runtime diff remains partial. |
| 10.3 | Telegram compact Russian individualized plain text/no visuals/no preview/service junk | R018/R019/R020/R022/R023/R064 | IMPLEMENTED_PARTIAL | Candidate formatter retained + new material blockers only; Node24 downstream proof pending. |
| 10.4 | Manual detailed, early-candidate section or honest empty statement | R027/R036 | IMPLEMENTED_PARTIAL | Formatter section exists; actual chat invocation wiring proof pending. |
| 11.1 | requests/day/API limits/compute units/WS traffic/memory/storage/D1 retention | R047/R048/R049/R050/R082 | IMPLEMENTED_PARTIAL | Resource budget documented; exact candidate live quota/coverage observations pending. |
| 11.2 | shared cache/batch/bounded parallel/backoff/circuit break/gap recovery/dedupe/aggregates/restart cursor | R047/R048/R049/R050/R082 | IMPLEMENTED_PARTIAL | Resource budget documented; exact candidate live quota/coverage observations pending. |
| 11.3 | do not persist each trade | R047/R048/R049/R050/R082 | IMPLEMENTED_PARTIAL | Resource budget documented; exact candidate live quota/coverage observations pending. |
| 11.4 | bounded dynamic detailed candidate list + cheap broad overview | R047/R048/R049/R050/R082 | IMPLEMENTED_PARTIAL | Resource budget documented; exact candidate live quota/coverage observations pending. |
| 11.5 | GitHub Actions != continuous 24/7 WS | R047/R048/R049/R050/R082 | RETAINED | Resource budget documented; exact candidate live quota/coverage observations pending. |
| 11.6 | PARTIAL_REALTIME_COVERAGE only removed after measured full proof | R047/R048/R049/R050/R082 | RETAINED | Resource budget documented; exact candidate live quota/coverage observations pending. |
| 12.1 | ONG external Spot fallback | R015 | LOCAL_PASS_OR_REMOTE_PENDING | Local applicable tests included; Node24/live portions remain explicitly pending. |
| 12.2 | OI divergence no averaging/no voting | R012/R081 | LOCAL_PASS_OR_REMOTE_PENDING | Local applicable tests included; Node24/live portions remain explicitly pending. |
| 12.3 | rate-limit/timeout/stale semantics | R011/R080 | LOCAL_PASS_OR_REMOTE_PENDING | Local applicable tests included; Node24/live portions remain explicitly pending. |
| 12.4 | identity ticker/multiplier/quotes/EVM-Solana | R069 | LOCAL_PASS_OR_REMOTE_PENDING | Local applicable tests included; Node24/live portions remain explicitly pending. |
| 12.5 | timestamp sec/ms/us + incomplete/gap | R040/R069 | LOCAL_PASS_OR_REMOTE_PENDING | Local applicable tests included; Node24/live portions remain explicitly pending. |
| 12.6 | WebSocket duplicate/sequence/reconnect/restart | R048/R074 | LOCAL_PASS_OR_REMOTE_PENDING | Local applicable tests included; Node24/live portions remain explicitly pending. |
| 12.7 | blockchain duplicate/reorg/transfer/bridge/liquidity/multihop | R086 | LOCAL_PASS_OR_REMOTE_PENDING | Local applicable tests included; Node24/live portions remain explicitly pending. |
| 12.8 | same DEX pool two aggregators not independent | R076 | LOCAL_PASS_OR_REMOTE_PENDING | Local applicable tests included; Node24/live portions remain explicitly pending. |
| 12.9 | GoPlus unknown/unsupported != safe | R070 | NODE24_LIVE_PASS_PARTIAL | V3 Node24 live 200 + focused semantics PASS; persistence/consumer remains partial. |
| 12.10 | future funding/missing fee != zero | R007/R083 | LOCAL_PASS_OR_REMOTE_PENDING | Local applicable tests included; Node24/live portions remain explicitly pending. |
| 12.11 | realized != projected liquidation zones | R026 | LOCAL_PASS_OR_REMOTE_PENDING | Local applicable tests included; Node24/live portions remain explicitly pending. |
| 12.12 | 100k and 20% boundaries | R014/R024 | LOCAL_PASS_OR_REMOTE_PENDING | Local applicable tests included; Node24/live portions remain explicitly pending. |
| 12.13 | new source end-to-end | R084 | LOCAL_PASS_OR_REMOTE_PENDING | Local applicable tests included; Node24/live portions remain explicitly pending. |
| 12.14 | same snapshot parity | R059 | LOCAL_PASS_OR_REMOTE_PENDING | Local applicable tests included; Node24/live portions remain explicitly pending. |
| 12.15 | Russian plain-text Telegram/no visuals | R019/R064 | LOCAL_PASS_OR_REMOTE_PENDING | Local applicable tests included; Node24/live portions remain explicitly pending. |
| 12.16 | quota exhausted no payment/fabrication | R080/R082 | LOCAL_PASS_OR_REMOTE_PENDING | Local applicable tests included; Node24/live portions remain explicitly pending. |
| 12.17 | full inherited Node24 regression + real read-only probes | R065/R066/R085 | LOCAL_PASS_OR_REMOTE_PENDING | Local applicable tests included; Node24/live portions remain explicitly pending. |
| 13.1 | Stage A complete current logical stage/checkpoint + merge registry/budget | R067/R082 | LOCAL_DONE | No production promotion included. |
| 13.2 | Stage B close producer/storage/consumer and entry blocker funnel | R054/R083 | PARTIAL | No production promotion included. |
| 13.3 | Stage C Binance archive + GoPlus + existing DEX/Hyperliquid/DefiLlama consumers | R068/R070/R075/R076/R077 | PARTIAL | No production promotion included. |
| 13.4 | Stage D Alchemy/Solana after key permission, independent work not blocked | R071/R072 | PARTIAL/BLOCKED | No production promotion included. |
| 13.5 | Stage E Bitget/Coinbase after incremental measurement | R073/R074/R085 | PARTIAL | No production promotion included. |
| 13.6 | Stage F official events then Deribit if useful | R078/R079 | PARTIAL | No production promotion included. |
| 13.7 | Stage G tests/e2e/utility then separate promotion decision | R065/R066/R084 | PENDING_NODE24 | No production promotion included. |
| 14.1 | Compare before/after completeness/freshness/unknown/conflict/blockers/early time/DeepCheck/API/storage/MFE-MAE/net costs, with negative examples/no lookahead | R051/R052/R053/R084 | IMPLEMENTED_PARTIAL | Replay infrastructure exists; factual candidate results pending. |
| 14.2 | More sources is not success; disable source without measured benefit; no forced signals; score != probability | R004/R061/R084/R085 | RETAINED | Measurement-only statuses enforce this. |
| 15.1 | Merged old+new matrix | R054/R065/R066/R067/R082/R084 | IN_PACKAGE_OR_PENDING_CI | Prepared locally where factual; remote candidate SHA/CI proof produced only by guarded Terminal/Node24 stage. |
| 15.2 | changed files list | R054/R065/R066/R067/R082/R084 | IN_PACKAGE_OR_PENDING_CI | Prepared locally where factual; remote candidate SHA/CI proof produced only by guarded Terminal/Node24 stage. |
| 15.3 | reused components list | R054/R065/R066/R067/R082/R084 | IN_PACKAGE_OR_PENDING_CI | Prepared locally where factual; remote candidate SHA/CI proof produced only by guarded Terminal/Node24 stage. |
| 15.4 | source registry | R054/R065/R066/R067/R082/R084 | IN_PACKAGE_OR_PENDING_CI | Prepared locally where factual; remote candidate SHA/CI proof produced only by guarded Terminal/Node24 stage. |
| 15.5 | real data used per source | R054/R065/R066/R067/R082/R084 | IN_PACKAGE_OR_PENDING_CI | Prepared locally where factual; remote candidate SHA/CI proof produced only by guarded Terminal/Node24 stage. |
| 15.6 | producer→storage→consumer→two outputs proof | R054/R065/R066/R067/R082/R084 | IN_PACKAGE_OR_PENDING_CI | Prepared locally where factual; remote candidate SHA/CI proof produced only by guarded Terminal/Node24 stage. |
| 15.7 | test results | R054/R065/R066/R067/R082/R084 | IN_PACKAGE_OR_PENDING_CI | Prepared locally where factual; remote candidate SHA/CI proof produced only by guarded Terminal/Node24 stage. |
| 15.8 | free quota/resource budget | R054/R065/R066/R067/R082/R084 | IN_PACKAGE_OR_PENDING_CI | Prepared locally where factual; remote candidate SHA/CI proof produced only by guarded Terminal/Node24 stage. |
| 15.9 | before/after comparison | R054/R065/R066/R067/R082/R084 | IN_PACKAGE_OR_PENDING_CI | Prepared locally where factual; remote candidate SHA/CI proof produced only by guarded Terminal/Node24 stage. |
| 15.10 | remaining blockers | R054/R065/R066/R067/R082/R084 | IN_PACKAGE_OR_PENDING_CI | Prepared locally where factual; remote candidate SHA/CI proof produced only by guarded Terminal/Node24 stage. |
| 15.11 | DELTA checkpoint | R054/R065/R066/R067/R082/R084 | IN_PACKAGE_OR_PENDING_CI | Prepared locally where factual; remote candidate SHA/CI proof produced only by guarded Terminal/Node24 stage. |
| 15.12 | updated changelog/master state | R054/R065/R066/R067/R082/R084 | IN_PACKAGE_OR_PENDING_CI | Prepared locally where factual; remote candidate SHA/CI proof produced only by guarded Terminal/Node24 stage. |
| 15.13 | exact candidate SHA | R054/R065/R066/R067/R082/R084 | IN_PACKAGE_OR_PENDING_CI | Prepared locally where factual; remote candidate SHA/CI proof produced only by guarded Terminal/Node24 stage. |
| 15.14 | explicit production unchanged/promotion separate | R054/R065/R066/R067/R082/R084 | IN_PACKAGE_OR_PENDING_CI | Prepared locally where factual; remote candidate SHA/CI proof produced only by guarded Terminal/Node24 stage. |

## Reconciliation result

- Existing durable requirements retained: **66**.
- New durable requirements appended: **20** (`R067–R086`).
- Total durable matrix: **86**.
- No old requirement removed, renumbered or reimplemented as a parallel architecture.
- The full addendum adds source-specific factuality, identity, quota, blockchain/DEX semantics and utility-proof requirements; overlapping safety/cross-venue/early/report rules remain mapped to existing R IDs.
- Owner-decision conflicts: **0**. Owner-controlled credentials/method choices are blockers rather than assumptions.
