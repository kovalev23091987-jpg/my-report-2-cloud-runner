import { evaluatePreflight } from "../current-generation/files/src/runtime-control.mjs";

export { strictSwitch, resolveRuntimeSwitches, evaluatePreflight } from "../current-generation/files/src/runtime-control.mjs";

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = evaluatePreflight(process.env);
  process.stdout.write(`REPORT2_PREFLIGHT ${JSON.stringify(result)}\n`);
  if (!result.allowed) process.exitCode = 78;
}
