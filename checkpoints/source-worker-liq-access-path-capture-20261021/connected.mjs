import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';

const PREFIX = 'checkpoints/source-worker-liq-access-path-capture-20261021';
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const jsonHash = value => sha(JSON.stringify(value));
const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const NOW = 1792601400000;
const DAY = new Date(NOW).toISOString().slice(0, 10);
const WORKFLOW = 'kovalev23091987-jpg/my-report-2-cloud-runner/.github/workflows/report2.yml@refs/heads/main';

function inventory(root, relative = '') {
  return fs.readdirSync(path.join(root, relative), {withFileTypes: true}).flatMap(entry => {
    const item = path.join(relative, entry.name);
    assert.ok(!entry.isSymbolicLink(), 'FULL_RUNTIME_SYMLINK_REFUSED');
    if (entry.isDirectory()) return inventory(root, item);
    assert.ok(entry.isFile(), 'FULL_RUNTIME_NONFILE_REFUSED');
    const bytes = fs.readFileSync(path.join(root, item));
    return [{path: item.split(path.sep).join('/'), bytes: bytes.length, sha256: sha(bytes)}];
  }).sort((a, b) => a.path.localeCompare(b.path));
}

function queryByPinnedHash(privateBytes, expected) {
  const source = privateBytes.toString('utf8');
  assert.ok(Buffer.from(source).equals(privateBytes), 'PRIVATE_INPUT_UTF8_CHANGED');
  // Only inspect literals in memory. No private module invocation or SQL export.
  const literals = [...source.matchAll(/`([^`]+)`/g)].map(match => match[1].replace(/\$\{[^{}]+\}/g, '240'));
  for (const expression of [/"((?:[^"\\]|\\.)*)"/g, /'((?:[^'\\]|\\.)*)'/g]) {
    for (const match of source.matchAll(expression)) {
      literals.push(match[1].replace(/\\(["'\\])/g, '$1').replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t'));
    }
  }
  const found = [...new Set(literals.filter(value => sha(value) === expected))];
  assert.ok(found.length === 1, 'ACTUAL_PRIVATE_QUERY_HASH_NOT_UNIQUE_OR_NOT_FOUND');
  return found[0];
}

function selector(head) {
  return {schema: 'REPORT2_LIQ_ACCESS_PATH_ONCE_V1', head, workflow_ref: WORKFLOW, run_number: '8123', run_attempt: '1', not_before_ts: NOW - 1000, expires_ts: NOW + 600000};
}

function environment(head, change = {}) {
  return {REPORT2_LIQ_ACCESS_PATH_ONCE: JSON.stringify(selector(head)), REPORT2_LIQ_ACCESS_PATH_NATURAL: '1', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main', GITHUB_RUN_ATTEMPT: '1', GITHUB_RUN_ID: '99900011122', GITHUB_RUN_NUMBER: '8123', GITHUB_WORKFLOW_REF: WORKFLOW, GITHUB_SHA: head, ...change};
}

function extractedFunctions(block, budgetGuard, env, clock, memory) {
  class ControlledDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock.now])); }
    static now() { return clock.now; }
  }
  const execute = new Function('process', 'Date', 'Buffer', 'crypto', 'fs', 'evaluateWithinRunReservation', 'Response',
    block + '\nreturn {liquidationAccessPathBinding,captureRealizedAccessPath,recordLiquidationAccessPath};');
  return execute({env}, ControlledDate, Buffer, crypto, memory, budgetGuard, Response);
}

function memorySink(options = {}) {
  const saved = [], attempts = [];
  return {
    saved, attempts,
    async writeFile(name, bytes) {
      assert.equal(name, 'report2-liquidation-access-path.json');
      assert.ok(Buffer.byteLength(bytes) <= 65536, 'ARTIFACT_EXCEEDS_DECLARED_FRAGMENT_BOUND');
      const value = JSON.parse(bytes);
      attempts.push(value);
      this.onWrite?.(value);
      if (options.failWriteNumber === attempts.length) throw Error('CONTROLLED_ARTIFACT_WRITE_FAILED');
      saved.push(value);
    },
  };
}

function fixture(DatabaseSync, RemoteD1Database, queries, mode = {}, clock = {now: NOW}) {
  const sqlite = new DatabaseSync(':memory:');
  // Synthetic schema, NOT a copy or qualification of current native schema.
  sqlite.exec('CREATE TABLE liquidation_events(source TEXT,event_id TEXT,contract_code TEXT,ts INTEGER,side TEXT,price REAL,volume_contracts REAL,amount_base REAL,notional_usdt REAL)');
  sqlite.exec('CREATE TABLE scan_runs(ts INTEGER,payload_json TEXT,stage0_coverage_pct REAL,errors INTEGER,stale INTEGER)');
  sqlite.exec('CREATE INDEX idx_controlled_contract_ts ON liquidation_events(contract_code,ts DESC)');
  if (mode.rows64) {
    // Table + 63 indices = exactly 64 metadata rows, so completeness is refused.
    for (let index = 0; index < 62; index++) sqlite.exec(`CREATE INDEX idx_controlled_${index} ON liquidation_events(ts)`);
  }
  if (mode.oversizeReply) sqlite.exec('CREATE INDEX "' + 'x'.repeat(25000) + '" ON liquidation_events(ts)');
  const insert = sqlite.prepare('INSERT INTO liquidation_events VALUES(?,?,?,?,?,?,?,?,?)');
  insert.run('CONTROLLED_A', 'event1', 'ZEC-USDT', NOW - 1000, 'buy', 100, 1, 1, 100);
  insert.run('CONTROLLED_B', 'event2', 'BTW-USDT', NOW - 2000, null, null, 1, 1, null);
  const wire = [], executed = [], http = [];
  let diagnosticCalls = 0;
  const fetchImpl = async (url, request) => {
    assert.equal(String(url), 'https://controlled.invalid/d1');
    const payload = JSON.parse(request.body);
    const isBatch = payload.op === 'batch';
    wire.push({op: payload.op, SQL_sha256: isBatch ? payload.statements.map(item => sha(item.sql)) : sha(payload.sql), params: isBatch ? payload.statements.map(item => item.params) : payload.params});
    if (!isBatch) {
      diagnosticCalls++;
      if (mode.transportFailure && diagnosticCalls === 1) throw Error('CONTROLLED_NATIVE_TRANSPORT_FAILURE');
      if (mode.nativeOversize && diagnosticCalls === 1) return new Response('x'.repeat(524289), {status: 200});
    }
    const all = statement => {
      assert.ok(/^\s*(SELECT|EXPLAIN QUERY PLAN)\b/i.test(statement.sql), 'UNEXPECTED_SQL_KIND');
      const rows = sqlite.prepare(statement.sql).all(...statement.params);
      executed.push({SQL_sha256: sha(statement.sql), params: [...statement.params], rows: rows.length});
      return {success: true, results: rows};
    };
    let result = isBatch ? payload.statements.map(all) : all(payload);
    if (!isBatch && diagnosticCalls === 1 && mode.wholeReceiptBound) result.CONTROLLED_pretty_expansion = Array(7000).fill(0);
    let usage = isBatch ? {statements: payload.statements.map(() => ({measured: true, rows_read: 3, rows_written: 0}))} : {measured: true, rows_read: 2, rows_written: 0};
    if (!isBatch && diagnosticCalls === 1) {
      if (mode.unknownReply) usage = {measured: false, rows_read: 17, rows_written: 0};
      if (mode.overProjection) usage = {measured: true, rows_read: 2001, rows_written: 0};
      if (mode.writeChanged) usage = {measured: true, rows_read: 2, rows_written: 1};
      if (mode.expireBetween) clock.now = NOW + 600000;
      if (mode.dayBetween) clock.now = NOW + 86400000;
      if (mode.undefinedReply) result = undefined;
    }
    let body = JSON.stringify({ok: true, result, usage});
    if (!isBatch && diagnosticCalls === 1 && mode.nativeExactBoundary) body = body.padEnd(524288, ' ');
    return new Response(body, {status: 200, headers: {'content-type': 'application/json'}});
  };
  const db = new RemoteD1Database('https://controlled.invalid/d1', 'CONTROLLED_NO_NATIVE_CREDENTIAL', {fetchImpl});
  const httpAdmit = request => {
    http.push(structuredClone(request));
    assert.equal(request.lane, 'statistics');
    assert.equal(request.attempts, 1);
    const index = http.length - 1;
    return {allowed: !(mode.httpDenied || (mode.httpSecondDenied && index === 1)), duplicate: Boolean(mode.httpDuplicate), lane: 'statistics', CONTROLLED: true};
  };
  return {sqlite, db, wire, executed, http, httpAdmit, fetchImpl, diagnosticCalls: () => diagnosticCalls, close: () => sqlite.close(), queries};
}

const PARENT = Object.freeze({rows_read: 59000, rows_written: 920});
const DOWNSTREAM = Object.freeze({rows_read: 4500, rows_written: 150});
function parentReceipt(reservation = PARENT) {
  return {status: 'RESERVED', reservation_id: 'R2RUN:CONTROLLED:99900011122', day_utc: DAY, ...reservation};
}

async function originalInput(context, functions, binding, mode = {}) {
  const nativeOriginal = context.db.batch;
  const nativeDescriptor = Object.getOwnPropertyDescriptor(context.db, 'batch');
  let actualReturned;
  context.db.batch = async function (...args) {
    actualReturned = await Reflect.apply(nativeOriginal, this, args);
    return actualReturned;
  };
  const original = context.db.batch;
  const descriptor = Object.getOwnPropertyDescriptor(context.db, 'batch');
  const capture = functions.captureRealizedAccessPath(context.db, binding, NOW);
  let replies;
  try {
    replies = await context.db.batch([
      context.db.prepare(context.queries[0]).bind(NOW - 7200000, NOW + 1000),
      context.db.prepare(context.queries[1]).bind(NOW),
    ]);
  } finally { capture.restore(); }
  assert.equal(context.db.batch, original, 'ORIGINAL_BATCH_FUNCTION_NOT_RESTORED');
  assert.deepEqual(Object.getOwnPropertyDescriptor(context.db, 'batch'), descriptor);
  if (nativeDescriptor) Object.defineProperty(context.db, 'batch', nativeDescriptor);
  else delete context.db.batch;
  assert.equal(context.db.batch, nativeOriginal);
  assert.equal(replies, actualReturned, 'CAPTURE_CHANGED_THE_ORIGINAL_RETURNED_OBJECT');
  const captured = capture.read();
  assert.ok(captured, 'ORIGINAL_INPUT_NOT_CAPTURED_EXACTLY_ONCE');
  assert.ok(Object.isFrozen(captured.params));
  assert.equal(captured.input_result.status, 'EXISTING_INPUT_COLUMNS_CAPTURED_NO_REREAD');
  assert.equal(captured.input_result.complete_columns_exported, true);
  assert.equal(captured.input_result.new_SQL, 0);
  assert.equal(captured.input_result.limit_may_truncate, false);
  assert.equal(captured.input_result.boundary_ts, NOW - 2000);
  assert.equal(captured.input_result.boundary_ties_within_returned, 1);
  const columns = ['source', 'event_id', 'contract_code', 'ts', 'side', 'price', 'volume_contracts', 'amount_base', 'notional_usdt'];
  const projected = replies[0].results.map(row => Object.fromEntries(columns.map(key => [key, row[key]])));
  assert.equal(captured.input_result.sha256, jsonHash(projected));
  assert.equal(captured.input_result.rows[1].price, null);
  assert.equal(captured.input_result.rows[1].side, null);
  assert.equal(captured.input_result.rows[1].notional_usdt, null);
  const originalResult = {status: 'BUDGET_ENVELOPE_EXCEEDED_FAIL_CLOSED', events_loaded: replies[0].results.length, contracts_selected: 2, persisted: 8, usage_delta: {rows_read: 3395, rows_written: 24, requests: null, unknown_ops: 0}, classification: 'CONTROLLED_ORIGINAL_DTO_NOT_SIDECAR_REPLAY', input_rows_sha256: jsonHash(replies[0].results)};
  if (mode.originalOversize) originalResult.controlled_padding = 'x'.repeat(9000);
  return {captured, originalResult, originalResultHash: jsonHash(originalResult), baselineWireCount: context.wire.length};
}

async function diagnostic(context, functions, binding, input, change = {}) {
  return functions.recordLiquidationAccessPath({db: context.db, binding, captured: input.captured, reservation: PARENT, parent_receipt: parentReceipt(), day_admission: {allowed: true, CONTROLLED: true}, downstream: DOWNSTREAM, http_admit: context.httpAdmit, original_result: input.originalResult, ...change});
}

function verifyOriginal(memory, input) {
  assert.ok(memory.saved.length > 0, 'ORIGINAL_RESULT_NEVER_SAVED');
  assert.equal(memory.saved[0].status, 'ORIGINAL_RESULT_PRESERVED_BEFORE_DIAGNOSTIC');
  for (const item of memory.attempts) {
    assert.equal(jsonHash(item.original_realized_result), input.originalResultHash, 'ORIGINAL_FACTS_CHANGED');
    assert.equal(item.original_result_sha256, input.originalResultHash);
  }
  assert.equal(jsonHash(input.originalResult), input.originalResultHash);
}

async function finalizerMustBeDenied(context, finalizeRunUsage) {
  const beforeWire = context.wire.length, beforeUsage = context.db.usageSnapshot();
  let error;
  try { await finalizeRunUsage(context.db, {reservationId: 'R2RUN:CONTROLLED:99900011122', sourceRunId: 'CONTROLLED', now: NOW, usage: beforeUsage}); }
  catch (caught) { error = caught; }
  assert.equal(error?.message, 'D1_LOCAL_HTTP_ADMISSION_DENIED');
  assert.equal(context.wire.length, beforeWire, 'UNKNOWN_FENCE_ALLOWED_FINALIZER_WIRE');
  assert.deepEqual(context.db.usageSnapshot(), beforeUsage, 'LOCAL_DENIAL_CHANGED_NATIVE_COUNTERS');
  assert.equal(context.db.fetchImpl, context.fetchImpl, 'DIAGNOSTIC_FETCH_WRAPPER_NOT_RESTORED');
}

export async function runLiquidationAccessPathCaptureConnected({runtime_root, baseline_runtime_root, repo_root}) {
  const packageRoot = path.join(fs.realpathSync(repo_root), PREFIX);
  const manifest = readJSON(path.join(packageRoot, 'manifest.json'));
  for (const pin of manifest.files) {
    const bytes = fs.readFileSync(path.join(packageRoot, pin.path));
    assert.equal(bytes.length, pin.bytes, 'PUBLIC_PACKAGE_BYTES_CHANGED:' + pin.path);
    assert.equal(sha(bytes), pin.sha256, 'PUBLIC_PACKAGE_SHA_CHANGED:' + pin.path);
  }
  const binding = readJSON(path.join(packageRoot, 'bindings.json'));
  const candidateSrc = fs.realpathSync(runtime_root), baselineSrc = fs.realpathSync(baseline_runtime_root);
  assert.equal(path.basename(candidateSrc), 'src');
  assert.equal(path.basename(baselineSrc), 'src');
  const candidateRoot = path.dirname(candidateSrc), baselineRoot = path.dirname(baselineSrc);
  assert.notEqual(candidateRoot, baselineRoot);
  assert.ok(!candidateRoot.startsWith(baselineRoot + path.sep) && !baselineRoot.startsWith(candidateRoot + path.sep));
  const before = inventory(baselineRoot), after = inventory(candidateRoot);
  assert.equal(before.length, binding.full_runtime_files);
  assert.equal(after.length, binding.full_runtime_files);
  assert.deepEqual(before.map(item => item.path), after.map(item => item.path));
  let unchanged = 0;
  for (let index = 0; index < before.length; index++) {
    if (before[index].path === binding.changed_runtime_relative) continue;
    assert.deepEqual(after[index], before[index], 'NON_TARGET_RUNTIME_CHANGED:' + before[index].path);
    unchanged++;
  }
  assert.equal(unchanged, 614);
  const baselineRunner = fs.readFileSync(path.join(baselineRoot, binding.changed_runtime_relative));
  const candidateRunner = fs.readFileSync(path.join(candidateRoot, binding.changed_runtime_relative));
  assert.equal(sha(baselineRunner), binding.baseline_runner_sha256);
  // Whole candidate pin belongs to the reviewed exact central draft, not a synthetic overlay.
  assert.equal(sha(candidateRunner), binding.candidate_runner_at_read_sha256);
  assert.equal(candidateRunner.length, binding.candidate_runner_at_read_bytes);
  const runnerSource = candidateRunner.toString('utf8');
  const start = runnerSource.indexOf(binding.new_block.start), end = runnerSource.indexOf(binding.new_block.end_exclusive, start);
  assert.ok(start >= 0 && end > start && runnerSource.indexOf(binding.new_block.start, start + 1) === -1);
  const rawSlice = runnerSource.slice(start, end);
  assert.equal(sha(rawSlice), binding.new_block.contiguous_slice_sha256);
  assert.equal(Buffer.byteLength(rawSlice), binding.new_block.contiguous_slice_bytes);
  assert.ok(rawSlice.endsWith('\n\n'), 'FINAL_SEPARATOR_NOT_EXACTLY_BOUND');
  assert.equal(binding.new_block.exclude_final_separator_bytes, 1);
  // The central frozen function block excludes the one separating blank-line LF.
  const block = rawSlice.slice(0, -1);
  assert.equal(Buffer.byteLength(block), binding.new_block.bytes);
  assert.equal(sha(block), binding.new_block.sha256);
  assert.ok(!baselineRunner.toString('utf8').includes(binding.new_block.start));
  for (const pin of [...binding.unchanged_dependencies, binding.private_sidecar]) {
    for (const root of [baselineRoot, candidateRoot]) {
      const bytes = fs.readFileSync(path.join(root, pin.runtime_relative));
      assert.equal(bytes.length, pin.bytes, 'DEPENDENCY_BYTES_CHANGED:' + pin.runtime_relative);
      assert.equal(sha(bytes), pin.sha256, 'DEPENDENCY_SHA_CHANGED:' + pin.runtime_relative);
    }
  }
  const privateBytes = fs.readFileSync(path.join(candidateRoot, binding.private_sidecar.runtime_relative));
  const queries = binding.existing_input_SQL_sha256.map(hash => queryByPinnedHash(privateBytes, hash));
  // ALL package/tree/runner/block/dependency/private-SQL pins above precede application imports.
  const {DatabaseSync} = await import('node:sqlite');
  const {RemoteD1Database} = await import(pathToFileURL(path.join(candidateRoot, 'report2-d1-adapter.mjs')).href);
  const {evaluateWithinRunReservation, finalizeRunUsage} = await import(pathToFileURL(path.join(candidateRoot, 'd1-preaction-budget-guard.mjs')).href);
  const oldFetch = globalThis.fetch;
  let forbiddenNetworkAttempts = 0;
  globalThis.fetch = async () => { forbiddenNetworkAttempts++; throw Error('CONTROLLED_CASE_NATIVE_NETWORK_FORBIDDEN'); };
  const controls = [];
  const functionsFor = (env, clock, memory) => extractedFunctions(block, evaluateWithinRunReservation, env, clock, memory);
  const head = binding.candidate_git_head_for_controlled_selector;
  const resultFor = (name, variants, additional = {}) => controls.push({name, variants, classification: 'NEW_CONTROLLED_FUNCTION_CHECK_NOT_NATIVE_PLAN_COST_OR_GRANT', ...additional});
  async function run(mode, check, change = {}) {
    const clock = {now: NOW}, memory = memorySink(mode), functions = functionsFor(environment(head), clock, memory);
    const selected = functions.liquidationAccessPathBinding({source: 'schedule', trigger_only: false, started_ts: NOW});
    assert.ok(selected);
    const context = fixture(DatabaseSync, RemoteD1Database, queries, mode, clock);
    try {
      const input = await originalInput(context, functions, selected, mode);
      const actualSnapshot = context.db.usageSnapshot.bind(context.db);
      context.actualSnapshot = actualSnapshot;
      if (mode.hugeTargets) context.db.usageSnapshot = () => ({...actualSnapshot(), targets: {CONTROLLED: 'x'.repeat(70000)}});
      if (mode.unknownBefore) context.db.usageSnapshot = () => ({...actualSnapshot(), unknown_ops: 1});
      if (mode.snapshotThrows) context.db.usageSnapshot = () => {
        if (context.diagnosticCalls() > 0) throw Error('CONTROLLED_POST_REPLY_SNAPSHOT_FAILURE');
        return actualSnapshot();
      };
      if (mode.unknownReply) memory.onWrite = () => {
        if (memory.attempts.length > 1) assert.equal(context.db.beforeRequest?.({}).allowed, false, 'UNKNOWN_FENCE_NOT_SET_BEFORE_ARTIFACT_WRITE');
      };
      let error;
      try { await diagnostic(context, functions, selected, input, change); } catch (caught) { error = caught; }
      await check({context, memory, functions, selected, input, error, clock});
      if (mode.originalOversize) {
        assert.ok(memory.saved.length > 0);
        assert.equal(memory.saved[0].original_realized_result, null);
        assert.equal(memory.saved[0].original_result_omitted, true);
        assert.equal(memory.saved[0].original_result_sha256, input.originalResultHash);
        assert.equal(memory.saved[0].artifact_complete, false);
      } else verifyOriginal(memory, input);
      assert.equal(context.db.fetchImpl, context.fetchImpl, 'FETCH_WRAPPER_LEAK');
      assert.equal(forbiddenNetworkAttempts, 0);
    } finally { context.close(); }
  }
  try {
    await run({}, async ({context, memory, input, error}) => {
      assert.equal(error, undefined);
      const last = memory.saved.at(-1);
      assert.equal(last.status, 'CURRENT_NATIVE_INDEX_AND_SAME_INPUT_PLAN_RECORDED');
      assert.equal(last.native_queries.length, 2);
      assert.equal(context.diagnosticCalls(), 2);
      assert.equal(context.wire.length, 3); // One original batch, then two separate .all() RPCs.
      assert.equal(context.wire[1].op, 'all'); assert.equal(context.wire[2].op, 'all');
      assert.equal(context.wire[2].SQL_sha256, sha('EXPLAIN QUERY PLAN ' + queries[0]));
      assert.deepEqual(context.wire[2].params, input.captured.params);
      assert.equal(context.executed.filter(item => item.SQL_sha256 === binding.existing_input_SQL_sha256[0]).length, 1);
      assert.ok(last.native_queries[0].reply.results.some(row => row.type === 'table' && row.name === 'liquidation_events'));
      assert.ok(last.native_queries[1].reply.results.every(row => typeof row.detail === 'string'));
      assert.equal(last.native_current_cost_or_index_saving_proven, false);
    });
    resultFor('positive_actual_RemoteD1_LocalSQLite_original_once_two_separate_reads', 1);

    const selectorVariants = [
      {env: {REPORT2_LIQ_ACCESS_PATH_ONCE: undefined}}, {env: {REPORT2_LIQ_ACCESS_PATH_ONCE: '{'}},
      {env: {REPORT2_LIQ_ACCESS_PATH_NATURAL: '0'}}, {env: {GITHUB_EVENT_NAME: 'push'}},
      {env: {GITHUB_REF: 'refs/heads/other'}}, {env: {GITHUB_RUN_ATTEMPT: '2'}},
      {env: {GITHUB_RUN_NUMBER: '8124'}}, {env: {GITHUB_SHA: 'b'.repeat(40)}},
      {env: {REPORT2_MANUAL_COMMAND: 'REPORT'}}, {env: {REPORT2_TRIGGER_ONLY_RUN: '1'}},
      {env: {REPORT2_TRIGGER_KICK_TASK_ID: 'TASK'}}, {source: 'manual'}, {trigger_only: true},
      {selector: {...selector(head), extra: true}}, {selector: {...selector(head), expires_ts: NOW}},
      {selector: {...selector(head), expires_ts: NOW + 86400000}}, {started_ts: NOW - 1001},
    ];
    for (const variant of selectorVariants) {
      const env = environment(head, variant.env);
      if (variant.selector) env.REPORT2_LIQ_ACCESS_PATH_ONCE = JSON.stringify(variant.selector);
      const memory = memorySink(), functions = functionsFor(env, {now: NOW}, memory);
      assert.equal(functions.liquidationAccessPathBinding({source: variant.source ?? 'schedule', trigger_only: variant.trigger_only ?? false, started_ts: variant.started_ts ?? NOW}), null);
      assert.equal(memory.saved.length, 0);
    }
    resultFor('selector_absent_wrong_manual_attempt_head_window_no_SQL', selectorVariants.length, {additional_SQL: 0});

    const deniedParents = [
      {parent_receipt: null}, {parent_receipt: {...parentReceipt(), status: 'FINALIZED'}},
      {parent_receipt: {...parentReceipt(), reservation_id: 'OTHER'}},
      {parent_receipt: {...parentReceipt(), rows_read: 59001}},
      {parent_receipt: {...parentReceipt(), day_utc: '2026-10-20'}},
      {day_admission: {allowed: false}}, {reservation: {rows_read: 4000, rows_written: 920}, parent_receipt: parentReceipt({rows_read: 4000, rows_written: 920})},
    ];
    for (const changed of deniedParents) await run({}, async ({context, error}) => { assert.equal(error, undefined); assert.equal(context.diagnosticCalls(), 0); assert.equal(context.http.length, 0); }, changed);
    resultFor('actual_parent_receipt_day_and_live_postCritical_room_required', deniedParents.length);

    for (const mode of [{httpDenied: true}, {httpDuplicate: true}, {httpSecondDenied: true}]) await run(mode, async ({context, memory, error}) => {
      assert.equal(error, undefined); assert.equal(context.diagnosticCalls(), mode.httpSecondDenied ? 1 : 0);
      assert.equal(memory.saved.at(-1).status, 'DIAGNOSTIC_HTTP_NOT_ADMITTED');
    });
    resultFor('statistics_HTTP_denial_duplicate_and_second_IO_recheck', 3);

    await run({unknownReply: true}, async ({context, memory, error}) => {
      assert.equal(error?.message, 'LIQ_ACCESS_PATH_UNKNOWN_STOP_ALL_NATIVE_SQL');
      assert.equal(context.diagnosticCalls(), 1);
      const last = memory.saved.at(-1); assert.equal(last.status, 'NATIVE_USAGE_NOT_CLOSED');
      assert.equal(last.native_queries[0].reply_received, true); assert.ok(last.native_queries[0].reply);
      assert.equal(last.native_queries[0].usage_after.unknown_ops, 1);
      assert.equal(last.native_queries[0].usage_after.rows_read, 23); // 6 original + CONTROLLED known17, not reset.
      await finalizerMustBeDenied(context, finalizeRunUsage);
    });
    resultFor('unknown_reply_keeps_known_cost_and_reply_fences_sameDB_finalizer', 1);

    // Additional variants belong to that same group, not extra TAP/group claims.
    for (const mode of [{unknownBefore: true}, {snapshotThrows: true}]) await run(mode, async ({context, memory, error}) => {
      assert.equal(error?.message, 'LIQ_ACCESS_PATH_UNKNOWN_STOP_ALL_NATIVE_SQL');
      assert.equal(context.diagnosticCalls(), mode.snapshotThrows ? 1 : 0);
      const last = memory.saved.at(-1);
      assert.equal(last.status, mode.snapshotThrows ? 'NATIVE_USAGE_NOT_CLOSED' : 'CURRENT_NATIVE_USAGE_NOT_CLOSED_BEFORE_DIAGNOSTIC');
      if (mode.snapshotThrows) {
        assert.equal(last.native_queries[0].reply_received, true);
        assert.equal(last.native_queries[0].usage_snapshot_error, 'CURRENT_NATIVE_USAGE_SNAPSHOT_FAILED');
        assert.equal(last.native_queries[0].usage_after, null);
        // Restore only the CONTROLLED observation harness, never the deny-all fence.
        context.db.usageSnapshot = context.actualSnapshot;
        const actual = context.db.usageSnapshot();
        assert.equal(actual.rows_read, 8); // 6 original + the already settled measured2 read.
        assert.equal(actual.rows_written, 0);
        assert.equal(actual.requests, 3);
        assert.equal(actual.unknown_ops, 0, 'SNAPSHOT_FAILURE_MUST_NOT_FABRICATE_NATIVE_COUNTERS');
        await finalizerMustBeDenied(context, finalizeRunUsage);
      }
      let wireReached = false;
      try { await context.db.prepare('SELECT 1').all(); wireReached = true; }
      catch (denied) { assert.equal(denied.message, 'D1_LOCAL_HTTP_ADMISSION_DENIED'); }
      assert.equal(wireReached, false);
    });
    controls.at(-1).variants = 3;

    const unsafeModes = [{transportFailure: true}, {nativeOversize: true}, {unknownReply: true, undefinedReply: true, failWriteNumber: 2}];
    for (const mode of unsafeModes) await run(mode, async ({context, memory, error}) => {
      assert.ok(error); assert.equal(context.diagnosticCalls(), 1);
      assert.equal(context.db.usageSnapshot().unknown_ops, 1);
      if (mode.failWriteNumber) {
        assert.equal(error.message, 'CONTROLLED_ARTIFACT_WRITE_FAILED');
        assert.equal(memory.saved.length, 1, 'INITIAL_ORIGINAL_RESULT_NOT_PRESERVED');
        assert.equal(memory.attempts.at(-1).native_queries[0].reply_received, true);
        assert.equal(memory.attempts.at(-1).native_queries[0].reply_serialization_failed, true, 'UNDEFINED_REPLY_DID_NOT_EXERCISE_SERIALIZER_FAILURE');
      } else assert.equal(memory.saved.at(-1).status, 'NATIVE_USAGE_NOT_CLOSED');
      await finalizerMustBeDenied(context, finalizeRunUsage);
    });
    resultFor('transport_native524288_body_bound_and_late_artifact_error_keep_fence', unsafeModes.length, {late_failed_write_is_not_durable_reply_proof: true});
    await run({nativeExactBoundary: true}, async ({context, memory, error}) => {
      assert.equal(error, undefined);
      assert.equal(context.diagnosticCalls(), 2);
      assert.equal(memory.saved.at(-1).status, 'CURRENT_NATIVE_INDEX_AND_SAME_INPUT_PLAN_RECORDED');
    });
    controls.at(-1).variants++;

    for (const mode of [{rows64: true}, {oversizeReply: true}]) await run(mode, async ({context, memory, error}) => {
      assert.equal(error, undefined); assert.equal(context.diagnosticCalls(), 1);
      const last = memory.saved.at(-1); assert.equal(last.status, 'NATIVE_RESULT_INCOMPLETE_NO_NEXT_DIAGNOSTIC');
      if (mode.rows64) assert.equal(last.native_queries[0].reply.results.length, 64);
      else { assert.equal(last.native_queries[0].reply, undefined); assert.equal(last.native_queries[0].reply_omitted_reason, 'REPLY_OVER24576B_NO_PARTIAL_RECONSTRUCTION'); }
    });
    resultFor('metadata_LIMIT64_or_whole_reply_oversize_incomplete_no_EXPLAIN', 2);
    await run({originalOversize: true}, async ({context, memory, error}) => {
      assert.equal(error, undefined);
      assert.equal(context.diagnosticCalls(), 0);
      assert.equal(context.http.length, 0);
      assert.equal(memory.saved.at(-1).artifact_complete, false);
    });
    await run({hugeTargets: true}, async ({context, memory, error}) => {
      assert.equal(error, undefined);
      assert.equal(context.diagnosticCalls(), 2);
      const last = memory.saved.at(-1);
      assert.deepEqual(Object.keys(last.usage_before).sort(), ['rows_read', 'rows_written', 'requests', 'unknown_ops'].sort());
      assert.equal(last.usage_before.targets, undefined);
      assert.ok(Buffer.byteLength(JSON.stringify(last, null, 2)) < 65536);
    });
    await run({wholeReceiptBound: true}, async ({context, memory, error}) => {
      assert.equal(error, undefined);
      assert.equal(context.diagnosticCalls(), 1);
      const last = memory.saved.at(-1);
      assert.equal(last.artifact_complete, false);
      assert.equal(last.native_queries[0].reply, undefined);
      assert.equal(last.native_queries[0].reply_omitted_reason, 'WHOLE65536B_RECEIPT_BUDGET_NO_PARTIAL_REPLY');
      assert.ok(last.native_queries[0].reply_bytes <= 24576);
      assert.ok(last.native_queries[0].reply_sha256);
    });
    controls.at(-1).variants += 3;

    for (const mode of [{expireBetween: true}, {dayBetween: true}]) await run(mode, async ({context, memory, error}) => {
      assert.equal(error, undefined); assert.equal(context.diagnosticCalls(), 1);
      assert.equal(memory.saved.at(-1).status, 'DIAGNOSTIC_NOT_ADMITTED_OR_WINDOW_CLOSED');
    });
    resultFor('expiry_or_UTC_day_changed_between_reads_prevents_second_IO', 2);

    await run({}, async ({context, memory, functions, selected, input, error}) => {
      assert.equal(error, undefined); const count = context.wire.length, writes = memory.saved.length;
      await diagnostic(context, functions, selected, input);
      assert.equal(context.wire.length, count); assert.equal(memory.saved.length, writes);
    });
    {
      const memory = memorySink(), functions = functionsFor(environment(head), {now: NOW}, memory);
      const selected = functions.liquidationAccessPathBinding({source: 'schedule', trigger_only: false, started_ts: NOW});
      let forwarded = 0; const db = {async batch() { forwarded++; return []; }};
      const original = db.batch, capture = functions.captureRealizedAccessPath(db, selected, NOW);
      const statements = [{db, sql: queries[0], params: [NOW - 7200000, NOW + 1000]}, {}];
      try { await db.batch(statements); await db.batch(statements); } finally { capture.restore(); }
      assert.equal(capture.read(), null); assert.equal(forwarded, 2); assert.equal(db.batch, original);
      await functions.recordLiquidationAccessPath({db, binding: selected, captured: capture.read(), original_result: {status: 'CONTROLLED'}});
      assert.equal(memory.saved.length, 0);
    }
    resultFor('attempted_binding_not_replayed_and_duplicate_capture_refused', 2, {global_once_proven: false});

    for (const ownBatch of [false, true]) {
      const memory = memorySink(), functions = functionsFor(environment(head), {now: NOW}, memory);
      const selected = functions.liquidationAccessPathBinding({source: 'schedule', trigger_only: false, started_ts: NOW});
      const prototype = {async batch() { throw Error('CONTROLLED_ORIGINAL_BATCH_FAILURE'); }};
      const db = Object.create(prototype);
      if (ownBatch) Object.defineProperty(db, 'batch', {value: prototype.batch, configurable: true, enumerable: false, writable: true});
      const descriptor = Object.getOwnPropertyDescriptor(db, 'batch'), original = db.batch;
      const capture = functions.captureRealizedAccessPath(db, selected, NOW);
      let error;
      try { await db.batch([{db, sql: queries[0], params: [NOW - 7200000, NOW + 1000]}, {}]); }
      catch (caught) { error = caught; } finally { capture.restore(); }
      assert.equal(error?.message, 'CONTROLLED_ORIGINAL_BATCH_FAILURE');
      assert.equal(db.batch, original); assert.deepEqual(Object.getOwnPropertyDescriptor(db, 'batch'), descriptor);
    }
    resultFor('original_batch_throw_restores_prototype_or_exact_own_descriptor', 2);

    for (const mode of [{overProjection: true}, {writeChanged: true}]) await run(mode, async ({context, memory, error}) => {
      assert.equal(error, undefined); assert.equal(context.diagnosticCalls(), 1);
      assert.equal(context.db.usageSnapshot().unknown_ops, 0);
      assert.equal(memory.saved.at(-1).status, mode.writeChanged ? 'CURRENT_USAGE_WRITES_CHANGED_NO_NEXT_DIAGNOSTIC' : 'DIAGNOSTIC_PROJECTION_EXCEEDED_NO_NEXT_DIAGNOSTIC');
    });
    resultFor('measured_over_projection_and_changed_writes_stop_without_counter_reset', 2);

    const captureVariants = ['SQL', 'params', 'foreignDB', 'batchLength'];
    for (const variant of captureVariants) {
      const memory = memorySink(), functions = functionsFor(environment(head), {now: NOW}, memory);
      const selected = functions.liquidationAccessPathBinding({source: 'schedule', trigger_only: false, started_ts: NOW});
      const db = {async batch() { return []; }};
      const capture = functions.captureRealizedAccessPath(db, selected, NOW);
      const first = {db, sql: queries[0], params: [NOW - 7200000, NOW + 1000]};
      if (variant === 'SQL') first.sql += ' ';
      if (variant === 'params') first.params[1]++;
      if (variant === 'foreignDB') first.db = {};
      try { await db.batch(variant === 'batchLength' ? [first] : [first, {}]); } finally { capture.restore(); }
      assert.equal(capture.read(), null);
    }
    const rawRow = {source: 'CONTROLLED', event_id: 'id', contract_code: 'ZEC-USDT', ts: NOW, side: null, price: null, volume_contracts: null, amount_base: null, notional_usdt: null};
    const copyVariants = [
      {rows: Array.from({length: 241}, () => ({...rawRow})), status: 'ORIGINAL_RESULT_SHAPE_NOT_CLOSED'},
      {rows: [{...rawRow, source: 'x'.repeat(513)}], status: 'ORIGINAL_VALUE_NOT_BOUNDED_SCALAR'},
      {rows: [{...rawRow, event_id: undefined}], status: 'ORIGINAL_VALUE_NOT_BOUNDED_SCALAR'},
      {rows: Array.from({length: 240}, () => ({...rawRow})), status: 'ORIGINAL_INPUT_OVER16384B_OMITTED_WHOLE'},
    ];
    for (const variant of copyVariants) {
      const memory = memorySink(), functions = functionsFor(environment(head), {now: NOW}, memory);
      const selected = functions.liquidationAccessPathBinding({source: 'schedule', trigger_only: false, started_ts: NOW});
      const original = [{results: variant.rows}, {results: []}];
      const originalHash = jsonHash(original);
      let calls = 0;
      const db = {async batch() { calls++; return original; }};
      const capture = functions.captureRealizedAccessPath(db, selected, NOW);
      let returned;
      try { returned = await db.batch([{db, sql: queries[0], params: [NOW - 7200000, NOW + 1000]}, {}]); }
      finally { capture.restore(); }
      assert.equal(calls, 1);
      assert.equal(returned, original);
      assert.equal(jsonHash(original), originalHash);
      const info = capture.read().input_result;
      assert.equal(info.status, variant.status);
      assert.equal(info.complete_columns_exported, false);
      assert.equal(info.rows, undefined, 'PARTIAL_ORIGINAL_ROWS_FABRICATED');
      assert.equal(info.new_SQL, 0);
      if (variant.rows.length === 240) assert.equal(info.limit_may_truncate, true);
    }
    resultFor('only_exact_original_SQL_params_sameDB_and_two_statement_batch_captured', captureVariants.length + copyVariants.length);

    assert.equal(controls.length, 12);
    assert.equal(forbiddenNetworkAttempts, 0);
    return {schema: 'LIQ_ACCESS_PATH_CAPTURE_CONNECTED_V1', status: 'NEW_CONTROLLED_ACCESS_PATH_COMPONENT_COMPLETED', control_count: controls.length, controls, full_baseline_files: before.length, full_candidate_files: after.length, non_target_files_equal: unchanged, baseline_inventory_sha256: jsonHash(before), candidate_inventory_sha256: jsonHash(after), baseline_runner_sha256: sha(baselineRunner), candidate_runner_sha256: sha(candidateRunner), new_function_block_sha256: sha(block), package_manifest_sha256: sha(fs.readFileSync(path.join(packageRoot, 'manifest.json'))), original_input_SQL_sha256: binding.existing_input_SQL_sha256, actual_RemoteD1_into_LocalSQLite: true, actual_private_sidecar_imported_or_invoked: false, actual_parent_runner_imported: false, original_input_SQL_or_private_DDL_exported: false, controlled_DDL_counters_selectors_parent_receipts: true, completed_old_components_replayed: 0, source_HTTP: 0, native_SQL: 0, MAIN: 0, manual: 0, Telegram: 0, current_native_index_or_plan_captured: false, native_cost_saving_admission_or_SENT_qualified: false, author_semantic_calls: 0, fixture_cleanup_removed: true};
  } catch (error) {
    error.completed_new_CONTROLLED_groups = controls.length;
    error.completed_new_CONTROLLED_controls = controls;
    throw error;
  } finally { globalThis.fetch = oldFetch; }
}
