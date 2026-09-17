/*
 * My Report 2 — Stage 3.8 PREP: Fast-Move Watch Engine
 * Shadow telemetry and scheduling only. No trading thresholds, probability,
 * signal, validation, Telegram, execution, or weight changes.
 */

export const ENGINE_VERSION = "fast-move-watch-hardening-v3";
export const MODE = "FAST_MOVE_WATCH_SHADOW_NO_EXECUTION";

export const STATES = Object.freeze({
  PRE_SQUEEZE: "PRE_SQUEEZE",
  SQUEEZE_ACTIVE: "SQUEEZE_ACTIVE",
  MOMENTUM_CONTINUATION: "MOMENTUM_CONTINUATION",
  LIQUIDATION_MAGNET_ACTIVE: "LIQUIDATION_MAGNET_ACTIVE",
  EXHAUSTION_WARNING: "EXHAUSTION_WARNING",
  EDGE_SPENT: "EDGE_SPENT",
  STALE: "STALE",
  EXPIRED: "EXPIRED",
  CLOSED: "CLOSED",
});

export const ACTIVE_STATES = new Set([
  STATES.PRE_SQUEEZE,
  STATES.SQUEEZE_ACTIVE,
  STATES.MOMENTUM_CONTINUATION,
  STATES.LIQUIDATION_MAGNET_ACTIVE,
  STATES.EXHAUSTION_WARNING,
]);

export const TERMINAL_STATES = new Set([STATES.EXPIRED, STATES.CLOSED]);

// Infrastructure limits. They are scheduler/resource protection, not trading thresholds.
export const DEFAULT_LIMITS = Object.freeze({
  max_active_watches: 16,
  max_rechecks_per_cycle: 4,
  max_deep_checks_per_cycle: 1,
  max_external_calls_per_cycle: 8,
  max_d1_writes_per_cycle: 8,
  retry_budget: 2,
  max_watch_lifetime_ms: 24 * 60 * 60 * 1000,
  reentry_cooldown_ms: 60 * 60 * 1000,
  // Match the existing bounded Deep Check lease. A shorter watch lease can
  // expire while the same Deep Check is still legitimately in flight.
  lease_ttl_ms: 10 * 60 * 1000,
  max_future_skew_ms: 60 * 1000,
});

export const CADENCE_MS = Object.freeze({
  FAST: 5 * 60 * 1000,
  ACTIVE: 15 * 60 * 1000,
  WATCH: 60 * 60 * 1000,
});

const TRANSITION_SIGNAL = Object.freeze({
  [STATES.PRE_SQUEEZE]: "anomaly_confirmed",
  [STATES.SQUEEZE_ACTIVE]: "squeeze_confirmed",
  [STATES.MOMENTUM_CONTINUATION]: "momentum_confirmed",
  [STATES.LIQUIDATION_MAGNET_ACTIVE]: "liquidation_magnet_context_confirmed",
  [STATES.EXHAUSTION_WARNING]: "exhaustion_confirmed",
  [STATES.EDGE_SPENT]: "edge_spent_confirmed",
});

const ALLOWED_TRANSITIONS = Object.freeze({
  [STATES.PRE_SQUEEZE]: new Set([
    STATES.SQUEEZE_ACTIVE,
    STATES.LIQUIDATION_MAGNET_ACTIVE,
    STATES.EXHAUSTION_WARNING,
    STATES.EDGE_SPENT,
  ]),
  [STATES.SQUEEZE_ACTIVE]: new Set([
    STATES.MOMENTUM_CONTINUATION,
    STATES.LIQUIDATION_MAGNET_ACTIVE,
    STATES.EXHAUSTION_WARNING,
    STATES.EDGE_SPENT,
  ]),
  [STATES.MOMENTUM_CONTINUATION]: new Set([
    STATES.LIQUIDATION_MAGNET_ACTIVE,
    STATES.EXHAUSTION_WARNING,
    STATES.EDGE_SPENT,
  ]),
  [STATES.LIQUIDATION_MAGNET_ACTIVE]: new Set([
    STATES.MOMENTUM_CONTINUATION,
    STATES.EXHAUSTION_WARNING,
    STATES.EDGE_SPENT,
  ]),
  [STATES.EXHAUSTION_WARNING]: new Set([
    STATES.MOMENTUM_CONTINUATION,
    STATES.EDGE_SPENT,
  ]),
  [STATES.EDGE_SPENT]: new Set([]),
  [STATES.STALE]: new Set([]),
  [STATES.EXPIRED]: new Set([]),
  [STATES.CLOSED]: new Set([]),
});

