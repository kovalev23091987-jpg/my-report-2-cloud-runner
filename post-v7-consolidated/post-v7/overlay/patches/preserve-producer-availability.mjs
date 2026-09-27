import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

// Post-V7 repair only. This script does not deploy, fetch, or write to D1.
export const BASE_SHA256 = '08d3a04240625a93ac067a4c89adbb5a1f57a2926b2a5e77e2dc490af9c16f61';
export const TARGET = 'src/full-evidence-contract.mjs';
const OLD = '    observed_ts: observedTs,\n    source_ts: sourceTs,\n    now_ts: nowTs,';
const NEW = '    observed_ts: observedTs,\n    // Retain the producer clock; never synthesize availability from receipt time.\n    available_ts: finiteOrNull(raw.available_ts),\n    source_ts: sourceTs,\n    now_ts: nowTs,';
const sha = value => crypto.createHash('sha256').update(value).digest('hex');

export function prepareAvailabilityPatch(input) {
  if (typeof input !== 'string') throw new TypeError('SOURCE_TEXT_REQUIRED');
  // Even ALREADY_APPLIED must reverse exactly to the verified V7 predecessor.
  if (input.includes(NEW)) {
    if (input.split(NEW).length !== 2 || sha(input.replace(NEW, OLD)) !== BASE_SHA256)
      throw new Error('UNKNOWN_PATCHED_BASE');
    return {content: input, status: 'ALREADY_APPLIED', before_sha256: BASE_SHA256, after_sha256: sha(input)};
  }
  if (sha(input) !== BASE_SHA256) throw new Error('CURRENT_V7_BASE_HASH_MISMATCH');
  if (input.split(OLD).length !== 2) throw new Error('UNIQUE_PATCH_ANCHOR_REQUIRED');
  const content = input.replace(OLD, NEW);
  return {content, status: 'PATCH_PREPARED', before_sha256: sha(input), after_sha256: sha(content)};
}

export function applyAvailabilityPatch(runtimeDirectory) {
  const root = path.resolve(runtimeDirectory);
  const destination = path.join(root, TARGET);
  if (!fs.statSync(destination).isFile() || fs.lstatSync(destination).isSymbolicLink())
    throw new Error('REGULAR_RUNTIME_FILE_REQUIRED');
  const prepared = prepareAvailabilityPatch(fs.readFileSync(destination, 'utf8'));
  if (prepared.status !== 'ALREADY_APPLIED') {
    const temporary = destination + '.post-v7-availability.tmp';
    try {
      fs.writeFileSync(temporary, prepared.content, {flag: 'wx', mode: fs.statSync(destination).mode});
      if (sha(fs.readFileSync(temporary)) !== prepared.after_sha256) throw new Error('PATCH_WRITE_HASH_MISMATCH');
      fs.renameSync(temporary, destination);
    } catch (error) {
      fs.rmSync(temporary, {force: true});
      throw error;
    }
  }
  return {version:'post-v7-preserve-producer-availability-v1', status:prepared.status === 'ALREADY_APPLIED' ? 'ALREADY_APPLIED' : 'APPLIED_TO_LOCAL_RUNTIME', target:TARGET, before_sha256:prepared.before_sha256, after_sha256:prepared.after_sha256, production_deployed:false, d1_write:false, thresholds_changed:false, timestamp_synthesized:false};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('ISOLATED_RUNTIME_DIRECTORY_REQUIRED');
  console.log(JSON.stringify(applyAvailabilityPatch(process.argv[2]),null,2));
}
