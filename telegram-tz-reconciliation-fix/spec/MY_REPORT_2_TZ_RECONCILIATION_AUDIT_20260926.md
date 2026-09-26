# MY REPORT 2 — BIG TZ RECONCILIATION AUDIT — 2026-09-26

## Scope
Source of truth: `MY_REPORT_2_UNIFIED_IMPLEMENTATION_TZ_20260924.md` plus the later Free Sources / Architecture Cleanup additions and the current production runtime.

Production before this candidate: `ffdbbeaa0aa350baecc9e24c1de9791c1e094a8a`.

## Factual defects found after Telegram V3 activation
1. **Wrong user-facing Telegram formatter was active.** V3 delivery used the legacy lifecycle renderer and exposed internal codes such as `USEFUL_LIVE_OBSERVATION`. This bypassed the already-verified Output Surface Contract.
2. **V3 user delivery did not consume the candle/early-candidate facts that the analytical pipeline had already produced.** The early candle system was running, including complete 1m/3m/5m decomposition for many fresh events, but the user message did not show it.
3. **WAIT could be presented without the full user trigger contract.** Big TZ requires exact level/semantics/expiry/cancellation/recheck. The fix now refuses to send WAIT until that contract is complete; incomplete WAIT remains retryable and never becomes a pseudo-signal.
4. **Liquidation context disappeared from the V3 lifecycle text.** The fix renders confirmed levels/realized facts when available and explicitly says when strong levels are not confirmed. Pump levels are never invented.
5. **D1 run capacity was too tight for all critical lanes at the five-minute cadence.** Natural production runs repeatedly deferred realized/projected liquidation lanes; run `36194652803` failed post-cycle with `RUN_READ_RESERVATION_EXCEEDED`. This was fail-closed, but it violates the operational goal that a needed critical analysis lane should not disappear merely because low-priority/statistical work consumed the same cycle envelope.

## Verified big-TZ chain that remains intact
- one existing early engine only: Stage0/V3 -> early receipt -> scheduler priority -> Deep Check -> canonical result;
- candle anomaly search on 15m/1h/4h/1d;
- complete closed 1m/3m/5m decomposition required before final candle classification;
- competing hypotheses retained: accumulation/absorption, distribution, two-sided transfer, derivatives/liquidation noise;
- HTX Futures identity and turnover gate >= 100,000 USD-equivalent retained;
- HTX execution remains non-substitutable by external venue volume;
- cross-venue OI/funding/Spot context and divergence semantics retained;
- dead/false/~97%-monthly-drop protection retained;
- ENTRY_NOW_VALIDATED, live probability and automatic execution remain OFF;
- one canonical analytical core / distinct compact Telegram and full manual report remain the required architecture.

## Runtime evidence observed during audit
- fresh early feature / wave / Deep Check rows exist;
- fresh Opportunity events exist for LSK, FARTCOIN, JST, ONDO and others;
- fresh events include exact 15 x 1m, 5 x 3m and 3 x 5m decomposition when classification is allowed;
- FARTCOIN had concrete Deep Check values (funding, 1h/4h OI, Spot flow, price changes) but Telegram exposed none of them;
- FARTCOIN had no confirmed strong liquidation zones and no exact entry trigger at that snapshot, so correct output is explicit "not confirmed", not omission and not invention;
- continuous minute microstructure remains honestly `PARTIAL_REALTIME_COVERAGE`, as allowed by TZ. It must not be relabelled full real-time coverage.

## Capacity correction
- full production cadence changes from 5 minutes / 288 runs per day to 10 minutes / 144 runs per day;
- run read burst cap changes from 16,000 to 28,000;
- daily read/write ceilings do not increase;
- low-priority discovery-recall/statistical work is moved after all user-critical lanes and runs on the hourly cadence only;
- prospective validation remains last and hourly; it cannot consume capacity before early detection, realized/projected liquidations, Telegram lifecycle or Telegram delivery;
- critical lanes still retain fail-closed guards; the change gives them enough planned headroom rather than weakening the guards.

## New Telegram contract
### OBSERVE / early candidate
Must show, when factually available:
- ticker and Russian direction label;
- `Общая оценка`, `Монета интересна`, `Готовность ко входу` (missing readiness is explicit, never coerced to zero);
- 2–4 concrete facts with numbers;
- early candle decomposition/classification when available;
- working observation zone / control level only when factually present;
- explicit statement that exact entry level is not yet confirmed when absent;
- liquidation facts or explicit not-confirmed state;
- snapshot time.

### WAIT
User WAIT is not sent until there is a complete trigger contract. It must contain:
- exact level;
- explicit statement that reaching the level only starts a recheck, not an automatic entry;
- cancellation condition;
- expiry;
- next automatic recheck when available.