function invariant(condition, code) {
  if (!condition) throw new Error(code);
}

export function validateCanonicalContract(contract) {
  invariant(typeof contract === "string" && contract.length > 0 && contract.length <= 96, "INVALID_CANONICAL_CONTRACT");
  invariant(contract === contract.trim(), "CANONICAL_CONTRACT_WHITESPACE");
  invariant(!/[\u0000-\u001f\u007f]/u.test(contract), "CANONICAL_CONTRACT_CONTROL_CHAR");
  // Unicode is retained byte-for-byte. No transliteration, normalization, or guessed alias.
  return contract;
}

export function safetyEnvelope() {
  return Object.freeze({
    mode: MODE,
    scheduler_priority_is_probability: false,
    changes_strategy_weights: false,
    new_percentage_weight: false,
    live_probability: null,
    live_signal: false,
    validated_signal: false,
    telegram_started: false,
    trading_execution: false,
    automatic_weight_tuning_enabled: false,
    guaranteed_tp_generated: false,
    synthetic_liquidation_levels_generated: false,
    shadow_only: true,
  });
}

export function inspectEvidence(observation, now, limits = DEFAULT_LIMITS) {
  const failures = [];
  if (!observation || typeof observation !== "object") return { usable: false, status: "UNKNOWN", failures: ["OBSERVATION_MISSING"] };
  try { validateCanonicalContract(observation.contract); } catch (error) { failures.push(error.message); }
  if (observation.canonical_identity_verified !== true) failures.push("CANONICAL_IDENTITY_NOT_VERIFIED");
  if (observation.external_alias_used === true && observation.external_alias_verified !== true) failures.push("EXTERNAL_ALIAS_NOT_VERIFIED");
  if (!Number.isFinite(observation.source_ts)) failures.push("SOURCE_TIMESTAMP_MISSING");
  else if (observation.source_ts > now + limits.max_future_skew_ms) failures.push("SOURCE_TIMESTAMP_FUTURE");
  else if (!Number.isFinite(observation.max_age_ms) || observation.max_age_ms <= 0) failures.push("MAX_AGE_MISSING");
  else if (now - observation.source_ts > observation.max_age_ms) failures.push("SOURCE_STALE");
  if (observation.freshness_status !== "CURRENT") failures.push("FRESHNESS_NOT_CURRENT");
  if (!Number.isFinite(observation.coverage_pct) || observation.coverage_pct <= 0 || observation.coverage_pct > 100) failures.push("COVERAGE_INVALID");
  if (observation.coverage_status !== "CLOSED") failures.push("COVERAGE_NOT_CLOSED");
  if (!new Set(["GREEN", "CLOSED"]).has(observation.data_quality_status)) failures.push("DATA_QUALITY_NOT_CLOSED");
  if (!Array.isArray(observation.evidence_ids) || observation.evidence_ids.length === 0) failures.push("EVIDENCE_IDS_MISSING");
  if (!Array.isArray(observation.independence_groups) || new Set(observation.independence_groups).size < 2) failures.push("INDEPENDENCE_NOT_PROVEN");
  return { usable: failures.length === 0, status: failures.length ? "NOT_CLOSED" : "CLOSED", failures };
}

