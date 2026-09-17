import test from "node:test";
import assert from "node:assert/strict";
import {
  ACTIVE_STATES, CADENCE_MS, DEFAULT_LIMITS, STATES, advanceWatch, canReenter,
  closeWatch, completeRecheck, createWatch, deduplicateWatches, inspectEvidence,
  liquidationContext, observability, openingEvent, planRechecks, recoverAfterRestart,
  safetyEnvelope, validateCanonicalContract,
} from "../src/fast-move-watch-engine.mjs";

const T = 1_800_000_000_000;

function observation(overrides = {}) {
  const base = {
    contract: "ETHFI-USDT",
    event_id: "event-1",
    source_ts: T - 10_000,
    max_age_ms: 180_000,
    freshness_status: "CURRENT",
    coverage_pct: 100,
    coverage_status: "CLOSED",
    data_quality_status: "GREEN",
    canonical_identity_verified: true,
    external_alias_used: false,
    evidence_ids: ["price:1", "oi:1"],
    independence_groups: ["PRICE", "DERIVATIVES"],
    signals: { anomaly_confirmed: true },
    liquidation: {
      projected: { status: "NOT_CLOSED", asset_identity_verified: false, providers: [] },
      realized: { status: "NOT_CLOSED", asset_identity_verified: true },
    },
  };
  return { ...base, ...overrides, signals: { ...base.signals, ...(overrides.signals || {}) }, liquidation: overrides.liquidation || base.liquidation };
}

function watch(overrides = {}) {
  return { ...createWatch(observation(), T), ...overrides };
}

test("state-machine requires two closed observations before escalation", () => {
  const w0 = watch();
  const a = advanceWatch(w0, observation({ event_id: "event-2", signals: { squeeze_confirmed: true } }), T + 60_000);
  assert.equal(a.watch.state, STATES.PRE_SQUEEZE);
  assert.equal(a.event, null);
  const b = advanceWatch(a.watch, observation({ event_id: "event-3", signals: { squeeze_confirmed: true } }), T + 120_000);
  assert.equal(b.watch.state, STATES.SQUEEZE_ACTIVE);
  assert.equal(b.event.to_state, STATES.SQUEEZE_ACTIVE);
  assert.equal(b.watch.cadence_class, "FAST");
});

test("transient tick cannot flip state", () => {
  const w0 = watch({ state: STATES.SQUEEZE_ACTIVE });
  const a = advanceWatch(w0, observation({ event_id: "event-2", signals: { exhaustion_confirmed: true } }), T + 60_000);
  assert.equal(a.watch.state, STATES.SQUEEZE_ACTIVE);
  const b = advanceWatch(a.watch, observation({ event_id: "event-3", signals: { exhaustion_confirmed: false, momentum_confirmed: true } }), T + 120_000);
  assert.equal(b.watch.state, STATES.SQUEEZE_ACTIVE);
});

test("state transition order de-risks simultaneous signals", () => {
  let w = watch({ state: STATES.SQUEEZE_ACTIVE });
  w = advanceWatch(w, observation({ event_id: "event-2", signals: { momentum_confirmed: true, edge_spent_confirmed: true } }), T + 60_000).watch;
  w = advanceWatch(w, observation({ event_id: "event-3", signals: { momentum_confirmed: true, edge_spent_confirmed: true } }), T + 120_000).watch;
  assert.equal(w.state, STATES.EDGE_SPENT);
});

test("watch-dedup retains newest generation/update", () => {
  const a = watch({ updated_ts: T });
  const b = watch({ updated_ts: T + 1 });
  const c = watch({ generation: 2, updated_ts: T - 1 });
  const result = deduplicateWatches([a, b, c]);
  assert.equal(result.watches.length, 1);
  assert.equal(result.watches[0].generation, 2);
  assert.equal(result.duplicate_suppressed, 2);
});

test("cooldown requires terminal state, elapsed time, and new discovery", () => {
  const ended = closeWatch(watch(), T, "TEST");
  assert.equal(canReenter(ended, observation({ event_id: "new" }), T + 1).reason, "REENTRY_COOLDOWN");
  assert.equal(canReenter(ended, observation({ event_id: ended.last_event_id }), T + DEFAULT_LIMITS.reentry_cooldown_ms).reason, "NEW_DISCOVERY_REQUIRED");
  const reentryTs = T + DEFAULT_LIMITS.reentry_cooldown_ms;
  const ok = canReenter(ended, observation({ event_id: "new", source_ts: reentryTs - 1 }), reentryTs);
  assert.equal(ok.allowed, true);
  assert.equal(ok.generation, 2);
});

