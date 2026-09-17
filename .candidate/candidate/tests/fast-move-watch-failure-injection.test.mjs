import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_LIMITS, STATES, advanceWatch, completeRecheck, createWatch,
  planRechecks, recoverAfterRestart,
} from "../src/fast-move-watch-engine.mjs";

const T = 1_800_000_000_000;
function obs(contract, event_id, overrides = {}) {
  return {
    contract, event_id, source_ts: overrides.source_ts ?? T,
    max_age_ms: 180_000, freshness_status: "CURRENT", coverage_pct: 100,
    coverage_status: "CLOSED", data_quality_status: "GREEN",
    canonical_identity_verified: true, external_alias_used: false,
    evidence_ids: [event_id + ":price", event_id + ":oi"],
    independence_groups: ["PRICE", "DERIVATIVES"],
    signals: { anomaly_confirmed: true, ...(overrides.signals || {}) },
    liquidation: overrides.liquidation || {
      projected: { status: "NOT_CLOSED", providers: [], asset_identity_verified: false },
      realized: { status: "NOT_CLOSED", asset_identity_verified: true },
    },
    ...overrides,
  };
}

test("duplicate storm collapses to one watch per exact canonical contract", () => {
  const base = createWatch(obs("ETHFI-USDT", "e0"), T);
  const storm = Array.from({ length: 10_000 }, (_, i) => ({ ...base, updated_ts: T + i }));
  const plan = planRechecks(storm, T + 20_000);
  assert.equal(plan.duplicate_suppressed, 9_999);
  assert.ok(plan.queue_depth <= 1);
});

test("candidate storm remains bounded and deterministic", () => {
  const items = Array.from({ length: 5_000 }, (_, i) => createWatch(obs(`C${i}-USDT`, `e${i}`), T));
  for (const item of items) item.next_recheck_ts = T;
  const a = planRechecks(items, T);
  const b = planRechecks([...items].reverse(), T);
  assert.ok(a.selected.length <= DEFAULT_LIMITS.max_rechecks_per_cycle);
  assert.ok(a.budgets.deep_checks <= DEFAULT_LIMITS.max_deep_checks_per_cycle);
  assert.deepEqual(a.selected.map((x) => x.contract), b.selected.map((x) => x.contract));
});

test("rapid contradictory state ticks do not oscillate", () => {
  let watch = createWatch(obs("RAPID-USDT", "e0"), T);
  const patterns = [
    { squeeze_confirmed: true }, { exhaustion_confirmed: true },
    { squeeze_confirmed: true }, { momentum_confirmed: true },
    { edge_spent_confirmed: true }, { momentum_confirmed: true },
  ];
  for (let i = 0; i < patterns.length; i++) {
    watch = advanceWatch(watch, obs("RAPID-USDT", `e${i + 1}`, { source_ts: T + i + 1, signals: patterns[i] }), T + i + 1).watch;
  }
  assert.equal(watch.state, STATES.PRE_SQUEEZE);
});

test("rate-limit failures exhaust bounded retry and stop fast cadence", () => {
  let watch = createWatch(obs("RATE-USDT", "e0"), T);
  watch.state = STATES.SQUEEZE_ACTIVE;
  watch.cadence_class = "FAST";
  for (let i = 1; i <= DEFAULT_LIMITS.retry_budget + 1; i++) watch = completeRecheck(watch, T + i, { status: "RATE_LIMITED" });
  assert.equal(watch.state, STATES.STALE);
  assert.equal(watch.cadence_class, "WATCH");
});

test("restart storm releases expired leases without duplicating symbols", () => {
  const unicode = ["龙虾-USDT", "测试-USDT", "ETHFI-USDT"];
  const items = unicode.flatMap((contract, j) => {
    const w = createWatch(obs(contract, `e${j}`), T);
    return [w, { ...w, updated_ts: T + 1, lease_owner: "dead", lease_expires_ts: T - 1 }];
  });
  const result = recoverAfterRestart(items, T);
  assert.equal(result.watches.length, unicode.length);
  assert.equal(result.duplicate_suppressed, unicode.length);
  assert.equal(result.abandoned_leases, unicode.length);
  assert.deepEqual(new Set(result.watches.map((w) => w.contract)), new Set(unicode));
});

test("stale/future/unsupported evidence cannot activate liquidation magnet", () => {
  const cases = [
    { source_ts: T - 999_999 },
    { source_ts: T + DEFAULT_LIMITS.max_future_skew_ms + 1 },
    { freshness_status: "SOURCE_UNSUPPORTED" },
    { canonical_identity_verified: false },
  ];
  for (let i = 0; i < cases.length; i++) {
    let watch = createWatch(obs(`L${i}-USDT`, `base${i}`), T);
    const o = obs(`L${i}-USDT`, `bad${i}`, {
      ...cases[i],
      signals: { liquidation_magnet_context_confirmed: true },
      liquidation: { projected: { status: "CLOSED", asset_identity_verified: true, providers: ["P"] }, realized: { status: "CLOSED", asset_identity_verified: true } },
    });
    watch = advanceWatch(watch, o, T).watch;
    assert.notEqual(watch.state, STATES.LIQUIDATION_MAGNET_ACTIVE);
  }
});