export function liquidationContext(liquidation = {}) {
  const projected = liquidation.projected || {};
  const realized = liquidation.realized || {};
  const distinct = new Set((projected.providers || []).filter(Boolean));
  const projectedUsable = projected.status === "CLOSED" && projected.asset_identity_verified === true;
  const realizedUsable = realized.status === "CLOSED" && realized.asset_identity_verified === true;
  const consensus = projectedUsable && distinct.size >= 2 && projected.cross_source_consensus === true;
  return {
    projected_status: projected.status || "UNKNOWN",
    realized_status: realized.status || "UNKNOWN",
    projected_provider_count: distinct.size,
    projected_usable: projectedUsable,
    realized_usable: realizedUsable,
    cross_source_consensus: consensus,
    single_provider_is_consensus: false,
    lanes_separated: true,
    synthetic_levels_generated: false,
    projected_cluster_state: projected.cluster_state || "UNKNOWN",
    realized_cluster_state: realized.cluster_state || "UNKNOWN",
    cluster_state: projectedUsable ? (projected.cluster_state || "UNKNOWN") : realizedUsable ? (realized.cluster_state || "UNKNOWN") : "UNKNOWN",
    cluster_state_source: projectedUsable ? "PROJECTED" : realizedUsable ? "REALIZED" : "NONE",
  };
}

function cadenceForState(state) {
  if (new Set([STATES.SQUEEZE_ACTIVE, STATES.LIQUIDATION_MAGNET_ACTIVE]).has(state)) return "FAST";
  if (new Set([STATES.PRE_SQUEEZE, STATES.MOMENTUM_CONTINUATION, STATES.EXHAUSTION_WARNING]).has(state)) return "ACTIVE";
  return "WATCH";
}

function freshCounters() {
  return {
    squeeze_confirmed: 0,
    momentum_confirmed: 0,
    liquidation_magnet_context_confirmed: 0,
    exhaustion_confirmed: 0,
    edge_spent_confirmed: 0,
    recovery_fresh: 0,
  };
}

export function createWatch(observation, now, limits = DEFAULT_LIMITS) {
  validateCanonicalContract(observation?.contract);
  const dq = inspectEvidence(observation, now, limits);
  invariant(dq.usable, `WATCH_CREATE_EVIDENCE_NOT_CLOSED:${dq.failures.join(",")}`);
  invariant(observation.signals?.anomaly_confirmed === true, "WATCH_CREATE_ANOMALY_NOT_CONFIRMED");
  invariant(typeof observation.event_id === "string" && observation.event_id.length > 0, "WATCH_CREATE_EVENT_ID_MISSING");
  return {
    engine_version: ENGINE_VERSION,
    contract: observation.contract,
    generation: 1,
    state: STATES.PRE_SQUEEZE,
    state_before_stale: null,
    state_entered_ts: now,
    created_ts: now,
    updated_ts: now,
    last_recheck_ts: null,
    next_recheck_ts: now + CADENCE_MS.ACTIVE,
    expiry_ts: now + limits.max_watch_lifetime_ms,
    last_evidence_ts: observation.source_ts,
    last_event_id: observation.event_id,
    last_reason_code: "DISCOVERY_ANOMALY_CONFIRMED",
    cadence_class: "ACTIVE",
    priority_class: "ACTIVE",
    attempt_count: 0,
    deferral_count: 0,
    missed_due_count: 0,
    cluster_lifecycle: liquidationContext(observation.liquidation).cluster_state,
    cluster_lifecycle_source: liquidationContext(observation.liquidation).cluster_state_source,
    counters: freshCounters(),
    closure_reason: null,
    safety: safetyEnvelope(),
  };
}

