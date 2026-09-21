import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const productionBase = "8a6551535be74dc12935aff7cf0ac053bc85bfc0";
const expectedWorker = "5eeb4e84c8158455112333ba0f2e53c23e21e612726fffafc30da6878fa69b46";
const protectedFiles = Object.freeze({
  "payload/report2-runtime.enc": "30f9d3b589b0caa8d409707e7e38f0a04c5080130fdd27ea7fa25826e234cf88",
  "runner/runner-main.mjs": "596f4cd9f6f23d314f5853c110212fcead1874d0cd6a7b9f87f415ae1e401242",
  "runner/r8-20-prospective-validation-sidecar.mjs": "032dd21974336534b86e5862703b1c6cd5a4c026f5b6780baea192c7caaba581",
  "runner/report2-d1-adapter.mjs": "1bb748ef05672ea89a3ac9089e2184f52073cc4026e1cb87c468dc06f49c6e5b",
  "runner/d1-preaction-budget-guard.mjs": "4391055f4dbc5a3e830059b38ca1e48704c32dcdeba67588358d04667dc76ab6",
  "runner/telegram-zero-reason.mjs": "3f565009fbd1c4411b24602687616d6c9cc4415ef562096b08f4cd66330d64ad",
  "runner/apply-telegram-runtime-overlay.mjs": "cef3465a6e3769bec9791ae65dcc52720b81b6f548800af55dda1ec6995ac819",
  "runner/telegram-runtime-overlay.json": "7428d835584bd98827852d5999eb5fd2bdade5f895f40c031ac54361e753f604"
});

function sha(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");
}
function git(...args) {
  return execFileSync("git", args, { cwd:root, encoding:"utf8" }).trim();
}
function refuse(message) {
  throw new Error(`CROSS_VENUE_DELTA_CANDIDATE_REFUSED:${message}`);
}

for (const [file, expected] of Object.entries(protectedFiles)) {
  if (!fs.existsSync(path.join(root, file))) refuse(`PROTECTED_FILE_MISSING:${file}`);
  const actual = sha(file);
  if (actual !== expected) refuse(`PROTECTED_FILE_CHANGED:${file}:${actual}`);
}

const originMain = git("rev-parse", "origin/main");
if (originMain !== productionBase) refuse(`ORIGIN_MAIN_MOVED:${originMain}`);
const mergeBase = git("merge-base", "HEAD", "origin/main");
if (mergeBase !== productionBase) refuse(`WRONG_PRODUCTION_BASE:${mergeBase}`);

const branch = process.env.GITHUB_REF_NAME || git("branch", "--show-current");
if (!/^cross-venue-no-visuals-delta-/u.test(branch)) refuse(`WRONG_BRANCH:${branch}`);

const changed = git("diff", "--name-only", `${productionBase}...HEAD`).split("\n").filter(Boolean);
const allowedExact = new Set([
  ".github/workflows/report2.yml",
  ".github/workflows/telegram-candidate-validation.yml",
  "runner/plain-text-telegram.mjs",
  "runner/telegram-info-runtime.mjs",
  "runner/telegram-output.mjs",
  "runner/validate-cross-venue-delta-candidate.mjs",
  "telegram-repair-tests/final-chain-regression.mjs",
  "telegram-repair-tests/telegram-entry-format-v2.test.mjs",
  "telegram-repair-tests/telegram-info-sqlite.test.mjs",
  "telegram-repair-tests/telegram-message-format-v2.test.mjs",
  "telegram-repair-tests/telegram-pipeline.test.mjs"
]);
for (const file of changed) {
  if (!allowedExact.has(file) && !file.startsWith("cross-venue-delta-overlay/")) refuse(`OUT_OF_SCOPE_CHANGE:${file}`);
  if (/^(?:migrations|runtime\/migrations)\//u.test(file) || file.endsWith(".sql")) refuse(`D1_MIGRATION_FORBIDDEN:${file}`);
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, "cross-venue-delta-overlay/manifest.json"), "utf8"));
if (manifest.productionBaseCommit !== productionBase) refuse("MANIFEST_BASE_MISMATCH");
if (manifest.expectedWorkerSha256 !== expectedWorker) refuse("MANIFEST_WORKER_MISMATCH");
if (sha("cross-venue-delta-overlay/runtime.patch") !== manifest.patchSha256) refuse("MANIFEST_PATCH_HASH_MISMATCH");
const workerEntry = manifest.files.find((entry) => entry.path === "src/worker.js");
if (workerEntry?.beforeSha256 !== "7a3c73770e516db9e7ef17ca3e582947769c0fa3f8cb2814e915ee0303695a83" || workerEntry?.afterSha256 !== expectedWorker) refuse("WORKER_TRANSITION_MISMATCH");

const productionWorkflow = fs.readFileSync(path.join(root, ".github/workflows/report2.yml"), "utf8");
if (!productionWorkflow.includes(`REPORT2_EXPECTED_WORKER_SHA: "${expectedWorker}"`)) refuse("PRODUCTION_WORKER_HASH_NOT_PINNED");
if (!productionWorkflow.includes("node cross-venue-delta-overlay/apply-runtime-overlay.mjs runtime")) refuse("DELTA_OVERLAY_NOT_WIRED");
if (!productionWorkflow.includes("cp runner/plain-text-telegram.mjs runtime/plain-text-telegram.mjs")) refuse("PLAIN_TEXT_GUARD_NOT_WIRED");
if (/REPORT2_TELEGRAM_SHADOW_DECISION_AUTO:\s*["']?1\b/u.test(productionWorkflow)) refuse("FINAL_AUTO_MUST_REMAIN_OFF");
if (/REPORT2_V3_TELEGRAM_NETWORK_ENABLED:\s*["']?1\b/u.test(productionWorkflow)) refuse("V3_TELEGRAM_NETWORK_MUST_REMAIN_OFF");
if (/force-with-lease|--force\b/u.test(productionWorkflow)) refuse("FORCE_PUSH_FORBIDDEN");
if (/wrangler\s+d1\s+(?:migrations\s+apply|execute)/iu.test(productionWorkflow)) refuse("D1_WRITE_FORBIDDEN");
if (!productionWorkflow.includes('cron: "2,7,12,17,22,27,32,37,42,47,52,57 * * * *"')) refuse("PRODUCTION_SCHEDULE_CHANGED");

const runtimePatch = fs.readFileSync(path.join(root, "cross-venue-delta-overlay/runtime.patch"), "utf8");
if (!runtimePatch.includes("CROSS_EXCHANGE_DERIVATIVES: 35")) refuse("FIXED_WEIGHTS_CONTEXT_MISSING");
if (/^[+-]\s+(?:CROSS_EXCHANGE_DERIVATIVES|MARKET_STRENGTH_SPOT|SMART_MONEY_ONCHAIN|SUPPORTING_RISK):/gmu.test(runtimePatch)) refuse("FIXED_WEIGHTS_CHANGED");
if (/sendPhoto|sendDocument|sendMediaGroup|sendAnimation|sendVideo|sendAudio/iu.test(runtimePatch)) refuse("VISUAL_TELEGRAM_METHOD_FORBIDDEN");

console.log(JSON.stringify({
  status:"PASS",
  exact_production_base:productionBase,
  candidate_branch:branch,
  changed_files:changed.length,
  production_changed:false,
  d1_migrations:0,
  force_push:false,
  final_auto_enabled:false,
  v3_telegram_network_enabled:false,
  expected_worker_sha256:expectedWorker
}, null, 2));
