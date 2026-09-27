import test from "node:test";
import assert from "node:assert/strict";
import { evaluatePreflight, resolveRuntimeSwitches, strictSwitch } from "../../runner/preflight-role-gate.mjs";

const BASE = {
  REPORT2_RUN_SOURCE: "schedule",
  REPORT2_CURRENT_GENERATION: "GENERATION_TEST",
  REPORT2_ANALYTICS_ACTOR: "GITHUB_ACTIONS",
  REPORT2_RUNNER_ENABLED: "1",
};

test("K02: invalid switch values fail closed", () => {
  assert.equal(strictSwitch("perhaps"), false);
  const switches = resolveRuntimeSwitches({
    ...BASE,
    ANALYTICS_ENABLED: "invalid",
    PUBLIC_COLLECTOR_ENABLED: "invalid",
    DELIVERY_ENABLED: "invalid",
    CALIBRATION_APPLY_ENABLED: "invalid",
  });
  assert.deepEqual(switches, { analytics:false, public_collector:false, delivery:false, calibration_apply:false });
});

test("K02: legacy runner flag maps once when the explicit analytics switch is absent", () => {
  assert.equal(resolveRuntimeSwitches(BASE).analytics, true);
  assert.equal(resolveRuntimeSwitches({...BASE, REPORT2_RUNNER_ENABLED:"0"}).analytics, false);
  assert.equal(resolveRuntimeSwitches({...BASE, REPORT2_RUNNER_ENABLED:"1", ANALYTICS_ENABLED:"0"}).analytics, false);
});

test("K02: disabled scheduled run is rejected before runtime work", () => {
  assert.equal(evaluatePreflight({...BASE, ANALYTICS_ENABLED:"0"}).status, "ANALYTICS_DISABLED");
});

test("K02: manual run requires its independent explicit authorization", () => {
  const env = {...BASE, REPORT2_RUN_SOURCE:"workflow_dispatch", ANALYTICS_ENABLED:"1"};
  assert.equal(evaluatePreflight(env).status, "MANUAL_RUN_NOT_AUTHORIZED");
  assert.equal(evaluatePreflight({...env, REPORT2_MANUAL_RUN_AUTHORIZED:"1"}).status, "ADMITTED");
});

test("K02: role and generation are checked before admission", () => {
  assert.equal(evaluatePreflight({...BASE, REPORT2_ANALYTICS_ACTOR:"LEGACY_HUB"}).status, "INVALID_ANALYTICS_ACTOR");
  assert.equal(evaluatePreflight({...BASE, REPORT2_CURRENT_GENERATION:""}).status, "MISSING_GENERATION");
});
