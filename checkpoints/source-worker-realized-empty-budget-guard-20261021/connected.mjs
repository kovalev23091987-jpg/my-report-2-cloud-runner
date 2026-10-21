import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const PREFIX = 'checkpoints/source-worker-realized-empty-budget-guard-20261021';
const digest = value => createHash('sha256').update(value).digest('hex');
const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const compact = value => value.replace(/\s/g, '');

function inventory(root, relative = '') {
  return fs.readdirSync(path.join(root, relative), {withFileTypes: true}).flatMap(entry => {
    const current = path.join(relative, entry.name);
    assert.ok(!entry.isSymbolicLink(), 'SYMLINK_NOT_IN_FULL_RUNTIME_INPUT');
    if (entry.isDirectory()) return inventory(root, current);
    assert.ok(entry.isFile(), 'NON_FILE_RUNTIME_INPUT');
    const bytes = fs.readFileSync(path.join(root, current));
    return [{path: current.split(path.sep).join('/'), bytes: bytes.length, sha256: digest(bytes)}];
  }).sort((a, b) => a.path.localeCompare(b.path));
}

function expectedCandidate(before, addition, binding) {
  assert.equal(before.length, binding.target.before_bytes);
  assert.equal(digest(before), binding.target.before_sha256);
  const source = before.toString('utf8');
  assert.ok(Buffer.from(source, 'utf8').equals(before), 'PRIVATE_SOURCE_UTF8_NOT_LOSSLESS');
  assert.ok(!/\bemptyUsage\b/.test(source), 'NEW_LOCAL_NAME_ALREADY_PRESENT');
  const lines = source.split('\n');
  const locate = hash => lines.flatMap((line, index) => digest(Buffer.from(line)) === hash ? [index] : []);
  const empty = locate(binding.anchors.empty_return_line_sha256);
  const final = locate(binding.anchors.existing_budget_guard_line_sha256);
  assert.equal(empty.length, 1, 'EMPTY_ANCHOR_NOT_UNIQUE');
  assert.equal(final.length, 1, 'EXISTING_GUARD_ANCHOR_NOT_UNIQUE');
  assert.ok(empty[0] < final[0]);
  const oldPredicate = lines[final[0]].match(/if\((.+)\)return /)?.[1];
  assert.ok(oldPredicate, 'EXISTING_GUARD_GRAMMAR_CHANGED');
  const start = addition.indexOf('if (');
  const end = addition.indexOf(') {', start);
  assert.ok(start >= 0 && end > start, 'ADDITION_PREDICATE_GRAMMAR_CHANGED');
  const newPredicate = compact(addition.slice(start + 4, end));
  assert.ok(newPredicate === compact(oldPredicate).replace(/\bdelta\b/g, 'emptyUsage'), 'THREE_EXISTING_PREDICATES_CHANGED');
  const oldLine = lines[empty[0]];
  assert.equal(oldLine.split(';return ').length, 2, 'EMPTY_RETURN_GRAMMAR_CHANGED');
  assert.equal(oldLine.split('usageDelta(before,after)').length, 2, 'EMPTY_DELTA_EXPRESSION_CHANGED');
  const cut = oldLine.indexOf(';return ') + 1;
  const suffix = oldLine.slice(cut).replace('usageDelta(before,after)', 'emptyUsage');
  lines[empty[0]] = oldLine.slice(0, cut) + '\n' + addition.trimEnd() + '\n' + suffix;
  assert.equal(digest(Buffer.from(lines[empty[0]])), binding.anchors.after_empty_block_sha256);
  return Buffer.from(lines.join('\n'), 'utf8');
}

