import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function scalar(workflow, key, allowIdentical = false) {
  const matches = [...workflow.matchAll(new RegExp(`^\\s+${key}: "([^"\\r\\n]+)"\\s*$`, 'gm'))];
  if (!matches.length || (matches.length !== 1 && (!allowIdentical || new Set(matches.map(match => match[1])).size !== 1))) {
    throw Error(`CURRENT_BINDING_AMBIGUOUS_${key}`);
  }
  return matches[0][1];
}

// The authoritative workflow remains the independent pin. Never bless the
// assembled runtime by deriving its expected hash from those same bytes.
export function inspectCurrentRuntimeBinding({repositoryRoot = root, runtimeRoot = null} = {}) {
  const read = relative => fs.readFileSync(path.join(repositoryRoot, relative), 'utf8');
  const pointer = JSON.parse(read('REPORT2_CURRENT_GENERATION.json'));
  const generation = JSON.parse(read('current-generation/GENERATION.json'));
  if (pointer.latest_only !== true || pointer.authoritative_workflow !== '.github/workflows/report2.yml') {
    throw Error('CURRENT_BINDING_AUTHORITY_MISMATCH');
  }
  const workflow = read(pointer.authoritative_workflow);
  const expected = scalar(workflow, 'REPORT2_EXPECTED_WORKER_SHA');
  // Manual enqueue and scheduled execution each pin the same generation.
  const current = scalar(workflow, 'REPORT2_CURRENT_GENERATION', true);
  if (!/^[a-f0-9]{64}$/.test(expected)) throw Error('CURRENT_BINDING_INVALID_PIN');
  if (!/^MY_REPORT_2_[A-Z0-9_]+$/.test(current) || current !== pointer.generation || current !== generation.generation) {
    throw Error('CURRENT_BINDING_GENERATION_MISMATCH');
  }
  if (digest(fs.readFileSync(path.join(repositoryRoot, 'current-generation/files/src/worker.js'))) !== expected) {
    throw Error('CURRENT_BINDING_SOURCE_HASH_MISMATCH');
  }
  if (runtimeRoot && digest(fs.readFileSync(path.join(runtimeRoot, 'src/worker.js'))) !== expected) {
    throw Error('CURRENT_BINDING_RUNTIME_HASH_MISMATCH');
  }
  return {status: 'CURRENT_RUNTIME_BINDING_VERIFIED', generation: current, worker_sha256: expected, runtime_checked: Boolean(runtimeRoot)};
}

export function bindCurrentRuntimeEnvironment(options = {}, environmentFile) {
  const result = inspectCurrentRuntimeBinding(options);
  if (!environmentFile) throw Error('CURRENT_BINDING_ENV_FILE_REQUIRED');
  fs.appendFileSync(environmentFile, `REPORT2_EXPECTED_WORKER_SHA=${result.worker_sha256}\nREPORT2_CURRENT_GENERATION=${result.generation}\n`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  let result;
  if (args.length === 1 && args[0] === '--github-env') {
    result = bindCurrentRuntimeEnvironment({}, process.env.GITHUB_ENV);
  } else if (args.length === 2 && args[0] === '--runtime') {
    result = inspectCurrentRuntimeBinding({runtimeRoot: path.resolve(args[1])});
  } else if (args.length === 0) {
    result = inspectCurrentRuntimeBinding();
  } else {
    throw Error('CURRENT_BINDING_USAGE: [--github-env | --runtime PATH]');
  }
  console.log(JSON.stringify(result));
}