test("bounded workload honors all infrastructure budgets", () => {
  const watches = Array.from({ length: 20 }, (_, i) => watch({ contract: `C${i}-USDT`, next_recheck_ts: T - 1, created_ts: T + i, external_call_estimate: 2, d1_write_estimate: 2, requires_deep_check: i < 3 }));
  const plan = planRechecks(watches, T, { ...DEFAULT_LIMITS, max_active_watches: 10, max_rechecks_per_cycle: 4, max_external_calls_per_cycle: 6, max_d1_writes_per_cycle: 6, max_deep_checks_per_cycle: 1 });
  assert.ok(plan.selected.length <= 3);
  assert.ok(plan.budgets.external_calls <= 6);
  assert.ok(plan.budgets.d1_writes <= 6);
  assert.ok(plan.budgets.deep_checks <= 1);
  assert.equal(plan.capacity_rejected.length, 10);
});

test("stale evidence fails closed and cannot spend edge", () => {
  const stale = observation({ event_id: "stale", source_ts: T - 999_999, signals: { edge_spent_confirmed: true } });
  const result = advanceWatch(watch({ state: STATES.SQUEEZE_ACTIVE }), stale, T);
  assert.equal(result.watch.state, STATES.STALE);
  assert.equal(result.watch.state_before_stale, STATES.SQUEEZE_ACTIVE);
});

test("two fresh observations required to recover from stale", () => {
  const s = watch({ state: STATES.STALE, state_before_stale: STATES.PRE_SQUEEZE, counters: { recovery_fresh: 0 } });
  const a = advanceWatch(s, observation({ event_id: "fresh-1" }), T + 1);
  assert.equal(a.watch.state, STATES.STALE);
  const b = advanceWatch(a.watch, observation({ event_id: "fresh-2", source_ts: T + 2 }), T + 2);
  assert.equal(b.watch.state, STATES.PRE_SQUEEZE);
});

test("expiry is terminal and clears next due", () => {
  const w = watch({ expiry_ts: T + 10 });
  const result = advanceWatch(w, observation({ event_id: "later" }), T + 10);
  assert.equal(result.watch.state, STATES.EXPIRED);
  assert.equal(result.watch.next_recheck_ts, null);
  assert.equal(advanceWatch(result.watch, observation({ event_id: "again" }), T + 20).idempotent, true);
});

test("restart recovery expires old watches and releases expired leases", () => {
  const old = watch({ contract: "OLD-USDT", expiry_ts: T - 1 });
  const leased = watch({ contract: "LEASE-USDT", lease_owner: "dead", lease_expires_ts: T - 1, next_recheck_ts: T - 100 });
  const result = recoverAfterRestart([old, leased], T);
  assert.equal(result.expired_watchers, 1);
  assert.equal(result.abandoned_leases, 1);
  assert.equal(result.watches.find((x) => x.contract === "LEASE-USDT").lease_owner, null);
});

test("same event is idempotent", () => {
  const w = watch();
  const result = advanceWatch(w, observation({ event_id: w.last_event_id }), T + 1);
  assert.equal(result.idempotent, true);
  assert.deepEqual(result.watch, w);
});

test("Unicode canonical contract is retained exactly", () => {
  const contract = "龙虾-USDT";
  assert.equal(validateCanonicalContract(contract), contract);
  const created = createWatch(observation({ contract, event_id: "unicode" }), T);
  assert.equal(created.contract, contract);
});

test("guessed external alias fails closed", () => {
  const result = inspectEvidence(observation({ external_alias_used: true, external_alias_verified: false }), T);
  assert.equal(result.usable, false);
  assert.ok(result.failures.includes("EXTERNAL_ALIAS_NOT_VERIFIED"));
});

test("missing and future timestamps fail closed", () => {
  assert.equal(inspectEvidence(observation({ source_ts: null }), T).usable, false);
  assert.equal(inspectEvidence(observation({ source_ts: T + DEFAULT_LIMITS.max_future_skew_ms + 1 }), T).usable, false);
});

test("projected and realized liquidation lanes remain separate", () => {
  const result = liquidationContext({ projected: { status: "STALE", providers: ["A"] }, realized: { status: "CLOSED", asset_identity_verified: true, cluster_state: "SWEPT" } });
  assert.equal(result.projected_status, "STALE");
  assert.equal(result.realized_status, "CLOSED");
  assert.equal(result.lanes_separated, true);
  assert.equal(result.synthetic_levels_generated, false);
  assert.equal(result.cluster_state, "SWEPT");
  assert.equal(result.cluster_state_source, "REALIZED");
});

test("single projected provider is never consensus", () => {
  const result = liquidationContext({ projected: { status: "CLOSED", asset_identity_verified: true, providers: ["A"], cross_source_consensus: true } });
  assert.equal(result.cross_source_consensus, false);
  assert.equal(result.single_provider_is_consensus, false);
});