const ZERO = Object.freeze({rows_read: 0, rows_written: 0, requests: 0, unknown_ops: 0});
const profiles = [
  {name: 'empty_read3330', after: {rows_read: 3330, rows_written: 0, requests: 2, unknown_ops: 0}, delta: {rows_read: 3330, rows_written: 0, requests: 2, unknown_ops: 0}, refused: true},
  {name: 'empty_write65', after: {rows_read: 0, rows_written: 65, requests: 2, unknown_ops: 0}, delta: {rows_read: 0, rows_written: 65, requests: 2, unknown_ops: 0}, refused: true},
  {name: 'empty_unknown1_known_costs_retained', after: {rows_read: 17, rows_written: 3, requests: 2, unknown_ops: 1}, delta: {rows_read: 17, rows_written: 3, requests: 2, unknown_ops: 1}, refused: true},
  {name: 'empty_mixed_refusal', after: {rows_read: 3330, rows_written: 65, requests: 2, unknown_ops: 2}, delta: {rows_read: 3330, rows_written: 65, requests: 2, unknown_ops: 2}, refused: true},
  {name: 'empty_exact_read_and_write_endpoints', after: {rows_read: 3200, rows_written: 64, requests: 2, unknown_ops: 0}, delta: {rows_read: 3200, rows_written: 64, requests: 2, unknown_ops: 0}, refused: false},
  {name: 'empty_below_endpoints', after: {rows_read: 3199, rows_written: 63, requests: 2, unknown_ops: 0}, delta: {rows_read: 3199, rows_written: 63, requests: 2, unknown_ops: 0}, refused: false},
  {name: 'empty_genuine_zero_reported_cost', after: {rows_read: 0, rows_written: 0, requests: 2, unknown_ops: 0}, delta: {rows_read: 0, rows_written: 0, requests: 2, unknown_ops: 0}, refused: false},
  {name: 'existing_delta_semantics_not_cumulative_parent_admission', before: {rows_read: 10000, rows_written: 1000, requests: 50, unknown_ops: 0}, after: {rows_read: 13200, rows_written: 1064, requests: 52, unknown_ops: 0}, delta: {rows_read: 3200, rows_written: 64, requests: 2, unknown_ops: 0}, refused: false},
  {name: 'legacy_NULL_snapshot_preserved', mode: 'null', delta: null, refused: false},
  {name: 'legacy_missing_snapshot_preserved', mode: 'missing', delta: null, refused: false},
];

function fixture(DatabaseSync, profile) {
  const sql = new DatabaseSync(':memory:');
  // Synthetic empty tables for the actual two input SELECTs; no old private DDL.
  sql.exec('CREATE TABLE liquidation_events(source TEXT,event_id TEXT,contract_code TEXT,ts INTEGER,side TEXT,price REAL,volume_contracts REAL,amount_base REAL,notional_usdt REAL)');
  sql.exec('CREATE TABLE scan_runs(ts INTEGER,payload_json TEXT,stage0_coverage_pct REAL,errors INTEGER,stale INTEGER)');
  const trace = [];
  let batchCalls = 0;
  let snapshots = 0;
  const db = {
    prepare(statement) {
      assert.ok(/^\s*SELECT\b/i.test(statement), 'EMPTY_PATH_ATTEMPTED_A_NONSELECT');
      return {statement, bind: (...parameters) => ({statement, parameters})};
    },
    async batch(statements) {
      assert.equal(++batchCalls, 1, 'NEW_INPUT_BATCH_ADDED');
      assert.equal(statements.length, 2, 'EXISTING_INPUT_SQL_COUNT_CHANGED');
      return statements.map(({statement, parameters}) => {
        const found = sql.prepare(statement).all(...parameters);
        assert.equal(found.length, 0, 'FIXTURE_IS_NOT_EMPTY');
        trace.push({SQL_sha256: digest(statement), parameters: [...parameters]});
        return {results: found};
      });
    },
    usageSnapshot() {
      snapshots++;
      if (profile.mode === 'null') return null;
      return structuredClone(batchCalls ? profile.after : (profile.before || ZERO));
    },
  };
  if (profile.mode === 'missing') delete db.usageSnapshot;
  return {db, trace, close: () => sql.close(), counts: () => ({batch_calls: batchCalls, snapshots})};
}

