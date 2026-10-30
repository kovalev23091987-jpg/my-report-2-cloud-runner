// F618: ONE connected ARTIFICIAL consumer qualification, only after exact ROOT admission.
// Reuses the accepted BV writer/reader seam; does not execute SOURCE12/BV/BS or getCatalog/engine.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const out = path.join(repo, 'pump-report/handoffs/sources');
const manifestPath = 'pump-report/handoffs/sources/F618_FROZEN_INPUTS_V1.json';
const authorityPath = 'pump-report/handoffs/sources/F618_EXECUTION_AUTHORITY.json';
const admissionPath = 'checkpoints/pump-report-20261025/ROOT_F618_ONE_NODE_ADMISSION.json';
const resultPath = path.join(out, 'F618_CONNECTED_RESULT_V1.json');
const lockPath = path.join(out, 'F618_NODE_ONCE.lock');
const sha = b => createHash('sha256').update(b).digest('hex');
const readBytes = p => fs.readFileSync(path.resolve(repo, p));
const read = p => JSON.parse(readBytes(p).toString('utf8'));
const clone = structuredClone;
let stage = 'EXACT_ADMISSION_PREFLIGHT';
let ownsResult = false;
const report = {schema: 'F618_ONE_CONNECTED_CONSUMER_RESULT_V1', status: 'STARTED',
  Node_invocations: 1, logical_cases: 1, evidence_class: 'ARTIFICIAL_PREPARATION_ONLY',
  actual_current_catalog: false, current_global_crypto_N: null, current_global_N_proven: false,
  native_acceptance: false, source_HTTP: 0, native_SQL: 0, engine: 0, Telegram: 0,
  build: 0, deploy: 0, registry_activation: 0, SOURCE12_BV_BS_719_repeated: false,
  simulated_broker_calls: 0, writer_calls: 0, reader_calls: 0, consumer_calls: 0};
const save = () => {
  fs.writeFileSync(resultPath, JSON.stringify(report, null, 2) + '\n', {mode: 0o600, flag: ownsResult ? 'w' : 'wx'});
  ownsResult = true;
};
const safeReason = e => /^[A-Z0-9_:.-]{1,160}$/.test(e?.code ?? '') ? e.code
  : /^[A-Z0-9_:.-]{1,160}$/.test(e?.message?.split('\n')[0] ?? '') ? e.message.split('\n')[0] : 'ASSERT_OR_PRIVATE_ERROR';