function confirmedTarget(observation, priorCounters) {
  const counters = { ...freshCounters(), ...(priorCounters || {}) };
  const eligible = [];
  for (const [target, signal] of Object.entries(TRANSITION_SIGNAL)) {
    if (target === STATES.PRE_SQUEEZE) continue;
    counters[signal] = observation.signals?.[signal] === true ? (counters[signal] || 0) + 1 : 0;
    if (counters[signal] >= 2) eligible.push(target);
  }
  // Safety/de-risking transitions win over escalation when simultaneous.
  const order = [STATES.EDGE_SPENT, STATES.EXHAUSTION_WARNING, STATES.MOMENTUM_CONTINUATION, STATES.LIQUIDATION_MAGNET_ACTIVE, STATES.SQUEEZE_ACTIVE];
  return { counters, target: order.find((x) => eligible.includes(x)) || null };
}

export function advanceWatch(previous, observation, now, limits = DEFAULT_LIMITS) {
  invariant(previous && previous.contract, "WATCH_PREVIOUS_MISSING");
  validateCanonicalContract(previous.contract);
  if (observation?.contract !== previous.contract) throw new Error("WATCH_CONTRACT_MISMATCH");
  if (TERMINAL_STATES.has(previous.state)) return { watch: { ...previous }, event: null, idempotent: true };
  if (now >= previous.expiry_ts) {
    const watch = { ...previous, state: STATES.EXPIRED, updated_ts: now, next_recheck_ts: null, closure_reason: "MAX_LIFETIME_REACHED", last_reason_code: "MAX_LIFETIME_REACHED" };
    return { watch, event: transitionEvent(previous, watch, observation, now), idempotent: false };
  }
  if (observation?.event_id && observation.event_id === previous.last_event_id) return { watch: { ...previous }, event: null, idempotent: true };

  const dq = inspectEvidence(observation, now, limits);
  if (!dq.usable) {
    const watch = {
      ...previous,
      state_before_stale: previous.state === STATES.STALE ? previous.state_before_stale : previous.state,
      state: STATES.STALE,
      updated_ts: now,
      last_event_id: observation?.event_id || previous.last_event_id,
      last_reason_code: dq.failures[0] || "EVIDENCE_NOT_CLOSED",
      cadence_class: "WATCH",
      priority_class: "WATCH",
      next_recheck_ts: Math.min(previous.expiry_ts, now + CADENCE_MS.WATCH),
      counters: { ...freshCounters(), recovery_fresh: 0 },
    };
    return { watch, event: transitionEvent(previous, watch, observation, now, dq), idempotent: false };
  }

  if (previous.state === STATES.STALE) {
    const recovered = (previous.counters?.recovery_fresh || 0) + 1;
    if (recovered < 2) {
      return { watch: { ...previous, updated_ts: now, last_event_id: observation.event_id, last_evidence_ts: observation.source_ts, counters: { ...previous.counters, recovery_fresh: recovered }, next_recheck_ts: now + CADENCE_MS.ACTIVE }, event: null, idempotent: false };
    }
    const restored = ACTIVE_STATES.has(previous.state_before_stale) ? previous.state_before_stale : STATES.PRE_SQUEEZE;
    const cadence = cadenceForState(restored);
    const watch = { ...previous, state: restored, state_before_stale: null, state_entered_ts: now, updated_ts: now, last_event_id: observation.event_id, last_evidence_ts: observation.source_ts, last_reason_code: "FRESHNESS_RECOVERED_CONFIRMED", cadence_class: cadence, priority_class: cadence, next_recheck_ts: now + CADENCE_MS[cadence], counters: freshCounters() };
    return { watch, event: transitionEvent(previous, watch, observation, now), idempotent: false };
  }

  const liq = liquidationContext(observation.liquidation);
  const normalizedObservation = {
    ...observation,
    signals: {
      ...(observation.signals || {}),
      liquidation_magnet_context_confirmed:
        observation.signals?.liquidation_magnet_context_confirmed === true &&
        (liq.projected_usable || liq.realized_usable) &&
        Array.isArray(observation.independence_groups) &&
        new Set(observation.independence_groups).size >= 2,
    },
  };
  const { counters, target } = confirmedTarget(normalizedObservation, previous.counters);
  const allowed = target && ALLOWED_TRANSITIONS[previous.state]?.has(target);
  const state = allowed ? target : previous.state;
  const clusterKnown = new Set(["ACTIVE", "APPROACHING", "TOUCHED", "SWEPT"]).has(liq.cluster_state);
  const clusterChanged = clusterKnown && liq.cluster_state !== previous.cluster_lifecycle;
  const cadence = cadenceForState(state);
  const watch = {
    ...previous,
    state,
    state_entered_ts: state === previous.state ? previous.state_entered_ts : now,
    updated_ts: now,
    last_event_id: observation.event_id,
    last_evidence_ts: observation.source_ts,
    last_reason_code: state !== previous.state ? `${state}_CONFIRMED` : clusterChanged ? `LIQUIDATION_CLUSTER_${liq.cluster_state}` : "CONFIRMATION_PENDING_OR_NO_TRANSITION",
    cluster_lifecycle: clusterChanged ? liq.cluster_state : previous.cluster_lifecycle,
    cluster_lifecycle_source: clusterChanged ? liq.cluster_state_source : previous.cluster_lifecycle_source,
    cadence_class: cadence,
    priority_class: cadence,
    next_recheck_ts: state === STATES.EDGE_SPENT ? now + CADENCE_MS.WATCH : now + CADENCE_MS[cadence],
    counters,
  };
  return { watch, event: state === previous.state && !clusterChanged ? null : transitionEvent(previous, watch, observation, now, dq, liq), idempotent: false };
}

