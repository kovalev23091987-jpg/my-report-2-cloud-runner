import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {inspectCurrentRuntimeBinding, bindCurrentRuntimeEnvironment} from '../../runner/current-runtime-binding.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = 'export default {scheduled(){}};';
const pin = createHash('sha256').update(source).digest('hex');
const generation = 'MY_REPORT_2_BINDING_TEST';
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'report2-binding-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const write = (relative, content) => {const file = path.join(root, relative);fs.mkdirSync(path.dirname(file), {recursive: true});fs.writeFileSync(file, content);};
  write('REPORT2_CURRENT_GENERATION.json', JSON.stringify({generation, latest_only: true, authoritative_workflow: '.github/workflows/report2.yml'}));
  write('current-generation/GENERATION.json', JSON.stringify({generation}));
  write('.github/workflows/report2.yml', `jobs:\n  run:\n    env:\n      REPORT2_EXPECTED_WORKER_SHA: "${pin}"\n      REPORT2_CURRENT_GENERATION: "${generation}"\n`);
  write('current-generation/files/src/worker.js', source);
  write('runtime/src/worker.js', source);
  return {root, write, options: {repositoryRoot: root, runtimeRoot: path.join(root, 'runtime')}};
}

test('current checkout and isolated workflow share the production pin without a stale duplicate', () => {
  const binding = inspectCurrentRuntimeBinding();
  assert.equal(binding.generation, JSON.parse(fs.readFileSync(path.join(repo, 'REPORT2_CURRENT_GENERATION.json'))).generation);
  const workflow = fs.readFileSync(path.join(repo, '.github/workflows/early-evidence-isolated-acceptance.yml'), 'utf8');
  assert.doesNotMatch(workflow, /REPORT2_EXPECTED_WORKER_SHA:\s*"[a-f0-9]{64}"/);
  assert.doesNotMatch(workflow, /REPORT2_CURRENT_GENERATION:\s*"MY_REPORT/);
  assert.ok(workflow.indexOf('current-runtime-binding.mjs --github-env') < workflow.indexOf('node runner/preflight-role-gate.mjs'));
  assert.match(workflow, /current-runtime-binding\.mjs --runtime runtime/);
  assert.match(workflow, /REPORT2_CANDIDATE_BASE_SHA=\$\(git rev-parse origin\/main\)/);
  assert.match(workflow, /cron: "35 15 \* \* \*"/);
  assert.match(workflow, /DELIVERY_ENABLED: "0"/);
  for (const provider of ['NANSEN', 'VYX']) {
    assert.ok(workflow.includes(`${provider}_API_KEY: \${{ secrets.${provider}_API_KEY }}`));
  }
});
test('assembled runtime is checked against an independent authoritative pin', t => {
  const f = fixture(t);
  assert.equal(inspectCurrentRuntimeBinding(f.options).runtime_checked, true);
  f.write('runtime/src/worker.js', source + '// stale or modified');
  assert.throws(() => inspectCurrentRuntimeBinding(f.options), /RUNTIME_HASH_MISMATCH/);
});
test('changed source bytes cannot silently rewrite the expected runtime hash', t => {
  const f = fixture(t);
  f.write('current-generation/files/src/worker.js', source + '// modified');
  f.write('runtime/src/worker.js', source + '// modified');
  assert.throws(() => inspectCurrentRuntimeBinding(f.options), /SOURCE_HASH_MISMATCH/);
});
test('mismatched generation fails before any environment is changed', t => {
  const f = fixture(t), environmentFile = path.join(f.root, 'env');
  fs.writeFileSync(environmentFile, 'EXISTING=preserved\n');
  f.write('current-generation/GENERATION.json', JSON.stringify({generation: 'MY_REPORT_2_OLD'}));
  assert.throws(() => bindCurrentRuntimeEnvironment(f.options, environmentFile), /GENERATION_MISMATCH/);
  assert.equal(fs.readFileSync(environmentFile, 'utf8'), 'EXISTING=preserved\n');
});
test('duplicate workflow pins and authority redirects are rejected', t => {
  const f = fixture(t);
  fs.appendFileSync(path.join(f.root, '.github/workflows/report2.yml'), `      REPORT2_EXPECTED_WORKER_SHA: "${pin}"\n`);
  assert.throws(() => inspectCurrentRuntimeBinding(f.options), /AMBIGUOUS/);
  f.write('REPORT2_CURRENT_GENERATION.json', JSON.stringify({generation, latest_only: true, authoritative_workflow: '../other.yml'}));
  assert.throws(() => inspectCurrentRuntimeBinding(f.options), /AUTHORITY_MISMATCH/);
});
test('verified binding exports both runner variables for later isolated steps', t => {
  const f = fixture(t), environmentFile = path.join(f.root, 'env');
  bindCurrentRuntimeEnvironment(f.options, environmentFile);
  assert.equal(fs.readFileSync(environmentFile, 'utf8'), `REPORT2_EXPECTED_WORKER_SHA=${pin}\nREPORT2_CURRENT_GENERATION=${generation}\n`);
});
test('manual enqueue and execution must agree on the generation', t => {
  const f = fixture(t), workflow = path.join(f.root, '.github/workflows/report2.yml');
  fs.appendFileSync(workflow, `  enqueue:\n    env:\n      REPORT2_CURRENT_GENERATION: "${generation}"\n`);
  assert.equal(inspectCurrentRuntimeBinding(f.options).generation, generation);
  fs.appendFileSync(workflow, '  other:\n    env:\n      REPORT2_CURRENT_GENERATION: "MY_REPORT_2_OLD"\n');
  assert.throws(() => inspectCurrentRuntimeBinding(f.options), /AMBIGUOUS/);
});
