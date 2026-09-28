const TRUE = new Set(["1", "true", "yes", "on"]);
const FALSE = new Set(["0", "false", "no", "off", ""]);

export function strictSwitch(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (TRUE.has(normalized)) return true;
  if (FALSE.has(normalized)) return false;
  return false;
}

export function resolveRuntimeSwitches(env = process.env) {
  const legacyRunner = strictSwitch(env.REPORT2_RUNNER_ENABLED);
  const choose = (name, fallback) => Object.hasOwn(env, name)
    ? strictSwitch(env[name])
    : fallback;
  return Object.freeze({
    analytics: choose("ANALYTICS_ENABLED", legacyRunner),
    public_collector: choose("PUBLIC_COLLECTOR_ENABLED", false),
    delivery: choose("DELIVERY_ENABLED", strictSwitch(env.REPORT2_TELEGRAM_OUTPUT_ENABLED)),
    calibration_apply: choose("CALIBRATION_APPLY_ENABLED", false),
  });
}

export function evaluatePreflight(env = process.env) {
  const source = String(env.REPORT2_RUN_SOURCE || "").trim();
  const generation = String(env.REPORT2_CURRENT_GENERATION || "").trim();
  const actor = String(env.REPORT2_ANALYTICS_ACTOR || "").trim();
  const switches = resolveRuntimeSwitches(env);
  const allowedSources = new Set(["schedule", "workflow_dispatch", "manual"]);
  if (!allowedSources.has(source)) return { allowed: false, status: "INVALID_RUN_SOURCE", source, generation, actor, switches };
  if (!generation) return { allowed: false, status: "MISSING_GENERATION", source, generation, actor, switches };
  if (actor !== "GITHUB_ACTIONS") return { allowed: false, status: "INVALID_ANALYTICS_ACTOR", source, generation, actor, switches };
  if (!switches.analytics) return { allowed: false, status: "ANALYTICS_DISABLED", source, generation, actor, switches };
  if (source !== "schedule" && !strictSwitch(env.REPORT2_MANUAL_RUN_AUTHORIZED)) {
    return { allowed: false, status: "MANUAL_RUN_NOT_AUTHORIZED", source, generation, actor, switches };
  }
  return { allowed: true, status: "ADMITTED", source, generation, actor, switches };
}
