import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const overlayDir = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(process.argv[2] || "runtime");
const manifestPath = path.join(overlayDir, "manifest.json");
const patchPath = path.join(overlayDir, "runtime.patch");
const payloadPath = path.join(overlayDir, "runtime-files.tar.gz");

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function fail(message) {
  throw new Error(`CROSS_VENUE_DELTA_OVERLAY_REFUSED:${message}`);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
if (sha256(patchPath) !== manifest.patchSha256) fail("PATCH_HASH_MISMATCH");
if (sha256(payloadPath) !== manifest.payloadSha256) fail("PAYLOAD_HASH_MISMATCH");

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

function tar(args) {
  const result = spawnSync("tar", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) fail(`PAYLOAD_TAR_FAILED:${String(result.stderr || result.stdout).trim()}`);
  return result.stdout;
}

const expectedPaths = manifest.files.map((entry) => entry.path).sort();
const archivePaths = tar(["-tzf", payloadPath]).trim().split("\n").filter(Boolean).sort();
if (JSON.stringify(archivePaths) !== JSON.stringify(expectedPaths)) fail("PAYLOAD_PATH_SET_MISMATCH");

const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), "report2-cross-venue-delta-"));
const prepared = [];
const backups = [];
try {
  tar(["-xzf", payloadPath, "-C", stagingDir]);
  const payloadMismatches = manifest.files.filter((entry) => sha256(path.join(stagingDir, entry.path)) !== entry.afterSha256);
  if (payloadMismatches.length) fail(`PAYLOAD_FILE_HASH_MISMATCH:${payloadMismatches.map((entry) => entry.path).join(",")}`);

  for (const entry of manifest.files) {
    const target = path.join(runtimeDir, entry.path);
    const temporary = `${target}.cross-venue-delta.tmp`;
    fs.copyFileSync(path.join(stagingDir, entry.path), temporary);
    fs.chmodSync(temporary, fs.statSync(target).mode);
    prepared.push({ target, temporary, backup:`${target}.cross-venue-delta.backup` });
  }
  try {
    for (const item of prepared) {
      fs.renameSync(item.target, item.backup);
      backups.push(item);
      fs.renameSync(item.temporary, item.target);
    }
    const mismatches = manifest.files.filter((entry) => sha256(path.join(runtimeDir, entry.path)) !== entry.afterSha256);
    if (mismatches.length) throw new Error(`POST_INSTALL_HASH_MISMATCH:${mismatches.map((entry) => entry.path).join(",")}`);
    for (const item of backups) fs.rmSync(item.backup, { force:true });
  } catch (error) {
    for (const item of [...backups].reverse()) {
      fs.rmSync(item.target, { force:true });
      if (fs.existsSync(item.backup)) fs.renameSync(item.backup, item.target);
    }
    throw error;
  }
} catch (error) {
  for (const item of prepared) fs.rmSync(item.temporary, { force:true });
  fail(`ATOMIC_INSTALL_FAILED:${String(error?.message || error)}`);
} finally {
  fs.rmSync(stagingDir, { recursive:true, force:true });
}

console.log(`CROSS_VENUE_DELTA_OVERLAY_APPLIED worker_sha256=${manifest.expectedWorkerSha256}`);