export async function runRealizedEmptyBudgetGuardConnected({runtime_root, baseline_runtime_root, repo_root}) {
  const repo = fs.realpathSync(repo_root);
  const packageRoot = path.join(repo, PREFIX);
  const manifest = readJSON(path.join(packageRoot, 'manifest.json'));
  for (const item of manifest.files) {
    const bytes = fs.readFileSync(path.join(packageRoot, item.path));
    assert.equal(bytes.length, item.bytes, 'PUBLIC_PACKAGE_BYTES_CHANGED:' + item.path);
    assert.equal(digest(bytes), item.sha256, 'PUBLIC_PACKAGE_SHA_CHANGED:' + item.path);
  }
  const binding = readJSON(path.join(packageRoot, 'target-bindings.json'));
  const addition = fs.readFileSync(path.join(packageRoot, 'empty-budget-addition.js.txt'), 'utf8');
  const candidateSrc = fs.realpathSync(runtime_root);
  const baselineSrc = fs.realpathSync(baseline_runtime_root);
  assert.equal(path.basename(candidateSrc), 'src');
  assert.equal(path.basename(baselineSrc), 'src');
  const candidateRoot = path.dirname(candidateSrc);
  const baselineRoot = path.dirname(baselineSrc);
  assert.notEqual(candidateRoot, baselineRoot, 'FULL_BASELINE_MUST_BE_DISTINCT');
  assert.ok(!candidateRoot.startsWith(baselineRoot + path.sep) && !baselineRoot.startsWith(candidateRoot + path.sep), 'FULL_INPUT_TREES_NESTED');
  const oldInventory = inventory(baselineRoot);
  const newInventory = inventory(candidateRoot);
  assert.equal(oldInventory.length, binding.full_runtime_file_count);
  assert.equal(newInventory.length, binding.full_runtime_file_count);
  assert.deepEqual(oldInventory.map(x => x.path), newInventory.map(x => x.path));
  const target = binding.target.runtime_relative;
  let unchanged = 0;
  for (let index = 0; index < oldInventory.length; index++) {
    if (oldInventory[index].path === target) continue;
    assert.deepEqual(newInventory[index], oldInventory[index], 'NON_TARGET_RUNTIME_CHANGED:' + oldInventory[index].path);
    unchanged++;
  }
  assert.equal(unchanged, binding.full_runtime_file_count - 1);
  for (const pin of binding.unchanged_accepted_dependencies) {
    for (const root of [baselineRoot, candidateRoot]) {
      assert.equal(digest(fs.readFileSync(path.join(root, pin.runtime_relative))), pin.sha256, 'ACCEPTED_DEPENDENCY_PIN_CHANGED:' + pin.runtime_relative);
    }
  }
  const before = fs.readFileSync(path.join(baselineRoot, target));
  const after = fs.readFileSync(path.join(candidateRoot, target));
  const expected = expectedCandidate(before, addition, binding);
  assert.equal(expected.length, binding.target.expected_after_bytes);
  assert.ok(after.equals(expected), 'ACTUAL_PRIVATE_CANDIDATE_IS_NOT_THE_EXACT_BOUNDED_EDIT');
  const bytesBinding = {before_bytes: before.length, before_sha256: digest(before), after_bytes: after.length, after_sha256: digest(after)};
  // All complete-tree, package, parent-runner and private-target pins precede imports.
  const {DatabaseSync} = await import('node:sqlite');
  const originalFetch = globalThis.fetch;
  let networkAttempts = 0;
  globalThis.fetch = async () => { networkAttempts++; throw Error('THIS_CONTROLLED_CASE_HAS_NO_NETWORK_PERMISSION'); };
  const controls = [];
  try {
    const oldModule = await import(pathToFileURL(path.join(baselineRoot, target)).href);
    const newModule = await import(pathToFileURL(path.join(candidateRoot, target)).href);
    assert.equal(digest(JSON.stringify(newModule.V3_REALIZED_LIQUIDATION_SIDECAR_BUDGET)), digest(JSON.stringify(oldModule.V3_REALIZED_LIQUIDATION_SIDECAR_BUDGET)), 'EXISTING_BUDGET_EXPORT_CHANGED');
    assert.equal(oldModule.V3_REALIZED_LIQUIDATION_SIDECAR_BUDGET.rows_read, 3200);
    assert.equal(oldModule.V3_REALIZED_LIQUIDATION_SIDECAR_BUDGET.rows_written, 64);
    const now = 1792587329606;
    const args = {current_scan_ts: now, source_run_id: 'CONTROLLED_EMPTY_REALIZED_BUDGET', now_ts: now};
    for (const profile of profiles) {
      const oldFixture = fixture(DatabaseSync, profile);
      let newFixture;
      try {
        newFixture = fixture(DatabaseSync, profile);
        const previous = await oldModule.runV3RealizedLiquidationSidecar(oldFixture.db, {...args});
        const current = await newModule.runV3RealizedLiquidationSidecar(newFixture.db, {...args});
        assert.equal(previous.status, 'CLOSED_NO_REALIZED_EVENTS');
        assert.deepEqual(previous.usage_delta, profile.delta);
        assert.deepEqual(current, {...previous, status: profile.refused ? 'BUDGET_ENVELOPE_EXCEEDED_FAIL_CLOSED' : previous.status});
        assert.deepEqual(current.usage_delta, profile.delta, 'KNOWN_COSTS_OR_NULL_CHANGED');
        assert.equal(current.events_loaded, 0);
        assert.equal(current.contracts_selected, 0);
        assert.equal(current.persisted, 0);
        assert.equal(current.status.startsWith('CLOSED'), !profile.refused);
        assert.deepEqual(newFixture.trace, oldFixture.trace, 'INPUT_SQL_OR_BINDINGS_CHANGED');
        assert.equal(oldFixture.trace.length, 2);
        assert.equal(newFixture.trace.length, 2);
        assert.deepEqual(newFixture.counts(), oldFixture.counts());
        assert.equal(networkAttempts, 0);
        controls.push({name: profile.name, classification: 'NEW_CONTROLLED_EMPTY_PATH_ONLY_NOT_NATIVE_COST_OR_ADMISSION', old_status: previous.status, new_status: current.status, usage_delta: current.usage_delta, input_SQL_templates: newFixture.trace, controlled_counters: true, real_empty_LocalSQLite: true, parent_runner_imported: false, publication_or_delivery: false});
      } finally {
        oldFixture.close();
        newFixture?.close();
      }
    }
    return {schema: 'REALIZED_EMPTY_BUDGET_GUARD_CONNECTED_V1', status: 'NEW_CONTROLLED_EMPTY_GUARD_COMPONENT_COMPLETED', control_count: controls.length, controls, target_binding: bytesBinding, full_baseline_files: oldInventory.length, full_candidate_files: newInventory.length, non_target_files_equal: unchanged, baseline_inventory_sha256: digest(JSON.stringify(oldInventory)), candidate_inventory_sha256: digest(JSON.stringify(newInventory)), package_manifest_sha256: digest(fs.readFileSync(path.join(packageRoot, 'manifest.json'))), actual_private_sidecar_imported_centrally: true, real_LocalSQLite_executed: true, controlled_SQL_accounting_not_native_cost: true, original_SQL_and_bindings_preserved: true, NULL_snapshot_compatibility_preserved: true, original_clocks_replaced: false, native_current3330_cost_reduction_qualified: false, native_empty_incident_proven: false, additional_production_SQL: 0, provider_HTTP: 0, native_SQL: 0, MAIN: 0, Telegram: 0, old_components_replayed: 0, native_admission_or_SENDING_qualified: false, author_semantic_calls: 0, fixture_cleanup_removed: true};
  } catch (error) {
    error.completed_new_CONTROLLED_groups = controls.length;
    error.completed_new_CONTROLLED_controls = controls;
    throw error;
  } finally {
    globalThis.fetch = originalFetch;
  }
}
