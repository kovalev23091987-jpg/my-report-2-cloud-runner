import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const overlayDir = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(process.argv[2] || "runtime");
const manifestPath = path.join(overlayDir, "manifest.json");
const patchPath = path.join(overlayDir, "runtime.patch");

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function fail(message) {
  throw new Error(`CROSS_VENUE_DELTA_OVERLAY_REFUSED:${message}`);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
if (sha256(patchPath) !== manifest.patchSha256) fail("PATCH_HASH_MISMATCH");

const states = manifest.files.map((entry) => {
  const target = path.resolve(runtimeDir, entry.path);
  if (!target.startsWith(`${runtimeDir}${path.sep}`)) fail(`UNSAFE_PATH:${entry.path}`);
  if (!fs.existsSync(target)) fail(`MISSING_TARGET:${entry.path}`);
  const actual = sha256(target);
  return {
    ...entry,
    target,
    actual,
    state: actual === entry.beforeSha256 ? "BEFORE" : (actual === entry.afterSha256 ? "AFTER" : "UNKNOWN"),
  };
});

if (states.every((entry) => entry.state === "AFTER")) {
  console.log(`CROSS_VENUE_DELTA_OVERLAY_ALREADY_APPLIED worker_sha256=${manifest.expectedWorkerSha256}`);
  process.exit(0);
}
if (!states.every((entry) => entry.state === "BEFORE")) {
  const detail = states.filter((entry) => entry.state !== "BEFORE").map((entry) => `${entry.path}:${entry.state}:${entry.actual}`).join(",");
  fail(`NON_ATOMIC_INPUT_STATE:${detail}`);
}

function gitApply(args) {
  const result = spawnSync("git", ["apply", ...args, patchPath], {
    cwd: runtimeDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) fail(`${args.includes("--check") ? "PATCH_CHECK" : "PATCH_APPLY"}_FAILED:${String(result.stderr || result.stdout).trim()}`);
}

gitApply(["--check"]);
gitApply(["--whitespace=nowarn"]);

const mismatches = manifest.files.filter((entry) => sha256(path.join(runtimeDir, entry.path)) !== entry.afterSha256);
if (mismatches.length) {
  const rollback = spawnSync("git", ["apply", "--reverse", "--whitespace=nowarn", patchPath], {
    cwd: runtimeDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  fail(`POST_APPLY_HASH_MISMATCH:${mismatches.map((entry) => entry.path).join(",")}:ROLLBACK_${rollback.status === 0 ? "OK" : "FAILED"}`);
}

console.log(`CROSS_VENUE_DELTA_OVERLAY_APPLIED worker_sha256=${manifest.expectedWorkerSha256}`);
