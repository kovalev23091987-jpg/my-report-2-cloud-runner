import assert from "node:assert/strict";
import { buildFinalDecisionIntegrationShadow, validateFinalDecisionOutput } from "../src/final-decision-integration-engine.mjs";
import { completeInput, impulseCampaign, openPosition, positionOriginCampaign } from "./final-decision-integration-fixtures.mjs";

const direction = String(process.argv[2] || "").toUpperCase();
const open = String(process.argv[3] || "").toUpperCase() === "OPEN";
assert.ok(["LONG","SHORT"].includes(direction));

function fixture(direction, open) {
  if (!open) return completeInput(direction);
  const activeCampaign = impulseCampaign(direction);
  const position = openPosition(direction, activeCampaign);
  const origin = positionOriginCampaign(activeCampaign, position);
  return completeInput(direction, { campaign: activeCampaign, position, position_origin_campaign: origin });
}
function enumeratePaths(value, path = [], output = []) {
  if (path.length > 10) return output;
  output.push(path);
  if (!value || typeof value !== "object") return output;
  if (Array.isArray(value)) {
    for (let index = 0; index < Math.min(value.length, 5); index += 1) enumeratePaths(value[index], [...path, index], output);
  } else {
    for (const key of Object.keys(value)) enumeratePaths(value[key], [...path, key], output);
  }
  return output;
}
function mutatedCopy(source, path, kind) {
  if (path.length === 0) return kind === "null" ? null : kind === "array" ? [] : {};
  const copy = structuredClone(source);
  let parent = copy;
  for (const key of path.slice(0, -1)) parent = parent[key];
  const key = path.at(-1);
  if (kind === "delete") delete parent[key];
  else if (kind === "null") parent[key] = null;
  else if (kind === "type") {
    const prior = parent[key];
    parent[key] = typeof prior === "string" ? {} : typeof prior === "number" ? [] : "BROKEN";
  } else if (kind === "future") parent[key] = source.observed_ts + 1;
  return copy;
}
const source = fixture(direction, open);
let cases = 0;
for (const path of enumeratePaths(source)) {
  const leaf = path.reduce((value, key) => value?.[key], source);
  const kinds = path.length === 0 ? ["null", "array", "type"] : ["delete", "null", "type"];
  if (typeof leaf === "number" && /(?:^|_)(?:ts|time|timestamp)$|observed|available|committed|valid_until/i.test(String(path.at(-1)))) kinds.push("future");
  for (const kind of kinds) {
    cases += 1;
    let output;
    assert.doesNotThrow(() => { output = buildFinalDecisionIntegrationShadow(mutatedCopy(source, path, kind)); }, `${direction}:${open ? "OPEN" : "FLAT"}:${path.join(".")}:${kind}`);
    assert.deepEqual(validateFinalDecisionOutput(output), { valid: true, errors: [] }, `${direction}:${open ? "OPEN" : "FLAT"}:${path.join(".")}:${kind}`);
    assert.equal(output.shadow_only, true);
    assert.equal(output.execution_authorized, false);
    assert.equal(output.telegram_eligible, false);
    assert.equal(output.live_probability, null);
  }
}
console.log(JSON.stringify({ok:true,suite:"stage392-builder-totality-shard",direction,position:open?"OPEN":"FLAT",mutation_cases:cases}));