export function closeWatch(previous, now, reason = "EXPLICIT_CLOSE") {
  invariant(previous && previous.contract, "WATCH_PREVIOUS_MISSING");
  if (TERMINAL_STATES.has(previous.state)) return { ...previous };
  return { ...previous, state: STATES.CLOSED, updated_ts: now, next_recheck_ts: null, closure_reason: reason, last_reason_code: reason };
}

function transitionEvent(before, after, observation, now, dq = null, liq = null) {
  const evidenceKey = observation?.event_id || now;
  return {
    // The source event, not the local wall-clock race, is the idempotency key.
    event_id: `${after.contract}:${after.generation}:${evidenceKey}:${after.state}`,
    engine_version: ENGINE_VERSION,
    contract: after.contract,
    generation: after.generation,
    observed_ts: now,
    from_state: before.state,
    to_state: after.state,
    reason_code: after.last_reason_code,
    source_evidence_ts: observation?.source_ts ?? null,
    evidence_ids: Array.isArray(observation?.evidence_ids) ? [...observation.evidence_ids] : [],
    evidence_status: dq?.status || "CLOSED",
    projected_liquidation_status: liq?.projected_status || observation?.liquidation?.projected?.status || "UNKNOWN",
    realized_liquidation_status: liq?.realized_status || observation?.liquidation?.realized?.status || "UNKNOWN",
    safety: safetyEnvelope(),
  };
}

export function openingEvent(watch, observation, now, previous = null) {
  invariant(watch && watch.contract, "WATCH_OPEN_EVENT_WATCH_MISSING");
  invariant(observation?.event_id, "WATCH_OPEN_EVENT_DISCOVERY_MISSING");
  const reentry = Boolean(
    previous &&
    TERMINAL_STATES.has(previous.state) &&
    Number(watch.generation || 0) > Number(previous.generation || 0)
  );
  return {
    event_id: `${watch.contract}:${watch.generation}:${observation.event_id}:WATCH_OPENED`,
    engine_version: ENGINE_VERSION,
    contract: watch.contract,
    generation: watch.generation,
    observed_ts: now,
    from_state: reentry ? previous.state : "NONE",
    to_state: watch.state,
    reason_code: reentry ? "NEW_DISCOVERY_CONFIRMED" : "DISCOVERY_ANOMALY_CONFIRMED",
    source_evidence_ts: observation.source_ts ?? null,
    evidence_ids: Array.isArray(observation.evidence_ids) ? [...observation.evidence_ids] : [],
    evidence_status: "CLOSED",
    projected_liquidation_status: observation?.liquidation?.projected?.status || "UNKNOWN",
    realized_liquidation_status: observation?.liquidation?.realized?.status || "UNKNOWN",
    safety: safetyEnvelope(),
  };
}

