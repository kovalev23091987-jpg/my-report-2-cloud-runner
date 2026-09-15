import fs from "node:fs/promises";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { RemoteD1Database } from "./report2-d1-adapter.mjs";

const RUNNER_VERSION = "my-report-2-github-cloud-runner-v4.1";
const nativeFetch = globalThis.fetch.bind(globalThis);
let wrappedFetchInstalled = false;

function envText(name, { required = true } = {}) {
  const value = String(process.env[name] || "").trim();
  if (required && !value) throw new Error(`${name}_REQUIRED`);
  return value;
}
async function sha256File(path) {
  const data = await fs.readFile(path);
  return crypto.createHash("sha256").update(data).digest("hex");
}
function installSourceProxyFetch() {
  if (wrappedFetchInstalled) return;
  globalThis.fetch = async (input, init = {}) => {
    let target;
    try { target = input instanceof Request ? new URL(input.url) : new URL(String(input)); }
    catch { return nativeFetch(input, init); }
    if (target.protocol === "https:" && target.hostname === "bykaranteli.com") {
      return nativeFetch(envText("REPORT2_SOURCE_PROXY_URL"), {
        method: "POST",
        headers: {
          "content-type": "application/json", accept: "application/json",
          authorization: `Bearer ${envText("REPORT2_SOURCE_PROXY_TOKEN")}`,
          "user-agent": "My-Report-2-GitHub-Source-Proxy/4",
        },
        body: JSON.stringify({ url: target.toString() }),
        signal: init?.signal ?? (input instanceof Request ? input.signal : undefined),
      });
    }
    return nativeFetch(input, init);
  };
  wrappedFetchInstalled = true;
}
async function loadWorker() {
  const workerPath = resolve("./src/worker.js");
  const expected = envText("REPORT2_EXPECTED_WORKER_SHA").toLowerCase();
  const actual = await sha256File(workerPath);
  if (actual !== expected) throw new Error(`WORKER_SHA_MISMATCH expected=${expected} actual=${actual}`);
  installSourceProxyFetch();
  const mod = await import(pathToFileURL(workerPath).href + `?run=${Date.now()}`);
  if (!mod?.default || typeof mod.default.scheduled !== "function") throw new Error("AUTHORITATIVE_WORKER_SCHEDULED_HANDLER_MISSING");
  return { worker: mod.default, sha: actual };
}
function buildEnv() {
  return {
    DATA_DB: new RemoteD1Database(envText("REPORT2_D1_BRIDGE_URL"), envText("REPORT2_D1_BRIDGE_TOKEN"), { fetchImpl: nativeFetch, timeoutMs: 45_000 }),
    BYKARANTELI_API_KEY: envText("BYKARANTELI_API_KEY"),
  };
}
function assertClosedCron(cron, scan) {
  if (!cron || cron.status !== "SUCCESS") throw new Error(`CRON_NOT_SUCCESS:${JSON.stringify(cron || {})}`);
  if (cron.completed_ts == null) throw new Error("CRON_NOT_COMPLETED");
  if (!(Number(cron.universe_total) > 0)) throw new Error("CRON_UNIVERSE_EMPTY");
  if (Number(cron.scanned) !== Number(cron.universe_total)) throw new Error("CRON_SCAN_INCOMPLETE");
  if (cron.persistence_status !== "CLOSED") throw new Error(`CRON_PERSISTENCE_${cron.persistence_status}`);
  if (!scan || !(Number(scan.universe_total) > 0)) throw new Error("SCAN_UNIVERSE_EMPTY");
  if (Number(scan.scanned) !== Number(scan.universe_total)) throw new Error("SCAN_INCOMPLETE");
  if (Number(scan.errors || 0) !== 0) throw new Error(`SCAN_ERRORS_${scan.errors}`);
  if (Number(scan.stale || 0) !== 0) throw new Error(`SCAN_STALE_${scan.stale}`);
  if (Number(scan.stage0_coverage_pct || 0) < 99.9) throw new Error(`SCAN_COVERAGE_${scan.stage0_coverage_pct}`);
}
async function main() {
  const source = envText("REPORT2_RUN_SOURCE", { required: false }) || "manual";
  const { worker, sha } = await loadWorker();
  const env = buildEnv();
  const pending = [];
  const ctx = { waitUntil(promise) { pending.push(Promise.resolve(promise)); }, passThroughOnException() {} };
  const started = Date.now();
  await worker.scheduled({ scheduledTime: started, cron: source === "schedule" ? "*/5 * * * *" : "manual" }, env, ctx);
  if (pending.length) await Promise.all(pending);
  const cron = await env.DATA_DB.prepare("SELECT run_id,scheduled_time,started_ts,completed_ts,status,universe_total,scanned,persistence_status,error_text FROM cron_runs WHERE started_ts >= ? ORDER BY started_ts DESC LIMIT 1").bind(started - 1000).first();
  const scan = await env.DATA_DB.prepare("SELECT ts,universe_total,scanned,errors,stale,stage0_coverage_pct FROM scan_runs WHERE ts >= ? ORDER BY ts DESC LIMIT 1").bind(started - 300000).first();
  assertClosedCron(cron, scan);
  const completed = Date.now();
  console.log(JSON.stringify({ ok:true, version:RUNNER_VERSION, source, started_ts:started, completed_ts:completed, duration_ms:completed-started, worker_sha256:sha, cron_run_id:cron.run_id, universe_total:Number(cron.universe_total), scanned:Number(cron.scanned), stage0_coverage_pct:Number(scan.stage0_coverage_pct), bykaranteli_secret_exported:false }));
}
main().catch((error) => { console.error("REPORT2_RUNNER_FATAL", String(error?.stack || error)); process.exit(1); });