### ENTRY
Must contain exact entry area, target, invalidation, funding/cost facts where closed, validity, and confirmed liquidation context when applicable. No service phrases about automatic trading/probability and no raw internal codes.

## Regression / anti-repeat guards
Candidate CI must fail if:
- raw internal lifecycle/decision codes reach Telegram;
- early candle facts disappear from an eligible early message fixture;
- WAIT is sent without exact trigger/cancel/expiry;
- pump message invents missing two-sided liquidation levels;
- schedule returns to 5-minute full cycles / 288 runs per day;
- run burst cap falls below the reconciled envelope;
- low-priority statistics are moved before Telegram/critical analysis lanes;
- strategy weights, Hard Gates, thresholds, live probability, validated signal, auto execution, recipients or D1 schema change.

## Known non-fabricated open items from the 93-point matrix
These are not hidden by this fix and must remain explicit until factual closure:
- deterministic entry-area factual receipt cases / natural publication inputs;
- private/approved HTX fee + holding receipt blocker;
- some critical Smart Money / Supporting Risk factual closure;
- 15m/30m/statistical outcome accumulation and 7–14 day calibration window;
- natural source-caused priority-effect proofs where no factual case has yet occurred;
- Alchemy key/account if that optional EVM path is still desired;
- stable required GitHub CI context for final branch-protection hardening.

No synthetic evidence is permitted to close these items.

## 2026-09-26 V2 correction after first guarded candidate attempt
- V1 candidate `59efe90f2fe0ea9b7a19de3c0b08103041422caa`, run `36226826448`, stopped before tests/promotion because the overlay compared the delivery sidecar to the historical authoritative-source SHA instead of the actual reconstructed production-runtime SHA. Actual runtime SHA observed by CI: `bd88bdd031231fc91e449909554e62ac1948a0d17d5fa9b7b2a08f572f728356`. Production remained unchanged.
- This was a publication/compatibility-guard defect, not an analytical or Telegram-format test failure. V2 accepts only the exact known reconstructed production SHA (plus the historical source SHA for offline recovery fixtures) and still fails on any other runtime drift.
- A fresh natural production run `36226398479` additionally proved write capacity can saturate before critical sidecars: `RUN_WRITE_RESERVATION_EXCEEDED` at the old 320-write burst. V2 therefore raises the per-run write burst to `480` while keeping the daily 70,000-write ceiling unchanged.
- V2 also reconciles the internal measured envelopes of the existing early/realized/projected sidecars: early `4096/32`, realized `3200/64`, projected `5000/80` (read/write rows). These are capacity-accounting changes only; signal rules, thresholds and analytical logic are unchanged.
- Ten-minute cadence remains because measured natural usage plus the reconciled envelopes fits inside the unchanged daily ceilings with substantially more headroom than the old five-minute schedule.


## 2026-09-26 V4 test-harness and sustainable write-headroom refinement
- V3 candidate runtime reconstruction, new formatter tests and retained Telegram tests passed.
- The only V3 failure was a test-harness packaging omission: `early-to-fastmove-e2e.test.mjs` imports authoritative `r10_7_auth/src/fast-move-watch-runtime.mjs`; V4 reconstructs that test-only path from the decrypted exact production runtime and also copies `fast-move-watch-engine.mjs`.
- Natural production also demonstrated the old 320-write burst can saturate before user-critical sidecars. V4 uses a sustainable full cadence of 120 runs/day (every 12 minutes) with a 28,000-read / 560-write burst. Daily ceilings remain unchanged: 3,500,000 reads / 70,000 writes. Maximum full-cadence reservations are 3,360,000 reads / 67,200 writes, leaving daily headroom instead of relying on skipped critical lanes.


## 2026-09-26 V6 inherited-regression fixture reconciliation
- V4 passed runtime reconstruction, new TZ formatter tests, Telegram retention, early/candle/trigger/liquidation retained tests and the factual read-only Big-TZ audit.
- V4 inherited regression had exactly five failures: two historical budget fixtures still asserted the obsolete 3072/24 envelope, and three assertions came from an older copy of the Telegram delivery fixture.
- V6 does not weaken coverage: the current Telegram delivery fixture is copied into the inherited runtime suite; the two obsolete budget fixture files are superseded by the already-run `adaptive-budget.test.mjs`, exact runtime budget constant readbacks, and the post-promotion controlled smoke which fails on any critical-lane budget deferral.
- No analytical rule, Hard Gate, score weight, threshold, source family, Telegram recipient, live probability, validated signal or automatic execution setting is changed by V6.