export function deduplicateWatches(watches = []) {
  const byContract = new Map();
  let duplicate_suppressed = 0;
  for (const item of watches) {
    validateCanonicalContract(item.contract);
    const current = byContract.get(item.contract);
    if (!current || Number(item.generation || 0) > Number(current.generation || 0) || (item.generation === current.generation && item.updated_ts > current.updated_ts)) {
      if (current) duplicate_suppressed += 1;
      byContract.set(item.contract, { ...item });
    } else duplicate_suppressed += 1;
  }
  return { watches: [...byContract.values()], duplicate_suppressed };
}

function priorityRank(value) {
  return value === "FAST" ? 0 : value === "ACTIVE" ? 1 : 2;
}

const FAIRNESS_ROTATION_MS = 15 * 60 * 1000;

function fairnessDebt(watch) {
  return Number(watch?.missed_due_count || 0) + Number(watch?.deferral_count || 0);
}

function schedulerClass(watch) {
  if (watch?.priority_class === "FAST") return "URGENT";
  if (Number(watch?.missed_due_count || 0) >= 2 || Number(watch?.deferral_count || 0) >= 2) return "AGING";
  if (
    watch?.last_recheck_ts == null &&
    Number(watch?.attempt_count || 0) === 0 &&
    Number(watch?.missed_due_count || 0) === 0 &&
    Number(watch?.deferral_count || 0) === 0
  ) return "FRESH";
  return "REGULAR";
}

function schedulerSort(a, b) {
  return (
    (b.missed_due_count || 0) - (a.missed_due_count || 0) ||
    (b.deferral_count || 0) - (a.deferral_count || 0) ||
    priorityRank(a.priority_class) - priorityRank(b.priority_class) ||
    a.next_recheck_ts - b.next_recheck_ts ||
    (a.last_recheck_ts || 0) - (b.last_recheck_ts || 0) ||
    a.contract.localeCompare(b.contract)
  );
}

function fairnessOrder(due, now, limits) {
  const groups = {
    URGENT: [],
    FRESH: [],
    AGING: [],
    REGULAR: [],
  };
  for (const watch of due) groups[schedulerClass(watch)].push(watch);
  for (const rows of Object.values(groups)) rows.sort(schedulerSort);

  const ordered = [];
  const seen = new Set();
  const push = (watch) => {
    if (!watch) return;
    const key = `${watch.contract}:${watch.generation}`;
    if (seen.has(key)) return;
    seen.add(key);
    ordered.push({ ...watch, scheduler_selection_class: schedulerClass(watch) });
  };

  // A genuinely urgent recheck always gets first consideration. With the
  // current resource-derived one-full-Deep-Check capacity this prevents an
  // old low-priority observation from suppressing a near-action change.
  push(groups.URGENT.shift());

  const singleDeepSlot = Number(limits?.max_deep_checks_per_cycle || 0) <= 1;
  if (!ordered.length && singleDeepSlot && groups.FRESH.length && groups.AGING.length) {
    const freshTurn = Math.floor(Number(now) / FAIRNESS_ROTATION_MS) % 2 === 0;
    push(freshTurn ? groups.FRESH.shift() : groups.AGING.shift());
  }

  // If capacity grows later, the first four considerations naturally become
  // urgent + two fresh + one aging (when those classes exist), matching the
  // intended queue balance without hard-coding a strategy-level throughput.
  push(groups.FRESH.shift());
  push(groups.FRESH.shift());
  push(groups.AGING.shift());

  for (const name of ["URGENT", "AGING", "FRESH", "REGULAR"]) {
    for (const watch of groups[name]) push(watch);
  }
  return ordered;
}

