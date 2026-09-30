# Prospective queue / history / budget repair — one implementation block

Base: 56096d057168984705e1ebdaed25e2d02c1044a9 (PR28 accepted).
Existing audit 36707975711 proves oldest CASHCAT pending task repeatedly selected,
collector 3259 reads and scan fallback 842 reads. No repeated provider research.

## Changes

- Durable independent early/entry queue cursors in existing calibration state.
  Advance before history attempt; missing history/price never becomes a zero,
  a win/loss, or a closed observation. Preserve original task and null metrics.
- Retry old unresolved work in later sweeps with a 24-hour sweep cooldown;
  newly due work beyond cursor is considered during cooldown. No deletion.
- Alternate early/entry outcome processing on existing 20-minute cycle slots
  (each queue normally every 40 minutes). Entry capture remains every cycle.
  This trades processing throughput for compliance with existing request caps.
- Raw collector query uses generation/bucket/shard index and 321-row sentinel
  before JSON parsing. Scan fallback uses ts_bucket primary key, not unindexed ts.
- Shared existing SHA/schema/generation/shard checks; exact contract, source age,
  source/receipt time, positive price and internal path gaps checked. Truncation
  is not completeness. Fallback sampling remains twenty minutes, not five.
- Guard checks usage before every new statement and reserves history read headroom.
  It is NOT a hard database-engine per-statement billed-row cap. Entry selection
  and readiness aggregates still require longitudinal cost monitoring.
- Factual extrema are sampled observations, not proven intrabar extremes.

## Verification / limits

One comprehensive SQLite suite on assembled runtime: valid path, malformed hash,
schema/generation/time/identity/shards/age/price failures, raw-row truncation,
indexed query plans, sampled fallback, old-task starvation, durable cooldown,
new work, ties, entry queue, invalid time and pre-query budget admission.
Run together with full current-generation and existing integration regressions.
No source HTTP, test Telegram or trades. Cloud exact-head evidence and two-mode
acceptance must be recorded separately before claiming production completion.

No strategy weights, provider quotas, worker, trading thresholds or report layout
changes. This closes a technical collection defect, not T16.5 statistical proof,
not optimal provider weighting, and not all SOPT-ALL requirements.