test("liquidation magnet needs usable liquidation context and hysteresis", () => {
  let w = watch();
  const liq = { projected: { status: "CLOSED", asset_identity_verified: true, providers: ["A"], cross_source_consensus: false, cluster_state: "APPROACHING" }, realized: { status: "NOT_CLOSED", asset_identity_verified: true } };
  w = advanceWatch(w, observation({ event_id: "l1", liquidation: liq, signals: { liquidation_magnet_context_confirmed: true } }), T + 1).watch;
  assert.equal(w.state, STATES.PRE_SQUEEZE);
  w = advanceWatch(w, observation({ event_id: "l2", source_ts: T + 2, liquidation: liq, signals: { liquidation_magnet_context_confirmed: true } }), T + 2).watch;
  assert.equal(w.state, STATES.LIQUIDATION_MAGNET_ACTIVE);
  assert.equal(w.safety.live_signal, false);
});

test("cluster approaching/touched/swept lifecycle emits factual context events", () => {
  let w = watch();
  for (const [i, cluster_state] of ["APPROACHING", "TOUCHED", "SWEPT"].entries()) {
    const liquidation = { projected: { status: "NOT_CLOSED", asset_identity_verified: false, providers: [] }, realized: { status: "CLOSED", asset_identity_verified: true, cluster_state } };
    const result = advanceWatch(w, observation({ event_id: `cluster-${i}`, source_ts: T + i, liquidation }), T + i);
    w = result.watch;
    assert.equal(w.cluster_lifecycle, cluster_state);
    assert.equal(w.cluster_lifecycle_source, "REALIZED");
    assert.ok(result.event);
    assert.equal(result.event.projected_liquidation_status, "NOT_CLOSED");
    assert.equal(result.event.realized_liquidation_status, "CLOSED");
  }
});

test("retry is bounded and falls back to stale watch", () => {
  let w = watch();
  w = completeRecheck(w, T + 1, { status: "SOURCE_ERROR" });
  w = completeRecheck(w, T + 2, { status: "SOURCE_ERROR" });
  w = completeRecheck(w, T + 3, { status: "SOURCE_ERROR" });
  assert.equal(w.state, STATES.STALE);
  assert.equal(w.last_reason_code, "SOURCE_RETRY_BUDGET_EXHAUSTED");
});

test("urgent work is not displaced by old low-priority debt", () => {
  const urgent = watch({ contract: "A-USDT", next_recheck_ts: T - 1, priority_class: "FAST" });
  const aging = watch({ contract: "Z-USDT", next_recheck_ts: T - 1, priority_class: "WATCH", deferral_count: 4, missed_due_count: 4 });
  const plan = planRechecks([urgent, aging], T, { ...DEFAULT_LIMITS, max_rechecks_per_cycle: 1 });
  assert.equal(plan.selected[0].contract, "A-USDT");
  assert.equal(plan.selected[0].scheduler_selection_class, "URGENT");
  assert.equal(plan.selected[0].scheduler_priority_is_probability, false);
});

test("single deep-check slot rotates fresh and aging work when no urgent item exists", () => {
  const fresh = watch({ contract: "FRESH-USDT", next_recheck_ts: T - 1, priority_class: "ACTIVE" });
  const aging = watch({ contract: "AGING-USDT", next_recheck_ts: T - 1, priority_class: "WATCH", deferral_count: 4, missed_due_count: 4 });
  const freshTurn = planRechecks([aging, fresh], T, { ...DEFAULT_LIMITS, max_rechecks_per_cycle: 1, max_deep_checks_per_cycle: 1 });
  assert.equal(freshTurn.selected[0].contract, "FRESH-USDT");
  assert.equal(freshTurn.selected[0].scheduler_selection_class, "FRESH");
  const agingTurn = planRechecks([fresh, aging], T + 15 * 60_000, { ...DEFAULT_LIMITS, max_rechecks_per_cycle: 1, max_deep_checks_per_cycle: 1 });
  assert.equal(agingTurn.selected[0].contract, "AGING-USDT");
  assert.equal(agingTurn.selected[0].scheduler_selection_class, "AGING");
});

test("observability reports scheduler KPIs without trading metrics", () => {
  const items = [watch({ next_recheck_ts: T - 1000 }), watch({ contract: "BTC-USDT", state: STATES.SQUEEZE_ACTIVE, cadence_class: "FAST", priority_class: "FAST", next_recheck_ts: T - 2000 })];
  const plan = planRechecks(items, T);
  const obs = observability(items, plan, T);
  assert.equal(obs.active_watch_count, 2);
  assert.equal(obs.fast_watch_count, 1);
  assert.equal(obs.scheduler_priority_is_probability, false);
  assert.equal(obs.safety.live_probability, null);
});