export function planRechecks(watches, now, limits = DEFAULT_LIMITS) {
  const deduped = deduplicateWatches(watches);
  const active = deduped.watches.filter((w) => !TERMINAL_STATES.has(w.state));
  const capacitySorted = [...active].sort((a, b) => (a.created_ts - b.created_ts) || a.contract.localeCompare(b.contract));
  const admitted = capacitySorted.slice(0, limits.max_active_watches);
  const capacity_rejected = capacitySorted.slice(limits.max_active_watches).map((w) => w.contract);
  const activeLeaseBlocked = admitted.filter(
    (w) => Boolean(w.lease_owner) && Number(w.lease_expires_ts || 0) > now,
  );
  const due = admitted.filter(
    (w) =>
      Number.isFinite(w.next_recheck_ts) &&
      w.next_recheck_ts <= now &&
      !(Boolean(w.lease_owner) && Number(w.lease_expires_ts || 0) > now),
  );
  const orderedDue = fairnessOrder(due, now, limits);
  const selected = [];
  let calls = 0;
  let writes = 0;
  let deep = 0;
  const invalid_budget_rejected = [];
  for (const watch of orderedDue) {
    const rawCalls = Number(watch.external_call_estimate ?? 1);
    const rawWrites = Number(watch.d1_write_estimate ?? 1);
    if (!Number.isFinite(rawCalls) || rawCalls < 0 || !Number.isFinite(rawWrites) || rawWrites < 1) {
      invalid_budget_rejected.push(watch.contract);
      continue;
    }
    const estimatedCalls = rawCalls;
    const estimatedWrites = rawWrites;
    const needsDeep = watch.requires_deep_check === true ? 1 : 0;
    if (selected.length >= limits.max_rechecks_per_cycle) continue;
    if (calls + estimatedCalls > limits.max_external_calls_per_cycle) continue;
    if (writes + estimatedWrites > limits.max_d1_writes_per_cycle) continue;
    if (deep + needsDeep > limits.max_deep_checks_per_cycle) continue;
    selected.push({
      ...watch,
      scheduler_selection_class: watch.scheduler_selection_class || schedulerClass(watch),
      scheduler_priority_is_probability: false,
    });
    calls += estimatedCalls;
    writes += estimatedWrites;
    deep += needsDeep;
  }
  const selectedKeys = new Set(selected.map((w) => `${w.contract}:${w.generation}`));
  const deferred = due.filter((w) => !selectedKeys.has(`${w.contract}:${w.generation}`));
  return {
    selected,
    deferred,
    active_lease_blocked: activeLeaseBlocked.map((w) => w.contract),
    invalid_budget_rejected,
    capacity_rejected,
    duplicate_suppressed: deduped.duplicate_suppressed,
    budgets: { rechecks: selected.length, external_calls: calls, d1_writes: writes, deep_checks: deep },
    queue_depth: due.length,
    starvation_indicator: deferred.some((w) => (w.missed_due_count || 0) >= 3),
    scheduler_priority_is_probability: false,
  };
}

export function completeRecheck(watch, now, result, limits = DEFAULT_LIMITS) {
  invariant(watch && watch.contract, "WATCH_MISSING");
  const ok = result?.status === "CLOSED";
  const attempts = ok ? 0 : (watch.attempt_count || 0) + 1;
  if (!ok && attempts > limits.retry_budget) {
    return {
      ...watch,
      state_before_stale: watch.state === STATES.STALE ? watch.state_before_stale : watch.state,
      state: STATES.STALE,
      updated_ts: now,
      last_recheck_ts: now,
      next_recheck_ts: Math.min(watch.expiry_ts, now + CADENCE_MS.WATCH),
      attempt_count: attempts,
      last_reason_code: "SOURCE_RETRY_BUDGET_EXHAUSTED",
      cadence_class: "WATCH",
      priority_class: "WATCH",
    };
  }
  const cadence = ok ? cadenceForState(watch.state) : "ACTIVE";
  const retryMultiplier = ok ? 1 : attempts;
  return {
    ...watch,
    updated_ts: now,
    last_recheck_ts: now,
    next_recheck_ts: Math.min(watch.expiry_ts, now + CADENCE_MS[cadence] * retryMultiplier),
    attempt_count: attempts,
    // Fairness debt measures work that was due but not executed. Once the watch
    // actually gets a recheck, stale debt must not permanently bias scheduling.
    deferral_count: 0,
    missed_due_count: 0,
    last_reason_code: ok ? "RECHECK_CLOSED" : "RECHECK_RETRY_BOUNDED",
  };
}