try {
  assert.equal(process.argv.length, 3, 'F618_ONE_ADMISSION_ARGUMENT_REQUIRED');
  assert.equal(path.resolve(process.argv[2]), path.resolve(repo, admissionPath), 'F618_EXACT_ADMISSION_PATH_REQUIRED');
  const admission = read(admissionPath), authority = read(authorityPath);
  assert.equal(admission.status, 'ROOT_F618_ONE_CONNECTED_CONSUMER_CASE_AUTHORIZED');
  assert.equal(admission.Node_invocations, 1);
  assert.equal(admission.logical_cases, 1);
  assert.equal(admission.max_writer_calls, 1);
  assert.equal(admission.max_reader_calls, 1);
  assert.equal(admission.max_consumer_calls, 1);
  assert.equal(admission.source_HTTP, 0); assert.equal(admission.native_SQL, 0);
  assert.equal(admission.engine, 0); assert.equal(admission.Telegram, 0);
  assert.equal(admission.harness_sha256, sha(fs.readFileSync(fileURLToPath(import.meta.url))), 'F618_HARNESS_HASH_MISMATCH');
  assert.equal(admission.frozen_inputs_sha256, sha(readBytes(manifestPath)), 'F618_MANIFEST_HASH_MISMATCH');
  assert.equal(authority.authority_main, admission.authority_main);
  assert.equal(authority.own_owner, admission.own_owner);
  assert.equal(authority.root_owner, admission.root_owner);
  assert.equal(authority.own_expires_ts, admission.own_expires_ts);
  assert.equal(authority.root_expires_ts, admission.root_expires_ts);
  assert.equal(authority.all17_FULL, true); assert.equal(authority.all4_equal, true);
  assert.equal(authority.own_exact_bytes_match, true); assert.equal(authority.own_actual_ref_match, true);
  assert.equal(authority.owner_paused, false); assert.equal(authority.fence, false);
  const at = Date.now();
  assert.ok(at < admission.own_expires_ts && at < admission.root_expires_ts && at < admission.expires_ts, 'F618_UNEXPIRED_AUTHORITY_REQUIRED');
  assert.ok(at - authority.checked_ts >= 0 && at - authority.checked_ts <= 90000, 'F618_FRESH_FULL_AUTHORITY_REQUIRED');
  const frozen = read(manifestPath), cache = new Map(), metadataBefore = new Map();
  assert.equal(frozen.status, 'PREPARED_AWAITING_EXACT_ROOT_NODE_ADMISSION');
  for (const f of frozen.files) {
    const b = readBytes(f.path); cache.set(f.path, b);
    assert.equal(b.length, f.bytes, 'F618_FROZEN_LENGTH_MISMATCH');
    assert.equal(sha(b), f.sha256, 'F618_FROZEN_SHA_MISMATCH');
    const st = fs.statSync(path.resolve(repo, f.path)); metadataBefore.set(f.path, {size: st.size, mtimeMs: st.mtimeMs});
  }
  assert.ok(process.execArgv.includes(frozen.network_guard.path), 'F618_NETWORK_GUARD_REQUIRED');
  assert.equal(sha(fs.readFileSync(frozen.network_guard.path)), frozen.network_guard.sha256);
  globalThis.fetch = async () => {throw Error('F618_REAL_HTTP_FORBIDDEN');};
  assert.equal(fs.existsSync(resultPath), false, 'F618_EXISTING_RESULT_NO_RERUN');
  const lock = fs.openSync(lockPath, 'wx', 0o600);
  fs.writeFileSync(lock, 'One admitted F618 Node attempt; failure preserved; no automatic rerun.\n'); fs.closeSync(lock);
  report.admission_sha256 = sha(readBytes(admissionPath));
  report.frozen_inputs_sha256 = admission.frozen_inputs_sha256; save();

  stage = 'FROZEN_INPUTS_AND_IMPORTS';
  const load = p => import(pathToFileURL(path.resolve(repo, p)).href);
  const [{createCatalogSnapshotWriter, CATALOG_SNAPSHOT_KEY}, {readSavedCatalogSnapshot},
    {prepareCatalogSnapshotReview}, {stableCapturedJSON}, base, reactivated, usdkrw] = await Promise.all([
      load(frozen.paths.writer), load(frozen.paths.reader), load(frozen.paths.consumer), load(frozen.paths.canonical),
      ...frozen.negative_parts.map(p => load(p.path))]);
  const selected = JSON.parse(cache.get(frozen.paths.selected_scope).toString('utf8')).proposals;
  const negatives = [...base.NON_TARGET_BUNDLE.decisions, ...reactivated.REACTIVATED_NEGATIVE_BUNDLE.decisions,
    ...usdkrw.USDKRW_NEGATIVE_BUNDLE.decisions];
  assert.equal(selected.length, 550); assert.equal(negatives.length, frozen.complete_negative_records);
  assert.deepEqual(frozen.negative_parts.map(p => p.decisions), [380, 53, 1]);
  assert.equal(sha(stableCapturedJSON(selected)), frozen.selected_scope_canonical_sha256, 'F618_SELECTED_CANONICAL_HASH_MISMATCH');
  assert.equal(sha(stableCapturedJSON(negatives)), frozen.negative_decisions_canonical_sha256, 'F618_NEGATIVE_CANONICAL_HASH_MISMATCH');
  const original = JSON.parse(cache.get(frozen.paths.old_private_capture).toString('utf8')).body.response;
  assert.equal(original.received_ts, frozen.fixture.received_ts);
  assert.equal(original.receipt_id, frozen.fixture.receipt_id);
  assert.equal(original.data.code, 0); assert.equal(original.data.data.length, 1278);
  const originalBodyHash = sha(JSON.stringify(original.data));
  const scopeBefore = sha(stableCapturedJSON(selected)), negativeBefore = sha(stableCapturedJSON(negatives));

  stage = 'ONE_ARTIFICIAL_WRITER_READER_CONSUMER_CHAIN';
  const values = new Map(), calls = [];
  const store = {
    async set(key, value) {calls.push({op: 'SET', key}); values.set(key, clone(value)); return value;},
    async get(key) {calls.push({op: 'GET', key}); return clone(values.get(key) ?? null);}
  };
  const writer = createCatalogSnapshotWriter({store, implementation_sha256: frozen.fixture.implementation_sha256,
    evidence_class: 'ARTIFICIAL', clock: () => frozen.fixture.saved_ts});
  report.writer_calls++;
  const retained = await writer({schema: 'PUMP_CATALOG_INGRESS_V1', provider: 'BINGX', family: 'USDT_M',
    route: '/openApi/swap/v2/quote/contracts', received_ts: original.received_ts, receipt_id: original.receipt_id, body: original.data});
  assert.equal(retained.status, 'RETAINED'); assert.equal(retained.native_store_calls, 2);
  report.reader_calls++;
  const observation = await readSavedCatalogSnapshot({store, implementation_sha256: frozen.fixture.implementation_sha256,
    clock: () => frozen.fixture.observed_ts});
  assert.equal(observation.status, 'BOUND_CATALOG_NON_OBSERVED_NOT_NATIVE');
  assert.equal(observation.snapshot_bytes_clocks_bound, true); assert.equal(observation.implementation_bound, true);
  assert.equal(observation.native_source_response_bound, false);
  const snapshot = observation.private_evidence.snapshot;
  assert.equal(snapshot.evidence_class, 'ARTIFICIAL'); assert.equal(snapshot.source_event_ts, null);
  assert.equal(snapshot.received_ts, original.received_ts); assert.equal(snapshot.receipt_id, original.receipt_id);
  assert.equal(snapshot.body_sha256, originalBodyHash);
  const snapshotHash = sha(JSON.stringify(snapshot));
  const expected = {implementation_sha256: frozen.fixture.implementation_sha256,
    snapshot_json_sha256: snapshotHash, body_sha256: originalBodyHash,
    selected_scope_canonical_sha256: frozen.selected_scope_canonical_sha256,
    negative_decisions_canonical_sha256: frozen.negative_decisions_canonical_sha256,
    received_ts: original.received_ts, receipt_id: original.receipt_id,
    observed_ts: frozen.fixture.observed_ts, as_of_ts: frozen.fixture.as_of_ts};
  report.consumer_calls++;
  const review = prepareCatalogSnapshotReview({observer: {catalog_snapshot: observation}, expected,
    selected_scope: selected, negative_decisions: negatives, sha256: sha, evidence_mode: 'ARTIFICIAL_PREPARATION'});
  assert.equal(review.evidence_class, 'ARTIFICIAL_PREPARATION_ONLY');
  assert.equal(review.raw_catalog_rows, 1278); assert.equal(review.saved_selected_scope_size, 550);
  assert.equal(review.rows.length, 1278);
  assert.equal(Object.values(review.counts).reduce((a, n) => a + n, 0), 1278);
  assert.equal(review.counts.SAVED_SELECTED_SCOPE_EXACT_TUPLE, 550, 'F618_SAVED_SCOPE_MEMBERSHIP_MISMATCH');
  assert.equal(review.current_global_crypto_N, null); assert.equal(review.current_global_N_proven, false);
  assert.equal(review.native_or_IO_admission_created, false); assert.equal(review.new_registry_decisions, 0);
  assert.equal(review.provider_SQL_engine_Telegram_IO, 0); assert.equal(review.prices_volumes_raw_body_exported, false);
  assert.equal(review.producer_received_ts, original.received_ts); assert.equal(review.producer_receipt_id, original.receipt_id);
  const allowedRowKeys = ['row_index', 'native_tuple', 'native_tuple_sha256', 'disposition', 'saved_decision_ref',
    'new_identity_status', 'economic_classification', 'CORE_units_maps_qualified'].sort();
  const proposals = [];
  for (const row of review.rows) {
    assert.deepEqual(Object.keys(row).sort(), allowedRowKeys, 'F618_METADATA_FIELD_ALLOWLIST');
    assert.equal(row.CORE_units_maps_qualified, false);
    assert.equal(row.economic_classification, 'NOT_CHECKED_BY_THIS_CONSUMER');
    if (row.native_tuple) assert.deepEqual(Object.keys(row.native_tuple).sort(), ['native_contract_id', 'symbol', 'asset', 'currency', 'status'].sort());
    if (row.disposition === 'ACTIVE_USDT_IDENTITY_PROPOSAL_NOT_CHECKED') {
      assert.equal(row.new_identity_status, 'PROPOSAL'); proposals.push(row);
    }
  }
  const batches = [];
  for (let i = 0; i < proposals.length; i += 25) batches.push(proposals.slice(i, i + 25));
  assert.ok(batches.every(b => b.length > 0 && b.length <= 25));
  assert.deepEqual(calls, [{op: 'SET', key: CATALOG_SNAPSHOT_KEY}, {op: 'GET', key: CATALOG_SNAPSHOT_KEY}, {op: 'GET', key: CATALOG_SNAPSHOT_KEY}]);
  assert.equal(values.size, 1);
  assert.equal(sha(JSON.stringify(original.data)), originalBodyHash, 'F618_OLD_BODY_MUTATED');
  assert.equal(sha(JSON.stringify(snapshot)), snapshotHash, 'F618_SNAPSHOT_MUTATED');
  assert.equal(sha(stableCapturedJSON(selected)), scopeBefore, 'F618_SCOPE_MUTATED');
  assert.equal(sha(stableCapturedJSON(negatives)), negativeBefore, 'F618_NEGATIVES_MUTATED');

  const nameMatches = [];
  for (const row of review.rows) for (const literal of ['Q', 'AIN', 'QAIN']) {
    const t = row.native_tuple; if (!t) continue;
    if (t.asset === literal || t.symbol === literal + '-USDT') nameMatches.push({label: 'HISTORICAL_NAME_MATCH',
      requested_literal: literal, native_contract_id: t.native_contract_id, native_symbol: t.symbol,
      native_asset: t.asset, currency: t.currency, status: t.status, classification: 'NOT_CHECKED_NO_NEW_DECISION'});
  }
  assert.equal(sha(stableCapturedJSON(nameMatches)), frozen.historical_name_matches_canonical_sha256, 'F618_EXACT_NAME_METADATA_MISMATCH');
  for (const f of frozen.files) {
    const st = fs.statSync(path.resolve(repo, f.path)), before = metadataBefore.get(f.path);
    assert.equal(st.size, before.size); assert.equal(st.mtimeMs, before.mtimeMs, 'F618_FROZEN_FILE_METADATA_CHANGED');
    if (f.path !== frozen.paths.old_private_capture) assert.equal(sha(readBytes(f.path)), f.sha256, 'F618_POSTRUN_FROZEN_SHA_MISMATCH');
  }
  report.status = 'PASS_ONE_CONNECTED_ARTIFICIAL_CONSUMER_OLD1278';
  Object.assign(report, {consumer_sha256: frozen.consumer_sha256, old_private_file_sha256: frozen.old_private_file_sha256,
    body_sha256: originalBodyHash, snapshot_json_sha256: snapshotHash, consumer_output_canonical_sha256: sha(stableCapturedJSON(review)),
    preserved_producer_received_ts: original.received_ts, preserved_producer_receipt_id: original.receipt_id,
    complete_saved_negative_records: negatives.length, saved_selected_scope_records: selected.length,
    historical_metadata_counts: review.counts, historical_name_matches: nameMatches, historical_UNKNOWN_proposal_batches: batches,
    MemoryStore_SET: 1, MemoryStore_GET: 2, native_D1_calls: 0, raw_body_exports: 0,
    current_CORE_10_of550_unchanged: true, semantic541_not_currentCORE_proof: true, units_UNKNOWN9_unchanged: true,
    qualified_maps0_unchanged: true, completed_utc: new Date().toISOString(),
    limitation: 'One connected positive original-fixture path only; not the full seven-case consumer boundary matrix, current snapshot, currentN or native billing proof.'});
  save();
  process.stdout.write(JSON.stringify({status: report.status, Node_invocations: 1, logical_cases: 1,
    writer: 1, reader: 1, consumer: 1, HTTP: 0, native_SQL: 0, engine: 0, Telegram: 0}) + '\n');
} catch (error) {
  report.status = 'FAIL_PRESERVED_NO_AUTOMATIC_RERUN'; report.failure_stage = stage;
  report.failure_reason = safeReason(error); report.completed_utc = new Date().toISOString();
  try {save();} catch {}
  process.stderr.write(JSON.stringify({status: report.status, stage, reason: report.failure_reason, Node_invocations: 1}) + '\n');
  process.exitCode = 1;
}
