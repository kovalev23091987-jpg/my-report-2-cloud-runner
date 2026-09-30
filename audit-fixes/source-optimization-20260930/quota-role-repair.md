# SOPT-ALL — quota/refusal/unsupported-market separation

Scope: a verified subset of SOPT-04/05/06/08, not closure of all-source optimization.

Base main: `2c1b121a96e6fb406d61715327083da1be034702` (PR26 runtime).
Unchanged worker: `85aeb64cc2898f7066b22f27abdccec0ead0cb3fa8165260b59f76c4629ad55f`.

## Reproduced defects

1. Coinalyze catalog HTTP429,403,500 or local minute-ledger denial lost its real reason and became `NO_EXACT_FUTURES_MARKETS` in the history collector. This is not evidence that the market is absent.
2. Provider429 Retry-After was not persisted across catalog/history routes and assets in this collector. Other assets could spend additional attempts during the same provider cooldown.
3. N17 mapped GDELT `RATE_LIMITED_429` to generic NOT_CLOSED and access refusals to the same bucket as transport outages. It did not retain typed quota/access counters.

All11 dedicated Coinalyze regression scenarios fail on the exact fetched main module (blob8bda5baaa2d98647ea086537b2bf4519cbf119cd); they pass on the candidate. These are deterministic fixtures, not proof of a real provider outage or a live quota balance.

## Implementation and invariants

- Preserve the real catalog/admission error and distinguish it from a valid catalog with no exact market.
- Durable provider-level Retry-After for HTTP429, shared by assets and catalog/history. Interpret seconds or HTTP date; unknown header uses a conservative60-second pause. Start duration at response receipt, never before it. Do not reduce a longer stored cooldown.
- Let existing Gate exact-market fallback run within the remaining shared3HTTP history envelope. Gate's single-venue statistics do not become Coinalyze's multi-venue comparable baseline: intensity stays null and no directional vote is added.
- Before cooldown expiry use no new Coinalyze HTTP or provider units; allow an admitted recheck after expiry. A recheck is not an assumption of success.
- N17 separates provider rate limiting, access blocks, internal failure, invalid content and true external errors. Cached skips do not produce transport observations; forecast weights and quarantine stay disabled.
- Test UTC day/month transitions independently of rolling60seconds. Exhausted old-period usage remains stored, and midnight in UTC+03 is not an internal UTC reset. No claim is made that providers' billing periods match these internal periods.

Preserved: all provider and job caps, schedule20min,72cycles/day, existing manual reserves, weights35/30/20/15 and32/30/20/18, threshold70, potential>=5%, native/estimated semantics, Telegram tests0, trades0. No extra live requests to deliberately provoke429. Exact assembled-runtime tests plus ordinary post-release full and standalone acceptance are required before calling this deployed and accepted.

Official source checked30Sep2026: https://api.coinalyze.net/v1/doc/ (per-key per-minute limit and Retry-After). This change retains the stricter local30-unit rolling ceiling; it does not raise it to the documented provider limit.

Remaining: per-field comparison and utility evidence for every source/block, other provider-specific recovery paths, N01–N17 coverage gaps, full volume-profile utility and T16.5. Approximate overall project progress is an engineering estimate of about60%, not a measured completion ratio or a forecast of remaining duration.