export function recoverAfterRestart(watches, now, limits = DEFAULT_LIMITS) {
  const deduped = deduplicateWatches(watches);
  const recovered = [];
  let expired_watchers = 0;
  let abandoned_leases = 0;
  for (const original of deduped.watches) {
    let watch = { ...original };
    if (!TERMINAL_STATES.has(watch.state) && now >= watch.expiry_ts) {
      watch = { ...watch, state: STATES.EXPIRED, next_recheck_ts: null, updated_ts: now, closure_reason: "EXPIRED_DURING_RESTART", last_reason_code: "EXPIRED_DURING_RESTART" };
      expired_watchers += 1;
    } else if (watch.lease_owner && Number(watch.lease_expires_ts || 0) <= now) {
      watch.lease_owner = null;
      watch.lease_expires_ts = null;
      watch.next_recheck_ts = Math.max(now, Number(watch.next_recheck_ts || now));
      watch.last_reason_code = "EXPIRED_LEASE_RECOVERED";
      abandoned_leases += 1;
    }
    recovered.push(watch);
  }
  return { watches: recovered, duplicate_suppressed: deduped.duplicate_suppressed, expired_watchers, abandoned_leases, limits_version: ENGINE_VERSION };
}

export function canReenter(previous, discovery, now, limits = DEFAULT_LIMITS) {
  if (!previous || !TERMINAL_STATES.has(previous.state)) return { allowed: false, reason: "PRIOR_NOT_TERMINAL" };
  if (now < Number(previous.updated_ts || 0) + limits.reentry_cooldown_ms) return { allowed: false, reason: "REENTRY_COOLDOWN" };
  if (!discovery?.event_id || discovery.event_id === previous.last_event_id) return { allowed: false, reason: "NEW_DISCOVERY_REQUIRED" };
  const dq = inspectEvidence(discovery, now, limits);
  return dq.usable && discovery.signals?.anomaly_confirmed === true
    ? { allowed: true, reason: "NEW_DISCOVERY_CONFIRMED", generation: Number(previous.generation || 0) + 1 }
    : { allowed: false, reason: dq.failures[0] || "ANOMALY_NOT_CONFIRMED" };
}

export function observability(watches, plan, now) {
  const active = watches.filter((w) => ACTIVE_STATES.has(w.state));
  const latency = plan.selected.map((w) => Math.max(0, now - w.next_recheck_ts)).sort((a, b) => a - b);
  const average = latency.length ? latency.reduce((a, b) => a + b, 0) / latency.length : null;
  const p95 = latency.length ? latency[Math.min(latency.length - 1, Math.ceil(latency.length * 0.95) - 1)] : null;
  const counts = {};
  for (const w of watches) counts[w.state] = (counts[w.state] || 0) + 1;
  return {
    active_watch_count: active.length,
    fast_watch_count: active.filter((w) => w.cadence_class === "FAST").length,
    slow_watch_count: active.filter((w) => w.cadence_class === "WATCH").length,
    rechecks_due: plan.queue_depth,
    rechecks_executed: plan.selected.length,
    duplicate_suppressed: plan.duplicate_suppressed,
    queue_depth: plan.queue_depth,
    queue_starvation_indicator: plan.starvation_indicator,
    average_recheck_latency_ms: average,
    p95_recheck_latency_ms: p95,
    state_counts: counts,
    scheduler_priority_is_probability: false,
    safety: safetyEnvelope(),
  };
}