test("all immutable safety fields remain disabled", () => {
  const s = safetyEnvelope();
  assert.equal(s.changes_strategy_weights, false);
  assert.equal(s.new_percentage_weight, false);
  assert.equal(s.live_probability, null);
  assert.equal(s.live_signal, false);
  assert.equal(s.validated_signal, false);
  assert.equal(s.telegram_started, false);
  assert.equal(s.trading_execution, false);
  assert.equal(s.automatic_weight_tuning_enabled, false);
  assert.equal(s.guaranteed_tp_generated, false);
  assert.equal(s.shadow_only, true);
});

test("state set is explicit and active set excludes terminal states", () => {
  for (const state of [STATES.EXPIRED, STATES.CLOSED, STATES.EDGE_SPENT, STATES.STALE]) assert.equal(ACTIVE_STATES.has(state), false);
  assert.equal(CADENCE_MS.FAST, 300_000);
  assert.equal(CADENCE_MS.ACTIVE, 900_000);
  assert.equal(CADENCE_MS.WATCH, 3_600_000);
});


test("opening event records initial generation and terminal re-entry explicitly", () => {
  const firstObs = observation({ event_id: "open-1" });
  const first = createWatch(firstObs, T);
  const opened = openingEvent(first, firstObs, T, null);
  assert.equal(opened.from_state, "NONE");
  assert.equal(opened.to_state, STATES.PRE_SQUEEZE);
  assert.equal(opened.reason_code, "DISCOVERY_ANOMALY_CONFIRMED");
  const terminal = { ...first, state: STATES.EXPIRED, updated_ts: T + DEFAULT_LIMITS.reentry_cooldown_ms, next_recheck_ts: null };
  const secondObs = observation({ event_id: "open-2", source_ts: T + DEFAULT_LIMITS.reentry_cooldown_ms + 1 });
  const second = { ...createWatch(secondObs, T + DEFAULT_LIMITS.reentry_cooldown_ms + 1), generation: 2 };
  const reopened = openingEvent(second, secondObs, T + DEFAULT_LIMITS.reentry_cooldown_ms + 1, terminal);
  assert.equal(reopened.from_state, STATES.EXPIRED);
  assert.equal(reopened.reason_code, "NEW_DISCOVERY_CONFIRMED");
  assert.equal(reopened.generation, 2);
});

test("successful recheck clears accumulated fairness debt", () => {
  const before = watch({ deferral_count: 7, missed_due_count: 9, next_recheck_ts: T - 1 });
  const after = completeRecheck(before, T, { status: "CLOSED" });
  assert.equal(after.deferral_count, 0);
  assert.equal(after.missed_due_count, 0);
});

test("an unexpired lease is excluded instead of blocking the next due watch", () => {
  const leased = watch({
    contract: "LEASED-USDT",
    next_recheck_ts: T - 1,
    lease_owner: "run-a",
    lease_expires_ts: T + 60_000,
    missed_due_count: 99,
  });
  const available = watch({ contract: "AVAILABLE-USDT", next_recheck_ts: T - 1 });
  const plan = planRechecks([leased, available], T, {
    ...DEFAULT_LIMITS,
    max_rechecks_per_cycle: 1,
  });
  assert.deepEqual(plan.active_lease_blocked, ["LEASED-USDT"]);
  assert.equal(plan.selected[0].contract, "AVAILABLE-USDT");
  assert.equal(plan.deferred.some((row) => row.contract === "LEASED-USDT"), false);
});

test("invalid workload estimates fail closed instead of producing NaN budgets", () => {
  const invalid = watch({
    contract: "INVALID-USDT",
    next_recheck_ts: T - 1,
    external_call_estimate: "not-a-number",
  });
  const plan = planRechecks([invalid], T);
  assert.deepEqual(plan.invalid_budget_rejected, ["INVALID-USDT"]);
  assert.equal(plan.selected.length, 0);
  assert.equal(Number.isFinite(plan.budgets.external_calls), true);
});

test("transition event id is deterministic for the same source event", () => {
  const before = watch();
  const obs = observation({ event_id: "same-source", signals: { squeeze_confirmed: true } });
  const a = advanceWatch(before, obs, T + 1);
  const b = advanceWatch(before, obs, T + 999);
  // First confirmation has no transition event; force a factual cluster event.
  const liqObs = observation({
    event_id: "same-cluster-source",
    liquidation: {
      projected: { status: "NOT_CLOSED", asset_identity_verified: false, providers: [] },
      realized: { status: "CLOSED", asset_identity_verified: true, cluster_state: "TOUCHED" },
    },
  });
  const x = advanceWatch(before, liqObs, T + 1);
  const y = advanceWatch(before, liqObs, T + 999);
  assert.equal(a.event, null);
  assert.equal(b.event, null);
  assert.equal(x.event.event_id, y.event.event_id);
});
